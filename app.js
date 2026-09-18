import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { IndexeddbPersistence } from 'y-indexeddb'
import { EditorState, Compartment, StateField, StateEffect, RangeSet, RangeSetBuilder, Transaction } from '@codemirror/state'
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
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { runCode, parseErrorPositions } from './lib/runner.js'
import { uploadEncryptedFile, downloadAndDecryptFile, saveBlobAsFile, isCodeOrTextFile } from './lib/file-sharing.js'
import { formatCode } from './lib/formatter.js'
import { renderMarkdown, updateHtmlPreview, buildStandaloneHtml, renderVisualDiff, isValidPreviewMessage } from './lib/preview.js'
import { renderDocxToHtml } from './lib/docx-viewer.js'
import { VoiceMesh } from './lib/voice.js'
import { P2PMesh } from './lib/p2p.js'
import { detectLanguage } from './lib/detector.js'
import { getBookmarks, saveBookmark, removeBookmark, clearBookmarks } from './lib/bookmarks.js'
import { UI_TEMPLATES, generateUiFromPrompt } from './lib/generative-ui.js'
import { SLASH_COMMANDS, parseSlashCommand, filterSlashCommands } from './lib/slash-commands.js'

window.__ts_booted = true

const $ = id => document.getElementById(id)
const QS = new URLSearchParams(location.search)
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  del(k) { try { localStorage.removeItem(k) } catch (e) {} },
}

const DEFAULT_RELAY = 'relay.avishkark.in'
const FALLBACK_RELAY = 'textshare-sync.avishkarkedar.workers.dev'
const CONTACT = 'avishkarkedar+text@gmail.com'
const AL = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const LEN = 6
const VIEW_ONLY = QS.get('view') === '1'
const IDLE_AFTER = 60000
const PBKDF2_ROUNDS = 600000
const CHAT_MAX = 400, CHAT_KEEP = 300

const PALETTE = ['#4c8dff', '#3ddc84', '#ffb347', '#c792ea', '#ff87b5', '#4fd6d2', '#ff6b5b', '#e8d44d']

const T_UPDATE = 0, T_AWARE = 1, T_SNAPSHOT = 2, T_SYNCED = 3,
      T_ERROR = 4, T_COMPACT = 5, T_STATE = 6, T_KILLED = 7, T_GRANT = 8, T_P2P = 9

const norm = v => (v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, LEN)
const cleanHost = v => (v || '').trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
const relayHost = () => {
  if (typeof relay !== 'undefined' && relay && relay.host) return relay.host
  return cleanHost(QS.get('relay') || LS.get('ts.relay', '') || DEFAULT_RELAY)
}

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

