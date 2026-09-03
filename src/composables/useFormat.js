/**
 * Number formatting for the journal.
 *
 * Two rules decide everything here, and both come from the mock rather than
 * from a locale database.
 *
 * 1. THE DIGIT TILES TAKE UNGROUPED DIGITS. Measured in _context/31-pages.md:
 *    Bonus Report's `Numbers` frame is 1337.967 wide with exactly SEVEN tiles
 *    for a seven-digit value — there are no separator cells in the mock at all.
 *    So `tiles()` strips grouping, and JDigitTiles' separator handling stays
 *    what it is, a safety net rather than a path anyone takes.
 *
 * 2. THE GROUPED VALUE USES SPACES IN EVERY LANGUAGE. Seasonal Power's value
 *    node reads "1 200 000" byte-for-byte in all four variants (21770:3046 /
 *    3064 / 3082 / 3100). `Intl.NumberFormat('de')` would render that as
 *    "1.200.000" and `('it')` the same — which a player reads as a decimal
 *    point, and which no variant of the mock shows. So grouping is a NARROW
 *    NO-BREAK SPACE (U+202F) regardless of locale: it is the mock's own
 *    typography, it cannot be mistaken for a decimal mark, and it will not let
 *    a group wrap onto the next line.
 *
 * The decimal mark is the one place the locale does get a vote, because there
 * a comma and a point mean opposite things and a multiplier is the only value
 * that can carry one.
 */

/** U+202F. Not a plain space: a plain one is a line-break opportunity. */
const GROUP = ' '

const DECIMAL_COMMA = new Set(['fr', 'de', 'it'])

const isNum = v => typeof v === 'number' && Number.isFinite(v)

/**
 * @param {string} locale one of params.js LOCALES
 */
export function useFormat(locale = 'en') {
  const decimalMark = DECIMAL_COMMA.has(locale) ? ',' : '.'

  /** Split an integer into 3-digit groups joined by U+202F. */
  const group = n => String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)

  /**
   * Grouped value for a JValue slot — Seasonal Power's "1 200 000".
   * Returns '' for an absent value so the slot renders empty rather than "0".
   */
  const grouped = v => (isNum(v) ? group(v) : '')

  /**
   * Digits for a JDigitTiles row: no grouping, no currency, no sign.
   * A fractional multiplier keeps its mark, and the tile row draws that mark as
   * a gap-only cell (see JDigitTiles).
   */
  const tiles = v => {
    if (!isNum(v)) return ''
    const abs = Math.abs(v)
    if (Number.isInteger(abs)) return String(abs)
    // toFixed(2) then trim, rather than arithmetic on the fraction: (1.15 - 1)
    // * 100 is 15.000000000000013, and every hand-rolled version of this ends
    // up rediscovering that.
    const s = abs.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return s.replace('.', decimalMark)
  }

  /**
   * Currency CODE, not a symbol: every currency node in the mock is a
   * three-letter code set in the accent gradient (21770:3204 and friends), and
   * JCurrency renders exactly that.
   */
  const currency = code => String(code || '').toUpperCase()

  return { grouped, tiles, currency, decimalMark, GROUP }
}
