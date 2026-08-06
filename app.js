import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { IndexeddbPersistence } from 'y-indexeddb'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars
} from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  bracketMatching, indentOnInput, foldGutter, foldKeymap, indentUnit,
  syntaxHighlighting, defaultHighlightStyle, StreamLanguage
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'

/* ------------------------------------------------------------------ basics */

const $ = id => document.getElementById(id)
const QS = new URLSearchParams(location.search)
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  del(k) { try { localStorage.removeItem(k) } catch (e) {} },
}

const DEFAULT_RELAY = 'textshare-sync.avishkarkedar.workers.dev'
const AL = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const LEN = 6
const VIEW_ONLY = QS.get('view') === '1'
const PALETTE = ['#2783DE', '#46A171', '#D5803B', '#BF8EDA', '#DF84A8', '#4FB9C9', '#E56458', '#EAC26B']

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

let toastTimer
function toast(msg) {
  const t = $('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200)
}

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label + ' copied') }
  catch (e) { toast('Copy failed - ' + text) }
}

/* -------------------------------------------------------------- encryption */

/**
 * Everything on the wire is AES-GCM ciphertext. The key comes from the room
 * code plus the optional password, stretched with PBKDF2, and is never sent
 * anywhere. The relay stores blobs it cannot read.
 */
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
  out.set(iv, 0)
  out.set(ct, 12)
  return out
}

async function unseal(key, bytes) {
  const iv = bytes.slice(0, 12)
  const ct = bytes.slice(12)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
}

const b64 = u8 => {
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = str => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ------------------------------------------------------------ room lookup */

async function roomInfo(host, code) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch('https://' + host + '/room/' + code + '/exists', { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) return { ok: false, reason: 'server' }
    return { ok: true, info: await res.json() }
  } catch (e) {
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------------------------------------------------------- relay */

class Relay {
  constructor(host, code, doc, aw, key, createOpts) {
    this.host = host
    this.code = code
    this.doc = doc
    this.aw = aw
    this.key = key
    this.createOpts = createOpts || null
    this.tries = 0
    this.dead = false
    this.synced = false
    this.onstate = () => {}
    this.queue = []

    this._docUpdate = (update, origin) => {
      if (origin === this) return
      this.send(T_UPDATE, update)
    }
    this._awUpdate = ({ added, updated, removed }) => {
      const ids = added.concat(updated, removed)
      this.send(T_AWARE, encodeAwarenessUpdate(this.aw, ids))
    }
    doc.on('update', this._docUpdate)
    aw.on('update', this._awUpdate)

    this._unload = () => removeAwarenessStates(this.aw, [this.doc.clientID], 'unload')
    addEventListener('beforeunload', this._unload)

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
    this.onstate('connecting')
    let ws
    try { ws = new WebSocket(this.url()) } catch (e) { return this.retry() }
    this.ws = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = async () => {
      this.tries = 0
      // Push whatever this device has, including anything typed offline.
      this.send(T_UPDATE, Y.encodeStateAsUpdate(this.doc))
      this.send(T_AWARE, encodeAwarenessUpdate(this.aw, [this.doc.clientID]))
      this.onstate('open')
    }

    ws.onmessage = async ev => {
      if (typeof ev.data === 'string') return
      const buf = new Uint8Array(ev.data)
      const type = buf[0]
      const body = buf.slice(1)

      if (type === T_SYNCED) {
        this.synced = true
        this.onstate('synced')
        return
      }
      if (type === T_ERROR) {
        const reason = TD.decode(body)
        if (reason === 'rate_limited') toast('Slow down a moment')
        if (reason === 'room_full_bytes') toast('This room has hit its size limit')
        return
      }
      if (type === T_COMPACT) {
        this.send(T_SNAPSHOT, Y.encodeStateAsUpdate(this.doc))
        return
      }

      let plain
      try { plain = await unseal(this.key, body) }
      catch (e) { return } // not ours to read - wrong key, or a stale blob

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
    this.onstate('closed')
    const wait = Math.min(15000, 600 * Math.pow(1.6, this.tries++))
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.connect(), wait)
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

  destroy() {
    this.dead = true
    clearTimeout(this.timer)
    this.doc.off('update', this._docUpdate)
    this.aw.off('update', this._awUpdate)
    removeEventListener('beforeunload', this._unload)
    try { this.ws.close() } catch (e) {}
  }
}

/* -------------------------------------------------------------- languages */

const LANGS = {
  text: ['Plain text', 'txt', null],
  javascript: ['JavaScript', 'js', () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true }))],
  typescript: ['TypeScript', 'ts', () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true, jsx: true }))],
  python: ['Python', 'py', () => import('@codemirror/lang-python').then(m => m.python())],
  html: ['HTML', 'html', () => import('@codemirror/lang-html').then(m => m.html())],
  css: ['CSS', 'css', () => import('@codemirror/lang-css').then(m => m.css())],
  json: ['JSON', 'json', () => import('@codemirror/lang-json').then(m => m.json())],
  yaml: ['YAML', 'yml', () => import('@codemirror/legacy-modes/mode/yaml').then(m => StreamLanguage.define(m.yaml))],
  sql: ['SQL', 'sql', () => import('@codemirror/lang-sql').then(m => m.sql())],
  java: ['Java', 'java', () => import('@codemirror/lang-java').then(m => m.java())],
  cpp: ['C / C++', 'cpp', () => import('@codemirror/lang-cpp').then(m => m.cpp())],
  go: ['Go', 'go', () => import('@codemirror/lang-go').then(m => m.go())],
  rust: ['Rust', 'rs', () => import('@codemirror/lang-rust').then(m => m.rust())],
  shell: ['Shell', 'sh', () => import('@codemirror/legacy-modes/mode/shell').then(m => StreamLanguage.define(m.shell))],
  markdown: ['Markdown', 'md', () => import('@codemirror/lang-markdown').then(m => m.markdown())],
}