function themePref() {
  const saved = LS.get('ts.theme', '')
  if (['dark', 'light', 'dracula', 'nord', 'monokai'].includes(saved)) return saved
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

const TE = new TextEncoder(), TD = new TextDecoder()

const b64 = u8 => {
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const randToken = () => b64(crypto.getRandomValues(new Uint8Array(32)))

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

class Relay {
  constructor(host, code, doc, aw, key, auth, owner) {
    Object.assign(this, { host, code, doc, aw, key, auth, owner })
    this.tries = 0; this.dead = false; this.synced = false
    this.onstate = () => {}
    this.onroom = () => {}
    this.onkilled = () => {}

    this._doc = (u, origin) => { if (origin !== this) this.send(T_UPDATE, u) }
    this._aw = ({ added, updated, removed }) => {
      const mine = added.concat(updated, removed).filter(id => id === this.doc.clientID)
      if (!mine.length) return
      this.send(T_AWARE, encodeAwarenessUpdate(this.aw, mine))
    }
    doc.on('update', this._doc)
    aw.on('update', this._aw)

    this._bye = () => removeAwarenessStates(this.aw, [this.doc.clientID], 'unload')
    addEventListener('beforeunload', this._bye)
    addEventListener('pagehide', this._bye)
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

      if (type === T_P2P) {
        try {
          const targetLen = body[0]
          const targetCid = TD.decode(body.subarray(1, 1 + targetLen))
          if (targetCid === String(this.doc.clientID)) {
            const signal = JSON.parse(TD.decode(body.subarray(1 + targetLen)))
            if (this.onp2p) this.onp2p(signal)
          }
        } catch (e) {}
        return
      }

      let plain
      try { plain = await unseal(this.key, body) }
      catch (e) { return }
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
    this.tries++
    if (this.tries >= 3 && this.host === DEFAULT_RELAY && FALLBACK_RELAY) {
      console.warn(`[Relay] Primary relay ${this.host} unreachable; failing over to ${FALLBACK_RELAY}`)
      this.host = FALLBACK_RELAY
      toast('Connecting to backup sync relay...')
      this.tries = 0
    }
    this.timer = setTimeout(() => this.connect(), Math.min(15000, 600 * Math.pow(1.6, this.tries)))
  }

  close() {
    this.dead = true
    clearTimeout(this.timer)
    removeEventListener('beforeunload', this._bye)
    removeEventListener('pagehide', this._bye)
    try { this._bye() } catch (e) {}
    try { this.ws.close() } catch (e) {}
  }

  sendP2P(targetCid, signal) {
    if (!this.ws || this.ws.readyState !== 1) return
    try {
      const cidBytes = TE.encode(String(targetCid))
      const sigBytes = TE.encode(JSON.stringify(signal))
      const out = new Uint8Array(2 + cidBytes.length + sigBytes.length)
      out[0] = T_P2P
      out[1] = cidBytes.length
      out.set(cidBytes, 2)
      out.set(sigBytes, 2 + cidBytes.length)
      this.ws.send(out.buffer)
    } catch (e) {}
  }

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

let CODE = norm(location.hash.slice(1))
let ydoc, awareness, relay, idb, KEY, AUTH, OWNER = null, view
let ylist, ytexts, undoManager, activeId = null, following = null
let ysharedFiles = null, p2pMesh = null, voiceMesh = null, voiceActive = false
const fileSnapshots = new Map()
let histViewMode = 'diff'
let histTimer = null
let lastUserActivity = Date.now()
let inactivityWarnActive = false
let typingTimer, actTimer, chatSeen = 0, markSig = '', startedAt = 0
let roomLocked = false, canEdit = !VIEW_ONLY, killed = false, booted = false
let shownKilled = false, killedInterval = null, adminSuspendNoted = false
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

const gErr = m => { const e = $('gErr'); e.textContent = m || ''; e.hidden = !m }

import('./demo.js')
  .then(m => { if (!booted) stopDemo = m.runDemo($('demo')) })
  .catch(() => {
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
    mErr('The relay refused this request (HTTP ' + result.status +
      (result.detail ? ', ' + result.detail : '') + ').')
    shake(sheetOf('modal'))
  } else {
    mErr('Could not reach the relay. Check your connection.')
  }
}

async function createRoom(password, ttl) {
  const host = relayHost()
  const ownerToken = randToken()

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode()
    bootMsg('Deriving your key')
    const { key, auth } = await derive(code, password)

    bootMsg('Reserving room ' + code)
    const p = new URLSearchParams({
      create: '1', excl: '1',
      a: auth,
      o: ownerToken,
      ttl: ttl || '10m',
    })
    if (password) p.set('p', '1')

    const r = await preflight(host, code, p.toString())
    if (r.status === 409) continue
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

  try {
    saveBookmark({
      code,
      role: OWNER ? 'owner' : 'peer',
      title: 'Room ' + code,
      language: currentLang() || 'markdown'
    })
  } catch (e) {}
  $('privacyNote').textContent =
    'Everything is encrypted in this browser before it is sent. The relay ' +
    'only ever sees sealed bytes it has no key for, and destroys the room once everyone has left.'

  startedAt = Date.now()
  try {
    boot(host)
    initInactivityTracker()
  } catch (e) {
    banner('Something went wrong setting up this room. Please reload and try again.', 'bad')
  }
}

function boot(host) {
  ydoc = new Y.Doc()
  ylist = ydoc.getArray('files')
  ytexts = ydoc.getMap('texts')
  awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name: myName, color: myColor, view: VIEW_ONLY })
  awareness.setLocalStateField('act', Date.now())

  let seeded = false
  const seedIfEmpty = () => {
    if (seeded) return
    seeded = true
    ensureFile()
  }

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
  ysharedFiles = ydoc.getArray('shared_files')
  ysharedFiles.observe(renderSharedFiles)
  const ymeta = ydoc.getMap('meta')
  ymeta.observe(() => {
    renderRoomGoal()
  })
  ydoc.on('update', () => {
    recordHistorySnapshot()
    if (previewOpen) updateLivePreview()
  })

  try {
    p2pMesh = new P2PMesh(String(ydoc.clientID), (targetCid, sig) => {
      if (relay) relay.sendP2P(targetCid, sig)
    })
    voiceMesh = new VoiceMesh(String(ydoc.clientID), (targetCid, sig) => {
      if (relay) relay.sendP2P(targetCid, sig)
    })
    voiceMesh.onSpeaking = (cid, isSpeaking) => {
      paintPeople()
      if (cid === String(ydoc.clientID) && $('voiceBtn')) {
        $('voiceBtn').classList.toggle('speaking', isSpeaking)
      }
      if (typeof awareness !== 'undefined' && awareness) {
        awareness.setLocalStateField('speaking', isSpeaking)
      }
    }
    relay.onp2p = signal => {
      if (signal && signal.type && signal.type.startsWith('voice-')) {
        voiceMesh?.handleSignal(signal.senderCid, signal)
      } else if (p2pMesh) {
        p2pMesh?.handleSignal(signal.senderCid, signal)
      }
    }
  } catch (e) {}

  awareness.on('change', () => {
    onPresence()
    // Trigger P2P and voice connection to discovered peers
    for (const [clientId] of awareness.getStates()) {
      if (clientId !== ydoc.clientID) {
        if (p2pMesh) p2pMesh.connectToPeer(String(clientId))
        if (voiceMesh && voiceActive) voiceMesh.callPeer(String(clientId))
      }
    }
  })

  renderChat()
  renderSharedFiles()
  renderRoomGoal()
  onPresence()
  buildSwatches()
  setInterval(() => { paintPeople(); paintStatus() }, 15000)
  setInterval(() => { paintPeople(); paintBubbles() }, 2000)

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
  // The owner isn't disconnected when an admin suspends their own room (only
  // everyone else is, below), so this state flag is the only signal they
  // otherwise get that it happened - make it unmistakable rather than silent.
  if (s.suspendedByAdmin && OWNER && !adminSuspendNoted) {
    adminSuspendNoted = true
    banner('The site administrator has suspended this room. Nobody else can connect until it is resumed.', 'bad')
  } else if (!s.suspended) {
    adminSuspendNoted = false
  }
  renderTabs()
}

function onKilled(reason) {
  if (shownKilled) return
  shownKilled = true
  killed = true
  try { relay.close() } catch (e) {}
  canEdit = false
  if (view) view.dispatch({ effects: roComp.reconfigure(readOnlyExt()) })
  paintStatus()

  const isAdmin = reason === 'admin_deleted' || reason === 'admin_suspended'
  const isDelete = reason === 'deleted' || reason === 'admin_deleted'
  const who = isAdmin ? 'the site administrator' : 'whoever created it'
  openKilledOverlay(
    isDelete ? 'Room deleted' : 'Room suspended',
    isDelete
      ? 'This room was deleted by ' + who + '. Nothing is left on the relay.'
      : 'This room has been suspended by ' + who + '.'
  )
}

function goHome() {
  location.href = location.origin + location.pathname
}

// A clear, unmissable end state instead of a small banner: says plainly what
// happened and counts down to an automatic return home, since there is
// nothing left for this tab to usefully do once the room is gone.
function openKilledOverlay(title, body) {
  $('killedTitle').textContent = title
  $('killedBody').textContent = body
  $('modal').hidden = true
  $('ask').hidden = true
  $('pal').hidden = true
  $('menu').hidden = true
  $('killed').hidden = false

  let secs = 10
  const paint = () => { $('killedTimer').textContent = 'Returning to the home page in ' + secs + 's\u2026' }
  paint()
  clearInterval(killedInterval)
  killedInterval = setInterval(() => {
    secs -= 1
    if (secs <= 0) { clearInterval(killedInterval); goHome() }
    else paint()
  }, 1000)
}
$('killedHome').onclick = goHome

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
  recordHistorySnapshot(id, true)
  if ($('historyDrawer') && !$('historyDrawer').hidden) updateHistoryView()
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
  if (sig === markSig) return
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

function paintBubbles() {
  const layer = $('overlay')
  if (!view || !layer) return
  layer.innerHTML = ''
  const box = view.scrollDOM.getBoundingClientRect()

  for (const { p, index } of remoteCursors()) {
    const saying = p.say && Date.now() - p.say.ts < 8000 ? p.say.text : null
    if (!isTyping(p) && !saying) continue
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

function paintJump() {
  const pill = $('jump')
  if (!view || !pill) return
  const vis = view.visibleRanges
  if (!vis.length) return pill.hidden = true
  const from = vis[0].from, to = vis[vis.length - 1].to

  let below = 0, above = 0, target = null
  for (const { p, index } of remoteCursors()) {
    if (!isTyping(p)) continue
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
          const remote = u.transactions.length > 0 && u.transactions.every(tr => tr.annotation(Transaction.userEvent) === undefined)
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

function markTyping() {
  const st = awareness.getLocalState() || {}
  awareness.setLocalState(Object.assign({}, st, { typing: true, tAt: Date.now() }))
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => awareness.setLocalStateField('typing', false), 1500)
}

const AW_STALE = 45000
const TYPING_TTL = 3000

function fresh(id) {
  try {
    const m = awareness.meta.get(id)
    return !m || Date.now() - m.lastUpdated < AW_STALE
  } catch (e) { return true }
}

function awarenessSeen(id) {
  try {
    const m = awareness.meta.get(id)
    return m ? m.lastUpdated : 0
  } catch (e) { return 0 }
}

function isTyping(p) {
  if (!p || !p.typing) return false
  if (typeof p.tAt === 'number' && Date.now() - p.tAt > TYPING_TTL) return false
  return fresh(p.id)
}

function isIdle(p, now) {
  if (p.me) return false
  const seen = Math.max(p.act || 0, awarenessSeen(p.id))
  return now - seen > IDLE_AFTER
}

function others() {
  const out = []
  awareness.getStates().forEach((st, id) => {
    if (id === ydoc.clientID || !st.user || !fresh(id)) return
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
  const t = Date.now()
  const prevKnown = new Map(known)
  const now = new Map()
  for (const p of others()) now.set(p.id, safeName(p.user.name))
  if (t - startedAt > 2500) {
    for (const [id, name] of now) if (!prevKnown.has(id)) toast(name + ' joined')
    for (const [id, info] of prevKnown) if (!now.has(id)) {
      const missing = !awareness.getStates().get(id)
      if (missing && t - info.since < 2000) continue
      toast(info.name + ' left')
    }
  }
  known.clear()
  for (const [id, name] of now) {
    const prev = prevKnown.get(id)
    known.set(id, { name, since: prev ? prev.since : t })
  }
}

function paintPeople() {
  const host = $('people')
  if (!host || !ydoc) return
  const now = Date.now()
  const all = [{ id: ydoc.clientID, me: true, user: { name: myName, color: myColor }, act: now }]
    .concat(others())
  host.innerHTML = ''

  for (const p of all.slice(0, 5)) {
    const idle = isIdle(p, now)
    const el = document.createElement('div')
    el.className = 'av' + (p.me ? ' me' : '') + (idle ? ' idle' : '') + (following === p.id ? ' following' : '')
    el.style.background = safeColor(p.user.color)
    el.textContent = initials(p.user.name)
    el.title = p.me
      ? safeName(p.user.name) + ' (you)'
      : safeName(p.user.name) + (idle ? ' - idle' : '') + '\nclick to jump to their cursor, double-click to follow'
    if (isTyping(p)) {
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
    const idle = isIdle(p, now)
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
      tag.textContent = isTyping(p) ? 'typing' : (idle ? 'idle' : (p.user.view ? 'view only' : ''))
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
addEventListener('visibilitychange', () => {
  if (document.hidden && awareness) {
    clearTimeout(typingTimer)
    awareness.setLocalStateField('typing', false)
  }
})
addEventListener('blur', () => {
  if (awareness) {
    clearTimeout(typingTimer)
    awareness.setLocalStateField('typing', false)
  }
})

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

function trimChat(len) {
  if (len <= CHAT_MAX) return
  const ids = others().map(p => p.id).concat([ydoc.clientID])
  if (Math.min.apply(null, ids) !== ydoc.clientID) return
  ydoc.transact(() => ydoc.getArray('chat').delete(0, len - CHAT_KEEP), 'local')
}

// --- Chat Slash Commands Autocomplete & Submission ---
const chatSlashPopup = $('chatSlashPopup')
let selectedSlashIndex = 0

function updateChatSlashPopup(text) {
  if (!chatSlashPopup) return
  if (!text.startsWith('/')) {
    hideChatSlashPopup()
    return
  }
  const filtered = filterSlashCommands(text)
  if (!filtered.length) {
    hideChatSlashPopup()
    return
  }
  chatSlashPopup.hidden = false
  chatSlashPopup.innerHTML = ''
  selectedSlashIndex = Math.min(selectedSlashIndex, filtered.length - 1)

  filtered.forEach((c, idx) => {
    const item = document.createElement('div')
    item.className = 'slash-item' + (idx === selectedSlashIndex ? ' selected' : '')
    item.innerHTML = `<span>${c.icon} <span class="slash-cmd">${c.command}</span></span> <span class="slash-desc">${c.description}</span>`
    item.onclick = () => {
      const inEl = $('chatInput')
      inEl.value = c.command + ' '
      inEl.focus()
      hideChatSlashPopup()
    }
    chatSlashPopup.appendChild(item)
  })
}

function hideChatSlashPopup() {
  if (chatSlashPopup) chatSlashPopup.hidden = true
}

const cIn = $('chatInput')
if (cIn) {
  cIn.addEventListener('input', () => updateChatSlashPopup(cIn.value))
  cIn.addEventListener('keydown', e => {
    if (chatSlashPopup && !chatSlashPopup.hidden) {
      const items = chatSlashPopup.querySelectorAll('.slash-item')
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        selectedSlashIndex = (selectedSlashIndex + 1) % items.length
        items.forEach((it, i) => it.classList.toggle('selected', i === selectedSlashIndex))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectedSlashIndex = (selectedSlashIndex - 1 + items.length) % items.length
        items.forEach((it, i) => it.classList.toggle('selected', i === selectedSlashIndex))
      } else if (e.key === 'Tab' || (e.key === 'Enter' && !cIn.value.includes(' '))) {
        e.preventDefault()
        const activeItem = items[selectedSlashIndex]
        if (activeItem) activeItem.click()
      } else if (e.key === 'Escape') {
        hideChatSlashPopup()
      }
    }
  })
}

$('chatForm').onsubmit = e => {
  e.preventDefault()
  const text = $('chatInput').value.trim()
  if (!text) return

  const parsed = parseSlashCommand(text)
  if (parsed.isCommand) {
    $('chatInput').value = ''
    hideChatSlashPopup()
    handleSlashCommand(parsed)
    return
  }

  ydoc.getArray('chat').push([{ name: myName, color: myColor, text: text.slice(0, 500), ts: Date.now() }])
  $('chatInput').value = ''
  hideChatSlashPopup()
}

function mobileSheet() {
  return matchMedia('(max-width:720px)').matches
}

function hidePanelAnimated(el) {
  if (!el || el.hidden) return
  if (!mobileSheet()) { el.hidden = true; updateButtonActiveStates(); return }
  el.classList.add('closing')
  clearTimeout(el._closeTimer)
  el._closeTimer = setTimeout(() => {
    el.hidden = true
    el.classList.remove('closing')
    updateButtonActiveStates()
  }, 280)
}

function showPanelAnimated(el) {
  if (!el) return
  clearTimeout(el._closeTimer)
  el.classList.remove('closing')
  el.hidden = false
  updateButtonActiveStates()
  if (mobileSheet()) {
    el.classList.add('closing')
    void el.offsetHeight
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('closing')))
  }
}

function showPanel(el) {
  const other = el === $('chat') ? $('panel') : $('chat')
  hidePanelAnimated(other)
  if (el.hidden) showPanelAnimated(el)
  else hidePanelAnimated(el)
  if (el === $('chat') && !el.hidden) {
    $('chatDot').hidden = true
    chatSeen = ydoc.getArray('chat').length
    $('chatInput').focus()
  }
  updateButtonActiveStates()
  setTimeout(() => { if (view) view.requestMeasure() }, 60)
}
$('chatBtn').onclick = () => showPanel($('chat'))
$('chatClose').onclick = () => hidePanelAnimated($('chat'))
$('panelClose').onclick = () => hidePanelAnimated($('panel'))

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

function jumpToLine(lineNum) {
  if (!view) return
  const doc = view.state.doc
  if (lineNum < 1 || lineNum > doc.lines) return
  const line = doc.line(lineNum)
  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true
  })
  view.focus()
  toast(`Jumped to line ${lineNum}`)
}

// --- Global Active Button States ---
function updateButtonActiveStates() {
  const termOpen = $('terminal') && !$('terminal').hidden
  if ($('runBtn')) {
    $('runBtn').classList.toggle('active', termOpen)
    $('runBtn').setAttribute('aria-pressed', termOpen ? 'true' : 'false')
  }
  const mbarRun = document.querySelector('#mbar button[data-a="run"]')
  if (mbarRun) {
    mbarRun.classList.toggle('active', termOpen)
    mbarRun.setAttribute('aria-pressed', termOpen ? 'true' : 'false')
  }

  if ($('previewBtn')) {
    $('previewBtn').classList.toggle('active', previewOpen)
    $('previewBtn').setAttribute('aria-pressed', previewOpen ? 'true' : 'false')
  }

  const fileOpen = $('fileDrawer') && !$('fileDrawer').hidden
  if ($('filesBtn')) {
    $('filesBtn').classList.toggle('active', fileOpen)
    $('filesBtn').setAttribute('aria-pressed', fileOpen ? 'true' : 'false')
  }
  if ($('hubFilesBtn')) {
    $('hubFilesBtn').classList.toggle('active', fileOpen)
    $('hubFilesBtn').setAttribute('aria-pressed', fileOpen ? 'true' : 'false')
  }
  const mbarFiles = document.querySelector('#mbar button[data-a="files"]')
  if (mbarFiles) {
    mbarFiles.classList.toggle('active', fileOpen)
    mbarFiles.setAttribute('aria-pressed', fileOpen ? 'true' : 'false')
  }

  if ($('voiceBtn')) {
    $('voiceBtn').classList.toggle('active', voiceActive)
    $('voiceBtn').setAttribute('aria-pressed', voiceActive ? 'true' : 'false')
    if (voiceActive && voiceMesh && voiceMesh.isMuted) {
      $('voiceBtn').style.opacity = '0.7'
      $('voiceBtn').title = 'Microphone Muted (Click to speak, Shift+Click to disconnect)'
    } else if (voiceActive) {
      $('voiceBtn').style.opacity = '1'
      $('voiceBtn').title = 'Voice Active (Click to mute, Shift+Click to disconnect)'
    } else {
      $('voiceBtn').style.opacity = ''
      $('voiceBtn').title = 'Voice Chat / Walkie-Talkie'
    }
  }

  const bookmarksOpen = $('bookmarksDrawer') && !$('bookmarksDrawer').hidden
  if ($('bookmarksBtn')) {
    $('bookmarksBtn').classList.toggle('active', bookmarksOpen)
    $('bookmarksBtn').setAttribute('aria-pressed', bookmarksOpen ? 'true' : 'false')
  }

  const browserOpen = $('browserDrawer') && !$('browserDrawer').hidden
  if ($('browserBtn')) {
    $('browserBtn').classList.toggle('active', browserOpen)
    $('browserBtn').setAttribute('aria-pressed', browserOpen ? 'true' : 'false')
  }

  const goalBannerOpen = $('roomGoalBanner') && !$('roomGoalBanner').hidden
  if ($('hubGoalBtn')) {
    $('hubGoalBtn').classList.toggle('active', goalBannerOpen)
    $('hubGoalBtn').setAttribute('aria-pressed', goalBannerOpen ? 'true' : 'false')
  }

  const zenActive = document.body.classList.contains('zen-mode')
  if ($('zenBtn')) {
    $('zenBtn').classList.toggle('active', zenActive)
    $('zenBtn').setAttribute('aria-pressed', zenActive ? 'true' : 'false')
  }

  const chatOpen = $('chat') && !$('chat').hidden
  if ($('chatBtn')) {
    $('chatBtn').classList.toggle('active', chatOpen)
    $('chatBtn').setAttribute('aria-pressed', chatOpen ? 'true' : 'false')
  }
  const mbarChat = document.querySelector('#mbar button[data-a="chat"]')
  if (mbarChat) {
    mbarChat.classList.toggle('active', chatOpen)
    mbarChat.setAttribute('aria-pressed', chatOpen ? 'true' : 'false')
  }

  const histOpen = $('historyDrawer') && !$('historyDrawer').hidden
  if ($('hubHistBtn')) {
    $('hubHistBtn').classList.toggle('active', histOpen)
    $('hubHistBtn').setAttribute('aria-pressed', histOpen ? 'true' : 'false')
  }
}

// --- Slash Commands Execution ---
function handleSlashCommand(parsed) {
  const cmd = parsed.command
  const args = parsed.args

  if (cmd === '/goal') {
    if (!args) promptSetRoomGoal()
    else if (args === 'clear') clearRoomGoal()
    else if (args === 'done') toggleRoomGoalDone()
    else setRoomGoal(args)
  } else if (cmd === '/browser') {
    toggleBrowserDrawer(true, args || 'https://devdocs.io')
  } else if (cmd === '/teamwork-preview' || cmd === '/preview') {
    openTeamworkPreview()
  } else if (cmd === '/boost') {
    toggleTurboBoost()
  } else if (cmd === '/generative_ui' || cmd === '/genui') {
    if (args) {
      const code = generateUiFromPrompt(args)
      const cleanName = args.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gen-ui'
      const fid = addFile(`${cleanName}.html`, code)
      openFile(fid)
      toggleLivePreview(true)
      toast(`✨ Generated "${cleanName}.html" and opened preview!`)
      ydoc.getArray('chat').push([{
        name: 'Generative UI',
        color: '#818cf8',
        text: `✨ Generated UI component for "${args}" into ${cleanName}.html`,
        ts: Date.now()
      }])
    } else {
      openGenerativeUi()
    }
  } else if (cmd === '/clear') {
    if ($('chatList')) $('chatList').innerHTML = ''
    toast('Chat messages cleared locally')
  } else if (cmd === '/shrug') {
    ydoc.getArray('chat').push([{ name: myName, color: myColor, text: '¯\\_(ツ)_/¯', ts: Date.now() }])
  } else if (cmd === '/help') {
    const list = SLASH_COMMANDS.map(c => `<b>${c.command}</b>: ${c.description}`).join('<br>')
    const helpBubble = document.createElement('div')
    helpBubble.className = 'msg'
    helpBubble.style.background = 'rgba(76,141,255,0.1)'
    helpBubble.style.border = '1px solid var(--accent)'
    helpBubble.innerHTML = `<div style="font-weight:bold;margin-bottom:4px">Available Commands:</div><div>${list}</div>`
    $('chatList').appendChild(helpBubble)
    $('chatList').scrollTop = $('chatList').scrollHeight
  } else {
    toast(`Unknown command: ${cmd}. Type /help for list of commands.`)
  }
}

// --- Feature: Collaborative Room Goal (/goal) ---
function renderRoomGoal() {
  if (!ydoc) return
  const ymeta = ydoc.getMap('meta')
  const goal = ymeta.get('roomGoal')
  const banner = $('roomGoalBanner')
  const textEl = $('roomGoalText')
  const statusEl = $('roomGoalStatus')
  const hubPill = $('hubGoalPill')
  const hubBtn = $('hubGoalBtn')

  if (!banner) return

  if (goal && goal.text) {
    banner.hidden = false
    banner.classList.toggle('goal-done', !!goal.done)
    if (textEl) textEl.textContent = goal.text
    if (statusEl) {
      statusEl.textContent = goal.done ? 'Completed ✓' : 'In Progress'
    }
    if (hubPill) {
      hubPill.hidden = false
      hubPill.textContent = goal.done ? 'Done' : 'Active'
    }
    if (hubBtn) {
      hubBtn.classList.add('active')
      hubBtn.setAttribute('aria-pressed', 'true')
    }
    if ($('goalDoneBtn')) {
      $('goalDoneBtn').textContent = goal.done ? '↺ Reopen' : '✓ Done'
    }
  } else {
    banner.hidden = true
    if (hubPill) hubPill.hidden = true
    if (hubBtn) {
      hubBtn.classList.remove('active')
      hubBtn.setAttribute('aria-pressed', 'false')
    }
  }
  updateButtonActiveStates()
}

async function promptSetRoomGoal(initialText = '') {
  if (readOnlyNow()) return toast('This room is read-only')
  const ymeta = ydoc.getMap('meta')
  const curGoal = ymeta.get('roomGoal')
  const prevText = initialText || (curGoal ? curGoal.text : '')

  const text = await ask({
    title: '🎯 Collaborative Room Goal',
    body: 'Set a shared objective or task milestone for everyone in this room.',
    input: true,
    placeholder: 'e.g. Implement Dijkstra in C++ / Build Login Form',
    confirmLabel: 'Set Goal',
  })

  if (!text || !text.trim()) return
  setRoomGoal(text.trim())
}

function setRoomGoal(text) {
  if (readOnlyNow()) return toast('This room is read-only')
  const ymeta = ydoc.getMap('meta')
  ymeta.set('roomGoal', {
    text: text.slice(0, 300),
    done: false,
    author: myName,
    ts: Date.now()
  })
  toast('🎯 Room Goal set: ' + text)
  ydoc.getArray('chat').push([{
    name: 'Room Goal',
    color: '#38bdf8',
    text: `🎯 Goal updated by ${myName || 'collaborator'}: "${text}"`,
    ts: Date.now()
  }])
}

function toggleRoomGoalDone() {
  if (readOnlyNow()) return toast('This room is read-only')
  const ymeta = ydoc.getMap('meta')
  const cur = ymeta.get('roomGoal')
  if (!cur) return
  const nextDone = !cur.done
  ymeta.set('roomGoal', { ...cur, done: nextDone })
  toast(nextDone ? '🎉 Goal marked as completed!' : 'Goal reopened')
}

async function clearRoomGoal() {
  if (readOnlyNow()) return toast('This room is read-only')
  const ok = await ask({
    title: 'Clear Room Goal?',
    body: 'Remove the pinned goal banner for everyone in this room.',
    confirmLabel: 'Clear Goal',
    danger: true,
  })
  if (!ok) return
  const ymeta = ydoc.getMap('meta')
  ymeta.delete('roomGoal')
  toast('Room goal cleared')
}

// --- Feature: In-Browser Web & Documentation Browser (/browser) ---
function openBrowser(url) {
  const targetUrl = url || $('browserUrlInput')?.value || 'https://devdocs.io'
  if ($('browserUrlInput')) $('browserUrlInput').value = targetUrl
  if ($('browserIframe')) $('browserIframe').src = targetUrl
  if ($('browserExtLink')) $('browserExtLink').href = targetUrl
  toggleBrowserDrawer(true)
}

function toggleBrowserDrawer(force, url) {
  const next = typeof force === 'boolean' ? !force : !$('browserDrawer').hidden
  $('browserDrawer').hidden = next
  updateButtonActiveStates()
  if (!next && url) {
    openBrowser(url)
  }
}

// --- Feature: Teamwork Collaborative Multi-Device Live Preview (/teamwork-preview) ---
let currentPreviewDevice = 'desk'
let isLandscape = false

function setPreviewDevice(dev) {
  currentPreviewDevice = dev
  const holder = $('previewFrameHolder')
  if (!holder) return
  holder.classList.remove('device-tablet', 'device-mobile')
  if (dev === 'tab') holder.classList.add('device-tablet')
  if (dev === 'mob') holder.classList.add('device-mobile')

  if ($('prevDevDesk')) $('prevDevDesk').classList.toggle('active', dev === 'desk')
  if ($('prevDevTab')) $('prevDevTab').classList.toggle('active', dev === 'tab')
  if ($('prevDevMob')) $('prevDevMob').classList.toggle('active', dev === 'mob')
}

function toggleDeviceOrientation() {
  isLandscape = !isLandscape
  const holder = $('previewFrameHolder')
  if (holder) holder.classList.toggle('device-landscape', isLandscape)
  toast(isLandscape ? 'Landscape orientation (667px)' : 'Portrait orientation')
}

function openTeamworkPreview() {
  previewMode = 'web'
  toggleLivePreview(true)
  setPreviewDevice('desk')
  toast('👥 Teamwork Multi-Device Live Preview Active')
}

// --- Feature: Turbo Developer Boost Mode (/boost) ---
let turboActive = false
let turboPingTimer = null

function toggleTurboBoost() {
  turboActive = !turboActive
  document.body.classList.toggle('turbo-boost', turboActive)
  if ($('turboBadge')) $('turboBadge').hidden = !turboActive

  if (turboActive) {
    measureRelayPing()
    clearInterval(turboPingTimer)
    turboPingTimer = setInterval(measureRelayPing, 4000)
    toast('⚡ TURBO BOOST ACTIVATED (Fast Runner Cache & Live Latency)')
    ydoc.getArray('chat').push([{
      name: 'System',
      color: '#f59e0b',
      text: `⚡ ${myName || 'Collaborator'} activated Turbo Boost mode!`,
      ts: Date.now()
    }])
  } else {
    clearInterval(turboPingTimer)
    turboPingTimer = null
    toast('Turbo Boost deactivated')
  }
}

async function measureRelayPing() {
  if (!turboActive) return
  const start = performance.now()
  try {
    const host = relayHost().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
    const proto = location.protocol === 'https:' || !host.includes('localhost') ? 'https:' : 'http:'
    const res = await fetch(`${proto}//${host}/health`, { method: 'GET', cache: 'no-store' })
    if (res.ok) {
      const rtt = Math.round(performance.now() - start)
      if ($('turboPing')) $('turboPing').textContent = `${rtt}ms`
    }
  } catch (e) {
    if ($('turboPing')) $('turboPing').textContent = 'p2p'
  }
}

// --- Feature: Generative UI Component Builder (/generative_ui) ---
let currentGenCode = ''

function openGenerativeUi(initialPrompt = '') {
  if ($('genUiModal')) $('genUiModal').hidden = false
  renderGenPresets()
  if ($('genUiPrompt') && initialPrompt) {
    $('genUiPrompt').value = initialPrompt
    generateAndPreviewUi(initialPrompt)
  } else if (!currentGenCode) {
    generateAndPreviewUi('calculator')
  }
}

function renderGenPresets() {
  const container = $('genUiPresets')
  if (!container || container.children.length > 0) return
  container.innerHTML = ''
  for (const t of UI_TEMPLATES) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'gen-preset-chip'
    chip.innerHTML = `<span>${t.icon}</span> <span>${t.name}</span>`
    chip.onclick = () => {
      if ($('genUiPrompt')) $('genUiPrompt').value = t.name
      currentGenCode = t.html
      updateGenPreview(currentGenCode)
    }
    container.appendChild(chip)
  }
}

function generateAndPreviewUi(prompt) {
  const code = generateUiFromPrompt(prompt)
  currentGenCode = code
  updateGenPreview(code)
}

function updateGenPreview(code) {
  const iframe = $('genUiPreviewIframe')
  if (iframe) iframe.srcdoc = code
}

function insertGenUiAtCursor() {
  if (readOnlyNow()) return toast('This room is read-only')
  if (!view || !currentGenCode) return
  view.dispatch(view.state.replaceSelection(currentGenCode))
  view.focus()
  if ($('genUiModal')) $('genUiModal').hidden = true
  toast('✨ UI component inserted at cursor')
}

function openGenUiAsNewTab() {
  if (readOnlyNow()) return toast('This room is read-only')
  if (!currentGenCode) return
  const promptVal = $('genUiPrompt')?.value.trim() || 'component'
  const cleanName = promptVal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'generated-ui'
  const filename = `${cleanName}.html`
  const fid = addFile(filename, currentGenCode)
  openFile(fid)
  if ($('genUiModal')) $('genUiModal').hidden = true
  toggleLivePreview(true)
  toast(`✨ Created "${filename}" and opened in live preview!`)
}

// --- Feature 1: Code Runner with Stdin Input ---
async function triggerRunCode() {
  if (!activeId || !ytexts.get(activeId)) return
  const code = ytexts.get(activeId).toString()
  const lang = currentLang()

  $('terminal').hidden = false
  updateButtonActiveStates()
  if ($('termTabOut')) $('termTabOut').click()
  $('termStatus').textContent = 'Running...'
  $('termStatus').style.background = 'var(--warn)'
  $('termTime').hidden = true
  $('termLang').textContent = lang
  $('termOut').textContent = ''
  if ($('termPromptBanner')) $('termPromptBanner').hidden = true

  const stdinVal = $('termStdinArea') ? $('termStdinArea').value : ($('termStdin') ? $('termStdin').value : '')

  try {
    const res = await runCode({
      language: lang,
      code,
      stdin: stdinVal,
      relayHost: relayHost(),
      allowThirdPartyExecution: true,
    })

    $('termOut').textContent = res.stdout || (res.stderr ? '' : '(Program exited with no output)')
    if (res.stderr) {
      if ($('termOut').textContent && !$('termOut').textContent.startsWith('(')) $('termOut').textContent += '\n'
      $('termOut').textContent += res.stderr
    }

    const needsInput = res.stderr && (res.stderr.includes('EOFError') || res.stderr.includes('EOF when reading a line') || res.stderr.includes('NoSuchElementException'))
    if ($('termPromptBanner')) $('termPromptBanner').hidden = !needsInput
    if (needsInput && !stdinVal) {
      toast('💡 Program requested input. Enter input in the Input tab and click Run.')
    }

    if (res.errorPositions && res.errorPositions.length > 0) {
      const errBar = document.createElement('div')
      errBar.style.cssText = 'padding:6px 10px;background:rgba(255,77,79,0.12);border-bottom:1px solid rgba(255,77,79,0.3);display:flex;align-items:center;gap:8px;font-size:11px'
      errBar.innerHTML = '<span style="color:#ff7b72;font-weight:600">&#9888;&#65039; Detected errors:</span> ' +
        res.errorPositions.slice(0, 5).map(p => `<button class="btn sm" data-jump-line="${p.line}" style="color:#ff7b72;border-color:rgba(255,77,79,0.4)">Line ${p.line}</button>`).join(' ')
      $('termOut').prepend(errBar)
      errBar.querySelectorAll('button[data-jump-line]').forEach(b => {
        b.onclick = () => jumpToLine(parseInt(b.dataset.jumpLine, 10))
      })
    }

    $('termStatus').textContent = res.ok ? 'Exit: 0' : `Exit: ${res.exitCode ?? 1}`
    $('termStatus').style.background = res.ok ? 'var(--ok)' : 'var(--danger)'
    if (res.executionTime != null) {
      $('termTime').textContent = `${res.executionTime}ms`
      $('termTime').hidden = false
    }
  } catch (err) {
    $('termOut').textContent = String(err.message || err)
    $('termStatus').textContent = 'Error'
    $('termStatus').style.background = 'var(--danger)'
  }
}

// --- Feature 7: Code Formatter ---
function triggerFormatCode() {
  if (readOnlyNow()) return toast('This room is read-only')
  if (!activeId || !ytexts.get(activeId)) return
  const yt = ytexts.get(activeId)
  const src = yt.toString()
  const formatted = formatCode(src, currentLang())
  if (formatted !== src) {
    ydoc.transact(() => {
      yt.delete(0, yt.length)
      yt.insert(0, formatted)
    }, 'local')
    toast('Document formatted')
  } else {
    toast('Already formatted')
  }
}

// --- Feature 6: Artifacts-Style Split Screen & Live Preview ---
let previewMode = 'auto' // 'auto' | 'web' | 'markdown' | 'doc'
let previewOpen = false

function toggleLivePreview(force) {
  previewOpen = typeof force === 'boolean' ? force : !previewOpen
  $('previewWrap').hidden = !previewOpen
  updateButtonActiveStates()
  if (previewOpen) updateLivePreview()
}

function updateLivePreview() {
  if (!previewOpen) return
  const lang = currentLang()
  const content = (activeId && ytexts.get(activeId)) ? ytexts.get(activeId).toString() : ''

  if (previewMode === 'doc') {
    if ($('prevModeDoc')) { $('prevModeDoc').classList.add('active'); $('prevModeDoc').setAttribute('aria-checked', 'true') }
    if ($('prevModeWeb')) { $('prevModeWeb').classList.remove('active'); $('prevModeWeb').setAttribute('aria-checked', 'false') }
    if ($('prevModeMd')) { $('prevModeMd').classList.remove('active'); $('prevModeMd').setAttribute('aria-checked', 'false') }
    $('htmlPreview').hidden = true
    $('mdPreview').hidden = true
    if ($('pdfPreview').hidden && (!$('docPreview').innerHTML || $('docPreview').hidden)) {
      $('docPreview').hidden = false
      $('docPreview').innerHTML = `
        <div class="docx-document" style="text-align:center;padding:40px 20px;color:var(--mut)">
          <h2 style="color:var(--fg);margin-bottom:8px">📄 Assignment Document Viewer</h2>
          <p style="max-width:440px;margin:0 auto 16px">Open any assignment <strong>PDF</strong> or <strong>Word (.docx)</strong> file to read the problem statement side-by-side with your code.</p>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">
            <button class="btn primary sm" id="prevOpenPickerBtn">📂 Choose PDF or Word Doc</button>
            <button class="btn sm" onclick="document.getElementById('hubFilesBtn').click()">Open Shared Files Hub</button>
          </div>
          <input type="file" id="prevDocPicker" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none">
        </div>
      `
      const pickerBtn = $('prevOpenPickerBtn')
      const docPicker = $('prevDocPicker')
      if (pickerBtn && docPicker) {
        pickerBtn.onclick = () => docPicker.click()
        docPicker.onchange = async e => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
              const url = URL.createObjectURL(file)
              $('docPreview').hidden = true
              $('pdfPreview').hidden = false
              $('pdfPreview').src = url
              toast('📖 Loaded ' + file.name + ' in split view')
            } else if (file.name.toLowerCase().endsWith('.docx') || file.type.includes('wordprocessingml')) {
              toast('Rendering Word document...')
              const buf = await file.arrayBuffer()
              const html = await renderDocxToHtml(buf, file.name)
              $('pdfPreview').hidden = true
              $('docPreview').hidden = false
              $('docPreview').innerHTML = html
              toast('📖 Loaded ' + file.name + ' in split view')
            } else {
              toast('Please choose a .docx or .pdf file')
              return
            }
            handleFileUpload(file)
          } catch (err) {
            toast('Failed to load document: ' + err.message)
          }
        }
      }
    }
    return
  }

  const looksLikeHtml = /<!doctype\s+html|<html[\s>]|<div|<p[\s>]|<span|<svg|<button|<canvas|<script|<style/i.test(content)
  const isWeb = previewMode === 'web' || (previewMode === 'auto' && (lang === 'html' || lang === 'svg' || looksLikeHtml))

  if (isWeb) {
    $('mdPreview').hidden = true
    $('docPreview').hidden = true
    $('pdfPreview').hidden = true
    $('htmlPreview').hidden = false
    if ($('prevModeWeb')) { $('prevModeWeb').classList.add('active'); $('prevModeWeb').setAttribute('aria-checked', 'true') }
    if ($('prevModeMd')) { $('prevModeMd').classList.remove('active'); $('prevModeMd').setAttribute('aria-checked', 'false') }
    if ($('prevModeDoc')) { $('prevModeDoc').classList.remove('active'); $('prevModeDoc').setAttribute('aria-checked', 'false') }

    // Bundle multi-file CSS & JS in the room
    let extraCss = '', extraJs = ''
    try {
      for (const f of files()) {
        if (f.id !== activeId) {
          const fText = (ytexts.get(f.id) || '').toString()
          if (f.name.endsWith('.css') || f.name.includes('style')) extraCss += fText + '\n'
          else if (f.name.endsWith('.js') && !f.name.includes('test')) extraJs += fText + '\n'
        }
      }
    } catch (e) {}

    updateHtmlPreview($('htmlPreview'), content, { extraCss, extraJs })
  } else {
    $('htmlPreview').hidden = true
    $('docPreview').hidden = true
    $('pdfPreview').hidden = true
    $('mdPreview').hidden = false
    if ($('prevModeMd')) { $('prevModeMd').classList.add('active'); $('prevModeMd').setAttribute('aria-checked', 'true') }
    if ($('prevModeWeb')) { $('prevModeWeb').classList.remove('active'); $('prevModeWeb').setAttribute('aria-checked', 'false') }
    if ($('prevModeDoc')) { $('prevModeDoc').classList.remove('active'); $('prevModeDoc').setAttribute('aria-checked', 'false') }
    $('mdPreview').innerHTML = renderMarkdown(content)
  }
}

