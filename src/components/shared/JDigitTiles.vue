<template>
  <div class="j-slot j-slot--tiles" :style="slotStyle">
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
 * HEIGHT-DRIVEN, not an enum. The mock has FIVE different tile sizes, and
 * measuring them showed the geometry is one similarity class:
 *
 *   page                 h      gap    gap/h
 *   days_in_spotlight  350.0   58.978  0.168509
 *   top_sport_signal   286.0   48.193  0.168507
 *   money_talks        172.0   28.984  0.168509
 *   bonus_report       200.0   33.702  0.168508
 *   sports_desk        200.0   33.702  0.168508
 *   headline_win       120.8   20.357  0.168515
 *
 * Constant to five decimals, so every dimension is derived from `height`
 * against the Days reference. An earlier `size: 'lg' | 'sm'` enum could not
 * express 172 or 200 and would have needed a new variant per page.
 *
 * THE HEIGHT IS A CEILING, NOT THE PAGE'S CONSTANT (V-61, 2026-09-08). Put the
 * mock's tile pages side by side and the row is the SAME WIDTH on all of them
 * while the height falls with the digit count — 350 for four digits (row
 * 1314.7, 21770:2946), 200 for seven (1338.0, 21811:3914), 172 for eight
 * (1324.5, 21770:3185). So in the mock the row fills its slot and the height
 * is what that leaves; the numbers above are the SHRUNK heights of the long
 * demo values, and the first build wrote them in as maxima, which is why a
 * three-digit value drew tiles half the reference clip's. DP-15258 asks for
 * exactly this: "адаптивний розмір шрифтів під різну довжину символів".
 *
 * So a page now declares two things: `height`, the tile height at a SHORT
 * value (the mock's own where the mock shows one, else measured off the clip
 * by scripts/tile-fit.mjs — every page's number and its source are in
 * _context/36-visual-diff.md under V-61), and `slot`, the width the row may
 * take before useJournalFit shrinks it through `--tile-fit`. The long demo
 * values then come out at the mock's heights by themselves: eight digits on
 * money_talks at 173.8 against 172, seven on bonus_report at 200 against 200,
 * measured in the DOM.
 *
 * WHERE THE ROW GROWS FROM is the clip's call too, and it differs by page:
 * bottom edge fixed above the currency label (money_talks, bonus_report,
 * sports_desk), top edge fixed level with the heading (headline_win), centre
 * fixed (days_in_spotlight, multiplier_moment). Hence three vertical props;
 * a page passes exactly one, in the mock's coordinates for the mock's value.
 *
 * WHICH SIZE IS "THE CLIP'S". The clip's tiles are not drawn to the mock's
 * proportions — their glyph sits smaller inside a taller box, by 4-8 % — so
 * "as big as the clip's" has three answers. The one taken is THE ROW'S WIDTH,
 * because it is the one the mock itself confirms: on top_sport_signal the mock
 * already prints three digits at 286, and with proportional digits our row
 * there is the clip's row to 0.2 % (scripts/tile-fit.mjs, 2026-09-08). Where
 * the vertical room does not allow it — bonus_report would run into its
 * heading, headline_win into its currency — the height is capped by the room
 * and the comment on the page says by how much.
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
import { BODY } from '@/story/pageLayouts.js'

const props = defineProps({
  /** Pre-formatted value: grouping and currency happen upstream. */
  value: { type: [String, Number], default: '' },
  /** Tile height in design px at a SHORT value — the ceiling. See above. */
  height: { type: Number, default: 350 },
  /**
   * Width in design px the row may take before it is shrunk to fit: the mock's
   * `Numbers` frame of the longest value on the page (1338 on the centred
   * pages, 21811:3914). Without it the budget would be the whole page body and
   * the fitter would let a seven-digit row grow 7 % past the mock.
   */
  slot: { type: Number, default: 1338 },
  /** Design-px top edge, from the page body's top. Exactly one of the three. */
  top: { type: Number, default: 0 },
  /** Design-px centre line, from the body's top: the row grows both ways. */
  centerY: { type: Number, default: 0 },
  /** Design-px bottom edge, from the body's top: the row grows upwards. */
  bottom: { type: Number, default: 0 },
  /**
   * Right edge in design px for a row that is right-aligned rather than
   * centred (Headline Win, whose row shares the 1334.38 line with its currency
   * and game name, 21770:3331). Then the slot ends there and a short value
   * keeps the right edge, which is what the clip does with three digits.
   */
  right: { type: Number, default: 0 },
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

const d = n => `calc(${+Number(n).toFixed(3)} * var(--u))`

const slotStyle = computed(() => {
  // All three anchors are placed from the body's TOP and pulled up by a
  // translate, never by `bottom:`. The box that holds every page is laid out
  // at the CURRENT face's size — the cover's 1465x1868 until the handover,
  // the page's 1564x1911 after it (see useJournalFit's note on --jw/--jh) —
  // so while the cover shows, `.page__body` is 1825 design px tall, not 1868,
  // and an offset from its bottom edge is 43 px off. A translate is a
  // percentage of the slot's own height and is right at either face size.
  const vertical = props.bottom
    ? { top: d(props.bottom), transform: 'translateY(-100%)' }
    : props.centerY
      ? { top: d(props.centerY), transform: 'translateY(-50%)' }
      : { top: d(props.top) }
  const horizontal = props.right
    ? {
        insetInline: 'auto',
        right: d(BODY.w - props.right),
        marginInline: '0',
        '--tiles-justify': 'flex-end',
      }
    : {}
  return { ...vertical, ...horizontal, width: d(props.slot) }
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
