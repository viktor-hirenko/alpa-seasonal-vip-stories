<template>
  <!--
    Display heading. Figma 21770:2960 / 2961.

    Accepts a string or an array of lines. Arrays render one <span> per line so
    a future GSAP entrance can stagger them, and so a translator's line breaks
    survive without a hardcoded <br> (translations ship multi-line values as
    arrays — see _context/31-pages.md).
  -->
  <div class="j-slot" :style="slotStyle">
    <h2 class="j-heading" data-fit-role="display">
      <span v-for="(line, i) in lines" :key="i" class="j-heading__line">{{ line }}</span>
    </h2>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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
})

const lines = computed(() => (Array.isArray(props.text) ? props.text : [props.text]))

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  '--heading-font': `calc(${props.size} * var(--u))`,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
  ...(props.width
    ? {
        insetInline: 'auto',
        left: `calc(${props.left} * var(--u))`,
        width: `calc(${props.width} * var(--u))`,
        marginInline: '0',
      }
    : {}),
}))
</script>
