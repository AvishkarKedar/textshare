import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { IndexeddbPersistence } from 'y-indexeddb'
import { EditorState, Compartment, StateField, StateEffect, RangeSet, RangeSetBuilder } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars,
  gutter, GutterMarker
} from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  bracketMatching, indentOnInput, foldGutter, foldKeymap, indentUnit,
  syntaxHighlighting, HighlightStyle, StreamLanguage
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'

/* ================================================================ basics */

const $ = id => document.getElementById(id)
const QS = new URLSearchParams(location.search)
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
}

const DEFAULT_RELAY = 'textshare-sync.avishkarkedar.workers.dev'
const AL = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const LEN = 6
const VIEW_ONLY = QS.get('view') === '1'
const IDLE_AFTER = 60000

// Readable on black, readable on white, and distinct from each other.
const PALETTE = ['#4c8dff', '#3ddc84', '#ffb347', '#c792ea', '#ff87b5', '#4fd6d2', '#ff6b5b', '#e8d44d']

const T_UPDATE = 0, T_AWARE = 1, T_SNAPSHOT = 2, T_SYNCED = 3, T_ERROR = 4, T_COMPACT = 5

const norm = v => (v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, LEN)
const cleanHost = v => (v || '').trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
const relayHost = () => cleanHost(QS.get('relay') || LS.get('ts.relay', '') || DEFAULT_RELAY)

function newCode() {
  const a = new Uint8Array(LEN)
  crypto.getRandomValues(a)
  let s = ''
  for (let i = 0; i < LEN; i++) s += AL[a[i] % AL.length]
  return s
}

function initials(n) {
  const p = (n || '?').trim().split(/\s+/)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}

