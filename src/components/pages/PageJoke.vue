<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-94, -551, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
      <img class="page__art joke__rocket" :src="rocket" alt="" />
    </template>

    <JHeading text="Hope you got the joke." :top="674.24" :size="90" />
    <p class="joke__subhead">
      <span>But the</span>
      <span>real gift is you.</span>
    </p>
  </PageChrome>
</template>

<script setup>
/**
 * Joke. Figma set 21770:4317, EN body 21770:4318 (its own component is
 * internally named "Joke3" — the third of three near-identical "Joke*"
 * labels across this deck; only this node-id is the actual Joke page per
 * 31-pages.md's timecode-checked table).
 * Slide frame 21, cut at 73.07 s. Static — no dynamic fields.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JHeading from '@/components/shared/JHeading.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import planets from '@/assets/pages/planets-4.webp'
import rocket from '@/assets/pages/rocket.webp'
</script>
