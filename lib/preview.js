/**
 * Split Screen & Live Preview Engine for AnonShare
 * Supports live Markdown rendering and sandboxed HTML/CSS/JS preview.
 */

export function renderMarkdown(md) {
  if (!md) return ''
  let html = md
    // Escape HTML tags to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks ```lang ... ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="md-code"><code class="language-${lang}">${code.trim()}</code></pre>`
  })

  // Inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>')

  // Headers # to ######
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>')
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>')
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>')
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

  // Blockquotes >
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')

  // Bold **text** and Italic *text*
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Task lists
  html = html.replace(/^- \[x\] (.*$)/gim, '<li class="task-done"><input type="checkbox" checked disabled> $1</li>')
  html = html.replace(/^- \[ \] (.*$)/gim, '<li class="task-todo"><input type="checkbox" disabled> $1</li>')

  // Unordered lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr>')

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
  return `<div class="md-rendered"><p>${html}</p></div>`
}

export function buildStandaloneHtml(content = '', options = {}) {
  const isFullDoc = /<!doctype\s+html|<html[\s>]/i.test(content)
  const extraCss = options.extraCss ? `<style id="anon-injected-css">\n${options.extraCss}\n</style>` : ''
  const extraJs = options.extraJs ? `<script id="anon-injected-js">\n${options.extraJs}\n</script>` : ''

  const errorInterceptor = `
    <script>
      window.addEventListener('error', function(e) {
        var errBox = document.getElementById('anon-preview-error');
        if (!errBox) {
          errBox = document.createElement('div');
          errBox.id = 'anon-preview-error';
          errBox.style.cssText = 'position:fixed;bottom:8px;left:8px;right:8px;padding:8px 12px;background:rgba(239,68,68,0.95);color:#fff;font:12px/1.4 monospace;border-radius:6px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:space-between;';
          document.body.appendChild(errBox);
        }
        errBox.innerHTML = '<span>&#9888;&#65039; ' + (e.message || 'Script error') + ' (Line ' + (e.lineno || '?') + ')</span><button onclick="this.parentNode.remove()" style="background:none;border:none;color:#fff;font-weight:bold;cursor:pointer;padding:0 4px;">&times;</button>';
      });
    </script>
  `

  if (isFullDoc) {
    let result = content
    if (extraCss && !result.includes('anon-injected-css')) {
      result = result.replace(/<\/head>/i, `${extraCss}\n</head>`)
      if (result === content) result = extraCss + result
    }
    if (extraJs && !result.includes('anon-injected-js')) {
      result = result.replace(/<\/body>/i, `${extraJs}\n</body>`)
      if (result === content) result = result + extraJs
    }
    return result.replace(/<head>/i, `<head>\n${errorInterceptor}`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 16px;
      margin: 0;
      color: #e4e4e7;
      background: #09090b;
      line-height: 1.5;
    }
    @media (prefers-color-scheme: light) {
      body { color: #18181b; background: #ffffff; }
    }
  </style>
  ${extraCss}
  ${errorInterceptor}
</head>
<body>
  ${content}
  ${extraJs}
</body>
</html>`
}

export function updateHtmlPreview(iframe, htmlContent, options = {}) {
  if (!iframe) return
  iframe.srcdoc = buildStandaloneHtml(htmlContent, options)
}

/**
 * Line-by-line Visual Diff Engine for Time Machine & Snapshots
 */
export function computeDiff(oldText = '', newText = '') {
  const oldLines = (oldText || '').split('\n')
  const newLines = (newText || '').split('\n')
  const diff = []

  let i = 0, j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({ type: 'same', text: oldLines[i], oldLine: i + 1, newLine: j + 1 })
      i++
      j++
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) {
      diff.push({ type: 'add', text: newLines[j], newLine: j + 1 })
      j++
    } else if (i < oldLines.length) {
      diff.push({ type: 'del', text: oldLines[i], oldLine: i + 1 })
      i++
    }
  }

  return diff
}

export function renderVisualDiff(oldText, newText) {
  const diff = computeDiff(oldText, newText)
  const escape = str => (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  let html = '<div class="diff-container">'
  for (const item of diff) {
    const cls = item.type === 'add' ? 'diff-line diff-add' : item.type === 'del' ? 'diff-line diff-del' : 'diff-line diff-same'
    const sign = item.type === 'add' ? '+' : item.type === 'del' ? '-' : ' '
    html += `<div class="${cls}"><span class="diff-marker">${sign}</span><span class="diff-content">${escape(item.text) || '&nbsp;'}</span></div>`
  }
  html += '</div>'
  return html
}

