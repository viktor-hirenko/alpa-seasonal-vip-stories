<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <PageBackdrop :planets="false" />
      <img class="page__art page__starfield" :src="starfield" alt="" />
    </template>

    <template #art>
      <JHero :left="261" :top="566">
        <!-- `Lvl 1` ray burst: 1076 sq dead-centre, rotated 90deg -->
        <div class="j-hero__rays" :style="artBox(-78.5, -78.5, 1076, 1076)">
          <img :src="rays" alt="" :style="artImg(1076, 1076, 90)" />
        </div>

        <!-- `Bonus_Comboboost`: 698.334 sq wrapper at (140, 51); inner box
             579.414 sq rotated 13.46deg with the image offset (-20.42, 4.89) -->
        <div class="j-hero__slot" :style="artBox(140, 51, 698.334, 698.334)">
          <div class="combo" :style="artImg(579.414, 579.414, 13.46)">
            <img :src="combo" alt="" />
          </div>
        </div>

        <!-- `coins 5`: inset 48.42% 80.48% 33.95% 6.31% -> 58.0, 445.0, 121.4 x 162.0 -->
        <JHeroIcon :src="coins5" :left="58" :top="445" :width="121.4" :height="162"
                   :rotate="8.13" mirror />
        <!-- `coins 1`: inset 45.05% -17.9% 26.81% 86.18% -> 792.0, 414.0, 291.5 x 258.6 -->
        <JHeroIcon :src="coins1" :left="792" :top="414.01" :width="291.5" :height="258.6"
                   :rotate="-8.53" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" />
    <JDigitTiles :value="multiplier" :height="286" :top="1258" />
  </PageChrome>
</template>

<script setup>
/**
 * Top Sport Signal. Figma set 21770:3986, EN variant 21770:3987.
 * Slide frame 18, cut at 57.07 s. Dynamic: `sports_multiplier`.
 *
 * Combines the canonical galaxy backdrop with the starfield and magenta wash
 * that VIP Status also uses, and introduces a FIFTH tile height (286).
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import starfield from '@/assets/pages/starfield.webp'
import rays from '@/assets/pages/rays.webp'
import combo from '@/assets/pages/hero-comboboost.webp'
import coins1 from '@/assets/pages/coins-1.webp'
import coins5 from '@/assets/pages/coins-5.webp'

defineProps({ multiplier: { type: [String, Number], default: '257' } })

const copy = { chip: 'Top Sport Signal', headline: ['Your highest', 'sports multiplier:'] }
</script>
