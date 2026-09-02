<template>
  <div class="steps" role="progressbar" :aria-valuenow="Math.round(overall)" aria-valuemin="0" aria-valuemax="100">
    <div v-for="(p, i) in fills" :key="i" class="steps__track">
      <div class="steps__fill" :style="{ width: p * 100 + '%' }" />
    </div>
  </div>
</template>

<script setup>
/**
 * Segmented steps bar. Figma `Parts / steps` inside header 21770:2682:
 * 976 px wide, 10 px tall, 10 px gap, radius 100, white track, #fdd835 fill.
 *
 * One div per segment with its own fill width, rather than Thor's single
 * progress rect behind an SVG alpha mask. Thor needed the mask because it drew
 * one continuous bar across N rounded windows; Alpa's design is genuinely
 * per-step (the mock shows a filled step 1 and an empty step 7), and per-step
 * divs express that directly.
 */
import { computed } from 'vue'

const props = defineProps({
  /** Video clock, seconds. */
  time: { type: Number, default: 0 },
  /** Segment descriptors from STORY_SEGMENTS. */
  segments: { type: Array, required: true },
})

/** 0..1 per segment: filled behind the playhead, partial on it, empty ahead. */
const fills = computed(() =>
  props.segments.map(s => {
    if (props.time >= s.end) return 1
    if (props.time <= s.start) return 0
    return Math.min(1, Math.max(0, (props.time - s.start) / s.dur))
  }),
)

const overall = computed(() =>
  props.segments.length ? (fills.value.reduce((a, b) => a + b, 0) / props.segments.length) * 100 : 0,
)
</script>
