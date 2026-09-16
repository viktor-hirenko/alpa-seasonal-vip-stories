import { computed, inject } from 'vue'
import { TIMING } from '@/story/timing.js'

/**
 * The mock's decoding text, as a pure function of the clock.
 *
 * «Ефект декодування — символи швидко перемішуються на місці й по черзі
 * фіксуються зліва направо, поки рядок не «розшифрується» у читабельний»
 * (21770:2032, and again on the template plaque 21770:2048). Transcribed in
 * _context/37-content-animation.md.
 *
 * ⚠️ THIS IS THE SECOND ATTEMPT, AND THE FIRST ONE'S TWO MISTAKES ARE WHY.
 *
 * 1. IT SCRAMBLED THE WHOLE LINE AT ONCE and locked it left to right. That is
 *    a defensible reading of the plaque and it looked wrong: a full line of
 *    random letters standing there from the first frame reads as noise, not as
 *    text arriving. Now the line BUILDS: finished text on the left, a short
 *    rolling head, nothing at all to the right of it.
 * 2. IT SWAPPED THE CHARACTERS IN THE TEXT ITSELF, so a random glyph wider
 *    than the real one re-wrapped the line. Measured across all 16 cuts in two
 *    languages, a heading's height swung by up to 183 px mid-decode — one line
 *    becoming four and back. The owner saw it as «сначала две строки, потом
 *    три». Now the FINAL text is what sits in the flow at all times; a rolling
 *    glyph is painted over it by a pseudo-element and cannot touch the layout.
 *    See JReveal.vue and `.j-reveal` in _pages.scss.
 *
 * ⚠️ NOTHING HERE REMEMBERS ANYTHING, and that is deliberate. This story is
 * seeked constantly — tap navigation, the desktop arrows, "watch again", and
 * the holes left by pages a link carries no data for — so an effect built out
 * of stored state would be wrong the moment the playhead moved anywhere but
 * forward (ADR-0008 makes the same argument for the page cut). Every glyph is
 * derived from the character's index and the second on the clock, so any
 * `tl.time(t)` draws the one correct frame, forwards, backwards or straight
 * into the middle.
 */

/** Same-class replacements, so the roll never looks like a different alphabet. */
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'

/**
 * ⚠️ A ROLLING GLYPH IS CHOSEN TO BE AS WIDE AS THE ONE IT COVERS, and that is
 * the whole reason this file measures fonts.
 *
 * The text stays IN THE FLOW while it decodes — it is the finished line's own
 * characters that hold the line's width and its wrapping — so a replacement
 * glyph of a different width would re-wrap the line. Two earlier attempts went
 * the other way and both failed, measured:
 *
 *   - swapping characters freely re-wrapped headings mid-decode, two lines
 *     becoming three and back;
 *   - painting the replacement with an absolutely positioned `::after` over an
 *     INLINE span looked out-of-flow and is not: forcing `content: none` at the
 *     bad frame took a heading from 150 px back to 100. An `inline-block` span
 *     fares worse still — it makes every character a line-break opportunity, so
 *     the line re-wraps even with the effect finished.
 *
 * So the alphabet is bucketed by width instead. Widths are measured once per
 * font on a canvas at a reference size; they are ratios, so one measurement
 * serves every size the fitter produces.
 */
/**
 * ⚠️ WIDTHS ARE MEASURED IN THE DOM, NOT ON A CANVAS, and the difference is the
 * whole fix. A canvas at a reference size says `A` and `C` are the same width;
 * the browser, laying them out at 46.4555 px with its own rounding, says they
 * differ by a pixel — and a pixel is enough, because several of these lines sit
 * exactly at the edge of their box. Measured: with canvas buckets a footer
 * still flipped from two lines to three, the slot going 614 -> 616 px.
 *
 * So a probe span is rendered inside the real slot, in the real font at the
 * real size, and only glyphs whose measured width matches the original's to
 * within a thousandth are allowed to stand in for it. Anything without a match
 * simply does not roll — a character that holds still for its own 0.1 s is
 * invisible next to the three around it that do not.
 *
 * The result is cached per font, so the sixty-odd slots in the deck pay for
 * about five measurements each.
 */
const WIDTH_EPS = 0.001
const domWidths = new Map()

export function measureWidths(host, fontKey) {
  if (!host || !fontKey) return null
  const cached = domWidths.get(fontKey)
  if (cached) return cached
  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none'
  host.appendChild(probe)
  const widths = new Map()
  for (const set of [UPPER, LOWER, DIGITS]) {
    for (const ch of set) {
      probe.textContent = ch
      widths.set(ch, probe.getBoundingClientRect().width)
    }
  }
  probe.remove()
  domWidths.set(fontKey, widths)
  return widths
}

/**
 * A stable hash of (index, tick). Deterministic everywhere — no Math.random,
 * because two players on the same second must see the same thing and a seek
 * back must redraw what it drew before.
 */
const hash = (index, tick) => {
  let h = (index * 374761393 + tick * 668265263) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return Math.imul(h, 1274126177) >>> 0
}

/**
 * What a rolling character shows: a glyph of its own class and, to the
 * thousandth, its own width. Punctuation, spaces and currency marks keep their
 * own shape — they carry the line's silhouette, and rolling them turns a
 * resolving headline into noise.
 */
/** The widest glyph of a character's own class: the worst case a slot can be
 *  asked to render, and therefore what the safety probe tries. */
