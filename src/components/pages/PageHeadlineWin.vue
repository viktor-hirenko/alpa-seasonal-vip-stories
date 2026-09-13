<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-576.33, 241.19, 2600.392, 2269.882)">
        <img :src="bg" alt="" :style="artImg(2181.992, 1454.661, 26.26)" />
      </div>
    </template>

    <template #art>
      <!-- ⚠️ THE GLOW BELONGS ABOVE THE COLOUR WASH ON THIS PAGE: the mock
           puts the wash (21770:3306 / 21770:3441) BEFORE the two mask groups.
           Only pages whose mock stacks them the other way round — Space Milk,
           Sponsor — put it in #backdrop (V-91). Check per page, never by
           analogy with a neighbour. -->
      <JGlow :left="-435.2" :top="790.59" :width="2272.4" :height="1136.2" />
      <div class="page__art art-box" :style="artBox(869, -167, 794.044, 711.581)">
        <img :src="rocket" alt="" :style="artImg(515.674, 655.564, 110.37, 'scaleY(-1)')" />
      </div>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>

    <!-- Heading is pinned LEFT at 108 and set at 82 px with line-height 1.15,
         three explicit lines — not the usual centred 96/1.08. -->
    <JHeading
      :text="copy.headline"
      :top="389"
      :size="82"
      align="left"
      :left="108"
      :line-height="1.15"
      v-bind="L.headline"
    />

    <!-- Digits sit to the right of the heading and share the 1334.38 right
         edge with the currency and game name, keeping it at any length — the
         clip does, with three digits. 167.9 tall at three digits (V-61): 163
         at the mock's tile proportions, x1.0303 since session S drew the tile
         the clip's way (JDigitTiles' R). The clip's row is wider still, but the
         currency at 585 caps the height here. The mock's 120.8 is what six
         digits shrink to in the 699.86 slot (21770:3302). Top edge fixed, level
         with the heading. -->
    <JDigitTiles :value="amount" :height="167.9" :top="409.195" :right="1334.38" :slot="699.86" />

    <!-- Currency and game name are right-aligned to 1334.38. -->
    <JCurrency :top="585" :size="82" align="right" :right="1334.38">{{ currency }}</JCurrency>
    <div class="hw__divider" />
    <!-- The mock's game-name box is a fixed 1230 wide ending at 1334.38
         (21770:3331), which is the budget useJournalFit shrinks into. Stating
         the width changes nothing while the name fits: the box is
         right-anchored either way. -->
    <JValue
      :value="gameName"
      :top="787"
      :size="96"
      align="right"
      :right="1334.38"
      :width="1230"
      v-bind="L.game"
    />

    <img class="page__art hw__coins" :src="coins" alt="" />
    <JGameThumb :src="gameImage" :name="gameName" :top="947" />
  </PageChrome>
</template>

<script setup>
/**
 * Headline Win. Figma set 21770:3301, EN body 21770:3304.
 * Slide frame 13, cut at 34.07 s.
 * Dynamic: `biggest_win` + currency + `biggest_win_game` (+ thumbnail).
 *
 * The busiest data page: the heading is pinned left, the digits sit beside it,
 * and the currency and game name are right-aligned — the only page so far that
 * is not simply centred.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JValue from '@/components/shared/JValue.vue'
import JGlow from '@/components/shared/JGlow.vue'
import JGameThumb from '@/components/shared/JGameThumb.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
import bg from '@/assets/pages/bg-headline-win.webp'
import rocket from '@/assets/pages/rocket.webp'
import coins from '@/assets/pages/coins-3.webp'

const story = useStory()
const L = story.layout('headline_win')
const copy = story.t('pages.headline_win')
const amount = story.data.biggestWin
const currency = story.data.currency
const gameName = story.data.biggestWinGame
// NO PLACEHOLDER. The URL comes off the link; if it is not there, or its domain
// is blocked for this player, JGameThumb shows a name-only card. It used to fall
// back to `game-thumb-placeholder.webp` instead, which is not a placeholder at
// all but the finished cover art of one real game (Tiger Jackpots) — so a player
// whose link named a different game saw that game's name over another game's
// picture. Thor renders no frame at all without the parameter
// (your_story.vue:182); a name card is the same answer with the mock's box kept.
const gameImage = story.data.biggestWinGameImage
</script>
