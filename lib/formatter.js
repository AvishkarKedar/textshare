/**
 * Client-Side Code Formatter for AnonShare
 * Formats JSON, JS, HTML, CSS, Markdown directly in the browser.
 */

export function formatCode(code, lang = 'javascript') {
  if (!code || !code.trim()) return code
  const l = (lang || '').toLowerCase().trim()

  // 1. JSON
  if (l === 'json') {
    try {
      const parsed = JSON.parse(code)
      return JSON.stringify(parsed, null, 2)
    } catch (e) {
      return code
    }
  }

  // 2. JavaScript / TypeScript basic beautifier
  if (l === 'javascript' || l === 'js' || l === 'typescript' || l === 'ts') {
    return formatJsBasic(code)
  }

  // 3. HTML / XML
  if (l === 'html' || l === 'xml') {
    return formatHtmlBasic(code)
  }

  // 4. CSS
  if (l === 'css') {
    return formatCssBasic(code)
  }

  return code
}

function formatJsBasic(source) {
  const lines = source.split('\n')
  let indent = 0
  const out = []

  for (let line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push('')
      continue
    }

    if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
      indent = Math.max(0, indent - 1)
    }

    out.push('  '.repeat(indent) + trimmed)

    const opens = (trimmed.match(/[{[(]/g) || []).length
    const closes = (trimmed.match(/[}\])]/g) || []).length
    indent = Math.max(0, indent + opens - closes)
  }

  return out.join('\n')
}

function formatCssBasic(source) {
  let s = source.replace(/\s+/g, ' ').trim()
  s = s.replace(/\{\s*/g, ' {\n  ').replace(/;\s*/g, ';\n  ').replace(/\s*\}\s*/g, '\n}\n\n')
  return s.replace(/\n\s*\n\s*\n/g, '\n\n').trim()
}

function formatHtmlBasic(source) {
  let formatted = ''
  let indent = 0
  const pad = () => '  '.repeat(indent)

  source.split(/>\s*</).forEach(node => {
    if (node.match(/^\/\w/)) indent = Math.max(0, indent - 1)
    formatted += (formatted ? '\n' : '') + pad() + '<' + node + '>'
    if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith('input') && !node.startsWith('img') && !node.startsWith('br') && !node.startsWith('hr') && !node.startsWith('meta') && !node.startsWith('link')) {
      indent++
    }
  })

  return formatted.replace(/^<</, '<').replace(/>>$/, '>')
}
