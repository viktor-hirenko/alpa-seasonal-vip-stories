<template>
  <!-- Seasonal Power. Figma set 21770:3030, EN variant 21770:3031.
       Slide frame 10, cut at 22.07 s. Dynamic value: the `points` param.
       The value is a plain gradient number here, not digit tiles. -->
  <PageChrome>
    <template #art>
      <img class="page__art sp__galaxy" :src="galaxy" alt="" />
      <JHero :left="261" :top="566" :glow-left="-195.992" :glow-top="40.324"
             :glow-width="1439.454" :glow-height="862.735">
        <img class="j-hero__icon sp__icon" :src="icon" alt="" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" :max-width="917" />
    <!-- The mock's value box is centred on 700, not the body's 720.6, so it is
         placed explicitly rather than auto-centred. -->
    <JValue :value="points" :top="1485" :size="188" :left="190" :width="1020" />
  </PageChrome>
</template>

<script setup>
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JValue from '@/components/shared/JValue.vue'
import JHero from '@/components/shared/JHero.vue'
import galaxy from '@/assets/pages/planets-4.webp'
import icon from '@/assets/pages/hero-seasonal-power.webp'

defineProps({ points: { type: [String, Number], default: '1 200 000' } })

// The mock's heading is "COLLECTED SEASONAL POINTS" with the number below,
// while the EN translation reads "You collected [X] Seasonal Points during the
// season." FR/DE/IT are already shortened to just "Seasonal points collected".
// The mock wins: the number lives in its own slot. This is the documented
// placeholder-parity exception (see _context/31-pages.md).
const copy = { chip: 'Seasonal Power', headline: 'Collected Seasonal Points' }
</script>
