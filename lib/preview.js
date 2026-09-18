/**
 * Split-screen preview and visual diff helpers.
 */
export function renderMarkdown(md) {
  if (!md) return ''
  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre class="md-code"><code class="language-${lang}">${code.trim()}</code></pre>`)
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>')
  for (let level = 6; level >= 1; level--) html = html.replace(new RegExp(`^${'#'.repeat(level)} (.*$)`, 'gim'), `<h${level}>$1</h${level}>`)
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^- \[x\] (.*$)/gim, '<li class="task-done"><input type="checkbox" checked disabled> $1</li>')
    .replace(/^- \[ \] (.*$)/gim, '<li class="task-todo"><input type="checkbox" disabled> $1</li>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/^---$/gim, '<hr>')
    .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
  return `<div class="md-rendered"><p>${html}</p></div>`
}

function safeChannel(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) }

export function buildStandaloneHtml(content = '', options = {}) {
  const isFullDoc = /<!doctype\s+html|<html[\s>]/i.test(content)
  const channel = safeChannel(options.channelId)
  const extraCss = options.extraCss ? `<style id="anon-injected-css">\n${options.extraCss}\n</style>` : ''
  const extraJs = options.extraJs ? `<script id="anon-injected-js">\n${options.extraJs}\n</script>` : ''
  const interceptors = `<script>
(function(){
  var channel=${JSON.stringify(channel)};
  window.addEventListener('error',function(e){
    var box=document.getElementById('anon-preview-error');
    if(!box){box=document.createElement('div');box.id='anon-preview-error';box.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;padding:8px 12px;background:rgba(239,68,68,.95);color:#fff;font:12px/1.4 monospace;border-radius:6px;z-index:999999;display:flex;gap:8px';document.body.appendChild(box)}
    box.replaceChildren();var text=document.createElement('span');text.textContent='⚠ '+(e.message||'Script error')+' (Line '+(e.lineno||'?')+')';var close=document.createElement('button');close.type='button';close.textContent='×';close.addEventListener('click',function(){box.remove()});box.append(text,close);
  });
  var levels=['log','warn','error'];levels.forEach(function(level){var original=console[level];console[level]=function(){var args=arguments;try{var text=Array.prototype.map.call(args,function(value){if(value===null)return 'null';if(value===undefined)return 'undefined';if(typeof value==='object'){try{return JSON.stringify(value)}catch(_){return Object.prototype.toString.call(value)}}return String(value)}).join(' ');window.parent.postMessage({type:'preview-console',channel:channel,level:level,text:text},'*')}catch(_){}if(original)original.apply(console,args)}});
})();
</script>`
  if (isFullDoc) {
    let result = content
    if (extraCss && !result.includes('anon-injected-css')) result = /<\/head>/i.test(result) ? result.replace(/<\/head>/i, `${extraCss}\n</head>`) : extraCss + result
    if (extraJs && !result.includes('anon-injected-js')) result = /<\/body>/i.test(result) ? result.replace(/<\/body>/i, `${extraJs}\n</body>`) : result + extraJs
    if (/<head>/i.test(result)) return result.replace(/<head>/i, `<head>\n${interceptors}`)
    if (/<html[\s>]/i.test(result)) return result.replace(/(<html[\s>][^>]*>)/i, `$1\n<head>${interceptors}</head>`)
    return `${interceptors}\n${result}`
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{font-family:system-ui,sans-serif;padding:16px;margin:0;color:#e4e4e7;background:#09090b;line-height:1.5}@media(prefers-color-scheme:light){body{color:#18181b;background:#fff}}</style>${extraCss}${interceptors}</head><body>${content}${extraJs}</body></html>`
}

export function updateHtmlPreview(iframe, htmlContent, options = {}) {
  if (!iframe) return
  const channelId = safeChannel(options.channelId) || crypto.getRandomValues(new Uint32Array(4)).join('-')
  iframe.dataset.previewChannel = channelId
  iframe.srcdoc = buildStandaloneHtml(htmlContent, { ...options, channelId })
  return channelId
}

export function isValidPreviewMessage(event, iframe) {
  const data = event?.data
  return Boolean(iframe && event.source === iframe.contentWindow && data && data.type === 'preview-console' && data.channel === iframe.dataset.previewChannel && ['log','warn','error'].includes(data.level) && typeof data.text === 'string' && data.text.length <= 10000)
}

export function computeDiff(oldText = '', newText = '') {
  const oldLines = oldText.split('\n'), newLines = newText.split('\n'), diff = []
  let i = 0, j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { diff.push({ type:'same', text:oldLines[i], oldLine:++i, newLine:++j }); continue }
    if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) { diff.push({ type:'add', text:newLines[j], newLine:++j }); continue }
    diff.push({ type:'del', text:oldLines[i], oldLine:++i })
  }
  return diff
}

export function renderVisualDiff(oldText, newText) {
  const escape = value => String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return `<div class="diff-container">${computeDiff(oldText,newText).map(item => { const sign=item.type==='add'?'+':item.type==='del'?'-':' ';return `<div class="diff-line diff-${item.type}"><span class="diff-marker">${sign}</span><span class="diff-content">${escape(item.text)||'&nbsp;'}</span></div>` }).join('')}</div>`
}
