import { inject, provide } from 'vue'
import en from '@/i18n/en.json'
import fr from '@/i18n/fr.json'
import de from '@/i18n/de.json'
import it from '@/i18n/it.json'
import { readParams, computeSkips, DEFAULT_LOCALE, SKIP_KEYS } from '@/story/params.js'
import { pageLayout } from '@/story/pageLayouts.js'
import { resolveLevel, LEVEL_KEY, LEVEL_BADGES } from '@/story/levelConfig.js'
import { useFormat } from './useFormat.js'

/**
 * The story's data layer: link parameters in, render-ready copy and values out.
 *
 * Modelled on Thor's `useStoryData.js` — same job, same parameter names where
 * they already exist — but assembled rather than mutated. Thor hands the
 * composable eighteen refs from the composition root and writes into them; here
 * the parse happens once and produces one frozen record, because the query
 * string cannot change while the story runs. Nothing in the journal ever
 * re-reads `location.search`, so reactivity would only be ceremony.
 *
 * DISTRIBUTION IS BY provide/inject, NOT PROPS. The 17 pages are rendered by
 * one `<component :is>` in Story.vue and another in Lab.vue (page registry,
 * components/pages/index.js), so props would have to be forwarded through both
 * for every field of every page. `provideStoryData()` is called once in each
 * root and `useStory()` reads it in the page.
 *
 * A page mounted with NO provider still renders: `useStory()` falls back to a
 * lazily built English store. That is what keeps a page usable in isolation and
 * keeps `inject` from warning.
 */

const MESSAGES = { en, fr, de, it }

const KEY = Symbol('alpa-story-data')

/** Walk a dotted path; returns undefined rather than throwing on a gap. */
const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

/**
 * Build the store. Exported for the rare caller that wants one without a Vue
 * component around it (a script, a test harness).
 *
 * @param {{ search?: string, sample?: boolean }} [opts]
 */
export function createStoryData(opts = {}) {
  const search = opts.search ?? (typeof window === 'undefined' ? '' : window.location.search)
  // Sample values fill the gaps in dev so the lab and `npm run dev` still show
  // a designed page with a bare URL. In production an absent parameter stays
  // absent — see SAMPLE in params.js for why a plausible fake is worse.
  const sample = opts.sample ?? !!import.meta.env.DEV

  const parsed = readParams(search, { sample })
  const locale = MESSAGES[parsed.locale] ? parsed.locale : DEFAULT_LOCALE
  const messages = MESSAGES[locale]
  const fmt = useFormat(locale)

  /**
   * Look up copy. Returns whatever the file holds — a string for a single-line
   * slot, an array of lines for a slot the mock breaks explicitly — because
   * that is exactly what JHeading accepts.
   *
   * A missing key falls back to English and then to the path itself, so a
   * half-translated file degrades to English rather than to a blank page.
   * `scripts/check-locales.mjs` is what stops that from shipping.
   */
  const t = path => {
    const hit = at(messages, path)
    if (hit != null) return hit
    const fallback = at(en, path)
    if (fallback != null) {
      if (import.meta.env.DEV) console.warn(`[i18n] ${locale} is missing "${path}"`)
      return fallback
    }
    if (import.meta.env.DEV) console.warn(`[i18n] no such key "${path}"`)
    return path
  }

  const v = parsed.values
  const level = resolveLevel(v.level)

  const raw = { ...v, levelOk: level.ok }
  // Skips read the LINK, not the dev sample — otherwise no skip flag could ever
  // be true while developing, which is precisely when you want to see them.
  //
  // ⚠️ EXCEPT ON A BARE DEV URL, WHICH CARRIES NO LINK AT ALL. Since these flags
  // started dropping pages for real (storyPlan.js), reading an empty link would
  // mean `npm run dev` opens on seven pages out of seventeen and the other ten
  // are simply unreachable — which is not "seeing the skips", it is losing the
  // story you came to look at. So a dev URL with NOTHING on it gets the sample's
  // full deck; a dev URL with even one data parameter is taken at its word and
  // skips the rest, which is how you exercise this deliberately.
  const carriesData = SKIP_KEYS.length > 0 && Object.values(parsed.present).some(Boolean)
  const skip =
    sample && !carriesData
      ? computeSkips({ ...v, levelOk: level.ok })
      : computeSkips({
          ...parsed.linkValues,
          levelOk: resolveLevel(parsed.linkValues.level).ok,
        })

  /**
   * Render-ready fields. Numbers are already strings here so a page never has
   * to decide between the grouped form and the tile form — that decision is the
   * mock's and it is made once, next to the slot it belongs to:
   *
   *   tiles*  ungrouped digits for JDigitTiles (31-pages.md: the mock's rows
   *           have one cell per digit and no separator cells at all);
   *   points  grouped with U+202F for the one JValue that shows a number.
   */
  const data = {
    name: v.name || '',
    days: fmt.tiles(v.days),
    packs: fmt.tiles(v.days),
    points: fmt.grouped(v.points),
    levelBadge: level.badge || LEVEL_BADGES.IRON,
    // Proprietary nouns; identical in all four files by design and listed in
    // check-locales' identical-allowed set.
    levelName: level.ok ? t(LEVEL_KEY[level.level] || 'levels.iron') : '',
    totalWins: fmt.tiles(v.totalWins),
    biggestWin: fmt.tiles(v.biggestWin),
    biggestWinGame: v.biggestWinGame || '',
    biggestWinGameImage: v.biggestWinGameImage || '',
    topMultiplier: fmt.tiles(v.topMultiplier),
    topMultiplierGame: v.topMultiplierGame || '',
    topMultiplierGameImage: v.topMultiplierGameImage || '',
    favoriteGame: v.favoriteGame || '',
    favoriteGameImage: v.favoriteGameImage || '',
    bonuses: fmt.tiles(v.bonuses),
    sportsWins: fmt.tiles(v.sportsWins),
    sportsMultiplier: fmt.tiles(v.sportsMultiplier),
    currency: fmt.currency(parsed.currency),
    promocode: v.promocode || '',
    bonusLabel: v.bonusLabel || '',
    finalLink: v.finalLink || '',
  }

  if (import.meta.env.DEV && parsed.unknown.length) {
    console.warn('[stories] link carries parameters this story does not read:', parsed.unknown)
  }

  const store = {
    locale,
    localeExplicit: parsed.localeExplicit,
    t,
    fmt,
    data: Object.freeze(data),
    raw: Object.freeze(raw),
    skip: Object.freeze(skip),
    present: parsed.present,
    /** Layout behaviour for a page's slots, ADR-0007. */
    layout: page => pageLayout(page, locale),
  }

  if (import.meta.env.DEV) {
    window.__story = window.__story || {}
    window.__story.data = store
  }

  return Object.freeze(store)
}

/** Call once per composition root (Story.vue, Lab.vue). */
export function provideStoryData(opts) {
  const store = createStoryData(opts)
  provide(KEY, store)
  return store
}

let orphan = null

/**
 * Read the store from a page. Falls back to a store built from the URL with no
 * provider above — which is what a page rendered on its own gets.
 */
export function useStory() {
  const injected = inject(KEY, null)
  if (injected) return injected
  orphan = orphan || createStoryData()
  return orphan
}
