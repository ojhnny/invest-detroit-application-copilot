// How far down the progress bar must stick so a fixed or sticky site header doesn't cover it.
// investdetroit.com has a fixed 80px header; without this, the bar slides underneath it.
// Used only when the script tag has no data-progress-top (which always wins).

const isOurs = (el) => !!el.closest?.('[data-invest-detroit-copilot]')

/** Bottom edge (px) of whatever fixed/sticky element covers the top of the screen, or 0. */
export function coveredTop(win = window) {
  const doc = win.document
  let bottom = 0
  // Sample a few points along the top edge: headers can leave the middle empty (logo left, menu right).
  for (const x of [0.15, 0.5, 0.85].map((f) => Math.round(win.innerWidth * f))) {
    for (const el of doc.elementsFromPoint?.(x, 1) || []) {
      if (isOurs(el)) continue
      for (let node = el; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
        const pos = win.getComputedStyle(node).position
        if (pos !== 'fixed' && pos !== 'sticky') continue
        const r = node.getBoundingClientRect()
        // A real header: pinned at the top, not a full-screen overlay or a menu covering the page.
        if (r.top <= 1 && r.bottom > 0 && r.height < win.innerHeight * 0.4) bottom = Math.max(bottom, Math.round(r.bottom))
        break
      }
    }
  }
  return bottom
}

/**
 * Keeps `el.style.top` just below the site's header as the page scrolls or resizes
 * (some headers shrink or hide on scroll). Returns a stop function.
 */
export function followHeader(el, win = window) {
  let queued = false
  const update = () => { queued = false; el.style.top = `${coveredTop(win)}px` }
  const schedule = () => { if (!queued) { queued = true; win.requestAnimationFrame(update) } }
  update()
  win.addEventListener('scroll', schedule, { passive: true })
  win.addEventListener('resize', schedule)
  return () => { win.removeEventListener('scroll', schedule); win.removeEventListener('resize', schedule) }
}
