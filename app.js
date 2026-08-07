import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { IndexeddbPersistence } from 'y-indexeddb'
import { EditorState, Compartment, StateField, StateEffect, RangeSet, RangeSetBuilder } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars,
  gutter, GutterMarker
} from '@codemirror/view'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search'
import {
  bracketMatching, indentOnInput, foldGutter, foldKeymap, indentUnit,
  syntaxHighlighting, HighlightStyle, StreamLanguage
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { yCollab, yUndoManagerKeymap, ySyncAnnotation } from 'y-codemirror.next'

window.__ts_booted = true

/* ================================================================ basics */

const $ = id => document.getElementById(id)
const QS = new URLSearchParams(location.search)
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  del(k) { try { localStorage.removeItem(k) } catch (e) {} },
}

// The relay keeps its deployed hostname. Renaming the app does not rename a
// running Worker, and pointing at a host that does not exist would break every
// existing invite link. Nothing about the relay is shown or editable in the
// UI; a ?relay= query param remains for advanced/self-hosted use only.
const DEFAULT_RELAY = 'textshare-sync.avishkarkedar.workers.dev'
const CONTACT = 'avishkarkedar+text@gmail.com'
const AL = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const LEN = 6
const VIEW_ONLY = QS.get('view') === '1'
const IDLE_AFTER = 60000
const PBKDF2_ROUNDS = 200000
const CHAT_MAX = 400, CHAT_KEEP = 300

const PALETTE = ['#4c8dff', '#3ddc84', '#ffb347', '#c792ea', '#ff87b5', '#4fd6d2', '#ff6b5b', '#e8d44d']

const T_UPDATE = 0, T_AWARE = 1, T_SNAPSHOT = 2, T_SYNCED = 3,
      T_ERROR = 4, T_COMPACT = 5, T_STATE = 6, T_KILLED = 7, T_GRANT = 8

const norm = v => (v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, LEN)
const cleanHost = v => (v || '').trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
const relayHost = () => cleanHost(QS.get('relay') || LS.get('ts.relay', '') || DEFAULT_RELAY)

// Names and colours arrive from other clients, so treat both as hostile.
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#4c8dff')
const safeName = n => String(n == null ? '' : n).slice(0, 24) || 'anon'

function newCode() {
  const a = new Uint8Array(LEN)
  crypto.getRandomValues(a)
  let s = ''
  for (let i = 0; i < LEN; i++) s += AL[a[i] % AL.length]
  return s
}

function initials(n) {
  const p = safeName(n).trim().split(/\s+/)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}

let toastTimer
function toast(msg) {
  const el = $('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400)
}

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label + ' copied') }
  catch (e) { toast(text) }
}

function shake(el) {
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
  setTimeout(() => el.classList.remove('shake'), 400)
}

const sheetOf = id => $(id).querySelector('.sheet')

/* ================================================== in-app ask dialog */

/**
 * Replaces window.confirm and window.prompt.
 *
 * Native dialogs are not just ugly here: several in-app browsers suppress
 * them outright, so "Delete room" would silently do nothing at all.
 */
let askResolve = null, askState = null, lastFocus = null

function ask(opts) {
  return new Promise(resolve => {
    askResolve = resolve
    askState = { input: !!opts.input, mustType: opts.mustType || null }

    $('askTitle').textContent = opts.title
    $('askBody').textContent = opts.body || ''
    $('askBody').hidden = !opts.body

    const inp = $('askIn')
    inp.hidden = !opts.input
    inp.value = opts.value || ''
    inp.placeholder = opts.placeholder || ''
    inp.classList.remove('bad')

    $('askErr').hidden = true
    const yes = $('askYes')
    yes.textContent = opts.confirmLabel || 'Confirm'
    yes.className = 'btn grow ' + (opts.danger ? 'danger' : 'primary')

    lastFocus = document.activeElement
    $('ask').hidden = false
    setTimeout(() => (opts.input ? inp : yes).focus(), 40)
  })
}

function closeAsk(value) {
  $('ask').hidden = true
  const r = askResolve
  askResolve = null
  askState = null
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus() } catch (e) {} }
  if (r) r(value)
}

function askErr(msg) {
  $('askErr').textContent = msg
  $('askErr').hidden = false
  $('askIn').classList.add('bad')
  shake(sheetOf('ask'))
}

$('askNo').onclick = () => closeAsk(null)
$('askYes').onclick = () => {
  if (!askState) return
  if (!askState.input) return closeAsk(true)
  const v = $('askIn').value.trim()
  if (!v) return askErr('This cannot be empty.')
  if (askState.mustType && norm(v) !== askState.mustType) return askErr('That does not match. Nothing has been changed.')
  closeAsk(v)
}
$('askIn').addEventListener('input', () => {
  $('askIn').classList.remove('bad')
  $('askErr').hidden = true
})
$('askIn').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('askYes').click() }
})
$('ask').addEventListener('click', e => { if (e.target === $('ask')) closeAsk(null) })

/* ============================================================== theming */

// A theme is either "dark" or "light" - nothing in the UI shows or tracks a
// third "system" state. The very first visit picks one to match the OS,
// then remembers that explicit choice from then on.
function themePref() {
  const saved = LS.get('ts.theme', '')
  if (saved === 'dark' || saved === 'light') return saved
  const guess = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  LS.set('ts.theme', guess)
  return guess
}
const resolved = () => themePref()

function applyTheme() {
  const r = resolved()
  document.documentElement.dataset.theme = r
  const meta = document.querySelector('meta[name=theme-color]')
  if (meta) meta.content = r === 'dark' ? '#000000' : '#ffffff'
  if ($('themeVal')) $('themeVal').textContent = r
  paintThemeSeg(r)
  if (view) view.dispatch({ effects: themeComp.reconfigure(highlightFor(r)) })
}

function applyEdFont() {
  document.documentElement.style.setProperty('--edfont', edFont + 'px')
  if ($('edFont')) $('edFont').value = String(edFont)
}

// Settings-panel segmented control mirrors the existing "More" menu theme
// toggle, so switching themes has a real, always-visible control instead of
// only a one-line menu entry buried under "More".
function paintThemeSeg(r) {
  document.querySelectorAll('#themeSeg .seg').forEach(b => {
    const on = b.dataset.themeChoice === (r || resolved())
    b.classList.toggle('on', on)
    b.setAttribute('aria-checked', String(on))
  })
}
document.querySelectorAll('#themeSeg .seg').forEach(b => {
  b.onclick = () => {
    LS.set('ts.theme', b.dataset.themeChoice)
    applyTheme()
  }
})

