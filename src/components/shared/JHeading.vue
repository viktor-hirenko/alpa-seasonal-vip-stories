<template>
  <div class="j-slot" :style="slotStyle" :data-fit-lines="lines || null">
    <h2 class="j-heading" data-fit-role="display">
      <JReveal :text="textLines" line-class="j-heading__line" />
    </h2>
  </div>
</template>

<script setup>
/**
 * Display heading. Figma 21770:2960 / 2961.
 *
 * Accepts a string or an array of lines. Arrays render one <span> per line so
 * a future GSAP entrance can stagger them, and so a translator's line breaks
 * survive without a hardcoded <br> (translations ship multi-line values as
 * arrays — see _context/31-pages.md).
 */
import { computed } from 'vue'
import { alignStyle } from './slotAlign.js'
import JReveal from './JReveal.vue'
import { BODY } from '@/story/pageLayouts.js'

const props = defineProps({
  text: { type: [String, Array], default: '' },
  /** Design-px offset from the page body's top edge. */
  top: { type: Number, default: 0 },
  /**
   * Design-px offset from the body's top edge to the slot's fixed BOTTOM edge,
   * for a slot that grows UPWARDS (ADR-0007 `grow: 'up'`). Measured on exactly
   * one slot in the deck: Joke's headline, whose top moves 674.24 -> 576.87
   * between languages while its bottom stays on 771.2 (21770:4318 / 4330).
   * Takes precedence over `top` when set.
   */
  bottom: { type: Number, default: 0 },
  /**
   * Vertical budget in line boxes, from pageLayouts.js. Written to the slot as
   * `data-fit-lines`, which useJournalFit reads as an optional cap: a language
   * whose line wraps past it is shrunk rather than allowed to collide with
   * whatever the mock put underneath.
   */
  lines: { type: Number, default: 0 },
  /** Design-px cap on the text box, from the mock. */
  maxWidth: { type: Number, default: 0 },
  /**
   * Design-px font size. Default 96 is the standard display size
   * (21770:2960), but not every page uses it: Bonus Report's headings are
   * 84-tall single-line nodes, i.e. 84 / 1.08 = 77.8 px. Derive it from the
   * mock's text-node height rather than assuming 96.
   */
  size: { type: Number, default: 96 },
  /** Explicit box, design px, when the mock's box is not page-centred. */
  left: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  /** 'center' (default), 'left' pinned at `left`, 'right' with its right edge at `right`. */
  align: { type: String, default: 'center' },
  right: { type: Number, default: 0 },
  /** Mock line-height; 1.08 on most pages, 1.15 on Headline Win (21770:3317). */
  lineHeight: { type: Number, default: 1.08 },
  /**
   * ADR-0007 growth direction. Declared so a `v-bind` of a pageLayouts record
   * lands as a prop: an undeclared key falls through as a bare HTML attribute
   * and silently does nothing, which is exactly how JValue lost `width` and
   * JCurrency lost `align` (see the 2026-09-03 log entry).
   */
  grow: { type: String, default: 'down' },
})

const textLines = computed(() => (Array.isArray(props.text) ? props.text : [props.text]))

const slotStyle = computed(() => ({
  ...(props.grow === 'up' && props.bottom
    ? { top: 'auto', bottom: `calc(${BODY.h - props.bottom} * var(--u))` }
    : { top: `calc(${props.top} * var(--u))` }),
  '--heading-font': `calc(${props.size} * var(--u))`,
  '--heading-lh': props.lineHeight,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
  ...alignStyle(props),
}))
</script>
