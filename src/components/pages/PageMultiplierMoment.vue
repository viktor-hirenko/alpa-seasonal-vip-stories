<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-519, 414, 2483.337, 1968.191)">
        <img :src="bg" alt="" :style="artImg(2181.992, 1454.661, -165.05)" />
      </div>
      <div class="page__art art-box" :style="artBox(-104, -155, 531.996, 668.325)">
        <img :src="rocket" alt="" :style="artImg(515.674, 655.564, -1.44, 'scaleY(-1)')" />
      </div>
    </template>

    <template #art>
      <JGlow :left="-435.2" :top="790.59" :width="2272.4" :height="1136.2" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading
      :text="copy.headline"
      :top="325.32"
      :size="82"
      :line-height="1.15"
      v-bind="L.headline"
    />
    <JDigitTiles :value="multiplier" :height="120.805" :top="558.598" />
    <div class="mm__divider" />
    <JValue :value="gameName" :top="787" :size="96" v-bind="L.game" />
    <JGameThumb :src="gameImage" :name="gameName" :top="946" />
  </PageChrome>
</template>

<script setup>
/**
 * Multiplier Moment. Figma set 21770:3438, EN body 21770:3439.
 * Slide frame 14, cut at 39.07 s.
 * Dynamic: `top_multiplier` + game name (+ thumbnail).
 *
 * Structurally Headline Win's twin (same chip/divider/thumbnail skeleton,
 * same magenta tint and spine-fade override) but centred throughout instead
 * of pinned left/right, no currency node, and its own backdrop art: a swirl
 * decal in place of the galaxy/planets backdrop, plus the rocket flipped and
 * placed top-left rather than top-right.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JValue from '@/components/shared/JValue.vue'
import JGlow from '@/components/shared/JGlow.vue'
import JGameThumb from '@/components/shared/JGameThumb.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
import bg from '@/assets/pages/bg-multiplier-moment.webp'
import rocket from '@/assets/pages/rocket.webp'
import placeholder from '@/assets/pages/game-thumb-placeholder.webp'

const story = useStory()
const L = story.layout('multiplier_moment')
const copy = story.t('pages.multiplier_moment')
const multiplier = story.data.topMultiplier
const gameName = story.data.topMultiplierGame
const gameImage = story.data.topMultiplierGameImage || placeholder
</script>
