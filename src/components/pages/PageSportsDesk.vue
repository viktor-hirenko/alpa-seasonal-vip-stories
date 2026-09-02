<template>
  <!-- Sports Desk. Figma set 21770:3837, EN variant 21770:3838.
       Slide frame 17, cut at 53.27 s. Dynamic: `sports_wins` + currency.
       The hero is two icons — a trophy and a ball — plus a coin cluster. -->
  <PageChrome>
    <template #art>
      <PageBackdrop />
      <JHero :left="261" :top="566">
        <!-- `Group 2087327496` (117.295, -41.386) 750.067 x 824.257 holds the
             ball above the trophy; boxes are from metadata, rotations unknown
             without a get_design_context pass on this hero. -->
        <JHeroIcon :src="ball" :left="368.85" :top="-68.386" :width="563.636" :height="563.636" />
        <JHeroIcon :src="trophy" :left="368.85" :top="177.848" :width="563.636" :height="563.636" />
        <JHeroIcon :src="coins" :left="270.224" :top="459.614" :width="140.52" :height="172.247" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" :max-width="956" />
    <JDigitTiles :value="amount" :height="200" :top="1371.031" />
    <JCurrency :top="1603.031" :size="200">{{ currency }}</JCurrency>
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
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import trophy from '@/assets/pages/hero-sports-trophy.webp'
import ball from '@/assets/pages/hero-sports-ball.webp'
import coins from '@/assets/pages/coins.webp'

defineProps({
  amount: { type: [String, Number], default: '2572257' },
  currency: { type: String, default: 'USD' },
})

const copy = { chip: 'Sports Desk', headline: 'Your sports wins this season:' }
</script>
