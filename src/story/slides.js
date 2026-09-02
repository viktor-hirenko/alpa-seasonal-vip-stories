import { snap } from './timing.js'

/**
 * THE join table. Figma storyboard frame -> timecode -> page -> pose -> face.
 *
 * `frame` is carried purely for traceability back to the mock: when the designer
 * says "frame 14 sits too low", you grep for `frame: 14`.
 *
 * Poses were solved analytically from the `Component 17` AABB in each 1080x1920
 * storyboard frame by inverting
 *   W = s * (w0*|cos t| + h0*|sin t|)
 *   H = s * (w0*|sin t| + h0*|cos t|)
 * against the base component size. Residual <= 3e-5 on every frame, so the
 * "flat rotation + uniform scale" model is exact.
 *
 * `rot` is already in CSS `rotate()` terms (positive = clockwise). The sign does
 * NOT come out of the AABB solve — it was read off screenshots of frames
 * 21770:4645 / 4739 / 4760 / 4885, where the text lines and the journal's top
 * edge run down-to-the-right on every one. See _context/32-poses.md.
 *
 * `cx` / `cy` are the journal centre as a percentage of the stage. They feed
 * GSAP's xPercent/yPercent on `.journal-pos`, which is 100%x100% of the stage —
 * so these numbers drop in verbatim and stay correct at every viewport.
 *
 * @typedef {{ rot: number, scale: number, cx: number, cy: number }} Pose
 * @typedef {{ frame: number, at: number, page: string, face: 'cover'|'page',
 *             pose: Pose, skip?: string }} Slide
 */

/** @type {Slide[]} */
const RAW = [
  { frame: 4, at: 2.5, page: 'cover', face: 'cover', pose: { rot: 22.95, scale: 1.291, cx: 142.2, cy: 159.1 } },
  { frame: 5, at: 3.3, page: 'cover', face: 'cover', pose: { rot: 22.95, scale: 0.589, cx: 72.4, cy: 92.7 } },
  { frame: 6, at: 4.6, page: 'cover', face: 'cover', pose: { rot: 7.8, scale: 0.714, cx: 67.5, cy: 48.9 } },
  { frame: 7, at: 6.0, page: 'cover', face: 'cover', pose: { rot: 3.1, scale: 0.746, cx: 57.7, cy: 48.7 } },

  { frame: 8, at: 11.07, page: 'editors_note', face: 'page', pose: { rot: 3.1, scale: 0.683, cx: 57.4, cy: 47.8 } },
  { frame: 9, at: 17.1, page: 'days_in_spotlight', face: 'page', pose: { rot: 4.15, scale: 0.682, cx: 49.4, cy: 54.9 }, skip: 'days' },
  { frame: 10, at: 22.07, page: 'seasonal_power', face: 'page', pose: { rot: 7.1, scale: 0.682, cx: 64.3, cy: 50.8 }, skip: 'points' },
  { frame: 11, at: 26.07, page: 'vip_status', face: 'page', pose: { rot: 12.9, scale: 0.682, cx: 49.5, cy: 63.1 }, skip: 'level' },
  { frame: 12, at: 30.1, page: 'money_talks', face: 'page', pose: { rot: 12.75, scale: 0.682, cx: 75.8, cy: 50.8 }, skip: 'totalWins' },
  { frame: 13, at: 34.07, page: 'headline_win', face: 'page', pose: { rot: 7.05, scale: 0.681, cx: 49.5, cy: 63.1 }, skip: 'biggestWin' },
  { frame: 14, at: 39.07, page: 'multiplier_moment', face: 'page', pose: { rot: 2.75, scale: 0.681, cx: 54.8, cy: 50.0 }, skip: 'topMultiplier' },
  { frame: 15, at: 44.03, page: 'players_pick', face: 'page', pose: { rot: 2.75, scale: 0.681, cx: 54.8, cy: 56.5 }, skip: 'favoriteGame' },
  { frame: 16, at: 49.1, page: 'bonus_report', face: 'page', pose: { rot: 6.3, scale: 0.681, cx: 46.9, cy: 53.9 }, skip: 'bonuses' },
  { frame: 17, at: 53.27, page: 'sports_desk', face: 'page', pose: { rot: 4.35, scale: 0.681, cx: 56.3, cy: 51.0 }, skip: 'sportsWins' },
  { frame: 18, at: 57.07, page: 'top_sport_signal', face: 'page', pose: { rot: 4.35, scale: 0.681, cx: 56.3, cy: 51.0 }, skip: 'sportsMultiplier' },
  { frame: 19, at: 61.1, page: 'sponsor', face: 'page', pose: { rot: 4.37, scale: 0.681, cx: 56.31, cy: 52.48 } },
  { frame: 20, at: 67.07, page: 'space_milk', face: 'page', pose: { rot: 3.53, scale: 0.681, cx: 50.25, cy: 53.48 } },
  { frame: 21, at: 73.07, page: 'joke', face: 'page', pose: { rot: 3.53, scale: 0.681, cx: 50.25, cy: 51.66 } },
  { frame: 22, at: 78.07, page: 'gift', face: 'page', pose: { rot: 1.65, scale: 0.681, cx: 52.0, cy: 47.3 } },
  { frame: 23, at: 83.03, page: 'final', face: 'page', pose: { rot: 1.65, scale: 0.681, cx: 52.0, cy: 50.2 } },
  // Frame 24 is not a page change — it is where the Final page's recede pose
  // lands. Kept in the table so `recede` has a target to tween to.
  { frame: 24, at: 85.0, page: 'final', face: 'page', pose: { rot: 20.4, scale: 0.444, cx: 48.6, cy: 64.5 } },
]

/** Timecodes snapped to the 30 fps grid on read (ADR-0009). */
export const SLIDES = RAW.map(s => ({ ...s, at: snap(s.at) }))

/** The 17 distinct journal pages, in story order. */
export const PAGE_ORDER = SLIDES.reduce(
  (acc, s) => (acc.includes(s.page) ? acc : [...acc, s.page]),
  [],
)

/** Pose of the recede target, by frame number, for the presets. */
export const slideByFrame = n => SLIDES.find(s => s.frame === n)
