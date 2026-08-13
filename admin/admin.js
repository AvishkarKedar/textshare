/**
 * anonshare admin dashboard - standalone static app, no build step.
 * Talks directly to the textshare-sync Worker's /admin/* API.
 * Deployed as its own Cloudflare Pages project on its own subdomain, so a
 * compromise or bug in the public marketing site can never expose this.
 */
(function () {
  'use strict'

  const LS_URL = 'anonshare_admin_relay_url'
  const LS_TOKEN = 'anonshare_admin_token'
  const LS_EXP = 'anonshare_admin_token_exp'

  const $ = id => document.getElementById(id)
  const setupS = $('setup'), loginS = $('login'), dashS = $('dash')

  let relayUrl = localStorage.getItem(LS_URL) || ''
  let token = localStorage.getItem(LS_TOKEN) || ''
  let tokenExp = Number(localStorage.getItem(LS_EXP) || 0)

  function show(section) {
    setupS.hidden = section !== 'setup'
    loginS.hidden = section !== 'login'
    dashS.hidden = section !== 'dash'
  }

  function normalizeUrl(u) {
    u = (u || '').trim().replace(/\/+$/, '')
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u
    return u
  }

  async function api(path, opts) {
    opts = opts || {}
    const headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {})
    if (token) headers.Authorization = 'Bearer ' + token
    const res = await fetch(relayUrl + path, Object.assign({}, opts, { headers }))
    let body = null
    try { body = await res.json() } catch (e) {}
    if (!res.ok) {
      const err = new Error((body && body.error) || ('http_' + res.status))
      err.status = res.status
      err.body = body
      throw err
    }
    return body
  }

  function fmtAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (s < 60) return s + 's ago'
    if (s < 3600) return Math.floor(s / 60) + 'm ago'
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'
    return Math.floor(s / 86400) + 'd ago'
  }

  function fmtTtl(ms) {
    const m = Math.round(ms / 60000)
    if (m < 60) return m + 'm'
    if (m < 1440) return Math.round(m / 60) + 'h'
    return Math.round(m / 1440) + 'd'
  }

  function banner(msg, bad) {
    const b = $('banner')
    if (!msg) { b.hidden = true; return }
    b.hidden = false
    b.className = bad ? 'bad' : ''
    b.textContent = msg
  }

  /* ------------------------------------------------------------- setup */

  $('setupGo').onclick = () => {
    const u = normalizeUrl($('setupUrl').value)
    if (!u) { $('setupErr').hidden = false; $('setupErr').textContent = 'Enter a URL.'; return }
    relayUrl = u
    localStorage.setItem(LS_URL, relayUrl)
    boot()
  }

  $('loginResetUrl').onclick = () => {
    localStorage.removeItem(LS_URL)
    relayUrl = ''
    show('setup')
  }

  /* ------------------------------------------------------------- login */

  $('loginGo').onclick = doLogin
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() })

  async function doLogin() {
    const pass = $('loginPass').value
    $('loginErr').hidden = true
    if (!pass) return
    try {
      const res = await fetch(relayUrl + '/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'login_failed')
      token = body.token
      tokenExp = body.exp
      localStorage.setItem(LS_TOKEN, token)
      localStorage.setItem(LS_EXP, String(tokenExp))
      $('loginPass').value = ''
      show('dash')
      loadAll()
    } catch (e) {
      $('loginErr').hidden = false
      $('loginErr').textContent = e.message === 'bad_password' ? 'Wrong password.'
        : e.message === 'rate_limited' ? 'Too many attempts, try again in a minute.'
        : e.message === 'admin_disabled' ? 'Admin is not enabled on this relay (ADMIN_PASSWORD not set).'
        : 'Could not sign in. Check the relay URL and try again.'
    }
  }

  $('logoutBtn').onclick = () => {
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_EXP)
    token = ''
    show('login')
  }

  $('refreshBtn').onclick = loadAll

  /* -------------------------------------------------------------- data */

  async function loadAll() {
    banner()
    $('relayUrl').textContent = relayUrl.replace(/^https?:\/\//, '')
    try {
      await Promise.all([loadMetrics(), loadRooms(), loadConfig()])
    } catch (e) {
      if (e.status === 401) { show('login'); return }
      banner('Could not reach the relay: ' + e.message, true)
    }
  }

  async function loadMetrics() {
    const m = await api('/admin/metrics')
    $('mTotal').textContent = m.totalActiveRooms
    $('mHour').textContent = m.createdLastHour
    $('mDay').textContent = m.createdLastDay
    $('mPass').textContent = m.passwordProtected
  }

  let allRooms = []

  async function loadRooms() {
    const r = await api('/admin/rooms')
    allRooms = r.rooms || []
    renderRooms()
  }

  function renderRooms() {
    const filter = ($('roomFilter').value || '').trim().toUpperCase()
    const rows = allRooms.filter(r => !filter || r.code.includes(filter))
    const body = $('roomsBody')
    body.innerHTML = ''
    $('roomsEmpty').hidden = rows.length > 0
    for (const r of rows) {
      const tr = document.createElement('tr')
      tr.innerHTML =
        '<td class="code">' + esc(r.code) + '</td>' +
        '<td>' + esc(fmtAgo(r.created)) + '</td>' +
        '<td>' + esc(fmtTtl(r.ttl)) + '</td>' +
        '<td class="peers">&hellip;</td>' +
        '<td class="status">&hellip;</td>' +
        '<td class="rowactions">' +
          '<button class="btn xs" data-a="suspend" data-code="' + esc(r.code) + '">Suspend</button>' +
          '<button class="btn xs" data-a="unsuspend" data-code="' + esc(r.code) + '">Unsuspend</button>' +
          '<button class="btn xs danger" data-a="delete" data-code="' + esc(r.code) + '">Delete</button>' +
        '</td>'
      body.appendChild(tr)
      refreshRoomStatus(r.code, tr)
    }
  }

  async function refreshRoomStatus(code, tr) {
    try {
      const res = await fetch(relayUrl + '/room/' + code + '/exists')
      const st = await res.json()
      const peers = tr.querySelector('.peers')
      const status = tr.querySelector('.status')
      if (!st.exists) { peers.textContent = '-'; status.innerHTML = '<span class="tag">gone</span>'; return }
      peers.textContent = st.peers
      let tag = '<span class="tag ok">live</span>'
      if (st.suspended) tag = '<span class="tag danger">suspended</span>'
      else if (st.locked) tag = '<span class="tag warn">locked</span>'
      status.innerHTML = tag + (st.hasPassword ? ' <span class="tag">pw</span>' : '')
    } catch (e) {
      // Leave the placeholder if a single room's status check fails.
    }
  }

  $('roomFilter').addEventListener('input', renderRooms)

  $('roomsBody').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-a]')
    if (!btn) return
    const action = btn.dataset.a
    const code = btn.dataset.code
    if (action === 'delete' && !confirm('Permanently delete room ' + code + '? This cannot be undone.')) return
    btn.disabled = true
    try {
      await api('/admin/rooms/' + code + '/' + action, { method: 'POST' })
      await loadRooms()
      await loadMetrics()
    } catch (err) {
      banner('Action failed for ' + code + ': ' + err.message, true)
    } finally {
      btn.disabled = false
    }
  })

  /* ------------------------------------------------------------ config */

  const CONFIG_FIELDS = [
    { key: 'IP_PER_MIN', label: 'Requests / min / IP' },
    { key: 'CREATE_PER_MIN', label: 'Room creates / min / IP' },
    { key: 'AUTH_PER_MIN', label: 'Failed auth attempts / min / IP' },
    { key: 'MAX_CONNS', label: 'Max peers per room' },
  ]

  async function loadConfig() {
    const res = await api('/admin/config')
    const form = $('configForm')
    form.innerHTML = ''
    for (const f of CONFIG_FIELDS) {
      const wrap = document.createElement('div')
      wrap.className = 'cfield'
      const current = res.config && res.config[f.key]
      const def = res.defaults && res.defaults[f.key]
      wrap.innerHTML =
        '<label>' + esc(f.label) + ' <span class="mut">(default ' + esc(String(def)) + ')</span></label>' +
        '<input class="in sm" style="width:100%" data-key="' + esc(f.key) + '" type="number" min="1" placeholder="' + esc(String(def)) + '" value="' + (current ? esc(String(current)) : '') + '">'
      form.appendChild(wrap)
    }
  }

  $('configSave').onclick = async () => {
    const patch = {}
    document.querySelectorAll('#configForm input[data-key]').forEach(inp => {
      const v = Number(inp.value)
      if (inp.value && v > 0) patch[inp.dataset.key] = v
    })
    try {
      await api('/admin/config', { method: 'POST', body: JSON.stringify(patch) })
      $('configSaved').hidden = false
      setTimeout(() => { $('configSaved').hidden = true }, 2500)
    } catch (e) {
      banner('Could not save limits: ' + e.message, true)
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  /* -------------------------------------------------------------- boot */

  function boot() {
    if (!relayUrl) { show('setup'); return }
    if (token && tokenExp > Date.now() + 30000) {
      show('dash')
      loadAll()
    } else {
      show('login')
    }
  }

  boot()
})()
