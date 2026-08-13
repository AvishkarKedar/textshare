/**
 * anonshare sync relay, v4.
 *
 * Threat model, stated plainly:
 *
 *   The relay is blind. Every byte of document content, presence and chat it
 *   handles is AES-GCM ciphertext produced in the browser under a key derived
 *   from the room code plus the password. This Worker never receives the
 *   password, the key, or any plaintext, and there is no code path here that
 *   could decrypt one. Compromising this Worker yields opaque blobs.
 *
 *   What the relay *does* learn: that a room code exists, roughly how many
 *   sockets are attached, message sizes, and timing. That is unavoidable for
 *   a relay and is documented for the user on the security page.
 *
 * Access control without knowledge of the password:
 *
 *   The client derives two independent values from the same PBKDF2 material -
 *   an encryption key (never transmitted) and an auth token (transmitted).
 *   Different salts, so possession of the auth token does not help anyone
 *   derive the encryption key. The client sends the raw token; we store only
 *   SHA-256 of it, and compare hashes on every subsequent connect. Wrong
 *   password therefore means "connection refused", not merely "you see
 *   gibberish" - which is what v2 did, and which let an unauthorised peer sit
 *   in a locked room and corrupt its log.
 *
 *   Hashing happens here, never on the client. v3 accepted a pre-hashed value
 *   at create time and then hashed it a second time when authenticating the
 *   same request, so no room could ever be created. Doing it in one place
 *   makes that class of mistake impossible.
 *
 *   A wrong password/owner-token guess is additionally throttled far harder
 *   than ordinary traffic (see the Limiter's 'auth' scope below), so a
 *   locked room cannot be brute-forced online at anywhere near the rate an
 *   offline attack against a stolen ciphertext would require.
 *
 * Ownership:
 *
 *   Whoever creates a room mints a 32-byte owner token in their browser and
 *   we register only its hash. That token is the sole proof of ownership, so
 *   it can suspend, lock, re-key the lifetime of, or destroy the room. We
 *   cannot recover it for them, by design.
 *
 * Scaling under concurrent load:
 *
 *   Each room is its own Durable Object, so hundreds of separate rooms
 *   already run fully in parallel with no shared bottleneck between them -
 *   that isolation is the whole point of using one DO per room. The only
 *   caps below are deliberate abuse guards, not capacity limits: MAX_CONNS
 *   bounds one single room's peer count, and the per-IP Limiter throttles a
 *   single address hammering the API (e.g. scanning for live room codes).
 *   Both are set generously so ordinary bursts of traffic - many people
 *   joining rooms at once, or a shared office/campus network - are never
 *   mistaken for abuse. Room *creation* gets its own, stricter per-IP cap
 *   (CREATE_PER_MIN) below the general one, since each create spins up a
 *   brand-new Durable Object - cheap individually, but worth capping harder
 *   than ordinary connects/joins to stop one address from mass-provisioning
 *   empty rooms.
 */

/* ------------------------------------------------------------ protocol */

const T_UPDATE = 0    // document delta, persisted and rebroadcast
const T_AWARE = 1     // presence, rebroadcast only, never stored
const T_SNAPSHOT = 2  // compacted state, replaces the log (invited only)
const T_SYNCED = 3    // backlog replay finished
const T_ERROR = 4     // + reason string
const T_COMPACT = 5   // please send me a snapshot
const T_STATE = 6     // + JSON room state (suspended, locked, your rights)
const T_KILLED = 7    // + reason string, then the socket closes for good
const T_GRANT = 8     // owner -> relay -> peer, edit rights in a locked room

/* -------------------------------------------------------------- limits */

const TTLS = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}
const DEFAULT_TTL = TTLS['10m']
const MAX_FRAME = 256 * 1024
const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_CONNS = 60
const RATE_PER_SEC = 120
const COMPACT_EVERY = 150
const SNAPSHOT_WINDOW = 45000   // how long a compaction invitation stays valid
const DEL_CHUNK = 100           // storage.delete() caps out at 128 keys
const IP_PER_MIN = 300
const CREATE_PER_MIN = 20       // stricter: each create provisions a new Durable Object
const AUTH_PER_MIN = 8          // stricter still: guards a locked room against password guessing
const CODE_RE = /^[A-Z0-9]{4,12}$/

/* -------------------------------------------------------------- helpers */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(), camera=(), microphone=()',
    ...CORS,
  },
})

function b64url(buf) {
  const u8 = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(text) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text))))
}

function constEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function frame(type, payload) {
  const body = payload ? new Uint8Array(payload) : null
  const out = new Uint8Array(1 + (body ? body.byteLength : 0))
  out[0] = type
  if (body) out.set(body, 1)
  return out.buffer
}

