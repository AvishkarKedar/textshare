if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      reg.update().catch(function () {})
    }).catch(function () {})
  })
}
setTimeout(function () {
  if (!window.__ts_booted) {
    var e = document.getElementById('gErr')
    if (e) {
      e.textContent = 'Could not load the editor. Check your connection or any content blocker, then reload.'
      e.hidden = false
    }
  }
}, 12000)
