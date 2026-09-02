<template>
  <div class="j-thumb" :style="boxStyle">
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
watch(() => props.src, () => (failed.value = false))

const d = n => `calc(${+n.toFixed(3)} * var(--u))`

const boxStyle = computed(() => ({
  width: d(props.width),
  height: d(props.height),
  top: d(props.top),
  ...(props.left
    ? { left: d(props.left) }
    : { left: '50%', marginLeft: d(-props.width / 2) }),
}))

const imgStyle = computed(() => ({
  width: d(props.imgWidth),
  height: d(props.imgHeight),
}))
</script>
