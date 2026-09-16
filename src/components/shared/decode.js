import { computed, inject } from 'vue'
import { TIMING } from '@/story/timing.js'

/**
 * The mock's decoding text, as a pure function of the clock.
 *
 * «Ефект декодування — символи швидко переміщуються на місці й по черзі
 * фіксуються зліва направо, поки рядок не «розшифрується» в читабельний»
 * (21770:2032, and again on the template plaque 21770:2048). Transcribed in
 * _context/37-content-animation.md.
 *
 * ⚠️ NOTHING HERE REMEMBERS ANYTHING, AND THAT IS THE POINT. This story is
 * seeked constantly — tap navigation, the desktop arrows, "watch again", and
 * the holes left by pages a link carries no data for — so an effect built out
 * of stored state would be wrong the moment the playhead moved anywhere but
 * forward (ADR-0008 makes the same argument for the page cut). Every glyph
 * below is derived from the character's index and the second on the clock, so
 * `decode(text, t)` at any t draws the one correct frame, forwards, backwards
 * or straight into the middle.
 */

/** Same-class replacements, so a line keeps its shape while it resolves. */
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'

/**
 * A stable hash of (index, tick). Deterministic everywhere — no Math.random,
 * because two players on the same second must see the same thing and a seek
 * back must redraw what it drew before.
 */
const glyphAt = (set, index, tick) => {
  let h = (index * 374761393 + tick * 668265263) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return set[h % set.length]
}

/**
 * ⚠️ ONLY LETTERS AND DIGITS ARE SCRAMBLED. Spaces, punctuation and currency
 * marks are left standing: they carry the shape of the line, and swapping them
 * turns a resolving headline into noise. Case is preserved for the same reason,
 * and the length NEVER changes — the four languages' line breaks were fitted
 * character by character (V-83) and a line that breathes would undo that.
 */
const scrambleChar = (ch, index, tick) => {
  if (ch >= 'A' && ch <= 'Z') return glyphAt(UPPER, index, tick)
  if (ch >= 'a' && ch <= 'z') return glyphAt(LOWER, index, tick)
  if (ch >= '0' && ch <= '9') return glyphAt(DIGITS, index, tick)
  return ch
}

/**
 * @param {string} text   the finished line
 * @param {number} p      0..1, how much of it has locked
 * @param {number} clock  seconds, for rolling the unresolved glyphs
 */
export function decode(text, p, clock) {
  if (!text || p >= 1) return text
  if (p <= 0) p = 0
  const chars = [...text]
  const locked = Math.floor(p * chars.length)
  const tick = Math.floor(clock / TIMING.reveal.tick)
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    out += i < locked ? chars[i] : scrambleChar(chars[i], i, tick)
  }
  return out
}

/**
 * Where one element of a page stands, given how long the page has been
 * settled and the element's place in the mock's order: rubric, then caption,
 * then value (21770:2048).
 *
 * `elapsed` of `Infinity` — what every page that is not the one on screen is
 * given — returns 1, so the eighteen pages nobody is looking at hold their
 * finished text. `useJournalFit` measures all of them in one sweep (ADR-0004)
 * and must never be handed a scrambled line.
 */
export function revealProgress(elapsed, order = 0) {
  if (!Number.isFinite(elapsed)) return 1
  const { after, stagger, dur } = TIMING.reveal
  const local = (elapsed - after - order * stagger) / dur
  return local <= 0 ? 0 : local >= 1 ? 1 : local
}

/** The key element's bloom, which the plaque wants growing after the text. */
export function glowProgress(elapsed) {
  if (!Number.isFinite(elapsed)) return 1
  const { after, glow } = TIMING.reveal
  const local = (elapsed - after - glow.after) / glow.dur
  return local <= 0 ? 0 : local >= 1 ? 1 : local
}

/**
 * What a text component needs: its own place in the stagger, its progress, and
 * the clock to roll unresolved glyphs by.
 *
 * ⚠️ THE MISSING-PROVIDER CASE IS NOT A BUG. The lab (lab.html) mounts pages
 * on their own to review poses, with no player and no PageReveal above them;
 * so does anything else that renders a page outside the story. With no clock to
 * read, the honest answer is "finished", and that is what falls out here.
 */
export function usePageReveal() {
  const ctx = inject('pageReveal', null)
  const order = ctx ? ctx.claimOrder() : 0
  const progress = computed(() => (ctx ? revealProgress(ctx.elapsed.value, order) : 1))
  return {
    progress,
    clock: computed(() => {
      const e = ctx?.elapsed.value
      return Number.isFinite(e) ? e : 0
    }),
    /**
     * ⚠️ NOTHING IS ON THE PAGE UNTIL ITS OWN TURN COMES, and that is the mock,
     * not a preference: «текст проявляється ПІСЛЯ ЗАВЕРШЕННЯ перегортання»
     * (21770:2049). Without it the content swap at the cut puts a full page of
     * scrambled characters on a journal that is still turning, and the player
     * watches garbage ride round on the page for 0.6 s before it starts
     * resolving. The element arrives with its first scrambled frame instead.
     */
    style: computed(() => (progress.value > 0 ? null : { opacity: 0 })),
  }
}

/** The bloom's own ramp. Takes no place in the text stagger. */
export function usePageGlow() {
  const ctx = inject('pageReveal', null)
  return computed(() => (ctx ? glowProgress(ctx.elapsed.value) : 1))
}
