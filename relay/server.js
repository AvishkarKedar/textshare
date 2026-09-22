/**
 * AnonShare High-Performance VPS Sync Relay & Code Runner
 * 
 * Drop-in, wire-compatible replacement for the Cloudflare Worker relay.
 * Preserves 100% zero-knowledge E2EE (AES-GCM ciphertext only).
 * 
 * Features:
 * - Full binary sync protocol (T_UPDATE, T_AWARE, T_SNAPSHOT, T_SYNCED, etc.)
 * - Ephemeral encrypted file chunk storage (up to 25MB–50MB)
 * - Remote compiler execution bridge (/run)
 * - In-memory / SQLite persistence with automatic TTL deletion
 * - IP rate limiting and brute-force throttling
 * - Full /admin/* dashboard moderation API
 */

import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

/* ------------------------------------------------------------ protocol */

const T_UPDATE = 0    // document delta (persisted & rebroadcast)
const T_AWARE = 1     // presence / cursors (rebroadcast only, never stored)
const T_SNAPSHOT = 2  // compacted state (replaces log)
const T_SYNCED = 3    // backlog replay finished
const T_ERROR = 4     // error message
const T_COMPACT = 5   // request compaction
const T_STATE = 6     // room state update
const T_KILLED = 7    // room closed / deleted
const T_GRANT = 8     // owner grant edit rights

/* -------------------------------------------------------------- limits */

const TTLS = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}
const DEFAULT_TTL = TTLS['10m']
const MAX_FRAME = 512 * 1024       // 512 KB per frame
const MAX_LOG_BYTES = 10 * 1024 * 1024 // 10 MB per room on VPS (vs 5MB on CF)
const MAX_CONNS = 120              // 120 peers per room (vs 60 on CF)
const RATE_PER_SEC = 200           // 200 msgs/sec
const COMPACT_EVERY = 150
const SNAPSHOT_WINDOW = 45000
const IP_PER_MIN = 600
const CREATE_PER_MIN = 60
const AUTH_PER_MIN = 8               // 8 failed-auth attempts per IP per minute
const RUN_PER_MIN = 20               // 20 code executions per IP per minute
// Room-code shape (matches the Cloudflare Worker relay): 4-12 upper-case
// alphanumeric characters; the client generates 6.
const CODE_RE = /^[A-Z0-9]{4,12}$/
// Server-side language whitelist for /run — validated BEFORE the request is
// queued or executed, so unsupported languages can never burn a runner slot.
const RUN_LANGS = new Set([
  'python', 'py', 'javascript', 'js', 'node', 'c', 'cpp', 'c++',
  'go', 'golang', 'rust', 'rs', 'bash', 'sh', 'java',
])
// File-chunk upload quotas (mirror the Worker relay + client: 25MB files as
// 64KB chunks, 32 files per room, 50MB total per room). Without these an
// authenticated room member could fill the VPS disk indefinitely.
const MAX_CHUNK_BYTES = 1024 * 1024
const MAX_FILE_CHUNKS = 400
const MAX_FILES_PER_ROOM = 32
const MAX_ROOM_FILE_BYTES = 50 * 1024 * 1024
// Max concurrent WebSocket connections per client IP (a room-hopping client
// otherwise escapes the per-room MAX_CONNS cap by joining many rooms).
const MAX_IP_CONNS = 24
// Admin password MUST be provided via the ADMIN_PASSWORD environment variable.
// There is NO default: if unset, the /admin/* API is fully disabled (503).
// Rotate any previously exposed value immediately — a leaked ADMIN_PASSWORD
// allows room moderation (suspend/delete/lock) and config changes.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const PORT = parseInt(process.env.PORT || '8787', 10)
const HOST = process.env.HOST || '0.0.0.0'

const currentConfig = {
  IP_PER_MIN,
  CREATE_PER_MIN,
  AUTH_PER_MIN,
  MAX_CONNS,
}

/* ------------------------------------------------------------- helpers */

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sha256(str) {
  return b64url(crypto.createHash('sha256').update(String(str)).digest())
}

function constEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function frame(type, payload) {
  const body = payload ? Buffer.from(payload) : Buffer.alloc(0)
  const out = Buffer.alloc(1 + body.length)
  out[0] = type
  if (body.length) body.copy(out, 1)
  return out
}

const textFrame = (type, s) => frame(type, Buffer.from(s, 'utf8'))
const errorFrame = reason => textFrame(T_ERROR, reason)

/* --------------------------------------------------------------- CORS */

// Browser origins allowed to call the HTTP API cross-origin (WebSocket
// connections are not subject to CORS; this governs the JSON routes the
// browser hits directly: room create/join preflight, file chunks, health).
// Configure via the ALLOWED_ORIGINS env var (comma-separated). Supports
// exact origins, "*.suffix" patterns, or an explicit "*" to restore the
// legacy open policy. Default allowlist = production sites + local dev.
// Non-browser clients (curl, server-to-server) are unaffected by CORS.
const DEFAULT_ALLOWED_ORIGINS =
  'https://code.avishkark.in,https://admin.code.avishkark.in,http://localhost:3000,http://127.0.0.1:3000'
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const CORS_OPEN = ALLOWED_ORIGINS.includes('*')

function corsHeaders(req) {
  const base = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-room-auth,Range',
    'Access-Control-Max-Age': '86400',
  }
  if (CORS_OPEN) return { 'Access-Control-Allow-Origin': '*', ...base }
  const origin = req.headers && req.headers.origin
  if (origin) {
    const o = String(origin).toLowerCase()
    const granted = ALLOWED_ORIGINS.includes(o) ||
      ALLOWED_ORIGINS.some(p => p.startsWith('*.') && o.endsWith(p.slice(1)))
    if (granted) return { 'Access-Control-Allow-Origin': String(origin), Vary: 'Origin', ...base }
  }
  // Unknown/absent origin (non-browser or not allowlisted): no CORS grant —
  // the browser blocks reading the response; the request itself still runs.
  return { Vary: 'Origin' }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
}

function sendJson(req, res, data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
  }
  if (status === 429 && data && data.retryAfter) {
    headers['Retry-After'] = String(Math.max(1, Math.round(data.retryAfter)))
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(data))
}

/* ------------------------------------------------- request body reading */

// Reads a request body with a hard byte cap. Resolves null when the cap is
// exceeded (socket destroyed) or the stream errors — callers map that to a
// 413/400. Prevents the unbounded `body += chunk` memory-DoS pattern on
// every JSON route.
function readBody(req, maxBytes) {
  return new Promise(resolve => {
    const chunks = []
    let size = 0
    let settled = false
    const finish = val => { if (!settled) { settled = true; resolve(val) } }
    req.on('data', c => {
      if (settled) return
      size += c.length
      if (size > maxBytes) {
        finish(null)
        try { req.destroy() } catch (e) {}
        return
      }
      chunks.push(c)
    })
    req.on('end', () => finish(Buffer.concat(chunks)))
    req.on('error', () => finish(null))
  })
}

/* ------------------------------------------------------- rate limiter */

const ipBuckets = new Map()

function checkRate(ip, scope = 'default') {
  const now = Date.now()
  let item = ipBuckets.get(ip)
  if (!item || now - item.resetAt > 60000) {
    item = { resetAt: now, default: 0, create: 0, auth: 0, run: 0 }
    ipBuckets.set(ip, item)
  }

  const limit = scope === 'create' ? CREATE_PER_MIN : scope === 'auth' ? AUTH_PER_MIN : scope === 'run' ? RUN_PER_MIN : IP_PER_MIN
  if (++item[scope] > limit) return false
  return true
}

