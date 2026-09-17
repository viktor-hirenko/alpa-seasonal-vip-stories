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
 * ⚠️ THE ENTRANCE IS A FUNCTION OF THE CLOCK, NOT A TRANSITION. The mock asks
 * for «Кнопка виїжджає знизу» (21770:2043), and the obvious way to get it — a
 * CSS transition on `v-if` — is wrong here for the reason ADR-0008 gives for
 * the page cut: this story is seeked constantly, and a transition fires on the
 * appearance rather than on the second. A tap landing at 85 s would play an
 * entrance that finished six seconds earlier; a tap backwards would leave the
 * button parked below the frame. The parent hands down `progress` — where the
 * clock stands inside TIMING.cta.rise — and this renders that number, which
 * draws the one correct frame for any seek.
 *
 * THREE CURVES, NOT ONE, and that is what keeps it from reading as a slide:
 *
 *  - the LIFT carries the small overshoot (EASE.ctaRise), so the button settles
 *    rather than stopping dead;
 *  - the FADE is finished by `FADE_BY` of the travel, so what floats up is a
 *    solid button and not a ghost of one arriving late;
 *  - the SCALE runs the whole way on a plain deceleration, 0.965 -> 1. It is
 *    deliberately too small to notice as a size change; what it does is make
 *    the rise read as coming towards the player rather than sliding up a pane.
 */
import { computed } from 'vue'
import { gsap } from 'gsap'
import { EASE } from '@/story/easing.js'
import JCta from '@/components/shared/JCta.vue'

const props = defineProps({
  /** 0 = nothing on screen, 1 = fully arrived. Clamped by the parent. */
  progress: { type: Number, default: 0 },
  label: { type: String, required: true },
})
defineEmits(['click'])

/** How far below its resting place the button starts, in its own heights. */
const RISE = 1.4
/** The fraction of the travel by which the button is fully opaque. */
const FADE_BY = 0.45
/** Where the scale starts. Small on purpose — see the note above. */
const SCALE_FROM = 0.965

// Read through gsap so the ease vocabulary stays the project's (easing.js).
const lift = gsap.parseEase(EASE.ctaRise)
const settle = gsap.parseEase(EASE.ctaSettle)

const style = computed(() => {
  const p = Math.min(1, Math.max(0, props.progress))
  const up = lift(p)
  const fade = settle(Math.min(1, p / FADE_BY))
  const grow = settle(p)
  return {
    '--cta-rise': `${(1 - up) * RISE * 100}%`,
    '--cta-fade': fade,
    '--cta-scale': SCALE_FROM + (1 - SCALE_FROM) * grow,
    // ⚠️ IT CANNOT BE PRESSED WHILE IT IS STILL FLYING. The button sits above
    // the tap zones (z-index 2, see _ui.scss) and this one opens the
    // operator's link, so a half-transparent thing sweeping through the middle
    // of the screen must not catch a tap meant for the next page.
    pointerEvents: p < 0.6 ? 'none' : 'auto',
  }
})
</script>
