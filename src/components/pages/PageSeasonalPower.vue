<template>
  <!-- Seasonal Power. Figma set 21770:3030, EN variant 21770:3031.
       Slide frame 10, cut at 22.07 s. Dynamic value: the `points` param.
       The value is a plain gradient number here, not digit tiles. -->
  <PageChrome>
    <template #art>
      <PageBackdrop :planets="false" />
      <!-- The glow is this hero's OWN mask group (21770:3037), not the shared
           Money Talks default: ONE copy rather than two, blended color-dodge
           rather than hard-light + plus-lighter, and a box a quarter smaller
           sitting 150 px lower. All three differ at once, which is why the page
           read as too dark while the numbers were borrowed from a neighbour.
           JGlow takes the MASK GROUP box, as on every other page. -->
      <JHero
        :left="261"
        :top="566"
        glow-blend="dodge"
        :glow-plus="false"
        :glow-x="64.235"
        :glow-top="40.324"
        :glow-width="1439.454"
        :glow-height="862.735"
      >
        <!-- get_design_context on 21770:3036: a 1135.351 box centring the 919
             artwork at 15.88deg. The 143.234 that used to stand here was
             get_metadata's x for the ROTATED node — trap 1 in 91-handover.md,
             and 143.234 - 919*sin(15.88deg) = -108.17 is the same number seen
             from the AABB. -->
        <JHeroIcon
          :src="icon"
          :left="-108.17"
          :top="-125"
          :width="1135.351"
          :height="1135.351"
          :img-width="919"
          :img-height="919"
          :rotate="15.88"
        />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" v-bind="L.headline" />
    <!-- The mock's value box is centred on 700, not the body's 720.6, so it is
         placed explicitly rather than auto-centred. -->
    <JValue :value="points" :top="1485" :size="188" :left="190" :width="1020" v-bind="L.value" />
  </PageChrome>
</template>

<script setup>
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JValue from '@/components/shared/JValue.vue'
import JHero from '@/components/shared/JHero.vue'
import JHeroIcon from '@/components/shared/JHeroIcon.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { useStory } from '@/composables/useStoryData.js'
import icon from '@/assets/pages/hero-seasonal-power.webp'

const story = useStory()
const L = story.layout('seasonal_power')
// The mock's heading is "COLLECTED SEASONAL POINTS" with the number below,
// while the EN translation reads "You collected [X] Seasonal Points during the
// season." FR/DE/IT are already shortened to just "Seasonal points collected",
// which is what the mock shows in all four variants. The mock wins: the number
// lives in its own slot, and the copy files carry the shortened form.
const copy = story.t('pages.seasonal_power')
/** The one number in the deck the mock GROUPS — "1 200 000" (21770:3046). */
const points = story.data.points
</script>
