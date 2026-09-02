<template>
  <!--
    Shared shell for every data page. Values from get_design_context on
    Money Talks (21770:3185), which is the canonical skeleton — every data page
    repeats it.
  -->
  <div class="page">
    <!-- Right paper-stack edge (21770:3186). An SVG in the mock, not a CSS
         gradient as the metadata suggested. -->
    <img class="page__edge" :src="edge" alt="" />

    <div class="page__body">
      <!-- Backdrop art: sits BELOW the colour wash, so the wash tints it. -->
      <slot name="backdrop" />

      <!--
        Colour wash (21770:3108). Some pages lay a magenta layer with
        mix-blend-mode: color over their background; it is what makes them read
        magenta instead of dark navy.

        Its position in the stack is load-bearing: in the mock it sits directly
        after the background image and BEFORE the hero, so it tints only the
        backdrop. Putting it above everything turned VIP Status' silver badge
        pink.
      -->
      <div v-if="tint" class="page__tint" :style="{ background: tint }" />

      <!-- Foreground art: heroes, icons — above the wash, untinted. -->
      <slot name="art" />

      <!-- Left-edge fade (21770:3190). NOT an image: a 1868x395 vertical
           gradient rotated 90deg, i.e. #000a12 at the spine fading out to the
           right, 395 wide at left:-19. -->
      <div class="page__spine-fade" :style="{ '--spine-fade-to': spineFadeTo }" />

      <!-- Specular sheen (21770:3191), mix-blend-mode: screen, inset slightly
           beyond its box. -->
      <img class="page__sheen" :src="sheen" alt="" />

      <slot />
    </div>

    <img class="page__spine" :src="spine" alt="" />
  </div>
</template>

<script setup>
defineProps({
  /**
   * End colour of the left-edge fade (21770:3190). Most pages fade to the page
   * colour; Bonus Report stops at rgba(0,10,18,0.8).
   */
  spineFadeTo: { type: String, default: '#000a12' },
  /** Colour wash laid over the background with mix-blend-mode: color. */
  tint: { type: String, default: '' },
})

import spine from '@/assets/pages/spine.svg'
import sheen from '@/assets/pages/page-sheen.svg'
import edge from '@/assets/pages/page-edge.svg'
</script>
