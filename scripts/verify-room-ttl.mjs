#!/usr/bin/env node
/**
 * Room-TTL persistence verification against a live relay.
 *
 * Empirically proves the two claims the owner asked about:
 *   1. A room survives its full TTL with ZERO connections after creation
 *      (Durable Object storage + creation-time alarm; no code path deletes
 *      an empty room early — /exists reads metadata without touching).
 *   2. A room is actually erased after its TTL of inactivity (no leak).
 *
 * Uses the shortest TTL (10m) for a fast cycle, plus a 24h room spot-checked
 * at every poll (it must never flip during the test window).
 *
 * Usage: node scripts/verify-room-ttl.mjs [relay-origin]
 *        (default: https://textshare-sync.avishkarkedar.workers.dev)
 */
const RELAY = process.argv[2] || 'https://textshare-sync.avishkarkedar.workers.dev'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const mkCode = (n = 6) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
const log = (...a) => console.log(new Date().toISOString(), ...a)

const A = mkCode() // 10m TTL — must expire ~10m after creation
const B = mkCode() // 24h TTL — must stay alive across the whole test

async function create(c, ttl) {
  const res = await fetch(`${RELAY}/room/${c}?create=1&ttl=${ttl}`, { method: 'POST' })
  log(`create ${c} ttl=${ttl} -> HTTP ${res.status}`)
  return res.status === 426
}

async function exists(c) {
  try {
    const res = await fetch(`${RELAY}/room/${c}/exists`, { cache: 'no-store' })
    const body = await res.json()
    return body && !!body.exists
  } catch {
    return null
  }
}

const t0 = Date.now()
if (!(await create(A, '10m'))) { console.error('FAIL: 10m room not created'); process.exit(1) }
if (!(await create(B, '24h'))) { console.error('FAIL: 24h room not created'); process.exit(1) }

let aDiedAt = null
let bEverDead = false
const POLL_MS = 30_000
const RUN_MS = 13 * 60_000

while (Date.now() - t0 < RUN_MS) {
  await new Promise((r) => setTimeout(r, POLL_MS))
  const min = ((Date.now() - t0) / 60000).toFixed(1)
  const [a, b] = await Promise.all([exists(A), exists(B)])
  if (b === false) bEverDead = true
  if (a === false && aDiedAt === null) aDiedAt = Date.now() - t0
  log(`t+${min}min  A(10m)=${a}  B(24h)=${b}${aDiedAt ? `  [A expired at +${(aDiedAt / 60000).toFixed(1)}min]` : ''}`)
  // once A is confirmed dead, one extra minute of B spot-checks, then stop
  if (aDiedAt !== null && Date.now() - (t0 + aDiedAt) > 60_000) break
}

const diedMin = aDiedAt === null ? null : aDiedAt / 60000
const ok =
  aDiedAt !== null && diedMin >= 9.5 && diedMin <= 12.5 && !bEverDead
log(
  ok
    ? 'VERDICT: PASS — room idle-persistent for full TTL, expired on schedule, 24h room alive'
    : `VERDICT: ${aDiedAt === null ? 'INCOMPLETE — 10m room never expired within window' : 'FAIL — expiry outside expected window'} (A died at ${diedMin === null ? 'never' : diedMin.toFixed(1) + ' min'}; B ever dead: ${bEverDead})`,
)
process.exit(ok ? 0 : 2)
