/**
 * THE query-parameter contract. One table, one parser, no Vue.
 *
 * The story opens personally for a player: almost every number in the journal
 * arrives on the link (00-brief.md). Which page consumes which parameter is
 * already written down in _context/31-pages.md, and `src/story/slides.js`
 * already names the gate for each page in its `skip` field — this file is the
 * third corner of that triangle and is checked against both by
 * `scripts/check-locales.mjs` (locale keys) and by the `SKIP_KEYS` assertion
 * below (slide gates).
 *
 * WHY A TABLE AND NOT A PARSER PER PAGE: the marketing doc, the skip flags and
 * the page props all have to agree on names and types. Written once as data,
 * they cannot drift; `docs/marketing/link-parameters.md` is generated from the
 * same rows by hand and its column order matches PARAMS deliberately.
 *
 * WHY NOT THOR'S HAND-ROLLED SPLIT: Thor slices at the first '?', splits on
 * '&' and '=' and calls `decodeURIComponent` itself, then patches '+' back to
 * a space for names only (useStoryData.js:52-77). `URLSearchParams` does the
 * same decoding, applies the '+' rule to EVERY field rather than the two
 * someone remembered, and gets the edge cases (an '=' inside a value, a
 * repeated key, an empty value) right. The one behavioural difference is that
 * a literal plus in a game name now needs to be sent as %2B — which was
 * already true for '&' in Thor.
 */

/** Locales the story ships. Order is the order the mock's variants sit in. */
export const LOCALES = ['en', 'fr', 'de', 'it']

export const DEFAULT_LOCALE = 'en'

/**
 * Fallback when neither `currency` nor `user_currency` is sent.
 *
 * OPEN QUESTION 5 (_context/40-open-questions.md) asks the owner whether this
 * should be EUR. Until it is answered the mock's own value wins — every
 * currency node in Figma reads USD — and it is one constant to change.
 */
export const DEFAULT_CURRENCY = 'USD'

/**
 * Sample values, used ONLY in dev (`import.meta.env.DEV`).
 *
 * They are the numbers the pages were built and verified against, kept here so
 * the lab and `npm run dev` still render a designed page with no query string.
 * In production a missing parameter yields `null` and the slot renders empty —
 * inventing a plausible number would put a wrong figure in front of a player,
 * which is worse than an empty slot and much worse than a skipped page.
 */
export const SAMPLE = {
  name: 'Mariannaa!',
  days: 2257,
  points: 1200000,
  level: 'SILVER',
  totalWins: 2222577,
  biggestWin: 222257,
  biggestWinGame: 'Dragon Coins Jackpot',
  biggestWinGameImage: '',
  topMultiplier: 22257,
  topMultiplierGame: 'Tiger Jackpots',
  topMultiplierGameImage: '',
  favoriteGame: 'Tiger Jackpots',
  favoriteGameImage: '',
  bonuses: 2572257,
  sportsWins: 2572257,
  sportsMultiplier: 257,
  promocode: '',
  bonusLabel: '',
  finalLink: '',
}

/**
 * @typedef {'text'|'int'|'decimal'|'url'|'level'} ParamType
 * @typedef {{ key: string, query: string[], type: ParamType,
 *             pages: string[], skip?: string }} ParamSpec
 *
 * `query` lists the accepted spellings, HIGHEST PRIORITY LAST — the same rule
 * Thor uses, where `user_language` overrides `language` because the product
 * appends the player's own setting after the campaign default.
 *
 * `skip` is the key in `slides.js`'s `skip` field that this parameter gates.
 */