const darkHL = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#5c6370', fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword], color: '#c792ea' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#3ddc84' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#ffb347' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#4c8dff' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: '#e7e7e7' },
  { tag: [t.propertyName, t.attributeName], color: '#4fd6d2' },
  { tag: [t.typeName, t.className, t.namespace], color: '#e8d44d' },
  { tag: [t.tagName], color: '#ff6b5b' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#7c8391' },
  { tag: [t.heading], color: '#4c8dff', fontWeight: 'bold' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.link, t.url], color: '#4fd6d2', textDecoration: 'underline' },
  { tag: [t.invalid], color: '#ff5c4d' },
])
const lightHL = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#8a8f98', fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword], color: '#8250df' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#0a7d33' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#b35300' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#0b62e0' },
  { tag: [t.propertyName, t.attributeName], color: '#0f7c86' },
  { tag: [t.typeName, t.className, t.namespace], color: '#953800' },
  { tag: [t.tagName], color: '#c0341d' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#6e7781' },
  { tag: [t.heading], color: '#0b62e0', fontWeight: 'bold' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.invalid], color: '#cf222e' },
])
const highlightFor = r => syntaxHighlighting(r === 'dark' ? darkHL : lightHL, { fallback: true })

/* =========================================================== encryption */

const TE = new TextEncoder(), TD = new TextDecoder()

const b64 = u8 => {
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const randToken = () => b64(crypto.getRandomValues(new Uint8Array(32)))

/**
 * Two independent values from one password.
 *
 *   key  - AES-GCM, never leaves this browser.
 *   auth - proves to the relay that we know the password. Different salt, so
 *          handing it over reveals nothing about the key.
 *
 * We send the auth token raw and the relay stores only SHA-256 of it. Hashing
 * is deliberately the relay's job alone: when both sides hashed, create-time
 * values got hashed twice and every new room was rejected as unauthenticated.
 *
 * The salts still read "textshare". They are cryptographic constants, not
 * branding - changing them would lock every existing room out of its own data.
 */
async function derive(code, pass) {
  const base = await crypto.subtle.importKey(
    'raw', TE.encode(code + ':' + (pass || '')), 'PBKDF2', false, ['deriveKey', 'deriveBits'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: TE.encode('textshare|' + code), iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: TE.encode('textshare-auth|' + code), iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    base, 256)
  return { key, auth: b64(new Uint8Array(bits)) }
}

async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv, 0); out.set(ct, 12)
  return out
}
async function unseal(key, bytes) {
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)))
}

/* ========================================================= relay lookup */

async function http(host, path, opts) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 9000)
  try {
    return await fetch('https://' + host + path,
      Object.assign({ cache: 'no-store', signal: ctrl.signal }, opts || {}))
  } catch (e) { return null }
  finally { clearTimeout(timer) }
}

async function roomInfo(host, code) {
  const res = await http(host, '/room/' + code + '/exists')
  if (!res || !res.ok) return { ok: false }
  try { return { ok: true, info: await res.json() } } catch (e) { return { ok: false } }
}

/**
 * Ask the relay to judge our auth token before we open a socket. A failed
 * WebSocket upgrade gives JavaScript no status code, so proving the password
 * over plain HTTP first is the only way to tell "wrong password" apart from
 * "your wifi died". 426 means the token was accepted and it now wants an
 * upgrade, which is exactly what we wanted to hear.
 *
 * status 0 means the request never completed at all - that, and only that, is
 * a genuine connectivity failure.
 */
async function preflight(host, code, params) {
  const res = await http(host, '/room/' + code + (params ? '?' + params : ''))
  if (!res) return { status: 0 }
  let body = null
  try { body = await res.json() } catch (e) {}
  return { status: res.status, body }
}

const refused = r => ({
  ok: false,
  reason: 'relay',
  status: r.status,
  detail: (r.body && r.body.error) || '',
})

async function admin(host, code, token, action, value) {
  const res = await http(host, '/room/' + code + '/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, action, value }),
  })
  if (!res) return { ok: false }
  try { return Object.assign({ ok: res.ok, status: res.status }, await res.json()) }
  catch (e) { return { ok: res.ok, status: res.status } }
}

/* ================================================================ relay */

class Relay {
  constructor(host, code, doc, aw, key, auth, owner) {
    Object.assign(this, { host, code, doc, aw, key, auth, owner })
    this.tries = 0; this.dead = false; this.synced = false
    this.onstate = () => {}
    this.onroom = () => {}
    this.onkilled = () => {}

    this._doc = (u, origin) => { if (origin !== this) this.send(T_UPDATE, u) }
    this._aw = ({ added, updated, removed }) =>
      this.send(T_AWARE, encodeAwarenessUpdate(this.aw, added.concat(updated, removed)))
    doc.on('update', this._doc)
    aw.on('update', this._aw)

    this._bye = () => removeAwarenessStates(this.aw, [this.doc.clientID], 'unload')
    addEventListener('beforeunload', this._bye)
    this.connect()
  }

  url() {
    const p = new URLSearchParams()
    if (this.auth) p.set('a', this.auth)
    if (this.owner) p.set('o', this.owner)
    p.set('cid', String(this.doc.clientID))
    return 'wss://' + this.host + '/room/' + this.code + '?' + p.toString()
  }

  connect() {
    if (this.dead) return
    let ws
    try { ws = new WebSocket(this.url()) } catch (e) { return this.retry() }
    this.ws = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      this.tries = 0
      this.send(T_UPDATE, Y.encodeStateAsUpdate(this.doc))
      this.send(T_AWARE, encodeAwarenessUpdate(this.aw, [this.doc.clientID]))
      this.onstate()
    }

    ws.onmessage = async ev => {
      if (typeof ev.data === 'string') return
      const buf = new Uint8Array(ev.data)
      if (!buf.length) return
      const type = buf[0], body = buf.slice(1)

      // Control frames are relay-authored and therefore not encrypted.
      if (type === T_SYNCED) { this.synced = true; this.onstate(); return }
      if (type === T_COMPACT) { this.send(T_SNAPSHOT, Y.encodeStateAsUpdate(this.doc)); return }
      if (type === T_STATE) {
        try { this.onroom(JSON.parse(TD.decode(body))) } catch (e) {}
        return
      }
      if (type === T_KILLED) { this.dead = true; this.onkilled(TD.decode(body)); return }
      if (type === T_ERROR) {
        const r = TD.decode(body)
        if (r === 'rate_limited') toast('Slow down a moment')
        else if (r === 'room_full_bytes') toast('This room has hit its size limit')
        else if (r === 'read_only') toast('This room is read-only')
        return
      }

      let plain
      try { plain = await unseal(this.key, body) }
      catch (e) { return }   // not ours to read: wrong key, or a stale frame
      try {
        if (type === T_UPDATE) Y.applyUpdate(this.doc, plain, this)
        else if (type === T_AWARE) applyAwarenessUpdate(this.aw, plain, this)
      } catch (e) {}
    }

    ws.onclose = () => { this.synced = false; this.retry() }
    ws.onerror = () => { try { ws.close() } catch (e) {} }
  }

  retry() {
    if (this.dead) return
    this.onstate()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.connect(), Math.min(15000, 600 * Math.pow(1.6, this.tries++)))
  }

  close() {
    this.dead = true
    clearTimeout(this.timer)
    try { this._bye() } catch (e) {}
    try { this.ws.close() } catch (e) {}
  }

  // `raw` skips encryption, for the few frames the relay must actually read.
  async send(type, payload, raw) {
    if (!this.ws || this.ws.readyState !== 1) return
    try {
      const body = raw ? new Uint8Array(payload) : await seal(this.key, payload)
      const out = new Uint8Array(1 + body.length)
      out[0] = type
      out.set(body, 1)
      if (this.ws.readyState === 1) this.ws.send(out.buffer)
    } catch (e) {}
  }
}

