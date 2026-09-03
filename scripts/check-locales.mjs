#!/usr/bin/env node
/**
 * Gate for the copy files. `npm run check-locales`.
 *
 * The four JSONs in src/i18n belong to the translators and WILL be re-issued
 * when the copywriting is revised (ADR-0007 is explicit that no layout number
 * may live in them for exactly this reason). A re-issue is where a key goes
 * missing, an array of lines comes back as one long string, or a page ships in
 * English because someone forgot a block. None of that shows up in `npm run
 * build` — Vite is happy to bundle a JSON with a hole in it — and the fitter
 * will happily set the English fallback at the right size. So it is checked
 * here instead, and the checks are the ones that have a failure mode:
 *
 *   1. KEY PARITY. Every leaf path in en.json exists in all four, and no file
 *      carries a key the others do not.
 *   2. SHAPE PARITY. A key is a string in every file or an array in every file.
 *      JHeading accepts both, so a shape change is silent: a slot the mock
 *      breaks over three lines would render as one long line and simply get
 *      shrunk by useJournalFit until it fit. The LINE COUNT may differ between
 *      languages — that is the whole point of authored breaks — only the type
 *      may not.
 *   3. NON-EMPTY, TRIMMED. An empty string renders an empty slot; leading or
 *      trailing space changes measured width and therefore the fitted size.
 *   4. PLACEHOLDER PARITY. Any {token} in the English string must appear in the
 *      other three. Nothing uses one today — the mock keeps every number in its
 *      own slot — but a copy revision that introduces one must not lose it.
 *   5. UNTRANSLATED VALUES. A value byte-identical to English is reported,
 *      except where it is legitimately the same word. The allowlist below is
 *      the list of those, and it is short on purpose.
 *   6. CROSS-CHECKS against the code: every page in slides.js has a copy
 *      namespace, every namespace is a real page, every layout record in
 *      pageLayouts.js names a page that exists, and params.js's skip keys are
 *      exactly the ones slides.js gates on.
 *
 * Exit code 1 on any error. Warnings (untranslated values, unknown extras) do
 * not fail the build on their own.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => JSON.parse(readFileSync(join(root, rel), 'utf8'))

const { LOCALES, DEFAULT_LOCALE, SKIP_KEYS } = await import('../src/story/params.js')
const { PAGE_ORDER, SLIDES } = await import('../src/story/slides.js')
const { PAGE_LAYOUTS } = await import('../src/story/pageLayouts.js')

const files = Object.fromEntries(LOCALES.map(l => [l, read(`src/i18n/${l}.json`)]))
const base = files[DEFAULT_LOCALE]

/**
 * Values that are ALLOWED to be identical to English.
 *
 * `levels.*`  VIP tier names are proprietary nouns; the mock shows Iron /
 *             Bronze / Silver / Gold / Platinum / Diamond in all four variants
 *             (_context/31-pages.md).
 * `*.vip_club`, `*.journal`  the masthead. Identical in all four cover
 *             variants (21770:2749 / 2767 / 2785 / 2803).
 * The three Italian chips are the designer's own choice: "Bonus Report",
 * "Sports Desk" and "Top Sport Signal" are left in English in variant 4 of
 * their sets (21770:3809 / 3949's Tabs / 4101's Tabs).
 */
const IDENTICAL_ALLOWED = new Set([
  'levels.iron',
  'levels.bronze',
  'levels.silver',
  'levels.gold',
  'levels.platinum',
  'levels.diamond',
  'pages.cover.vip_club',
  'pages.cover.journal',
  'it:pages.bonus_report.chip',
  'it:pages.sports_desk.chip',
  'it:pages.top_sport_signal.chip',
])

const errors = []
const warnings = []
const err = m => errors.push(m)
const warn = m => warnings.push(m)

/** Every leaf path in a copy file, as `a.b.c`. `$`-prefixed keys are metadata. */
function paths(obj, prefix = '') {
  const out = []
  Object.keys(obj).forEach(k => {
    if (k.startsWith('$')) return
    const p = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...paths(v, p))
    else out.push(p)
  })
  return out
}

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

const shape = v => (Array.isArray(v) ? 'array' : typeof v)

