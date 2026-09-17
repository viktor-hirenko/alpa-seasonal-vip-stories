<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-519, 414, 2483.337, 1968.191)">
        <JArt :src="bg" alt="" :style="artImg(2181.992, 1454.661, -165.05)" />
      </div>
      <div class="page__art art-box" :style="artBox(-104, -155, 531.996, 668.325)">
        <JArt :src="rocket" alt="" :style="artImg(515.674, 655.564, -1.44, 'scaleY(-1)')" />
      </div>
    </template>

    <template #art>
      <!-- ⚠️ THE GLOW BELONGS ABOVE THE COLOUR WASH ON THIS PAGE: the mock
           puts the wash (21770:3306 / 21770:3441) BEFORE the two mask groups.
           Only pages whose mock stacks them the other way round — Space Milk,
           Sponsor — put it in #backdrop (V-91). Check per page, never by
           analogy with a neighbour. -->
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
    <!-- 167.9 tall at three digits: Headline Win's twin (both 120.805 in the
         mock), and this page's own clip reading — 165 by row width, in a layout
         the clip draws differently, heading left and tiles beside it (V-61).
         163 at the mock's tile proportions, x1.0303 since session S drew the
         tile the clip's way (JDigitTiles' R). The mock's 120.8 is what five
         digits shrink to in the 577.82 slot (21811:3563). Grows about its
         centre, 558.598 + 120.805 / 2. -->
    <JDigitTiles :value="multiplier" :height="167.9" :center-y="619" :slot="577.82" />
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

const story = useStory()
const L = story.layout('multiplier_moment')
const copy = story.t('pages.multiplier_moment')
const multiplier = story.data.topMultiplier
const gameName = story.data.topMultiplierGame
const gameImage = story.data.topMultiplierGameImage
</script>
