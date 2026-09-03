import { onMounted, onScopeDispose } from 'vue'
import { FACE } from '@/story/journalGeometry.js'

/**
 * Fit journal text to the boxes the mock drew for it. ADR-0004.
 *
 * WHY NOT getBoundingClientRect (which is what Thor's useViewportFit does):
 * the journal is rotated in 3D under a perspective, so its rect is the AABB of
 * the PROJECTION of a quadrilateral. It is not the width of the text, it
 * changes on every frame of the idle drift, and because the transform is not
 * affine it cannot be divided out by a single factor. Everything measured here
 * is a LAYOUT metric instead — `offsetWidth`, `clientWidth`, `scrollWidth`,
 * `scrollHeight` — which is computed before any transform is applied and is
 * therefore identical whether the page is flat, rotated or edge-on.
 *
 * WHY A BINARY SEARCH: Thor guesses multiplicatively
 * (`fit *= (width - 2*over) / width`), which only ever decreases. A guess that
 * overshoots can never come back, so a long string lands smaller than it needs
 * to be. Six halvings of [role.min, 1] land within 0.6 % of the largest size
 * that fits, from either side.
 *
 * WHY ONE PASS: a journal page is a fixed box in design px scaled uniformly by
 * `--u`, so the fitted ratio is a pure function of (page, language, font
 * metrics) — the viewport cannot change it. So: one sweep after
 * `document.fonts.ready`, cached, and NO recompute on resize. The
 * ResizeObserver below is a debounced VERIFIER, not the mechanism: it
 * re-measures with the cached values applied and only searches again if
 * something no longer fits. It is disconnected in `onScopeDispose` —
 * useViewportFit.js:147 in Thor adds a `resize` listener it never removes.
 *
 * WHY IT CAN MEASURE ALL 17 PAGES AT ONCE: inactive pages are
 * `visibility: hidden`, never `display: none` (ADR-0008), so they still take
 * part in layout and every metric above is live.
 *
 * ONE TRAP THAT COST AN HOUR: all 17 pages live inside ONE box, and that box is
 * laid out at `--jw`/`--jh`, which follow the CURRENT slide's face — 1465 x 1868
 * for the cover, 1564 x 1911 for a data page (journalGeometry.js). At boot the
 * cover is showing, so every data page measures 6.3 % narrower than the box it
 * will actually be shown in, and rows that fit fine get shrunk for nothing
 * (sports_desk's seven-digit row came out at 0.98 before this was noticed).
 * So the sweep groups pages by their `data-face` and sets `--jw`/`--jh` to that
 * face while it measures the group, restoring afterwards. The swap and the
 * restore happen inside one synchronous task, so no intermediate state can be
 * painted.
 */

/**
 * Roles are declared in the primitives with `data-fit-role`; a role is the
 * answer to "how small may this text get before the page reads as broken?".
 *
 *  display  headings (JHeading). Two lines of 96 px is the mock's rhythm;
 *           below ~0.6 the heading stops out-weighing the chip above it.
 *  chip     the "Tabs" pill (JChip). Short labels in every language, so it
 *           barely ever moves; 0.7 is a floor, not a target.
 *  digit    the bordered tile row (JDigitTiles), via `--tile-fit`, which scales
 *           the WHOLE row (height, padding, gap, radius, glyph) so the tiles
 *           stay one similarity class — see 31-pages.md. 0.45 covers a
 *           14-digit row at h=200, which is far past anything real.
 *  value    big gradient values and names (JValue, the cover's player name).
 *           MEASURED: a 23-character player name in the cover's 1058-wide box
 *           lands at 0.419, and a 37-character game name in Headline Win's 1230
 *           box at 0.559. 0.35 buys room for ~27 characters; past that the name
 *           would be set smaller than the "Featuring:" caption above it, which
 *           is the point where shrinking stops being the right answer and the
 *           slot needs to wrap instead (a pageLayouts.js decision, ADR-0007).
 *  currency the currency code (JCurrency). Three letters, effectively fixed.
 */
const ROLES = {
  display: { min: 0.6, prop: '--fit' },
  chip: { min: 0.7, prop: '--fit' },
  digit: { min: 0.45, prop: '--tile-fit' },
  value: { min: 0.35, prop: '--fit' },
  currency: { min: 0.7, prop: '--fit' },
}

const ITERATIONS = 6
/** CSS px. offsetWidth/clientWidth/scrollWidth are integer-rounded, so a box
 *  that fits exactly can read one pixel over. */
const TOL = 1
const VERIFY_DEBOUNCE = 150

const entryKey = e => `${e.page}/${e.role}/${e.ordinal}/${e.text}`

/**
 * Collect everything that declares a role, once per pass (pages are static
 * after mount in the player; the lab swaps one page and calls `refit`).
 */
