<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-804, -116, 3049.644, 2284.992)">
        <img :src="galaxy" alt="" :style="artImg(2759, 1793, 10.96)" />
      </div>
      <div class="page__art art-box" :style="artBox(-542.59, 1026, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
    </template>

    <template #art>
      <!-- Layer order is the mock's own (21945:3030 "image"): the two lighting
           washes, the radial bloom, then the helmet with its ring on top. -->
      <JGlow :left="-635.2" :top="530.16" :width="2665.6" :height="1332.8" />
      <img class="gift__bloom" :src="bloom" alt="" />
      <div class="page__art art-box" :style="artBox(31.79, 469.13, 1321.579, 1321.579)">
        <img :src="helmet" alt="" :style="artImg(1051.288, 1051.288, -17.74)" />
      </div>
      <div class="page__art art-box" :style="artBox(81.95, 589.21, 777.896, 1079.753)">
        <img class="gift__ring" :src="ring" alt="" :style="artImg(664.492, 1008.987, 6.71)" />
      </div>
    </template>

    <!-- Fixed 1162-wide box at (140, 183.21) in all four variants, 420 tall in
         EN/DE and 525 in FR/IT — four lines against five, growing down. -->
    <p class="gift__headline" data-fit-role="display" :data-fit-lines="L.headline.lines">
      <span v-for="(line, i) in copy.headline" :key="i">{{ line }}</span>
    </p>
  </PageChrome>
</template>

<script setup>
/**
 * Gift. Figma set 21770:4366, EN body 21770:4367.
 * Slide frame 22, cut at 78.07 s. Dynamic: `promocode`, `bonus_label`,
 * `final_link` — none of which have a page slot (see JPromoCode.vue and
 * 31-pages.md open question 6). The mock's "Icon_Promocode" frame
 * (21945:3038) holds two layers, `Icon_Promocode` and `roket 1`, and BOTH
 * are `hidden` — so the designer sketched something there and switched it
 * off. Nothing renders in that slot in any variant, and this page therefore
 * draws only what the mock actually shows: headline + floating helmet.
 *
 * ⚠️ Coordinates here are page-body-relative, NOT relative to the "Helm"
 * group. "Helm" (21945:3041) compiles to `display: contents`, so its own
 * offset (-503.23, -512.39) is inert and its children position against the
 * nearest positioned ancestor, the 1078x1078 "image" frame at (181.5, 628).
 * Adding the Helm offset — which an earlier version of this file did — puts
 * the ring half a page up and to the left. Verified against get_metadata:
 * the ring's own image-local box (18.41, -38.79) agrees with the
 * design-context value, which it could not if Helm were a real box.
 *
 * The mock clips the helmet, a #c53f93 colour patch and the ring through one
 * shared silhouette mask. The colour patch is deliberately not reproduced:
 * the photo already ships with a clean transparent edge (same call as the
 * cover's astronaut), so it would cost a mask asset and two more composited
 * layers for a difference the 0.68-scaled page does not show.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JGlow from '@/components/shared/JGlow.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import galaxy from '@/assets/pages/galaxy-3.webp'
import planets from '@/assets/pages/planets-4.webp'
import bloom from '@/assets/pages/bloom-tight.svg'
import ring from '@/assets/pages/cover-ellipse.svg'
import helmet from '@/assets/pages/gift-helmet.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('gift')
const copy = story.t('pages.gift')
</script>
