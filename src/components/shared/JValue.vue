<template>
  <!--
    A big gradient number without tiles — Seasonal Power's "1 200 000"
    (21770:3046, 1020 x 188 at y=1485). Same accent gradient as the tiles.
  -->
  <div class="j-slot" :style="slotStyle">
    <span class="j-value" data-fit-role="value">{{ value }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  top: { type: Number, required: true },
  /** Design-px font size from the mock. */
  size: { type: Number, default: 188 },
  maxWidth: { type: Number, default: 0 },
})

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  '--value-font': `calc(${props.size} * var(--u))`,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
}))
</script>
