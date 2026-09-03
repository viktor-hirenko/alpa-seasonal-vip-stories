/**
 * Language behaviour per text slot. ADR-0007.
 *
 * WHAT IS AND IS NOT IN HERE. Geometry stays in the page component, where it
 * was measured and verified against Figma: `top`, `left`, `size`,
 * `line-height`. What lives here is the part that differs BETWEEN LANGUAGES,
 * and ADR-0007's finding is that it is never a new layout — it is always one of
 * two behaviours:
 *
 *   - the text is auto-width and stays centred on the same axis, so the only
 *     thing a longer language needs is a wider BUDGET (`maxWidth`);
 *   - the box is fixed-width and grows along one axis, so the only thing a
 *     longer language needs is a stated ANCHOR (`grow`) and a line budget.
 *
 * So no page here carries four sets of numbers. `langOverrides` below is empty
 * and is meant to stay empty until a variant is measured that neither
 * behaviour explains.
 *
 * WHERE THE NUMBERS COME FROM. Every `maxWidth` is the widest box the mock
 * draws for that slot across `Default | Variant2 | Variant3 | Variant4`, and
 * every `lines` is the tallest, both read off `get_metadata` on the four
 * variant nodes listed in _context/31-pages.md. The per-variant evidence is in
 * the comment on each entry, in the order EN / FR / DE / IT.
 *
 * ⚠️ VARIANT NAMES ARE NOT UNIFORM. The cover set (21770:2743) is
 * `Default | FR | DE | IT`; every data-page set is
 * `Default | Variant2 | Variant3 | Variant4`. The language of a data-page
 * variant was established by reading its TEXT, not by trusting the name:
 * Variant3 of Days in the Spotlight (21770:2988) contains "DU BIST SEIT", so
 * Variant2/3/4 = FR/DE/IT. Confirmed independently on Editor's Note, Seasonal
 * Power, Money Talks and Sponsor.
 *
 * WHAT `lines` DOES. It becomes `data-fit-lines` on the slot, which is
 * useJournalFit's optional VERTICAL budget (see `measure()` there): a slot that
 * needs more lines than its budget is shrunk until it fits. It is NOT the
 * authored line count — the copy files decide that. It is how many lines the
 * mock leaves room for before the slot collides with whatever is under it, so a
 * language whose line wraps unexpectedly gets smaller instead of overlapping.
 *
 * WHAT `maxWidth` DOES. It is a fit budget, not a wrapping rule: the display
 * slots render one <span> per authored line, so widening a cap cannot change
 * where a line breaks. It only decides at what width the fitter starts
 * shrinking. That is why raising the English caps below (Seasonal Power 917 ->
 * 1105, Days' footer 1269, Sports Desk's 956 -> none) changes nothing in
 * English and stops French and Italian being shrunk for no reason.
 */

/** Data-page body, design px (Money Talks 21770:3185 `Frame 2087327137`). */
export const BODY = { w: 1443, h: 1868 }

/** The cover is its own face and its own body (21770:2746). */
export const COVER_BODY = { w: 1441, h: 1868 }

/**
 * @typedef {Object} SlotLayout
 * @property {number} [maxWidth] design-px fit budget; omitted means "the slot's
 *   own default", which is `calc(100% - 60 * u)` = 1383 design px (_pages.scss).
 * @property {number} [lines] vertical budget in line boxes.
 * @property {'down'|'up'} [grow] which way the box grows when it gains a line.
 *   `down` is the default and needs no anchor. `up` means the BOTTOM edge is
 *   the fixed one, and the slot then takes `bottom` instead of `top`.
 * @property {number} [bottom] design px from the body's top edge to the slot's
 *   fixed BOTTOM edge. Only with `grow: 'up'`.
 */

