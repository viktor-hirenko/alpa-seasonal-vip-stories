<template>
  <slot />
</template>

<script setup>
/**
 * Hands one page its own reveal clock.
 *
 * The decode has to reach `JChip`, `JHeading`, `JDigitTiles` and `JGlow` — four
 * shared components used across all eighteen pages — and threading a prop from
 * the player down through every page to every heading would have meant editing
 * all eighteen. This wraps the page instead and provides the clock, so the
 * effect lands in the four components the mock actually describes.
 *
 * ⚠️ `elapsed` IS SECONDS SINCE THE PAGE SETTLED, NOT SINCE IT APPEARED. The
 * page's content swaps at the segment's `cut` — the edge-on instant of the turn
 * — and the journal is standing still `TIMING.flip.back` later. `TIMING.reveal`
 * counts from the cut and carries that offset itself.
 *
 * ⚠️ AND THE COVER IS THE EXCEPTION, because it does not arrive by a page turn
 * at all: it flies in and settles at entrance.start + entrance.settleAt = 6.0 s
 * (30-timecodes.md). Its own cut is at 2.64, which is before the journal is
 * even in frame — decoding there would resolve a page nobody can see yet. The
 * `Math.max` below is that rule and applies to no other segment, since every
 * later cut is long past 6.0.
 *
 * ⚠️ AN INACTIVE PAGE IS GIVEN `Infinity`, deliberately. All eighteen are
 * mounted at once and `useJournalFit` measures every one of them in a single
 * sweep (ADR-0004); a page holding scrambled text would be measured scrambled.
 * Infinity resolves to progress 1 everywhere, so only the page on screen
 * animates — which is also why this costs one page's worth of work per frame
 * rather than eighteen.
 */
import { computed, provide } from 'vue'
import { TIMING } from '@/story/timing.js'

const props = defineProps({
  /** The segment's `cut`: where this page's content swapped in. */
  cut: { type: Number, required: true },
  /** Story seconds, or Infinity when this page is not the one on screen. */
  now: { type: Number, default: Number.POSITIVE_INFINITY },
})

const settledAt = computed(() =>
  Math.max(props.cut, TIMING.entrance.start + TIMING.entrance.settleAt),
)

/**
 * ⚠️ `?reveal=off` FREEZES THE EFFECT, AND IT EXISTS FOR THE MEASURING TOOLS.
 *
 * Half a dozen scripts in `scripts/` park the player on a given second and
 * photograph the result — `tile-fit` samples the digit row on Days at 18.05,
 * which is now 30 ms into the row's own decode. A tool that compares our
 * pixels with the clip's must never be handed a transient; it would measure
 * a scrambled glyph and report a defect that lasts a third of a second.
 *
 * Read once, not reactively: nothing turns this on mid-story, and a query
 * parameter that changed under the player would be worse than useless.
 */
const frozen = new URLSearchParams(window.location.search).get('reveal') === 'off'

const elapsed = computed(() =>
  !frozen && Number.isFinite(props.now) ? props.now - settledAt.value : Number.POSITIVE_INFINITY,
)

/**
 * The mock orders the reveal «рубрика, підпис, значення» (21770:2048), and
 * components take their place in that order as they mount — which, for a
 * single page, is template order. Each asks once, in setup.
 */
let next = 0
provide('pageReveal', {
  elapsed,
  claimOrder: () => next++,
})
</script>