const EXT_TO_LANG = {}
for (const id in LANGS) EXT_TO_LANG[LANGS[id][1]] = id
EXT_TO_LANG.htm = 'html'; EXT_TO_LANG.jsx = 'javascript'; EXT_TO_LANG.tsx = 'typescript'
EXT_TO_LANG.yaml = 'yaml'; EXT_TO_LANG.c = 'cpp'; EXT_TO_LANG.h = 'cpp'; EXT_TO_LANG.cc = 'cpp'
EXT_TO_LANG.bash = 'shell'; EXT_TO_LANG.zsh = 'shell'; EXT_TO_LANG.mjs = 'javascript'

const langFromName = name => {
  const dot = (name || '').lastIndexOf('.')
  if (dot < 0) return 'text'
  return EXT_TO_LANG[name.slice(dot + 1).toLowerCase()] || 'text'
}

/* ------------------------------------------------------------------ state */

let CODE = norm(location.hash.slice(1))
let ydoc, awareness, relay, idb, key, view
let ylist, ytexts, undoManager, activeId = null, following = null
let typingTimer, chatUnread = 0
const langComp = new Compartment(), themeComp = new Compartment(), editComp = new Compartment()

const myColor = PALETTE[Math.floor(Math.random() * PALETTE.length)]
let myName = LS.get('ts.name', '')

/* ------------------------------------------------------------------ theme */

