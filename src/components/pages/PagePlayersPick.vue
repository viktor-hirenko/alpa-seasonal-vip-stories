<template>
  <PageChrome :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <!-- Canonical galaxy/planets art, but at this page's own offsets. -->
      <div class="page__art art-box" :style="artBox(-804, 566, 3049.644, 2284.992)">
        <img :src="galaxy" alt="" :style="artImg(2759, 1793, 10.96)" />
      </div>
      <div class="page__art art-box" :style="artBox(-542.59, -548, 1501.563, 1258.608)">
        <img :src="planets" alt="" :style="artImg(1286.704, 798.233, 24.41)" />
      </div>
    </template>

    <template #art>
      <!-- Glow sits on the BODY here, not inside a hero frame: its box is a
           percentage of the 1443-wide body, resolved to design px. -->
      <JGlow :left="-435.2" :top="790.59" :width="2272.4" :height="1136.2" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="389" />
    <!-- Game name: 96 px accent gradient, same treatment as the value labels. -->
    <JValue :value="gameName" :top="620" :size="96" />
    <JGameThumb :src="gameImage" :name="gameName" :top="841" />
  </PageChrome>
</template>

<script setup>
/**
 * Player's Pick. Figma set 21770:3571, EN body 21770:3574.
 * Slide frame 15, cut at 44.03 s.
 * Dynamic: `favorite_game_name` + `favorite_game_thunbnail`.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JValue from '@/components/shared/JValue.vue'
import JGlow from '@/components/shared/JGlow.vue'
import JGameThumb from '@/components/shared/JGameThumb.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import galaxy from '@/assets/pages/galaxy-3.webp'
import planets from '@/assets/pages/planets-4.webp'
import placeholder from '@/assets/pages/game-thumb-placeholder.webp'

const props = defineProps({
  gameName: { type: String, default: 'Tiger Jackpots' },
  /** Empty in production until the query param is wired (task C). */
  gameImage: { type: String, default: '' },
})

const gameImage = props.gameImage || placeholder

const copy = { chip: "Player's Pick", headline: ['Your most-played', 'game this season:'] }
</script>
