/**
 * textshare sync relay.
 *
 * The server is deliberately blind. Every payload it handles is AES-GCM
 * ciphertext produced in the browser from a key derived from the room code
 * plus an optional password. This Worker never sees the key, the plaintext,
 * or the password - it stores an append-only log of opaque blobs and replays
 * them to whoever joins next.
 *
 * Because it cannot decrypt, it cannot merge either. That is fine: Yjs updates
 * are commutative and idempotent, so replaying the log in any order converges
 * to the same document on every client.
 */

const T_UPDATE = 0    // client -> server -> everyone, persisted
const T_AWARE = 1     // presence, broadcast only, never stored
const T_SNAPSHOT = 2  // client -> server, replaces the whole log
const T_SYNCED = 3    // server -> client, backlog replay finished
const T_ERROR = 4     // server -> client, followed by a reason string
const T_COMPACT = 5   // server -> client, please send a snapshot

const IDLE_MS = 10 * 60 * 1000      // purge 10 min after the room empties
const MAX_FRAME = 256 * 1024        // per message
const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_CONNS = 30
const RATE_PER_SEC = 120
const COMPACT_EVERY = 150

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
}

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json', ...CORS },
})

function frame(type, payload) {
  const len = payload ? payload.byteLength : 0
  const out = new Uint8Array(1 + len)
  out[0] = type
  if (len) out.set(new Uint8Array(payload), 1)
  return out.buffer
}

function errorFrame(reason) {
  return frame(T_ERROR, new TextEncoder().encode(reason).buffer)
}

export class Room {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = new Map() // ws -> { n, t }
  }

  broadcast(buf, except) {
    for (const ws of this.sessions.keys()) {
      if (ws === except) continue
      try { ws.send(buf) } catch (e) { this.sessions.delete(ws) }
    }
  }

  async touch() {
    await this.state.storage.put('active', Date.now())
  }

  async append(payload, isSnapshot) {
    const st = this.state.storage
    if (isSnapshot) {
      const old = await st.list({ prefix: 'l:' })
      if (old.size) await st.delete([...old.keys()])
      await st.put('seq', 0)
      await st.put('bytes', 0)
    }
    let seq = (await st.get('seq')) || 0
    let bytes = (await st.get('bytes')) || 0
    if (bytes + payload.byteLength > MAX_LOG_BYTES) return false
    seq++
    bytes += payload.byteLength
    await st.put('l:' + String(seq).padStart(12, '0'), payload.buffer)
    await st.put('seq', seq)
    await st.put('bytes', bytes)

    // Ask somebody to fold the log down so replays stay quick.
    if (!isSnapshot && seq % COMPACT_EVERY === 0) {
      const first = this.sessions.keys().next().value
      if (first) { try { first.send(frame(T_COMPACT)) } catch (e) {} }
    }
    return true
  }

  async fetch(request) {
    const url = new URL(request.url)
    const st = this.state.storage
    let meta = await st.get('meta')

    if (url.pathname.endsWith('/exists')) {
      return json({
        exists: !!meta,
        peers: this.sessions.size,
        hasPassword: meta ? !!meta.p : false,
        verifier: meta ? meta.v : null,
      })
    }

    if (url.searchParams.get('create') === '1' && !meta) {
      meta = {
        c: Date.now(),
        v: url.searchParams.get('v') || null,   // encrypted probe string
        p: url.searchParams.get('p') === '1',   // password required?
      }
      await st.put('meta', meta)
      await this.touch()
      await st.setAlarm(Date.now() + IDLE_MS)
    }

    if (!meta) return json({ error: 'no_room' }, 404)
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426)
    if (this.sessions.size >= MAX_CONNS) return json({ error: 'room_full' }, 429)

    const pair = new WebSocketPair()
    const client = pair[0], server = pair[1]
    server.accept()
    this.sessions.set(server, { n: 0, t: Date.now() })
    await this.touch()

    // Replay the backlog, then tell the client it is caught up.
    try {
      const log = await st.list({ prefix: 'l:' })
      for (const [, blob] of log) server.send(frame(T_UPDATE, blob))
      server.send(frame(T_SYNCED))
    } catch (e) {
      try { server.send(errorFrame('replay_failed')) } catch (x) {}
    }

    server.addEventListener('message', async ev => {
      try {
        if (typeof ev.data === 'string') return
        const buf = new Uint8Array(ev.data)
        if (buf.byteLength === 0) return
        if (buf.byteLength > MAX_FRAME) {
          server.send(errorFrame('frame_too_large'))
          return
        }

        const s = this.sessions.get(server)
        if (!s) return
        const now = Date.now()
        if (now - s.t > 1000) { s.t = now; s.n = 0 }
        if (++s.n > RATE_PER_SEC) {
          server.send(errorFrame('rate_limited'))
          return
        }

        const type = buf[0]
        const payload = buf.slice(1)

        if (type === T_AWARE) {
          this.broadcast(frame(T_AWARE, payload.buffer), server)
          return
        }
        if (type === T_UPDATE || type === T_SNAPSHOT) {
          this.broadcast(frame(T_UPDATE, payload.buffer), server)
          const ok = await this.append(payload, type === T_SNAPSHOT)
          if (!ok) server.send(errorFrame('room_full_bytes'))
          await this.touch()
        }
      } catch (err) {
        // A bad frame from one client must never take down the room.
      }
    })

    const close = async () => {
      this.sessions.delete(server)
      if (this.sessions.size === 0) {
        await this.touch()
        try { await st.setAlarm(Date.now() + IDLE_MS) } catch (e) {}
      }
    }
    server.addEventListener('close', close)
    server.addEventListener('error', close)

    return new Response(null, { status: 101, webSocket: client })
  }

  async alarm() {
    const st = this.state.storage
    if (this.sessions.size > 0) {
      await st.setAlarm(Date.now() + IDLE_MS)
      return
    }
    const active = (await st.get('active')) || 0
    if (Date.now() - active >= IDLE_MS - 2000) {
      // Nobody has been here for ten minutes. Erase everything.
      await st.deleteAll()
    } else {
      await st.setAlarm(active + IDLE_MS)
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'textshare-sync' })
    }
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})(?:\/exists)?$/)
    if (!match) return json({ error: 'not_found' }, 404)
    const id = env.ROOM.idFromName(match[1].toUpperCase())
    return env.ROOM.get(id).fetch(request)
  },
}
