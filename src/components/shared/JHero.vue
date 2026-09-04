<template>
  <div class="page__art j-hero" :style="frameStyle">
    <JGlow
      :left="glowBox.left"
      :top="glowBox.top"
      :width="glowWidth"
      :height="glowHeight"
      :plus="glowPlus"
      :blend="glowBlend"
    />
    <slot />
  </div>
</template>

<script setup>
/**
 * Hero art slot — the 919 x 919 `image` frame on most data pages.
 * Geometry from get_design_context on 21770:3196.
 *
 * The glow is the `lighting_1296x576` bitmap under an ELLIPSE MASK
 * (glow-mask.svg = a radial-gradient ellipse 1908.2 x 1143.68), stacked twice
 * with `hard-light` and `plus-lighter`. That double blend is what gives it the
 * hot core and the coloured spill; a single plain copy reads as a flat blob.
 *
 * Simplified against the mock: the mock nests the bitmap inside the mask box
 * with per-cent insets and a separate mask-position. Here the mask box and the
 * bitmap box are the same element, which is visually equivalent and far less
 * fragile.
 *
 * Never use the frame's own Figma export as art — it composites the page
 * background and the glow into an opaque rectangle.
 */
import { computed } from 'vue'
import JGlow from './JGlow.vue'

const props = defineProps({
  left: { type: Number, required: true },
  top: { type: Number, required: true },
  width: { type: Number, default: 919 },
  height: { type: Number, default: 919 },
  /** Glow box centre offset from the frame centre, design px (mock: +65.6). */
  glowX: { type: Number, default: 65.6 },
  glowTop: { type: Number, default: -112 },
  glowWidth: { type: Number, default: 1908.199 },
  glowHeight: { type: Number, default: 1143.676 },
  /** Most pages stack two glow copies; VIP Status has only the hard-light one. */
  glowPlus: { type: Boolean, default: true },
  /** Blend of the first glow copy — see JGlow. Seasonal Power uses 'dodge'. */
  glowBlend: { type: String, default: 'hard' },
})

const d = n => `calc(${+n.toFixed(3)} * var(--u))`

const frameStyle = computed(() => ({
  left: d(props.left),
  top: d(props.top),
  width: d(props.width),
  height: d(props.height),
}))

const glowBox = computed(() => ({
  left: props.width / 2 + props.glowX - props.glowWidth / 2,
  top: props.glowTop,
}))
</script>
