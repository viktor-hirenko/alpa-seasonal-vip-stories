import { FLY_OBJECTS } from './flyObjects.js'

/**
 * URL registry for the flying-object art.
 *
 * A glob rather than 20 import lines: the set is data-driven (flyObjects.js
 * names a sprite by slug) and the whole folder is rebuilt in one go by
 * scripts/fly-sprites.mjs whenever the designer re-exports. Vite resolves the
 * glob at build time, so this is still hashed, tree-shaken URLs — not a runtime
 * fetch.
 *
 * The folder holds SPRITES, not raw Figma exports: one object per file, cropped
 * square around its own alpha. Three of the raw exports are groups (three
 * sparkles in `points-a`, five coins in `cash-a`, a mug and a saucer in `cup`)
 * and in the clip those fly one at a time, so a record naming the group drew a
 * cluster where the reference has a single object. See the header of
 * scripts/fly-sprites.mjs.
 *
 * The art carries NO rim glow; the magenta halo in the video was a separate
 * image fill stacked with the opaque navy backdrop we had to discard. It is
 * re-created in CSS on `.fly-obj__art` (_fly.scss).
 */
const files = import.meta.glob('../assets/objects/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** slug -> url, e.g. `spark` -> `/assets/spark.<hash>.webp`. */
export const OBJECT_URL = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [
    path
      .split('/')
      .pop()
      .replace(/\.webp$/, ''),
    url,
  ]),
)

/**
 * Flights whose art actually exists. A record naming a sprite that is missing
 * is dropped rather than rendered blank, and says so in dev — the set is
 * data-driven, so a typo in the table is otherwise a silent no-op.
 */
export const FLIGHTS = FLY_OBJECTS.filter(r => OBJECT_URL[r.asset])

if (import.meta.env.DEV) {
  const missing = [...new Set(FLY_OBJECTS.filter(r => !OBJECT_URL[r.asset]).map(r => r.asset))]
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(`[fly] no art for ${missing.join(', ')} — those flights are skipped`)
  }
}
