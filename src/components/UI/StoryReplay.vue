<template>
  <button v-if="visible" type="button" class="story-replay" @click="$emit('click')">
    <img class="story-replay__icon" :src="replay" alt="" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup>
/**
 * "Watch again" — storyboard frame 27, node 21811:3980 inside 21770:4912.
 *
 * The mock draws it as an icon plus an underlined yellow label, both centred as
 * one row: the icon is 37 sq at x=407.25 and the label's centre is at
 * 50% + 24.25, which puts the row's own centre on the canvas centre. Those two
 * numbers are what the gap in `_ui.scss` is derived from, so the row reproduces
 * the mock's spacing without hard-coding either edge.
 */
import replay from '@/assets/ui/icon-replay.svg'

defineProps({
  visible: { type: Boolean, default: false },
  label: { type: String, required: true },
})
defineEmits(['click'])
</script>
