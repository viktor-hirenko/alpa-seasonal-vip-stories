<template>
  <PageChrome>
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-907, 1032, 2759, 1793)">
        <img :src="galaxy" alt="" :style="{ width: du(2759), height: du(1793) }" />
      </div>
      <div class="page__art art-box" :style="artBox(436, -412, 1270.054, 1116.755)">
        <img :src="planets" alt="" :style="artImg(1080, 670, -150.33)" />
      </div>
    </template>

    <template #art>
      <div class="page__fade" />
    </template>

    <div class="en__chip">
      <img class="en__chip-dot" :src="dot" alt="" />
      <span><JReveal :text="copy.chip" /></span>
    </div>

    <!-- The one display slot in the deck that really wraps: 1344 wide, no
         authored breaks, one block per sentence. English lands on 4 lines and
         the other three on 7 (mock 452 vs 791 at a 112.8 px line), which is why
         it carries a line budget — 7 lines would run into the mini cover. -->
    <p class="en__headline" data-fit-role="display" :data-fit-lines="L.headline.lines">
      <span v-for="(line, i) in copy.headline" :key="i">{{ line }}</span>
    </p>

    <JHeading
      :text="copy.cta"
      :top="1223"
      :size="96"
      align="left"
      :left="65.39"
      :line-height="1.0417"
      v-bind="L.cta"
    />

    <!-- Mini cover card (21770:2827): the same Cover face at ~0.38 scale, with
         its own layout (no "Your season story is ready" line — cut for space)
         rather than a strict scale of PageCover.vue. See artBox.js for why an
         outer box + rotated inner is the right shape. The slots_id-1 backdrop
         texture is skipped here: at this size, inside an already-scaled-down
         page pose, it is imperceptible — not worth a second oversized asset. -->
    <div class="page__art art-box en__mini" :style="artBox(734.13, 1010, 628.699, 763.377)">
      <div class="en__mini-card">
        <div class="en__mini-edge" />
        <div class="en__mini-body">
          <!-- The cover's own background texture at the card's scale (0.3793).
               See `.en__mini-slots` for why it is here and was not before. -->
          <div
            class="page__art art-box en__mini-slots"
            :style="artBox(-196.91, -148.81, 1563.55, 696.02)"
          >
            <img :src="slots" alt="" :style="artImg(1563.55, 696.02, -5.3)" />
          </div>
          <div class="en__mini-fade1" />
          <p class="en__mini-vip-club">{{ cover.vip_club }}</p>
          <div class="en__mini-glow-blob" :style="miniGlowStyle" />
          <div class="en__mini-astronaut" />
          <div class="page__art art-box" :style="artBox(135.97, 107.99, 294.695, 409.049)">
            <img
              class="en__mini-screen"
              :src="ellipse"
              alt=""
              :style="artImg(251.733, 382.24, 6.71)"
            />
          </div>
          <div class="en__mini-fade2" />
          <div class="en__mini-journal">
            <span>{{ cover.journal }}</span>
          </div>
          <p class="en__mini-issue">
            <span v-for="(line, i) in cover.issue" :key="i">{{ line }}</span>
          </p>
          <p class="en__mini-featuring">{{ cover.featuring }}</p>
          <p class="en__mini-name">{{ playerName }}</p>
        </div>
      </div>
    </div>
  </PageChrome>
</template>

<script setup>
import { computed } from 'vue'
import JReveal from '@/components/shared/JReveal.vue'
import { usePageGlow } from '@/components/shared/decode.js'
/**
 * Editor's Note. Figma set 21770:2820, EN body 21770:2821.
 * Slide frame 8, cut at 11.07 s. Dynamic: `name` (via the mini cover).
 *
 * A normal data page (canonical PageChrome skeleton) except the galaxy/planets
 * backdrop sits at its OWN offsets — not byte-identical to Money Talks — so it
 * is placed directly here rather than through PageBackdrop.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JHeading from '@/components/shared/JHeading.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
import galaxy from '@/assets/pages/galaxy-3.webp'
import planets from '@/assets/pages/planets-4.webp'
import dot from '@/assets/pages/editors-note-dot.svg'
import ellipse from '@/assets/pages/cover-ellipse.svg'
import slots from '@/assets/pages/cover-slots.webp'

const story = useStory()
const L = story.layout('editors_note')
const copy = story.t('pages.editors_note')
// The mini card is the cover at 0.38, so it reads the COVER's copy.
const cover = story.t('pages.cover')
const playerName = story.data.name

const du = n => `calc(${+n.toFixed(3)} * var(--u))`

/**
 * «Мініатюра обкладинки в кутку розвороту підсвічується — мʼяке світіння
 * наростає й лишається, ніби позначка «ось твій випуск»» (21770:2049).
 *
 * The blob is already in the markup and already in the mock; all that was
 * missing was that it should ARRIVE. It rises with the page's highlight and
 * then stays, which is what the plaque asks for in as many words.
 */
const miniGlow = usePageGlow()
const miniGlowStyle = computed(() => (miniGlow.value >= 1 ? null : { opacity: miniGlow.value }))
</script>
