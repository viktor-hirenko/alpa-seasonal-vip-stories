<template>
  <div class="j-slot" :style="slotStyle">
    <span class="j-currency" data-fit-role="currency"><slot /></span>
  </div>
</template>

<script setup>
/**
 * Currency label. A SEPARATE node in every mock (e.g. 21770:3204,
 * 21770:3716, 21811:3479) — never inside the digit tiles, and its size
 * differs per page, so it takes an explicit font size in design px.
 */
import { computed } from 'vue'

const props = defineProps({
  top: { type: Number, required: true },
  /** Design-px font size, measured off the mock's text node. */
  size: { type: Number, default: 150 },
})

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  '--currency-font': `calc(${props.size} * var(--u))`,
}))
</script>
