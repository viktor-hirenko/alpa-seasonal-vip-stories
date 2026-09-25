<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <!-- 25.09: the swirl decal this page carried is gone; 23124:3038 draws
           the shared starburst in Headline Win's box — 2837.738 x 1589.992 at
           747.62 — with the same fade. -->
      <PageBackdrop
        :planets="false"
        :left="-697.74"
        :top="747.62"
        :width="2837.738"
        :height="1589.992"
      />
      <div class="page__art art-box" :style="artBox(-104, -155, 531.996, 668.325)">
        <JArt :src="rocket" alt="" :style="artImg(515.674, 655.564, -1.44, 'scaleY(-1)')" />
      </div>
    </template>

    <template #art>
      <!-- No lighting mask group left on this node, so no glow. `coins 3`
           (23124:3041) is NEW here — the same spray Headline Win has, at
           1272.617 x 892.455 from (103.97, 801.03), behind the card. -->
      <JArt class="page__art mm__coins" :src="coins" alt="" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading
      :text="copy.headline"
      :top="330.03"
      :size="82"
      :line-height="1.15"
      v-bind="L.headline"
    />
    <!-- ⚠️ 25.09: the row is the deck's small tile now, 120.805, and it grows
         about its centre at 623.71 (21811:3563 is `top: calc(50% - 310.29px)`
         of the 1868 body, pulled up by half its height). 120.805 is the
         SHORT-value ceiling; `slot` still shrinks a longer value. -->
    <JDigitTiles :value="multiplier" :height="120.805" :center-y="623.71" />
    <!-- The name moved UNDER the card: 1667.97, where it was 787. -->
    <JValue :value="gameName" :top="1667.97" :size="96" v-bind="L.game" />
    <JGameThumb :src="gameImage" :name="gameName" :top="831.03" :width="551" :height="740" />
  </PageChrome>
</template>

<script setup>
/**
 * Multiplier Moment. Figma set 21770:3438, EN body 21770:3439.
 * Slide frame 14, cut at 39.07 s.
 * Dynamic: `top_multiplier` + game name (+ thumbnail).
 *
 * Structurally Headline Win's twin, and since the 25.09 redraw the two are
 * laid out identically bar the currency line this page does not have: same
 * starburst box, same card, same coin spray, same name under the card. The
 * rocket is still flipped and placed top-left rather than top-right.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JValue from '@/components/shared/JValue.vue'
import JGameThumb from '@/components/shared/JGameThumb.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
import rocket from '@/assets/pages/rocket.webp'
import coins from '@/assets/pages/coins-3.webp'

const story = useStory()
const L = story.layout('multiplier_moment')
const copy = story.t('pages.multiplier_moment')
const multiplier = story.data.topMultiplier
const gameName = story.data.topMultiplierGame
const gameImage = story.data.topMultiplierGameImage
</script>
