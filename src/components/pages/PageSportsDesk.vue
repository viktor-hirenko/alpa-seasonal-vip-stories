<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <PageBackdrop />
    </template>

    <template #art>
      <!-- ⚠️ NO GLOW AND NO RAY BURST SINCE 25.09. The `Lvl 1` burst that used
           to fill this frame is gone from the node, and both lighting mask
           groups on the body are `hidden`. Ours drew concentric rings around
           the trophy that the mock has nowhere. -->
      <JHero :left="219.4" :top="827.72" :glow="false">
        <!-- Icon group 21770:3857 is still `display: contents`, so every child
             below is positioned against the HERO's 919 square, not the group.
             See the V-85 note in 36-visual-diff.md. -->

        <!-- Trophy 21770:3858: a 759.572 box centring the 689.986 artwork at
             6.12deg. It grew with the redraw — 563.636 / 512 before. -->
        <JHeroIcon
          :src="trophy"
          :left="114.81"
          :top="121.21"
          :width="759.572"
          :height="759.572"
          :img-width="689.986"
          :img-height="689.986"
          :rotate="6.12"
        />

        <!-- Ball 21770:3860: inset -2.94% 32.57% 41.61% 6.09% of the 919 frame
             -> 55.97, -27.02, 563.6 sq; image hypot(90.3217cqw, 9.67832cqh)
             = 512. Same size as before, moved left from 197.03. -->
        <JHeroIcon
          :src="ball"
          :left="55.967"
          :top="-27.019"
          :width="563.6"
          :height="563.6"
          :img-width="512"
          :img-height="512"
          :rotate="6.12"
        />

        <!-- `coins 5`: inset 44.48% 83.43% 18.17% -13.89% -> -127.65, 408.77,
             279.93 x 343.25; image hypot(-68.9782cqw, 17.1996cqh) x
             hypot(31.0218cqw, 82.8004cqh) = 201.91 x 297.18. Twice the size it
             was, and now hanging off the frame's left edge. -->
        <JHeroIcon
          :src="coins5"
          :left="-127.65"
          :top="408.77"
          :width="279.93"
          :height="343.25"
          :img-width="201.91"
          :img-height="297.18"
          :rotate="-17"
          mirror
        />

        <!-- `coins 1`: inset 23.36% -32.16% 28% 81.78% -> 751.56, 214.68,
             462.99 x 447.0; image hypot(64.6176cqw, -43.0992cqh) x
             hypot(35.3824cqw, 56.9008cqh) = 355.83 x 302.55; turned -32.78deg
             where it used to be -8.53. -->
        <JHeroIcon
          :src="coins1"
          :left="751.56"
          :top="214.68"
          :width="462.99"
          :height="447"
          :img-width="355.83"
          :img-height="302.55"
          :rotate="-32.78"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="333.41" :size="82" v-bind="L.headline" />
    <!-- ⚠️ THE ROW MOVED ABOVE THE ART IN THE 25.09 REDRAW (23186:3261). The
         old big row — 292.6 tall, hung from 1571.031 under the currency — is
         still in the file as node 21811:3914, marked `hidden`; the designer
         replaced it with a 120.805 row at the top, directly under the heading,
         and dropped the art to 827.72.
         120.805 IS A CEILING, NOT A CONSTANT, and that is the part this page
         must not lose: `height` is the tile height at a SHORT value and `slot`
         is the width the row may take before useJournalFit shrinks it, so a
         player with more digits than the mock's seven gets a smaller row rather
         than one that runs off the page. The mock draws the same 120.805 at
         seven digits here and at eight on Money Talks, so the size is fixed in
         the design and the shrink is ours alone, for values the designer never
         drew. -->
    <JDigitTiles :value="amount" :height="120.805" :top="561.03" />
    <!-- USD 23186:3260: 82 px at leading 0.94, right edge on 807.73 (the mock
         writes it as -translate-x-full from 50% + 86.23). -->
    <JCurrency :top="701.1" :size="82" align="right" :right="807.73">{{ currency }}</JCurrency>
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
 * from the mock are resolved to design px in the comments above.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import trophy from '@/assets/pages/hero-sports-trophy.webp'
import ball from '@/assets/pages/hero-sports-ball.webp'
import coins1 from '@/assets/pages/coins-1.webp'
import coins5 from '@/assets/pages/coins-5.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('sports_desk')
const copy = story.t('pages.sports_desk')
const amount = story.data.sportsWins
const currency = story.data.currency
</script>