/* ============================================================ languages */

const LANGS = {
  text: ['plain', 'txt', null],
  javascript: ['javascript', 'js', () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true }))],
  typescript: ['typescript', 'ts', () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true, jsx: true }))],
  python: ['python', 'py', () => import('@codemirror/lang-python').then(m => m.python())],
  html: ['html', 'html', () => import('@codemirror/lang-html').then(m => m.html())],
  css: ['css', 'css', () => import('@codemirror/lang-css').then(m => m.css())],
  json: ['json', 'json', () => import('@codemirror/lang-json').then(m => m.json())],
  yaml: ['yaml', 'yml', () => import('@codemirror/legacy-modes/mode/yaml').then(m => StreamLanguage.define(m.yaml))],
  sql: ['sql', 'sql', () => import('@codemirror/lang-sql').then(m => m.sql())],
  java: ['java', 'java', () => import('@codemirror/lang-java').then(m => m.java())],
  cpp: ['c / c++', 'cpp', () => import('@codemirror/lang-cpp').then(m => m.cpp())],
  go: ['go', 'go', () => import('@codemirror/lang-go').then(m => m.go())],
  rust: ['rust', 'rs', () => import('@codemirror/lang-rust').then(m => m.rust())],
  shell: ['shell', 'sh', () => import('@codemirror/legacy-modes/mode/shell').then(m => StreamLanguage.define(m.shell))],
  markdown: ['markdown', 'md', () => import('@codemirror/lang-markdown').then(m => m.markdown())],
}
const EXT = {}
for (const id in LANGS) EXT[LANGS[id][1]] = id
Object.assign(EXT, {
  htm: 'html', jsx: 'javascript', mjs: 'javascript', tsx: 'typescript', yaml: 'yaml',
  c: 'cpp', h: 'cpp', cc: 'cpp', hpp: 'cpp', bash: 'shell', zsh: 'shell', markdown: 'markdown',
})
const langFromName = name => {
  const d = (name || '').lastIndexOf('.')
  return d < 0 ? 'text' : (EXT[name.slice(d + 1).toLowerCase()] || 'text')
}

// Rough sniffing, only ever applied to an untouched "plain" file.
function sniff(text) {
  const s = text.slice(0, 4000)
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(s.trim())) { try { JSON.parse(s); return 'json' } catch (e) {} }
  if (/^\s*<(!doctype|html|div|section|head)\b/i.test(s)) return 'html'
  if (/\b(def|elif)\b.*:|^\s*import\s+\w+$/m.test(s)) return 'python'
  if (/\b(const|let|=>|function)\b/.test(s)) return 'javascript'
  if (/^\s*(SELECT|INSERT|UPDATE|CREATE TABLE)\b/im.test(s)) return 'sql'
  if (/^\s*#!\s*\/bin\/(ba)?sh/.test(s)) return 'shell'
  if (/^#{1,3}\s|\*\*\w/m.test(s)) return 'markdown'
  if (/\b(fn|impl|pub struct)\b/.test(s)) return 'rust'
  if (/\b(package|func)\b.*\{/.test(s)) return 'go'
  return null
}

/* ================================================================ state */

let CODE = norm(location.hash.slice(1))
let ydoc, awareness, relay, idb, KEY, AUTH, OWNER = null, view
let ylist, ytexts, undoManager, activeId = null, following = null
let typingTimer, actTimer, chatSeen = 0, markSig = '', startedAt = 0
let roomLocked = false, canEdit = !VIEW_ONLY, killed = false, booted = false
let scrollHandler = null, stopDemo = null
const known = new Map()

const langComp = new Compartment(), themeComp = new Compartment(), roComp = new Compartment()
const storedColor = LS.get('ts.color', '')
let myColor = /^#[0-9a-f]{6}$/i.test(storedColor)
  ? storedColor
  : PALETTE[Math.floor(Math.random() * PALETTE.length)]
let myName = LS.get('ts.name', '')
let chatColorText = LS.get('ts.chatColor', '1') !== '0'
let edFont = parseInt(LS.get('ts.edfont', '13'), 10) || 13

applyTheme()
applyEdFont()

const readOnlyNow = () => VIEW_ONLY || !canEdit

/* ========================================================= landing page */

const gErr = m => { const e = $('gErr'); e.textContent = m || ''; e.hidden = !m }

// The demo is decoration: never let it break the page it sits on. Respect
// reduced motion by making the demo static, not by hiding it on desktop
// while mobile still gets the full animation.
import('./demo.js')
  .then(m => { if (!booted) stopDemo = m.runDemo($('demo')) })
  .catch(() => {
    // The only way this import realistically fails is an ad/content blocker
    // stopping the esm.sh CodeMirror fetch the demo needs. Say so plainly
    // instead of leaving an empty box with no explanation - the real editor
    // is entirely unaffected either way.
    const d = $('demo')
    if (d && !booted) {
      d.innerHTML = '<p class="fineprint" style="padding:16px;text-align:center">Demo preview blocked, likely by an ad or content blocker. The room editor itself still works.</p>'
    }
  })

$('gCode').addEventListener('input', e => {
  e.target.value = norm(e.target.value)
  e.target.classList.remove('bad')
  gErr('')
})

if (!window.isSecureContext) {
  gErr('This app needs HTTPS in order to encrypt. Open the https:// address.')
  $('gCreate').disabled = true
  $('gGo').disabled = true
}

$('gCreate').onclick = () => openModal('create')

$('gJoin').onsubmit = async e => {
  e.preventDefault()
  const code = norm($('gCode').value)
  if (code.length !== LEN) {
    gErr('A room code is 6 characters.')
    shake($('gCode')); $('gCode').classList.add('bad')
    return
  }
  await tryJoin(code, $('gGo'))
}

async function tryJoin(code, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '\u00b7\u00b7\u00b7' }
  const res = await roomInfo(relayHost(), code)
  if (btn) { btn.disabled = false; btn.innerHTML = '&#8594;' }

  if (!res.ok) {
    gErr('Cannot reach the relay. Check your connection, then try again.')
    shake($('gCode'))
    return
  }
  if (!res.info.exists) {
    gErr('No room exists with code ' + code + '. Rooms are erased once everyone leaves.')
    shake($('gCode')); $('gCode').classList.add('bad')
    if (location.hash) window.history.replaceState(null, '', location.pathname + location.search)
    return
  }
  if (res.info.suspended && !LS.get('ts.own.' + code, '')) {
    gErr('Room ' + code + ' has been suspended by whoever created it.')
    shake($('gCode'))
    return
  }
  openModal('join', code, res.info)
}

/* ============================================================= step two */

let pending = null

function resetEye() {
  $('mPass').type = 'password'
  $('mPassEye').textContent = 'show'
  $('mPassEye').setAttribute('aria-pressed', 'false')
  $('mPassEye').setAttribute('aria-label', 'Show password')
}

$('mPassEye').onclick = () => {
  const i = $('mPass'), reveal = i.type === 'password'
  i.type = reveal ? 'text' : 'password'
  $('mPassEye').textContent = reveal ? 'hide' : 'show'
  $('mPassEye').setAttribute('aria-pressed', String(reveal))
  $('mPassEye').setAttribute('aria-label', reveal ? 'Hide password' : 'Show password')
  i.focus()
}

// Honest feedback: the room code is public, so the password is the only thing
// standing between a stranger and an offline guessing run.
$('mPass').addEventListener('input', () => {
  $('mPass').classList.remove('bad')
  const hint = $('mPassHint')
  if (!pending || pending.mode !== 'create') return hint.hidden = true
  const v = $('mPass').value
  if (!v) return hint.hidden = true
  hint.hidden = false
  const weak = v.length < 8
  hint.textContent = weak
    ? 'Short passwords can be guessed offline. Eight or more characters is much safer.'
    : 'Strong enough. Without this, nobody can even connect.'
  hint.style.color = weak ? 'var(--warn)' : 'var(--ok)'
})

function openModal(mode, code, info) {
  pending = { mode, code: code || null, info: info || null }
  const locked = mode === 'join' && info && info.hasPassword

  $('mLock').hidden = !locked
  $('mTitle').textContent = mode === 'create'
    ? 'New room'
    : (locked ? 'Room ' + code + ' is locked' : 'Join ' + code)
  $('mSub').textContent = mode === 'create'
    ? 'You will get a 6-character code to share.'
    : (locked
        ? 'This room is password protected. Ask whoever shared it for the password.'
        : (info && info.peers ? info.peers + ' already here.' : 'Nobody here yet - you will be first.'))

  $('mPassWrap').hidden = !locked
  $('mPassLbl').textContent = 'Password'
  $('mAddPass').hidden = mode !== 'create'
  $('mTtlRow').hidden = mode !== 'create'
  $('mPass').value = ''
  $('mPass').classList.remove('bad')
  $('mPassHint').hidden = true
  resetEye()
  $('mErr').hidden = true
  $('mName').value = myName
  $('mGo').textContent = mode === 'create' ? 'Create room' : 'Join'
  $('mGo').disabled = false
  $('mBack').disabled = false

  lastFocus = document.activeElement
  $('modal').hidden = false
  setTimeout(() => (myName && locked ? $('mPass') : $('mName')).focus(), 60)
}

function closeModal() {
  $('modal').hidden = true
  pending = null
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus() } catch (e) {} }
}