// --- Feature 2: Dedicated Media & File Sharing Hub (up to 25MB) ---
function toggleFileDrawer(force) {
  const next = typeof force === 'boolean' ? !force : !$('fileDrawer').hidden
  $('fileDrawer').hidden = next
  updateButtonActiveStates()
  if (!next) renderSharedFiles()
}

function updateFileCountBadges() {
  const arr = (ysharedFiles || (ydoc ? ydoc.getArray('shared_files') : null))?.toArray() || []
  const count = arr.length
  if ($('hubFilesCount')) $('hubFilesCount').textContent = count
  if ($('fileCountBadge')) $('fileCountBadge').textContent = count + (count === 1 ? ' file' : ' files')
  if ($('filesDot')) $('filesDot').hidden = count === 0
}

function renderSharedFiles() {
  const list = $('sharedFileList')
  if (!list || !ydoc) return
  list.innerHTML = ''
  const arr = (ysharedFiles || ydoc.getArray('shared_files')).toArray()
  updateFileCountBadges()

  if (!arr.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:28px 12px;color:var(--mut);">
        <p style="font:600 13px/1.4 var(--sans);margin-bottom:6px">No files shared yet in this room</p>
        <p class="fineprint">Drag and drop any Video, PDF, Image, Audio, or Archive above to share it with everyone here.</p>
      </div>`
    return
  }

  for (let idx = 0; idx < arr.length; idx++) {
    const f = arr[idx]
    const card = document.createElement('div')
    card.className = 'shared-card'

    const sizeStr = f.size < 1024 * 1024
      ? (f.size / 1024).toFixed(1) + ' KB'
      : (f.size / (1024 * 1024)).toFixed(2) + ' MB'

    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const mime = (f.type || '').toLowerCase()
    const isVideo = mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)
    const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)
    const isAudio = mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)
    const isPdf = mime === 'application/pdf' || ext === 'pdf'
    const isDocx = ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    let typeTag = 'FILE'
    let typeClass = ''
    if (isVideo) { typeTag = 'VIDEO'; typeClass = 'video' }
    else if (isImage) { typeTag = 'IMAGE'; typeClass = 'image' }
    else if (isPdf) { typeTag = 'PDF'; typeClass = 'pdf' }
    else if (isDocx) { typeTag = 'DOCX'; typeClass = 'docx' }
    else if (isAudio) { typeTag = 'AUDIO'; typeClass = 'audio' }

    card.innerHTML = `
      <div class="shared-card-head">
        <span class="file-type-badge ${typeClass}">${typeTag}</span>
        <span class="shared-card-name" title="${f.name}">${f.name}</span>
        <span class="shared-card-size">${sizeStr}</span>
      </div>
      <div class="shared-media-container" id="media_wrap_${f.id}" hidden></div>
      <div class="shared-card-foot">
        ${isVideo ? `<button class="btn sm primary play-video-btn" id="play_btn_${f.id}">▶ Play Video</button>` : ''}
        ${isImage ? `<button class="btn sm view-img-btn" id="view_img_${f.id}">👁️ Preview Image</button>` : ''}
        ${isAudio ? `<button class="btn sm play-audio-btn" id="play_audio_${f.id}">▶ Play Audio</button>` : ''}
        ${isDocx ? `<button class="btn sm primary split-view-btn" id="view_docx_split_${f.id}" title="Read assignment Word document side-by-side with your code">📖 Read in Split View</button>` : ''}
        ${isPdf ? `<button class="btn sm primary split-view-btn" id="view_pdf_split_${f.id}" title="Read assignment PDF side-by-side with your code">📖 Read in Split View</button><button class="btn sm view-pdf-btn" id="view_pdf_${f.id}" title="Open PDF in a new browser tab">📄 Open Tab</button>` : ''}
        <span class="grow"></span>
        <button class="btn sm dl-btn" id="dl_${f.id}">⬇ Download</button>
        <button class="btn sm flat del-btn" title="Remove file" id="del_${f.id}">&times;</button>
      </div>
    `

    // Download handler
    card.querySelector(`#dl_${f.id}`).onclick = async () => {
      try {
        toast('Decrypting ' + f.name + '...')
        const blob = await downloadAndDecryptFile({
          fileMeta: f,
          roomCode: CODE,
          relayHost: relayHost(),
          roomKey: KEY,
          authToken: AUTH,
        })
        saveBlobAsFile(blob, f.name)
        toast(f.name + ' downloaded')
      } catch (err) {
        toast('Download failed: ' + err.message)
      }
    }

    // Play Video handler
    if (isVideo) {
      card.querySelector(`#play_btn_${f.id}`).onclick = async () => {
        const wrap = card.querySelector(`#media_wrap_${f.id}`)
        if (!wrap.hidden) { wrap.hidden = true; wrap.innerHTML = ''; return }
        try {
          toast('Decrypting video for playback...')
          const blob = await downloadAndDecryptFile({
            fileMeta: f,
            roomCode: CODE,
            relayHost: relayHost(),
            roomKey: KEY,
            authToken: AUTH,
          })
          const url = URL.createObjectURL(blob)
          wrap.hidden = false
          wrap.innerHTML = `<div class="shared-media-preview"><video class="shared-video-player" controls autoplay src="${url}"></video></div>`
        } catch (err) {
          toast('Could not play video: ' + err.message)
        }
      }
    }

    // View Image handler
    if (isImage) {
      card.querySelector(`#view_img_${f.id}`).onclick = async () => {
        const wrap = card.querySelector(`#media_wrap_${f.id}`)
        if (!wrap.hidden) { wrap.hidden = true; wrap.innerHTML = ''; return }
        try {
          toast('Decrypting image preview...')
          const blob = await downloadAndDecryptFile({
            fileMeta: f,
            roomCode: CODE,
            relayHost: relayHost(),
            roomKey: KEY,
            authToken: AUTH,
          })
          const url = URL.createObjectURL(blob)
          wrap.hidden = false
          wrap.innerHTML = `<div class="shared-media-preview"><img class="shared-img-preview" src="${url}" alt="${f.name}"></div>`
        } catch (err) {
          toast('Could not load image: ' + err.message)
        }
      }
    }

    // Play Audio handler
    if (isAudio) {
      card.querySelector(`#play_audio_${f.id}`).onclick = async () => {
        const wrap = card.querySelector(`#media_wrap_${f.id}`)
        if (!wrap.hidden) { wrap.hidden = true; wrap.innerHTML = ''; return }
        try {
          toast('Decrypting audio...')
          const blob = await downloadAndDecryptFile({
            fileMeta: f,
            roomCode: CODE,
            relayHost: relayHost(),
            roomKey: KEY,
            authToken: AUTH,
          })
          const url = URL.createObjectURL(blob)
          wrap.hidden = false
          wrap.innerHTML = `<div style="padding:10px;background:#18181b"><audio controls autoplay style="width:100%" src="${url}"></audio></div>`
        } catch (err) {
          toast('Could not play audio: ' + err.message)
        }
      }
    }

    // Word (.docx) Split View handler
    if (isDocx && card.querySelector(`#view_docx_split_${f.id}`)) {
      card.querySelector(`#view_docx_split_${f.id}`).onclick = async () => {
        try {
          toast('Decrypting & rendering ' + f.name + '...')
          const blob = await downloadAndDecryptFile({
            fileMeta: f,
            roomCode: CODE,
            relayHost: relayHost(),
            roomKey: KEY,
            authToken: AUTH,
          })
          const buf = await blob.arrayBuffer()
          const html = await renderDocxToHtml(buf, f.name)
          previewMode = 'doc'
          if ($('pdfPreview')) $('pdfPreview').hidden = true
          if ($('htmlPreview')) $('htmlPreview').hidden = true
          if ($('mdPreview')) $('mdPreview').hidden = true
          if ($('docPreview')) {
            $('docPreview').hidden = false
            $('docPreview').innerHTML = html
          }
          toggleLivePreview(true)
          toast(`📖 Loaded "${f.name}" in Split View`)
        } catch (err) {
          console.error('Word rendering error:', err)
          toast('Could not render Word doc: ' + err.message)
        }
      }
    }

    // View PDF handler
    if (isPdf) {
      if (card.querySelector(`#view_pdf_split_${f.id}`)) {
        card.querySelector(`#view_pdf_split_${f.id}`).onclick = async () => {
          try {
            toast('Decrypting ' + f.name + ' for Split View...')
            const blob = await downloadAndDecryptFile({
              fileMeta: f,
              roomCode: CODE,
              relayHost: relayHost(),
              roomKey: KEY,
              authToken: AUTH,
            })
            const url = URL.createObjectURL(blob)
            previewMode = 'doc'
            if ($('docPreview')) $('docPreview').hidden = true
            if ($('htmlPreview')) $('htmlPreview').hidden = true
            if ($('mdPreview')) $('mdPreview').hidden = true
            if ($('pdfPreview')) {
              $('pdfPreview').hidden = false
              $('pdfPreview').src = url
            }
            toggleLivePreview(true)
            toast(`📖 Loaded "${f.name}" in Split View`)
          } catch (err) {
            console.error('PDF view error:', err)
            toast('Could not open PDF: ' + err.message)
          }
        }
      }

      if (card.querySelector(`#view_pdf_${f.id}`)) {
        card.querySelector(`#view_pdf_${f.id}`).onclick = async () => {
          try {
            toast('Decrypting PDF...')
            const blob = await downloadAndDecryptFile({
              fileMeta: f,
              roomCode: CODE,
              relayHost: relayHost(),
              roomKey: KEY,
              authToken: AUTH,
            })
            const url = URL.createObjectURL(blob)
            window.open(url, '_blank')
          } catch (err) {
            toast('Could not open PDF: ' + err.message)
          }
        }
      }
    }

    // Delete handler
    card.querySelector(`#del_${f.id}`).onclick = () => {
      const yArr = ysharedFiles || ydoc.getArray('shared_files')
      const targetIdx = yArr.toArray().findIndex(item => item.id === f.id)
      if (targetIdx !== -1) {
        yArr.delete(targetIdx, 1)
        toast('Removed ' + f.name)
        renderSharedFiles()
      }
    }

    list.appendChild(card)
  }
}

