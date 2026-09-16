<template>
  <div class="j-slot" :style="slotStyle" :data-fit-lines="lines || null">
    <span class="j-value" data-fit-role="value"><JReveal :text="String(value)" /></span>
  </div>
</template>

<script setup>
/**
 * A big gradient number without tiles — Seasonal Power's "1 200 000"
 * (21770:3046, 1020 x 188 at y=1485). Same accent gradient as the tiles.
 *
 * `size` IS A CEILING WHERE A PAGE SAYS SO, exactly as JDigitTiles' `height`
 * is (V-61). The mock draws one value per page, and where that value is the
 * long demo one its size is what the LONG string shrank to — so a short value
 * inherits a size meant for nine characters and comes out small. Measured on
 * Seasonal Power (session S, `tile-fit.mjs --value`): at the clip's own print,
 * "120", the clip's number is x2.03 of ours, three seconds in a row, spread
 * 2.4 %. The page therefore declares the SHORT-value size and lets
 * useJournalFit shrink the long one back into `width`, which lands it on the
 * mock's 188 again. This is the second half of DP-15258's "adaptive font size
 * for values of different lengths"; the tiles were the first.
 *
 * A page that grows may not grow DOWNWARDS from the mock's top edge — at
 * Seasonal Power's ceiling that would push the number 91 px below where the
 * clip keeps it — so `centerY` anchors the middle instead, the way
 * JDigitTiles' does, and both the short and the long value then sit on one
 * line. Text slots (game names, the player name) keep `top`.
 */
import { computed } from 'vue'
import JReveal from './JReveal.vue'
import { alignStyle } from './slotAlign.js'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  top: { type: Number, default: 0 },
  /** Design-px centre line, from the body's top: the value grows both ways.
   *  Exactly one of `top` and `centerY`. */
  centerY: { type: Number, default: 0 },
  /** Design-px font size: the mock's, or the SHORT-value ceiling (see above). */
  size: { type: Number, default: 188 },
  maxWidth: { type: Number, default: 0 },
  /** 'center' (default), 'left' pinned at `left`, 'right' with its right edge at `right`. */
  align: { type: String, default: 'center' },
  left: { type: Number, default: 0 },
  right: { type: Number, default: 0 },
  /**
   * Explicit box width in design px, as JHeading already takes. Two pages were
   * passing it and getting nothing: without the prop it fell through as a bare
   * `width` attribute on the div, so Seasonal Power's value sat centred on the
   * page axis instead of on the mock's 700, and Headline Win's game name had no
   * budget to be fitted against. It is also what makes a fixed-width box
   * shrink-to-fit rather than grow (31-pages.md: 1020 / 1230 / 848).
   */
  width: { type: Number, default: 0 },
  /** Vertical budget in line boxes (`data-fit-lines`); see JHeading. These
   *  slots are `white-space: nowrap`, so it is a tripwire rather than a rule. */
  lines: { type: Number, default: 0 },
  /** Declared so a pageLayouts `v-bind` cannot fall through as an attribute. */
  grow: { type: String, default: 'down' },
})

const slotStyle = computed(() => ({
  // A translate, not `bottom:` or a computed offset: it is a percentage of the
  // slot's OWN height, so it is right at either face size and at any fitted
  // font (JDigitTiles' note on --jw/--jh gives the long version).
  ...(props.centerY
    ? { top: `calc(${props.centerY} * var(--u))`, transform: 'translateY(-50%)' }
    : { top: `calc(${props.top} * var(--u))` }),
  '--value-font': `calc(${props.size} * var(--u))`,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
  ...alignStyle(props),
}))
</script>
