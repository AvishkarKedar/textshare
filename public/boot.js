// Register the offline/PWA shell, and say plainly if the app never boots.
// Kept as its own file (not an inline <script> in index.html) so the site's
// Content-Security-Policy no longer needs to allow 'unsafe-inline' scripts -
// a real XSS-hardening gain, not just tidiness: any future markup-injection
// bug can no longer execute a same-page inline <script> payload.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {})
  })
}

// If the module graph never executes, say so instead of showing black nothing.
setTimeout(function () {
  if (!window.__ts_booted) {
    var e = document.getElementById('gErr')
    if (e) {
      e.textContent = 'Could not load the editor. Check your connection or any content blocker, then reload.'
      e.hidden = false
    }
  }
}, 12000)
