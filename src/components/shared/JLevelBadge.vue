<template>
  <!--
    VIP level badge. Figma 21770:3120 inside the hero frame 21770:3115.

    The badge sits in a 919 sq box centred on the hero frame, with the artwork
    inset at 12.12% / 14.27% and sized to 71.84% of the box — i.e. 660.4 sq at
    (111.4, 131.1). The inset shadow is part of the mock.

    The artwork itself comes from src/story/levelConfig.js, keyed by the `level`
    query param, so this primitive never hardcodes a level.
  -->
  <div class="j-level" :style="boxStyle">
    <div class="j-level__clip">
      <img :src="src" alt="" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  /** Box size in design px; the mock uses the full 919 hero frame. */
  size: { type: Number, default: 919 },
})

const boxStyle = computed(() => ({
  width: `calc(${props.size} * var(--u))`,
  height: `calc(${props.size} * var(--u))`,
  left: `calc(${-props.size / 2} * var(--u) + 50%)`,
  top: `calc(${-props.size / 2} * var(--u) + 50%)`,
}))
</script>
