<template>
  <PageChrome :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <!-- 25.09: galaxy and planets are gone; the starburst (23126:3060) sits
           HIGHER here than on the other pages — top 150.14, not 278.82 — and
           carries the same fade. There is no lighting mask group left, so the
           page-level glow this file used to draw is gone with it. -->
      <PageBackdrop :planets="false" :left="-1016.32" :top="150.14" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>
    <JHeading :text="copy.headline" :top="331" :size="82" v-bind="L.headline" />
    <!-- Game name: 96 px accent gradient, same treatment as the value labels.
         The mock's box is 848 wide at x=297 — page-centred, so a max-width
         states it exactly, and it is the budget useJournalFit fits into. -->
    <JValue :value="gameName" :top="606.58" :size="96" v-bind="L.game" />
    <!-- The card shrank to 551 x 740 and rose to 833.03 (23126:2944); the
         artwork inside it is still the 645 x 903 cover crop. -->
    <JGameThumb :src="gameImage" :name="gameName" :top="833.03" :width="551" :height="740" />
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
import JGameThumb from '@/components/shared/JGameThumb.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { useStory } from '@/composables/useStoryData.js'

const story = useStory()
const L = story.layout('players_pick')
const copy = story.t('pages.players_pick')
const gameName = story.data.favoriteGame
const gameImage = story.data.favoriteGameImage
</script>