async function handleFileUpload(file) {
  if (readOnlyNow()) return toast('This room is read-only')
  if (file.size > 25 * 1024 * 1024) return toast('File exceeds 25 MB limit')

  $('uploadProgWrap').hidden = false
  $('uploadProgBar').style.width = '0%'
  $('uploadProgText').textContent = 'Encrypting & uploading 0%...'

  try {
    const meta = await uploadEncryptedFile({
      file,
      roomCode: CODE,
      relayHost: relayHost(),
      roomKey: KEY,
      authToken: AUTH,
      onProgress: p => {
        $('uploadProgBar').style.width = p.percent + '%'
        $('uploadProgText').textContent = p.percent + '%'
      },
    })

    ;(ysharedFiles || ydoc.getArray('shared_files')).push([meta])
    toast(file.name + ' encrypted & shared')
    $('uploadProgWrap').hidden = true
    renderSharedFiles()
  } catch (err) {
    $('uploadProgWrap').hidden = true
    toast('Upload failed: ' + err.message)
  }
}

// --- Feature 8: Ephemeral WebRTC Voice Chat ---
async function toggleVoiceChat(e) {
  if (!voiceMesh) {
    toast('Voice mesh initializing...')
    return
  }

  // Shift-click or explicit disconnect
  if (e && (e.shiftKey || e === false)) {
    if (voiceActive) {
      voiceMesh.stop()
      voiceActive = false
      updateButtonActiveStates()
      toast('⏹️ Voice chat disconnected')
    }
    return
  }

  if (!voiceActive) {
    try {
      toast('Connecting voice... please allow microphone access')
      const ok = await voiceMesh.start()
      if (ok) {
        voiceActive = true
        voiceMesh.setMuted(false)
        if (typeof awareness !== 'undefined' && awareness) {
          for (const [clientId] of awareness.getStates()) {
            if (clientId !== ydoc.clientID) {
              voiceMesh.callPeer(String(clientId))
            }
          }
        }
        updateButtonActiveStates()
        toast('🎤 Microphone connected (Live in room)')
      }
    } catch (err) {
      console.warn('Microphone permission error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast('⚠️ Microphone access was denied. Click the lock icon in your browser address bar to allow microphone access.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast('⚠️ No microphone found on this device.')
      } else {
        toast('⚠️ Microphone error: ' + (err.message || err))
      }
      updateButtonActiveStates()
    }
  } else {
    // 3-step cycle: Active (unmuted) -> Mute -> Disconnect
    if (!voiceMesh.isMuted) {
      voiceMesh.setMuted(true)
      updateButtonActiveStates()
      toast('🔇 Microphone muted (Click to disconnect)')
    } else {
      voiceMesh.stop()
      voiceActive = false
      updateButtonActiveStates()
      toast('⏹️ Voice chat disconnected')
    }
  }
}

