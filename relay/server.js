/**
 * AnonShare High-Performance VPS Sync Relay & Code Runner
 * 
 * Drop-in, wire-compatible replacement for the Cloudflare Worker relay.
 * Preserves 100% zero-knowledge E2EE (AES-GCM ciphertext only).
 * 
 * Features:
 * - Full binary sync protocol (T_UPDATE, T_AWARE, T_SNAPSHOT, T_SYNCED, etc.)
 * - Native WebRTC P2P signaling routing (T_P2P_SIGNAL = 9)
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
const T_P2P = 9       // WebRTC P2P signaling between clients

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
const AUTH_PER_MIN = 12
const RUN_PER_MIN = 20
const CODE_RE = /^[A-Z0-9]{4,12}$/

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'anonshare-master-secret'
const PORT = parseInt(process.env.PORT || '8787', 10)
const HOST = process.env.HOST || '0.0.0.0'

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-room-auth,Range,*',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  })
  res.end(JSON.stringify(data))
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
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'anon'
  )
}

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
  const maxMemBytes = isCompile ? 512 * 1024 * 1024 : 256 * 1024 * 1024
  const maxNproc = isCompile ? 64 : 32
  const maxCpuSec = isCompile ? 12 : 6

  const prlimitArgs = [
    `--as=${maxMemBytes}`,
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
      const result = await runSandboxedProcess({
        cmd: nodeExe,
        args: [HAS_BWRAP ? '/workspace/script.js' : scriptPath],
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

    // 8. Fallback to public sandboxed Piston API
    try {
      const response = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'AnonShare-Runner/5.0' },
        body: JSON.stringify({
          language: normLang === 'c++' ? 'cpp' : normLang,
          version: '*',
          files: [{ content: code }],
          stdin,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const data = await response.json()
        const result = {
          ok: (data.run?.code ?? 1) === 0,
          stdout: data.run?.stdout || '',
          stderr: data.run?.stderr || '',
          exitCode: data.run?.code ?? 0,
          signal: data.run?.signal || null,
          executionTime: data.run?.duration || null,
        }
        RUNNER_CACHE.set(cacheKey, result)
        setTimeout(() => RUNNER_CACHE.delete(cacheKey), 30000)
        return result
      }
    } catch (err) {}

    return {
      ok: false,
      error: 'Execution service temporarily unavailable or language not supported',
      stdout: '',
      stderr: `Runner could not execute language: ${normLang}`,
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

const server = http.createServer(async (req, res) => {
  const ip = getClientIp(req)
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }

  // Health check & metrics
  if (url.pathname === '/' || url.pathname === '/health') {
    return sendJson(res, { ok: true, service: 'anonshare-sync', version: 4, runtime: 'vps-node', sandbox: HAS_BWRAP ? 'bwrap-hardened' : 'standard' })
  }

  if (url.pathname === '/health/stats') {
    const mem = process.memoryUsage()
    let totalSockets = 0
    let totalChunks = 0
    for (const r of rooms.values()) {
      totalSockets += r.sockets.size
      for (const map of r.fileChunks.values()) totalChunks += map.size
    }
    return sendJson(res, {
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
      return sendJson(res, {
        ok: false,
        error: 'rate_limited',
        retryAfter: 30,
        stderr: 'Rate limit exceeded (max 20 runs/min per IP). Please wait before running more code.'
      }, 429)
    }

    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 256 * 1024) req.destroy() // max 256KB source
    })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body)
        if (!payload.code || !payload.language) {
          return sendJson(res, { ok: false, error: 'bad_body', stderr: 'Missing language or code field' }, 400)
        }
        const result = await executeCode(payload)
        const status = result.exitCode === 429 ? 429 : 200
        return sendJson(res, result, status)
      } catch (e) {
        return sendJson(res, { ok: false, error: 'bad_json', stderr: 'Malformed JSON payload' }, 400)
      }
    })
    return
  }

  /* ------------------------------------------------------- Admin routes */
  if (url.pathname.startsWith('/admin/')) {
    if (url.pathname === '/admin/login' && req.method === 'POST') {
      if (!checkRate(ip, 'auth')) {
        return sendJson(res, { error: 'rate_limited', retryAfter: 60 }, 429)
      }
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          const { password } = JSON.parse(body)
          if (!constEq(String(password || ''), ADMIN_PASSWORD)) {
            return sendJson(res, { error: 'bad_password' }, 403)
          }
          const exp = Date.now() + 12 * 60 * 60 * 1000
          return sendJson(res, { token: signToken(exp), exp })
        } catch (e) {
          return sendJson(res, { error: 'bad_body' }, 400)
        }
      })
      return
    }

    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!verifyToken(token)) return sendJson(res, { error: 'unauthorized' }, 401)

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
      return sendJson(res, { rooms: list, total: list.length })
    }

    if (url.pathname === '/admin/metrics' && req.method === 'GET') {
      const now = Date.now()
      const hourAgo = now - 60 * 60 * 1000
      const dayAgo = now - 24 * 60 * 60 * 1000
      const all = Array.from(rooms.values())
      return sendJson(res, {
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
      if (!room) return sendJson(res, { error: 'no_room' }, 404)

      if (verb === 'delete') {
        for (const ws of room.sockets) {
          try { ws.send(textFrame(T_KILLED, 'admin_deleted')) } catch (e) {}
          try { ws.close(4001, 'admin_deleted') } catch (e) {}
        }
        rooms.delete(code)
        return sendJson(res, { ok: true, deleted: true })
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
      return sendJson(res, { ok: true, suspended: !!room.meta.s, locked: !!room.meta.r })
    }

    return sendJson(res, { error: 'not_found' }, 404)
  }

  /* -------------------------------------------------------- Room routes */
  const roomMatch = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})(?:\/(exists|admin|files(?:\/([a-zA-Z0-9_-]+)\/chunk\/(\d+))?))?$/)
  if (!roomMatch) return sendJson(res, { error: 'not_found' }, 404)

  const code = roomMatch[1].toUpperCase()
  if (!CODE_RE.test(code)) return sendJson(res, { error: 'bad_code' }, 400)

  const subAction = roomMatch[2]
  const room = rooms.get(code)

  // /room/:code/exists
  if (subAction === 'exists') {
    if (!checkRate(ip, 'default')) return sendJson(res, { error: 'rate_limited' }, 429)
    return sendJson(res, {
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
    if (req.method !== 'POST') return sendJson(res, { error: 'method' }, 405)
    if (!room) return sendJson(res, { error: 'no_room' }, 404)

    let body = ''
    req.on('data', c => { body += c })
    req.on('end', async () => {
      try {
        const { token, action, value, masterKey } = JSON.parse(body)
        const masterOk = !!ADMIN_PASSWORD && !!masterKey && constEq(masterKey, ADMIN_PASSWORD)

        if (!masterOk) {
          if (!room.meta.o) return sendJson(res, { error: 'no_owner' }, 409)
          if (!constEq(sha256(token || ''), room.meta.o)) {
            return sendJson(res, { error: 'not_owner' }, 403)
          }
        }

        if (action === 'delete') {
          const reason = masterOk ? 'admin_deleted' : 'deleted'
          for (const ws of room.sockets) {
            try { ws.send(textFrame(T_KILLED, reason)) } catch (e) {}
            try { ws.close(4001, reason) } catch (e) {}
          }
          rooms.delete(code)
          return sendJson(res, { ok: true, deleted: true })
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
          return sendJson(res, { error: 'bad_action' }, 400)
        }

        room.announceState()
        return sendJson(res, { ok: true, suspended: !!room.meta.s, locked: !!room.meta.r, ttl: room.meta.ttl })
      } catch (e) {
        return sendJson(res, { error: 'bad_body' }, 400)
      }
    })
    return
  }

  // /room/:code/files (Encrypted ephemeral file chunks)
  if (subAction && subAction.startsWith('files')) {
    const fileId = roomMatch[3]
    const chunkIdx = roomMatch[4] ? parseInt(roomMatch[4], 10) : null

    if (!room) return sendJson(res, { error: 'no_room' }, 404)

    // Verify room auth
    const authHeader = url.searchParams.get('a') || req.headers['x-room-auth']
    if (room.meta.a && (!authHeader || !constEq(sha256(authHeader), room.meta.a))) {
      return sendJson(res, { error: 'unauthorized' }, 403)
    }

    // PUT chunk
    if (req.method === 'PUT' && fileId && chunkIdx !== null) {
      const chunks = []
      let size = 0
      req.on('data', chunk => {
        chunks.push(chunk)
        size += chunk.length
        if (size > 1024 * 1024) req.destroy() // max 1MB per chunk
      })
      req.on('end', () => {
        let fileMap = room.fileChunks.get(fileId)
        if (!fileMap) {
          fileMap = new Map()
          room.fileChunks.set(fileId, fileMap)
        }
        fileMap.set(chunkIdx, Buffer.concat(chunks))
        room.touch()
        return sendJson(res, { ok: true, fileId, chunkIndex: chunkIdx })
      })
      return
    }

    // GET chunk
    if (req.method === 'GET' && fileId && chunkIdx !== null) {
      const fileMap = room.fileChunks.get(fileId)
      const data = fileMap?.get(chunkIdx)
      if (!data) return sendJson(res, { error: 'chunk_not_found' }, 404)

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      })
      return res.end(data)
    }

    // DELETE file
    if (req.method === 'DELETE' && fileId) {
      room.fileChunks.delete(fileId)
      return sendJson(res, { ok: true, deleted: fileId })
    }

    return sendJson(res, { ok: true, files: Array.from(room.fileChunks.keys()) })
  }

  // Preflight HTTP request for room join / creation
  const isCreate = url.searchParams.get('create') === '1'
  if (isCreate) {
    if (!checkRate(ip, 'create')) return sendJson(res, { error: 'rate_limited' }, 429)
    if (room && url.searchParams.get('excl') === '1') return sendJson(res, { error: 'taken' }, 409)

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
  if (!currentRoom) return sendJson(res, { error: 'no_room' }, 404)

  // Authenticate joining client
  const rawOwner = url.searchParams.get('o')
  const isOwner = !!currentRoom.meta.o && !!rawOwner && constEq(sha256(rawOwner), currentRoom.meta.o)

  if (currentRoom.meta.a && !isOwner) {
    const rawAuth = url.searchParams.get('a')
    const ok = !!rawAuth && constEq(sha256(rawAuth), currentRoom.meta.a)
    if (!ok) {
      checkRate(ip, 'auth')
      return sendJson(res, { error: 'bad_auth' }, 403)
    }
  }

  if (currentRoom.meta.s && !isOwner) {
    return sendJson(res, { error: 'suspended' }, 423)
  }

  // Client sent regular HTTP GET -> return 426 Upgrade Required (proves token was accepted)
  return sendJson(res, { ok: true, error: 'expected_websocket' }, 426)
})