const placeholders = v =>
  [...String(Array.isArray(v) ? v.join(' ') : v).matchAll(/\{[a-z_]+\}/gi)]
    .map(m => m[0])
    .sort()
    .join(',')

// ---------------------------------------------------------------- 1-5, copy

const basePaths = paths(base)

LOCALES.forEach(loc => {
  const file = files[loc]
  if (file.$locale !== loc) err(`${loc}.json: $locale is "${file.$locale}", expected "${loc}"`)

  const own = new Set(paths(file))
  basePaths.forEach(p => {
    if (!own.has(p)) err(`${loc}.json: missing "${p}"`)
  })
  own.forEach(p => {
    if (!basePaths.includes(p))
      err(`${loc}.json: has "${p}", which ${DEFAULT_LOCALE}.json does not`)
  })
})

basePaths.forEach(p => {
  const ref = at(base, p)
  const refShape = shape(ref)
  if (refShape !== 'string' && refShape !== 'array') {
    err(
      `${DEFAULT_LOCALE}.json: "${p}" is a ${refShape}; copy must be a string or an array of lines`,
    )
    return
  }

  LOCALES.forEach(loc => {
    const v = at(files[loc], p)
    if (v === undefined) return // already reported above

    if (shape(v) !== refShape) {
      err(`${loc}.json: "${p}" is a ${shape(v)} but ${DEFAULT_LOCALE}.json has a ${refShape}`)
      return
    }

    const lines = Array.isArray(v) ? v : [v]
    if (!lines.length) err(`${loc}.json: "${p}" is an empty array`)
    lines.forEach((line, i) => {
      const where = Array.isArray(v) ? `${p}[${i}]` : p
      if (typeof line !== 'string') {
        err(`${loc}.json: "${where}" is a ${typeof line}, expected a string`)
        return
      }
      if (!line.trim()) err(`${loc}.json: "${where}" is empty`)
      else if (line !== line.trim())
        err(
          `${loc}.json: "${where}" has leading or trailing whitespace, which changes its measured width`,
        )
    })

    if (placeholders(v) !== placeholders(ref))
      err(
        `${loc}.json: "${p}" placeholders ${placeholders(v) || '(none)'} do not match ` +
          `${DEFAULT_LOCALE}'s ${placeholders(ref) || '(none)'}`,
      )

    if (loc !== DEFAULT_LOCALE && JSON.stringify(v) === JSON.stringify(ref)) {
      if (!IDENTICAL_ALLOWED.has(p) && !IDENTICAL_ALLOWED.has(`${loc}:${p}`))
        warn(`${loc}.json: "${p}" is identical to ${DEFAULT_LOCALE} — untranslated?`)
    }
  })
})

// ------------------------------------------------------------ 6, cross-checks

const copyPages = Object.keys(base.pages || {})
PAGE_ORDER.forEach(page => {
  if (!copyPages.includes(page)) err(`no copy namespace "pages.${page}" for the page in slides.js`)
})
copyPages.forEach(page => {
  if (!PAGE_ORDER.includes(page)) err(`copy has "pages.${page}", which is not a page in slides.js`)
})
Object.keys(PAGE_LAYOUTS).forEach(page => {
  if (!PAGE_ORDER.includes(page))
    err(`pageLayouts.js has "${page}", which is not a page in slides.js`)
})

const slideSkips = [...new Set(SLIDES.map(s => s.skip).filter(Boolean))].sort()
const paramSkips = [...new Set(SKIP_KEYS)].sort()
if (slideSkips.join(',') !== paramSkips.join(','))
  err(
    `skip keys disagree: slides.js gates on [${slideSkips}] but params.js produces [${paramSkips}]`,
  )

// ------------------------------------------------------------------- report

const pagesWithCopy = copyPages.length
const keys = basePaths.length

warnings.forEach(w => console.warn(`  warn  ${w}`))
errors.forEach(e => console.error(`  ERROR ${e}`))

if (errors.length) {
  console.error(`\ncheck-locales: ${errors.length} error(s) across ${LOCALES.length} files.`)
  process.exit(1)
}

console.log(
  `check-locales: ${LOCALES.join('/')} — ${keys} keys x ${LOCALES.length} files, ` +
    `${pagesWithCopy}/${PAGE_ORDER.length} pages covered, ` +
    `${warnings.length} warning(s), 0 errors.`,
)
