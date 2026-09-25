import { describe, it, expect } from 'vitest'
import { detectLanguage, extToLang, langToExt } from '../src/lib/detect'
import { SHORTCUTS, SLASH_COMMANDS } from '../src/lib/store'
import { sanitizeName, guestHandle, isNamed, NAME_MAX } from '../src/lib/identity'

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
    expect(extToLang('data.json')).toBe('json')
    expect(extToLang('readme.md')).toBe('markdown')
    expect(extToLang('app.go')).toBe('go')
    expect(extToLang('lib.rs')).toBe('rust')
    expect(extToLang('unknown.xyz')).toBe('text')
  })

  it('maps languages back to file extensions', () => {
    expect(langToExt('python')).toBe('py')
    expect(langToExt('javascript')).toBe('js')
    expect(langToExt('typescript')).toBe('ts')
    expect(langToExt('c')).toBe('c')
    expect(langToExt('cpp')).toBe('cpp')
    expect(langToExt('html')).toBe('html')
    expect(langToExt('markdown')).toBe('md')
  })

  it('handles empty or short input safely', () => {
    expect(detectLanguage('').language).toBe('text')
    expect(detectLanguage('   ').language).toBe('text')
    expect(detectLanguage('abc').language).toBe('text')
  })

  it('detects Go and Rust from syntax signatures', () => {
    expect(detectLanguage('package main\nimport "fmt"\nfunc main() { fmt.Println("hi") }').language).toBe('go')
    expect(detectLanguage('fn main() {\n    let mut x = 5;\n    println!("{}", x);\n}').language).toBe('rust')
  })

  it('detects HTML, Markdown, and SQL', () => {
    expect(detectLanguage('<!DOCTYPE html>\n<html><body><h1>Hello</h1></body></html>').language).toBe('html')
    expect(detectLanguage('# Main Title\n\n> Quote text\n- item 1\n- item 2').language).toBe('markdown')
    expect(detectLanguage('SELECT * FROM users WHERE active = 1;').language).toBe('sql')
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

describe('identity — names, guest handles, "who is who"', () => {
  it('sanitizes names: trims, collapses whitespace, caps length', () => {
    expect(sanitizeName('  Ada   Lovelace  ')).toBe('Ada Lovelace')
    expect(sanitizeName('   ')).toBe('')
    expect(sanitizeName('x'.repeat(60)).length).toBe(NAME_MAX)
    expect(sanitizeName('a\n\tb')).toBe('a b')
  })

  it('guest handles are non-empty, slug-shaped and never "you"', () => {
    for (let i = 0; i < 50; i++) {
      const h = guestHandle()
      expect(h).toMatch(/^[a-z]+-[a-z]+-\d{2}$/)
      expect(h).not.toBe('you')
      expect(isNamed(h)).toBe(true)
    }
  })

  it('isNamed rejects the legacy useless default "you"', () => {
    expect(isNamed('you')).toBe(false)
    expect(isNamed('')).toBe(false)
    expect(isNamed(undefined)).toBe(false)
    expect(isNamed(null)).toBe(false)
    expect(isNamed('Avishkar')).toBe(true)
  })
})
