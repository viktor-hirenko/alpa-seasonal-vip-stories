<template>
  <!--
    Shared shell for every data page. Figma 21770:2946.
    Spine strip, paper fore-edge, clipped body, bottom fade, specular sheen.
    Page-specific art goes in #art, content in the default slot.
  -->
  <div class="page">
    <div class="page__fore" />

    <div class="page__body">
      <slot name="art" />
      <div class="page__fade" />
      <img class="page__sheen" :src="sheen" alt="" />
      <slot />
    </div>

    <img class="page__spine" :src="spine" alt="" />
  </div>
</template>

<script setup>
import spine from '@/assets/pages/spine.svg'
import sheen from '@/assets/pages/page-sheen.svg'
</script>