// --- Feature 4: Time Machine / Revisions ---
function getFileSnapshots(fileId) {
  if (!fileId) return []
  if (!fileSnapshots.has(fileId)) fileSnapshots.set(fileId, [])
  return fileSnapshots.get(fileId)
}

function recordHistorySnapshot(fileId = activeId, force = false) {
  if (!fileId || !ytexts.get(fileId)) return
  const txt = ytexts.get(fileId).toString()
  const snaps = getFileSnapshots(fileId)

  if (!snaps.length) {
    snaps.push({ time: Date.now(), text: txt })
    return
  }

  if (force) {
    if (snaps[snaps.length - 1].text !== txt) {
      snaps.push({ time: Date.now(), text: txt })
      if (snaps.length > 100) snaps.shift()
      if (!$('historyDrawer').hidden && activeId === fileId) updateHistoryView()
    }
    return
  }

  clearTimeout(histTimer)
  histTimer = setTimeout(() => {
    if (!activeId || !ytexts.get(activeId)) return
    const currentTxt = ytexts.get(activeId).toString()
    const currentSnaps = getFileSnapshots(activeId)
    if (!currentSnaps.length || currentSnaps[currentSnaps.length - 1].text !== currentTxt) {
      currentSnaps.push({ time: Date.now(), text: currentTxt })
      if (currentSnaps.length > 100) currentSnaps.shift()
      if (!$('historyDrawer').hidden) updateHistoryView()
    }
  }, 800)
}

