<template>
  <div class="page">
    <!-- Right paper-stack edge (21770:3186) -->
    <img class="page__edge" :src="edge" alt="" />

    <div class="page__body">
      <!-- The body's OWN background image, below everything (V-91). Several
           pages fill the body frame with a picture on top of the #000a12 — on
           Seasonal Power it is the magenta-to-dark ramp that lights the whole
           left half, and without it the top of the page is black where the mock
           is pink. The owner saw exactly that and said so. A page without one
           simply omits `bg`. -->
      <!-- ⚠️ THE ONE HEAVY FILE PER PAGE, AND THEREFORE GATED. The edge, sheen
           and spine below are three shared files the very first page needs, so
           they stay eager; `bg` is a different 116-232 KB picture for every one
           of the seventeen and none of them is wanted before the story runs.
           See JArt.vue. -->
      <JArt v-if="bg" class="page__bg" :src="bg" />

      <!-- Backdrop art: sits BELOW the colour wash, so the wash tints it. -->
      <slot name="backdrop" />

      <!-- Colour wash (21770:3108) — order is load-bearing, see the doc above. -->
      <div v-if="tint" class="page__tint" :style="{ background: tint }" />

      <!-- Foreground art: heroes, icons — above the wash, untinted. -->
      <slot name="art" />

      <!-- Left-edge fade (21770:3190). NOT an image: a 1868x395 vertical
           gradient rotated 90deg, i.e. #000a12 at the spine fading out to the
           right, 395 wide at left:-19. -->
      <div
        class="page__spine-fade"
        :style="{
          '--spine-fade-to': spineFadeTo,
          ...(spineFadeWidth ? { '--spine-fade-width': `calc(${spineFadeWidth} * var(--u))` } : {}),
          ...(spineFadeStop ? { '--spine-fade-stop': `${spineFadeStop}%` } : {}),
        }"
      />

      <!-- Specular sheen (21770:3191), mix-blend-mode: screen, inset slightly
           beyond its box. -->
      <img class="page__sheen" :src="sheen" alt="" />

      <slot />
    </div>

    <img class="page__spine" :src="spine" alt="" />
  </div>
</template>

<script setup>
/**
 * Shared shell for every data page. Values from get_design_context on
 * Money Talks (21770:3185), which is the canonical skeleton — every data page
 * repeats it.
 *
 * The right paper-stack edge is an SVG in the mock, not the CSS gradient the
 * metadata suggested.
 *
 * The colour wash's position in the stack is load-bearing: in the mock it sits
 * directly after the background image and BEFORE the hero, so it tints only
 * the backdrop. Putting it above everything turned VIP Status' silver badge
 * pink. Hence two art slots: #backdrop (tinted) and #art (untinted).
 */
defineProps({
  /**
   * End colour of the left-edge fade (21770:3190). Most pages fade to the page
   * colour; Bonus Report stops at rgba(0,10,18,0.8).
   */
  spineFadeTo: { type: String, default: '#000a12' },
  /** Width and transparent stop of that fade — per page, see the SCSS note. */
  spineFadeWidth: { type: Number, default: 0 },
  spineFadeStop: { type: Number, default: 0 },
  /** Colour wash laid over the background with mix-blend-mode: color. */
  tint: { type: String, default: '' },
  /** The body frame's own background image, if the page has one — see above. */
  bg: { type: String, default: '' },
})

import spine from '@/assets/pages/spine.svg'
import sheen from '@/assets/pages/page-sheen.svg'
import edge from '@/assets/pages/page-edge.svg'
</script>