$('mAddPass').onclick = () => {
  $('mPassWrap').hidden = false
  $('mPassLbl').textContent = 'Password (optional)'
  $('mAddPass').hidden = true
  $('mPass').focus()
}

$('mBack').onclick = () => closeModal()
$('mName').addEventListener('keydown', e => { if (e.key === 'Enter') $('mGo').click() })
$('mPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('mGo').click() })

const mErr = m => { const e = $('mErr'); e.textContent = m || ''; e.hidden = !m }
const bootMsg = m => { $('boot').hidden = false; $('bootMsg').textContent = m }

$('mGo').onclick = async () => {
  if (!pending) return
  const name = $('mName').value.trim()
  if (!name) { mErr('Please enter a display name.'); shake($('mName')); $('mName').focus(); return }
  LS.set('ts.name', name)
  myName = name

  const pass = $('mPass').value
  if (pending.mode === 'join' && pending.info.hasPassword && !pass) {
    mErr('This room needs a password.')
    shake(sheetOf('modal'))
    $('mPass').classList.add('bad'); $('mPass').focus()
    return
  }

  mErr('')
  $('mGo').disabled = true
  $('mBack').disabled = true
  $('modal').hidden = true
  bootMsg('Deriving your key')

  let result
  try {
    result = pending.mode === 'create'
      ? await createRoom(pass, $('mTtl').value)
      : await joinRoom(pending.code, pass)
  } catch (e) {
    // Without this the boot overlay stays up forever and the user is stranded
    // on a black screen with no way back to the form.
    result = { ok: false, reason: 'crash' }
  }

  $('boot').hidden = true
  if (result.ok) return

  $('modal').hidden = false
  $('mGo').disabled = false
  $('mBack').disabled = false

  if (result.reason === 'password') {
    mErr('That password is not right for room ' + pending.code + '.')
    shake(sheetOf('modal'))
    $('mPass').classList.add('bad')
    $('mPass').select()
  } else if (result.reason === 'gone') {
    mErr('Room ' + pending.code + ' no longer exists.')
  } else if (result.reason === 'suspended') {
    mErr('This room has been suspended by its owner.')
  } else if (result.reason === 'busy') {
    mErr('Too many requests from your network. Wait a minute and try again.')
  } else if (result.reason === 'crash') {
    mErr('Something went wrong setting up encryption. Reload and try again.')
  } else if (result.reason === 'collision') {
    mErr('Could not reserve a free room code. Please try again.')
  } else if (result.reason === 'relay') {
    // The relay answered, it just said no. Saying "check your connection"
    // here sends people to reboot their router over a server-side fault.
    mErr('The relay refused this request (HTTP ' + result.status +
      (result.detail ? ', ' + result.detail : '') + ').')
    shake(sheetOf('modal'))
  } else {
    mErr('Could not reach the relay. Check your connection.')
  }
}

/* ========================================================= create / join */

async function createRoom(password, ttl) {
  const host = relayHost()
  const ownerToken = randToken()

  // Reserve a code exclusively. Without this, a random collision would drop
  // two strangers into one room holding two different keys, and neither of
  // them could read a single byte the other typed.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode()
    bootMsg('Deriving your key')
    const { key, auth } = await derive(code, password)

    bootMsg('Reserving room ' + code)
    // Raw tokens. The relay hashes them once, on arrival. Sending pre-hashed
    // values meant the relay hashed them a second time when authenticating
    // this same request, so creation always answered 403.
    const p = new URLSearchParams({
      create: '1', excl: '1',
      a: auth,
      o: ownerToken,
      ttl: ttl || '10m',
    })
    if (password) p.set('p', '1')

    const r = await preflight(host, code, p.toString())
    if (r.status === 409) continue             // taken, pick another
    if (r.status === 0) return { ok: false, reason: 'network' }
    if (r.status === 429) return { ok: false, reason: 'busy' }
    if (r.status !== 426) return refused(r)

    LS.set('ts.own.' + code, ownerToken)
    OWNER = ownerToken
    KEY = key; AUTH = auth
    await enterRoom(code, !!password)
    return { ok: true }
  }
  return { ok: false, reason: 'collision' }
}

async function joinRoom(code, password) {
  const host = relayHost()
  const { key, auth } = await derive(code, password)

  OWNER = LS.get('ts.own.' + code, '') || null
  const p = new URLSearchParams({ a: auth })
  if (OWNER) p.set('o', OWNER)

  bootMsg('Checking the password')
  const r = await preflight(host, code, p.toString())

  if (r.status === 0) return { ok: false, reason: 'network' }
  if (r.status === 403) return { ok: false, reason: 'password' }
  if (r.status === 404) return { ok: false, reason: 'gone' }
  if (r.status === 423) return { ok: false, reason: 'suspended' }
  if (r.status === 429) return { ok: false, reason: 'busy' }
  if (r.status !== 426) return refused(r)

  KEY = key; AUTH = auth
  await enterRoom(code, !!(pending && pending.info && pending.info.hasPassword))
  return { ok: true }
}

