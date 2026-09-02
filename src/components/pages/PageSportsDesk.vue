<template>
  <PageChrome>
    <template #art>
      <PageBackdrop />

      <JHero :left="261" :top="566">
        <!-- `Lvl 1` ray burst: 1076 sq, centred, plus-lighter, rotated 90deg -->
        <div class="j-hero__rays" :style="artBox(-78.5, -78.5, 1076, 1076)">
          <img :src="rays" alt="" :style="artImg(1076, 1076, 90)" />
        </div>

        <!-- Icon group `21770:3857` at (36.66, -41.39), 750.067 x 824.257.
             Children below are group-relative offsets folded into frame coords. -->

        <!-- Ball `Sport_icon_512x512`: inset -2.94% 17.23% 41.61% 21.44%
             of the group -> 160.82, -24.23, 460.0 x 505.5; rotate 6.12deg -->
        <JHeroIcon :src="ball" :left="197.48" :top="-65.62" :width="460" :height="505.5" :rotate="6.12" />

        <!-- Trophy `21770:3858`: group-relative (197, 219.23), 563.636 sq,
             inner image 512 sq rotated 6.12deg -->
        <JHeroIcon :src="trophy" :left="233.66" :top="177.84" :width="563.636" :height="563.636"
                   :img-width="512" :img-height="512" :rotate="6.12" />

        <!-- `coins 5`: inset 54.52% 78.62% 26.74% 6.09% of the group
             -> 45.68, 449.4, 114.7 x 154.4; rotate -17deg, mirrored -->
        <JHeroIcon :src="coins5" :left="82.34" :top="408.01" :width="114.7" :height="154.4"
                   :rotate="-17" mirror />

        <!-- `coins 1`: inset 43.53% -7.02% 28.34% 75.3% of the 919 frame
             -> 692.0, 400.0, 291.5 x 258.5; rotate -8.53deg -->
        <JHeroIcon :src="coins1" :left="692" :top="400.01" :width="291.5" :height="258.5" :rotate="-8.53" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" :max-width="956" />
    <JDigitTiles :value="amount" :height="200" :top="1371.031" />
    <JCurrency :top="1603.031" :size="200">{{ currency }}</JCurrency>
  </PageChrome>
</template>

<script setup>
/**
 * Sports Desk. Figma set 21770:3837, EN variant 21770:3838, hero 21770:3849.
 * Slide frame 17, cut at 53.27 s. Dynamic: `sports_wins` + currency.
 *
 * Hero geometry is from get_design_context, NOT metadata. Metadata put the
 * icon group at left=117.295 (real: 36.66) and reported the `Lvl 1` ray burst
 * at x=997, i.e. off the frame — it is actually dead-centre. Percentage insets
 * from the mock are resolved to design px in the comments below.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import trophy from '@/assets/pages/hero-sports-trophy.webp'
import ball from '@/assets/pages/hero-sports-ball.webp'
import coins1 from '@/assets/pages/coins-1.webp'
import coins5 from '@/assets/pages/coins-5.webp'
import rays from '@/assets/pages/rays.webp'

defineProps({
  amount: { type: [String, Number], default: '2572257' },
  currency: { type: String, default: 'USD' },
})

const copy = { chip: 'Sports Desk', headline: 'Your sports wins this season:' }
</script>
