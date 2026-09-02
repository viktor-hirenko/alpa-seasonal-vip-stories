<template>
  <div class="j-slot" :style="slotStyle">
    <h2 class="j-heading" data-fit-role="display">
      <span v-for="(line, i) in lines" :key="i" class="j-heading__line">{{ line }}</span>
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

const props = defineProps({
  text: { type: [String, Array], default: '' },
  /** Design-px offset from the page body's top edge. */
  top: { type: Number, required: true },
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
})

const lines = computed(() => (Array.isArray(props.text) ? props.text : [props.text]))

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  '--heading-font': `calc(${props.size} * var(--u))`,
  '--heading-lh': props.lineHeight,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
  ...alignStyle(props),
}))
</script>
