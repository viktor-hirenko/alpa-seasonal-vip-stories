<template>
  <!-- 21770:4232: the spine fade here is 377 wide and stays clear for its first
       42.308 %, unlike the deck's default 395 with no offset. -->
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-width="377" :spine-fade-stop="42.308">
    <template #backdrop>
      <!-- 25.09: `planets 4` left this node and the starburst (23126:3636)
           took the page: 4096 x 2295 at top -144, the `c` exposure, plain node
           so no fade. -->
      <PageBackdrop
        tone="c"
        :planets="false"
        :left="-1328.73"
        :top="-144"
        :width="4096"
        :height="2295"
        :fade-end="0"
      />
      <!-- ⚠️ 25.09: THE WASH SHRANK TO A THIRD OF ITS BOX. 23126:3639 is
           `left-[-9.87%] right-[-9.72%]` of the 1443 body at aspect 1200/600 ->
           1725.68 x 862.84 at (-142.42, 607.9), one plus-lighter copy, where it
           used to be 3332 x 1666 at (-900.9, 348.92) as a hard-light pair. It
           is Gift's wash to the pixel — the designer reused it. -->
      <JGlow
        :left="-142.42"
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
    </template>

    <template #art>
      <!-- ⚠️ THE ORDER OF THESE THREE IS THE MOCK'S, AND IT IS NOT DECORATIVE
           (V-91). All three are `hard-light`, so each one lights whatever is
           already under it. Figma stacks them 3277 -> cow -> 3276 -> 3275,
           i.e. the two smaller blooms sit ON TOP of the mascot and light her
           and the carton. Drawing all three before her buried them, which is
           the white gradient the owner could see in Figma and not in ours. -->
      <JArt class="sm__ellipse sm__ellipse--a" :src="bloomTight" alt="" />

      <div class="sm__cow" :style="{ '--cow': artIsOpen ? `url(${cow})` : 'none' }">
        <JArt :src="cow" alt="" />
        <!-- 21770:4229's inner shadow — see the `inner-glow` mixin. -->
        <div class="sm__inner" />
      </div>

      <JArt class="sm__ellipse sm__ellipse--b" :src="bloomWide" alt="" />
      <JArt class="sm__ellipse sm__ellipse--c" :src="bloomWide" alt="" />
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
        :style="{
          ...artBox(646, -23.051, 796.969, 796.969),
          '--logo': artIsOpen ? `url(${logo})` : 'none',
        }"
      >
        <JArt :src="logo" alt="" :style="artImg(700.867, 700.867, -8.52)" />
        <div class="sm__logo-inner" :style="artImg(700.867, 700.867, -8.52)" />
      </div>
    </template>

    <p class="sm__count" data-fit-role="value" data-fit-lines="1">{{ packs }}</p>
    <!-- 399 / 401 / 508 / 605 wide across the four variants — and every one of
         them ends on x=658. The right edge is the anchor; the box grows left. -->
    <p class="sm__packs-of" data-fit-role="display" data-fit-lines="1">{{ copy.packs_of }}</p>

    <!-- 25.09: the footer is 82 px now, not 92 (21770:4234). -->
    <JHeading :text="copy.footer" :top="1573" :size="82" v-bind="L.footer" />
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
import { artIsOpen } from '@/composables/useArtGate.js'
import JHeading from '@/components/shared/JHeading.vue'
import JGlow from '@/components/shared/JGlow.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
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
// ⚠️ ITS OWN PARAMETER (`packs`), NOT `days`. The copy says «one for every day
// you spent», and until 18.09 the code took that sentence for a rule and read
// the Days page's number here. Two unrelated slides on one link parameter is a
// fault an integrator cannot work around, so the page now gates on `packs`:
// no `packs` on the link, no Space Milk page.
// (31-pages.md: "[X] packs"). "SPACE MILK" itself is baked into the logo image
// and stays English in every variant, so only the "Packs of" half translates.
const packs = story.data.packs
</script>
