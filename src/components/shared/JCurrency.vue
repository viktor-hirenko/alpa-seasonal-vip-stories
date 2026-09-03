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
import { alignStyle } from './slotAlign.js'

const props = defineProps({
  top: { type: Number, required: true },
  /** Design-px font size, measured off the mock's text node. */
  size: { type: Number, default: 150 },
  /**
   * Same placement contract as JHeading and JValue. Headline Win has always
   * passed `align="right" :right="1334.38"` (21770:3335 puts USD's right edge
   * on the same 1334.38 as the game name and the digit row), but without the
   * props they fell through as bare HTML attributes and the label rendered
   * page-centred instead — visible against the mock, node 21770:3302.
   */
  align: { type: String, default: 'center' },
  left: { type: Number, default: 0 },
  right: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
})

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  '--currency-font': `calc(${props.size} * var(--u))`,
  ...alignStyle(props),
}))
</script>