function applyTheme(t) {
  document.documentElement.dataset.theme = t
  LS.set('ts.theme', t)
  if (view) view.dispatch({ effects: themeComp.reconfigure(t === 'dark' ? oneDark : []) })
}
applyTheme(LS.get('ts.theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))

/* ------------------------------------------------------------------- gate */

const gateErr = msg => {
  const el = $('gateErr')
  el.textContent = msg
  el.hidden = !msg
}

function paintRelayName() {
  $('relayName').textContent = relayHost()
  $('relayInput').value = relayHost()
}
paintRelayName()

$('relayToggle').onclick = () => {
  const row = $('relayRow')
  row.hidden = !row.hidden
  if (!row.hidden) $('relayInput').focus()
}

$('gateName').value = myName
$('joinCode').addEventListener('input', e => { e.target.value = norm(e.target.value) })

let invitedRoom = null

async function prepGate() {
  if (!window.isSecureContext) {
    gateErr('This app needs HTTPS to encrypt your text. Open the https:// address.')
    $('createRoom').disabled = true
    $('joinBtn').disabled = true
    return
  }
  if (CODE.length !== LEN) return

  $('invited').hidden = false
  $('invited').textContent = 'Invited to room ' + CODE
  $('gateSub').textContent = 'Checking that room ' + CODE + ' is still open...'

  const res = await roomInfo(relayHost(), CODE)
  if (!res.ok) {
    $('gateSub').textContent = 'Could not reach the sync server.'
    gateErr('Cannot reach ' + relayHost() + '. Check the sync server address.')
    return
  }
  if (!res.info.exists) {
    $('gateSub').textContent = ''
    $('invited').hidden = true
    gateErr('No room exists with code ' + CODE + '. It may have been erased after 10 minutes of no activity.')
    location.hash = ''
    CODE = ''
    return
  }

  invitedRoom = res.info
  $('gateSub').textContent = res.info.hasPassword
    ? 'This room is password protected.'
    : 'Enter your name so others know who joined.'
  $('passHint').textContent = res.info.hasPassword ? '(required)' : '(not set - leave empty)'
  $('createRoom').textContent = 'Join room ' + CODE
  if (myName) setTimeout(() => $('gatePass').focus(), 60)
}
prepGate()

$('createRoom').onclick = async () => {
  const name = $('gateName').value.trim()
  if (!name) { gateErr('Please enter your name first.'); $('gateName').focus(); return }
  LS.set('ts.name', name)
  myName = name
  const host = cleanHost($('relayInput').value) || DEFAULT_RELAY
  LS.set('ts.relay', host)
  gateErr('')

  if (CODE.length === LEN) return enterRoom(CODE, $('gatePass').value, false)
  return enterRoom(newCode(), $('gatePass').value, true)
}

$('joinForm').onsubmit = async e => {
  e.preventDefault()
  const name = $('gateName').value.trim()
  if (!name) { gateErr('Please enter your name first.'); $('gateName').focus(); return }
  const code = norm($('joinCode').value)
  if (code.length !== LEN) { gateErr('A room code is 6 characters.'); return }
  LS.set('ts.name', name)
  myName = name
  const host = cleanHost($('relayInput').value) || DEFAULT_RELAY
  LS.set('ts.relay', host)
  gateErr('')

  $('joinBtn').disabled = true
  $('joinBtn').textContent = '...'
  const res = await roomInfo(host, code)
  $('joinBtn').disabled = false
  $('joinBtn').textContent = 'Join'

  if (!res.ok) return gateErr('Cannot reach ' + host + '. Check your connection or the sync server address.')
  if (!res.info.exists) return gateErr('No room exists with code ' + code + '.')
  invitedRoom = res.info
  if (res.info.hasPassword && !$('gatePass').value) {
    gateErr('Room ' + code + ' needs a password.')
    $('gatePass').focus()
    return
  }
  return enterRoom(code, $('gatePass').value, false)
}

/* ------------------------------------------------------------ entering */

async function enterRoom(code, password, creating) {
  CODE = code
  const host = relayHost()
  key = await deriveKey(code, password)

  let createOpts = null
  if (creating) {
    createOpts = { verifier: b64(await seal(key, TE.encode(PROBE))), hasPassword: !!password }
  } else if (invitedRoom && invitedRoom.verifier) {
    // Proving the password without ever showing it to the server.
    try {
      const probe = TD.decode(await unseal(key, unb64(invitedRoom.verifier)))
      if (probe !== PROBE) throw new Error('bad')
    } catch (e) {
      gateErr(invitedRoom.hasPassword ? 'Wrong password for room ' + code + '.' : 'Could not unlock room ' + code + '.')
      return
    }
  }

  history.replaceState(null, '', location.pathname + location.search + '#' + code)
  $('gate').hidden = true
  $('app').hidden = false
  $('roomCode').textContent = code
  $('lockIcon').hidden = !(createOpts ? createOpts.hasPassword : invitedRoom && invitedRoom.hasPassword)
  $('nameInput').value = myName
  $('sigInput').value = host
  $('privacyNote').textContent =
    'Your text is encrypted in this browser before it is sent. ' + host +
    ' only relays sealed data and erases the room 10 minutes after the last person leaves.'

  buildDoc(host, createOpts)
}

function buildDoc(host, createOpts) {
  ydoc = new Y.Doc()
  ylist = ydoc.getArray('files')
  ytexts = ydoc.getMap('texts')
  awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name: myName, color: myColor, view: VIEW_ONLY })

  idb = new IndexeddbPersistence('textshare-' + CODE, ydoc)
  idb.on('synced', () => { ensureFile(); renderTabs() })

  relay = new Relay(host, CODE, ydoc, awareness, key, createOpts)
  relay.onstate = s => {
    if (s === 'synced' || s === 'open') setTimeout(ensureFile, 400)
    paintStatus()
  }

  ylist.observeDeep(() => { renderTabs(); syncActive() })
  ydoc.getArray('chat').observe(() => renderChat())
  awareness.on('change', () => { paintPeople(); paintStatus(); followTick() })

  mountEditor()
  renderChat()
  paintPeople()
  paintStatus()

  setTimeout(() => {
    if (!relay.synced) banner('Still connecting to ' + host + '. Your edits are saved on this device and will sync when it reaches you.')
  }, 9000)
}

