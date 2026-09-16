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

export function updateHtmlPreview(iframe, htmlContent) {
  if (!iframe) return
  iframe.srcdoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; margin: 0; color: #333; }
          @media (prefers-color-scheme: dark) {
            body { color: #eee; background: #111; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `
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

