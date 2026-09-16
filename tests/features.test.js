import { describe, it, expect } from 'vitest'
import { formatCode } from '../lib/formatter.js'
import { renderMarkdown } from '../lib/preview.js'

describe('formatCode', () => {
  it('prettifies valid JSON', () => {
    const raw = '{"a":1,"b":[2,3]}'
    const formatted = formatCode(raw, 'json')
    expect(formatted).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
  })

  it('indents javascript blocks', () => {
    const raw = 'function test() {\nconst x = 1;\nreturn x;\n}'
    const formatted = formatCode(raw, 'javascript')
    expect(formatted).toContain('  const x = 1;')
  })

  it('formats basic css rules', () => {
    const raw = 'body{color:red;margin:0;}'
    const formatted = formatCode(raw, 'css')
    expect(formatted).toContain('color:red;')
    expect(formatted).toContain('margin:0;')
  })
})

describe('renderMarkdown', () => {
  it('converts markdown headers to HTML tags', () => {
    const md = '# Title\n## Subtitle'
    const html = renderMarkdown(md)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<h2>Subtitle</h2>')
  })

  it('renders code blocks correctly', () => {
    const md = '```javascript\nconsole.log(42)\n```'
    const html = renderMarkdown(md)
    expect(html).toContain('<pre class="md-code"><code class="language-javascript">console.log(42)</code></pre>')
  })

  it('escapes script tags to prevent XSS', () => {
    const md = '<script>alert(1)</script>'
    const html = renderMarkdown(md)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
