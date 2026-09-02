<template>
  <!-- Money Talks. Figma set 21770:3184, EN variant 21770:3185.
       Slide frame 12, cut at 30.10 s. Dynamic: `total_wins` + currency. -->
  <PageChrome>
    <template #art>
      <img class="page__art mt__galaxy" :src="galaxy" alt="" />
      <img class="page__art mt__planets" :src="planets" alt="" />
      <JHero :left="261" :top="566">
        <img class="j-hero__icon mt__icon" :src="icon" alt="" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" :max-width="871" />
    <JDigitTiles :value="amount" :height="172" :top="1380.031" />
    <JCurrency :top="1593" :size="150">{{ currency }}</JCurrency>
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
import planets from '@/assets/pages/planets-4.webp'
import icon from '@/assets/pages/hero-money-talks.webp'

defineProps({
  amount: { type: [String, Number], default: '2222577' },
  currency: { type: String, default: 'USD' },
})

const copy = { chip: 'Money Talks', headline: 'Your total wins this season:' }
</script>