// Clean up stale IP buckets periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, item] of ipBuckets) {
    if (now - item.resetAt > 120000) ipBuckets.delete(ip)
  }
}, 60000)

/* ---------------------------------------------------------- admin auth */

function signToken(exp) {
  const hmac = crypto.createHmac('sha256', ADMIN_PASSWORD)
  hmac.update(String(exp))
  return exp + '.' + b64url(hmac.digest())
}

function verifyToken(token) {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false
  const exp = Number(token.slice(0, dot))
  if (!exp || Date.now() > exp) return false
  return constEq(signToken(exp), token)
}

function getClientIp(req) {
  const peer = parseIp(req.socket.remoteAddress || '')
  if (!peer) return 'unknown'
  const trusted = TRUSTED_PROXY_CIDRS.some(c => ipInCidr(peer, c))
  if (!trusted) {
    // Direct connection (not via our nginx/Caddy): forwarded headers are
    // client-supplied and untrustworthy — rate-limit by the socket address.
    return req.socket.remoteAddress
  }
  // Peer IS our reverse proxy. X-Real-IP is what nginx set from its own TCP
  // peer: a Cloudflare edge IP when CF fronts the domain, else the client.
  const xReal = parseIp(String(req.headers['x-real-ip'] || ''))
  if (xReal) {
    if (CF_CIDRS.some(c => ipInCidr(xReal, c))) {
      // Behind Cloudflare: only CF-Connecting-IP (set by CF, unreachable to
      // the end client) knows the real visitor address.
      const cf = String(req.headers['cf-connecting-ip'] || '').trim()
      if (parseIp(cf)) return cf
    }
    return String(req.headers['x-real-ip']).trim()
  }
  // No X-Real-IP: use the LAST X-Forwarded-For entry — the one appended by
  // our own proxy. The first entry is attacker-controllable in proxy chains.
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length) {
    const last = xff.split(',').pop().trim()
    if (parseIp(last)) return last
  }
  return 'unknown'
}

/* --------------------------------------------------------- IP parsing */

// Minimal IPv4/IPv6 parser + CIDR matcher (BigInt-based). Used so client-IP
// trust decisions and rate-limit buckets can never be poisoned by spoofed
// headers from untrusted peers.
function parseIp(s) {
  if (typeof s !== 'string') return null
  let str = s.trim().toLowerCase()
  const pct = str.indexOf('%')
  if (pct > 0) str = str.slice(0, pct) // strip zone id (fe80::1%eth0)
  const v4m = str.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4m) str = v4m[1]
  if (str.includes('.')) {
    const parts = str.split('.').map(Number)
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null
    const bits = (BigInt(parts[0]) << 24n) | (BigInt(parts[1]) << 16n) | (BigInt(parts[2]) << 8n) | BigInt(parts[3])
    return { bits, fam: 4 }
  }
  if (!str.includes(':')) return null
  const halves = str.split('::')
  if (halves.length > 2) return null
  const groups = str => (str ? str.split(':').filter(Boolean) : [])
  const left = groups(halves[0])
  const right = halves.length === 2 ? groups(halves[1]) : []
  const bad = g => !/^[0-9a-f]{1,4}$/.test(g)
  if (left.some(bad) || right.some(bad)) return null
  const missing = 8 - left.length - right.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const all = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right]
  let bits = 0n
  for (const g of all) bits = (bits << 16n) | BigInt('0x' + g)
  return { bits, fam: 6 }
}

function parseCidr(cidr) {
  const [addr, lenStr] = String(cidr).split('/')
  const ip = parseIp(addr)
  if (!ip) return null
  const maxLen = ip.fam === 4 ? 32 : 128
  const len = lenStr === undefined || lenStr === '' ? maxLen : parseInt(lenStr, 10)
  if (!Number.isInteger(len) || len < 0 || len > maxLen) return null
  const shift = BigInt(maxLen - len)
  return { base: ip.bits >> shift, shift, fam: ip.fam }
}

function ipInCidr(ip, cidr) {
  return !!ip && !!cidr && ip.fam === cidr.fam && (ip.bits >> cidr.shift) === cidr.base
}

// Reverse proxies whose forwarded headers we honor. Default trusts the
// loopback + RFC1918 addresses our own nginx/Caddy proxy lives on (the
// shipped relay/nginx.conf fronts 127.0.0.1:8787) — remote clients can
// never connect from those addresses, so the trust cannot be abused off-host.
// Set TRUSTED_PROXIES=off to ignore forwarded headers entirely.
const TRUSTED_PROXY_CIDRS = process.env.TRUSTED_PROXIES === 'off'
  ? []
  : String(process.env.TRUSTED_PROXIES || '127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7')
      .split(',').map(s => parseCidr(s.trim())).filter(Boolean)

// Cloudflare edge ranges — used only to recognize when our trusted proxy's
// own peer was Cloudflare (in which case CF-Connecting-IP is authoritative).
const CF_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
].map(parseCidr).filter(Boolean)

/* ------------------------------------------------------------- storage */

class RoomState {
  constructor(code, meta) {
    this.code = code
    this.meta = meta
    this.log = [] // array of Buffers
    this.bytes = 0
    this.seq = 0
    this.sockets = new Set()
    this.rate = new Map() // ws -> { t, n, seen }
    this.invite = null    // { cid, at }
    this.lastActive = Date.now()
    this.expiryTimer = null
    this.fileChunks = new Map() // fileId -> Map(chunkIndex, Buffer)
    this.aware = new Map()      // ws -> last sealed T_AWARE payload (ciphertext, replayed to late joiners)
  }

  broadcast(buf, except) {
    for (const ws of this.sockets) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue
      try { ws.send(buf) } catch (e) {}
    }
  }

  stateFrame(att) {
    return textFrame(T_STATE, JSON.stringify({
      suspended: !!this.meta.s,
      suspendedByAdmin: !!(this.meta.s && this.meta.sa),
      locked: !!this.meta.r,
      owner: !!att?.own,
      canEdit: !!att?.edit,
      peers: this.sockets.size,
      ttl: this.meta.ttl || DEFAULT_TTL,
    }))
  }

  announceState() {
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(this.stateFrame(ws._att)) } catch (e) {}
      }
    }
  }

  touch() {
    this.lastActive = Date.now()
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
  }

  scheduleExpiry() {
    if (this.sockets.size > 0) return
    this.touch()
    const ttl = this.meta.ttl || DEFAULT_TTL
    this.expiryTimer = setTimeout(() => {
      rooms.delete(this.code)
    }, ttl)
  }

  clearLog() {
    this.log = []
    this.bytes = 0
    this.seq = 0
  }

  append(payload, replaceEverything) {
    if (replaceEverything) this.clearLog()
    if (this.bytes + payload.length > MAX_LOG_BYTES) return false

    this.seq++
    this.bytes += payload.length
    this.log.push(payload)

    if (!replaceEverything && this.seq % COMPACT_EVERY === 0) {
      this.requestCompaction()
    }
    return true
  }

  requestCompaction() {
    let best = null, bestSeen = -1
    for (const ws of this.sockets) {
      if (!ws._att?.edit) continue
      const seen = this.rate.get(ws)?.seen || 0
      if (seen > bestSeen) { bestSeen = seen; best = ws }
    }
    if (!best || best.readyState !== WebSocket.OPEN) return
    this.invite = { cid: best._att.cid, at: Date.now() }
    try { best.send(frame(T_COMPACT)) } catch (e) { this.invite = null }
  }
}

