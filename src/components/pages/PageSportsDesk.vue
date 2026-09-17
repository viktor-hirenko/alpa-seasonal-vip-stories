<template>
  <PageChrome>
    <template #art>
      <PageBackdrop />

      <JHero :left="261" :top="566">
        <!-- `Lvl 1` ray burst: 1076 sq, centred, plus-lighter, rotated 90deg -->
        <div class="j-hero__rays" :style="artBox(-78.5, -78.5, 1076, 1076)">
          <JArt :src="rays" alt="" :style="artImg(1076, 1076, 90)" />
        </div>

        <!-- Icon group `21770:3857`. ⚠️ ITS OWN BOX IS A DECOY, AND THIS PAGE
             FELL FOR IT (V-85). The mock prints the group as
             `absolute contents h-[824.257px] left-[36.66px] w-[750.067px]`, but
             `display: contents` throws the box away: the children below are
             positioned by the HERO's 919 square, not by the group, and their
             `inset` per cents are per cents OF THE HERO. Reading them against
             750.067 x 824.257 and then adding the group's offset put the ball
             38 px high and 100 px small and the cup 37 px right — the "cup is
             bigger" the owner saw on his phone. `coins 1` below sits outside
             the group and was right all along; it is the control that proves
             the frame. Every child here is now hero-relative. -->

        <!-- Ball `Sport_icon_512x512`: inset -2.94% 17.23% 41.61% 21.44%
             of the 919 frame -> 197.03, -27.02, 563.623 sq; image 512 sq
             (hypot(90.3217cqw, 9.67832cqh) = 512.0); rotate 6.12deg -->
        <JHeroIcon
          :src="ball"
          :left="197.034"
          :top="-27.019"
          :width="563.623"
          :height="563.623"
          :img-width="512"
          :img-height="512"
          :rotate="6.12"
        />

        <!-- Trophy `21770:3858`: (197, 219.23) in the 919 frame, 563.636 sq,
             inner image 512 sq rotated 6.12deg -->
        <JHeroIcon
          :src="trophy"
          :left="197"
          :top="219.23"
          :width="563.636"
          :height="563.636"
          :img-width="512"
          :img-height="512"
          :rotate="6.12"
        />

        <!-- `coins 5`: inset 54.52% 78.62% 26.74% 6.09% of the 919 frame
             -> 55.97, 501.04, 140.515 x 172.221; image
             hypot(-68.9782cqw, 17.1996cqh) x hypot(31.0218cqw, 82.8004cqh)
             = 101.35 x 149.11; rotate -17deg, mirrored -->
        <JHeroIcon
          :src="coins5"
          :left="55.967"
          :top="501.039"
          :width="140.515"
          :height="172.221"
          :img-width="101.35"
          :img-height="149.11"
          :rotate="-17"
          mirror
        />

        <!-- `coins 1`: inset 43.53% -7.02% 28.34% 75.3% of the 919 frame
             -> 692.0, 400.0, 291.5 x 258.5; rotate -8.53deg -->
        <JHeroIcon
          :src="coins1"
          :left="692"
          :top="400.01"
          :width="291.5"
          :height="258.5"
          :img-width="261.41"
          :img-height="222.19"
          :rotate="-8.53"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" v-bind="L.headline" />
    <!-- 292.6 tall at three digits: the height at which our row is as wide as
         the clip's (V-61, tile-fit) — 284 at the mock's tile proportions,
         x1.0303 since session S drew the tile the clip's way (JDigitTiles' R).
         The mock's 200 is what seven digits shrink to. Grows upwards from the
         edge above the currency label, 1371.031 + 200. -->
    <JDigitTiles :value="amount" :height="292.6" :bottom="1571.031" />
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
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('sports_desk')
const copy = story.t('pages.sports_desk')
const amount = story.data.sportsWins
const currency = story.data.currency
</script>