function toggleHistoryDrawer(force) {
  const next = typeof force === 'boolean' ? !force : !$('historyDrawer').hidden
  $('historyDrawer').hidden = next
  updateButtonActiveStates()
  if (!next) {
    recordHistorySnapshot(activeId, true)
    const snaps = getFileSnapshots(activeId)
    const slider = $('histSlider')
    slider.max = Math.max(0, snaps.length - 1)
    slider.value = Math.max(0, snaps.length - 1)
    updateHistoryView()
  }
}

function updateHistoryView() {
  const snaps = getFileSnapshots(activeId)
  const slider = $('histSlider')
  const cur = (activeId && ytexts.get(activeId)) ? ytexts.get(activeId).toString() : ''
  const curName = activeName() || 'file'

  if ($('histActiveFileBadge')) $('histActiveFileBadge').textContent = curName
  slider.max = Math.max(0, snaps.length - 1)

  let idx = parseInt(slider.value, 10)
  if (isNaN(idx) || idx < 0 || idx >= snaps.length) {
    idx = Math.max(0, snaps.length - 1)
    slider.value = idx
  }

  const snap = snaps[idx]
  if (snap) {
    const elapsedSec = Math.max(0, Math.round((Date.now() - snap.time) / 1000))
    const timeAgo = elapsedSec < 60 ? `${elapsedSec}s ago` : `${Math.round(elapsedSec / 60)}m ago`
    $('histTimestamp').textContent = `${new Date(snap.time).toLocaleTimeString()} (${timeAgo})`
    $('histCount').textContent = `Revision ${idx + 1}/${snaps.length}`

    const snapLines = snap.text ? snap.text.split('\n').length : 0
    const curLines = cur ? cur.split('\n').length : 0
    const delta = snapLines - curLines
    $('histDelta').textContent = delta === 0 ? 'same line count' : (delta > 0 ? `+${delta} lines` : `${delta} lines`)

    if (histViewMode === 'snap') {
      $('histDiff').hidden = true
      $('histSnapshot').hidden = false
      $('histSnapshot').textContent = snap.text || '(empty document)'
      if ($('histModeDiff')) $('histModeDiff').classList.remove('on')
      if ($('histModeSnap')) $('histModeSnap').classList.add('on')
    } else {
      $('histSnapshot').hidden = true
      $('histDiff').hidden = false
      $('histDiff').innerHTML = renderVisualDiff(snap.text, cur)
      if ($('histModeSnap')) $('histModeSnap').classList.remove('on')
      if ($('histModeDiff')) $('histModeDiff').classList.add('on')
    }
  } else {
    $('histTimestamp').textContent = 'Live document'
    $('histCount').textContent = '1/1'
    $('histDelta').textContent = '0 changes'
    $('histDiff').innerHTML = `<div class="diff-container"><div class="diff-line diff-same">${cur || '(empty document)'}</div></div>`
  }

  if ($('histStepOldest')) $('histStepOldest').disabled = (idx <= 0)
  if ($('histStepBack')) $('histStepBack').disabled = (idx <= 0)
  if ($('histStepFwd')) $('histStepFwd').disabled = (idx >= snaps.length - 1)
  if ($('histStepLatest')) $('histStepLatest').disabled = (idx >= snaps.length - 1)
}

async function revertCurrentFile() {
  if (readOnlyNow()) return toast('This room is read-only')
  const snaps = getFileSnapshots(activeId)
  const idx = parseInt($('histSlider').value, 10)
  const snap = snaps[idx]
  if (!snap) return

  const ok = await ask({
    title: 'Revert to this revision?',
    body: `Replace contents of "${activeName()}" with Revision ${idx + 1} (${new Date(snap.time).toLocaleTimeString()})? You can still undo with Ctrl+Z.`,
    confirmLabel: 'Revert file',
  })
  if (!ok) return

  const yt = ytexts.get(activeId)
  if (yt) {
    ydoc.transact(() => {
      yt.delete(0, yt.length)
      yt.insert(0, snap.text)
    }, 'local')
    toast(`Reverted to revision ${idx + 1}`)
    toggleHistoryDrawer(false)
  }
}

function restoreAsNewTab() {
  if (readOnlyNow()) return toast('This room is read-only')
  const snaps = getFileSnapshots(activeId)
  const idx = parseInt($('histSlider').value, 10)
  const snap = snaps[idx]
  if (!snap) return

  const name = activeName() || 'file'
  const dot = name.lastIndexOf('.')
  const base = dot !== -1 ? name.slice(0, dot) : name
  const ext = dot !== -1 ? name.slice(dot) : '.txt'
  const newName = `${base}-rev${idx + 1}${ext}`

  addFile(newName, snap.text)
  toast(`Opened "${newName}" in a new tab`)
  toggleHistoryDrawer(false)
}

// --- Feature 12: GitHub / Gist Direct Import ---
async function importFromGitHub() {
  if (readOnlyNow()) return toast('This room is read-only')
  const url = await ask({
    title: 'Import from GitHub or Gist',
    body: 'Paste any GitHub file URL or raw Gist URL to import its contents.',
    input: true,
    placeholder: 'https://github.com/user/repo/blob/main/index.js',
    confirmLabel: 'Import',
  })
  if (!url) return

  let rawUrl = url.trim()
  if (rawUrl.includes('github.com') && rawUrl.includes('/blob/')) {
    rawUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
  }

  try {
    toast('Fetching file...')
    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const text = await res.text()
    const parts = rawUrl.split('/')
    const filename = parts[parts.length - 1].split('?')[0] || 'imported.txt'
    const fid = addFile(filename, text)
    openFile(fid)
    toast('Imported ' + filename)
  } catch (e) {
    toast('Failed to fetch from URL: ' + e.message)
  }
}