const rooms = new Map() // code -> RoomState

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/* ------------------------------------------- ephemeral chunk disk persistence */

const CHUNK_STORAGE_DIR = process.env.CHUNK_STORAGE_DIR || path.join(os.tmpdir(), 'anonshare-chunks')
try { fs.mkdirSync(CHUNK_STORAGE_DIR, { recursive: true }) } catch (e) {}

// Total encrypted bytes currently held for a room (bounded by the quotas
// enforced on PUT: 32 files x 25MB max, capped at 50MB per room overall).
function roomFileBytes(room) {
  let total = 0
  for (const map of room.fileChunks.values()) {
    for (const b of map.values()) total += b.length
  }
  return total
}

function getChunkDir(code, fileId) {
  return path.join(CHUNK_STORAGE_DIR, String(code).toUpperCase(), String(fileId))
}

async function saveChunkToDisk(code, fileId, chunkIdx, buffer) {
  try {
    const dir = getChunkDir(code, fileId)
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(path.join(dir, String(chunkIdx)), buffer)
  } catch (err) {
    console.error(`[relay] Error writing chunk to disk:`, err)
  }
}

async function readChunkFromDisk(code, fileId, chunkIdx) {
  try {
    const filePath = path.join(getChunkDir(code, fileId), String(chunkIdx))
    return await fs.promises.readFile(filePath)
  } catch (err) {
    return null
  }
}

async function deleteFileFromDisk(code, fileId) {
  try {
    await fs.promises.rm(getChunkDir(code, fileId), { recursive: true, force: true })
  } catch (err) {}
}

async function deleteRoomChunksFromDisk(code) {
  try {
    await fs.promises.rm(path.join(CHUNK_STORAGE_DIR, String(code).toUpperCase()), { recursive: true, force: true })
  } catch (err) {}
}

/* --------------------------------------------------- remote code runner */

const RUNNER_CACHE = new Map()
const HAS_BWRAP = process.platform === 'linux' &&
  fs.existsSync('/usr/bin/bwrap') &&
  fs.existsSync('/usr/bin/prlimit')

// Concurrency limiter for compiler jobs
let activeRunnerJobs = 0
const MAX_CONCURRENT_RUNS = 4
const MAX_RUNNER_QUEUE = 25
const runnerQueue = []

function enqueueExecution(task) {
  return new Promise((resolve, reject) => {
    if (activeRunnerJobs < MAX_CONCURRENT_RUNS) {
      activeRunnerJobs++
      task().finally(() => {
        activeRunnerJobs--
        if (runnerQueue.length > 0) {
          const next = runnerQueue.shift()
          next()
        }
      }).then(resolve, reject)
    } else if (runnerQueue.length < MAX_RUNNER_QUEUE) {
      runnerQueue.push(() => {
        activeRunnerJobs++
        task().finally(() => {
          activeRunnerJobs--
          if (runnerQueue.length > 0) {
            const next = runnerQueue.shift()
            next()
          }
        }).then(resolve, reject)
      })
    } else {
      resolve({
        ok: false,
        error: 'server_busy',
        stdout: '',
        stderr: 'Server is currently processing too many compilation jobs. Please wait a few seconds and try again.',
        exitCode: 429
      })
    }
  })
}

async function runLocalProcess(cmd, args, input = '', timeoutMs = 8000, cwd = undefined) {
  return new Promise(resolve => {
    const startTime = Date.now()
    let stdout = '', stderr = '', finished = false

    const proc = spawn(cmd, args, {
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: cwd || undefined,
    })

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        try { proc.kill('SIGKILL') } catch (e) {}
        resolve({
          ok: false,
          stdout,
          stderr: stderr + '\nExecution timed out (' + (timeoutMs / 1000) + 's limit).',
          exitCode: 124,
          executionTime: Date.now() - startTime,
        })
      }
    }, timeoutMs)

    if (input) {
      try { proc.stdin.write(input); proc.stdin.end() } catch (e) {}
    } else {
      try { proc.stdin.end() } catch (e) {}
    }

    proc.stdout.on('data', d => {
      stdout += d.toString()
      if (stdout.length > 512 * 1024) proc.kill()
    })
    proc.stderr.on('data', d => {
      stderr += d.toString()
      if (stderr.length > 512 * 1024) proc.kill()
    })

    proc.on('close', code => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        stdout: stdout.slice(0, 100000),
        stderr: stderr.slice(0, 100000),
        exitCode: code ?? 0,
        executionTime: Date.now() - startTime,
      })
    })

    proc.on('error', err => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve({
        ok: false,
        stdout,
        stderr: err.message,
        exitCode: 1,
        executionTime: Date.now() - startTime,
      })
    })
  })
}

async function runSandboxedProcess({ cmd, args = [], input = '', workspaceDir = null, isCompile = false, timeoutMs = 8000 }) {
  if (!HAS_BWRAP) {
    return runLocalProcess(cmd, args, input, timeoutMs, workspaceDir)
  }

  // Bubblewrap + prlimit container arguments
  //
  // Memory-limit strategy (learned the hard way):
  //   RLIMIT_AS (--as) counts EVERY mapped virtual byte, including PROT_NONE
  //   reservations. Modern runtimes reserve gigabytes of address space they
  //   never touch, so --as kills them at startup:
  //     - V8 (node)  -> "Failed to reserve virtual memory for CodeRange"
  //     - Go runtime -> "failed to reserve page summary memory"
  //     - rustc/ld   -> "linking with cc failed"
  //   RLIMIT_DATA (--data) only limits writable anonymous mappings, so the
  //   giant reservations pass through while real committed memory stays
  //   capped. VA-hungry runtimes get --data; tiny native binaries keep the
  //   stricter --as.
  const isJvm = cmd === 'java' || cmd === 'javac'
  const isNode = /node(\.exe)?$/i.test(cmd) || cmd === 'node' || cmd === process.execPath
  const isGo = cmd === 'go'
  const isRustc = cmd === 'rustc'
  const vaHungry = isJvm || isNode || isGo || isRustc

  const maxMemBytes = isCompile ? 512 * 1024 * 1024 : 256 * 1024 * 1024
  const dataCapBytes = isRustc || isCompile && isGo
    ? 2 * 1024 * 1024 * 1024   // compiler/linker stages: 2 GB data cap
    : isGo || isNode
      ? 1536 * 1024 * 1024     // runtimes that build arenas: 1.5 GB data cap
      : 768 * 1024 * 1024      // JVM: 768 MB data cap
  const maxNproc = isCompile || isJvm ? 64 : 32
  const maxCpuSec = isCompile ? 12 : 6

  const prlimitArgs = [
    vaHungry ? `--data=${dataCapBytes}` : `--as=${maxMemBytes}`,
    `--nproc=${maxNproc}`,
    `--fsize=10485760`,
    `--cpu=${maxCpuSec}`,
    'bwrap',
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind-try', '/etc', '/etc',
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--unshare-all',
    '--unshare-net',
    '--die-with-parent'
  ]

  if (workspaceDir) {
    prlimitArgs.push('--bind', workspaceDir, '/workspace', '--chdir', '/workspace')
  }

  prlimitArgs.push(cmd, ...args)

  return runLocalProcess('/usr/bin/prlimit', prlimitArgs, input, timeoutMs, workspaceDir)
}