/* -------------------------------------------------------------- the files */

function fileEntries() {
  return ylist.toArray().map(m => ({ id: m.get('id'), name: m.get('name'), lang: m.get('lang'), map: m }))
}

function ensureFile() {
  if (ylist.length === 0) {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    ydoc.transact(() => {
      const m = new Y.Map()
      m.set('id', id)
      m.set('name', 'untitled.txt')
      m.set('lang', 'text')
      ylist.push([m])
      ytexts.set(id, new Y.Text())
    }, 'local')
  }
  if (!activeId || !fileEntries().some(f => f.id === activeId)) {
    openFile(fileEntries()[0].id)
  }
}

function syncActive() {
  const files = fileEntries()
  if (!files.length) return
  if (!files.some(f => f.id === activeId)) openFile(files[0].id)
}

function openFile(id) {
  if (!ytexts.get(id)) return
  activeId = id
  awareness.setLocalStateField('file', id)
  mountEditor()
  renderTabs()
  paintLang()
  paintCounts()
}

$('newFile').onclick = () => {
  if (VIEW_ONLY) return
  const name = prompt('File name', 'notes.md')
  if (!name) return
  const clean = name.trim().slice(0, 40)
  const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  ydoc.transact(() => {
    const m = new Y.Map()
    m.set('id', id)
    m.set('name', clean)
    m.set('lang', langFromName(clean))
    ylist.push([m])
    ytexts.set(id, new Y.Text())
  }, 'local')
  openFile(id)
}

function closeFile(id) {
  if (ylist.length <= 1) return toast('A room needs at least one file')
  if (!confirm('Delete this file for everyone?')) return
  ydoc.transact(() => {
    const i = fileEntries().findIndex(f => f.id === id)
    if (i >= 0) ylist.delete(i, 1)
    ytexts.delete(id)
  }, 'local')
  if (activeId === id) openFile(fileEntries()[0].id)
}

function renameFile(id) {
  const f = fileEntries().find(x => x.id === id)
  if (!f) return
  const name = prompt('Rename file', f.name)
  if (!name) return
  ydoc.transact(() => {
    f.map.set('name', name.trim().slice(0, 40))
    f.map.set('lang', langFromName(name))
  }, 'local')
  paintLang()
}

function renderTabs() {
  const host = $('tabs')
  host.innerHTML = ''
  for (const f of fileEntries()) {
    const el = document.createElement('div')
    el.className = 'tab' + (f.id === activeId ? ' on' : '')
    const label = document.createElement('span')
    label.textContent = f.name
    label.onclick = () => (f.id === activeId ? renameFile(f.id) : openFile(f.id))
    el.appendChild(label)
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

/* ----------------------------------------------------------- the editor */

function baseExtensions() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
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
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    indentUnit.of('  '),
    EditorView.lineWrapping,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...yUndoManagerKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of(u => {
      if (u.docChanged) { paintCounts(); markTyping() }
    }),
  ]
}

