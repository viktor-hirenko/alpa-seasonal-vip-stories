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
})

const lines = computed(() => (Array.isArray(props.text) ? props.text : [props.text]))

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
}))
</script>