async function executeCodeInternal({ language, code, stdin = '' }) {
  const normLang = (language || '').toLowerCase().trim()
  const cacheKey = sha256(normLang + ':' + code + ':' + stdin)
  if (RUNNER_CACHE.has(cacheKey)) {
    return RUNNER_CACHE.get(cacheKey)
  }
  // Bound the cache so a flood of unique programs cannot grow it indefinitely.
  if (RUNNER_CACHE.size >= 200) RUNNER_CACHE.clear()

  // Ephemeral isolated workspace per run
  const runId = 'anon_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex')
  const workspaceDir = path.join(os.tmpdir(), runId)
  await fs.promises.mkdir(workspaceDir, { recursive: true })

  try {
    // 1. Python 3
    if (normLang === 'python' || normLang === 'py') {
      const scriptPath = path.join(workspaceDir, 'script.py')
      await fs.promises.writeFile(scriptPath, code, 'utf8')
      const pyExe = process.platform === 'win32'
        ? (fs.existsSync('C:\\Users\\Dell\\AppData\\Local\\Programs\\Python\\Python312\\python.exe')
            ? 'C:\\Users\\Dell\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
            : 'python')
        : 'python3'
      const result = await runSandboxedProcess({
        cmd: pyExe,
        args: [HAS_BWRAP ? '/workspace/script.py' : scriptPath],
        input: stdin,
        workspaceDir,
        timeoutMs: 8000
      })
      RUNNER_CACHE.set(cacheKey, result)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return result
    }

    // 2. JavaScript / Node.js
    if (normLang === 'javascript' || normLang === 'js' || normLang === 'node') {
      const scriptPath = path.join(workspaceDir, 'script.js')
      await fs.promises.writeFile(scriptPath, code, 'utf8')
      const nodeExe = process.execPath || 'node'
      // --max-old-space-size keeps V8's JS heap within sandbox budget even
      // though RLIMIT_DATA allows the runtime's address-space reservations.
      const nodeArgs = ['--max-old-space-size=256', HAS_BWRAP ? '/workspace/script.js' : scriptPath]
      const result = await runSandboxedProcess({
        cmd: nodeExe,
        args: nodeArgs,
        input: stdin,
        workspaceDir,
        timeoutMs: 8000
      })
      RUNNER_CACHE.set(cacheKey, result)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return result
    }

    // 3. Native C via GCC
    if (normLang === 'c') {
      const srcPath = path.join(workspaceDir, 'main.c')
      const binPath = path.join(workspaceDir, 'main.bin')
      await fs.promises.writeFile(srcPath, code, 'utf8')
      const compile = await runSandboxedProcess({
        cmd: 'gcc',
        args: ['-O2', HAS_BWRAP ? '/workspace/main.c' : srcPath, '-o', HAS_BWRAP ? '/workspace/main.bin' : binPath, '-lm'],
        workspaceDir,
        isCompile: true,
        timeoutMs: 10000
      })
      if (compile.exitCode !== 0) {
        return {
          ok: false,
          stdout: compile.stdout,
          stderr: 'Compilation error:\n' + compile.stderr,
          exitCode: compile.exitCode,
          executionTime: compile.executionTime
        }
      }
      const runRes = await runSandboxedProcess({
        cmd: HAS_BWRAP ? '/workspace/main.bin' : binPath,
        args: [],
        input: stdin,
        workspaceDir,
        timeoutMs: 8000
      })
      RUNNER_CACHE.set(cacheKey, runRes)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return runRes
    }

    // 4. Native C++ via G++
    if (normLang === 'cpp' || normLang === 'c++') {
      const srcPath = path.join(workspaceDir, 'main.cpp')
      const binPath = path.join(workspaceDir, 'main.bin')
      await fs.promises.writeFile(srcPath, code, 'utf8')
      const compile = await runSandboxedProcess({
        cmd: 'g++',
        args: ['-O2', '-std=c++20', HAS_BWRAP ? '/workspace/main.cpp' : srcPath, '-o', HAS_BWRAP ? '/workspace/main.bin' : binPath, '-lm'],
        workspaceDir,
        isCompile: true,
        timeoutMs: 12000
      })
      if (compile.exitCode !== 0) {
        return {
          ok: false,
          stdout: compile.stdout,
          stderr: 'Compilation error:\n' + compile.stderr,
          exitCode: compile.exitCode,
          executionTime: compile.executionTime
        }
      }
      const runRes = await runSandboxedProcess({
        cmd: HAS_BWRAP ? '/workspace/main.bin' : binPath,
        args: [],
        input: stdin,
        workspaceDir,
        timeoutMs: 8000
      })
      RUNNER_CACHE.set(cacheKey, runRes)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return runRes
    }

    // 5. Native Go
    if (normLang === 'go' || normLang === 'golang') {
      const srcPath = path.join(workspaceDir, 'main.go')
      await fs.promises.writeFile(srcPath, code, 'utf8')
      const runRes = await runSandboxedProcess({
        cmd: 'go',
        args: ['run', HAS_BWRAP ? '/workspace/main.go' : srcPath],
        input: stdin,
        workspaceDir,
        isCompile: true,
        timeoutMs: 14000
      })
      RUNNER_CACHE.set(cacheKey, runRes)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return runRes
    }

    // 6. Native Rust
    if (normLang === 'rust' || normLang === 'rs') {
      const srcPath = path.join(workspaceDir, 'main.rs')
      const binPath = path.join(workspaceDir, 'main.bin')
      await fs.promises.writeFile(srcPath, code, 'utf8')
      const compile = await runSandboxedProcess({
        cmd: 'rustc',
        args: ['-O', HAS_BWRAP ? '/workspace/main.rs' : srcPath, '-o', HAS_BWRAP ? '/workspace/main.bin' : binPath],
        workspaceDir,
        isCompile: true,
        timeoutMs: 12000
      })
      if (compile.exitCode !== 0) {
        return {
          ok: false,
          stdout: compile.stdout,
          stderr: 'Compilation error:\n' + compile.stderr,
          exitCode: compile.exitCode,
          executionTime: compile.executionTime
        }
      }
      const runRes = await runSandboxedProcess({
        cmd: HAS_BWRAP ? '/workspace/main.bin' : binPath,
        args: [],
        input: stdin,
        workspaceDir,
        timeoutMs: 8000
      })
      RUNNER_CACHE.set(cacheKey, runRes)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return runRes
    }

    // 7. Native Bash
    if (normLang === 'bash' || normLang === 'sh') {
      const scriptPath = path.join(workspaceDir, 'script.sh')
      await fs.promises.writeFile(scriptPath, code, 'utf8')
      const runRes = await runSandboxedProcess({
        cmd: 'bash',
        args: [HAS_BWRAP ? '/workspace/script.sh' : scriptPath],
        input: stdin,
        workspaceDir,
        timeoutMs: 8000
      })
      RUNNER_CACHE.set(cacheKey, runRes)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return runRes
    }

    // 8. Native Java (javac + java)
    if (normLang === 'java') {
      const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/)
      const className = classMatch ? classMatch[1] : 'Main'
      const srcPath = path.join(workspaceDir, `${className}.java`)
      await fs.promises.writeFile(srcPath, code, 'utf8')
      const compile = await runSandboxedProcess({
        cmd: 'javac',
        args: ['-J-Xmx256m', '-J-Xms32m', '-encoding', 'UTF-8', HAS_BWRAP ? `/workspace/${className}.java` : srcPath],
        workspaceDir,
        isCompile: true,
        timeoutMs: 12000
      })
      if (compile.exitCode !== 0) {
        return {
          ok: false,
          stdout: compile.stdout,
          stderr: 'Compilation error:\n' + compile.stderr,
          exitCode: compile.exitCode,
          executionTime: compile.executionTime
        }
      }
      const runRes = await runSandboxedProcess({
        cmd: 'java',
        args: ['-Xmx128m', '-Xms32m', '-XX:+UseSerialGC', '-cp', HAS_BWRAP ? '/workspace' : workspaceDir, className],
        input: stdin,
        workspaceDir,
        timeoutMs: 10000
      })
      RUNNER_CACHE.set(cacheKey, runRes)
      setTimeout(() => RUNNER_CACHE.delete(cacheKey), 15000)
      return runRes
    }

    // 9. Language not supported natively — honest error (no silent fallback).
    // The public emkc.org Piston API became whitelist-only in Feb 2026, so the
    // old fallback is gone. Only the languages listed in GET /run are real.
    return {
      ok: false,
      error: 'language_not_supported',
      stdout: '',
      stderr: `Runner could not execute language "${normLang}". Supported: python, javascript, c, cpp, go, rust, bash, java.`,
      exitCode: 1,
    }
  } finally {
    try { await fs.promises.rm(workspaceDir, { recursive: true, force: true }) } catch (e) {}
  }
}

