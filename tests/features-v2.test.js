import { describe, it, expect } from 'vitest'
import { renderMarkdown, renderLatex } from '../lib/preview.js'
import { computeCrc32, createZipArchive } from '../lib/file-sharing.js'
import { parseErrorPositions } from '../lib/runner.js'

describe('Feature 6: LaTeX Math in Markdown Preview', () => {
  it('renders inline math with $...$ delimiters', () => {
    const md = 'The mass-energy formula is $E=mc^2$.'
    const html = renderMarkdown(md)
    expect(html).toContain('math-inline')
    expect(html).toContain('E=mc^2')
  })

  it('renders display math with $$...$$ delimiters', () => {
    const md = '$$\\int_0^1 x^2 dx = \\frac{1}{3}$$'
    const html = renderMarkdown(md)
    expect(html).toContain('math-block')
    expect(html).toContain('\\int_0^1 x^2 dx = \\frac{1}{3}')
  })

  it('preserves code blocks and math blocks without collision', () => {
    const md = '```python\nprint("$100")\n```\nFormula: $a^2 + b^2 = c^2$'
    const html = renderMarkdown(md)
    expect(html).toContain('<pre class="md-code">')
    expect(html).toContain('print("$100")')
    expect(html).toContain('math-inline')
  })
})

describe('Feature 9: Pure Client-Side ZIP Archive Generator', () => {
  it('computes valid CRC-32 checksums', () => {
    const text = 'Hello, anonshare!'
    const crc = computeCrc32(text)
    expect(typeof crc).toBe('number')
    expect(crc).toBeGreaterThan(0)
  })

  it('generates a valid ZIP Blob containing multiple files', async () => {
    const files = [
      { name: 'main.py', data: 'print("Hello World")\n' },
      { name: 'notes.txt', data: 'Shared notes for room\n' },
    ]
    const zipBlob = await createZipArchive(files)
    expect(zipBlob).toBeDefined()
    expect(zipBlob.size).toBeGreaterThan(100)
    expect(zipBlob.type).toBe('application/zip')

    const buf = new Uint8Array(await zipBlob.arrayBuffer())
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)
  })
})

describe('Feature 10: Compiler Error Positions Parsing', () => {
  it('parses Python syntax errors and line numbers', () => {
    const stderr = 'File "solution.py", line 14, in <module>\n    print(x\nSyntaxError: unexpected EOF'
    const positions = parseErrorPositions(stderr, 'python')
    expect(positions.length).toBeGreaterThan(0)
    expect(positions[0].line).toBe(14)
  })

  it('parses C/C++ compiler error positions', () => {
    const stderr = 'solution.cpp:25:10: error: expected \';\' before \'return\''
    const positions = parseErrorPositions(stderr, 'cpp')
    expect(positions.length).toBeGreaterThan(0)
    expect(positions[0].line).toBe(25)
    expect(positions[0].column).toBe(10)
  })
})
