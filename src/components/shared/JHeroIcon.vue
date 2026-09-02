<template>
  <!--
    A hero icon inside JHero. Takes the wrapper box, the intrinsic image box and
    a rotation, exactly as the mock nests them: an outer flex box that centres a
    rotated inner box.

    This nesting is why get_metadata cannot be trusted here — for a rotated
    child it reports a coordinate in the wrong frame. On Money Talks the
    metadata put the icon at x=548 inside a 919-wide frame (off the edge); the
    real value from get_design_context is left=-276 with a 48.92deg rotation.
  -->
  <div class="j-hero__slot" :style="slotStyle">
    <img :src="src" alt="" :style="imgStyle" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  /** Wrapper box, design px, relative to the hero frame. */
  left: { type: Number, required: true },
  top: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  /** Intrinsic image box, design px. Defaults to the wrapper. */
  imgWidth: { type: Number, default: 0 },
  imgHeight: { type: Number, default: 0 },
  rotate: { type: Number, default: 0 },
})

const d = n => `calc(${+n.toFixed(3)} * var(--u))`

const slotStyle = computed(() => ({
  left: d(props.left),
  top: d(props.top),
  width: d(props.width),
  height: d(props.height),
}))

const imgStyle = computed(() => ({
  width: d(props.imgWidth || props.width),
  height: d(props.imgHeight || props.height),
  transform: props.rotate ? `rotate(${props.rotate}deg)` : undefined,
}))
</script>