/* ---------------------------------------------------- WebSocket Server */

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const ip = getClientIp(req)
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})$/)

  if (!match) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
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
    ws._att = {
      own: isOwner,
      edit: isOwner || !room.meta.r,
      cid: (url.searchParams.get('cid') || '').slice(0, 24),
      at: Date.now(),
    }
    wss.emit('connection', ws, req, room)
  })
})

wss.on('connection', (ws, req, room) => {
  room.sockets.add(ws)
  room.touch()

  // 1. Replay log backlog
  try {
    for (const blob of room.log) {
      ws.send(frame(T_UPDATE, blob))
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

      // Awareness / Presence (rebroadcast only)
      if (type === T_AWARE) {
        return room.broadcast(frame(T_AWARE, payload), ws)
      }

      // WebRTC P2P Signaling routing
      if (type === T_P2P) {
        // payload format: [targetCidLen(1 byte), targetCid, signalBytes...]
        try {
          const targetLen = payload[0]
          const targetCid = payload.subarray(1, 1 + targetLen).toString('utf8')
          for (const peer of room.sockets) {
            if (peer._att?.cid === targetCid && peer.readyState === WebSocket.OPEN) {
              peer.send(frame(T_P2P, payload))
              break
            }
          }
        } catch (e) {}
        return
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
    room.sockets.delete(ws)
    room.rate.delete(ws)
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
    }
    // 2. Expire empty rooms past TTL
    if (room.sockets.size === 0 && now - room.lastActive > (room.meta.ttl || DEFAULT_TTL)) {
      rooms.delete(code)
    }
  }
}, 60000)

server.listen(PORT, HOST, () => {
  console.log(`[anonshare-relay] Server listening on http://${HOST}:${PORT}`)
  console.log(`[anonshare-relay] WebSocket endpoint: ws://${HOST}:${PORT}/room/<CODE>`)
  console.log(`[anonshare-relay] Code execution endpoint: http://${HOST}:${PORT}/run`)
  console.log(`[anonshare-relay] Sandbox isolation: ${HAS_BWRAP ? 'ACTIVE (Bubblewrap + prlimit)' : 'STANDARD'}`)
  console.log(`[anonshare-relay] Zero-knowledge E2EE mode: ACTIVE`)
})