async function enterRoom(code, locked) {
  CODE = code
  const host = relayHost()
  booted = true
  if (stopDemo) { try { stopDemo() } catch (e) {} stopDemo = null }

  window.history.replaceState(null, '', location.pathname + location.search + '#' + code)
  $('gate').hidden = true
  $('modal').hidden = true
  $('app').hidden = false
  $('roomCode').textContent = code
  $('lockIcon').hidden = !locked
  $('nameInput').value = myName
  $('ownerOnly').hidden = !OWNER
  $('privacyNote').textContent =
    'Everything is encrypted in this browser before it is sent. The relay ' +
    'only ever sees sealed bytes it has no key for, and destroys the room once everyone has left.'

  startedAt = Date.now()
  // Anything unexpected past this point (storage blocked, a constructor
  // throwing in an unusual browser) should degrade gracefully, not get
  // reported on the join form as an "encryption" failure - the room is
  // already open on screen by now.
  try {
    boot(host)
  } catch (e) {
    banner('Something went wrong setting up this room. Please reload and try again.', 'bad')
  }
}

/* ================================================================= boot */

function boot(host) {
  ydoc = new Y.Doc()
  ylist = ydoc.getArray('files')
  ytexts = ydoc.getMap('texts')
  awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name: myName, color: myColor, view: VIEW_ONLY })
  awareness.setLocalStateField('act', Date.now())

  // Only seed the room's default file once, and only once we actually know
  // what the room already contains. Calling ensureFile() eagerly - on doc
  // boot, on IndexedDB sync, or on every relay state change - raced the
  // relay's log replay: two devices opening an empty room within the same
  // second could each decide "this room has no files yet" and add their own
  // untitled.txt before the other device's copy arrived, leaving two
  // separate files that never appeared to share content even though
  // encryption and the relay connection were both working correctly.
  // Waiting for relay.synced (set only after the relay's T_SYNCED frame,
  // i.e. after any existing files have already been replayed into this doc)
  // makes that "is this room really empty" decision safe.
  let seeded = false
  const seedIfEmpty = () => {
    if (seeded) return
    seeded = true
    ensureFile()
  }

  // Offline persistence is a nice-to-have, not a requirement: private
  // browsing and some browser/extension settings block IndexedDB outright.
  // Losing it should never stop the room itself from working.
  idb = null
  try {
    idb = new IndexeddbPersistence('anonshare-' + CODE, ydoc)
    idb.on('synced', () => { renderTabs() })
  } catch (e) {}

  relay = new Relay(host, CODE, ydoc, awareness, KEY, AUTH, OWNER)
  relay.onstate = () => {
    if (relay.synced) setTimeout(seedIfEmpty, 300)
    paintStatus()
  }
  relay.onroom = applyRoomState
  relay.onkilled = onKilled

  ylist.observeDeep(() => { renderTabs(); keepActiveValid() })
  ydoc.getArray('chat').observe(renderChat)
  awareness.on('change', onPresence)

  renderChat()
  onPresence()
  buildSwatches()
  setInterval(() => { paintPeople(); paintStatus() }, 15000)

  // Fully offline use (relay unreachable, e.g. no network at all) should
  // still get a file to type into rather than staying blank forever.
  setTimeout(seedIfEmpty, 5000)

  setTimeout(() => {
    if (!relay.synced) {
      banner('Still connecting. Your edits are saved on this device and will sync once the connection is back.', 'warn')
    }
  }, 9000)
}

function applyRoomState(s) {
  roomLocked = !!s.locked
  canEdit = !!s.canEdit && !VIEW_ONLY
  $('lockBadge').hidden = !roomLocked
  $('roBadge').hidden = !readOnlyNow()
  if ($('btnLock')) $('btnLock').textContent = roomLocked ? 'Allow everyone to edit again' : 'Make read-only for everyone else'
  if (view) view.dispatch({ effects: roComp.reconfigure(readOnlyExt()) })
  renderTabs()
}

function onKilled(reason) {
  killed = true
  try { relay.close() } catch (e) {}
  const msg = reason === 'deleted'
    ? 'This room was deleted by whoever created it. Nothing is left on the relay.'
    : 'This room has been suspended by whoever created it.'
  banner(msg, 'bad')
  canEdit = false
  if (view) view.dispatch({ effects: roComp.reconfigure(readOnlyExt()) })
  paintStatus()
}

/* ================================================================ files */

const files = () => ylist.toArray().map(m => ({ id: m.get('id'), name: m.get('name'), lang: m.get('lang'), map: m }))
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function addFile(name, text) {
  const id = newId()
  ydoc.transact(() => {
    const m = new Y.Map()
    m.set('id', id); m.set('name', name); m.set('lang', langFromName(name))
    ylist.push([m])
    const yt = new Y.Text()
    if (text) yt.insert(0, text)
    ytexts.set(id, yt)
  }, 'local')
  return id
}

function ensureFile() {
  if (!ylist) return
  if (ylist.length === 0) addFile('untitled.txt')
  if (!activeId || !files().some(f => f.id === activeId)) openFile(files()[0].id)
}
function keepActiveValid() {
  const f = files()
  if (f.length && !f.some(x => x.id === activeId)) openFile(f[0].id)
}

function openFile(id) {
  if (!ytexts.get(id)) return
  activeId = id
  awareness.setLocalStateField('file', id)
  mount()
  renderTabs()
  $('lang').value = currentLang()
}

async function closeFile(id) {
  if (readOnlyNow()) return toast('This room is read-only')
  if (ylist.length <= 1) return toast('A room keeps at least one file')
  const f = files().find(x => x.id === id)
  const ok = await ask({
    title: 'Delete this file?',
    body: '"' + ((f && f.name) || 'This file') + '" will disappear for everyone in the room. This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  ydoc.transact(() => {
    const i = files().findIndex(x => x.id === id)
    if (i >= 0) ylist.delete(i, 1)
    ytexts.delete(id)
  }, 'local')
  if (activeId === id) openFile(files()[0].id)
}

async function renameFile(id) {
  if (readOnlyNow()) return toast('This room is read-only')
  const f = files().find(x => x.id === id)
  if (!f) return
  const name = await ask({
    title: 'Rename file',
    body: 'The extension sets the syntax highlighting.',
    input: true, value: f.name, placeholder: 'notes.md',
    confirmLabel: 'Rename',
  })
  if (!name) return
  ydoc.transact(() => {
    f.map.set('name', name.slice(0, 40))
    f.map.set('lang', langFromName(name))
  }, 'local')
  $('lang').value = currentLang()
  loadLang(currentLang())
}

