<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <!-- 25.09: galaxy and planets are gone from this node; the starfield
           (23126:3666) is a PLAIN node here, not a Mask group, so it takes no
           fade. 4096 x 2295, centred on 719.45, top -144. -->
      <PageBackdrop
        tone="a"
        :planets="false"
        :left="-1328.55"
        :top="-144"
        :width="4096"
        :height="2295"
        :fade-end="0"
      />
    </template>

    <template #art>
      <!-- Layer order is the mock's own (21945:3030 "image"): the lighting
           wash, the radial bloom, then the helmet with its ring on top.
           ⚠️ AND THE WHOLE HERO SITS ABOVE THE COLOUR WASH HERE — the mock puts
           the wash (23126:3670) BEFORE the hero, unlike Space Milk where it
           comes after the glow. Moving this glow below the wash by analogy cost
           27 points of brightness down the left edge (V-91). Check the page.
           ⚠️ 25.09: THE GLOW SHRANK BY A THIRD AND DROPPED. 23126:3669 is
           `left-[-9.86%] right-[-9.73%]` of the 1443 body at aspect 1200/600 ->
           1725.68 x 862.84 at (-142.28, 607.9), one plus-lighter copy, where it
           used to be 2665.6 x 1332.8 at (-635.2, 530.16) as a hard-light pair.
           Gift is the page where the background is the ONLY difference, and it
           measured 26.9 % because of this and the starfield. -->
      <JGlow
        :left="-142.28"
        :top="607.9"
        :width="1725.68"
        :height="862.84"
        blend="plus"
        :plus="false"
        :mask-x="202.957"
        :mask-y="-21.711"
        :mask-width="1449.047"
        :mask-height="868.484"
      />
      <JArt class="gift__bloom" :src="bloom" alt="" />
      <div class="page__art art-box" :style="artBox(31.79, 469.13, 1321.579, 1321.579)">
        <JArt :src="helmet" alt="" :style="artImg(1051.288, 1051.288, -17.74)" />
      </div>
      <div class="page__art art-box" :style="artBox(81.95, 589.21, 777.896, 1079.753)">
        <JArt class="gift__ring" :src="ring" alt="" :style="artImg(664.492, 1008.987, 6.71)" />
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
 * Slide frame 22, cut at 78.07 s. Dynamic: `final_link` alone, and it has no
 * page slot either — it is the address the scene's CTA carries (see
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
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import JGlow from '@/components/shared/JGlow.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import bloom from '@/assets/pages/bloom-tight.svg'
import ring from '@/assets/pages/cover-ellipse.svg'
import helmet from '@/assets/pages/gift-helmet.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('gift')
const copy = story.t('pages.gift')
</script>
