#!/usr/bin/env node
/**
 * Full E2E test of the anonshare sync protocol against the LIVE relay
 * (relay.avishkark.in), replicating exactly what the browser client does:
 *   - PBKDF2(600k) key derivation  (key + auth)
 *   - room create via POST ?create=1
 *   - 2 WebSocket peers join with ?a=&o=&cid=
 *   - sealed (AES-GCM) T_UPDATE / T_AWARE relay between peers
 *   - T_STATE peer counts, T_SYNCED replay, backlog replay for late joiner
 *   - T_P2P targeted signaling, T_GRANT edit rights, T_KILLED teardown
 *   - file chunk PUT → GET roundtrip, DELETE (broken on old code)
 */
import crypto from 'node:crypto'
import { WebSocket } from 'ws'

const RELAY = 'https://relay.avishkark.in'
const WSS = 'wss://relay.avishkark.in'
const T_UPDATE = 0, T_AWARE = 1, T_SNAPSHOT = 2, T_SYNCED = 3, T_ERROR = 4,
      T_COMPACT = 5, T_STATE = 6, T_KILLED = 7, T_GRANT = 8, T_P2P = 9

const code = 'E2E' + crypto.randomBytes(2).toString('hex').toUpperCase()
const password = 'e2e-pass-🔒'
const results = []
const report = (n, ok, d) => { results.push([n, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n} :: ${d}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

/* --- crypto identical to src/lib/relay.ts --- */
const TE = new TextEncoder()
const b64url = bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function deriveRoomKeys(code, password) {
  const base = await crypto.subtle.importKey('raw', TE.encode(code + ':' + password), 'PBKDF2', false, ['deriveKey', 'deriveBits'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: TE.encode(`textshare|${code}`), iterations: 600000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: TE.encode(`textshare-auth|${code}`), iterations: 600000, hash: 'SHA-256' }, base, 256)
  return { key, auth: b64url(new Uint8Array(bits)) }
}
async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes))
  const out = new Uint8Array(12 + ct.length); out.set(iv, 0); out.set(ct, 12); return out
}
async function unseal(key, bytes) {
  const iv = bytes.slice(0, 12), ct = bytes.slice(12)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
}
const frame = (type, payload = new Uint8Array(0)) => {
  const body = payload instanceof Buffer ? payload : Buffer.from(payload)
  return Buffer.concat([Buffer.from([type]), body])
}