/** @type {Record<string, Record<string, SlotLayout>>} */
export const PAGE_LAYOUTS = {
  cover: {
    // 774 / 766 / 774 / 774, all 2 lines. The German break really is
    // "Andromeda" / "-Ausgabe": its box is 774 like English's, which only one
    // line of "Andromeda" fits into.
    issue: { maxWidth: 774, lines: 2 },
    // 463 / 466 / 544 / 531 wide; 168 / 252 / 168 / 252 tall at a 84 px line —
    // FR and IT take a THIRD line and the box grows DOWN, while "Featuring:" at
    // 1517 does not move. The cleanest single instance of ADR-0007's grow rule
    // in the whole mock. The budget is German's box, the widest of the four.
    intro: { maxWidth: 544, lines: 3, grow: 'down' },
    // 1058 fixed in all four; the one slot that takes arbitrary player input.
    name: { maxWidth: 1058, lines: 1 },
  },

  editors_note: {
    // 452 / 791 / 791 / 791 at a 112.8 px line = 4 / 7 / 7 / 7 lines. This is
    // the one display slot in the deck that really WRAPS (1344 wide, no
    // authored breaks), and seven lines would run from 409 to 1200 — straight
    // through the mini cover card at 1010. The mock does overlap there; we do
    // not. Budget is the room that actually exists, (1010 - 409) / 112.8 = 5,
    // so FR/DE/IT shrink instead of colliding.
    headline: { maxWidth: 1344, lines: 5 },
    // 515 / 702 / 702 / 702 wide; 3 / 1 / 2 / 2 lines. The non-English variants
    // share one fixed 702.26 box, which is also the room left of the mini cover.
    cta: { maxWidth: 702, lines: 3 },
  },

  days_in_spotlight: {
    // 698 / 984 / 630 / 925, one line in every language. One line is also all
    // there is room for: the tile row starts at 767.5.
    headline: { lines: 1 },
    // 1269 / 1202 / 1202 / 1202, two lines everywhere.
    footer: { maxWidth: 1269, lines: 2 },
  },

  seasonal_power: {
    // 917 / 1099 / 772 / 1105, two lines everywhere. The page used to pass the
    // ENGLISH width as the cap, which would have shrunk French and Italian by
    // ~17 % for nothing.
    headline: { maxWidth: 1105, lines: 2 },
    // 1020 fixed at x=190 in all four — the mock's box is centred on 700, not
    // on the body's 720.6, which is why the page states it explicitly.
    value: { maxWidth: 1020, lines: 1 },
  },

  vip_status: {
    // 694 / 720 / 682 / 655, two lines everywhere.
    headline: { maxWidth: 720, lines: 2 },
    // 724 fixed. Level names are proprietary nouns and are not translated.
    level: { maxWidth: 724, lines: 1 },
  },

  money_talks: {
    // 871 / 940 / 1179 / 1314, two lines everywhere. Italian is the widest
    // heading in the deck and still clears the 1383 default, so no cap.
    headline: { lines: 2 },
  },

  headline_win: {
    // 371 / 472 / 398 / 466, three lines everywhere, pinned left at 108. Unlike
    // every other heading this one has a NEIGHBOUR: the digit row starts at
    // 634.53, so the budget is that gap and not the page.
    headline: { maxWidth: 526, lines: 3 },
    // 1230 fixed, right edge on 1334.38 with the currency and the tile row.
    game: { maxWidth: 1230, lines: 1 },
  },

  multiplier_moment: {
    // 624 / — / 695 / 1140, two lines. Nothing sits beside it and the tile row
    // is at 558.6, well below the heading's 325.32 + 188.
    headline: { lines: 2 },
    game: { maxWidth: 848, lines: 1 },
  },

  players_pick: {
    // 996 / — / 784 / 958, two lines; the game name at 620 does not move.
    headline: { lines: 2 },
    game: { maxWidth: 848, lines: 1 },
  },

  bonus_report: {
    // Both halves of the sentence are single 84-tall nodes (78 px type, not the
    // usual 96) in every language.
    headline: { lines: 1 },
    // 1054 / — / 1398 / 1156. German is 1398 wide at x=22, i.e. it uses almost
    // the whole 1443 body and overflows the slot's 1383 default — so it gets
    // the mock's own number rather than being shrunk by 1 %.
    footer: { maxWidth: 1398, lines: 1 },
  },

  sports_desk: {
    // 956 / — / 1099 / —, two lines. The English cap the page used to pass
    // would have shrunk German.
    headline: { lines: 2 },
  },

  top_sport_signal: {
    // — / — / 1185 / —, two lines; the tile row is far below at 1258.
    headline: { lines: 2 },
  },

  sponsor: {
    // 1029 / 1396 / 1333 / 1141. The mock's Italian variant is 3 lines tall
    // (312) while the subhead below it stays at 379 in all four — i.e. the mock
    // itself collides. The room is (379 - 119) / 103.7 = 2 lines, so that is the
    // budget, and the Italian copy is authored as two lines.
    headline: { maxWidth: 1396, lines: 2 },
    // 757 / 1219 / 1224 / 1040; 3 / 2 / 3 / 2 lines.
    subhead: { maxWidth: 1224, lines: 3 },
  },

  space_milk: {
    // 661 fixed at x=46 in all four; digits only, never translated.
    count: { maxWidth: 661, lines: 1 },
    // 399 / 401 / 508 / 605 — and every one of them ENDS at x=658. The right
    // edge is the anchor and the box grows left, which is why the rule is
    // written with `right`, not `left`. Budget is everything left of 658.
    packs_of: { maxWidth: 658, lines: 1 },
    // 1146 / 1256 / 1028 / 1395, two lines everywhere.
    footer: { maxWidth: 1395, lines: 2 },
  },

  joke: {
    // 1162 / 903 / 920 / 907 wide; 1 / 2 / 1 / 2 lines — and the second line
    // appears ABOVE, not below: the top edge moves 674.24 -> 576.87 while the
    // bottom stays on 771.2 (674.241 + 97 = 771.24; 576.871 + 194 = 770.87).
    // The only slot in the deck that grows upwards.
    headline: { maxWidth: 1162, lines: 2, grow: 'up', bottom: 771.24 },
    // 1157 / 1113 / 1253 / 1008; French takes four lines (480 / 120.3).
    subhead: { maxWidth: 1253, lines: 4 },
  },

  gift: {
    // 1162 fixed at x=140 in all four; 420 / 525 / 420 / 525 at a 105.28 px
    // line = 4 / 5 / 4 / 5 lines, growing down from 183.21.
    headline: { maxWidth: 1162, lines: 5, grow: 'down' },
  },

  final: {
    // 935 / 744 / 774 / 940; 1 / 1 / 1 / 2 lines. Two lines is also exactly the
    // room to the subhead: (931.5 - 737.5) / 97.2 = 2.
    headline: { maxWidth: 940, lines: 2 },
    // 995 / 1281 / 1339 / 995; 2 / 2 / 2 / 3 lines.
    subhead: { maxWidth: 1339, lines: 3 },
  },
}

