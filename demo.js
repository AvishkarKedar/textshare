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

  // Positioned with `transform: translate3d(...)` instead of top/left so the
  // browser can composite these moves on the GPU rather than re-running
  // layout on every frame - this is what makes the flags/carets glide
  // smoothly instead of stepping, especially on phones.
  const flags = CAST.map(p => {
    const el = document.createElement('div')
    el.textContent = p.name
    el.style.cssText =
      'position:absolute;left:0;top:0;font:500 10px/14px var(--mono);color:#000;padding:0 5px;will-change:transform,opacity;' +
      'white-space:nowrap;opacity:0;transition:opacity .3s,transform .16s cubic-bezier(.22,.61,.36,1);background:' + p.color
    const bar = document.createElement('div')
    bar.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:17px;opacity:0;will-change:transform,opacity;transition:opacity .3s,transform .16s cubic-bezier(.22,.61,.36,1);background:' + p.color
    layer.append(bar, el)
    return { el, bar, p }
  })

  const full = SCRIPT.join('\n')
  let n = 0, stopped = false, raf, due = 0
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Clamp each flag to whatever line currently exists so the name/caret
  // appear from the very first frame and glide into their final spot as
  // more of the script is typed, instead of popping in only once their
  // target line has fully arrived.
  function placeFlags() {
    if (!view) return
    const doc = view.state.doc
    for (const f of flags) {
      const lineNo = Math.min(f.p.line + 1, doc.lines)
      const line = doc.line(lineNo)
      const pos = Math.min(line.from + Math.floor(line.length * f.p.at), line.to)
      let c
      try { c = view.coordsAtPos(pos) } catch (e) { c = null }
      if (!c) { f.el.style.opacity = '0'; f.bar.style.opacity = '0'; continue }
      const box = view.scrollDOM.getBoundingClientRect()
      // Rounding to whole pixels avoids sub-pixel jitter when the transform
      // is recomputed every frame while the panel is still settling.
      const left = Math.round(c.left - box.left), top = Math.round(c.top - box.top)
      f.bar.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)'
      f.el.style.transform = 'translate3d(' + left + 'px,' + Math.max(0, top - 15) + 'px,0)'
      f.bar.style.opacity = '1'
      f.el.style.opacity = '1'
    }
  }

  function schedule(delay) {
    due = performance.now() + delay
  }

  // Driven by requestAnimationFrame instead of setTimeout: it stays locked
  // to the browser's paint cycle (no drift, no sub-tick jank) and pauses
  // itself automatically in background tabs instead of burning CPU there.
  function tick(now) {
    if (stopped) return
    if (now >= due) {
      try {
        if (n <= full.length) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: full.slice(0, n) } })
          placeFlags()
          n += 1
          // Vary the cadence so it reads as a person, not a printer.
          const ch = full[n - 1]
          schedule(ch === '\n' ? 190 : 26 + Math.random() * 45)
        } else {
          n = 0
          schedule(3200)
        }
      } catch (e) {
        // Never let a transient dispatch/layout error permanently kill the
        // loop - just start the next pass instead of stalling forever.
        n = 0
        schedule(3200)
      }
    }
    raf = requestAnimationFrame(tick)
  }

  // Reduced motion still gets the demo - the finished script shown once,
  // instead of the typing animation, so the desktop panel is never left
  // empty while a phone (which rarely has this OS setting on) still animates.
  if (reduced) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: full } })
    placeFlags()
  } else {
    schedule(3200)
    raf = requestAnimationFrame(tick)
  }

  // On desktop the hero is a CSS grid whose column widths can keep
  // settling for a frame or two after fonts/layout finish (grid track
  // sizing, webfont swap, scrollbar reflow) - later than on the
  // single-column mobile layout. If placeFlags() runs before that
  // settles, coordsAtPos keeps landing off-panel and the flags/carets
  // never recover because nothing re-triggers them. A ResizeObserver on
  // the demo panel itself re-runs placeFlags() whenever its box actually
  // changes size, so desktop catches up instead of freezing.
  let ro
  try {
    ro = new ResizeObserver(() => placeFlags())
    ro.observe(parent)
  } catch (e) { ro = null }

  const onResize = () => placeFlags()
  addEventListener('resize', onResize)
  addEventListener('load', placeFlags)
  // requestAnimationFrame twice = "after the next paint has actually
  // happened", which is when late webfont/grid layout settles.
  requestAnimationFrame(() => requestAnimationFrame(placeFlags))

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    removeEventListener('resize', onResize)
    removeEventListener('load', placeFlags)
    if (ro) { try { ro.disconnect() } catch (e) {} }
    try { view.destroy() } catch (e) {}
  }
}