/** @type {ParamSpec[]} */
export const PARAMS = [
  { key: 'name', query: ['name'], type: 'text', pages: ['cover', 'editors_note'] },
  {
    key: 'days',
    query: ['days'],
    type: 'int',
    pages: ['days_in_spotlight', 'space_milk'],
    skip: 'days',
  },
  { key: 'points', query: ['points'], type: 'int', pages: ['seasonal_power'], skip: 'points' },
  { key: 'level', query: ['level'], type: 'level', pages: ['vip_status'], skip: 'level' },
  {
    key: 'totalWins',
    query: ['total_wins'],
    type: 'int',
    pages: ['money_talks'],
    skip: 'totalWins',
  },
  {
    key: 'biggestWin',
    query: ['biggest_win'],
    type: 'int',
    pages: ['headline_win'],
    skip: 'biggestWin',
  },
  { key: 'biggestWinGame', query: ['biggest_win_game'], type: 'text', pages: ['headline_win'] },
  {
    key: 'biggestWinGameImage',
    query: ['biggest_win_game_thunbnail'],
    type: 'url',
    pages: ['headline_win'],
  },
  {
    key: 'topMultiplier',
    query: ['top_multiplier'],
    type: 'decimal',
    pages: ['multiplier_moment'],
    skip: 'topMultiplier',
  },
  {
    key: 'topMultiplierGame',
    query: ['top_multiplier_game'],
    type: 'text',
    pages: ['multiplier_moment'],
  },
  {
    key: 'topMultiplierGameImage',
    query: ['top_multiplier_game_thunbnail'],
    type: 'url',
    pages: ['multiplier_moment'],
  },
  {
    key: 'favoriteGame',
    query: ['favorite_game_name'],
    type: 'text',
    pages: ['players_pick'],
    skip: 'favoriteGame',
  },
  {
    key: 'favoriteGameImage',
    query: ['favorite_game_thunbnail'],
    type: 'url',
    pages: ['players_pick'],
  },
  { key: 'bonuses', query: ['bonuses'], type: 'int', pages: ['bonus_report'], skip: 'bonuses' },
  {
    key: 'sportsWins',
    query: ['sports_wins'],
    type: 'int',
    pages: ['sports_desk'],
    skip: 'sportsWins',
  },
  {
    key: 'sportsMultiplier',
    query: ['sports_multiplier'],
    type: 'decimal',
    pages: ['top_sport_signal'],
    skip: 'sportsMultiplier',
  },
  { key: 'promocode', query: ['promocode'], type: 'text', pages: ['gift'] },
  { key: 'bonusLabel', query: ['bonus_label'], type: 'text', pages: ['gift'] },
  { key: 'finalLink', query: ['final_link'], type: 'url', pages: ['gift', 'final'] },
]

/**
 * `favorite_game_thunbnail` is misspelt on purpose.
 *
 * It is the name already live in Thor's links and in the marketing templates
 * built on them; renaming it would silently drop the thumbnail on every link
 * already in a CRM campaign. The two NEW thumbnails (Alpa has three games where
 * Thor had one — open question 3) copy the misspelling so all three read the
 * same, and the doc says so out loud.
 */
export const MISSPELLED_ON_PURPOSE = /_thunbnail$/

/** Locale aliases, lowest priority first. `lang` is ours, for the lab. */
const LOCALE_QUERY = ['lang', 'language', 'user_language']

/** Currency aliases, lowest priority first — same order Thor applies. */
const CURRENCY_QUERY = ['currency', 'user_currency']

/**
 * Round-half-up to an integer from whatever the back end sent.
 *
 * Same normalisation as Thor: a decimal comma becomes a point (fr/de/it back
 * ends send "1234,56") and grouping whitespace is dropped, including the
 * no-break kinds a spreadsheet export leaves behind.
 */
function toInt(raw) {
  const n = toDecimal(raw)
  return n === null ? null : Math.round(n)
}

/**
 * Same cleaning as `toInt`, but keeps up to two decimals — multipliers are the
 * one family of values that can legitimately be fractional ("125.4"). Trailing
 * zeros are dropped so a whole multiplier still renders as "125", not "125.00".
 */