const ACTIONS = {
  palette: () => openPalette(),
  runcode: () => triggerRunCode(),
  run: () => triggerRunCode(),
  format: () => triggerFormatCode(),
  preview: () => toggleLivePreview(),
  fileshare: () => toggleFileDrawer(),
  recentrooms: () => toggleBookmarksDrawer(),
  zenmode: () => toggleZenMode(),
  history: () => toggleHistoryDrawer(),
  importgit: () => importFromGitHub(),
  newfile: () => $('newFile').click(),
  rename: () => renameFile(activeId),
  find: () => { if (view) { view.focus(); openSearchPanel(view) } },
  download: () => {
    const f = files().find(x => x.id === activeId)
    downloadBlob(new Blob([view.state.doc.toString()], { type: 'text/plain;charset=utf-8' }),
      (f && f.name) || CODE + '.txt')
  },
  exportzip: async () => {
    try {
      const { makeZip } = await import('./zip.js')
      const entries = files().map(f => ({ name: f.name, text: (ytexts.get(f.id) || { toString: () => '' }).toString() }))
      downloadBlob(makeZip(entries), 'anonshare-' + CODE + '.zip')
    } catch (e) { toast('Could not build the archive') }
  },
  invite: async () => {
    const shareUrl = inviteLink()
    const text = `Join my encrypted scratchpad on anonshare: ${CODE}${typeof PASS !== 'undefined' && PASS ? ' (Password: ' + PASS + ')' : ''}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'anonshare ' + CODE, text, url: shareUrl })
        return
      } catch (e) {}
    }
    copy(shareUrl, 'Invite link')
  },
  viewlink: () => copy(viewLink(), 'View-only link'),
  theme: () => {
    const themes = ['dark', 'light', 'dracula', 'nord', 'monokai']
    const cur = themePref()
    const next = themes[(themes.indexOf(cur) + 1) % themes.length]
    LS.set('ts.theme', next)
    applyTheme()
  },
  settings: () => showPanel($('panel')),
  leave: () => leaveRoom(),
  say: () => cursorChat(),
  files: () => toggleFileDrawer(),
  chat: () => showPanel($('chat')),
  goal: () => promptSetRoomGoal(),
  browser: () => toggleBrowserDrawer(),
  teamworkpreview: () => openTeamworkPreview(),
  boost: () => toggleTurboBoost(),
  genui: () => openGenerativeUi(),
  undo: () => $('undoBtn').click(),
  redo: () => $('redoBtn').click(),
  more: () => $('moreBtn').click(),
}

$('menu').addEventListener('click', e => {
  const b = e.target.closest('button')
  if (!b) return
  const fn = ACTIONS[b.dataset.a]
  if (fn) fn()
  if (b.dataset.a !== 'theme') setMenu(false)
})
$('mbar').addEventListener('click', e => {
  const b = e.target.closest('button')
  if (b && ACTIONS[b.dataset.a]) ACTIONS[b.dataset.a]()
})

async function leaveRoom() {
  const ok = await ask({
    title: 'Leave this room?',
    body: 'Your offline copy stays on this device, and you can rejoin with the same code.',
    confirmLabel: 'Leave',
  })
  if (!ok) return
  try { relay.close() } catch (e) {}
  location.href = location.origin + location.pathname
}

$('saveSettings').onclick = () => {
  const n = $('nameInput').value.trim()
  if (n) {
    myName = n
    LS.set('ts.name', n)
    awareness.setLocalStateField('user', { name: n, color: myColor, view: VIEW_ONLY })
  }
  toast('Saved')
  paintPeople()
  $('panel').hidden = true
}

$('forgetRoom').onclick = async () => {
  const ok = await ask({
    title: 'Delete the offline copy?',
    body: 'This removes the room from this browser only. Anyone still connected keeps theirs, and you can rejoin with the code.',
    confirmLabel: 'Delete copy',
    danger: true,
  })
  if (!ok) return
  if (idb) { try { await idb.clearData() } catch (e) {} }
  location.href = location.origin + location.pathname
}

async function ownerAction(action, value, label) {
  const r = await admin(relayHost(), CODE, OWNER, action, value)
  if (!r.ok) {
    toast(r.status === 403 ? 'This browser is not the owner of this room' : 'Could not reach the relay')
    return null
  }
  if (label) toast(label)
  return r
}

$('btnLock').onclick = async () => {
  const next = !roomLocked
  const r = await ownerAction('lock', next, next ? 'Room is now read-only for others' : 'Everyone can edit again')
  if (r) { roomLocked = !!r.locked; applyRoomState({ locked: roomLocked, canEdit: true }) }
}

$('btnSuspend').onclick = async () => {
  const ok = await ask({
    title: 'Suspend this room?',
    body: 'Everyone else is disconnected immediately. Nothing is deleted, and you can resume it later.',
    confirmLabel: 'Suspend',
    danger: true,
  })
  if (!ok) return
  const r = await ownerAction('suspend', true, 'Room suspended')
  if (r) banner('You have suspended this room. Others cannot connect until you resume it.', 'warn')
}

$('btnDelete').onclick = async () => {
  const typed = await ask({
    title: 'Delete room ' + CODE + '?',
    body: 'This erases the room from the relay for everyone, immediately and permanently. Type the room code to confirm.',
    input: true, placeholder: CODE, mustType: CODE,
    confirmLabel: 'Delete forever',
    danger: true,
  })
  if (!typed) return
  const r = await ownerAction('delete', true)
  if (!r) return
  LS.del('ts.own.' + CODE)
  if (idb) { try { await idb.clearData() } catch (e) {} }
  onKilled('deleted')
}

// --- Feature 16: Room Inactivity Auto-Deletion (15m idle + 5m warning) ---
const IDLE_WARN_MS = 15 * 60 * 1000 // 15 minutes
const IDLE_KILL_MS = 20 * 60 * 1000 // 20 minutes (15m + 5m countdown)
let inactivityInterval = null

function noteActivity() {
  lastUserActivity = Date.now()
  if (inactivityWarnActive) {
    inactivityWarnActive = false
    if ($('inactivity')) $('inactivity').hidden = true
  }
}

function initInactivityTracker() {
  if (inactivityInterval) return
  lastUserActivity = Date.now()

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown']
  for (const ev of events) {
    window.addEventListener(ev, () => {
      if (Date.now() - lastUserActivity > 1500) noteActivity()
    }, { passive: true })
  }

  if ($('inactivityResume')) {
    $('inactivityResume').onclick = () => {
      noteActivity()
      toast('Room session resumed')
    }
  }

  inactivityInterval = setInterval(async () => {
    if ($('app').hidden || !CODE || killed) return
    const idleMs = Date.now() - lastUserActivity

    if (idleMs >= IDLE_KILL_MS) {
      if ($('inactivity')) $('inactivity').hidden = true
      inactivityWarnActive = false
      clearInterval(inactivityInterval)
      inactivityInterval = null

      const isOwner = !!ownerToken(CODE)
      if (isOwner) {
        try { await ownerAction('delete', true) } catch (e) {}
      }
      LS.del('ts.own.' + CODE)
      if (idb) { try { await idb.clearData() } catch (e) {} }
      try { if (relay) relay.close() } catch (e) {}

      onKilled('inactivity_deleted')
      openKilledOverlay(
        'Room deleted due to inactivity',
        'This room was automatically deleted because no activity was detected for 20 minutes (15m idle + 5m countdown).'
      )
      return
    }

    if (idleMs >= IDLE_WARN_MS) {
      if ($('inactivity') && $('inactivity').hidden) {
        $('inactivity').hidden = false
        inactivityWarnActive = true
      }
      const remainSec = Math.max(0, Math.ceil((IDLE_KILL_MS - idleMs) / 1000))
      const m = Math.floor(remainSec / 60)
      const s = remainSec % 60
      if ($('inactivityCountdown')) {
        $('inactivityCountdown').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      }
    } else if (inactivityWarnActive) {
      if ($('inactivity')) $('inactivity').hidden = true
      inactivityWarnActive = false
    }
  }, 1000)
}

const COMMANDS = [
  ['Run code', 'runcode', 'Ctrl Enter'],
  ['Format document', 'format', 'Shift Alt F'],
  ['Toggle live preview', 'preview', ''],
  ['Teamwork live preview', 'teamworkpreview', '/teamwork-preview'],
  ['Generative UI builder', 'genui', '/generative_ui'],
  ['In-browser web & docs', 'browser', '/browser'],
  ['Room goal / objective', 'goal', '/goal'],
  ['Turbo boost mode', 'boost', '/boost'],
  ['Shared files (25MB)', 'fileshare', ''],
  ['Recent rooms / history', 'recentrooms', ''],
  ['Zen mode', 'zenmode', 'F11'],
  ['Time machine / history', 'history', ''],
  ['Import from GitHub / Gist', 'importgit', ''],
  ['New file', 'newfile', ''],
  ['Rename this file', 'rename', ''],
  ['Find and replace', 'find', 'Ctrl F'],
  ['Download this file', 'download', ''],
  ['Export all files as zip', 'exportzip', ''],
  ['Share room (one-tap)', 'invite', ''],
  ['Copy view-only link', 'viewlink', ''],
  ['Say something at my cursor', 'say', 'Alt /'],
  ['Open chat', 'chat', ''],
  ['Toggle theme', 'theme', ''],
  ['Settings', 'settings', ''],
  ['Undo', 'undo', 'Ctrl Z'],
  ['Redo', 'redo', 'Ctrl Y'],
  ['Leave room', 'leave', ''],
]
let palIndex = 0, palShown = []

function openPalette() {
  lastFocus = document.activeElement
  $('pal').hidden = false
  $('palInput').value = ''
  renderPalette('')
  setTimeout(() => $('palInput').focus(), 30)
}
function closePalette() {
  $('pal').hidden = true
  if (view) view.focus()
}

function renderPalette(q) {
  const needle = q.toLowerCase().trim()
  palShown = COMMANDS.filter(c => !needle ||
    c[0].toLowerCase().includes(needle) ||
    c[1].toLowerCase().includes(needle) ||
    (c[2] && c[2].toLowerCase().includes(needle))
  )
  palIndex = 0
  const list = $('palList')
  list.innerHTML = ''
  if (!palShown.length) {
    const n = document.createElement('div')
    n.className = 'none'
    n.textContent = 'Nothing matches "' + q + '"'
    list.appendChild(n)
    return
  }
  palShown.forEach((c, i) => {
    const el = document.createElement('div')
    el.className = 'pi' + (i === 0 ? ' on' : '')
    el.setAttribute('role', 'option')
    el.textContent = c[0]
    if (c[2]) {
      const kb = document.createElement('span')
      kb.className = 'kb'
      kb.textContent = c[2]
      el.appendChild(kb)
    }
    el.onclick = () => { closePalette(); if (ACTIONS[c[1]]) ACTIONS[c[1]]() }
    list.appendChild(el)
  })
}

function movePalette(d) {
  const items = [...$('palList').children].filter(el => el.classList.contains('pi'))
  if (!items.length) return
  if (items[palIndex]) items[palIndex].classList.remove('on')
  palIndex = (palIndex + d + items.length) % items.length
  items[palIndex].classList.add('on')
  items[palIndex].scrollIntoView({ block: 'nearest' })
}

$('palInput').addEventListener('input', e => renderPalette(e.target.value))
$('palInput').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1) }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const c = palShown[palIndex]
    closePalette()
    if (c && ACTIONS[c[1]]) ACTIONS[c[1]]()
  }
})
$('pal').addEventListener('click', e => { if (e.target === $('pal')) closePalette() })

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

addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.body.classList.contains('zen-mode')) { toggleZenMode(false); return }
    if (!$('ask').hidden) return closeAsk(null)
    if (!$('pal').hidden) return closePalette()
    if (!$('modal').hidden) return $('mBack').click()
    if ($('genUiModal') && !$('genUiModal').hidden) { $('genUiModal').hidden = true; return }
    if ($('browserDrawer') && !$('browserDrawer').hidden) { toggleBrowserDrawer(false); return }
    if (!$('inactivity').hidden) { noteActivity(); return }
    if (!$('bookmarksDrawer').hidden) { toggleBookmarksDrawer(false); return }
    if (!$('fileDrawer').hidden) { toggleFileDrawer(false); return }
    if (!$('historyDrawer').hidden) { toggleHistoryDrawer(false); return }
    if (!$('terminal').hidden) { $('terminal').hidden = true; updateButtonActiveStates(); return }
    if (!$('chat').hidden) { $('chat').hidden = true; updateButtonActiveStates(); return }
    if (!$('panel').hidden) { $('panel').hidden = true; updateButtonActiveStates(); return }
    if (previewOpen) { toggleLivePreview(false); return }
    setMenu(false)
    return
  }
  if (e.key === 'F11') {
    if (!$('app').hidden) {
      e.preventDefault()
      toggleZenMode()
      return
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if ($('app').hidden) return
    e.preventDefault()
    triggerRunCode()
    return
  }
  if (e.shiftKey && e.altKey && (e.key === 'F' || e.key === 'f')) {
    if ($('app').hidden) return
    e.preventDefault()
    triggerFormatCode()
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

// --- Feature: Zen Mode ---
function toggleZenMode(force) {
  const isZen = document.body.classList.toggle('zen-mode', force)
  if ($('zenExit')) $('zenExit').hidden = !isZen
  if (isZen) {
    toast('Zen Mode enabled. Press Esc to exit.')
  }
}

// --- Feature: Recent Rooms & Bookmarks ---
function toggleBookmarksDrawer(force) {
  const next = typeof force === 'boolean' ? !force : !$('bookmarksDrawer').hidden
  $('bookmarksDrawer').hidden = next
  updateButtonActiveStates()
  if (!next) renderBookmarksList()
}

function renderBookmarksList() {
  const container = $('bookmarksList')
  if (!container) return
  const list = getBookmarks()
  if (!list.length) {
    container.innerHTML = '<p class="fineprint" style="text-align:center;padding:24px">No recent rooms yet.<br>Rooms you visit are bookmarked here automatically.</p>'
    return
  }

  container.innerHTML = ''
  for (const item of list) {
    const card = document.createElement('div')
    card.className = 'bookmark-card'
    const timeStr = new Date(item.lastVisited).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const roleCls = item.role === 'owner' ? 'bookmark-role owner' : 'bookmark-role'
    card.innerHTML = `
      <div class="bookmark-head">
        <span class="bookmark-code">${item.code}</span>
        <span class="${roleCls}">${item.role}</span>
        <button class="bookmark-del" title="Remove">&times;</button>
      </div>
      <div class="bookmark-meta">
        <span>${item.language || 'markdown'}</span>
        <span>${timeStr}</span>
      </div>
    `
    card.onclick = (e) => {
      if (e.target.classList.contains('bookmark-del')) {
        e.stopPropagation()
        removeBookmark(item.code)
        renderBookmarksList()
        return
      }
      location.hash = item.code
      if (item.code !== CODE) location.reload()
    }
    container.appendChild(card)
  }
}

// --- Feature: Auto-Language Detection ---
function maybeAutoDetectLanguage(text) {
  const detected = detectLanguage(text)
  if (detected && detected !== currentLang()) {
    setLang(detected)
    toast(`Auto-detected: ${detected.toUpperCase()}`)
  }
}

// Terminal / Runner Tabs & Stdin
if ($('termTabOut')) $('termTabOut').onclick = () => {
  $('termTabOut').classList.add('active')
  $('termTabIn').classList.remove('active')
  $('termOutWrap').hidden = false
  $('termInWrap').hidden = true
}
if ($('termTabIn')) $('termTabIn').onclick = () => {
  $('termTabIn').classList.add('active')
  $('termTabOut').classList.remove('active')
  $('termOutWrap').hidden = true
  $('termInWrap').hidden = false
  if ($('termStdinArea')) $('termStdinArea').focus()
}
if ($('termSwitchIn')) $('termSwitchIn').onclick = () => {
  if ($('termInWrap').hidden) {
    $('termTabIn').click()
  } else {
    $('termTabOut').click()
  }
}
if ($('termGoInput')) $('termGoInput').onclick = () => {
  if ($('termTabIn')) $('termTabIn').click()
}
if ($('termClearStdin')) $('termClearStdin').onclick = () => {
  if ($('termStdinArea')) {
    $('termStdinArea').value = ''
    syncStdinCount()
  }
}
function syncStdinCount() {
  const val = $('termStdinArea')?.value || ''
  const lines = val ? val.split('\n').filter(Boolean).length : 0
  if ($('stdinStatus')) $('stdinStatus').textContent = lines ? `${lines} lines` : '0 lines'
  if ($('termInBadge')) $('termInBadge').hidden = !val.trim()
}
if ($('termStdinArea')) $('termStdinArea').oninput = syncStdinCount

// Artifacts Live Preview Controls
if ($('prevModeWeb')) $('prevModeWeb').onclick = () => {
  previewMode = 'web'
  updateLivePreview()
}
if ($('prevModeMd')) $('prevModeMd').onclick = () => {
  previewMode = 'markdown'
  updateLivePreview()
}
if ($('prevModeDoc')) $('prevModeDoc').onclick = () => {
  previewMode = 'doc'
  updateLivePreview()
}
if ($('prevReload')) $('prevReload').onclick = () => {
  updateLivePreview()
  toast('🔄 Preview reloaded')
}
if ($('prevPopout')) $('prevPopout').onclick = () => {
  if (previewMode === 'doc') {
    if ($('pdfPreview') && !$('pdfPreview').hidden && $('pdfPreview').src) {
      window.open($('pdfPreview').src, '_blank')
      return
    }
    if ($('docPreview') && !$('docPreview').hidden && $('docPreview').innerHTML) {
      const docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Assignment Document</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:32px;max-width:800px;margin:0 auto;line-height:1.6;color:#1e293b;background:#fff}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #cbd5e1;padding:8px 12px}</style></head><body>${$('docPreview').innerHTML}</body></html>`
      const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' })
      window.open(URL.createObjectURL(blob), '_blank')
      return
    }
  }
  if (!activeId || !ytexts.get(activeId)) return
  const content = ytexts.get(activeId).toString()
  let extraCss = '', extraJs = ''
  try {
    for (const f of files()) {
      if (f.id !== activeId) {
        const fText = (ytexts.get(f.id) || '').toString()
        if (f.name.endsWith('.css') || f.name.includes('style')) extraCss += fText + '\n'
        else if (f.name.endsWith('.js') && !f.name.includes('test')) extraJs += fText + '\n'
      }
    }
  } catch (e) {}
  const html = buildStandaloneHtml(content, { extraCss, extraJs })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  window.open(URL.createObjectURL(blob), '_blank')
}