function mountEditor() {
  const ytext = ytexts.get(activeId)
  if (!ytext) return
  if (view) { view.destroy(); view = null }
  if (undoManager) undoManager.destroy()
  undoManager = new Y.UndoManager(ytext)

  const dark = document.documentElement.dataset.theme === 'dark'
  const state = EditorState.create({
    doc: ytext.toString(),
    extensions: [
      ...baseExtensions(),
      langComp.of([]),
      themeComp.of(dark ? oneDark : []),
      editComp.of(VIEW_ONLY ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
      yCollab(ytext, awareness, { undoManager }),
    ],
  })
  view = new EditorView({ state, parent: $('editor') })
  loadLang(currentLang())
  $('roBadge').hidden = !VIEW_ONLY
  paintCounts()
}

function currentLang() {
  const f = fileEntries().find(x => x.id === activeId)
  return (f && f.lang) || 'text'
}

async function loadLang(id) {
  const entry = LANGS[id] || LANGS.text
  const ext = entry[2] ? await entry[2]().catch(() => []) : []
  if (view) view.dispatch({ effects: langComp.reconfigure(ext) })
}

function paintLang() {
  $('lang').value = currentLang()
  loadLang(currentLang())
}

const langSel = $('lang')
for (const id in LANGS) {
  const o = document.createElement('option')
  o.value = id
  o.textContent = LANGS[id][0]
  langSel.appendChild(o)
}
langSel.onchange = () => {
  const f = fileEntries().find(x => x.id === activeId)
  if (f) ydoc.transact(() => f.map.set('lang', langSel.value), 'local')
  loadLang(langSel.value)
}

/* ------------------------------------------------------------- presence */

function markTyping() {
  awareness.setLocalStateField('typing', true)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => awareness.setLocalStateField('typing', false), 1400)
}

function others() {
  const out = []
  awareness.getStates().forEach((st, id) => {
    if (id === ydoc.clientID || !st.user) return
    out.push({ id, ...st })
  })
  return out
}

function initials(n) {
  const p = (n || '?').trim().split(/\s+/)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}

function paintPeople() {
  const host = $('people')
  host.innerHTML = ''
  const all = [{ id: ydoc.clientID, user: { name: myName + ' (you)', color: myColor }, me: true }].concat(others())
  for (const p of all.slice(0, 6)) {
    const el = document.createElement('div')
    el.className = 'av' + (p.me ? ' me' : '') + (p.typing ? ' typing' : '') + (following === p.id ? ' followed' : '')
    el.style.background = (p.user && p.user.color) || '#888'
    el.textContent = initials(p.user && p.user.name)
    el.title = (p.user && p.user.name) || 'Someone'
    if (!p.me) el.onclick = () => toggleFollow(p.id, p.user.name)
    host.appendChild(el)
  }
  const extra = all.length - 6
  if (extra > 0) {
    const el = document.createElement('div')
    el.className = 'av'
    el.style.background = 'var(--mut)'
    el.textContent = '+' + extra
    host.appendChild(el)
  }
  renderRoster(all)
}

function renderRoster(all) {
  const host = $('roster')
  if (!host) return
  host.innerHTML = ''
  for (const p of all) {
    const row = document.createElement('div')
    row.className = 'rowu'
    const sw = document.createElement('span')
    sw.className = 'sw'
    sw.style.background = (p.user && p.user.color) || '#888'
    const nm = document.createElement('span')
    nm.textContent = (p.user && p.user.name) || 'Someone'
    const tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = p.typing ? 'typing' : (p.user && p.user.view ? 'view only' : '')
    row.append(sw, nm, tag)
    host.appendChild(row)
  }
}

function paintStatus() {
  const n = others().length + 1
  $('userCount').textContent = n + (n === 1 ? ' online' : ' online')
  const dot = $('dot')
  const txt = $('connText')
  $('offlineBadge').hidden = navigator.onLine
  if (!relay || !relay.ws || relay.ws.readyState !== 1) {
    dot.className = 'off'
    txt.textContent = navigator.onLine ? 'Reconnecting...' : 'Offline - edits saved here'
  } else if (n > 1) {
    dot.className = 'on'
    txt.textContent = 'Live'
  } else {
    dot.className = ''
    txt.textContent = 'Connected, waiting for others'
  }
  const typers = others().filter(p => p.typing).map(p => p.user.name)
  $('typing').textContent = typers.length
    ? (typers.length === 1 ? typers[0] + ' is typing...' : typers.length + ' people are typing...')
    : ''
}
addEventListener('online', paintStatus)
addEventListener('offline', paintStatus)