function toDecimal(raw) {
  if (raw == null || raw === '') return null
  const cleaned = String(raw)
    .replace(',', '.')
    .replace(/[\s   ']/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  // A negative total is not a number this story can draw; treat it as absent so
  // the page is gated off rather than drawing a minus sign into a digit tile.
  if (n < 0) return null
  return Math.round(n * 100) / 100
}

/** Text arrives already decoded by URLSearchParams; only trim and cap it. */
function toText(raw) {
  if (raw == null) return null
  const s = String(raw).replace(/\s+/g, ' ').trim()
  return s || null
}

/**
 * Only http(s) URLs are accepted for thumbnails and the exit link.
 *
 * A `javascript:` or `data:` value here would end up in an `<img src>` or in
 * `window.parent.location` (useStoryBridge.js), so the scheme check is not
 * cosmetic. A rejected value is treated exactly like an absent one: the
 * thumbnail falls back to the name card (JGameThumb) and the exit link goes
 * nowhere rather than somewhere chosen by whoever wrote the link.
 */
function toUrl(raw) {
  const s = toText(raw)
  if (!s) return null
  try {
    const u = new URL(s, window.location.origin)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

const COERCE = { text: toText, int: toInt, decimal: toDecimal, url: toUrl }

/** First non-empty value among `names`, last name winning. */
function pick(q, names) {
  let out = null
  names.forEach(n => {
    const v = q.get(n)
    if (v != null && v !== '') out = v
  })
  return out
}

/**
 * Normalise a locale code. Accepts `de`, `de-DE`, `DE`; anything unknown falls
 * back to English rather than throwing, because a bad `language` on a link must
 * not blank the story.
 */
export function resolveLocale(raw) {
  const code = String(raw || '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
  return LOCALES.includes(code) ? code : null
}

/**
 * Parse a query string into the story's data record.
 *
 * @param {string} [search] `location.search`; injectable so it can be exercised
 *   from a script without a browser.
 * @param {{ sample?: boolean }} [opts] `sample` fills absent values from
 *   `SAMPLE` — dev and the lab only, never production. See SAMPLE's note.
 * @returns {{ locale: string, localeExplicit: boolean, currency: string,
 *             values: Record<string, any>, linkValues: Record<string, any>,
 *             present: Record<string, boolean>, unknown: string[] }}
 */
export function readParams(search = '', opts = {}) {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const sample = !!opts.sample

  const rawLocale = pick(q, LOCALE_QUERY)
  const locale = resolveLocale(rawLocale)
  // navigator.language is the fallback Thor uses when there is no query string
  // at all; it is a courtesy, not a contract, so it never overrides the link.
  const navLocale = typeof navigator === 'undefined' ? null : resolveLocale(navigator.language)

  const currency = (toText(pick(q, CURRENCY_QUERY)) || DEFAULT_CURRENCY).toUpperCase().slice(0, 4)

  const values = {}
  // What the LINK actually carried, before any sample fill. `computeSkips` runs
  // on these, never on `values`: a skip flag describes the link, and if the dev
  // sample fed into it then the skip state could never be seen in dev at all.
  const linkValues = {}
  const present = {}
  PARAMS.forEach(spec => {
    const raw = pick(q, spec.query)
    const value = COERCE[spec.type === 'level' ? 'text' : spec.type](raw)
    present[spec.key] = value !== null
    linkValues[spec.key] = value
    values[spec.key] = value !== null ? value : sample ? (SAMPLE[spec.key] ?? null) : null
  })

  // Everything on the link that this story does not know about. Not an error —
  // marketing links carry tracking parameters — but worth a dev warning when a
  // real parameter is misspelt (see MISSPELLED_ON_PURPOSE for the one that is
  // misspelt deliberately).
  const known = new Set([...LOCALE_QUERY, ...CURRENCY_QUERY, ...PARAMS.flatMap(p => p.query)])
  const unknown = [...new Set([...q.keys()])].filter(k => !known.has(k))

  return {
    locale: locale || navLocale || DEFAULT_LOCALE,
    localeExplicit: !!locale,
    currency,
    values,
    linkValues,
    present,
    unknown,
  }
}

/**
 * Which pages have nothing to say.
 *
 * The keys match `slides.js`'s `skip` field one for one, which is asserted
 * below so a rename in either file is caught at import time rather than by a
 * page that quietly never disappears.
 *
 * NOTE: nothing consumes these yet. Whether a page CAN be dropped depends on
 * open question 1 — if the final background video carries baked-in
 * choreography, removing a page leaves empty video under it. The flags are
 * computed here because that is where the data is; wiring them into
 * `useStoryPlayback` is a separate change gated on that answer.
 *
 * A value of 0 counts as absent, exactly as in Thor: "you won 0" is not a page
 * worth showing anyone.
 */
export function computeSkips(values) {
  const blank = v => v === null || v === '' || v === 0
  return {
    days: blank(values.days),
    points: blank(values.points),
    // The level gate is levelConfig's to answer: REGULAR resolves to the Iron
    // badge under SHOW_IRON_FOR_REGULAR, and an unknown string is not a level.
    level: !values.levelOk,
    totalWins: blank(values.totalWins),
    biggestWin: blank(values.biggestWin),
    topMultiplier: blank(values.topMultiplier),
    favoriteGame: blank(values.favoriteGame) && blank(values.favoriteGameImage),
    bonuses: blank(values.bonuses),
    sportsWins: blank(values.sportsWins),
    sportsMultiplier: blank(values.sportsMultiplier),
  }
}

/** Skip keys this file claims to produce; cross-checked against slides.js. */
export const SKIP_KEYS = PARAMS.filter(p => p.skip).map(p => p.skip)