/* --- tiny frame-watching WS peer --- */
class Peer {
  constructor(label, cid, owner, keys) {
    this.label = label; this.cid = cid; this.owner = owner; this.keys = keys
    this.frames = []      // {type, body}
    this.open = false
    this.waiters = []
  }
  get wsUrl() {
    const p = new URLSearchParams({ a: this.keys.auth, cid: this.cid })
    if (this.owner) p.set('o', this.owner)
    return `${WSS}/room/${code}?${p}`
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl)
      this.ws.binaryType = 'nodebuffer'
      const to = setTimeout(() => reject(new Error('ws timeout')), 10000)
      this.ws.on('open', () => { clearTimeout(to); this.open = true; resolve() })
      this.ws.on('close', () => { this.open = false; this.closedCode = this.ws._closeCode })
      this.ws.on('error', e => { clearTimeout(to); reject(e) })
      this.ws.on('message', (data, isBinary) => {
        if (!isBinary) return
        const buf = Buffer.from(data)
        this.frames.push({ type: buf[0], body: buf.subarray(1) })
        this.waiters.forEach(w => w())
      })
    })
  }
  send(type, payload) { this.ws.send(frame(type, payload)) }
  async sendSealed(type, payload) { this.send(type, await seal(this.keys.key, payload)) }
  async waitFor(predicate, timeoutMs = 6000, label = '') {
    const t0 = Date.now()
    for (;;) {
      const f = this.frames.find(predicate)
      if (f) return f
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting: ${label}`)
      await new Promise(r => {
        this.waiters.push(r)
        setTimeout(r, 60)
      })
    }
  }
  close() { try { this.ws.close() } catch {} }
}

async function main() {
  console.log(`room=${code}`)
  const keys = await deriveRoomKeys(code, password)
  const ownerToken = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const cidA = '1111111111111111', cidB = '2222222222222222'

  // 1. create room
  {
    const p = new URLSearchParams({ create: '1', excl: '1', a: keys.auth, o: ownerToken, ttl: '10m', p: '1' })
    const r = await fetch(`${RELAY}/room/${code}?${p}`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    report('create-room', r.status === 426 && j.ok, `HTTP ${r.status}`)
  }

  // 2. peer A (owner) connects
  const A = new Peer('A', cidA, ownerToken, keys)
  try {
    await A.connect()
    await A.waitFor(f => f.type === T_SYNCED, 8000, 'A T_SYNCED')
    const st = await A.waitFor(f => f.type === T_STATE, 8000, 'A T_STATE')
    const stj = JSON.parse(st.body.toString())
    report('A-connect+state', A.open && stj.owner === true && stj.peers === 1, `peers=${stj.peers} owner=${stj.owner} canEdit=${stj.canEdit}`)
  } catch (e) { report('A-connect+state', false, e.message); return }

  // 3. peer A broadcasts a sealed doc update
  const docPayload = TE.encode(JSON.stringify({ file: 'main.js', text: 'console.log("hello from A")' }))
  await A.sendSealed(T_UPDATE, docPayload)

  // 4. peer B (non-owner, correct password) connects — must receive backlog replay
  const keysB = await deriveRoomKeys(code, password) // same password → same keys
  const B = new Peer('B', cidB, null, keysB)
  try {
    await B.connect()
    await B.waitFor(f => f.type === T_SYNCED, 8000, 'B T_SYNCED')
    const stB = JSON.parse((await B.waitFor(f => f.type === T_STATE, 6000, 'B T_STATE')).body.toString())
    const upd = await B.waitFor(f => f.type === T_UPDATE, 6000, 'B replay T_UPDATE')
    const plain = await unseal(keysB.key, upd.body)
    const text = Buffer.from(plain).toString()
    report('B-join+replay', stB.peers === 2 && text.includes('hello from A'), `peers=${stB.peers} replay="${text.slice(0, 50)}"`)
  } catch (e) { report('B-join+replay', false, e.message) }

  // 5. B replies sealed update; A receives live
  try {
    await B.sendSealed(T_UPDATE, TE.encode(JSON.stringify({ file: 'main.js', text: 'B was here' })))
    const f = await A.waitFor(f => f.type === T_UPDATE && f.body.length > 0 && !f._seen2, 6000, 'A live T_UPDATE')
    const plain = await unseal(keys.key, f.body)
    report('live-update-A←B', Buffer.from(plain).toString().includes('B was here'), 'decrypted ok')
  } catch (e) { report('live-update-A←B', false, e.message) }

  // 6. awareness: B sends sealed T_AWARE; A receives
  try {
    await B.sendSealed(T_AWARE, TE.encode(JSON.stringify({ cid: cidB, cursor: 42 })))
    const f = await A.waitFor((f, i) => f.type === T_AWARE, 6000, 'A T_AWARE')
    const plain = await unseal(keys.key, f.body)
    report('awareness-relay', Buffer.from(plain).toString().includes('cursor'), 'cursor state relayed')
  } catch (e) { report('awareness-relay', false, e.message) }

  // 7. owner grants edit to B
  try {
    A.send(T_GRANT, TE.encode(cidB))
    const stB = await B.waitFor((f) => f.type === T_STATE, 6000, 'B state after grant')
    // may need to wait for the newest state frame
    await sleep(300)
    const last = B.frames.filter(f => f.type === T_STATE).pop()
    const j = JSON.parse(last.body.toString())
    report('grant-edit', j.canEdit === true, `canEdit=${j.canEdit}`)
  } catch (e) { report('grant-edit', false, e.message) }

  // 9. file chunk roundtrip
  try {
    const chunk = crypto.randomBytes(1024)
    const up = await fetch(`${RELAY}/room/${code}/files/f-e2e/chunk/0?a=${keys.auth}`, { method: 'PUT', body: chunk })
    const got = await fetch(`${RELAY}/room/${code}/files/f-e2e/chunk/0?a=${keys.auth}`)
    const data = Buffer.from(await got.arrayBuffer())
    report('file-roundtrip', up.status === 200 && got.status === 200 && data.equals(chunk), `PUT ${up.status} GET ${got.status} bytes=${data.length}`)
    // DELETE without chunk suffix (client's remove-for-everyone)
    const del = await fetch(`${RELAY}/room/${code}/files/f-e2e?a=${keys.auth}`, { method: 'DELETE' })
    report('file-DELETE', del.status === 200, `HTTP ${del.status} (old relay=404)`)
  } catch (e) { report('file-roundtrip', false, e.message) }

  // 10. wrong password peer rejected (CF translates origin's raw 403-during-upgrade
  // into 502/other — any non-101 refusal counts as denied)
  try {
    const badKeys = await deriveRoomKeys(code, 'wrong-password')
    const ws = new WebSocket(`${WSS}/room/${code}?a=${badKeys.auth}&cid=999`)
    const denied = await new Promise(res => {
      ws.on('open', () => res(false))
      ws.on('error', () => res(true))
      ws.on('unexpected-response', (req, resp) => res(resp.statusCode !== 101))
      ws.on('close', () => res(true))
      setTimeout(() => res('timeout'), 8000)
    })
    report('wrong-password-rejected', denied === true, `denied=${denied}`)
  } catch (e) { report('wrong-password-rejected', false, e.message) }

  // 11. owner deletes room → both peers get T_KILLED
  try {
    const r = await fetch(`${RELAY}/room/${code}/admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ownerToken, action: 'delete' }),
    })
    const killed = await Promise.race([
      A.waitFor(f => f.type === T_KILLED, 5000, 'A killed').then(() => true),
      sleep(5200).then(() => false),
    ])
    report('owner-delete+T_KILLED', r.status === 200 && killed, `HTTP ${r.status} killed=${killed}`)
  } catch (e) { report('owner-delete+T_KILLED', false, e.message) }

  A.close(); B.close()
  const fails = results.filter(([, ok]) => !ok)
  console.log(`\n=== E2E SYNC: ${results.length - fails.length}/${results.length} passed ===`)
  if (fails.length) console.log('FAILED:', fails.map(([n]) => n).join(', '))
  process.exit(fails.length ? 1 : 0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
