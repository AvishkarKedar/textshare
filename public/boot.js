if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {})
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

// sticky mobile "Create a room" CTA, shown once the hero scrolls out of view
;(function () {
  var gate = document.getElementById('gate')
  var hero = document.querySelector('.hero')
  var cta = document.getElementById('stickyCta')
  var create = document.getElementById('gCreate')
  if (!gate || !hero || !cta || !create) return
  cta.addEventListener('click', function () { create.click() })
  var onScroll = function () {
    if (window.innerWidth > 720) { cta.classList.remove('show'); return }
    var past = gate.scrollTop > hero.offsetHeight - 80
    cta.classList.toggle('show', past)
  }
  gate.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  onScroll()
})()
