import ironBadge from '@/assets/levels/iron.webp'
import bronzeBadge from '@/assets/levels/bronze.webp'
import silverBadge from '@/assets/levels/silver.webp'
import goldBadge from '@/assets/levels/gold.webp'
import platinumBadge from '@/assets/levels/platinum.webp'
import diamondBadge from '@/assets/levels/diamond.webp'

/**
 * VIP levels. Same contract as Thor's levelConfig.js, different artwork: Alpa
 * uses 3D club-suit emblems in six materials rather than cubes.
 *
 * Badge -> level mapping was established three ways (see _context/40-open-questions.md #4):
 * the six nodes sit at a regular 700 px x-pitch in the components section under
 * "VIP-LEVELS Season Andromeda Galaxy"; three of them are unambiguous by
 * material (bronze 21770:2677, gold 2679, diamond 2681); and the reference video
 * shows the matte-silver one (2678) under the SILVER label, which pins the
 * middle. So x-order == level order.
 */

/** Thor season 2 behaviour: REGULAR players see the Iron badge rather than
 *  having the scene skipped. Flip to false to skip instead. */
export const SHOW_IRON_FOR_REGULAR = true

export const LEVEL_BADGES = {
  IRON: ironBadge, // 21770:2676 — iridescent pearl
  BRONZE: bronzeBadge, // 21770:2677 — copper
  SILVER: silverBadge, // 21770:2678 — matte silver
  GOLD: goldBadge, // 21770:2679 — gold
  PLATINUM: platinumBadge, // 21770:2680 — blue-white chrome
  DIAMOND: diamondBadge, // 21770:2681 — pink crystal
}

/** i18n key per level. Level names are proprietary nouns and are NOT translated. */
export const LEVEL_KEY = {
  IRON: 'levels.iron',
  REGULAR: 'levels.iron',
  BRONZE: 'levels.bronze',
  SILVER: 'levels.silver',
  GOLD: 'levels.gold',
  PLATINUM: 'levels.platinum',
  DIAMOND: 'levels.diamond',
}

/**
 * @param {string|undefined} raw value of the `level` query param
 * @returns {{ ok: boolean, badge?: string, key?: string, level?: string }}
 */
export const resolveLevel = raw => {
  const lv = String(raw || '')
    .trim()
    .toUpperCase()
  if (!lv) return { ok: false }

  if (lv === 'REGULAR') {
    return SHOW_IRON_FOR_REGULAR
      ? { ok: true, badge: LEVEL_BADGES.IRON, key: LEVEL_KEY.REGULAR, level: 'IRON' }
      : { ok: false }
  }

  if (LEVEL_BADGES[lv]) {
    return { ok: true, badge: LEVEL_BADGES[lv], key: LEVEL_KEY[lv], level: lv }
  }

  console.warn('[stories] unknown level value:', raw)
  return { ok: false }
}
