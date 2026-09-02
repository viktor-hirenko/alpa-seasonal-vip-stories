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
      <slot name="art" />

      <!-- Left-edge fade (21770:3190). NOT an image: a 1868x395 vertical
           gradient rotated 90deg, i.e. #000a12 at the spine fading out to the
           right, 395 wide at left:-19. -->
      <div class="page__spine-fade" />

      <!-- Specular sheen (21770:3191), mix-blend-mode: screen, inset slightly
           beyond its box. -->
      <img class="page__sheen" :src="sheen" alt="" />

      <slot />
    </div>

    <img class="page__spine" :src="spine" alt="" />
  </div>
</template>

<script setup>
import spine from '@/assets/pages/spine.svg'
import sheen from '@/assets/pages/page-sheen.svg'
import edge from '@/assets/pages/page-edge.svg'
</script>
