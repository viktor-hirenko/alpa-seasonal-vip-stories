<template>
  <!-- ⚠️ 25.09: THIS PAGE WAS REDRAWN TOO, AND THE OVERLAY COULD NOT SEE IT.
       The designer added the shared starburst (23186:3352, its own exposure at
       `opacity: .2`) and the colour wash (23186:2966, `mix-blend-mode: color`).
       Neither changes LUMINOSITY much, and mock-overlay.py compares greyscale,
       so the page kept measuring 2.9 % while rendering grey against a magenta
       mock. Caught by eye, then by an RGB comparison of the same two shots.
       The wash sits ABOVE the planets and the rocket in the mock's own order,
       so both moved into #backdrop. -->
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <PageBackdrop
        tone="e"
        :planets="false"
        :left="-1327.13"
        :top="-144"
        :width="4096"
        :height="2295"
        :fade-end="0"
      />
      <!-- planets 4, rotated -150.33deg inside a 2230.908 x 1961.63 wrapper -->
      <div class="page__art days__planets">
        <JArt :src="planets" alt="" />
      </div>
      <!-- roket 1, 752 x 956 at (186, 1245) -->
      <JArt class="page__art days__rocket" :src="rocket" alt="" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="536" v-bind="L.headline" />
    <!-- 461.6 tall at three digits: the height at which our row is as wide as
         the clip's (V-61, tile-fit). It was 448 while the tile was drawn to the
         mock's proportions; session S drew it to the clip's, which needs x1.0303
         to keep the same row width (JDigitTiles' R). The mock's 350 is what four
         digits shrink to in the 1338 slot. Grows about its centre. -->
    <JDigitTiles :value="days" :height="461.6" :center-y="942.5" />
    <JHeading :text="copy.footer" :top="1245" v-bind="L.footer" />
  </PageChrome>
</template>

<script setup>
/**
 * Days in the Spotlight. Figma set 21770:2945, EN variant 21770:2946.
 * Slide frame 9, cut at 17.10 s. Dynamic value: the `days` query param.
 *
 * All offsets are design px measured off the mock and recorded in
 * _context/31-pages.md.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { useStory } from '@/composables/useStoryData.js'
import planets from '@/assets/pages/planets-4.webp'
import rocket from '@/assets/pages/rocket.webp'

const story = useStory()
const L = story.layout('days_in_spotlight')
const copy = story.t('pages.days_in_spotlight')
/** `days`, ungrouped: the mock's tile rows have one cell per digit. */
const days = story.data.days
</script>
