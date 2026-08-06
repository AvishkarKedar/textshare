import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

// Rooms with no activity for this long are deleted.
const TTL_MS = 1000 * 60 * 60 * 24 * 7

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json', ...CORS },
  })
}

export class Room {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = new Set()
    this.controlled = new Map()
    this.saveTimer = null

    this.doc = new Y.Doc()
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)

    this.ready = state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get('doc')
      if (stored) Y.applyUpdate(this.doc, new Uint8Array(stored), 'storage')
    })

    this.doc.on('update', (update, origin) => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc), origin)
      this.schedulePersist()
    })

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed)
      if (origin && this.controlled.has(origin)) {
        const ids = this.controlled.get(origin)
        added.forEach((id) => ids.add(id))
        removed.forEach((id) => ids.delete(id))
      }
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      )
      this.broadcast(encoding.toUint8Array(enc), null)
    })
  }

  broadcast(payload, exclude) {
    for (const ws of this.sessions) {
      if (ws === exclude) continue
      try {
        ws.send(payload)
      } catch (err) {
        this.sessions.delete(ws)
        this.controlled.delete(ws)
      }
    }
  }

  schedulePersist() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persist()
    }, 2000)
  }

  async persist() {
    try {
      await this.state.storage.put('doc', Y.encodeStateAsUpdate(this.doc))
      await this.state.storage.put('updated', Date.now())
      await this.state.storage.setAlarm(Date.now() + TTL_MS)
    } catch (err) {
      // storage is best effort; live peers keep working regardless
    }
  }

  async alarm() {
    const updated = (await this.state.storage.get('updated')) || 0
    if (this.sessions.size === 0 && Date.now() - updated >= TTL_MS) {
      await this.state.storage.deleteAll()
    } else {
      await this.state.storage.setAlarm(Date.now() + TTL_MS)
    }
  }

  async fetch(request) {
    await this.ready
    const url = new URL(request.url)
    const wantsInfo = url.pathname.endsWith('/exists')
    const wantsCreate = !wantsInfo && url.searchParams.get('create') === '1'
    let created = await this.state.storage.get('created')

    if (wantsCreate && !created) {
      created = Date.now()
      await this.state.storage.put('created', created)
      await this.state.storage.put('updated', created)
      await this.state.storage.setAlarm(Date.now() + TTL_MS)
    }

    if (wantsInfo) {
      return json({ exists: !!created, peers: this.sessions.size, created: created || null })
    }

    if (!created) {
      return json({ error: 'no_room' }, 404)
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'expected_websocket' }, 426)
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()
    this.sessions.add(server)
    this.controlled.set(server, new Set())

    // Step 1: ask the newcomer what it already has.
    const sync = encoding.createEncoder()
    encoding.writeVarUint(sync, MSG_SYNC)
    syncProtocol.writeSyncStep1(sync, this.doc)
    server.send(encoding.toUint8Array(sync))

    // Step 2: hand it everyone who is currently present.
    const states = this.awareness.getStates()
    if (states.size > 0) {
      const aw = encoding.createEncoder()
      encoding.writeVarUint(aw, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        aw,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys()))
      )
      server.send(encoding.toUint8Array(aw))
    }

    server.addEventListener('message', (event) => {
      let data
      if (typeof event.data === 'string') return
      data = new Uint8Array(event.data)
      try {
        const decoder = decoding.createDecoder(data)
        const enc = encoding.createEncoder()
        const type = decoding.readVarUint(decoder)
        if (type === MSG_SYNC) {
          encoding.writeVarUint(enc, MSG_SYNC)
          syncProtocol.readSyncMessage(decoder, enc, this.doc, server)
          if (encoding.length(enc) > 1) server.send(encoding.toUint8Array(enc))
        } else if (type === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            server
          )
        }
      } catch (err) {
        // ignore malformed frames rather than dropping the whole room
      }
    })

    const close = () => {
      this.sessions.delete(server)
      const ids = this.controlled.get(server)
      this.controlled.delete(server)
      if (ids && ids.size) {
        awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(ids), null)
      }
      this.persist()
    }
    server.addEventListener('close', close)
    server.addEventListener('error', close)

    return new Response(null, { status: 101, webSocket: client })
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'textshare-sync' })
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})(?:\/exists)?$/)
    if (!match) return json({ error: 'not_found' }, 404)

    const code = match[1].toUpperCase()
    const id = env.ROOM.idFromName(code)
    return env.ROOM.get(id).fetch(request)
  },
}
