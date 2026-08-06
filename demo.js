/**
 * The landing page demo.
 *
 * A real CodeMirror instance typing itself out with two collaborators, so the
 * front page shows what the product does instead of describing it. Entirely
 * self-contained: no shared state with app.js, and if it throws, the gate
 * still works.
 */

import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const HL = HighlightStyle.define([
  { tag: [t.comment, t.lineComment], color: '#5c6370', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: '#c792ea' },
  { tag: [t.string, t.special(t.string)], color: '#3ddc84' },
  { tag: [t.number, t.bool, t.null], color: '#ffb347' },
  { tag: [t.function(t.variableName)], color: '#4c8dff' },
  { tag: [t.propertyName], color: '#4fd6d2' },
  { tag: [t.typeName, t.className], color: '#e8d44d' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#7c8391' },
])

const SCRIPT = [
  'function shareRoom(code) {',
  '  const key = deriveKey(code, password)',
  '  // the relay never sees this',
  '  return encrypt(document, key)',
  '}',
]

// The cast, with their cursors parked on given lines.
const CAST = [
  { name: 'Avishkar', color: '#3ddc84', line: 1, at: 0.62 },
  { name: 'Lazarus', color: '#c792ea', line: 3, at: 0.30 },
]

export function runDemo(parent) {
  let view
  try {
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          syntaxHighlighting(HL, { fallback: true }),
        ],
      }),
    })
  } catch (e) { return () => {} }

  const layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4'
  parent.appendChild(layer)

  const flags = CAST.map(p => {
    const el = document.createElement('div')
    el.textContent = p.name
    el.style.cssText =
      'position:absolute;font:500 10px/14px var(--mono);color:#000;padding:0 5px;' +
      'white-space:nowrap;opacity:0;transition:opacity .3s,top .18s,left .18s;background:' + p.color
    const bar = document.createElement('div')
    bar.style.cssText = 'position:absolute;width:2px;height:17px;opacity:0;transition:opacity .3s,top .18s,left .18s;background:' + p.color
    layer.append(bar, el)
    return { el, bar, p }
  })

  const full = SCRIPT.join('\n')
  let n = 0, stopped = false, timer
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  function placeFlags() {
    const doc = view.state.doc
    for (const f of flags) {
      const lineNo = f.p.line + 1
      if (lineNo > doc.lines) { f.el.style.opacity = '0'; f.bar.style.opacity = '0'; continue }
      const line = doc.line(lineNo)
      const pos = Math.min(line.from + Math.floor(line.length * f.p.at), line.to)
      let c
      try { c = view.coordsAtPos(pos) } catch (e) { c = null }
      if (!c) { f.el.style.opacity = '0'; f.bar.style.opacity = '0'; continue }
      const box = view.scrollDOM.getBoundingClientRect()
      const left = c.left - box.left, top = c.top - box.top
      f.bar.style.left = left + 'px'
      f.bar.style.top = top + 'px'
      f.el.style.left = left + 'px'
      f.el.style.top = Math.max(0, top - 15) + 'px'
      f.bar.style.opacity = '1'
      f.el.style.opacity = '1'
    }
  }

  function step() {
    if (stopped) return
    if (n <= full.length) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: full.slice(0, n) } })
      placeFlags()
      n += 1
      // Vary the cadence so it reads as a person, not a printer.
      const ch = full[n - 1]
      timer = setTimeout(step, ch === '\n' ? 190 : 26 + Math.random() * 45)
    } else {
      timer = setTimeout(() => { n = 0; step() }, 3200)
    }
  }

  // Reduced motion still gets the demo - the finished script shown once,
  // instead of the typing animation, so the desktop panel is never left
  // empty while a phone (which rarely has this OS setting on) still animates.
  if (reduced) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: full } })
    placeFlags()
  } else {
    step()
  }
  const onResize = () => placeFlags()
  addEventListener('resize', onResize)

  return () => {
    stopped = true
    clearTimeout(timer)
    removeEventListener('resize', onResize)
    try { view.destroy() } catch (e) {}
  }
}
