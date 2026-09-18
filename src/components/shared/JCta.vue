<template>
  <button type="button" class="j-cta" @click="$emit('click')">
    <slot>Continue Journey</slot>
  </button>
</template>

<script setup>
/**
 * Scene CTA button. Figma "Button" set 21770:4455, Default variant 21770:4456.
 *
 * NOT a page element — the mock places this in `.stage__ui`, floating over
 * the journal, only on storyboard frames 22-25 (gift + final). No page
 * component renders it; whoever wires the scene's button-visible window
 * (open question 6 in 31-pages.md) mounts this directly on the stage.
 * Built now because the pixel spec exists — only the wiring is deferred, not
 * the component.
 */
defineEmits(['click'])
</script>
