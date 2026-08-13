)) ACTIONS[c[1]]()
  }
})
$('pal').addEventListener('click', e => { if (e.target === $('pal')) closePalette() })

/* ---------------------------------------------------------- cursor chat */

async function cursorChat() {
  const text = await ask({
    title: 'Say something at your cursor',
    body: 'Everyone sees it next to your cursor for a few seconds. It is not saved.',
    input: true, placeholder: 'is this bit right?',
    confirmLabel: 'Say it',
  })
  if (!text) return
  awareness.setLocalStateField('say', { text: text.slice(0, 80), ts: Date.now() })
  if (view) view.focus()
  setTimeout(() => awareness.setLocalStateField('say', null), 8200)
}

/* ------------------------------------------------------------ shortcuts */

addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('ask').hidden) return closeAsk(null)
    if (!$('pal').hidden) return closePalette()
    if (!$('modal').hidden) return $('mBack').click()
    setMenu(false)
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    if ($('app').hidden) return
    e.preventDefault()
    $('pal').hidden ? openPalette() : closePalette()
  }
  if (e.altKey && e.key === '/') {
    if ($('app').hidden) return
    e.preventDefault()
    cursorChat()
  }
})

/* ------------------------------------------------------- drag and drop */

;['dragover', 'drop'].forEach(ev => addEventListener(ev, e => {
  if ($('app').hidden) return
  e.preventDefault()
}))
addEventListener('drop', async e => {
  if ($('app').hidden || readOnlyNow()) return
  const list = [...(e.dataTransfer ? e.dataTransfer.files : [])].slice(0, 8)
  let last = null, added = 0
  for (const file of list) {
    if (file.size > 512 * 1024) { toast(file.name + ' is too large (512 KB max)'); continue }
    try { last = addFile(file.name.slice(0, 40), await file.text()); added++ } catch (err) {}
  }
  if (last) { openFile(last); toast('Imported ' + added + ' file' + (added === 1 ? '' : 's')) }
})

/* ---------------------------------------------------------------- misc */

function banner(msg, kind) {
  const b = $('banner')
  b.textContent = msg
  b.className = kind || ''
  b.hidden = false
  if (kind !== 'bad') setTimeout(() => { b.hidden = true }, 12000)
}

function paintCounts() {
  if (!view) return
  const d = view.state.doc
  const s = d.toString().trim()
  $('counts').textContent = d.lines + 'L ' + (s ? s.split(/\s+/).length : 0) + 'W ' + d.length + 'C'
}

addEventListener('hashchange', () => {
  const next = norm(location.hash.slice(1))
  if (next && next !== CODE) location.reload()
})

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}

// Arriving on an invite link goes straight to step two.
if (CODE.length === LEN && window.isSecureContext) {
  $('gCode').value = CODE
  tryJoin(CODE, null)
}