async function executeCode(payload) {
  return enqueueExecution(() => executeCodeInternal(payload))
}

/* ---------------------------------------------------------- HTTP Server */

// Top-level guard: any unhandled throw/rejection in a route becomes a
// generic 500 with no internal detail — never a process crash (Node kills
// the process on unhandled rejections by default).
const server = http.createServer((req, res) => {
  handleHttp(req, res).catch(err => {
    console.error('[relay] request error:', err && err.message)
    try {
      if (!res.headersSent) sendJson(req, res, { error: 'internal' }, 500)
      else res.destroy()
    } catch (e) {}
  })
})

async function handleHttp(req, res) {
  const ip = getClientIp(req)
  let url
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  } catch (e) {
    return sendJson(req, res, { error: 'bad_url' }, 400)
  }

  // Handle CORS preflight — only allowlisted origins get a grant.
  if (req.method === 'OPTIONS') {
    const h = corsHeaders(req)
    if (!h['Access-Control-Allow-Origin']) {
      res.writeHead(403, { ...SECURITY_HEADERS, Vary: 'Origin' })
      return res.end()
    }
    res.writeHead(204, { ...h, ...SECURITY_HEADERS })
    return res.end()
  }

  // Health check & metrics
  if (url.pathname === '/' || url.pathname === '/health') {
    return sendJson(req, res, { ok: true, service: 'anonshare-sync', version: 4, runtime: 'vps-node', sandbox: HAS_BWRAP ? 'bwrap-hardened' : 'standard' })
  }

  if (url.pathname === '/health/stats') {
    const mem = process.memoryUsage()
    let totalSockets = 0
    let totalChunks = 0
    for (const r of rooms.values()) {
      totalSockets += r.sockets.size
      for (const map of r.fileChunks.values()) totalChunks += map.size
    }
    return sendJson(req, res, {
      ok: true,
      service: 'anonshare-sync',
      uptime: Math.round(process.uptime()),
      activeRooms: rooms.size,
      connectedPeers: totalSockets,
      storedFileChunks: totalChunks,
      sandbox: HAS_BWRAP ? 'bubblewrap-hardened' : 'standard',
      concurrency: {
        activeRuns: activeRunnerJobs,
        queuedRuns: runnerQueue.length,
        maxConcurrent: MAX_CONCURRENT_RUNS
      },
      memory: {
        rssMb: Math.round(mem.rss / 1048576),
        heapUsedMb: Math.round(mem.heapUsed / 1048576)
      }
    })
  }

  /* ---------------------------------------------------- Code Execution */
  if (url.pathname === '/run' && req.method === 'POST') {
    if (!checkRate(ip, 'run')) {
      return sendJson(req, res, {
        ok: false,
        error: 'rate_limited',
        retryAfter: 30,
        stderr: 'Rate limit exceeded (max 20 runs/min per IP). Please wait before running more code.'
      }, 429)
    }

    const body = await readBody(req, 256 * 1024)
    if (!body) {
      return sendJson(req, res, { ok: false, error: 'body_too_large', stderr: 'Payload exceeds the 256KB limit' }, 413)
    }
    let payload
    try {
      payload = JSON.parse(body.toString('utf8'))
    } catch (e) {
      return sendJson(req, res, { ok: false, error: 'bad_json', stderr: 'Malformed JSON payload' }, 400)
    }

    // Server-side input validation — types, sizes, and the language
    // whitelist are all checked before anything is queued or executed.
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return sendJson(req, res, { ok: false, error: 'bad_body', stderr: 'Body must be a JSON object' }, 400)
    }
    if (typeof payload.code !== 'string' || !payload.code.trim()) {
      return sendJson(req, res, { ok: false, error: 'bad_body', stderr: 'Missing or invalid code field' }, 400)
    }
    if (payload.code.length > 256 * 1024) {
      return sendJson(req, res, { ok: false, error: 'body_too_large', stderr: 'Source exceeds the 256KB limit' }, 413)
    }
    if (typeof payload.language !== 'string' || !payload.language.trim()) {
      return sendJson(req, res, { ok: false, error: 'bad_body', stderr: 'Missing or invalid language field' }, 400)
    }
    if (payload.stdin !== undefined && payload.stdin !== null &&
        (typeof payload.stdin !== 'string' || payload.stdin.length > 64 * 1024)) {
      return sendJson(req, res, { ok: false, error: 'bad_body', stderr: 'stdin must be a string of at most 64KB' }, 400)
    }
    const normLang = payload.language.toLowerCase().trim()
    if (!RUN_LANGS.has(normLang)) {
      return sendJson(req, res, {
        ok: false,
        error: 'language_not_supported',
        stderr: `Runner could not execute language "${normLang}". Supported: python, javascript, c, cpp, go, rust, bash, java.`,
      }, 400)
    }

    const result = await executeCode({ language: normLang, code: payload.code, stdin: payload.stdin || '' })
    const status = result.exitCode === 429 ? 429 : 200
    return sendJson(req, res, result, status)
  }

  /* ------------------------------------------------------- Admin routes */
  if (url.pathname.startsWith('/admin/')) {
    if (url.pathname === '/admin/login' && req.method === 'POST') {
      if (!ADMIN_PASSWORD) {
        return sendJson(req, res, { error: 'admin_disabled', detail: 'Set ADMIN_PASSWORD env var to enable the admin API' }, 503)
      }
      if (!checkRate(ip, 'auth')) {
        return sendJson(req, res, { error: 'rate_limited', retryAfter: 60 }, 429)
      }
      const body = await readBody(req, 4 * 1024)
      if (!body) return sendJson(req, res, { error: 'body_too_large' }, 413)
      try {
        const { password } = JSON.parse(body.toString('utf8'))
        if (!constEq(String(password || ''), ADMIN_PASSWORD)) {
          return sendJson(req, res, { error: 'bad_password' }, 403)
        }
        const exp = Date.now() + 12 * 60 * 60 * 1000
        return sendJson(req, res, { token: signToken(exp), exp })
      } catch (e) {
        return sendJson(req, res, { error: 'bad_body' }, 400)
      }
    }

    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!verifyToken(token)) return sendJson(req, res, { error: 'unauthorized' }, 401)

    if (url.pathname === '/admin/rooms' && req.method === 'GET') {
      const list = []
      for (const [code, r] of rooms) {
        list.push({
          code,
          created: r.meta.c,
          ttl: r.meta.ttl,
          peers: r.sockets.size,
          hasPassword: !!r.meta.p,
          suspended: !!r.meta.s,
          locked: !!r.meta.r,
        })
      }
      list.sort((a, b) => b.created - a.created)
      return sendJson(req, res, { rooms: list, total: list.length })
    }

    if (url.pathname === '/admin/metrics' && req.method === 'GET') {
      const now = Date.now()
      const hourAgo = now - 60 * 60 * 1000
      const dayAgo = now - 24 * 60 * 60 * 1000
      const all = Array.from(rooms.values())
      return sendJson(req, res, {
        totalActiveRooms: all.length,
        createdLastHour: all.filter(r => r.meta.c >= hourAgo).length,
        createdLastDay: all.filter(r => r.meta.c >= dayAgo).length,
        passwordProtected: all.filter(r => r.meta.p).length,
      })
    }

    const actionMatch = url.pathname.match(/^\/admin\/rooms\/([A-Za-z0-9]{4,12})\/(suspend|unsuspend|lock|unlock|delete)$/)
    if (actionMatch && req.method === 'POST') {
      const code = actionMatch[1].toUpperCase()
      const verb = actionMatch[2]
      const room = rooms.get(code)
      if (!room) return sendJson(req, res, { error: 'no_room' }, 404)

      if (verb === 'delete') {
        for (const ws of room.sockets) {
          try { ws.send(textFrame(T_KILLED, 'admin_deleted')) } catch (e) {}
          try { ws.close(4001, 'admin_deleted') } catch (e) {}
        }
        rooms.delete(code)
        return sendJson(req, res, { ok: true, deleted: true })
      }

      if (verb === 'suspend' || verb === 'unsuspend') {
        const val = verb === 'suspend'
        room.meta.s = val
        room.meta.sa = val
        if (val) {
          for (const ws of room.sockets) {
            if (ws._att?.own) continue
            try { ws.send(textFrame(T_KILLED, 'admin_suspended')) } catch (e) {}
            try { ws.close(4002, 'admin_suspended') } catch (e) {}
          }
        }
      } else if (verb === 'lock' || verb === 'unlock') {
        const val = verb === 'lock'
        room.meta.r = val
        for (const ws of room.sockets) {
          ws._att.edit = !!ws._att.own || !val
        }
      }

      room.announceState()
      return sendJson(req, res, { ok: true, suspended: !!room.meta.s, locked: !!room.meta.r })
    }

    if (url.pathname === '/admin/config') {
      if (req.method === 'GET') {
        const defaults = { IP_PER_MIN, CREATE_PER_MIN, AUTH_PER_MIN, MAX_CONNS, RATE_PER_SEC }
        return sendJson(req, res, { config: currentConfig, defaults })
      }
      if (req.method === 'POST') {
        const body = await readBody(req, 4 * 1024)
        if (!body) return sendJson(req, res, { error: 'body_too_large' }, 413)
        try {
          const data = JSON.parse(body.toString('utf8'))
          for (const k of ['IP_PER_MIN', 'CREATE_PER_MIN', 'AUTH_PER_MIN', 'MAX_CONNS']) {
            if (typeof data[k] === 'number' && data[k] > 0) currentConfig[k] = Math.floor(data[k])
          }
          return sendJson(req, res, { ok: true, config: currentConfig })
        } catch (e) {
          return sendJson(req, res, { error: 'bad_body' }, 400)
        }
      }
    }

    return sendJson(req, res, { error: 'not_found' }, 404)
  }

  /* -------------------------------------------------------- Room routes */
  // NOTE: `files` optionally carries `/fileId` and then `/chunk/:idx` —
  // `DELETE /room/:code/files/:fileId` (no chunk suffix) is the documented
  // remove-for-everyone call the client actually makes, and it must route.
  const roomMatch = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})(?:\/(exists|admin|files(?:\/([a-zA-Z0-9_-]+)(?:\/chunk\/(\d+))?)?))?$/)
  if (!roomMatch) return sendJson(req, res, { error: 'not_found' }, 404)

  const code = roomMatch[1].toUpperCase()
  if (!CODE_RE.test(code)) return sendJson(req, res, { error: 'bad_code' }, 400)

  // General per-IP throttle covering every room subroute (exists, files,
  // join preflight, create) — file uploads alone can be 400 requests.
  if (!checkRate(ip, 'default')) {
    return sendJson(req, res, { error: 'rate_limited', retryAfter: 30 }, 429)
  }

  const subAction = roomMatch[2]
  let room = rooms.get(code)

  // /room/:code/exists
  if (subAction === 'exists') {
    return sendJson(req, res, {
      exists: !!room,
      peers: room ? room.sockets.size : 0,
      hasPassword: room ? !!room.meta.p : false,
      auth: room ? !!room.meta.a : false,
      suspended: room ? !!room.meta.s : false,
      locked: room ? !!room.meta.r : false,
    })
  }

  // /room/:code/admin (Owner room administration)
  if (subAction === 'admin') {
    if (req.method !== 'POST') return sendJson(req, res, { error: 'method' }, 405)
    if (!room) return sendJson(req, res, { error: 'no_room' }, 404)

    const body = await readBody(req, 8 * 1024)
    if (!body) return sendJson(req, res, { error: 'body_too_large' }, 413)
    try {
      const { token, action, value, masterKey } = JSON.parse(body.toString('utf8'))

      // A masterKey attempt is a guess at the operator password — count it
      // against the strict auth budget so the shared secret cannot be
      // brute-forced through this route (it was previously unlimited).
      const hasMasterKey = masterKey !== undefined && masterKey !== null && masterKey !== ''
      if (hasMasterKey && !checkRate(ip, 'auth')) {
        return sendJson(req, res, { error: 'rate_limited', retryAfter: 60 }, 429)
      }
      const masterOk = !!ADMIN_PASSWORD && !!masterKey && constEq(masterKey, ADMIN_PASSWORD)

      if (!masterOk) {
        if (!room.meta.o) return sendJson(req, res, { error: 'no_owner' }, 409)
        if (!constEq(sha256(token || ''), room.meta.o)) {
          checkRate(ip, 'auth')
          return sendJson(req, res, { error: 'not_owner' }, 403)
        }
      }

        if (action === 'delete') {
          const reason = masterOk ? 'admin_deleted' : 'deleted'
          for (const ws of room.sockets) {
            try { ws.send(textFrame(T_KILLED, reason)) } catch (e) {}
            try { ws.close(4001, reason) } catch (e) {}
          }
          rooms.delete(code)
          deleteRoomChunksFromDisk(code)
          return sendJson(req, res, { ok: true, deleted: true })
        }

        if (action === 'suspend') {
          room.meta.s = !!value
          room.meta.sa = masterOk && !!value
          if (room.meta.s) {
            const reason = room.meta.sa ? 'admin_suspended' : 'suspended'
            for (const ws of room.sockets) {
              if (ws._att?.own) continue
              try { ws.send(textFrame(T_KILLED, reason)) } catch (e) {}
              try { ws.close(4002, reason) } catch (e) {}
            }
          }
        } else if (action === 'lock') {
          room.meta.r = !!value
          for (const ws of room.sockets) {
            ws._att.edit = !!ws._att.own || !room.meta.r
          }
        } else if (action === 'ttl') {
          room.meta.ttl = TTLS[value] || DEFAULT_TTL
        } else {
          return sendJson(req, res, { error: 'bad_action' }, 400)
        }

        room.announceState()
        return sendJson(req, res, { ok: true, suspended: !!room.meta.s, locked: !!room.meta.r, ttl: room.meta.ttl })
    } catch (e) {
      return sendJson(req, res, { error: 'bad_body' }, 400)
    }
  }

  // /room/:code/files (Encrypted ephemeral file chunks)
  if (subAction && subAction.startsWith('files')) {
    const fileId = roomMatch[3]
    const chunkIdx = roomMatch[4] ? parseInt(roomMatch[4], 10) : null

    const getAuth = () => {
      if (url.searchParams.get('a')) return url.searchParams.get('a')
      if (req.headers['x-room-auth']) return req.headers['x-room-auth']
      const auth = req.headers['authorization']
      if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim()
      return null
    }

    // If server restarted, re-hydrate room if valid auth is provided
    if (!room) {
      const authHeader = getAuth()
      if (authHeader) {
        const meta = {
          c: Date.now(),
          p: false,
          a: sha256(authHeader),
          o: null,
          s: false,
          sa: false,
          r: false,
          ttl: DEFAULT_TTL,
        }
        room = new RoomState(code, meta)
        rooms.set(code, room)
      } else {
        return sendJson(req, res, { error: 'no_room' }, 404)
      }
    }

    // Verify room auth
    const authHeader = getAuth()
    if (room.meta.a && (!authHeader || !constEq(sha256(authHeader), room.meta.a))) {
      return sendJson(req, res, { error: 'unauthorized' }, 403)
    }

    // PUT chunk (encrypted client-side; the relay stores opaque bytes).
    // Quotas: 1MB per chunk, 400 chunks per file, 32 files per room, 50MB
    // per room — an authenticated member can no longer fill the VPS disk.
    if (req.method === 'PUT' && fileId && chunkIdx !== null) {
      if (!Number.isInteger(chunkIdx) || chunkIdx < 0 || chunkIdx >= MAX_FILE_CHUNKS) {
        return sendJson(req, res, { error: 'chunk_index_out_of_range', max: MAX_FILE_CHUNKS }, 400)
      }
      const fullBuf = await readBody(req, MAX_CHUNK_BYTES)
      if (!fullBuf || fullBuf.length === 0) {
        return sendJson(req, res, { error: 'chunk_too_large', stderr: 'Chunk exceeds the 1MB limit' }, 413)
      }
      const fileMap = room.fileChunks.get(fileId)
      const overwrite = fileMap ? fileMap.has(chunkIdx) : false
      if (!fileMap && room.fileChunks.size >= MAX_FILES_PER_ROOM) {
        return sendJson(req, res, { error: 'too_many_files', max: MAX_FILES_PER_ROOM }, 413)
      }
      if (fileMap && !overwrite && fileMap.size >= MAX_FILE_CHUNKS) {
        return sendJson(req, res, { error: 'file_too_many_chunks', max: MAX_FILE_CHUNKS }, 413)
      }
      if (!overwrite && roomFileBytes(room) + fullBuf.length > MAX_ROOM_FILE_BYTES) {
        return sendJson(req, res, { error: 'room_file_quota', maxBytes: MAX_ROOM_FILE_BYTES }, 413)
      }
      if (!fileMap) {
        room.fileChunks.set(fileId, new Map([[chunkIdx, fullBuf]]))
      } else {
        fileMap.set(chunkIdx, fullBuf)
      }
      await saveChunkToDisk(code, fileId, chunkIdx, fullBuf)
      room.touch()
      return sendJson(req, res, { ok: true, fileId, chunkIndex: chunkIdx })
    }

    // GET chunk
    if (req.method === 'GET' && fileId && chunkIdx !== null) {
      if (!Number.isInteger(chunkIdx) || chunkIdx < 0 || chunkIdx >= MAX_FILE_CHUNKS) {
        return sendJson(req, res, { error: 'chunk_index_out_of_range', max: MAX_FILE_CHUNKS }, 400)
      }
      let data = room.fileChunks.get(fileId)?.get(chunkIdx)
      if (!data) {
        data = await readChunkFromDisk(code, fileId, chunkIdx)
        if (data) {
          let fileMap = room.fileChunks.get(fileId)
          if (!fileMap) {
            fileMap = new Map()
            room.fileChunks.set(fileId, fileMap)
          }
          fileMap.set(chunkIdx, data)
        }
      }
      if (!data) return sendJson(req, res, { error: 'chunk_not_found' }, 404)

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
        ...corsHeaders(req),
      })
      return res.end(data)
    }

    // DELETE file
    if (req.method === 'DELETE' && fileId) {
      room.fileChunks.delete(fileId)
      await deleteFileFromDisk(code, fileId)
      return sendJson(req, res, { ok: true, deleted: fileId })
    }

    return sendJson(req, res, { ok: true, files: Array.from(room.fileChunks.keys()) })
  }

  // Preflight HTTP request for room join / creation
  const isCreate = url.searchParams.get('create') === '1'
  if (isCreate) {
    if (!checkRate(ip, 'create')) return sendJson(req, res, { error: 'rate_limited' }, 429)
    if (room && url.searchParams.get('excl') === '1') return sendJson(req, res, { error: 'taken' }, 409)

    if (!room) {
      const rawAuth = url.searchParams.get('a')
      const rawOwner = url.searchParams.get('o')
      const meta = {
        c: Date.now(),
        p: url.searchParams.get('p') === '1',
        a: rawAuth ? sha256(rawAuth) : null,
        o: rawOwner ? sha256(rawOwner) : null,
        s: false,
        sa: false,
        r: false,
        ttl: TTLS[url.searchParams.get('ttl')] || DEFAULT_TTL,
      }
      rooms.set(code, new RoomState(code, meta))
    }
  }

  const currentRoom = rooms.get(code)
  if (!currentRoom) return sendJson(req, res, { error: 'no_room' }, 404)

  // Authenticate joining client
  const rawOwner = url.searchParams.get('o')
  const isOwner = !!currentRoom.meta.o && !!rawOwner && constEq(sha256(rawOwner), currentRoom.meta.o)

  if (currentRoom.meta.a && !isOwner) {
    const rawAuth = url.searchParams.get('a')
    const ok = !!rawAuth && constEq(sha256(rawAuth), currentRoom.meta.a)
    if (!ok) {
      checkRate(ip, 'auth')
      return sendJson(req, res, { error: 'bad_auth' }, 403)
    }
  }

  if (currentRoom.meta.s && !isOwner) {
    return sendJson(req, res, { error: 'suspended' }, 423)
  }

  // Client sent regular HTTP GET -> return 426 Upgrade Required (proves token was accepted)
  return sendJson(req, res, { ok: true, error: 'expected_websocket' }, 426)
}

