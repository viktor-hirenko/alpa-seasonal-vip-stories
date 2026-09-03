<template>
  <PageChrome>
    <template #art>
      <PageBackdrop />

      <JHero :left="261" :top="566">
        <JHeroIcon
          :src="icon"
          :left="-276"
          :top="-287"
          :width="1469.05"
          :height="1458.255"
          :img-width="981.6"
          :img-height="1093.178"
          :rotate="48.92"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <!-- The mock breaks the headline explicitly over two lines. -->
    <JHeading :text="copy.headline" :top="389" v-bind="L.headline" />
    <JDigitTiles :value="amount" :height="172" :top="1380.031" />
    <JCurrency :top="1593" :size="160">{{ currency }}</JCurrency>
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
