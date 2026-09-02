<template>
  <!--
    Hero art slot — the 919 x 919 `image` frame present on most data pages,
    with the shared glow behind the icon.

    The glow is a real asset (`lighting_1296x576`, 1195 x 600), not a CSS
    approximation: it is the same bitmap on every page and it carries the
    star-burst spikes a radial-gradient cannot.

    Do NOT use the frame's own Figma export for this: it composites the glow and
    the page background into an opaque rectangle (measured — the corner pixel
    comes back as #000A12 or solid magenta), which paints a visible box on the
    page.
  -->
  <div class="page__art j-hero" :style="frameStyle">
    <img class="j-hero__glow" :src="glow" alt="" :style="glowStyle" />
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import glow from '@/assets/pages/glow.webp'

const props = defineProps({
  left: { type: Number, required: true },
  top: { type: Number, required: true },
  width: { type: Number, default: 919 },
  height: { type: Number, default: 919 },
  /** Glow box, design px, relative to this frame. */
  glowLeft: { type: Number, default: -429 },
  glowTop: { type: Number, default: -112 },
  glowWidth: { type: Number, default: 1908.198 },
  glowHeight: { type: Number, default: 1143.676 },
})

const d = n => `calc(${n} * var(--u))`

const frameStyle = computed(() => ({
  left: d(props.left),
  top: d(props.top),
  width: d(props.width),
  height: d(props.height),
}))

const glowStyle = computed(() => ({
  left: d(props.glowLeft),
  top: d(props.glowTop),
  width: d(props.glowWidth),
  height: d(props.glowHeight),
}))
</script>