function renderTabs() {
  const host = $('tabs')
  if (!host || !ylist) return
  host.innerHTML = ''
  for (const f of files()) {
    const el = document.createElement('div')
    el.className = 'tab' + (f.id === activeId ? ' on' : '')
    const lb = document.createElement('span')
    lb.textContent = f.name
    lb.onclick = () => (f.id === activeId ? renameFile(f.id) : openFile(f.id))
    el.appendChild(lb)
    if (!readOnlyNow()) {
      const x = document.createElement('span')
      x.className = 'x'
      x.textContent = '\u00d7'
      x.title = 'Delete file'
      x.onclick = e => { e.stopPropagation(); closeFile(f.id) }
      el.appendChild(x)
    }
    host.appendChild(el)
  }
}

$('newFile').onclick = async () => {
  if (readOnlyNow()) return toast('This room is read-only')
  const name = await ask({
    title: 'New file',
    body: 'The extension sets the syntax highlighting.',
    input: true, value: 'notes.md', placeholder: 'notes.md',
    confirmLabel: 'Create',
  })
  if (name) openFile(addFile(name.slice(0, 40)))
}

/* ====================================================== presence gutter */

class NameMark extends GutterMarker {
  constructor(text, color) { super(); this.text = text; this.color = color }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'gmark'
    s.textContent = this.text
    s.style.background = this.color
    return s
  }
}
const setMarks = StateEffect.define()
const marksField = StateField.define({
  create: () => RangeSet.empty,
  update(v, tr) {
    v = v.map(tr.changes)
    for (const e of tr.effects) if (e.is(setMarks)) v = e.value
    return v
  },
})

function absOf(json) {
  try {
    const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), ydoc)
    return abs ? abs.index : null
  } catch (e) { return null }
}

function remoteCursors() {
  const out = []
  if (!view) return out
  for (const p of others()) {
    if (p.file !== activeId || !p.cursor || !p.cursor.head) continue
    const i = absOf(p.cursor.head)
    if (i === null) continue
    out.push({ p, index: Math.min(i, view.state.doc.length) })
  }
  return out
}

function refreshMarks() {
  if (!view) return
  const cur = remoteCursors()
  const sig = cur.map(c => c.index + ':' + safeColor(c.p.user.color)).join('|')
  if (sig === markSig) return   // guards against a dispatch feedback loop
  markSig = sig

  const rows = cur
    .map(c => ({
      from: view.state.doc.lineAt(c.index).from,
      m: new NameMark(initials(c.p.user.name), safeColor(c.p.user.color)),
    }))
    .sort((a, b) => a.from - b.from)

  const b = new RangeSetBuilder()
  for (const r of rows) b.add(r.from, r.from, r.m)
  view.dispatch({ effects: setMarks.of(b.finish()) })
}

/* -------- floating bubbles, pinned to a peer's live cursor ------------ */

function paintBubbles() {
  const layer = $('overlay')
  if (!view || !layer) return
  layer.innerHTML = ''
  const box = view.scrollDOM.getBoundingClientRect()

  for (const { p, index } of remoteCursors()) {
    const saying = p.say && Date.now() - p.say.ts < 8000 ? p.say.text : null
    if (!p.typing && !saying) continue
    let c
    try { c = view.coordsAtPos(index) } catch (e) { continue }
    if (!c) continue

    const el = document.createElement('div')
    el.className = 'bubble'
    el.style.background = safeColor(p.user.color)
    el.style.left = Math.max(2, c.left - box.left) + 'px'
    el.style.top = (c.top - box.top - 4) + 'px'

    if (saying) {
      el.textContent = safeName(p.user.name) + ': ' + String(saying).slice(0, 80)
    } else {
      el.append(safeName(p.user.name) + ' ')
      const i = document.createElement('i')
      i.textContent = 'typing'
      el.appendChild(i)
    }
    layer.appendChild(el)
  }
  paintJump()
}

// "3 edits below" - people working off-screen are otherwise invisible.
function paintJump() {
  const pill = $('jump')
  if (!view || !pill) return
  const vis = view.visibleRanges
  if (!vis.length) return pill.hidden = true
  const from = vis[0].from, to = vis[vis.length - 1].to

  let below = 0, above = 0, target = null
  for (const { p, index } of remoteCursors()) {
    if (!p.typing) continue
    if (index > to) { below++; if (target === null || index < target) target = index }
    else if (index < from) { above++; if (target === null) target = index }
  }
  const n = below + above
  if (!n) return pill.hidden = true

  pill.hidden = false
  pill.textContent = n + (n === 1 ? ' person editing ' : ' people editing ') + (below >= above ? 'below' : 'above')
  pill.onclick = () => {
    if (target === null) return
    view.dispatch({ effects: EditorView.scrollIntoView(target, { y: 'center' }) })
  }
}

/* =============================================================== editor */

function currentLang() {
  const f = files().find(x => x.id === activeId)
  return (f && f.lang) || 'text'
}

async function loadLang(id) {
  const e = LANGS[id] || LANGS.text
  const ext = e[2] ? await e[2]().catch(() => []) : []
  if (view) view.dispatch({ effects: langComp.reconfigure(ext) })
}

const readOnlyExt = () => (readOnlyNow()
  ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
  : [])

function touchActive() {
  clearTimeout(actTimer)
  actTimer = setTimeout(() => awareness.setLocalStateField('act', Date.now()), 400)
}

function mount() {
  const ytext = ytexts.get(activeId)
  if (!ytext) return

  // Tear the old one down properly: v4 destroyed the view but left its scroll
  // listener attached, leaking one handler per tab switch.
  if (view) {
    if (scrollHandler) view.scrollDOM.removeEventListener('scroll', scrollHandler)
    view.destroy()
  }
  if (undoManager) undoManager.destroy()
  undoManager = new Y.UndoManager(ytext)
  markSig = ''

  view = new EditorView({
    parent: $('editor'),
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        marksField,
        gutter({ class: 'cm-presence', markers: v => v.state.field(marksField) }),
        highlightSpecialChars(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        indentUnit.of('  '),
        EditorView.lineWrapping,
        keymap.of([
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap,
          ...foldKeymap, ...completionKeymap, ...yUndoManagerKeymap, indentWithTab,
        ]),
        langComp.of([]),
        themeComp.of(highlightFor(resolved())),
        roComp.of(readOnlyExt()),
        yCollab(ytext, awareness, { undoManager }),
        EditorView.updateListener.of(u => {
          // Transactions y-codemirror.next dispatches while replaying a remote
          // peer's Yjs update onto this view carry this annotation. Without
          // checking for it, syncing someone else's edit into your local doc
          // fired the exact same "docChanged" path as your own typing - so
          // *your* awareness state (and therefore your name, on every other
          // screen showing this room, including this same room open on your
          // own phone) flashed "typing" whenever anyone else typed.
          const remote = u.transactions.some(tr => tr.annotation(ySyncAnnotation))
          if (u.docChanged) {
            paintCounts()
            autoLang()
            if (!remote) markTyping()
          }
          if ((u.docChanged || u.selectionSet) && !remote) touchActive()
          if (u.geometryChanged || u.viewportChanged || u.docChanged) paintBubbles()
        }),
      ],
    }),
  })

  scrollHandler = () => paintBubbles()
  view.scrollDOM.addEventListener('scroll', scrollHandler, { passive: true })

  loadLang(currentLang())
  $('roBadge').hidden = !readOnlyNow()
  paintCounts()
  refreshMarks()
}

