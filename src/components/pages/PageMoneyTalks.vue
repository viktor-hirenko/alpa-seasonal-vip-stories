<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <PageBackdrop />
    </template>

    <template #art>
      <!-- The frame itself is turned 4deg since the redraw (21770:3196 renders
           as a 1004.66 square inside a `rotate-4` wrapper, printed as a
           1072.294 AABB at 183.81, 712.33). The square is centred on that
           AABB's middle, hence 217.627 / 746.147. Both lighting mask groups on
           this page are `hidden`, so the hero carries no glow. -->
      <JHero
        :left="217.627"
        :top="746.147"
        :width="1004.66"
        :height="1004.66"
        :rotate="4"
        :glow="false"
      >
        <JHeroIcon
          :src="icon"
          :left="-301.73"
          :top="-313.75"
          :width="1605.981"
          :height="1594.179"
          :img-width="1073.096"
          :img-height="1195.073"
          :rotate="48.92"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <!-- The mock breaks the headline explicitly over two lines. -->
    <JHeading :text="copy.headline" :top="332.54" :size="92" v-bind="L.headline" />
    <!-- ⚠️ THE ROW MOVED ABOVE THE ART IN THE 25.09 REDRAW (23186:3055), the
         same move as Sports Desk's. The old 298.8-tall row hung from 1552.031
         is still in the file as node 21770:3205, marked `hidden`.
         120.805 is the SHORT-value CEILING, not a constant: `slot` is the width
         the row may take before useJournalFit shrinks it, so a player with more
         digits than the mock's eight gets a smaller row instead of one that
         runs off the page. The mock draws this same 120.805 at eight digits
         here and at seven on Sports Desk, so the size is fixed in the design
         and the shrink is ours alone, for values the designer never drew. -->
    <JDigitTiles :value="amount" :height="120.805" :top="561.03" />
    <!-- USD 23186:3054: 82 px at leading 0.94, right edge on 807.8. -->
    <JCurrency :top="701.1" :size="82" align="right" :right="807.8">{{ currency }}</JCurrency>
  </PageChrome>
</template>

<script setup>
/**
 * Money Talks. Figma set 21770:3184, EN variant 21770:3185.
 * Slide frame 12, cut at 30.10 s. Dynamic: `total_wins` + currency.
 *
 * This is the CANONICAL data page — every number here comes from
 * get_design_context, not metadata, and the other pages repeat its skeleton.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { useStory } from '@/composables/useStoryData.js'
import icon from '@/assets/pages/hero-money-talks.webp'

const story = useStory()
const L = story.layout('money_talks')
const copy = story.t('pages.money_talks')
const amount = story.data.totalWins
const currency = story.data.currency
</script>
