<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-94, -551, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
      <img class="page__art joke__rocket" :src="rocket" alt="" />
    </template>

    <!-- The only slot in the deck that grows UPWARDS: FR and IT take a second
         line and the top edge moves 674.24 -> 576.87 while the bottom stays on
         771.2. So it is anchored by its bottom, not its top (ADR-0007). -->
    <JHeading :text="copy.headline" :size="90" v-bind="L.headline" />
    <p class="joke__subhead" data-fit-role="display" :data-fit-lines="L.subhead.lines">
      <span v-for="(line, i) in copy.subhead" :key="i">{{ line }}</span>
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
import { useStory } from '@/composables/useStoryData.js'
import planets from '@/assets/pages/planets-4.webp'
import rocket from '@/assets/pages/rocket.webp'

const story = useStory()
const L = story.layout('joke')
const copy = story.t('pages.joke')
</script>
