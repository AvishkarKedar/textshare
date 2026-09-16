import { describe, it, expect, beforeEach } from 'vitest'
import { detectLanguage } from '../lib/detector.js'
import { parseErrorPositions } from '../lib/runner.js'
import { computeDiff, renderVisualDiff } from '../lib/preview.js'
import { getBookmarks, saveBookmark, removeBookmark, clearBookmarks } from '../lib/bookmarks.js'

describe('Auto-Language Detector', () => {
  it('detects Python via shebang or syntax', () => {
    expect(detectLanguage('#!/usr/bin/env python3\nprint(1)')).toBe('python')
    expect(detectLanguage('def calculate(x):\n    return x * 2')).toBe('python')
  })

  it('detects C and C++', () => {
    expect(detectLanguage('#include <stdio.h>\nint main() { return 0; }')).toBe('c')
    expect(detectLanguage('#include <iostream>\nint main() { std::cout << 1; }')).toBe('cpp')
  })

  it('detects Golang and Rust', () => {
    expect(detectLanguage('package main\nfunc main() {}')).toBe('go')
    expect(detectLanguage('fn main() {\n    println!("hello");\n}')).toBe('rust')
  })

  it('detects JavaScript and HTML', () => {
    expect(detectLanguage('const add = (a, b) => a + b;\nexport default add;')).toBe('javascript')
    expect(detectLanguage('<!DOCTYPE html>\n<html><body>Hi</body></html>')).toBe('html')
  })
})

describe('Compiler Error Line Parser', () => {
  it('extracts Python traceback lines', () => {
    const stderr = 'Traceback (most recent call last):\n  File "script.py", line 4, in <module>\nZeroDivisionError: division by zero'
    const res = parseErrorPositions(stderr, 'python')
    expect(res.length).toBe(1)
    expect(res[0].line).toBe(4)
  })

  it('extracts GCC / Clang line and column numbers', () => {
    const stderr = 'main.c:15:8: error: expected \';\' before \'return\''
    const res = parseErrorPositions(stderr, 'c')
    expect(res.length).toBe(1)
    expect(res[0].line).toBe(15)
    expect(res[0].column).toBe(8)
  })
})

describe('Visual Diff Engine', () => {
  it('detects line additions and deletions', () => {
    const diff = computeDiff('line1\nline2', 'line1\nline2_modified\nline3')
    expect(diff.some(d => d.type === 'del')).toBe(true)
    expect(diff.some(d => d.type === 'add')).toBe(true)
  })

  it('renders colorized diff HTML', () => {
    const html = renderVisualDiff('old line', 'new line')
    expect(html).toContain('diff-del')
    expect(html).toContain('diff-add')
  })
})

describe('Recent Rooms & Bookmarks', () => {
  beforeEach(() => {
    clearBookmarks()
  })

  it('saves and retrieves bookmarks', () => {
    saveBookmark({ code: 'ABCD12', role: 'owner', language: 'python' })
    const list = getBookmarks()
    expect(list.length).toBe(1)
    expect(list[0].code).toBe('ABCD12')
    expect(list[0].role).toBe('owner')
  })

  it('removes specific bookmarks', () => {
    saveBookmark({ code: 'ABCD12', role: 'owner' })
    saveBookmark({ code: 'WXYZ99', role: 'peer' })
    removeBookmark('ABCD12')
    const list = getBookmarks()
    expect(list.length).toBe(1)
    expect(list[0].code).toBe('WXYZ99')
  })
})

describe('Inactivity Countdown Formatter', () => {
  function formatCountdown(remainSec) {
    const m = Math.floor(remainSec / 60)
    const s = remainSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  it('formats remaining seconds into MM:SS correctly', () => {
    expect(formatCountdown(300)).toBe('05:00')
    expect(formatCountdown(299)).toBe('04:59')
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(9)).toBe('00:09')
    expect(formatCountdown(0)).toBe('00:00')
  })
})
