<template>
  <PageChrome :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #art>
      <!-- galaxy 3: 2354.516 x 1763.832 at (-425.18, 398), image
           2130.188 x 1383.964 rotated 10.96deg -->
      <div class="page__art art-box" :style="artBox(-425.18, 398, 2354.516, 1763.832)">
        <img :src="galaxy" alt="" :style="artImg(2130.188, 1383.964, 10.96)" />
      </div>
      <!-- planets 4: 1246.411 x 1044.739 at (769.1, -548), image
           1068.061 x 662.593, mirrored vertically then rotated 155.59deg -->
      <div class="page__art art-box" :style="artBox(769.1, -548, 1246.411, 1044.739)">
        <img :src="planets" alt="" :style="artImg(1068.061, 662.593, 155.59, 'scaleY(-1)')" />
      </div>

      <!-- Hero is page-centred (left: 50%), 919 x 815 at y=878. -->
      <JHero
        :left="262"
        :top="878"
        :height="815"
        :glow-x="93.78"
        :glow-top="-116"
        :glow-width="1748.564"
        :glow-height="1048"
      >
        <!-- `Lvl 2` ray burst — byte-identical to Sports Desk's `Lvl 1`.
             1076 sq, centred at y + 51.5, plus-lighter, rotated 90deg. -->
        <div class="j-hero__rays" :style="artBox(-78.5, -27, 1076, 1076)">
          <img :src="rays" alt="" :style="artImg(1076, 1076, 90)" />
        </div>

        <!-- Percentage insets of the 919 x 815 hero frame, resolved to design px. -->
        <!-- `Live_HERO 6` gift: inset 5.52% 6.92% 0 9.29% -> 85.4, 45.0, 770 sq -->
        <JHeroIcon :src="gift" :left="85.4" :top="45" :width="770" :height="770" :rotate="9.12" />
        <!-- `coins 4`: inset 50.5% 75.98% 27.79% 7.51% -> 69.0, 411.6, 151.7 x 176.9 -->
        <JHeroIcon
          :src="coins4"
          :left="69"
          :top="411.6"
          :width="151.7"
          :height="176.9"
          :rotate="-23.11"
          mirror
        />
        <!-- `coins 1`: inset 61.38% 3.34% 6.9% 64.94% -> 596.8, 500.2, 291.5 x 258.5 -->
        <JHeroIcon
          :src="coins1"
          :left="596.8"
          :top="500.2"
          :width="291.5"
          :height="258.5"
          :rotate="-8.53"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="373" :size="78" v-bind="L.headline" />
    <!-- The clip's row is as wide as ours at 320 (V-61), but growing upwards
         from the edge above the currency (560 + 200) that would run into the
         heading — in the clip the two touch. 283 keeps 20 px of air under the
         heading. The mock's 200 is what seven digits shrink to. -->
    <JDigitTiles :value="amount" :height="283" :bottom="760" />
    <JCurrency :top="791.5" :size="200">{{ currency }}</JCurrency>
    <JHeading :text="copy.footer" :top="1693" :size="78" v-bind="L.footer" />
  </PageChrome>
</template>

<script setup>
/**
 * Bonus Report. Figma set 21770:3688, EN body 21770:3691, hero 21770:3700.
 * Slide frame 16, cut at 49.10 s. Dynamic: `bonuses` + currency.
 *
 * Everything here is from get_design_context. Two things this page does
 * differently from the canonical Money Talks skeleton:
 *   - its own galaxy/planets placement (planets is mirrored vertically and
 *     rotated 155.59deg), so PageBackdrop does not apply;
 *   - the left-edge fade ends at rgba(0,10,18,0.8), not full opacity;
 *   - headings are 78 px, not the standard 96.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import galaxy from '@/assets/pages/galaxy-3.webp'
import planets from '@/assets/pages/planets-4.webp'
import gift from '@/assets/pages/hero-bonus-report.webp'
import coins1 from '@/assets/pages/coins-1.webp'
import coins4 from '@/assets/pages/coins-4.webp'
import rays from '@/assets/pages/rays.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('bonus_report')
const copy = story.t('pages.bonus_report')
const amount = story.data.bonuses
const currency = story.data.currency
</script>
