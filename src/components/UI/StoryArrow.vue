<template>
  <!-- Desktop prev/next, ported from Thor's desktopControlButton. Hidden below
       the 768 px breakpoint, where TapZones handles navigation. -->
  <button
    class="story-arrow"
    :class="`story-arrow--${direction}`"
    type="button"
    :aria-label="direction === 'back' ? 'Previous' : 'Next'"
    @click="$emit('nav', direction === 'back' ? 'back' : 'forward')"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="m15.645 16.855-4.714-4.861 4.714-4.861a1.275 1.275 0 0 0 0-1.767 1.184 1.184 0 0 0-1.713 0l-5.577 5.75a1.275 1.275 0 0 0 0 1.767l5.577 5.75c.473.49 1.239.49 1.713 0 .461-.488.474-1.29 0-1.778Z"
      />
    </svg>
  </button>
</template>

<script setup>
defineProps({ direction: { type: String, default: 'back' } })
defineEmits(['nav'])
</script>