let toastTimer
function toast(msg) {
  const el = $('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label + ' copied') }
  catch (e) { toast(text) }
}

function shake(el) {
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
  setTimeout(() => el.classList.remove('shake'), 400)
}

/* ============================================================== theming */

const MQ = matchMedia('(prefers-color-scheme: light)')
const themePref = () => LS.get('ts.theme', 'system')
const resolved = () => (themePref() === 'system' ? (MQ.matches ? 'light' : 'dark') : themePref())

function applyTheme() {
  const r = resolved()
  document.documentElement.dataset.theme = r
  const meta = document.querySelector('meta[name=theme-color]')
  if (meta) meta.content = r === 'dark' ? '#000000' : '#ffffff'
  if ($('themeVal')) $('themeVal').textContent = themePref()
  if (view) view.dispatch({ effects: themeComp.reconfigure(highlightFor(r)) })
}
MQ.addEventListener('change', () => { if (themePref() === 'system') applyTheme() })

// One highlight style, tuned for pure black rather than a generic dark grey.
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
const PROBE = 'textshare-verify-v3'

async function deriveKey(code, pass) {
  const base = await crypto.subtle.importKey('raw', TE.encode(code + ':' + (pass || '')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: TE.encode('textshare|' + code), iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
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
const b64 = u8 => {
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = str => {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ========================================================== room lookup */

async function roomInfo(host, code) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch('https://' + host + '/room/' + code + '/exists', { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) return { ok: false }
    return { ok: true, info: await res.json() }
  } catch (e) { return { ok: false } }
  finally { clearTimeout(timer) }
}

/* ================================================================ relay */

class Relay {
  constructor(host, code, doc, aw, key, createOpts) {
    Object.assign(this, { host, code, doc, aw, key, createOpts: createOpts || null })
    this.tries = 0; this.dead = false; this.synced = false
    this.onstate = () => {}

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
    let u = 'wss://' + this.host + '/room/' + this.code
    if (this.createOpts) {
      u += '?create=1&v=' + encodeURIComponent(this.createOpts.verifier)
      if (this.createOpts.hasPassword) u += '&p=1'
    }
    return u
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
      const type = buf[0], body = buf.slice(1)

      if (type === T_SYNCED) { this.synced = true; this.onstate(); return }
      if (type === T_COMPACT) { this.send(T_SNAPSHOT, Y.encodeStateAsUpdate(this.doc)); return }
      if (type === T_ERROR) {
        const r = TD.decode(body)
        if (r === 'rate_limited') toast('Slow down a moment')
        if (r === 'room_full_bytes') toast('Room size limit reached')
        return
      }

      let plain
      try { plain = await unseal(this.key, body) } catch (e) { return }
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

  async send(type, payload) {
    if (!this.ws || this.ws.readyState !== 1) return
    try {
      const sealed = await seal(this.key, payload)
      const out = new Uint8Array(1 + sealed.length)
      out[0] = type
      out.set(sealed, 1)
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
  c: 'cpp', h: 'cpp', cc: 'cpp', hpp: 'cpp', bash: 'shell', zsh: 'shell',
})
const langFromName = name => {
  const d = (name || '').lastIndexOf('.')
  return d < 0 ? 'text' : (EXT[name.slice(d + 1).toLowerCase()] || 'text')
}

/* ================================================================ state */

let CODE = norm(location.hash.slice(1))
let ydoc, awareness, relay, idb, key, view
let ylist, ytexts, undoManager, activeId = null, following = null
let typingTimer, actTimer, chatSeen = 0, markSig = '', startedAt = 0
const known = new Map()

const langComp = new Compartment(), themeComp = new Compartment()
const myColor = PALETTE[Math.floor(Math.random() * PALETTE.length)]
let myName = LS.get('ts.name', '')

applyTheme()

/* ============================================================= step one */

const gErr = m => { const e = $('gErr'); e.textContent = m || ''; e.hidden = !m }

function paintRelay() {
  $('gRelayName').textContent = relayHost()
  $('gRelayInput').value = relayHost()
  if ($('sigInput')) $('sigInput').value = relayHost()
}
paintRelay()

$('gRelayToggle').onclick = () => {
  const i = $('gRelayInput')
  i.hidden = !i.hidden
  if (!i.hidden) i.focus()
}
$('gRelayInput').onchange = () => {
  const h = cleanHost($('gRelayInput').value)
  if (h) { LS.set('ts.relay', h); paintRelay(); toast('Relay set') }
}
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
    gErr('Cannot reach ' + relayHost() + '. Check your connection.')
    shake($('gCode'))
    return
  }
  if (!res.info.exists) {
    gErr('No room exists with code ' + code + '. It may have been erased after 10 minutes of no activity.')
    shake($('gCode')); $('gCode').classList.add('bad')
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    return
  }
  openModal('join', code, res.info)
}

/* ============================================================= step two */

let pending = null

function openModal(mode, code, info) {
  pending = { mode, code: code || null, info: info || null }
  const locked = mode === 'join' && info && info.hasPassword

  $('mLock').hidden = !locked
  $('mTitle').textContent = mode === 'create' ? 'New room' : (locked ? 'Room ' + code + ' is locked' : 'Join ' + code)
  $('mSub').textContent = mode === 'create'
    ? 'You will get a 6-character code to share.'
    : (locked
        ? 'This room is password protected. Ask whoever shared it for the password.'
        : (info && info.peers ? info.peers + ' already here.' : 'Nobody here yet - you will be first.'))

  $('mPassWrap').hidden = !locked
  $('mPassLbl').textContent = 'Password'
  $('mAddPass').hidden = mode !== 'create'
  $('mAddPass').textContent = '+ protect this room with a password'
  $('mPass').value = ''
  $('mPass').classList.remove('bad')
  $('mErr').hidden = true
  $('mName').value = myName
  $('mGo').textContent = mode === 'create' ? 'Create room' : 'Join'

  $('modal').hidden = false
  setTimeout(() => (myName && locked ? $('mPass') : $('mName')).focus(), 60)
}

$('mAddPass').onclick = () => {
  $('mPassWrap').hidden = false
  $('mPassLbl').textContent = 'Password (optional)'
  $('mAddPass').hidden = true
  $('mPass').focus()
}

$('mBack').onclick = () => { $('modal').hidden = true; pending = null }
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal').hidden) $('mBack').click()
  if (e.key === 'Escape') { $('menu').hidden = true }
})
$('mName').addEventListener('keydown', e => { if (e.key === 'Enter') $('mGo').click() })
$('mPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('mGo').click() })

const mErr = m => {
  const e = $('mErr')
  e.textContent = m || ''
  e.hidden = !m
}

$('mGo').onclick = async () => {
  if (!pending) return
  const name = $('mName').value.trim()
  if (!name) { mErr('Please enter a display name.'); shake($('mName')); $('mName').focus(); return }
  LS.set('ts.name', name)
  myName = name

  const pass = $('mPass').value
  if (pending.mode === 'join' && pending.info.hasPassword && !pass) {
    mErr('This room needs a password.')
    shake($('.sheet') ? document.querySelector('.sheet') : $('mPass'))
    $('mPass').classList.add('bad'); $('mPass').focus()
    return
  }

  mErr('')
  $('mGo').disabled = true
  const ok = await enterRoom(pending.mode === 'create' ? newCode() : pending.code, pass, pending.mode === 'create')
  $('mGo').disabled = false
  if (!ok) {
    mErr('Wrong password for room ' + pending.code + '.')
    shake(document.querySelector('.sheet'))
    $('mPass').classList.add('bad')
    $('mPass').select()
  }
}

/* ========================================================== entering */

async function enterRoom(code, password, creating) {
  CODE = code
  const host = relayHost()
  key = await deriveKey(code, password)

  let createOpts = null
  if (creating) {
    createOpts = { verifier: b64(await seal(key, TE.encode(PROBE))), hasPassword: !!password }
  } else if (pending && pending.info && pending.info.verifier) {
    // The password is proven by decryption, never sent.
    try {
      if (TD.decode(await unseal(key, unb64(pending.info.verifier))) !== PROBE) return false
    } catch (e) { return false }
  }

  const locked = creating ? !!password : !!(pending && pending.info && pending.info.hasPassword)

  history.replaceState(null, '', location.pathname + location.search + '#' + code)
  $('modal').hidden = true
  $('gate').hidden = true
  $('app').hidden = false
  $('roomCode').textContent = code
  $('lockIcon').hidden = !locked
  $('nameInput').value = myName
  $('sigInput').value = host
  $('privacyNote').textContent =
    'Text is encrypted in this browser before it is sent. ' + host +
    ' relays sealed data it cannot read, and erases the room 10 minutes after the last person leaves.'

  startedAt = Date.now()
  boot(host, createOpts)
  return true
}

function boot(host, createOpts) {
  ydoc = new Y.Doc()
  ylist = ydoc.getArray('files')
  ytexts = ydoc.getMap('texts')
  awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name: myName, color: myColor, view: VIEW_ONLY })
  awareness.setLocalStateField('act', Date.now())

  idb = new IndexeddbPersistence('textshare-' + CODE, ydoc)
  idb.on('synced', () => { ensureFile(); renderTabs() })

  relay = new Relay(host, CODE, ydoc, awareness, key, createOpts)
  relay.onstate = () => { setTimeout(ensureFile, 300); paintStatus() }

  ylist.observeDeep(() => { renderTabs(); keepActiveValid() })
  ydoc.getArray('chat').observe(renderChat)
  awareness.on('change', onPresence)

  ensureFile()
  renderChat()
  onPresence()
  setInterval(() => { paintPeople(); paintStatus() }, 15000)

  setTimeout(() => {
    if (!relay.synced) banner('Still reaching ' + host + '. Your edits are saved on this device and will sync when it answers.')
  }, 9000)
}

/* ================================================================ files */

const files = () => ylist.toArray().map(m => ({ id: m.get('id'), name: m.get('name'), lang: m.get('lang'), map: m }))
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function addFile(name) {
  const id = newId()
  ydoc.transact(() => {
    const m = new Y.Map()
    m.set('id', id); m.set('name', name); m.set('lang', langFromName(name))
    ylist.push([m])
    ytexts.set(id, new Y.Text())
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

function closeFile(id) {
  if (ylist.length <= 1) return toast('A room keeps at least one file')
  if (!confirm('Delete this file for everyone?')) return
  ydoc.transact(() => {
    const i = files().findIndex(f => f.id === id)
    if (i >= 0) ylist.delete(i, 1)
    ytexts.delete(id)
  }, 'local')
  if (activeId === id) openFile(files()[0].id)
}

function renameFile(id) {
  const f = files().find(x => x.id === id)
  if (!f) return
  const name = prompt('File name', f.name)
  if (!name) return
  ydoc.transact(() => {
    f.map.set('name', name.trim().slice(0, 40))
    f.map.set('lang', langFromName(name))
  }, 'local')
  $('lang').value = currentLang()
  loadLang(currentLang())
}

function renderTabs() {
  const host = $('tabs')
  host.innerHTML = ''
  for (const f of files()) {
    const el = document.createElement('div')
    el.className = 'tab' + (f.id === activeId ? ' on' : '')
    const lb = document.createElement('span')
    lb.textContent = f.name
    lb.onclick = () => (f.id === activeId ? renameFile(f.id) : openFile(f.id))
    el.appendChild(lb)
    if (!VIEW_ONLY) {
      const x = document.createElement('span')
      x.className = 'x'
      x.textContent = '\u00d7'
      x.onclick = e => { e.stopPropagation(); closeFile(f.id) }
      el.appendChild(x)
    }
    host.appendChild(el)
  }
}

$('newFile').onclick = () => {
  if (VIEW_ONLY) return
  const name = prompt('File name', 'notes.md')
  if (name) openFile(addFile(name.trim().slice(0, 40)))
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
  const sig = cur.map(c => c.index + ':' + c.p.user.color).join('|')
  if (sig === markSig) return
  markSig = sig

  const rows = cur
    .map(c => ({ from: view.state.doc.lineAt(c.index).from, m: new NameMark(initials(c.p.user.name), c.p.user.color) }))
    .sort((a, b) => a.from - b.from)

  const b = new RangeSetBuilder()
  for (const r of rows) b.add(r.from, r.from, r.m)
  view.dispatch({ effects: setMarks.of(b.finish()) })
}

/* ------- floating "is typing" bubble, pinned to their live cursor ------ */
function paintBubbles() {
  const layer = $('overlay')
  if (!view || !layer) return
  layer.innerHTML = ''
  const box = view.scrollDOM.getBoundingClientRect()
  for (const { p, index } of remoteCursors()) {
    if (!p.typing) continue
    let c
    try { c = view.coordsAtPos(index) } catch (e) { continue }
    if (!c) continue
    const el = document.createElement('div')
    el.className = 'bubble'
    el.style.background = p.user.color
    el.style.left = Math.max(2, c.left - box.left) + 'px'
    el.style.top = (c.top - box.top - 4) + 'px'
    el.innerHTML = ''
    el.append(p.user.name + ' ')
    const i = document.createElement('i')
    i.textContent = 'typing'
    el.appendChild(i)
    layer.appendChild(el)
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

function touchActive() {
  clearTimeout(actTimer)
  actTimer = setTimeout(() => awareness.setLocalStateField('act', Date.now()), 400)
}

function mount() {
  const ytext = ytexts.get(activeId)
  if (!ytext) return
  if (view) view.destroy()
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
        VIEW_ONLY ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
        yCollab(ytext, awareness, { undoManager }),
        EditorView.updateListener.of(u => {
          if (u.docChanged) { markTyping(); paintCounts() }
          if (u.docChanged || u.selectionSet) touchActive()
          if (u.geometryChanged || u.viewportChanged || u.docChanged) paintBubbles()
        }),
      ],
    }),
  })

  view.scrollDOM.addEventListener('scroll', paintBubbles, { passive: true })
  loadLang(currentLang())
  $('roBadge').hidden = !VIEW_ONLY
  paintCounts()
  refreshMarks()
}

const langSel = $('lang')
for (const id in LANGS) {
  const o = document.createElement('option')
  o.value = id
  o.textContent = LANGS[id][0]
  langSel.appendChild(o)
}
langSel.onchange = () => {
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
  for (const p of others()) now.set(p.id, p.user.name)
  if (Date.now() - startedAt > 2500) {
    for (const [id, name] of now) if (!known.has(id)) toast(name + ' joined')
    for (const [id, name] of known) if (!now.has(id)) toast(name + ' left')
  }
  known.clear()
  for (const [id, name] of now) known.set(id, name)
}

function paintPeople() {
  const host = $('people')
  if (!host) return
  const now = Date.now()
  const all = [{ id: ydoc.clientID, me: true, user: { name: myName, color: myColor }, act: now, typing: false }]
    .concat(others())
  host.innerHTML = ''

  for (const p of all.slice(0, 5)) {
    const idle = !p.me && now - (p.act || 0) > IDLE_AFTER
    const el = document.createElement('div')
    el.className = 'av' + (p.me ? ' me' : '') + (idle ? ' idle' : '') + (following === p.id ? ' following' : '')
    el.style.background = p.user.color
    el.textContent = initials(p.user.name)
    el.title = p.me
      ? p.user.name + ' (you)'
      : p.user.name + (idle ? ' - idle' : '') + '\nclick to jump to their cursor, double-click to follow'
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
    sw.style.background = p.user.color
    if (idle) sw.style.filter = 'grayscale(1)'
    const nm = document.createElement('span')
    nm.className = 'nm'
    nm.textContent = p.user.name + (p.me ? ' (you)' : '')
    row.append(sw, nm)
    if (p.me) {
      const tag = document.createElement('span')
      tag.className = 'tag'
      tag.textContent = VIEW_ONLY ? 'view only' : ''
      row.appendChild(tag)
    } else {
      const tag = document.createElement('span')
      tag.className = 'tag'
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

function paintStatus() {
  if (!awareness) return
  const n = others().length + 1
  $('userCount').textContent = n + ' online'
  const dot = $('dot'), txt = $('connText')
  $('offlineBadge').hidden = navigator.onLine
  if (!relay || !relay.ws || relay.ws.readyState !== 1) {
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

/* --------------------------------------------------- jump & follow */

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
    b.textContent = 'following ' + ((st && st.user && st.user.name) || '') + ' \u00d7'
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
  for (const m of arr.slice(-200)) {
    const el = document.createElement('div')
    el.className = 'msg'
    const head = document.createElement('div')
    const who = document.createElement('span')
    who.className = 'who'
    who.textContent = m.name
    who.style.color = m.color
    const when = document.createElement('span')
    when.className = 'when'
    when.textContent = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    head.append(who, when)
    const body = document.createElement('div')
    body.className = 'body'
    body.textContent = m.text
    el.append(head, body)
    list.appendChild(el)
  }
  list.scrollTop = list.scrollHeight
  if ($('chat').hidden && arr.length > chatSeen) $('chatDot').hidden = false
  else chatSeen = arr.length
}

$('chatForm').onsubmit = e => {
  e.preventDefault()
  const text = $('chatInput').value.trim()
  if (!text) return
  ydoc.getArray('chat').push([{ name: myName, color: myColor, text, ts: Date.now() }])
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

/* ============================================================== toolbar */

const inviteLink = () => location.origin + location.pathname + '#' + CODE
const viewLink = () => location.origin + location.pathname + '?view=1#' + CODE

$('roomChip').onclick = () => copy(CODE, 'Room code')
$('copyLink').onclick = () => copy(inviteLink(), 'Invite link')
$('undoBtn').onclick = () => { if (undoManager) undoManager.undo(); view.focus() }
$('redoBtn').onclick = () => { if (undoManager) undoManager.redo(); view.focus() }

$('moreBtn').onclick = e => {
  e.stopPropagation()
  $('menu').hidden = !$('menu').hidden
}
addEventListener('click', e => {
  if (!$('menu').hidden && !$('menu').contains(e.target)) $('menu').hidden = true
})

const ACTIONS = {
  newfile: () => $('newFile').click(),
  rename: () => renameFile(activeId),
  download: () => {
    const f = files().find(x => x.id === activeId)
    const blob = new Blob([view.state.doc.toString()], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (f && f.name) || CODE + '.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  },
  invite: () => copy(inviteLink(), 'Invite link'),
  viewlink: () => copy(viewLink(), 'View-only link'),
  theme: () => {
    const order = ['system', 'dark', 'light']
    LS.set('ts.theme', order[(order.indexOf(themePref()) + 1) % 3])
    applyTheme()
  },
  settings: () => showPanel($('panel')),
  files: () => $('tabbar').scrollIntoView(),
  chat: () => showPanel($('chat')),
  undo: () => $('undoBtn').click(),
  redo: () => $('redoBtn').click(),
  more: () => $('moreBtn').click(),
}

$('menu').addEventListener('click', e => {
  const b = e.target.closest('button')
  if (!b) return
  const fn = ACTIONS[b.dataset.a]
  if (fn) fn()
  if (b.dataset.a !== 'theme') $('menu').hidden = true
})
$('mbar').addEventListener('click', e => {
  const b = e.target.closest('button')
  if (b && ACTIONS[b.dataset.a]) ACTIONS[b.dataset.a]()
})

$('saveSettings').onclick = () => {
  const n = $('nameInput').value.trim()
  if (n) {
    myName = n
    LS.set('ts.name', n)
    awareness.setLocalStateField('user', { name: n, color: myColor, view: VIEW_ONLY })
  }
  const h = cleanHost($('sigInput').value)
  if (h && h !== relayHost()) {
    LS.set('ts.relay', h)
    toast('Reconnecting to ' + h)
    return setTimeout(() => location.reload(), 500)
  }
  toast('Saved')
  $('panel').hidden = true
}

$('forgetRoom').onclick = async () => {
  if (!confirm('Delete this room from this device? Anyone still connected keeps their copy.')) return
  try { await idb.clearData() } catch (e) {}
  location.href = location.origin + location.pathname
}

function banner(msg) {
  const b = $('banner')
  b.textContent = msg
  b.hidden = false
  setTimeout(() => { b.hidden = true }, 12000)
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
