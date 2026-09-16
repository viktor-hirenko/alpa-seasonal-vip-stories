<template>
  <div class="page__art j-hero" :style="[frameStyle, artStyle]">
    <JGlow
      :left="glowBox.left"
      :top="glowBox.top"
      :width="glowWidth"
      :height="glowHeight"
      :plus="glowPlus"
      :blend="glowBlend"
      :mask-x="glowMaskX"
      :mask-y="glowMaskY"
      :mask-width="glowMaskWidth"
      :mask-height="glowMaskHeight"
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
import { usePageArt } from './decode.js'
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
  /** The ellipse mask's own box inside the glow box — see JGlow, V-91. */
  glowMaskX: { type: Number, default: 0 },
  glowMaskY: { type: Number, default: 0 },
  glowMaskWidth: { type: Number, default: 0 },
  glowMaskHeight: { type: Number, default: 0 },
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

/**
 * ⚠️ OPACITY ONLY — NEVER A TRANSFORM. The mock rotates and offsets this art
 * through `artImg`/`artBox` inline styles, and a second transform written here
 * would replace theirs outright, not compose with it. That is ADR-0002's trap
 * in its CSS form. A fade under a rising glow is enough to read as the central
 * element arriving; see TIMING.reveal.art.
 */
const artIn = usePageArt()
const artStyle = computed(() => (artIn.value >= 1 ? null : { opacity: artIn.value }))
</script>