export function widestOf(ch, widths) {
  const set = classOf(ch)
  if (!set || !widths) return ch
  let best = ch
  let bestW = widths.get(ch) ?? 0
  for (const candidate of set) {
    const w = widths.get(candidate) ?? 0
    if (w > bestW) {
      bestW = w
      best = candidate
    }
  }
  return best
}

const classOf = ch =>
  ch >= 'A' && ch <= 'Z'
    ? UPPER
    : ch >= 'a' && ch <= 'z'
      ? LOWER
      : ch >= '0' && ch <= '9'
        ? DIGITS
        : null

export const ROLL_ANY = 'any'
export const ROLL_EXACT = 'exact'
export const ROLL_NONE = 'none'

export const rollGlyph = (ch, index, clock, widths, mode = ROLL_EXACT) => {
  if (mode === ROLL_NONE) return ch
  const set = classOf(ch)
  if (!set) return ch
  // Fixed-width boxes — the digit tiles — have no widths to match and need
  // none: their glyphs sit in their own cells and cannot move anything.
  if (mode === ROLL_ANY && !widths) {
    return set[hash(index, Math.floor(clock / TIMING.reveal.tick)) % set.length]
  }
  if (!widths) return ch
  const want = widths.get(ch)
  if (!want) return ch
  let near
  if (mode === ROLL_ANY) {
    near = [...set]
  } else {
    near = []
    for (const candidate of set) {
      const w = widths.get(candidate)
      if (w && Math.abs(w - want) <= want * WIDTH_EPS) near.push(candidate)
    }
  }
  if (near.length < 2) return ch
  const tick = Math.floor(clock / TIMING.reveal.tick)
  return near[hash(index, tick) % near.length]
}

/** The font a slot rolls against; also the cache key for its measurements. */
export function fontKeyOf(el) {
  if (!el) return null
  const cs = getComputedStyle(el)
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily} ${cs.textTransform} ${cs.letterSpacing}`
}

export const CHAR_DONE = 2
export const CHAR_ROLL = 1
export const CHAR_WAIT = 0

/**
 * Where one character stands, given the progress of its whole line.
 *
 * The head travels `total + head` characters over the line's own duration, so
 * that at p = 1 even the last character has had its full roll and landed.
 */
export function charState(index, total, p) {
  if (p >= 1) return CHAR_DONE
  if (p <= 0) return CHAR_WAIT
  const head = TIMING.reveal.head
  const reach = p * (total + head)
  if (index < reach - head) return CHAR_DONE
  if (index < reach) return CHAR_ROLL
  return CHAR_WAIT
}

/** 0..1, clamped. */
const ramp = (elapsed, at, dur) => {
  const p = (elapsed - at) / dur
  return p <= 0 ? 0 : p >= 1 ? 1 : p
}

/**
 * What a page that is NOT the one on screen is given. It resolves to "finished"
 * everywhere: all eighteen pages are mounted at once and `useJournalFit`
 * measures every one of them in a single sweep (ADR-0004), so a page holding a
 * half-built line would be measured half-built. It is also why the effect costs
 * one page's worth of work per frame rather than eighteen.
 */
const DONE = Number.POSITIVE_INFINITY

/**
 * A text slot's own progress. `order` is its place TOP TO BOTTOM on the page —
 * PageReveal works that out from the rendered geometry, not from the order the
 * page file happens to declare its slots in.
 */
export function usePageReveal() {
  const ctx = inject('pageReveal', null)
  const slot = ctx ? ctx.claimText() : null
  const elapsed = computed(() => ctx?.elapsed.value ?? DONE)
  const progress = computed(() => {
    const e = elapsed.value
    if (!Number.isFinite(e)) return 1
    const { at, stagger, dur } = TIMING.reveal.text
    return ramp(e, at + (slot?.order.value ?? 0) * stagger, dur)
  })
  return {
    progress,
    /** Seconds for the roll to be derived from; 0 when there is no clock. */
    clock: computed(() => (Number.isFinite(elapsed.value) ? elapsed.value : 0)),
    /** The slot is registered here so the page can sort it by its position. */
    register: slot?.register ?? (() => {}),
  }
}

/**
 * The central illustration: the spread's picture, its thumbnail, its badge.
 * It arrives a beat BEFORE the words, so the page reads as one object landing
 * rather than as several things switching on — see TIMING.reveal.art.
 */
export function usePageArt() {
  const ctx = inject('pageReveal', null)
  return computed(() => {
    const e = ctx?.elapsed.value ?? DONE
    if (!Number.isFinite(e)) return 1
    return ramp(e, TIMING.reveal.art.at, TIMING.reveal.art.dur)
  })
}

/**
 * «Підсвітка ключового елемента» — the bloom the mock already draws under the
 * numbers and the hero, rising once the last line has started. Last, because
 * the plaque makes it the finishing touch.
 */
export function usePageGlow() {
  const ctx = inject('pageReveal', null)
  return computed(() => {
    const e = ctx?.elapsed.value ?? DONE
    if (!Number.isFinite(e)) return 1
    const { at, stagger } = TIMING.reveal.text
    const lastLineStarts = at + Math.max(0, (ctx?.textCount.value ?? 1) - 1) * stagger
    return ramp(e, lastLineStarts + TIMING.reveal.glow.after, TIMING.reveal.glow.dur)
  })
}
