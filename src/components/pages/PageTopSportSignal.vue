<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <!-- 25.09: the 4096 x 2295 node at top -144 kept its box and changed its
           PICTURE — 21770:3991's starfield is now 23126:3527's near-black
           starburst. The galaxy behind it is gone, and so is the fade: this one
           is a plain node, not a Mask group. -->
      <PageBackdrop
        tone="c"
        :planets="false"
        :left="-1327.9"
        :top="-144"
        :width="4096"
        :height="2295"
        :fade-end="0"
      />
    </template>

    <template #art>
      <!-- ⚠️ THE FRAME GREW AND ROSE: 1276.398 sq at (94.97, 429.78) where it
           was 919 at (261, 566). The `Lvl 1` ray burst and `coins 1` are both
           gone from the node, and there is no lighting mask group left, so no
           glow either. -->
      <JHero :left="94.97" :top="429.78" :width="1276.398" :height="1276.398" :glow="false">
        <!-- `Bonus_Comboboost` 21770:4012: a 1129.118 box at (147.28, 0)
             centring an 864.405 square turned 22.47deg, with the image itself
             offset (-30.47, 7.29) inside it. -->
        <div class="j-hero__slot" :style="artBox(147.28, 0, 1129.118, 1129.118)">
          <div class="combo" :style="artImg(864.405, 864.405, 22.47)">
            <JArt :src="combo" alt="" />
          </div>
        </div>

        <!-- `coins 5`: inset 48.42% 80.48% 33.95% 6.31% of the 1276.398 frame
             -> 80.54, 618.03, 168.61 x 225.03; image
             hypot(-82.6305cqw, -8.84985cqh) x hypot(-17.3695cqw, 91.1501cqh)
             = 140.74 x 207.2 -->
        <JHeroIcon
          :src="coins5"
          :left="80.54"
          :top="618.03"
          :width="168.61"
          :height="225.03"
          :img-width="140.74"
          :img-height="207.2"
          :rotate="8.13"
          mirror
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="333.41" :size="82" v-bind="L.headline" />
    <!-- The mock already shows a three-digit value here, so 286 WAS the
         short-value height and the clip agreed to within the measurement
         (V-61). Session S drew the tile to the clip's proportions instead of the
         mock's, and holding the same ROW WIDTH through that costs x1.0303
         (JDigitTiles' R): 294.7. The row is still the mock's width; only the
         box around the digits is the clip's.
         ⚠️ 25.09: the row kept its 286 and DROPPED from 1258 to 1454.68. -->
    <JDigitTiles :value="multiplier" :height="294.7" :top="1454.68" />
  </PageChrome>
</template>

<script setup>
/**
 * Top Sport Signal. Figma set 21770:3986, EN variant 21770:3987.
 * Slide frame 18, cut at 57.07 s. Dynamic: `sports_multiplier`.
 *
 * Since the 25.09 redraw the backdrop is the shared starburst alone — the
 * galaxy, the ray burst and `coins 1` all left the node — over the magenta
 * wash VIP Status also uses. Keeps the FIFTH tile height (286).
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import JArt from '@/components/shared/JArt.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import combo from '@/assets/pages/hero-comboboost.webp'
import coins5 from '@/assets/pages/coins-5.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('top_sport_signal')
const copy = story.t('pages.top_sport_signal')
const multiplier = story.data.sportsMultiplier
</script>
