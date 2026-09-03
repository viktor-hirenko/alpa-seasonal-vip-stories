<template>
  <div class="j-slot j-slot--full" :style="slotStyle">
    <div class="j-tiles" data-fit-role="digit" :style="tileStyle">
      <span v-for="(ch, i) in chars" :key="i" class="j-tile" :class="{ 'j-tile--sep': isSep(ch) }">
        <span class="j-tile__digit">{{ ch }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
/**
 * Bordered digit tiles. Figma 21770:2953 -> 2954 and friends.
 *
 * HEIGHT-DRIVEN, not an enum. The mock has FOUR different tile sizes, and
 * measuring all four showed the geometry is one similarity class:
 *
 *   page                 h      gap    gap/h
 *   days_in_spotlight  350.0   58.978  0.168509
 *   money_talks        172.0   28.984  0.168509
 *   bonus_report       200.0   33.702  0.168508
 *   sports_desk        200.0   33.702  0.168508
 *   headline_win       120.8   20.357  0.168515
 *
 * Constant to five decimals, so every dimension is derived from `height`
 * against the Days reference. An earlier `size: 'lg' | 'sm'` enum could not
 * express 172 or 200 and would have needed a new variant per page.
 *
 * MEASURED: the mock's rows are DIGITS ONLY — Bonus Report's `Numbers` frame
 * is 1337.967 wide with exactly seven tiles for a seven-digit value, no
 * separator cells. Grouping with thin spaces belongs to the plain `JValue`
 * (Seasonal Power's "1 200 000"), not here. Callers must therefore pass an
 * ungrouped value. Separator handling is kept as a safety net so a grouped
 * string degrades to gap-only cells instead of drawing a box around a comma.
 *
 * One shared `--tile-fit` scales the whole row, so tiles can never desize
 * relative to each other — that is the hook useJournalFit drives. It multiplies
 * EVERY derived dimension, not just the glyph: scaling the font alone would
 * narrow the tiles while leaving their height and padding put, which breaks the
 * similarity class the geometry is built on. A fitted row is the mock's row
 * drawn smaller, nothing else.
 *
 * The derived properties live on `.j-tiles` rather than on the slot because
 * that is where `--tile-fit` is written: a custom property is substituted on
 * the element that DECLARES it, so `--tile-h` has to be declared on the same
 * element the fitter writes to, or the scaling silently does nothing.
 */
import { computed } from 'vue'

const props = defineProps({
  /** Pre-formatted value: grouping and currency happen upstream. */
  value: { type: [String, Number], default: '' },
  /** Tile height in design px, straight from the mock's `Numbers` frame. */
  height: { type: Number, default: 350 },
  /** Design-px offset from the page body's top edge. */
  top: { type: Number, required: true },
  /** Centre the row on this design-px x instead of the page axis
   *  (Headline Win's row is centred on 984.46, not 721.5). */
  centerX: { type: Number, default: 0 },
})

/** Ratios against the Days reference (h = 350). */
const R = {
  gap: 58.978 / 350,
  border: 13.536 / 350,
  radius: 24.171 / 350,
  pad: 15.47 / 350,
  font: 386.108 / 350,
  blur: 7.735 / 350,
}

const SEP = /[\s  .,]/

const chars = computed(() => String(props.value).split(''))
const isSep = ch => SEP.test(ch)

/** Page body width in design px — the widest a row can be before it spills off
 *  the sheet. Same constant slotAlign.js anchors right-aligned slots to. */
const BODY_W = 1443

const slotStyle = computed(() => {
  if (!props.centerX) return { top: `calc(${props.top} * var(--u))` }
  // A row centred off-axis runs out of page on its nearer side first, so its
  // budget is twice that margin — without it the slot would be `max-content`,
  // i.e. no budget at all, and the fitter would have nothing to fit against.
  const room = 2 * Math.min(props.centerX, BODY_W - props.centerX)
  return {
    top: `calc(${props.top} * var(--u))`,
    insetInline: 'auto',
    left: `calc(${props.centerX} * var(--u))`,
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: `calc(${+room.toFixed(3)} * var(--u))`,
  }
})

const tileStyle = computed(() => {
  const h = props.height
  const px = n => `calc(${+(h * n).toFixed(3)} * var(--u) * var(--tile-fit, 1))`
  return {
    '--tile-h': px(1),
    '--tile-gap': px(R.gap),
    '--tile-border': px(R.border),
    '--tile-radius': px(R.radius),
    '--tile-pad': px(R.pad),
    '--tile-font': px(R.font),
    '--tile-blur': px(R.blur),
  }
})
</script>
