<template>
  <!-- 21770:4232: the spine fade here is 377 wide and stays clear for its first
       42.308 %, unlike the deck's default 395 with no offset. -->
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-width="377" :spine-fade-stop="42.308">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-637, -136, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
      <!-- 21770:4223/4226. The ellipse mask has its OWN box inside the bitmap's
           (V-91): 2798 x 1676.977 at (391.891, -41.922), not the whole
           3332 x 1666. Stretching it over the bitmap spread the core and is
           why the glow around the cow read pale. -->
      <JGlow
        :left="-900.9"
        :top="348.92"
        :width="3332.03"
        :height="1666.02"
        :mask-x="391.891"
        :mask-y="-41.922"
        :mask-width="2798"
        :mask-height="1676.977"
      />
    </template>

    <template #art>
      <!-- ⚠️ THE ORDER OF THESE THREE IS THE MOCK'S, AND IT IS NOT DECORATIVE
           (V-91). All three are `hard-light`, so each one lights whatever is
           already under it. Figma stacks them 3277 -> cow -> 3276 -> 3275,
           i.e. the two smaller blooms sit ON TOP of the mascot and light her
           and the carton. Drawing all three before her buried them, which is
           the white gradient the owner could see in Figma and not in ours. -->
      <img class="sm__ellipse sm__ellipse--a" :src="bloomTight" alt="" />

      <div class="sm__cow" :style="{ '--cow': `url(${cow})` }">
        <img :src="cow" alt="" />
        <!-- 21770:4229's inner shadow — see the `inner-glow` mixin. -->
        <div class="sm__inner" />
      </div>

      <img class="sm__ellipse sm__ellipse--b" :src="bloomWide" alt="" />
      <img class="sm__ellipse sm__ellipse--c" :src="bloomWide" alt="" />
      <!-- 21770:4231. After the cow and BEFORE the logo, which is the mock's
           own order: the fade dissolves the mascot into the page bottom, and
           the logo stays above it. Without it the body's edge cut her off. -->
      <div class="page__fade" />
      <!-- 21770:4238. THE INNER SIZE IS NOT THE BOX SIZE, AND THAT IS WHY "MILK"
           used to land on the cow's helmet (V-85). `get_metadata` reports a
           rotated node in two different currencies at once: `width`/`height`
           are the AABB, `x`/`y` are the LOCAL ORIGIN carried through the
           rotation. Reading 796.969 as the image's own size inflated it by
           13.7 % and, with the origin read as the AABB's corner, dropped it
           103 px. Undo both: side = 796.969 / (cos 8.52 + sin 8.52) = 700.867,
           and the AABB's top follows from the recovered centre. Checked against
           the page export pixel for pixel — the two routes agree to 4.5 px. -->
      <div
        class="page__art art-box sm__logo"
        :style="{ ...artBox(646, -23.051, 796.969, 796.969), '--logo': `url(${logo})` }"
      >
        <img :src="logo" alt="" :style="artImg(700.867, 700.867, -8.52)" />
        <div class="sm__logo-inner" :style="artImg(700.867, 700.867, -8.52)" />
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