const textFrame = (type, s) => frame(type, new TextEncoder().encode(s).buffer)
const errorFrame = reason => textFrame(T_ERROR, reason)

/* ================================================================= room */

export class Room {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.rate = new Map()
    this.invite = null
  }

  sockets() {
    try { return this.state.getWebSockets() } catch (e) { return [] }
  }

  att(ws) {
    try { return ws.deserializeAttachment() || {} } catch (e) { return {} }
  }

  broadcast(buf, except) {
    for (const ws of this.sockets()) {
      if (ws === except) continue
      try { ws.send(buf) } catch (e) { try { ws.close(1011, 'send failed') } catch (x) {} }
    }
  }

  async touch() {
    await this.state.storage.put('active', Date.now())
  }

  async ttl() {
    const meta = await this.state.storage.get('meta')
    return (meta && meta.ttl) || DEFAULT_TTL
  }

  stateFrame(meta, a) {
    return textFrame(T_STATE, JSON.stringify({
      suspended: !!(meta && meta.s),
      locked: !!(meta && meta.r),
      owner: !!a.own,
      canEdit: !!a.edit,
      peers: this.sockets().length,
      ttl: (meta && meta.ttl) || DEFAULT_TTL,
    }))
  }

  async announceState() {
    const meta = await this.state.storage.get('meta')
    for (const ws of this.sockets()) {
      try { ws.send(this.stateFrame(meta, this.att(ws))) } catch (e) {}
    }
  }

  /* ------------------------------------------------------------- log */

  async clearLog() {
    const st = this.state.storage
    const keys = [...(await st.list({ prefix: 'l:', limit: 10000 })).keys()]
    for (let i = 0; i < keys.length; i += DEL_CHUNK) {
      await st.delete(keys.slice(i, i + DEL_CHUNK))
    }
    await st.put('seq', 0)
    await st.put('bytes', 0)
  }

  async append(payload, replaceEverything) {
    const st = this.state.storage
    if (replaceEverything) await this.clearLog()

    let seq = (await st.get('seq')) || 0
    let bytes = (await st.get('bytes')) || 0
    if (bytes + payload.byteLength > MAX_LOG_BYTES) return false

    seq++
    bytes += payload.byteLength
    await st.put('l:' + String(seq).padStart(12, '0'), payload.buffer)
    await st.put('seq', seq)
    await st.put('bytes', bytes)

    if (!replaceEverything && seq % COMPACT_EVERY === 0) this.requestCompaction()
    return true
  }

  requestCompaction() {
    let best = null, bestSeen = -1
    for (const ws of this.sockets()) {
      const a = this.att(ws)
      if (!a.edit) continue
      const seen = this.rate.get(ws) ? this.rate.get(ws).seen : 0
      if (seen > bestSeen) { bestSeen = seen; best = ws }
    }
    if (!best) return
    this.invite = { cid: this.att(best).cid, at: Date.now() }
    try { best.send(frame(T_COMPACT)) } catch (e) { this.invite = null }
  }

  /* ------------------------------------------------------------ http */

  async fetch(request) {
    const url = new URL(request.url)
    const st = this.state.storage
    const q = url.searchParams
    let meta = await st.get('meta')

    if (url.pathname.endsWith('/exists')) {
      return json({
        exists: !!meta,
        peers: this.sockets().length,
        hasPassword: meta ? !!meta.p : false,
        auth: meta ? !!meta.a : false,
        suspended: meta ? !!meta.s : false,
        locked: meta ? !!meta.r : false,
      })
    }

    if (url.pathname.endsWith('/admin')) {
      if (request.method !== 'POST') return json({ error: 'method' }, 405)
      if (!meta) return json({ error: 'no_room' }, 404)

      let body
      try { body = await request.json() } catch (e) { return json({ error: 'bad_body' }, 400) }

      if (!meta.o) return json({ error: 'no_owner' }, 409)
      if (!constEq(await sha256(body.token || ''), meta.o)) {
        return json({ error: 'not_owner' }, 403)
      }

      if (body.action === 'delete') {
        for (const ws of this.sockets()) {
          try { ws.send(textFrame(T_KILLED, 'deleted')) } catch (e) {}
          try { ws.close(4001, 'deleted') } catch (e) {}
        }
        await st.deleteAll()
        return json({ ok: true, deleted: true })
      }

      if (body.action === 'suspend') meta.s = !!body.value
      else if (body.action === 'lock') meta.r = !!body.value
      else if (body.action === 'ttl') meta.ttl = TTLS[body.value] || DEFAULT_TTL
      else return json({ error: 'bad_action' }, 400)

      await st.put('meta', meta)

      if (meta.s) {
        for (const ws of this.sockets()) {
          const a = this.att(ws)
          if (a.own) continue
          try { ws.send(textFrame(T_KILLED, 'suspended')) } catch (e) {}
          try { ws.close(4002, 'suspended') } catch (e) {}
        }
      } else if (body.action === 'lock') {
        for (const ws of this.sockets()) {
          const a = this.att(ws)
          a.edit = !!a.own || !meta.r
          try { ws.serializeAttachment(a) } catch (e) {}
        }
      }

      await this.announceState()
      return json({ ok: true, suspended: !!meta.s, locked: !!meta.r, ttl: meta.ttl || DEFAULT_TTL })
    }

    if (q.get('create') === '1') {
      if (meta && q.get('excl') === '1') return json({ error: 'taken' }, 409)
      if (!meta) {
        const rawAuth = q.get('a')
        const rawOwner = q.get('o')
        meta = {
          c: Date.now(),
          p: q.get('p') === '1',
          a: rawAuth ? await sha256(rawAuth) : null,
          o: rawOwner ? await sha256(rawOwner) : null,
          s: false,
          r: false,
          ttl: TTLS[q.get('ttl')] || DEFAULT_TTL,
        }
        await st.put('meta', meta)
        await this.touch()
        await st.setAlarm(Date.now() + meta.ttl)
      }
    }

    if (!meta) return json({ error: 'no_room' }, 404)

    /* -- authentication ------------------------------------------------ */
    const owner = !!meta.o && constEq(await sha256(q.get('o') || ''), meta.o)

    if (meta.a && !owner) {
      const token = q.get('a')
      const ok = !!token && constEq(await sha256(token), meta.a)
      if (!ok) {
        // A wrong guess here is exactly what an offline password-guessing
        // tool looks like online: same room, new token, over and over.
        // Throttle this specific pattern much harder than ordinary traffic -
        // on top of, not instead of, the generic per-IP limit already
        // enforced before this request ever reached a Room object.
        try {
          const ip = request.headers.get('CF-Connecting-IP') || 'anon'
          const lim = this.env.LIMIT.get(this.env.LIMIT.idFromName(ip))
          const verdict = await lim.fetch('https://limiter/check?scope=auth')
          const body = await verdict.json()
          if (!body.ok) return json({ error: 'rate_limited', retryAfter: 60 }, 429)
        } catch (e) {}
        return json({ error: 'bad_auth' }, 403)
      }
    }

    if (meta.s && !owner) return json({ error: 'suspended' }, 423)
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426)
    if (this.sockets().length >= MAX_CONNS) return json({ error: 'room_full' }, 429)

    const pair = new WebSocketPair()
    const client = pair[0], server = pair[1]

    this.state.acceptWebSocket(server)
    server.serializeAttachment({
      own: owner,
      edit: owner || !meta.r,
      cid: (q.get('cid') || '').slice(0, 24),
      at: Date.now(),
    })

    await this.touch()

    try {
      const log = await st.list({ prefix: 'l:', limit: 10000 })
      for (const [, blob] of log) server.send(frame(T_UPDATE, blob))
      server.send(this.stateFrame(meta, this.att(server)))
      server.send(frame(T_SYNCED))
    } catch (e) {
      try { server.send(errorFrame('replay_failed')) } catch (x) {}
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  /* ---------------------------------------------------- socket events */

  async webSocketMessage(ws, data) {
    try {
      if (typeof data === 'string') return
      const buf = new Uint8Array(data)
      if (buf.byteLength === 0) return
      if (buf.byteLength > MAX_FRAME) return ws.send(errorFrame('frame_too_large'))

      const now = Date.now()
      let r = this.rate.get(ws)
      if (!r || now - r.t > 1000) { r = { t: now, n: 0, seen: now }; this.rate.set(ws, r) }
      r.seen = now
      if (++r.n > RATE_PER_SEC) return ws.send(errorFrame('rate_limited'))

      const type = buf[0]
      const payload = buf.slice(1)
      const a = this.att(ws)

      if (type === T_AWARE) {
        this.broadcast(frame(T_AWARE, payload.buffer), ws)
        return
      }

      if (type === T_GRANT) {
        if (!a.own) return ws.send(errorFrame('not_owner'))
        const target = new TextDecoder().decode(payload)
        for (const peer of this.sockets()) {
          const pa = this.att(peer)
          if (pa.cid !== target) continue
          pa.edit = true
          try { peer.serializeAttachment(pa) } catch (e) {}
          const meta = await this.state.storage.get('meta')
          try { peer.send(this.stateFrame(meta, pa)) } catch (e) {}
        }
        return
      }

      if (type === T_UPDATE || type === T_SNAPSHOT) {
        if (!a.edit) return ws.send(errorFrame('read_only'))

        let replace = false
        if (type === T_SNAPSHOT) {
          const inv = this.invite
          replace = !!inv && inv.cid && inv.cid === a.cid && (Date.now() - inv.at) < SNAPSHOT_WINDOW
          if (replace) this.invite = null
        }

        this.broadcast(frame(T_UPDATE, payload.buffer), ws)
        const ok = await this.append(payload, replace)
        if (!ok) {
          ws.send(errorFrame('room_full_bytes'))
          this.requestCompaction()
        }
        await this.touch()
      }
    } catch (err) {
      // One malformed frame must never take the room down for everyone else.
    }
  }

  async webSocketClose(ws) { await this.onGone(ws) }
  async webSocketError(ws) { await this.onGone(ws) }

  async onGone(ws) {
    this.rate.delete(ws)
    if (this.sockets().filter(s => s !== ws).length === 0) {
      await this.touch()
      try { await this.state.storage.setAlarm(Date.now() + (await this.ttl())) } catch (e) {}
    }
  }

  /* -------------------------------------------------------- expiry */

  async alarm() {
    const st = this.state.storage
    const ttl = await this.ttl()
    if (this.sockets().length > 0) {
      await st.setAlarm(Date.now() + ttl)
      return
    }
    const active = (await st.get('active')) || 0
    if (Date.now() - active >= ttl - 2000) {
      await st.deleteAll()
    } else {
      await st.setAlarm(active + ttl)
    }
  }
}