function collect(root) {
  const out = []
  const counters = new Map()
  root.querySelectorAll('[data-fit-role]').forEach(el => {
    const role = el.dataset.fitRole
    const cfg = ROLES[role]
    if (!cfg) return
    const page = el.closest('[data-page]')?.dataset.page || 'page'
    const seat = `${page}/${role}`
    const ordinal = counters.get(seat) || 0
    counters.set(seat, ordinal + 1)

    const cs = getComputedStyle(el)
    out.push({
      el,
      role,
      cfg,
      page,
      ordinal,
      // Base size the box must be at while this page is measured.
      face: el.closest('[data-face]')?.dataset.face || 'page',
      // The box that supplies the width budget. See `measure`.
      inline: cs.display.startsWith('inline'),
      flex: cs.display.includes('flex'),
      slot: el.closest('.j-slot') || el,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48),
    })
  })
  return out
}

/**
 * Line count without trusting rect GEOMETRY.
 *
 * An inline box reports one client rect per line box, and a 3D transform can
 * move those rects but can neither merge nor split them, so COUNTING them is
 * transform-safe even though their coordinates are not. Block boxes get the
 * arithmetic ADR-0004 prescribes: scrollHeight over the computed line-height.
 */
function lineCount(e) {
  const el = e.el
  if (e.flex) return 1
  if (e.inline) return el.getClientRects().length || 1
  const cs = getComputedStyle(el)
  const raw = cs.lineHeight
  let lh = parseFloat(raw)
  // Chrome resolves a numeric line-height to px, Firefox keeps the number, and
  // `normal` resolves to neither.
  if (!lh || raw === 'normal') lh = parseFloat(cs.fontSize) * 1.2
  else if (!raw.includes('px')) lh *= parseFloat(cs.fontSize)
  return lh > 0 ? Math.max(1, Math.round(el.scrollHeight / lh)) : 1
}

/**
 * True width of a flex row, from its children's layout offsets.
 *
 * `scrollWidth` would do for the fit/no-fit decision, but it never reports less
 * than `clientWidth`, so a row that fits reads as exactly as wide as the page —
 * and then the report cannot tell "fits with 90 px to spare" from "fits by a
 * hair". `offsetLeft`/`offsetWidth` are layout metrics like everything else
 * here, and they give the real extent in both directions, including the
 * negative one a centred row overflows into.
 */
function rowExtent(el) {
  const kids = el.children
  if (!kids.length) return el.scrollWidth
  const first = kids[0]
  const last = kids[kids.length - 1]
  return last.offsetLeft + last.offsetWidth - first.offsetLeft
}

/**
 * Two DOM shapes carry text here, and one rule covers both:
 *
 *  - INLINE-LEVEL role element (JChip's inline-block pill, JValue's and
 *    JCurrency's spans): it is shrink-to-fit, so its own `offsetWidth` IS the
 *    natural width of the text, and the budget is the slot around it.
 *    `clientWidth` is 0 on an inline box, which is exactly why it can't be used.
 *  - BLOCK-LEVEL role element (JHeading's h2, JDigitTiles' flex row, the
 *    cover's fixed-width name): it already has the budget width, and the
 *    content overflows it, so it is `scrollWidth` against `clientWidth`.
 *
 * A centred block (a heading with a word too long to break) overflows
 * SYMMETRICALLY, and `scrollWidth` counts only the right-hand half of that. The
 * magnitude is understated, the predicate is not: symmetric overflow reaches
 * zero on both sides at the same instant, so `scrollWidth <= clientWidth` is
 * still exactly "it fits". The digit row would suffer the same understatement,
 * which is why it is measured by `rowExtent` instead — there the exact number
 * is wanted in the report as well.
 */
function measure(e) {
  const el = e.el
  const natural = e.flex ? rowExtent(el) : e.inline ? el.offsetWidth : el.scrollWidth
  const avail = e.inline ? (el.parentElement?.clientWidth ?? 0) : el.clientWidth
  const lines = lineCount(e)
  // Opt-in vertical budget. Nothing declares one yet: the line counts the mock
  // implies are not in the codebase until pageLayouts.js lands with the
  // language variants (ADR-0007), and guessing a budget from the authored line
  // count would wrongly squeeze every heading that is meant to wrap.
  const maxLines = Number(e.slot.dataset.fitLines || 0)
  return {
    natural,
    avail,
    lines,
    ok: natural <= avail + TOL && (!maxLines || lines <= maxLines),
  }
}

const setFit = (e, v) => e.el.style.setProperty(e.cfg.prop, v === 1 ? '1' : v.toFixed(4))

/**
 * One sweep. Writes are batched per iteration and reads follow them, so the
 * whole search costs ~8 layout flushes for the entire journal rather than 8 per
 * element.
 */
