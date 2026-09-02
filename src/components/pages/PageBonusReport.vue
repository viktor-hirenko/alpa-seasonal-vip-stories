<template>
  <!-- Bonus Report. Figma set 21770:3688, EN variant 21770:3689.
       Slide frame 16, cut at 49.10 s. Dynamic: `bonuses` + currency.

       Note the headings here are 84-tall single-line nodes, i.e. 77.8 px, not
       the 96 px used on most pages — and the copy brackets the number above
       and below it. -->
  <PageChrome>
    <template #art>
      <img class="page__art br__galaxy" :src="galaxy" alt="" />
      <JHero :left="262" :top="878" :height="815"
             :glow-left="-321" :glow-top="-116"
             :glow-width="1748.565" :glow-height="1048">
        <img class="j-hero__icon br__icon" :src="icon" alt="" />
        <img class="j-hero__icon br__coins" :src="coins" alt="" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="373" :size="77.8" :max-width="543" />
    <JDigitTiles :value="amount" :height="200" :top="560" />
    <JCurrency :top="791.5" :size="174">{{ currency }}</JCurrency>
    <JHeading :text="copy.footer" :top="1693" :size="77.8" :max-width="1054" />
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
import icon from '@/assets/pages/hero-bonus-report.webp'
import coins from '@/assets/pages/coins.webp'

defineProps({
  amount: { type: [String, Number], default: '2572257' },
  currency: { type: String, default: 'USD' },
})

const copy = {
  chip: 'Bonus Report',
  headline: 'You claimed',
  footer: 'in bonuses this season.',
}
</script>
