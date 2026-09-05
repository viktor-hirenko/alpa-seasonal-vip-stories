<template>
  <div v-if="visible" class="story-cta">
    <JCta @click="$emit('click')">{{ label }}</JCta>
  </div>
</template>

<script setup>
/**
 * "Continue Journey" on the SCENE, not on a page. Storyboard frames 22-25;
 * placement from the mock's own frame 24 (21770:4885), where the button sits at
 * top 81.99% of the 1080x1920 canvas, 834.672 wide, centred.
 *
 * It lives here rather than inside a page component because that is where the
 * mock puts it (open question 6 in 31-pages.md): `.stage__ui` is outside the
 * `preserve-3d` chain, so the button neither inherits the journal's camera nor
 * tilts with it.
 */
import JCta from '@/components/shared/JCta.vue'

defineProps({
  visible: { type: Boolean, default: false },
  label: { type: String, required: true },
})
defineEmits(['click'])
</script>
