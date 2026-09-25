import { describe, it, expect } from 'vitest'
import { detectLanguage, extToLang } from '../src/lib/detect'
import { SHORTCUTS, SLASH_COMMANDS } from '../src/lib/store'

describe('language detection', () => {
  it('detects Python from shebang and syntax', () => {
    expect(detectLanguage('#!/usr/bin/env python3\nprint(1)').language).toBe('python')
    expect(detectLanguage('def main():\n    return 0').language).toBe('python')
  })

  it('detects JavaScript from syntax', () => {
    expect(detectLanguage('const x = 1; console.log(x);').language).toBe('javascript')
    expect(detectLanguage('function hello() { return "hi"; }').language).toBe('javascript')
  })

  it('detects C and C++ from includes', () => {
    expect(detectLanguage('#include <stdio.h>\nint main(){}').language).toBe('c')
    expect(detectLanguage('#include <iostream>\nint main(){}').language).toBe('cpp')
  })

  it('maps file extensions to languages', () => {
    expect(extToLang('main.py')).toBe('python')
    expect(extToLang('index.html')).toBe('html')
    expect(extToLang('script.js')).toBe('javascript')
    expect(extToLang('style.css')).toBe('css')
  })
})

describe('shortcut + slash command registry', () => {
  it('shortcuts are unique and labelled', () => {
    const keys = SHORTCUTS.map((s) => s.keys)
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of SHORTCUTS) {
      expect(s.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('slash commands reference live features only', () => {
    const removed = ['/whiteboard', '/voice', '/test', '/rooms']
    const triggers = SLASH_COMMANDS.map((c) => c.trigger)
    for (const gone of removed) {
      expect(triggers).not.toContain(gone)
    }
    expect(triggers).toContain('/run')
    expect(triggers).toContain('/help')
  })

  it('slash command triggers are unique', () => {
    const triggers = SLASH_COMMANDS.map((c) => c.trigger)
    expect(new Set(triggers).size).toBe(triggers.length)
  })
})
