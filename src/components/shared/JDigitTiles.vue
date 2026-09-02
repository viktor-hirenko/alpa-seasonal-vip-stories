<template>
  <!--
    Bordered digit tiles. Figma 21770:2953 -> 2954.

    `size` is not cosmetic: the mock has two genuinely different tile
    components — 350 px tall on Days in the Spotlight, 120.8 px on Headline Win.

    Separator characters (space, NBSP, comma, dot) render as gap-only cells, so
    a grouped number keeps its rhythm without a bordered box around a comma.
    One shared `--tile-fit` scales the whole row, so tiles can never desize
    relative to each other.
  -->
  <div class="j-slot j-slot--full" :style="{ top: slotTop }">
    <div class="j-tiles" :class="`j-tiles--${size}`" data-fit-role="digit">
      <span
        v-for="(ch, i) in chars"
        :key="i"
        class="j-tile"
        :class="{ 'j-tile--sep': isSep(ch) }"
      >
        <span class="j-tile__digit">{{ ch }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** Pre-formatted value: formatting (grouping, currency) happens upstream. */
  value: { type: [String, Number], default: '' },
  size: { type: String, default: 'lg' },
  top: { type: Number, required: true },
})

const SEP = /[\s  .,]/

const chars = computed(() => String(props.value).split(''))
const isSep = ch => SEP.test(ch)
const slotTop = computed(() => `calc(${props.top} * var(--u))`)

// No min-width: the mock sizes each tile to its content (digit + padding +
// border), and `tabular-nums` on the digit already gives every numeral the same
// advance width, so a `1` is as wide as an `8` without help. An earlier guessed
// min-width of 268 design px made a 4-digit row overflow the page and clip.
</script>
