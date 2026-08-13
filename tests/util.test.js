import { describe, it, expect } from 'vitest'
import { norm, cleanHost, safeColor, safeName, initials, sniff } from '../lib/util.js'

describe('norm', () => {
  it('uppercases, strips non-alphanumerics, and caps length', () => {
    expect(norm('ab-3d!ef99')).toBe('AB3DEF')
  })
  it('handles empty input', () => {
    expect(norm(null)).toBe('')
  })
})

describe('cleanHost', () => {
  it('strips protocol and trailing slashes', () => {
    expect(cleanHost('https://relay.example.com/')).toBe('relay.example.com')
    expect(cleanHost('wss://relay.example.com')).toBe('relay.example.com')
  })
})

describe('safeColor', () => {
  it('accepts valid hex colors', () => {
    expect(safeColor('#4c8dff')).toBe('#4c8dff')
  })
  it('falls back on invalid input', () => {
    expect(safeColor('not-a-color')).toBe('#4c8dff')
    expect(safeColor(undefined)).toBe('#4c8dff')
  })
})

describe('safeName', () => {
  it('truncates to 24 chars and falls back to anon', () => {
    expect(safeName('')).toBe('anon')
    expect(safeName('a'.repeat(40)).length).toBe(24)
  })
})

describe('initials', () => {
  it('builds initials from first and last name', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
  })
  it('handles a single name', () => {
    expect(initials('Ada')).toBe('A')
  })
})

describe('sniff', () => {
  it('detects JSON', () => {
    expect(sniff('{"a":1}')).toBe('json')
  })
  it('detects javascript', () => {
    expect(sniff('const x = () => 1')).toBe('javascript')
  })
  it('returns null for ambiguous text', () => {
    expect(sniff('hello there')).toBe(null)
  })
})