/* ---------------------------------------------------- WebSocket Server */

const wss = new WebSocketServer({ noServer: true })

// Concurrent WS connections per client IP (set on upgrade, released on
// close/error). Room-hopping clients can no longer dodge MAX_CONNS.
const ipConns = new Map()

server.on('upgrade', (req, socket, head) => {
  try {
    const ip = getClientIp(req)
    let url
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    } catch (e) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      return socket.destroy()
    }
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})$/)

    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      return socket.destroy()
    }

    // Connection-level abuse guards BEFORE any room work happens.
    if (!checkRate(ip, 'default') || (ipConns.get(ip) || 0) >= MAX_IP_CONNS) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 30\r\n\r\n')
      return socket.destroy()
    }

  const code = match[1].toUpperCase()
  let room = rooms.get(code)
  if (!room && url.searchParams.get('create') === '1') {
    const rawAuth = url.searchParams.get('a')
    const rawOwner = url.searchParams.get('o')
    const meta = {
      c: Date.now(),
      p: url.searchParams.get('p') === '1',
      a: rawAuth ? sha256(rawAuth) : null,
      o: rawOwner ? sha256(rawOwner) : null,
      s: false,
      sa: false,
      r: false,
      ttl: TTLS[url.searchParams.get('ttl')] || DEFAULT_TTL,
    }
    room = new RoomState(code, meta)
    rooms.set(code, room)
  }
  if (!room) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    return socket.destroy()
  }

  const rawOwner = url.searchParams.get('o')
  const isOwner = !!room.meta.o && !!rawOwner && constEq(sha256(rawOwner), room.meta.o)

  if (room.meta.a && !isOwner) {
    const rawAuth = url.searchParams.get('a')
    if (!rawAuth || !constEq(sha256(rawAuth), room.meta.a)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      return socket.destroy()
    }
  }

  if (room.meta.s && !isOwner) {
    socket.write('HTTP/1.1 423 Locked\r\n\r\n')
    return socket.destroy()
  }

  if (room.sockets.size >= MAX_CONNS) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
    return socket.destroy()
  }

  wss.handleUpgrade(req, socket, head, ws => {
    ws._ip = ip
    ipConns.set(ip, (ipConns.get(ip) || 0) + 1)
    ws._att = {
      own: isOwner,
      edit: isOwner || !room.meta.r,
      cid: (url.searchParams.get('cid') || '').slice(0, 24),
      at: Date.now(),
    }
    wss.emit('connection', ws, req, room)
  })
  } catch (err) {
    // Malformed upgrade request — never crash the process over it.
    try { socket.destroy() } catch (e) {}
  }
})