/* --------------------------------------------------------------- follow */

function toggleFollow(id, name) {
  following = following === id ? null : id
  const b = $('followBadge')
  b.hidden = !following
  b.textContent = following ? 'Following ' + name + ' - click to stop' : ''
  b.onclick = () => toggleFollow(id, name)
  paintPeople()
  if (following) followTick()
}

function followTick() {
  if (!following || !view) return
  const st = awareness.getStates().get(following)
  if (!st) return
  if (st.file && st.file !== activeId) { openFile(st.file); return }
  if (!st.cursor || !st.cursor.head) return
  try {
    const rel = Y.createRelativePositionFromJSON(st.cursor.head)
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, ydoc)
    if (!abs) return
    const pos = Math.min(abs.index, view.state.doc.length)
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
  } catch (e) {}
}

/* ----------------------------------------------------------------- chat */

function renderChat() {
  const list = $('chatList')
  if (!list) return
  const arr = ydoc.getArray('chat').toArray()
  list.innerHTML = ''
  for (const m of arr.slice(-200)) {
    const el = document.createElement('div')
    el.className = 'msg'
    const who = document.createElement('span')
    who.className = 'who'
    who.textContent = m.name
    who.style.color = m.color
    const when = document.createElement('span')
    when.className = 'when'
    when.textContent = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const body = document.createElement('div')
    body.className = 'body'
    body.textContent = m.text
    el.append(who, when, body)
    list.appendChild(el)
  }
  list.scrollTop = list.scrollHeight
  if ($('chat').hidden && arr.length > chatUnread) {
    $('chatDot').hidden = false
  }
  chatUnread = arr.length
}

$('chatForm').onsubmit = e => {
  e.preventDefault()
  const text = $('chatInput').value.trim()
  if (!text) return
  ydoc.getArray('chat').push([{ name: myName, color: myColor, text, ts: Date.now() }])
  $('chatInput').value = ''
}

const togglePanel = (el, other) => {
  other.hidden = true
  el.hidden = !el.hidden
  if (el === $('chat') && !el.hidden) { $('chatDot').hidden = true; $('chatInput').focus() }
}
$('chatBtn').onclick = () => togglePanel($('chat'), $('panel'))
$('chatClose').onclick = () => { $('chat').hidden = true }
$('gear').onclick = () => togglePanel($('panel'), $('chat'))
$('panelClose').onclick = () => { $('panel').hidden = true }

/* -------------------------------------------------------------- toolbar */

const inviteLink = () => location.origin + location.pathname + '#' + CODE
const viewLink = () => location.origin + location.pathname + '?view=1#' + CODE

$('roomCode').onclick = () => copy(CODE, 'Room code')
$('copyCode').onclick = () => copy(CODE, 'Room code')
$('copyLink').onclick = () => copy(inviteLink(), 'Invite link')
$('copyViewLink').onclick = () => copy(viewLink(), 'View-only link')
$('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
$('undoBtn').onclick = () => { if (undoManager) undoManager.undo(); view.focus() }
$('redoBtn').onclick = () => { if (undoManager) undoManager.redo(); view.focus() }

$('download').onclick = () => {
  const f = fileEntries().find(x => x.id === activeId)
  const blob = new Blob([view.state.doc.toString()], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (f && f.name) || CODE + '.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

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
    setTimeout(() => location.reload(), 500)
    return
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
  const t = view.state.doc
  const chars = t.length
  const words = t.toString().trim() ? t.toString().trim().split(/\s+/).length : 0
  $('counts').textContent = t.lines + ' lines, ' + words + ' words, ' + chars + ' chars'
}

addEventListener('hashchange', () => {
  const next = norm(location.hash.slice(1))
  if (next && next !== CODE) location.reload()
})

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}

// Straight to the editor when we already know the person and the room.
if (CODE.length === LEN && myName) {
  $('gateName').value = myName
}
