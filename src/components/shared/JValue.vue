<template>
  <div class="j-slot" :style="slotStyle" :data-fit-lines="lines || null">
    <span class="j-value" data-fit-role="value">{{ value }}</span>
  </div>
</template>

<script setup>
/**
 * A big gradient number without tiles — Seasonal Power's "1 200 000"
 * (21770:3046, 1020 x 188 at y=1485). Same accent gradient as the tiles.
 */
import { computed } from 'vue'
import { alignStyle } from './slotAlign.js'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  top: { type: Number, required: true },
  /** Design-px font size from the mock. */
  size: { type: Number, default: 188 },
  maxWidth: { type: Number, default: 0 },
  /** 'center' (default), 'left' pinned at `left`, 'right' with its right edge at `right`. */
  align: { type: String, default: 'center' },
  left: { type: Number, default: 0 },
  right: { type: Number, default: 0 },
  /**
   * Explicit box width in design px, as JHeading already takes. Two pages were
   * passing it and getting nothing: without the prop it fell through as a bare
   * `width` attribute on the div, so Seasonal Power's value sat centred on the
   * page axis instead of on the mock's 700, and Headline Win's game name had no
   * budget to be fitted against. It is also what makes a fixed-width box
   * shrink-to-fit rather than grow (31-pages.md: 1020 / 1230 / 848).
   */
  width: { type: Number, default: 0 },
  /** Vertical budget in line boxes (`data-fit-lines`); see JHeading. These
   *  slots are `white-space: nowrap`, so it is a tripwire rather than a rule. */
  lines: { type: Number, default: 0 },
  /** Declared so a pageLayouts `v-bind` cannot fall through as an attribute. */
  grow: { type: String, default: 'down' },
})

const slotStyle = computed(() => ({
  top: `calc(${props.top} * var(--u))`,
  '--value-font': `calc(${props.size} * var(--u))`,
  ...(props.maxWidth ? { maxWidth: `calc(${props.maxWidth} * var(--u))` } : {}),
  ...alignStyle(props),
}))
</script>