wss.on('connection', (ws, req, room) => {
  room.sockets.add(ws)
  room.touch()

  // Tell existing peers the peer count changed (the joiner already gets a
  // state frame below, but everyone else's "peers" badge would go stale).
  room.announceState()

  // 1. Replay log backlog
  try {
    for (const blob of room.log) {
      ws.send(frame(T_UPDATE, blob))
    }
    // 1b. Replay each peer's latest sealed awareness frame so late joiners
    // see everyone's presence/cursors immediately (payloads stay encrypted).
    for (const [peer, payload] of room.aware) {
      if (peer !== ws && payload) {
        try { ws.send(frame(T_AWARE, payload)) } catch (e) {}
      }
    }
    // 2. Announce initial room state
    ws.send(room.stateFrame(ws._att))
    // 3. Mark sync complete
    ws.send(frame(T_SYNCED))
  } catch (e) {
    try { ws.send(errorFrame('replay_failed')) } catch (x) {}
  }

  // Socket message handler
  ws.on('message', async (data, isBinary) => {
    try {
      if (!isBinary) return
      const buf = Buffer.from(data)
      if (!buf.length || buf.length > MAX_FRAME) {
        return ws.send(errorFrame('frame_too_large'))
      }

      // Socket rate limiting
      const now = Date.now()
      let r = room.rate.get(ws)
      if (!r || now - r.t > 1000) {
        r = { t: now, n: 0, seen: now }
        room.rate.set(ws, r)
      }
      r.seen = now
      if (++r.n > RATE_PER_SEC) {
        return ws.send(errorFrame('rate_limited'))
      }

      const type = buf[0]
      const payload = buf.subarray(1)

      // Awareness / Presence (rebroadcast + cache for late joiners)
      if (type === T_AWARE) {
        room.aware.set(ws, payload)
        return room.broadcast(frame(T_AWARE, payload), ws)
      }

      // Owner Grant Rights
      if (type === T_GRANT) {
        if (!ws._att.own) return ws.send(errorFrame('not_owner'))
        const target = payload.toString('utf8')
        for (const peer of room.sockets) {
          if (peer._att?.cid !== target) continue
          peer._att.edit = true
          try { peer.send(room.stateFrame(peer._att)) } catch (e) {}
        }
        return
      }

      // Document Updates or Compacted Snapshot
      if (type === T_UPDATE || type === T_SNAPSHOT) {
        if (!ws._att.edit) return ws.send(errorFrame('read_only'))

        let replace = false
        if (type === T_SNAPSHOT) {
          const inv = room.invite
          replace = !!inv && inv.cid === ws._att.cid && (Date.now() - inv.at) < SNAPSHOT_WINDOW
          if (replace) room.invite = null
        }

        room.broadcast(frame(T_UPDATE, payload), ws)
        const ok = room.append(payload, replace)
        if (!ok) {
          ws.send(errorFrame('room_full_bytes'))
          room.requestCompaction()
        }
        room.touch()
      }
    } catch (err) {
      // Malformed frame caught safely
    }
  })

  // Socket cleanup
  const cleanup = () => {
    if (ws._ip) {
      const n = (ipConns.get(ws._ip) || 1) - 1
      if (n <= 0) ipConns.delete(ws._ip)
      else ipConns.set(ws._ip, n)
    }
    room.sockets.delete(ws)
    room.rate.delete(ws)
    room.aware.delete(ws)
    if (room.sockets.size === 0) {
      room.scheduleExpiry()
    } else {
      room.announceState()
    }
  }

  ws.on('close', cleanup)
  ws.on('error', cleanup)
})

