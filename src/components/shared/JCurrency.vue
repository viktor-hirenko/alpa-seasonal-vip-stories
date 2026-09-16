<template>
  <div class="j-slot" :style="slotStyle">
    <span class="j-currency" data-fit-role="currency">
      <JReveal v-if="slotText !== null" :text="slotText" />
      <slot v-else />
    </span>
  </div>
</template>

<script setup>
/**
 * Currency label. A SEPARATE node in every mock (e.g. 21770:3204,
 * 21770:3716, 21811:3479) — never inside the digit tiles, and its size
 * differs per page, so it takes an explicit font size in design px.
 */
import { computed, useSlots } from 'vue'
import JReveal from './JReveal.vue'
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

/**
 * The currency mark decodes with everything else. It used to be the one thing
 * left standing while the rest of the page was still arriving — the owner saw
 * «пустой журнал, на котором написано ЕВРО» and he was looking at exactly this.
 *
 * Reads the slot's text for the same reason JChip does: every page writes it
 * as a plain interpolation, and markup falls back to being rendered untouched.
 */
const slots = useSlots()
const slotText = computed(() => {
  const nodes = slots.default?.()
  if (!nodes || nodes.length !== 1) return null
  const c = nodes[0].children
  return typeof c === 'string' ? c : null
})
</script>