let sniffed = false
function autoLang() {
  if (sniffed || readOnlyNow()) return
  const f = files().find(x => x.id === activeId)
  if (!f || f.lang !== 'text') return
  const text = view.state.doc.toString()
  if (text.length < 40) return
  const guess = sniff(text)
  if (!guess) return
  sniffed = true
  ydoc.transact(() => f.map.set('lang', guess), 'local')
  $('lang').value = guess
  loadLang(guess)
  toast('Detected ' + LANGS[guess][0])
}

const langSel = $('lang')
for (const id in LANGS) {
  const o = document.createElement('option')
  o.value = id
  o.textContent = LANGS[id][0]
  langSel.appendChild(o)
}
langSel.onchange = () => {
  sniffed = true
  const f = files().find(x => x.id === activeId)
  if (f) ydoc.transact(() => f.map.set('lang', langSel.value), 'local')
  loadLang(langSel.value)
}

/* ============================================================= presence */

function markTyping() {
  awareness.setLocalStateField('typing', true)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => awareness.setLocalStateField('typing', false), 1500)
}

function others() {
  const out = []
  awareness.getStates().forEach((st, id) => {
    if (id === ydoc.clientID || !st.user) return
    out.push(Object.assign({ id }, st))
  })
  return out
}

function onPresence() {
  announce()
  paintPeople()
  paintStatus()
  refreshMarks()
  paintBubbles()
  followTick()
}

function announce() {
  const now = new Map()
  for (const p of others()) now.set(p.id, safeName(p.user.name))
  // Suppress the burst that initial sync would otherwise produce.
  if (Date.now() - startedAt > 2500) {
    for (const [id, name] of now) if (!known.has(id)) toast(name + ' joined')
    for (const [id, name] of known) if (!now.has(id)) toast(name + ' left')
  }
  known.clear()
  for (const [id, name] of now) known.set(id, name)
}

function paintPeople() {
  const host = $('people')
  if (!host || !ydoc) return
  const now = Date.now()
  const all = [{ id: ydoc.clientID, me: true, user: { name: myName, color: myColor }, act: now }]
    .concat(others())
  host.innerHTML = ''

  for (const p of all.slice(0, 5)) {
    const idle = !p.me && now - (p.act || 0) > IDLE_AFTER
    const el = document.createElement('div')
    el.className = 'av' + (p.me ? ' me' : '') + (idle ? ' idle' : '') + (following === p.id ? ' following' : '')
    el.style.background = safeColor(p.user.color)
    el.textContent = initials(p.user.name)
    el.title = p.me
      ? safeName(p.user.name) + ' (you)'
      : safeName(p.user.name) + (idle ? ' - idle' : '') + '\nclick to jump to their cursor, double-click to follow'
    if (p.typing) {
      const d = document.createElement('span')
      d.className = 'live'
      el.appendChild(d)
    }
    if (!p.me) {
      el.onclick = () => jumpTo(p.id)
      el.ondblclick = () => toggleFollow(p.id)
    }
    host.appendChild(el)
  }
  if (all.length > 5) {
    const el = document.createElement('div')
    el.className = 'av more'
    el.textContent = '+' + (all.length - 5)
    el.title = 'Open settings for the full list'
    el.onclick = () => showPanel($('panel'))
    host.appendChild(el)
  }
  renderRoster(all, now)
}

function renderRoster(all, now) {
  const host = $('roster')
  if (!host) return
  host.innerHTML = ''
  for (const p of all) {
    const idle = !p.me && now - (p.act || 0) > IDLE_AFTER
    const row = document.createElement('div')
    row.className = 'rowu'

    const sw = document.createElement('span')
    sw.className = 'sw'
    sw.style.background = safeColor(p.user.color)
    if (idle) sw.style.filter = 'grayscale(1)'

    const nm = document.createElement('span')
    nm.className = 'nm'
    nm.textContent = safeName(p.user.name) + (p.me ? ' (you)' : '')
    row.append(sw, nm)

    const tag = document.createElement('span')
    tag.className = 'tag'
    if (p.me) {
      tag.textContent = readOnlyNow() ? 'view only' : ''
      row.appendChild(tag)
    } else {
      tag.textContent = p.typing ? 'typing' : (idle ? 'idle' : (p.user.view ? 'view only' : ''))
      const f = document.createElement('button')
      f.className = 'fbtn'
      f.textContent = following === p.id ? 'unfollow' : 'follow'
      f.onclick = () => toggleFollow(p.id)
      row.append(tag, f)
    }
    host.appendChild(row)
  }
}

function buildSwatches() {
  const host = $('swatches')
  if (!host) return
  host.innerHTML = ''
  for (const c of PALETTE) {
    const el = document.createElement('button')
    el.className = 'cs' + (c === myColor ? ' on' : '')
    el.style.background = c
    el.title = c
    el.setAttribute('role', 'radio')
    el.setAttribute('aria-checked', String(c === myColor))
    el.setAttribute('aria-label', 'Colour ' + c)
    el.onclick = () => {
      myColor = c
      LS.set('ts.color', c)
      awareness.setLocalStateField('user', { name: myName, color: myColor, view: VIEW_ONLY })
      buildSwatches()
      paintPeople()
    }
    host.appendChild(el)
  }
}

function paintStatus() {
  if (!awareness) return
  const n = others().length + 1
  $('userCount').textContent = n + ' online'
  const dot = $('dot'), txt = $('connText')
  $('offlineBadge').hidden = navigator.onLine

  if (killed) {
    dot.className = 'off'
    txt.textContent = 'room closed'
  } else if (!relay || !relay.ws || relay.ws.readyState !== 1) {
    dot.className = 'off'
    txt.textContent = navigator.onLine ? 'reconnecting' : 'offline'
  } else if (n > 1) {
    dot.className = 'on'
    txt.textContent = 'live'
  } else {
    dot.className = ''
    txt.textContent = 'waiting for others'
  }
}
addEventListener('online', paintStatus)
addEventListener('offline', paintStatus)

/* --------------------------------------------------------- jump & follow */

function jumpTo(id) {
  const st = awareness.getStates().get(id)
  if (!st) return
  if (st.file && st.file !== activeId) openFile(st.file)
  if (!st.cursor || !st.cursor.head) return toast('They have not placed a cursor yet')
  const i = absOf(st.cursor.head)
  if (i === null) return
  view.dispatch({ effects: EditorView.scrollIntoView(Math.min(i, view.state.doc.length), { y: 'center' }) })
}

function toggleFollow(id) {
  following = following === id ? null : id
  const st = awareness.getStates().get(id)
  const b = $('followBadge')
  b.hidden = !following
  if (following) {
    b.textContent = 'following ' + safeName(st && st.user && st.user.name) + ' \u00d7'
    b.onclick = () => toggleFollow(id)
    followTick()
  }
  paintPeople()
}

