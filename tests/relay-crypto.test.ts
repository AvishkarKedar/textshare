import { describe, it, expect } from 'vitest'
import { newRoomCode, deriveRoomKeys, TTLS, PBKDF2_ROUNDS, SALT_KEY, SALT_AUTH } from '../src/lib/relay'

describe('room codes', () => {
  it('generates 6-char codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = newRoomCode()
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
      expect(code).not.toMatch(/[0O1I]/) // no ambiguous glyphs
    }
  })

  it('codes are unique enough for short bursts (collision-resistant)', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newRoomCode()))
    expect(seen.size).toBeGreaterThan(480)
  })
})

describe('room key derivation (the real crypto contract)', () => {
  it('uses PBKDF2-SHA256 at 600k rounds with two distinct salts', () => {
    expect(PBKDF2_ROUNDS).toBe(600_000)
    expect(SALT_KEY).not.toBe(SALT_AUTH)
  })

  it('derives a deterministic AES-GCM key and auth token for a room', async () => {
    const a = await deriveRoomKeys('ABC234', '')
    const b = await deriveRoomKeys('ABC234', '')
    const c = await deriveRoomKeys('ABC234', 'hunter2')
    expect(a.key).toBeTruthy()
    expect(a.auth).toBeTruthy()
    // same inputs → same outputs (peers converge on the same key)
    expect(a.auth).toBe(b.auth)
    // different password → completely different auth token
    expect(a.auth).not.toBe(c.auth)
  })

  it('produces url-safe auth tokens', async () => {
    const { auth } = await deriveRoomKeys('XYZ789', '')
    expect(auth).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('accepts the three documented TTLs', () => {
    expect([...TTLS]).toEqual(['10m', '1h', '24h'])
  })
})
