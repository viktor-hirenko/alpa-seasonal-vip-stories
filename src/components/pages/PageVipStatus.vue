<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <!-- 21770:3107 kept its box and changed its picture: the starfield is
           now the shared starburst at its own exposure (`d`). Plain node, so
           no fade. -->
      <PageBackdrop
        tone="d"
        :planets="false"
        :left="-1328"
        :top="-144"
        :width="4096"
        :height="2295"
        :fade-end="0"
      />
      <!-- ⚠️ 25.09: the wash left the hero for the page (23126:3029) —
           `left-[-30.19%] right-[-27.29%]` of the 1443 body at aspect 1200/600
           -> 2272.43 x 1136.22 at (-435.64, 460.25), one plus-lighter copy
           where it was one hard-light copy inside the 919 frame. -->
      <JGlow
        :left="-435.64"
        :top="460.25"
        :width="2272.43"
        :height="1136.22"
        blend="plus"
        :plus="false"
        :mask-x="267.266"
        :mask-y="-28.59"
        :mask-width="1908.199"
        :mask-height="1143.676"
      />
    </template>

    <template #art>
      <!-- The `Lvl 1` ray burst is gone from the node. -->
      <JHero :left="261" :top="566" :glow="false">
        <JLevelBadge :src="badge" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="332.54" :size="92" v-bind="L.headline" />
    <!-- Level name: 200 px gradient, same treatment as the currency labels. -->
    <JValue :value="levelName" :top="1504" :size="200" v-bind="L.level" />
  </PageChrome>
</template>

<script setup>
/**
 * VIP Status. Figma set 21770:3103, EN body 21770:3106, hero 21770:3115.
 * Slide frame 11, cut at 26.07 s. Dynamic: the `level` query param drives both
 * the badge artwork and the level name.
 *
 * Two things specific to this page:
 *   - a 4096 x 2295 starburst background, centred and bleeding well past the
 *     page on both sides — since 25.09 the shared file at its own exposure;
 *   - a magenta colour wash (rgba(255,0,181,0.62), mix-blend-mode: color).
 *     Without it the page reads dark navy instead of magenta.
 *   - only ONE glow copy, and since 25.09 it is plus-lighter and lives on the
 *     page rather than inside the hero frame.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JValue from '@/components/shared/JValue.vue'
import JHero from '@/components/shared/JHero.vue'
import JLevelBadge from '@/components/shared/JLevelBadge.vue'
import JGlow from '@/components/shared/JGlow.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('vip_status')
const copy = story.t('pages.vip_status')
// `level` resolution (badge artwork, REGULAR -> Iron, unknown -> skip) lives in
// levelConfig.js and runs once in useStoryData. Level names are proprietary
// nouns: they sit under `levels.*` in all four copy files with identical
// values, which is why check-locales has an identical-allowed set.
const badge = story.data.levelBadge
const levelName = story.data.levelName
</script>
