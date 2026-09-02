<template>
  <!-- Two invisible half-width tap zones, exactly Thor's mobileControlArea:
       a tap jumps a page, a press longer than 250 ms pauses (handled upstream).
       Hidden on desktop, where the arrows take over. -->
  <div
    class="tap-zone tap-zone--back"
    @mousedown="$emit('press', 'back', $event)"
    @mouseup="$emit('release', 'back', $event)"
    @touchstart="$emit('press', 'back', $event)"
    @touchend="$emit('release', 'back', $event)"
  />
  <div
    class="tap-zone tap-zone--forward"
    @mousedown="$emit('press', 'forward', $event)"
    @mouseup="$emit('release', 'forward', $event)"
    @touchstart="$emit('press', 'forward', $event)"
    @touchend="$emit('release', 'forward', $event)"
  />
</template>

<script setup>
defineEmits(['press', 'release'])
</script>
