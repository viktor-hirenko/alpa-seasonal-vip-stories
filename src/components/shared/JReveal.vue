<template>
  <span ref="root" class="j-reveal">
    <span v-for="(line, li) in lines" :key="li" :class="lineClass">
      <template v-for="(ch, ci) in line.chars" :key="ci">
        <!-- A space stays a plain text node. It is the only thing in the string
             that carries a line-break opportunity, and leaving it alone keeps
             the markup a third smaller. -->
        <template v-if="ch === ' '">{{ ' ' }}</template>
        <span v-else class="j-reveal__c" :class="CLASS[state(line.from + ci)]">{{
          shown(ch, line.from + ci)
        }}</span>
      </template>
    </span>
  </span>
</template>

<script setup>
/**
 * One slot of decoding text: «символи швидко перемішуються на місці й по черзі
 * фіксуються зліва направо» (21770:2032).
 *
 * ⚠️ THE TEXT STAYS IN THE FLOW, AND THE ROLLING GLYPH IS WIDTH-MATCHED. There
 * is no overlay and no pseudo-element here, and that is the result of measuring
 * two designs that looked correct and were not:
 *
 *   - an absolutely positioned `::after` painted over an INLINE span DOES
 *     affect layout in Chrome. At the frame where a footer went from two lines
 *     to three, forcing `content: none` put it straight back to two — measured,
 *     100 px against 150.
 *   - making the character spans `inline-block` is worse: every character then
 *     becomes a line-break opportunity, and the line re-wraps even with the
 *     effect finished.
 *
 * So a rolling character is simply drawn in place of the real one, chosen from
 * the glyphs of that font within 6 % of its width (decode.js). The wrapping
 * cannot move, because nothing in the line ever changes width by more than a
 * hair.
 *
 * ⚠️ PER-CHARACTER SPANS DO NOT CHANGE WRAPPING. Inline elements introduce no
 * break opportunities of their own; the browser still breaks on the text's own
 * spaces, which are left as bare text nodes above. Measured: with the effect
 * finished, the heading's layout is identical to the same page with
 * `?reveal=off`.
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  CHAR_DONE,
  CHAR_ROLL,
  CHAR_WAIT,
  charState,
  fontKeyOf,
  measureWidths,
  rollGlyph,
  ROLL_ANY,
  ROLL_NONE,
  usePageReveal,
  widestOf,
} from './decode.js'

const props = defineProps({
  /** A string, or one string per line as the translations ship them. */
  text: { type: [String, Number, Array], default: '' },
  /** Class for each line's wrapper, so callers keep their own typography. */
  lineClass: { type: String, default: 'j-reveal__line' },
})

const root = ref(null)
const widths = ref(null)
const host = ref(null)
const rollMode = ref(null)
const { progress, clock, register } = usePageReveal()

/**
 * ⚠️ REGISTERS ITS PARENT, NOT ITSELF. This wrapper is `display: contents` — it
 * generates no box at all, so its own rect is a row of zeroes and every slot on
 * the page would sort to the same place. The styled element above it is the one
 * that occupies the page, and it is also the one carrying the font the roll has
 * to match.
 */
onMounted(() => {
  host.value = root.value?.parentElement ?? root.value
  register(host.value)
  widths.value = measureWidths(host.value, fontKeyOf(host.value))
})

/**
 * ⚠️ THE SAFETY PROBE RUNS ON FIRST USE, NOT ON MOUNT, and the difference is
 * not academic. `useJournalFit` sizes every slot after `document.fonts.ready`
 * (ADR-0004), so a probe at mount measures a layout that no longer exists by
 * the time anything is on screen — and it cleared a footer for rolling that
 * then re-wrapped, 100 px to 150. By the time a slot's own reveal begins the
 * fit is long settled.
 */
watch(progress, p => {
  if (p > 0 && rollMode.value === null && host.value) rollMode.value = safestRoll(host.value)
})

/** Lines, plus where each one starts in the slot's own character count: the
 *  head crosses the whole slot once, so a two-line heading resolves as one
 *  sentence rather than as two races running side by side. */
const lines = computed(() => {
  const raw = Array.isArray(props.text) ? props.text : [props.text]
  let from = 0
  return raw.map(line => {
    const chars = [...String(line ?? '')]
    const row = { chars, from }
    from += chars.length
    return row
  })
})

const total = computed(() => lines.value.reduce((n, l) => n + l.chars.length, 0))

const CLASS = {
  [CHAR_WAIT]: 'j-reveal__c--wait',
  [CHAR_ROLL]: 'j-reveal__c--roll',
  [CHAR_DONE]: '',
}

const state = i => charState(i, total.value, progress.value)

const shown = (ch, i) =>
  state(i) === CHAR_ROLL
    ? rollGlyph(ch, i, clock.value, widths.value, rollMode.value ?? ROLL_NONE)
    : ch

/**
 * ⚠️ EACH SLOT PROVES FOR ITSELF THAT ROLLING CANNOT MOVE ITS LINES, once, on
 * mount. Everything before this was reasoning that measured well and still
 * broke one heading: canvas metrics disagree with the browser's own rounding at
 * the size it actually draws, and several of these lines sit exactly at the
 * edge of their box, where a single pixel flips a wrap. Measured: a footer
 * going from two lines to three while its slot grew 614 -> 616 px.
 *
 * So the slot renders its own worst case — every character replaced by the
 * widest glyph of its class — and looks at its height. If nothing moved, any
 * glyph is safe and the roll gets the whole alphabet, which is what reads best.
 * If it moved, the same test runs against same-width glyphs only. If even that
 * moves the lines, this slot does not roll at all: its characters arrive left
 * to right without shuffling, which is a far smaller loss than a headline that
 * changes shape while it is being read.
 *
 * The DOM is put back exactly as it was, and Vue renders from `shown` anyway.
 */
function safestRoll(host) {
  const spans = [...host.querySelectorAll('.j-reveal__c')]
  if (!spans.length || !widths.value) return ROLL_NONE
  const original = spans.map(s => s.textContent)
  const stable = swap => {
    const before = host.offsetHeight
    spans.forEach((s, i) => (s.textContent = swap(original[i])))
    const after = host.offsetHeight
    spans.forEach((s, i) => (s.textContent = original[i]))
    return after === before
  }
  // ⚠️ IT IS ALL OR NOTHING, AND THE MIDDLE GROUND WAS TRIED AND DROPPED. A
  // "same width to a thousandth" bucket passes this probe and still re-wraps at
  // runtime: the widths come from a probe span, the line is laid out in
  // context, and the two round differently in the last half-pixel. Measured, on
  // exactly one slot in the deck — Days' footer, which sits flush against its
  // box — an `a` for a `u` was enough to take it from two lines to three. So a
  // slot either survives its own worst case and rolls freely, or it does not
  // roll: its characters arrive left to right without shuffling.
  if (stable(ch => widestOf(ch, widths.value))) return ROLL_ANY
  return ROLL_NONE
}
</script>
