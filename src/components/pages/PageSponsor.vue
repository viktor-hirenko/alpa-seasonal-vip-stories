<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-637, -136, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
          <JGlow :left="-435.2" :top="1070.59" :width="2272.4" :height="1136.2" />
    </template>

    <template #art>
      <div class="sp__mascot" :style="{ '--cow': `url(${cow})` }">
        <img :src="cow" alt="" />
        <!-- 21770:4151's inner shadow — see the `inner-glow` mixin. -->
        <div class="sp__inner" />
      </div>
      <!-- 21770:4152, and it sits AFTER the cow in the mock's own order: the
           mascot box runs 547 px past the bottom of the body, so without this
           the page edge cut her off with a hard horizontal (V-12). -->
      <div class="page__fade" />
    </template>

    <JHeading :text="copy.headline" :top="119" :size="96" v-bind="L.headline" />
    <p class="sp__subhead" data-fit-role="display" :data-fit-lines="L.subhead.lines">
      <span v-for="(line, i) in copy.subhead" :key="i">{{ line }}</span>
    </p>
  </PageChrome>
</template>

<script setup>
/**
 * Sponsor. Figma set 21770:4139, EN body 21770:4140 (its own Figma component
 * is internally named "Joke" — a stale label from duplication; trust the
 * node-id mapping in 31-pages.md, which is cross-referenced against the
 * timecode table, not the component's own name).
 * Slide frame 19, cut at 61.10 s. Static — no dynamic fields.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JGlow from '@/components/shared/JGlow.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
import planets from '@/assets/pages/planets-4.webp'
import cow from '@/assets/pages/sponsor-cow.webp'

const story = useStory()
const L = story.layout('sponsor')
// The mock's Italian headline is three lines tall (312) while the subhead below
// stays on 379 in all four variants — i.e. the mock collides with itself there.
// The copy is authored as two lines, which is the room that actually exists.
const copy = story.t('pages.sponsor')
</script>