function sweep(entries, cache) {
  entries.forEach(e => {
    e.fit = cache.get(entryKey(e)) ?? 1
    setFit(e, e.fit)
  })
  entries.forEach(e => {
    e.m = measure(e)
  })

  // avail === 0 means the page is not laid out at all (zero-size stage); there
  // is nothing to fit against, and shrinking on a bogus measurement would be
  // worse than leaving the design size in place.
  const live = entries.filter(e => e.m.avail > 0 && !e.m.ok)
  live.forEach(e => {
    e.lo = e.cfg.min
    e.hi = 1
  })

  for (let i = 0; i < ITERATIONS && live.length; i++) {
    live.forEach(e => {
      e.mid = (e.lo + e.hi) / 2
      setFit(e, e.mid)
    })
    live.forEach(e => {
      if (measure(e).ok) e.lo = e.mid
      else e.hi = e.mid
    })
  }

  // `lo` is the largest tested ratio that fit; if nothing fit it is still
  // role.min, and the entry is reported as clamped.
  live.forEach(e => {
    e.fit = e.lo
    setFit(e, e.fit)
  })

  entries.forEach(e => {
    e.m = measure(e)
    cache.set(entryKey(e), e.fit)
    // Consumed by the vertical re-centring of a slot whose text grew a line
    // (ADR-0007). Written on the slot, not the text node, because the slot is
    // what moves.
    e.slot.style.setProperty('--slot-lines-actual', String(e.m.lines))
  })
}

/**
 * Lay the box out at `face` for the duration of `fn`, then put it back exactly
 * as it was — including "was not set inline at all". Everything in between is
 * synchronous, so the browser never gets a chance to paint the swapped size.
 */
function withFace(root, face, fn) {
  const size = FACE[face]
  const prev = { w: root.style.getPropertyValue('--jw'), h: root.style.getPropertyValue('--jh') }
  const restore = (name, value) =>
    value ? root.style.setProperty(name, value) : root.style.removeProperty(name)
  if (size) {
    root.style.setProperty('--jw', String(size.w))
    root.style.setProperty('--jh', String(size.h))
  }
  try {
    fn()
  } finally {
    if (size) {
      restore('--jw', prev.w)
      restore('--jh', prev.h)
    }
  }
}

/** Design-pixel unit, derived the same way scripts/probe.mjs derives it. */
function designUnit(root) {
  const box = root.querySelector('.journal-box')
  const jw = parseFloat(getComputedStyle(root).getPropertyValue('--jw'))
  if (!box || !jw) return 1
  return box.offsetWidth / jw || 1
}

/**
 * @param {import('vue').Ref<HTMLElement|null>|(() => HTMLElement|null)} rootRef
 *   The stage. Must be called from a setup body so `onScopeDispose` binds.
 */
export function useJournalFit(rootRef) {
  const cache = new Map()
  let disposed = false
  let observer = null
  let timer = 0

  const resolveRoot = () => {
    const r = typeof rootRef === 'function' ? rootRef() : rootRef?.value
    return r || document.querySelector('.stage')
  }

  const refit = (reason = 'manual') => {
    const root = resolveRoot()
    if (!root || disposed) return null

    const t0 = performance.now()
    const entries = collect(root)
    const faces = [...new Set(entries.map(e => e.face))]
    faces.forEach(face => {
      const group = entries.filter(e => e.face === face)
      withFace(root, face, () => sweep(group, cache))
    })
    const u = designUnit(root)
    const px = v => +(v / u).toFixed(1)

    const report = {
      reason,
      ms: +(performance.now() - t0).toFixed(1),
      u: +u.toFixed(5),
      viewport: [window.innerWidth, window.innerHeight],
      // Design px, so the numbers can be compared with Figma and 31-pages.md
      // directly instead of being divided by --u by hand.
      entries: entries.map(e => ({
        page: e.page,
        face: e.face,
        role: e.role,
        text: e.text,
        fit: +e.fit.toFixed(4),
        natural: px(e.m.natural),
        avail: px(e.m.avail),
        lines: e.m.lines,
        clamped: !e.m.ok,
      })),
    }
    report.shrunk = report.entries.filter(x => x.fit < 1)
    report.clamped = report.entries.filter(x => x.clamped)

    if (import.meta.env.DEV) {
      window.__story = window.__story || {}
      window.__story.fitReport = report
      window.__story.refit = refit
    }
    return report
  }

  onMounted(() => {
    // Glyph advances decide every measurement here, so nothing may be measured
    // before the real face is in place. `font-display: block` keeps the text
    // invisible until then (see _fonts.scss), which is what makes a single pass
    // legitimate rather than a race.
    const fonts = document.fonts?.ready ?? Promise.resolve()
    fonts.then(() => {
      if (disposed) return
      refit('boot')

      if (typeof ResizeObserver === 'undefined') return
      observer = new ResizeObserver(() => {
        clearTimeout(timer)
        timer = setTimeout(() => refit('verify'), VERIFY_DEBOUNCE)
      })
      const root = resolveRoot()
      if (root) observer.observe(root)
    })
  })

  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
    observer?.disconnect()
    observer = null
  })

  return { refit }
}
