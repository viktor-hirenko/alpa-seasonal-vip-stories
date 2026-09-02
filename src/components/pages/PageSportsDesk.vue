<template>
  <!-- Sports Desk. Figma set 21770:3837, EN variant 21770:3838.
       Slide frame 17, cut at 53.27 s. Dynamic: `sports_wins` + currency.
       The hero is two icons — a trophy and a ball — plus a coin cluster. -->
  <PageChrome>
    <template #art>
      <img class="page__art sd__galaxy" :src="galaxy" alt="" />
      <img class="page__art sd__planets" :src="planets" alt="" />
      <JHero :left="261" :top="566">
        <img class="j-hero__icon sd__ball" :src="ball" alt="" />
        <img class="j-hero__icon sd__trophy" :src="trophy" alt="" />
        <img class="j-hero__icon sd__coins" :src="coins" alt="" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" :max-width="956" />
    <JDigitTiles :value="amount" :height="200" :top="1371.031" />
    <JCurrency :top="1603.031" :size="174">{{ currency }}</JCurrency>
  </PageChrome>
</template>

<script setup>
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JHero from '@/components/shared/JHero.vue'
import galaxy from '@/assets/pages/planets-4.webp'
import planets from '@/assets/pages/rocket.webp'
import trophy from '@/assets/pages/hero-sports-trophy.webp'
import ball from '@/assets/pages/hero-sports-ball.webp'
import coins from '@/assets/pages/coins.webp'

defineProps({
  amount: { type: [String, Number], default: '2572257' },
  currency: { type: String, default: 'USD' },
})

const copy = { chip: 'Sports Desk', headline: 'Your sports wins this season:' }
</script>
