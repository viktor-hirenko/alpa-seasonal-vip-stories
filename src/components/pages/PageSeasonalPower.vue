<template>
  <!-- Seasonal Power. Figma set 21770:3030, EN variant 21770:3031.
       Slide frame 10, cut at 22.07 s. Dynamic value: the `points` param.
       The value is a plain gradient number here, not digit tiles. -->
  <PageChrome :bg="bg">
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
        :glow-x="0"
        :glow-top="61.89"
        :glow-width="1714.303"
        :glow-height="857.151"
        :glow-mask-x="201.617"
        :glow-mask-y="-21.566"
        :glow-mask-width="1439.453"
        :glow-mask-height="862.734"
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
         placed explicitly rather than auto-centred.
         382 is the SHORT-value ceiling, not the mock's 188: at the clip's own
         print, "120", the clip's number is x2.03 of ours (session S,
         `tile-fit.mjs --value`, three seconds, spread 2.4 %), and 188 is what
         the mock's nine-character "1 200 000" shrank to. useJournalFit puts
         that back. Anchored by its middle, the mock's own 1485 + 188 / 2,
         because a ceiling that grew downwards would leave the clip's line by
         91 px.
         THE BUDGET IS 933, NOT THE MOCK'S 1020, and the box is moved to keep
         its centre on 700: 933 is what OUR setting of the mock's own string
         needs at the mock's own 188, so the long value lands back on 188 to the
         pixel. The mock's 1020 frame is 8.5 % wider than that — our digits and
         its are not set identically — and using it as the budget grew the long
         value to 205.5, i.e. 9 % past the size the mock draws, on a page nobody
         complained about. Measured in the DOM, both ways, session S. -->
    <JValue :value="points" :center-y="1579" :size="382" :left="233.5" :width="933" v-bind="L.value" />
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
import bg from '@/assets/pages/bg-seasonal-power.webp'
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
