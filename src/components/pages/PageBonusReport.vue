<template>
  <PageChrome :spine-fade-to="'rgba(0, 10, 18, 0.8)'" :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <!-- 25.09: galaxy out, starburst in (23126:3211, the masked `b` exposure
           at the canonical box). `planets 4` stayed exactly where it was. -->
      <PageBackdrop :left="-1016.73" :planets-left="769.1" />
    </template>

    <template #art>
      <!-- Hero is page-centred (left: 50%), 919 x 815, and the redraw lifted it
           from 878 to 712. The `Lvl 2` ray burst and the lighting mask group
           are both gone from the node, so no rays and no glow. -->
      <JHero :left="262" :top="712" :height="815" :glow="false">
        <!-- Percentage insets of the 919 x 815 hero frame, resolved to design px. -->
        <!-- `Live_HERO 6` gift: inset 0 4.73% -5.37% 1.82% -> 16.73, 0,
             858.8 x 858.77; image hypot(86.1684cqw, 13.8316cqh) = 749.5 sq.
             It grew from 770 / 671.99 and rose to the frame's top edge. -->
        <JHeroIcon
          :src="gift"
          :left="16.73"
          :top="0"
          :width="858.8"
          :height="858.77"
          :img-width="749.5"
          :img-height="749.5"
          :rotate="9.12"
        />
        <!-- `coins 4`: inset 50.16% 81.75% 25.63% -0.16% -> -1.47, 408.8,
             169.19 x 197.31; image hypot(-61.4263cqw, 22.4834cqh) x
             hypot(38.5737cqw, 77.5166cqh) = 113.0 x 166.28 -->
        <JHeroIcon
          :src="coins4"
          :left="-1.47"
          :top="408.8"
          :width="169.19"
          :height="197.31"
          :img-width="113"
          :img-height="166.28"
          :rotate="-23.11"
          mirror
        />
        <!-- `coins 1`: inset 62.29% 0.74% 2.33% 63.88% -> 587.06, 507.66,
             325.14 x 288.35; image hypot(88.6874cqw, -14.9984cqh) x
             hypot(11.3126cqw, 85.0016cqh) = 291.58 x 247.85 -->
        <JHeroIcon
          :src="coins1"
          :left="587.06"
          :top="507.66"
          :width="325.14"
          :height="288.35"
          :img-width="291.58"
          :img-height="247.85"
          :rotate="-8.53"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="333" :size="82" v-bind="L.headline" />
    <!-- ⚠️ 25.09: the row shrank to the deck's small tile and rose to 561.03,
         the same 120.805 Sports Desk and Money Talks now carry (23186:3173).
         It is the SHORT-value ceiling: `slot` still decides when a longer
         value is shrunk, so nothing about the adaptive behaviour changes —
         only the size the mock draws. -->
    <JDigitTiles :value="amount" :height="120.805" :top="561.03" />
    <JCurrency :top="701.1" :size="82" align="right" :right="808.14">{{ currency }}</JCurrency>
    <JHeading :text="copy.footer" :top="1594.53" :size="78" v-bind="L.footer" />
  </PageChrome>
</template>

<script setup>
/**
 * Bonus Report. Figma set 21770:3688, EN body 21770:3691, hero 21770:3700.
 * Slide frame 16, cut at 49.10 s. Dynamic: `bonuses` + currency.
 *
 * Everything here is from get_design_context. Two things this page does
 * differently from the canonical Money Talks skeleton:
 *   - its own starburst offset and its own `planets 4` x, both a pixel off
 *     PageBackdrop's defaults, so it passes them;
 *   - the left-edge fade ends at rgba(0,10,18,0.8), not full opacity;
 *   - headings are 78 px, not the standard 96.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import gift from '@/assets/pages/hero-bonus-report.webp'
import coins1 from '@/assets/pages/coins-1.webp'
import coins4 from '@/assets/pages/coins-4.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('bonus_report')
const copy = story.t('pages.bonus_report')
const amount = story.data.bonuses
const currency = story.data.currency
</script>
