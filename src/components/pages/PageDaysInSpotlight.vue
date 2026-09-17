<template>
  <PageChrome>
    <template #art>
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
import { useStory } from '@/composables/useStoryData.js'
import planets from '@/assets/pages/planets-4.webp'
import rocket from '@/assets/pages/rocket.webp'

const story = useStory()
const L = story.layout('days_in_spotlight')
const copy = story.t('pages.days_in_spotlight')
/** `days`, ungrouped: the mock's tile rows have one cell per digit. */
const days = story.data.days
</script>