/* ============================================================== limiter */

/**
 * One object per client IP, holding one-minute token buckets. This exists
 * because /exists on an unknown code is otherwise a free room-code scanner,
 * and because room creation was completely unbounded in v2.
 *
 * Three independent buckets live in the same object: 'default' covers every
 * request from this IP, 'create' additionally, more strictly, covers only
 * room-creation requests, and 'auth' covers only failed password/owner-token
 * attempts against a room - so mass-provisioning empty rooms and guessing a
 * locked room's password are both throttled far harder than ordinary
 * joins/connects, without touching the generous default limit everyone else
 * relies on.
 *
 * Each bucket is a weighted blend of the current and immediately-previous
 * one-minute window, not a hard reset at the minute boundary - a plain reset
 * let an abuser send a full window's worth of requests right before the
 * boundary and another full window's worth right after, doubling the
 * effective rate for a moment every minute.
 *
 * The idle-cleanup alarm is re-armed on every request instead of only when
 * one is missing, so it fires five minutes after this IP's *last* request,
 * not five minutes after its first ever request - otherwise a sustained,
 * still-active abuser got a free counter reset every five minutes.
 */
export class Limiter {
  constructor(state) { this.state = state }

  async fetch(request) {
    const scopeParam = new URL(request.url).searchParams.get('scope')
    const scope = scopeParam === 'create' ? 'create' : scopeParam === 'auth' ? 'auth' : 'default'
    const cap = scope === 'create' ? CREATE_PER_MIN : scope === 'auth' ? AUTH_PER_MIN : IP_PER_MIN
    const key = 'b:' + scope
    const prevKey = 'p:' + scope

    const now = Date.now()
    const st = this.state.storage
    let b = await st.get(key)

    if (!b || now - b.t > 60000) {
      if (b) await st.put(prevKey, b)
      b = { t: now, n: 0 }
    }
    b.n++
    await st.put(key, b)

    const prev = (await st.get(prevKey)) || { t: 0, n: 0 }
    const weight = Math.max(0, 1 - (now - b.t) / 60000)
    const estimate = b.n + prev.n * weight

    await st.setAlarm(now + 300000)

    return json({ n: b.n, ok: estimate <= cap })
  }

  async alarm() { await this.state.storage.deleteAll() }
}

/* ================================================================ entry */

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'anonshare-sync', version: 4 })
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})(?:\/(exists|admin))?$/)
    if (!match) return json({ error: 'not_found' }, 404)

    const code = match[1].toUpperCase()
    if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400)

    const ip = request.headers.get('CF-Connecting-IP') || 'anon'
    const isCreate = url.searchParams.get('create') === '1'
    try {
      const lim = env.LIMIT.get(env.LIMIT.idFromName(ip))
      const verdict = await lim.fetch('https://limiter/check')
      const body = await verdict.json()
      if (!body.ok) {
        return json({ error: 'rate_limited', retryAfter: 60 }, 429)
      }
      if (isCreate) {
        const createVerdict = await lim.fetch('https://limiter/check?scope=create')
        const createBody = await createVerdict.json()
        if (!createBody.ok) {
          return json({ error: 'rate_limited', retryAfter: 60 }, 429)
        }
      }
    } catch (e) {
      // Never let the limiter being unavailable take the service down.
    }

    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request)
  },
}
