<template>
  <PageChrome :tint="'rgba(255, 0, 181, 0.62)'" :spine-fade-to="'rgba(0, 10, 18, 0.8)'">
    <template #backdrop>
      <!-- 25.09: the page's own background picture is gone; 23124:2950 draws
           the shared starburst, and this page gives it its own box — 2837.738 x
           1589.992 at top 747.62, the smallest of the deck. The fade is the
           same gradient in per cent (230.502 -> 1192.42 of 1589.99). -->
      <PageBackdrop
        :planets="false"
        :left="-697.33"
        :top="747.62"
        :width="2837.738"
        :height="1589.992"
      />
    </template>

    <template #art>
      <!-- No lighting mask group is left on this node, so the page-level glow
           that used to sit here is gone. -->
      <div class="page__art art-box" :style="artBox(869, -167, 794.044, 711.581)">
        <JArt :src="rocket" alt="" :style="artImg(515.674, 655.564, 110.37, 'scaleY(-1)')" />
      </div>
    </template>

    <JChip :top="129">{{ copy.chip }}</JChip>

    <!-- ⚠️ 25.09: THE WHOLE PAGE WAS RE-STACKED. The heading is CENTRED and two
         lines where it was pinned left at 108 in three; the digit row left its
         side and sits under it, centred, at the deck's small 120.805; the
         divider rule is gone from the node; and the game name dropped from 787
         to 1667.97, under the card instead of over it. Line-height stays the
         page's own 1.15 (21770:3317). -->
    <JHeading
      :text="copy.headline"
      :top="332.03"
      :size="82"
      :line-height="1.15"
      v-bind="L.headline"
    />

    <!-- 120.805 is the SHORT-value ceiling; `slot` still shrinks a longer
         value, so nothing about the adaptive sizing changes. -->
    <JDigitTiles :value="amount" :height="120.805" :top="561.03" />

    <!-- Currency and game name are right-aligned to 1334.38. -->
    <JCurrency :top="701.1" :size="82" align="right" :right="807.38">{{ currency }}</JCurrency>
    <!-- CENTRED, like the thumbnail under it and like the game name on the
         other two pages that have one.
         ⚠️ IT USED TO BE `align="right"` PINNED TO 1334.38, AND THAT WAS WRONG
         FOR EVERY NAME BUT THE MOCK'S OWN. The mock's node (21770:3319) is
         1230 wide at x=104.38 — a box that spans the body and is centred in it
         (centre 719.4 against the body's 721.5). Its width equals the text's
         only because the designer typed "Dragon Coins Jackpot", which happens
         to fill it; so the mock says where a FULL-WIDTH name sits and says
         nothing about a short one. Right-anchoring guessed, and guessed wrong:
         measured on the shipping build, "Dragon Coins" landed 69.6 screen px
         right of the page axis while the card below it stayed centred. The
         owner saw it on 2026-09-13 and was right. With the mock's own name the
         two settings render identically — the text fills the box either way —
         so this cannot move us away from the mock. -->
    <JValue :value="gameName" :top="1667.97" :size="96" v-bind="L.game" />

    <JArt class="page__art hw__coins" :src="coins" alt="" />
    <JGameThumb
      :src="gameImage"
      :name="gameName"
      :top="832.03"
      :width="551"
      :height="740"
      :img-width="566.192"
      :img-height="792.669"
    />
  </PageChrome>
</template>

<script setup>
/**
 * Headline Win. Figma set 21770:3301, EN body 21770:3304.
 * Slide frame 13, cut at 34.07 s.
 * Dynamic: `biggest_win` + currency + `biggest_win_game` (+ thumbnail).
 *
 * Since the 25.09 redraw it is a centred page like the rest: heading, digits,
 * currency, card, game name, one under the other.
 */
import PageChrome from '@/components/shared/PageChrome.vue'
import JChip from '@/components/shared/JChip.vue'
import JHeading from '@/components/shared/JHeading.vue'
import JDigitTiles from '@/components/shared/JDigitTiles.vue'
import JCurrency from '@/components/shared/JCurrency.vue'
import JValue from '@/components/shared/JValue.vue'
import JGameThumb from '@/components/shared/JGameThumb.vue'
import PageBackdrop from '@/components/shared/PageBackdrop.vue'
import { artBox, artImg } from '@/components/shared/artBox.js'
import { useStory } from '@/composables/useStoryData.js'
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
