<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <div class="page__art art-box" :style="artBox(-576.33, 241.19, 2600.392, 2269.882)">
        <img :src="bg" alt="" :style="artImg(2181.992, 1454.661, 26.26)" />
      </div>
    </template>

    <template #art>
      <div class="page__art art-box" :style="artBox(869, -167, 794.044, 711.581)">
        <img :src="rocket" alt="" :style="artImg(515.674, 655.564, 110.37, 'scaleY(-1)')" />
      </div>
      <JGlow :left="-435.2" :top="790.59" :width="2272.4" :height="1136.2" />
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>

    <!-- Heading is pinned LEFT at 108 and set at 82 px with line-height 1.15,
         three explicit lines — not the usual centred 96/1.08. -->
    <JHeading :text="copy.headline" :top="389" :size="82" align="left" :left="108" :line-height="1.15" />

    <!-- Digits sit to the right of the heading, centred on 984.46. -->
    <JDigitTiles :value="amount" :height="120.805" :top="409.195" :center-x="984.46" />

    <!-- Currency and game name are right-aligned to 1334.38. -->
    <JCurrency :top="585" :size="82" align="right" :right="1334.38">{{ currency }}</JCurrency>
    <div class="hw__divider" />
    <JValue :value="gameName" :top="787" :size="96" align="right" :right="1334.38" />

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
import bg from '@/assets/pages/bg-headline-win.webp'
import rocket from '@/assets/pages/rocket.webp'
import coins from '@/assets/pages/coins-3.webp'
import placeholder from '@/assets/pages/game-thumb-placeholder.webp'

const props = defineProps({
  amount: { type: [String, Number], default: '222257' },
  currency: { type: String, default: 'USD' },
  gameName: { type: String, default: 'Dragon Coins Jackpot' },
  gameImage: { type: String, default: '' },
})

const gameImage = props.gameImage || placeholder

const copy = { chip: 'Headline Win', headline: ['Your', 'biggest', 'win:'] }
</script>
