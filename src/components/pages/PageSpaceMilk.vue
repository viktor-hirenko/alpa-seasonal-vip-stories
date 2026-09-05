<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-637, -136, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
    </template>

    <template #art>
      <JGlow :left="-900.9" :top="348.92" :width="3332.03" :height="1666.02" />
      <img class="sm__ellipse sm__ellipse--a" :src="bloomTight" alt="" />
      <img class="sm__ellipse sm__ellipse--b" :src="bloomWide" alt="" />
      <img class="sm__ellipse sm__ellipse--c" :src="bloomWide" alt="" />

      <div class="sm__cow">
        <img :src="cow" alt="" />
      </div>
      <!-- 21770:4231. After the cow and BEFORE the logo, which is the mock's
           own order: the fade dissolves the mascot into the page bottom, and
           the logo stays above it. Without it the body's edge cut her off. -->
      <div class="page__fade" />
      <div class="page__art art-box sm__logo" :style="artBox(646, 80.785, 796.969, 796.969)">
        <img :src="logo" alt="" :style="artImg(796.969, 796.969, -8.52)" />
      </div>
    </template>

    <p class="sm__count" data-fit-role="value" data-fit-lines="1">{{ packs }}</p>
    <!-- 399 / 401 / 508 / 605 wide across the four variants — and every one of
         them ends on x=658. The right edge is the anchor; the box grows left. -->
    <p class="sm__packs-of" data-fit-role="display" data-fit-lines="1">{{ copy.packs_of }}</p>

    <JHeading :text="copy.footer" :top="1573" :size="92" v-bind="L.footer" />
  </PageChrome>
</template>

<script setup>
/**
 * Space Milk. Figma set 21770:4216, EN body 21770:4217 (internally named
 * "Joke2" — another stale component label; trust 31-pages.md's node-id map).
 * Slide frame 20, cut at 67.07 s. Dynamic: `days` (packs count, re-used from
 * days_in_spotlight per 31-pages.md: "[X] packs").
 *
 * "SPACE MILK" is not a text layer anywhere in the Figma tree (checked via
 * get_metadata) — it is baked into a flattened product-logo image, a sibling
 * of the cow photo (which itself already shows the mascot holding the milk
 * carton as one rendered image, not a separate carton layer). Confirmed by
 * downloading both raw fills and looking at them before writing any markup.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JGlow from '@/components/shared/JGlow.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import planets from '@/assets/pages/planets-4.webp'
// Three ellipse layers in the mock, but only TWO distinct gradients: the tight
// core (white to 26.92%) and the wide one (white to 54.33%). `-c` is the wide
// one again, stretched to 554x644 — `preserveAspectRatio="none"` plus an
// explicit CSS box makes the third file redundant, so it was deleted.
import bloomTight from '@/assets/pages/bloom-tight.svg'
import bloomWide from '@/assets/pages/bloom-wide.svg'
import cow from '@/assets/pages/space-milk-cow.webp'
import logo from '@/assets/pages/space-milk-logo.webp'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('space_milk')
const copy = story.t('pages.space_milk')
// The same `days` value the Days page shows, re-used as a pack count
// (31-pages.md: "[X] packs"). "SPACE MILK" itself is baked into the logo image
// and stays English in every variant, so only the "Packs of" half translates.
const packs = story.data.packs
</script>
