#!/usr/bin/env node
/**
 * Relay version discriminator + admin-secret probe.
 * Distinguishes OLD (pre-hardening) vs NEW (55c2efc) relay code on the live VPS.
 * Also tests: leaked password auth, CORS, file DELETE (was broken), /run whitelist.
 */
import crypto from 'node:crypto'

const RELAY = 'https://relay.avishkark.in'
const CODE = 'VRFY' + crypto.randomBytes(2).toString('hex').toUpperCase() // e.g. VRFY3F9A
const AUTH = crypto.randomBytes(16).toString('hex')
const OWNER = crypto.randomBytes(16).toString('hex')
const LEAKED = 'Avishkar@44332297768'

const results = []
function report(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} :: ${detail}`)
}

async function main() {
  // ---- 0. Health ----
  try {
    const r = await fetch(`${RELAY}/health`)
    const j = await r.json()
    report('health', r.status === 200 && j.ok, JSON.stringify(j))
  } catch (e) { report('health', false, e.message) }

  // ---- 1. Create room (owner + auth) ----
  {
    const r = await fetch(`${RELAY}/room/${CODE}?create=1&a=${AUTH}&o=${OWNER}&ttl=10m&p=0`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    report('room-create', r.status === 200 || (r.status === 426 && j.ok), `HTTP ${r.status} ${JSON.stringify(j)}`)
  }

  // ---- 2. exists ----
  {
    const r = await fetch(`${RELAY}/room/${CODE}/exists`)
    const j = await r.json()
    report('room-exists', j.exists === true, JSON.stringify(j))
  }

  // ---- 3. Leaked password vs room-admin (room EXISTS now) ----
  {
    const r = await fetch(`${RELAY}/room/${CODE}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterKey: LEAKED, action: 'suspend', value: true }),
    })
    const j = await r.json().catch(() => ({}))
    // OLD code + old password => 200 (authenticated). Rotated password OR new code => 403 not_owner / 429.
    const leakedWorks = r.status === 200
    report('leaked-password-DEAD', !leakedWorks, `HTTP ${r.status} ${JSON.stringify(j)}`)
  }

  // ---- 4. CORS: evil origin must NOT be granted ----
  {
    const r = await fetch(`${RELAY}/health`, { headers: { Origin: 'https://evil.example.com' } })
    const acao = r.headers.get('access-control-allow-origin')
    const newCode = acao === null || acao === ''
    report('cors-locked(evil)', newCode, `acao="${acao}" ${newCode ? '(NEW code)' : '(OLD code or ALLOWED_ORIGINS=*)'}`)
  }

  // ---- 5. CORS: legit origin granted ----
  {
    const r = await fetch(`${RELAY}/health`, { headers: { Origin: 'https://code.avishkark.in' } })
    const acao = r.headers.get('access-control-allow-origin')
    report('cors-allowed(legit)', acao === 'https://code.avishkark.in', `acao="${acao}"`)
  }

  // ---- 6. allow-headers signature: old code ends with ",*" ----
  {
    const r = await fetch(`${RELAY}/health`, { headers: { Origin: 'https://code.avishkark.in' } })
    const h = r.headers.get('access-control-allow-headers') || ''
    report('allow-headers-no-wildcard', !h.includes('*'), `"${h}"`)
  }

  // ---- 7. OPTIONS preflight from evil origin: NEW => 403, OLD => 204 with * ----
  {
    const r = await fetch(`${RELAY}/room/${CODE}/exists`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'GET' } })
    report('preflight-evil-403', r.status === 403, `HTTP ${r.status} (new=403, old=204)`)
  }

  // ---- 8. File DELETE without /chunk suffix (broken on old: 404) ----
  {
    // upload a chunk first
    const up = await fetch(`${RELAY}/room/${CODE}/files/file1/chunk/0?a=${AUTH}`, {
      method: 'PUT', body: Buffer.from('test-chunk-data'),
    })
    const upj = await up.json().catch(() => ({}))
    const del = await fetch(`${RELAY}/room/${CODE}/files/file1?a=${AUTH}`, { method: 'DELETE' })
    const delj = await del.json().catch(() => ({}))
    report('file-upload', up.status === 200, `HTTP ${up.status} ${JSON.stringify(upj)}`)
    report('file-DELETE-fixed', del.status === 200, `HTTP ${del.status} ${JSON.stringify(delj)} (old code=404)`)
  }

  // ---- 9. /run language whitelist: unsupported lang => 400 language_not_supported ----
  {
    const r = await fetch(`${RELAY}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'cobol', code: 'DISPLAY "X"' }),
    })
    const j = await r.json().catch(() => ({}))
    report('run-whitelist-400', r.status === 400 && j.error === 'language_not_supported', `HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`)
  }

  // ---- 10. /run real execution: python ----
  {
    const r = await fetch(`${RELAY}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', code: 'print("relay-ok")' }),
    })
    const j = await r.json().catch(() => ({}))
    report('run-python', r.status === 200 && (j.stdout || '').includes('relay-ok'), `HTTP ${r.status} stdout="${(j.stdout || j.stderr || '').trim().slice(0, 80)}"`)
  }

  // ---- 11. /run real execution: javascript (was OOM-broken) ----
  {
    const r = await fetch(`${RELAY}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'javascript', code: 'console.log("js-ok")' }),
    })
    const j = await r.json().catch(() => ({}))
    report('run-javascript', r.status === 200 && (j.stdout || '').includes('js-ok'), `HTTP ${r.status} stdout="${(j.stdout || j.stderr || '').trim().slice(0, 120)}"`)
  }

  // ---- 12. /run bash ----
  {
    const r = await fetch(`${RELAY}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'bash', code: 'echo bash-ok' }),
    })
    const j = await r.json().catch(() => ({}))
    report('run-bash', r.status === 200 && (j.stdout || '').includes('bash-ok'), `HTTP ${r.status} stdout="${(j.stdout || j.stderr || '').trim().slice(0, 80)}"`)
  }

  // ---- 13. Security headers on JSON responses ----
  {
    const r = await fetch(`${RELAY}/health`)
    const x = r.headers.get('x-content-type-options')
    const xf = r.headers.get('x-frame-options')
    report('security-headers', x === 'nosniff' && xf === 'DENY', `nosniff=${x} xfo=${xf}`)
  }

  // ---- 14. Room cleanup: delete via owner token ----
  {
    const r = await fetch(`${RELAY}/room/${CODE}/admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: OWNER, action: 'delete' }),
    })
    const j = await r.json().catch(() => ({}))
    report('owner-delete-room', r.status === 200 && j.deleted, `HTTP ${r.status} ${JSON.stringify(j)}`)
  }

  const fails = results.filter(x => !x.pass)
  console.log(`\n=== ${results.length - fails.length}/${results.length} passed ===`)
  if (fails.length) console.log('FAILED:', fails.map(f => f.name).join(', '))
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