function followTick() {
  if (!following || !view) return
  const st = awareness.getStates().get(following)
  if (!st) return toggleFollow(following)
  if (st.file && st.file !== activeId) return openFile(st.file)
  if (!st.cursor || !st.cursor.head) return
  const i = absOf(st.cursor.head)
  if (i === null) return
  view.dispatch({ effects: EditorView.scrollIntoView(Math.min(i, view.state.doc.length), { y: 'center' }) })
}

/* ================================================================= chat */

function renderChat() {
  const list = $('chatList')
  if (!list || !ydoc) return
  const arr = ydoc.getArray('chat').toArray()
  list.innerHTML = ''

  let prevName = null, prevTs = 0
  for (const m of arr.slice(-200)) {
    const grouped = prevName === m.name && (m.ts - prevTs) < 120000
    const el = document.createElement('div')
    el.className = 'msg' + (grouped ? ' grouped' : '')

    if (!grouped) {
      const head = document.createElement('div')
      head.className = 'head'

      const chip = document.createElement('span')
      chip.className = 'chip-av'
      chip.style.background = safeColor(m.color)
      chip.textContent = initials(m.name)
      head.appendChild(chip)

      const who = document.createElement('span')
      who.className = 'who'
      who.textContent = safeName(m.name)
      who.style.color = safeColor(m.color)

      const when = document.createElement('span')
      when.className = 'when'
      when.textContent = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      when.title = new Date(m.ts).toLocaleString()
      head.append(who, when)
      el.appendChild(head)
    }

    const body = document.createElement('div')
    body.className = 'body'
    if (chatColorText) body.style.color = safeColor(m.color)
    // Built as text nodes, never innerHTML: chat comes from other people.
    for (const part of String(m.text).split(/(@[\w-]{1,24})/g)) {
      if (part.startsWith('@') && part.length > 1) {
        const s = document.createElement('span')
        s.className = 'mention'
        s.textContent = part
        body.appendChild(s)
        if (part.slice(1).toLowerCase() === myName.toLowerCase()) el.classList.add('hit')
      } else if (part) {
        body.appendChild(document.createTextNode(part))
      }
    }

    el.appendChild(body)
    list.appendChild(el)
    prevName = m.name; prevTs = m.ts
  }
  list.scrollTop = list.scrollHeight

  if ($('chat').hidden && arr.length > chatSeen) {
    $('chatDot').hidden = false
    const unread = arr.length - chatSeen
    $('chatDot').textContent = unread > 9 ? '9+' : String(unread)
  } else {
    chatSeen = arr.length
  }

  trimChat(arr.length)
}

// Chat lives in the document, so an all-day room would grow the relay log
// forever. The lowest client id does the pruning so we do not all race.
function trimChat(len) {
  if (len <= CHAT_MAX) return
  const ids = others().map(p => p.id).concat([ydoc.clientID])
  if (Math.min.apply(null, ids) !== ydoc.clientID) return
  ydoc.transact(() => ydoc.getArray('chat').delete(0, len - CHAT_KEEP), 'local')
}

$('chatForm').onsubmit = e => {
  e.preventDefault()
  const text = $('chatInput').value.trim()
  if (!text) return
  ydoc.getArray('chat').push([{ name: myName, color: myColor, text: text.slice(0, 500), ts: Date.now() }])
  $('chatInput').value = ''
}

function showPanel(el) {
  const other = el === $('chat') ? $('panel') : $('chat')
  other.hidden = true
  el.hidden = !el.hidden
  if (el === $('chat') && !el.hidden) {
    $('chatDot').hidden = true
    chatSeen = ydoc.getArray('chat').length
    $('chatInput').focus()
  }
  setTimeout(() => { if (view) view.requestMeasure() }, 60)
}
$('chatBtn').onclick = () => showPanel($('chat'))
$('chatClose').onclick = () => { $('chat').hidden = true }
$('panelClose').onclick = () => { $('panel').hidden = true }

if ($('chatColorToggle')) {
  $('chatColorToggle').setAttribute('aria-pressed', String(chatColorText))
  $('chatColorToggle').textContent = 'Color messages by sender: ' + (chatColorText ? 'on' : 'off')
  $('chatColorToggle').onclick = () => {
    chatColorText = !chatColorText
    LS.set('ts.chatColor', chatColorText ? '1' : '0')
    $('chatColorToggle').setAttribute('aria-pressed', String(chatColorText))
    $('chatColorToggle').textContent = 'Color messages by sender: ' + (chatColorText ? 'on' : 'off')
    renderChat()
  }
}
if ($('edFont')) {
  $('edFont').onchange = () => {
    edFont = parseInt($('edFont').value, 10) || 13
    LS.set('ts.edfont', String(edFont))
    applyEdFont()
  }
}

// Manual side-panel resize, desktop only. Purely cosmetic and local to this
// browser: it never touches the shared document or the relay connection.
function initResizer(handle, aside, storageKey, defaultWidth) {
  if (!handle || !aside) return
  const wide = () => matchMedia('(min-width:1081px)').matches
  const saved = parseInt(LS.get(storageKey, ''), 10)
  if (saved && wide()) aside.style.width = Math.min(480, Math.max(260, saved)) + 'px'
  let dragging = false
  handle.addEventListener('mousedown', e => {
    if (!wide()) return
    dragging = true
    handle.classList.add('active')
    e.preventDefault()
  })
  addEventListener('mousemove', e => {
    if (!dragging) return
    const rect = aside.getBoundingClientRect()
    const w = Math.min(480, Math.max(260, rect.right - e.clientX))
    aside.style.width = w + 'px'
  })
  addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    handle.classList.remove('active')
    LS.set(storageKey, String(parseInt(aside.style.width, 10) || defaultWidth))
    if (view) view.requestMeasure()
  })
}
initResizer($('chatResizer'), $('chat'), 'ts.chatw', 300)
initResizer($('panelResizer'), $('panel'), 'ts.panelw', 300)

/* ============================================================== toolbar */

const inviteLink = () => location.origin + location.pathname + '#' + CODE
const viewLink = () => location.origin + location.pathname + '?view=1#' + CODE

$('roomChip').onclick = () => copy(CODE, 'Room code')
$('copyLink').onclick = () => copy(inviteLink(), 'Invite link')
$('undoBtn').onclick = () => { if (undoManager) undoManager.undo(); if (view) view.focus() }
$('redoBtn').onclick = () => { if (undoManager) undoManager.redo(); if (view) view.focus() }

function setMenu(open) {
  $('menu').hidden = !open
  $('moreBtn').setAttribute('aria-expanded', String(open))
}
$('moreBtn').onclick = e => {
  e.stopPropagation()
  setMenu($('menu').hidden)
}
addEventListener('click', e => {
  if (!$('menu').hidden && !$('menu').contains(e.target) && e.target !== $('moreBtn')) setMenu(false)
})

function downloadBlob(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const ACTIONS = {
  palette: () => openPalette(),
  newfile: () => $('newFile').click(),
  rename: () => renameFile(activeId),
  find: () => { if (view) { view.focus(); openSearchPanel(view) } },
  download: () => {
    const f = files().find(x => x.id === activeId)
    down