// Periodic background cleaner for stale rooms and abandoned file chunks
setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    // 1. Purge abandoned file chunks older than 25 minutes
    if (room.fileChunks && room.fileChunks.size > 0 && now - room.lastActive > 25 * 60 * 1000) {
      room.fileChunks.clear()
      deleteRoomChunksFromDisk(code)
    }
    // 2. Expire empty rooms past TTL
    if (room.sockets.size === 0 && now - room.lastActive > (room.meta.ttl || DEFAULT_TTL)) {
      rooms.delete(code)
      deleteRoomChunksFromDisk(code)
    }
  }
}, 60000)

// Process-level safety net: a single bad request or frame must never take
// the whole relay down (Node's default is to exit on unhandled rejections).
// Details go to the server log only — clients always get generic errors.
process.on('uncaughtException', err => {
  console.error('[relay] uncaught exception:', err && err.message)
})
process.on('unhandledRejection', err => {
  console.error('[relay] unhandled rejection:', err && (err.message || err))
})

server.listen(PORT, HOST, () => {
  console.log(`[anonshare-relay] Server listening on http://${HOST}:${PORT}`)
  console.log(`[anonshare-relay] WebSocket endpoint: ws://${HOST}:${PORT}/room/<CODE>`)
  console.log(`[anonshare-relay] Code execution endpoint: http://${HOST}:${PORT}/run`)
  console.log(`[anonshare-relay] Sandbox isolation: ${HAS_BWRAP ? 'ACTIVE (Bubblewrap + prlimit)' : 'STANDARD'}`)
  console.log(`[anonshare-relay] Zero-knowledge E2EE mode: ACTIVE`)
  console.log(`[anonshare-relay] Admin API: ${ADMIN_PASSWORD ? 'enabled' : 'DISABLED (no ADMIN_PASSWORD env var set)'}`)
})

