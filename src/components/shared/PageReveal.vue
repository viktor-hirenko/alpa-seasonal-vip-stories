<template>
  <slot />
</template>

<script setup>
/**
 * Hands one page its own reveal clock, and decides the order its slots arrive
 * in.
 *
 * The effect has to reach every text slot on eighteen pages — the shared
 * components and the markup a few pages write by hand — so threading a prop
 * from the player down through each page would have meant editing all of them.
 * This wraps the page and provides the clock instead.
 *
 * ⚠️ THE ORDER IS THE GEOMETRY, NOT THE SOURCE. Slots register on mount and are
 * then sorted by where they actually sit on the page, top to bottom. The first
 * version used mount order, which is template order, and on several pages that
 * is not the reading order at all — Days in the Spotlight declares its footer
 * last but the mock's own plaque says «рубрика, підпис, значення», and the
 * owner asked for it straight: «сначала сверху, потом нижний».
 *
 * ⚠️ `elapsed` IS SECONDS SINCE THE PAGE SETTLED, NOT SINCE IT APPEARED. The
 * content swaps at the segment's `cut` — the edge-on instant of the turn — and
 * TIMING.reveal counts from there, carrying its own offsets.
 *
 * ⚠️ THE COVER IS THE EXCEPTION, because it does not arrive by a page turn at
 * all: it flies in and settles at entrance.start + entrance.settleAt = 6.0 s
 * (30-timecodes.md). Its own cut is at 2.64, before the journal is even in
 * frame. The `Math.max` below is that rule and applies to no other segment.
 *
 * ⚠️ AN INACTIVE PAGE IS GIVEN `Infinity` — see DONE in decode.js.
 */
import { computed, provide, ref } from 'vue'
import { TIMING } from '@/story/timing.js'

const props = defineProps({
  /** The segment's `cut`: where this page's content swapped in. */
  cut: { type: Number, required: true },
  /** Story seconds, or Infinity when this page is not the one on screen. */
  now: { type: Number, default: Number.POSITIVE_INFINITY },
  /**
   * ⚠️ HELD OR PAUSED, THE PAGE IS SHOWN FINISHED. Freezing the reveal instead
   * looks exactly like a bug: a player who holds to read gets a blank spread
   * and nothing ever arrives, which is what the owner hit on 16.09. The state
   * is still a pure function of (time, paused), so a seek while paused draws
   * the same frame every time.
   */
  frozen: { type: Boolean, default: false },
})

const settledAt = computed(() =>
  Math.max(props.cut, TIMING.entrance.start + TIMING.entrance.settleAt),
)

/**
 * ⚠️ `?reveal=off` FREEZES THE EFFECT, AND IT EXISTS FOR THE MEASURING TOOLS.
 * Several scripts park the player on a second and photograph the result —
 * `tile-fit` samples the digit row on Days at 18.05, which is inside that
 * row's own entrance. A tool comparing our pixels with the clip's must never
 * be handed a transient. Read once: nothing turns this on mid-story.
 */
const off = new URLSearchParams(window.location.search).get('reveal') === 'off'

const elapsed = computed(() =>
  off || props.frozen || !Number.isFinite(props.now)
    ? Number.POSITIVE_INFINITY
    : props.now - settledAt.value,
)

// --- The slots, and their reading order ------------------------------------
const els = []
const orderOf = ref([])
const textCount = ref(1)

/** Sort every registered slot by its top edge and publish the ranking. */
const rank = () => {
  const tops = els.map((el, i) => [i, el ? el.getBoundingClientRect().top : 0])
  tops.sort((a, b) => a[1] - b[1])
  const next = new Array(els.length)
  tops.forEach(([i], place) => (next[i] = place))
  orderOf.value = next
  textCount.value = Math.max(1, els.length)
}

provide('pageReveal', {
  elapsed,
  textCount,
  /**
   * Called in setup. Reserves this slot's place and hands back both a live
   * view of its rank and the register it must call once it has an element.
   *
   * ⚠️ THE INDEX IS CLOSED OVER, not looked up later. An earlier version had
   * `register` find "the first slot without an element", which happens to work
   * only while setup order and mount order agree — a guarantee nothing in Vue
   * makes and one `<Suspense>` or async component would quietly break, handing
   * two slots each other's place in the stagger.
   */
  claimText() {
    const i = els.length
    els.push(null)
    return {
      order: computed(() => orderOf.value[i] ?? i),
      register(el) {
        els[i] = el
        // Ranking is cheap and each page does it once as its slots finish
        // mounting; the last call is the one that counts.
        rank()
      },
    }
  },
})
</script>