// Wire up topbar and drawer controls
if ($('runBtn')) $('runBtn').onclick = triggerRunCode
if ($('previewBtn')) $('previewBtn').onclick = () => toggleLivePreview()
if ($('previewClose')) $('previewClose').onclick = () => toggleLivePreview(false)
if ($('filesBtn')) $('filesBtn').onclick = () => toggleFileDrawer()
if ($('hubFilesBtn')) $('hubFilesBtn').onclick = () => toggleFileDrawer()
if ($('fileDrawerClose')) $('fileDrawerClose').onclick = () => toggleFileDrawer(false)
if ($('hubHistBtn')) $('hubHistBtn').onclick = () => toggleHistoryDrawer()
if ($('voiceBtn')) $('voiceBtn').onclick = toggleVoiceChat
if ($('bookmarksBtn')) $('bookmarksBtn').onclick = () => toggleBookmarksDrawer()
if ($('bookmarksClose')) $('bookmarksClose').onclick = () => toggleBookmarksDrawer(false)
if ($('bookmarksClear')) $('bookmarksClear').onclick = () => { clearBookmarks(); renderBookmarksList() }
if ($('zenBtn')) $('zenBtn').onclick = () => toggleZenMode()
if ($('zenExit')) $('zenExit').onclick = () => toggleZenMode(false)
if ($('termClose')) $('termClose').onclick = () => { $('terminal').hidden = true; updateButtonActiveStates() }
if ($('termClear')) $('termClear').onclick = () => { $('termOut').textContent = '' }
if ($('termRerun')) $('termRerun').onclick = triggerRunCode

// In-Browser Web & Docs controls
if ($('browserBtn')) $('browserBtn').onclick = () => toggleBrowserDrawer()
if ($('browserClose')) $('browserClose').onclick = () => toggleBrowserDrawer(false)
if ($('browserPopout')) $('browserPopout').onclick = () => window.open($('browserUrlInput')?.value || 'https://devdocs.io', '_blank')
if ($('browserGo')) $('browserGo').onclick = () => openBrowser($('browserUrlInput')?.value)
if ($('browserUrlInput')) $('browserUrlInput').addEventListener('keydown', e => { if (e.key === 'Enter') openBrowser(e.target.value) })
if ($('browserReload')) $('browserReload').onclick = () => {
  if ($('browserIframe')) {
    const s = $('browserIframe').src
    $('browserIframe').src = s
  }
}
if ($('browserBack')) $('browserBack').onclick = () => {
  try { $('browserIframe').contentWindow.history.back() } catch (e) {}
}
if ($('browserFwd')) $('browserFwd').onclick = () => {
  try { $('browserIframe').contentWindow.history.forward() } catch (e) {}
}
document.querySelectorAll('.b-chip').forEach(btn => {
  btn.onclick = () => openBrowser(btn.dataset.url)
})

// Room Goal controls
if ($('hubGoalBtn')) $('hubGoalBtn').onclick = () => promptSetRoomGoal()
if ($('goalDoneBtn')) $('goalDoneBtn').onclick = () => toggleRoomGoalDone()
if ($('goalEditBtn')) $('goalEditBtn').onclick = () => promptSetRoomGoal()
if ($('goalClearBtn')) $('goalClearBtn').onclick = () => clearRoomGoal()

// Teamwork Multi-Device Preview controls
if ($('prevDevDesk')) $('prevDevDesk').onclick = () => setPreviewDevice('desk')
if ($('prevDevTab')) $('prevDevTab').onclick = () => setPreviewDevice('tab')
if ($('prevDevMob')) $('prevDevMob').onclick = () => setPreviewDevice('mob')
if ($('prevDevRotate')) $('prevDevRotate').onclick = () => toggleDeviceOrientation()
if ($('prevGenUiBtn')) $('prevGenUiBtn').onclick = () => openGenerativeUi()
if ($('twConsoleToggle')) $('twConsoleToggle').onclick = () => {
  const p = $('twConsolePane')
  if (p) p.hidden = !p.hidden
}
let twLogNum = 0
if ($('twConsoleClear')) $('twConsoleClear').onclick = () => {
  if ($('twConsoleLogs')) $('twConsoleLogs').innerHTML = ''
  twLogNum = 0
  if ($('twLogCount')) $('twLogCount').hidden = true
}

// Turbo Boost status badge
if ($('turboBadge')) $('turboBadge').onclick = () => toggleTurboBoost()

// Generative UI modal controls
if ($('genUiClose')) $('genUiClose').onclick = () => { if ($('genUiModal')) $('genUiModal').hidden = true }
if ($('genUiGenerateBtn')) $('genUiGenerateBtn').onclick = () => generateAndPreviewUi($('genUiPrompt')?.value || '')
if ($('genUiPrompt')) $('genUiPrompt').addEventListener('keydown', e => {
  if (e.key === 'Enter') generateAndPreviewUi(e.target.value)
})
if ($('genUiCopyBtn')) $('genUiCopyBtn').onclick = () => {
  if (currentGenCode) copy(currentGenCode, 'Component code')
}
if ($('genUiInsertCursorBtn')) $('genUiInsertCursorBtn').onclick = () => insertGenUiAtCursor()
if ($('genUiNewTabBtn')) $('genUiNewTabBtn').onclick = () => openGenUiAsNewTab()

// Inactivity warning close button
if ($('inactivityClose')) $('inactivityClose').onclick = () => {
  if ($('inactivity')) $('inactivity').hidden = true
  noteActivity()
}

// Live preview console message handler
window.addEventListener('message', e => {
  if (isValidPreviewMessage(e, $('htmlPreview'))) {
    const logsEl = $('twConsoleLogs')
    if (logsEl) {
      twLogNum++
      if ($('twLogCount')) {
        $('twLogCount').textContent = twLogNum
        $('twLogCount').hidden = false
      }
      const line = document.createElement('div')
      line.className = `tw-c-${e.data.level || 'log'}`
      line.textContent = `[${e.data.level || 'log'}] ${e.data.text}`
      logsEl.appendChild(line)
      logsEl.scrollTop = logsEl.scrollHeight
    }
  }
})
const fDrop = $('fileDropzone')
if (fDrop) {
  fDrop.onclick = e => { if (e.target.tagName !== 'INPUT') $('fileInput').click() }
  fDrop.addEventListener('dragover', e => {
    e.preventDefault()
    e.stopPropagation()
    fDrop.classList.add('drop-active')
  })
  fDrop.addEventListener('dragleave', e => {
    e.preventDefault()
    e.stopPropagation()
    fDrop.classList.remove('drop-active')
  })
  fDrop.addEventListener('drop', e => {
    e.preventDefault()
    e.stopPropagation()
    fDrop.classList.remove('drop-active')
    if (readOnlyNow()) return toast('This room is read-only')
    const droppedFiles = e.dataTransfer?.files
    if (droppedFiles && droppedFiles.length > 0) {
      for (const f of droppedFiles) {
        handleFileUpload(f)
      }
    }
  })
}
if ($('fileInput')) $('fileInput').onchange = e => {
  if (e.target.files && e.target.files[0]) {
    handleFileUpload(e.target.files[0])
    e.target.value = ''
  }
}

// Time Machine controls
if ($('histClose')) $('histClose').onclick = () => toggleHistoryDrawer(false)
if ($('histSlider')) $('histSlider').oninput = updateHistoryView
if ($('histStepOldest')) $('histStepOldest').onclick = () => { $('histSlider').value = 0; updateHistoryView() }
if ($('histStepBack')) $('histStepBack').onclick = () => { $('histSlider').value = Math.max(0, parseInt($('histSlider').value, 10) - 1); updateHistoryView() }
if ($('histStepFwd')) $('histStepFwd').onclick = () => { $('histSlider').value = parseInt($('histSlider').value, 10) + 1; updateHistoryView() }
if ($('histStepLatest')) $('histStepLatest').onclick = () => {
  const snaps = getFileSnapshots(activeId)
  $('histSlider').value = Math.max(0, snaps.length - 1)
  updateHistoryView()
}
if ($('histModeDiff')) $('histModeDiff').onclick = () => { histViewMode = 'diff'; updateHistoryView() }
if ($('histModeSnap')) $('histModeSnap').onclick = () => { histViewMode = 'snap'; updateHistoryView() }
if ($('histRevertBtn')) $('histRevertBtn').onclick = revertCurrentFile
if ($('histRestoreTabBtn')) $('histRestoreTabBtn').onclick = restoreAsNewTab

if ($('chatClose')) $('chatClose').onclick = () => { $('chat').hidden = true; updateButtonActiveStates() }
if ($('panelClose')) $('panelClose').onclick = () => { $('panel').hidden = true; updateButtonActiveStates() }

// Mobile accessory toolbar quick keys
document.querySelectorAll('#mobileKeys button[data-key]').forEach(b => {
  b.onclick = () => {
    if (!view) return
    const k = b.dataset.key
    const text = k === 'Tab' ? '  ' : k
    view.dispatch(view.state.replaceSelection(text))
    view.focus()
  }
})

// Enhanced Drag & Drop for Text & Encrypted File Sharing
const edWrap = $('editorWrap')
if (edWrap) {
  edWrap.addEventListener('dragover', e => {
    e.preventDefault()
    edWrap.classList.add('editor-drop-active')
  })
  edWrap.addEventListener('dragleave', () => {
    edWrap.classList.remove('editor-drop-active')
  })
  edWrap.addEventListener('drop', async e => {
    e.preventDefault()
    edWrap.classList.remove('editor-drop-active')
    if ($('app').hidden || readOnlyNow()) return
    const file = e.dataTransfer?.files?.[0]
    if (!file) return

    if (file.size > 25 * 1024 * 1024) return toast(file.name + ' is too large (25 MB max)')

    if (!isCodeOrTextFile(file)) {
      toggleFileDrawer(true)
      handleFileUpload(file)
      return
    }

    try {
      const text = await file.text()
      const newFid = addFile(file.name.slice(0, 40), text)
      if (newFid) openFile(newFid)
      maybeAutoDetectLanguage(text)
      toast('Imported ' + file.name)
    } catch (err) {
      toast('Failed to read file: ' + err.message)
    }
  })
}

;['dragover', 'drop'].forEach(ev => addEventListener(ev, e => {
  if ($('app').hidden) return
  e.preventDefault()
}))
addEventListener('drop', async e => {
  if ($('app').hidden || readOnlyNow()) return
  const list = [...(e.dataTransfer ? e.dataTransfer.files : [])].slice(0, 8)
  let last = null, added = 0
  for (const file of list) {
    if (file.size > 25 * 1024 * 1024) {
      toast(file.name + ' is too large (25 MB max)')
      continue
    }
    if (!isCodeOrTextFile(file)) {
      toggleFileDrawer(true)
      handleFileUpload(file)
      continue
    }
    try { last = addFile(file.name.slice(0, 40), await file.text()); added++ } catch (err) {}
  }
  if (last) { openFile(last); toast('Imported ' + added + ' file' + (added === 1 ? '' : 's')) }
})

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

if (CODE.length === LEN && window.isSecureContext) {
  $('gCode').value = CODE
  tryJoin(CODE, null)
}
