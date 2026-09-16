<template>
  <div v-if="progress > 0" class="story-cta" :style="style">
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
 *
 * THE ENTRANCE IS A FUNCTION OF THE CLOCK, NOT A TRANSITION. The mock asks for
 * «Кнопка виїжджає знизу» (21770:2043), and the obvious way to get it — a CSS
 * transition on `v-if` — is wrong here for the same reason ADR-0008 gives for
 * the page cut: this story is seeked constantly (tap navigation, the desktop
 * arrows, "watch again", and the holes left by pages a link has no data for).
 * A transition fires on the appearance rather than on the second, so a tap that
 * lands past 78.52 would play a slide-in that has already finished, and a tap
 * backwards would leave the button parked below the frame.
 *
 * So the parent hands down `progress`, which is where the clock stands inside
 * TIMING.cta.rise, and this renders that number. Any seek to any second draws
 * the one correct frame.
 */
import { computed } from 'vue'
import { gsap } from 'gsap'
import JCta from '@/components/shared/JCta.vue'

const props = defineProps({
  /** 0 = not on screen, 1 = fully arrived. Clamped by the parent. */
  progress: { type: Number, default: 0 },
  label: { type: String, required: true },
})
defineEmits(['click'])

/** How far below its resting place the button starts, in its own heights. */
const RISE = 1.4

/** Read through gsap so the ease vocabulary stays the project's (easing.js). */
const ease = gsap.parseEase('power2.out')

const style = computed(() => {
  const e = ease(Math.min(1, Math.max(0, props.progress)))
  return {
    '--cta-rise': `${(1 - e) * RISE * 100}%`,
    '--cta-fade': e,
  }
})
</script>
