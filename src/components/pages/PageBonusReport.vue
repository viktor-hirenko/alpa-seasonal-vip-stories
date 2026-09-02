<template>
  <!-- Bonus Report. Figma set 21770:3688, EN variant 21770:3689.
       Slide frame 16, cut at 49.10 s. Dynamic: `bonuses` + currency.

       Note the headings here are 84-tall single-line nodes, i.e. 77.8 px, not
       the 96 px used on most pages — and the copy brackets the number above
       and below it. -->
  <PageChrome>
    <template #art>
      <!-- NOTE: this page's galaxy/planets metadata differs from the canonical
           Money Talks skeleton, so PageBackdrop's values do NOT apply here.
           Needs its own get_design_context pass — see _context/31-pages.md. -->
      <JHero :left="262" :top="878" :height="815"
             :glow-width="1748.565" :glow-height="1048" :glow-x="0" :glow-top="-116">
        <JHeroIcon :src="icon" :left="260.889" :top="90" :width="770" :height="770" />
        <JHeroIcon :src="coins" :left="231.217" :top="456.551" :width="151.759" :height="176.949" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="373" :size="77.8" :max-width="543" />
    <JDigitTiles :value="amount" :height="200" :top="560" />
    <JCurrency :top="791.5" :size="200">{{ currency }}</JCurrency>
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
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
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