/**
 * Per-language corrections.
 *
 * DELIBERATELY EMPTY. ADR-0007: a variant that neither "auto-width, same axis"
 * nor "fixed width, grows one way" explains has not been found yet, and the
 * moment one is, it belongs here as `{ page: { slot: { de: {...} } } }` — one
 * measured exception, not a fourth copy of every number.
 *
 * @type {Record<string, Record<string, Record<string, SlotLayout>>>}
 */
export const langOverrides = {}

const EMPTY = Object.freeze({})

/**
 * Layout props for one slot, ready to `v-bind` onto a primitive.
 *
 * @param {string} page page id from slides.js
 * @param {string} slot slot name as used in PAGE_LAYOUTS
 * @param {string} [locale] reserved for langOverrides; unused while it is empty
 */
export function slotLayout(page, slot, locale = 'en') {
  const base = PAGE_LAYOUTS[page]?.[slot]
  if (!base) return EMPTY
  const override = langOverrides[page]?.[slot]?.[locale]
  return override ? { ...base, ...override } : base
}

/** All slots of a page, keyed by slot name. Pages destructure this once. */
export function pageLayout(page, locale = 'en') {
  const slots = PAGE_LAYOUTS[page]
  if (!slots) return EMPTY
  if (!langOverrides[page]) return slots
  return Object.fromEntries(Object.keys(slots).map(name => [name, slotLayout(page, name, locale)]))
}
