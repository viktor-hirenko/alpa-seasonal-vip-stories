<template>
  <div class="cover">
    <div class="cover__edge" />
    <div class="cover__body">
      <div class="page__art art-box cover__slots" :style="artBox(-519.15, -392.3, 4122.3, 1835.5)">
        <JArt priority :src="slots" alt="" :style="artImg(4122.3, 1835.5, -5.3)" />
      </div>

      <div class="cover__fade-mid" />

      <p class="cover__vip-club">{{ copy.vip_club }}</p>

      <div class="cover__glow-blob" />
      <div class="cover__astronaut" />
      <div
        class="page__art art-box cover__ellipse"
        :style="artBox(358.91, 285.05, 777.896, 1079.753)"
      >
        <JArt priority :src="ellipse" alt="" :style="artImg(664.492, 1008.987, 6.71)" />
      </div>

      <div class="cover__fade-bottom" />

      <div class="cover__journal-label">
        <span>{{ copy.journal }}</span>
      </div>

      <p class="cover__issue" data-fit-role="display" :data-fit-lines="L.issue.lines">
        <span v-for="(line, i) in copy.issue" :key="i">{{ line }}</span>
      </p>

      <!-- French and Italian take a third line here (the mock's box grows from
           168 to 252 at a 84 px line) while "Featuring:" at 1517 stays put —
           ADR-0007's grow rule, measured. -->
      <p class="cover__intro" data-fit-role="display" :data-fit-lines="L.intro.lines">
        <span v-for="(line, i) in copy.intro" :key="i">{{ line }}</span>
      </p>

      <p class="cover__featuring">{{ copy.featuring }}</p>
      <!-- The one text on this page that takes arbitrary player input, so it
           is the one that carries a fit role (see useJournalFit). -->
      <p class="cover__name" data-fit-role="value" data-fit-lines="1">{{ playerName }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * Cover. Figma set 21770:2743, EN variant 21770:2744.
 * Slide frames 4-7 (the fly-in entrance), cut at 2.50 s. Dynamic: `name`.
 *
 * Structurally NOT a data page — no PageChrome (no spine/tint/sheen), its own
 * 1465x1868 face (see journalGeometry.js FACE.cover), and its own skeleton:
 * a flat CSS 7-stop gradient for the right edge (not the SVG data pages use),
 * an oversized rotated background texture clipped by the body, and a masked
 * astronaut group.
 *
 * The astronaut photo already ships with a clean transparent background (its
 * Figma source), so unlike the pink glow blob behind it — a solid rectangle
 * that NEEDS the mock's blob mask to read as a soft shape — the photo is
 * rendered unmasked. get_design_context's flattened node export was rejected
 * for both: it composites the page background into an opaque rectangle
 * (the same trap JGlow's doc warns about), which is why this pulls the raw
 * per-layer fills instead (get_design_context direct URLs, alpha-checked).
 */
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
import slots from '@/assets/pages/cover-slots.webp'
import ellipse from '@/assets/pages/cover-ellipse.svg'

const story = useStory()
const L = story.layout('cover')
const copy = story.t('pages.cover')
const playerName = story.data.name
</script>
