/**
 * Pure, dependency-free helpers mirrored from app.js so the core text/room
 * logic can be unit tested in isolation without touching the main bundle.
 * app.js keeps its own inline copies for now (kept in sync by hand) so this
 * test harness lands without risking the fragile main bundle in the same
 * change; a follow-up refactor can have app.js import directly from here.
 */

export function norm(v, len = 6) {
  return (v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, len)
}

export function cleanHost(v) {
  return (v || '').trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export function safeColor(c) {
  return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#4c8dff'
}

export function safeName(n) {
  return String(n == null ? '' : n).slice(0, 24) || 'anon'
}

export function initials(n) {
  const p = safeName(n).trim().split(/\s+/)
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase()
}

export function sniff(text) {
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
