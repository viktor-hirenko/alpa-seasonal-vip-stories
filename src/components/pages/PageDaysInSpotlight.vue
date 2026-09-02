<template>
  <!--
    Days in the Spotlight. Figma set 21770:2945, EN variant 21770:2946.
    Slide frame 9, cut at 17.10 s. Dynamic value: the `days` query param.

    All offsets are design px measured off the mock and recorded in
    _context/31-pages.md.
  -->
  <PageChrome>
    <template #art>
      <!-- planets 4, rotated -150.33deg inside a 2230.908 x 1961.63 wrapper -->
      <div class="page__art days__planets">
        <img :src="planets" alt="" />
      </div>
      <!-- roket 1, 752 x 956 at (186, 1245) -->
      <img class="page__art days__rocket" :src="rocket" alt="" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="536" :max-width="1269" />
    <JDigitTiles :value="days" size="lg" :top="767.5" />
    <JHeading :text="copy.footer" :top="1245" :max-width="1269" />
  </PageChrome>
</template>

<script setup>
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import planets from '@/assets/pages/planets-4.webp'
import rocket from '@/assets/pages/rocket.webp'

defineProps({
  /** Formatted day count. Real data wiring lands with useStoryData (task C). */
  days: { type: [String, Number], default: '2257' },
})

// Copy is inlined until the i18n layer lands (task C). Strings are the current
// authority from _context/source/translations-en-fr-de-it.md — note they differ
// from the reference VIDEO, which carries an older revision.
const copy = {
  chip: 'Days in the Spotlight',
  headline: 'You reached',
  footer: ['days in the rocketplay', 'universe'],
}
</script>
