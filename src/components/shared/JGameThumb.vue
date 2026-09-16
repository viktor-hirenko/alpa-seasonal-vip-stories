<template>
  <div class="j-thumb" :style="[boxStyle, artStyle]">
    <img v-if="src && !failed" :src="src" alt="" :style="imgStyle" @error="failed = true" />
    <div v-else class="j-thumb__fallback">
      <span>{{ name }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * Game thumbnail. Figma 21770:3591 (Player's Pick) — the same component appears
 * on Headline Win and Multiplier Moment.
 *
 * Box 635 x 843, background #000a12, a 28.503 border in the accent colour,
 * radius 50.898, `overflow: clip`, and the mock's double pink glow
 * (0 21px 81.2px rgba(255,0,212,.56) plus 0 15px 22.3px rgba(255,0,212,.27)).
 * The artwork inside is 645 x 903 — the native 400x560 aspect scaled to cover
 * the box, centred and clipped.
 *
 * The image URL arrives at runtime from the `*_thunbnail` query params, and the
 * marketing doc warns the domain may be blocked for a given player. So a load
 * failure MUST degrade to a name-only card rather than showing a broken image.
 */
import { usePageArt } from './decode.js'
import { computed, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  /** Shown when there is no image, or the image fails to load. */
  name: { type: String, default: '' },
  left: { type: Number, default: 0 },
  top: { type: Number, required: true },
  width: { type: Number, default: 635 },
  height: { type: Number, default: 843 },
  imgWidth: { type: Number, default: 645 },
  imgHeight: { type: Number, default: 903 },
})

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const d = n => `calc(${+n.toFixed(3)} * var(--u))`

/**
 * The mock's 28.503 stroke sits OUTSIDE the 635 x 843 node box (V-85), so the
 * card the player sees is 692 x 900 and the artwork still fills 635 x 843. Our
 * `border` plus the global `box-sizing: border-box` eats the stroke inwards
 * instead, which made the card a whole stroke narrower and shorter than the
 * mock's on all three pages that use it. Grow the border box by the stroke and
 * pull the origin back by it; every call site keeps the mock's own numbers.
 */
const STROKE = 28.503

const boxStyle = computed(() => ({
  width: d(props.width + STROKE * 2),
  height: d(props.height + STROKE * 2),
  top: d(props.top - STROKE),
  ...(props.left
    ? { left: d(props.left - STROKE) }
    : { left: '50%', marginLeft: d(-props.width / 2 - STROKE) }),
}))

const imgStyle = computed(() => ({
  width: d(props.imgWidth),
  height: d(props.imgHeight),
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
