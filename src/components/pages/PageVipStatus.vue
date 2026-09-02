<template>
  <!--
    VIP Status. Figma set 21770:3103, EN body 21770:3106, hero 21770:3115.
    Slide frame 11, cut at 26.07 s. Dynamic: the `level` query param drives both
    the badge artwork and the level name.

    Two things specific to this page:
      - a 4096 x 2295 starfield background, centred and bleeding well past the
        page on both sides;
      - a magenta colour wash (rgba(255,0,181,0.62), mix-blend-mode: color).
        Without it the page reads dark navy instead of magenta.
      - only ONE glow copy (hard-light), unlike the two-copy stack elsewhere.
  -->
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'">
    <template #backdrop>
      <img class="page__art page__starfield" :src="starfield" alt="" />
    </template>

    <template #art>
      <JHero :left="261" :top="566" :glow-plus="false">
        <!-- `Lvl 1` ray burst: 1076 sq centred at y + 16.5, rotated 90deg -->
        <div class="j-hero__rays" :style="artBox(-78.5, -62, 1076, 1076)">
          <img :src="rays" alt="" :style="artImg(1076, 1076, 90)" />
        </div>

        <JLevelBadge :src="badge" />
      </JHero>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" />
    <!-- Level name: 200 px gradient, same treatment as the currency labels. -->
    <JValue :value="levelName" :top="1504" :size="200" />
  </PageChrome>
</template>

<script setup>
import { computed } from 'vue'
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JValue from '@/components/shared/JValue.vue'
import JHero from '@/components/shared/JHero.vue'
import JLevelBadge from '@/components/shared/JLevelBadge.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { resolveLevel, LEVEL_BADGES } from '@/story/levelConfig.js'
import starfield from '@/assets/pages/starfield.webp'
import rays from '@/assets/pages/rays.webp'

const props = defineProps({
  /** Raw `level` query param. Real wiring lands with useStoryData (task C). */
  level: { type: String, default: 'SILVER' },
})

const resolved = computed(() => resolveLevel(props.level))
const badge = computed(() => resolved.value.badge || LEVEL_BADGES.IRON)
// Level names are proprietary nouns and are NOT translated (see levelConfig.js).
const levelName = computed(() => resolved.value.level || 'IRON')

const copy = { chip: 'VIP Status', headline: ['Your season', 'rank:'] }
</script>
