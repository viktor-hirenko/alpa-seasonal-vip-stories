<template>
  <div class="j-glow j-glow--hard" :style="boxStyle" />
  <div v-if="plus" class="j-glow j-glow--plus" :style="boxStyle" />
</template>

<script setup>
/**
 * The shared light bloom: the `lighting_1296x576` bitmap under the mock's own
 * ellipse mask, stacked with `hard-light` and `plus-lighter`.
 *
 * Extracted from JHero because not every glow lives inside a hero frame —
 * Player's Pick (21770:3579) puts it straight on the page body, sized as a
 * percentage of the body rather than of a 919 frame.
 *
 * Never use a Figma frame export for this: it composites the page background
 * into an opaque rectangle.
 */
import { computed } from 'vue'

const props = defineProps({
  left: { type: Number, required: true },
  top: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  /** Most glows stack two copies; a few pages use only the hard-light one. */
  plus: { type: Boolean, default: true },
})

const d = n => `calc(${+n.toFixed(3)} * var(--u))`

const boxStyle = computed(() => ({
  left: d(props.left),
  top: d(props.top),
  width: d(props.width),
  height: d(props.height),
}))
</script>
