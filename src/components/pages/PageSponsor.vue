<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <!-- 25.09: `planets 4` left the node; 23126:3605 draws the starburst at
           4096 x 2295, top -144, the `c` exposure, plain node so no fade. -->
      <PageBackdrop
        tone="c"
        :planets="false"
        :left="-1328.31"
        :top="-144"
        :width="4096"
        :height="2295"
        :fade-end="0"
      />
      <!-- ⚠️ 25.09: the wash shrank to Gift's and Space Milk's — 23126:3608 is
           `left-[-9.84%] right-[-9.74%]` of the 1443 body at aspect 1200/600 ->
           1725.55 x 862.78 at (-142.0, 607.9), one plus-lighter copy where it
           was a 2272.4 x 1136.2 hard-light pair at 1070.59. -->
      <JGlow
        :left="-142"
        :top="607.9"
        :width="1725.55"
        :height="862.78"
        blend="plus"
        :plus="false"
        :mask-x="202.957"
        :mask-y="-21.711"
        :mask-width="1449.047"
        :mask-height="868.484"
      />
    </template>

    <template #art>
      <div class="sp__mascot" :style="{ '--cow': artIsOpen ? `url(${cow})` : 'none' }">
        <JArt :src="cow" alt="" />
        <!-- 21770:4151's inner shadow — see the `inner-glow` mixin. -->
        <div class="sp__inner" />
      </div>
      <!-- 21770:4152, and it sits AFTER the cow in the mock's own order: the
           mascot box runs 547 px past the bottom of the body, so without this
           the page edge cut her off with a hard horizontal (V-12). -->
      <div class="page__fade" />
    </template>

    <!-- 25.09: 82 px, not 96 (21770:4155). -->
    <JHeading :text="copy.headline" :top="119" :size="82" v-bind="L.headline" />
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
import { artIsOpen } from '@/composables/useArtGate.js'
import JHeading from '@/components/shared/JHeading.vue'
import JGlow from '@/components/shared/JGlow.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { useStory } from '@/composables/useStoryData.js'
import cow from '@/assets/pages/sponsor-cow.webp'

const story = useStory()
const L = story.layout('sponsor')
// The mock's Italian headline is three lines tall (312) while the subhead below
// stays on 379 in all four variants — i.e. the mock collides with itself there.
// The copy is authored as two lines, which is the room that actually exists.
const copy = story.t('pages.sponsor')
</script>
