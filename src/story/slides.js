import { snap, TIMING } from './timing.js'

/**
 * THE join table. Figma storyboard frame -> timecode -> page -> face.
 *
 * `frame` is carried purely for traceability back to the mock: when the designer
 * says "frame 14 sits too low", you grep for `frame: 14`.
 *
 * THERE IS NO `pose` COLUMN ANY MORE, and that is the whole point of this file's
 * rewrite. A slide used to carry one pose and `rePose` moved between them in
 * half a second, leaving the journal parked for the other four or five. The clip
 * never parks it: measured across every slide, its journal drifts the whole way
 * through. So the pose is a path now, sampled off the clip half a second at a
 * time, and it lives in JOURNAL_PATH below.
 *
 * @typedef {{ frame: number, at: number, page: string, face: 'cover'|'page',
 *             skip?: string }} Slide
 */

/** @type {Slide[]} */
// prettier-ignore — one line per slide keeps this readable AS A TABLE, which is
// the whole point of the file; it is also the shape the lab's "copy as data"
// button emits and the shape scripts/probe.mjs greps.
const RAW = [
  { frame: 4, at: 2.5, page: 'cover', face: 'cover' },
  { frame: 5, at: 3.3, page: 'cover', face: 'cover' },
  { frame: 6, at: 4.6, page: 'cover', face: 'cover' },
  { frame: 7, at: 6.0, page: 'cover', face: 'cover' },

  { frame: 8, at: 11.07, page: 'editors_note', face: 'page' },
  { frame: 9, at: 17.1, page: 'days_in_spotlight', face: 'page', skip: 'days' },
  { frame: 10, at: 22.07, page: 'seasonal_power', face: 'page', skip: 'points' },
  { frame: 11, at: 26.07, page: 'vip_status', face: 'page', skip: 'level' },
  { frame: 12, at: 30.1, page: 'money_talks', face: 'page', skip: 'totalWins' },
  { frame: 13, at: 34.07, page: 'headline_win', face: 'page', skip: 'biggestWin' },
  { frame: 14, at: 39.07, page: 'multiplier_moment', face: 'page', skip: 'topMultiplier' },
  { frame: 15, at: 44.03, page: 'players_pick', face: 'page', skip: 'favoriteGame' },
  { frame: 16, at: 49.1, page: 'bonus_report', face: 'page', skip: 'bonuses' },
  { frame: 17, at: 53.27, page: 'sports_desk', face: 'page', skip: 'sportsWins' },
  { frame: 18, at: 57.07, page: 'top_sport_signal', face: 'page', skip: 'sportsMultiplier' },
  { frame: 19, at: 61.1, page: 'sponsor', face: 'page' },
  { frame: 20, at: 67.07, page: 'space_milk', face: 'page' },
  { frame: 21, at: 73.07, page: 'joke', face: 'page' },
  { frame: 22, at: 78.07, page: 'gift', face: 'page' },
  { frame: 23, at: 83.03, page: 'final', face: 'page' },
  // Frame 24 is not a page change — it is where the Final page's recede pose
  // lands. Kept in the table so the story has a row to hang RECEDE_POSE on.
  { frame: 24, at: 85.0, page: 'final', face: 'page' },
]

/**
 * WHERE THE JOURNAL DRAWS BACK TO before the flash, frames 23 -> 24.
 *
 * Still one pose rather than a stretch of the path: this is the outro, the clip
 * yaws the journal hard through it, and four numbers do not describe that. It is
 * the storyboard's own value, and _context/35-slide-audit.md records that it
 * misses the mock by 137 px — an open defect, not a measurement.
 */
export const RECEDE_POSE = { rot: 20.4, scale: 0.444, cx: 48.6, cy: 64.5 }

/**
 * THE JOURNAL'S PATH — its pose, half a second at a time, measured off the clip.
 *
 *   [t, rot, scale, cx, cy]
 *     t      absolute video seconds, the same clock as flyObjects.js
 *     rot    in-plane angle, CSS `rotate()` terms (positive = clockwise)
 *     scale  uniform scale of the journal box
 *     cx/cy  the journal's CENTRE as a percentage of the stage
 *
 * Read through the shared Hermite reader (src/journal3d/hermite.js), the same
 * one the flight table is read through: it passes exactly through every measured
 * row and its velocity is continuous, so nothing snaps at a row.
 *
 * WHY THIS EXISTS. The old table held ONE pose per slide, `rePose` moved between
 * them in half a second, and for the remaining four or five seconds the journal
 * stood still. The clip does not: two frames 3 s apart inside frame 14, with the
 * page unchanged, put its journal 60-150 design px apart and at a different
 * angle, while ours had moved 20 px. The owner's words for it were "in the video
 * the journal levitates after the page turn and ours just sits there".
 *
 * HOW IT WAS MEASURED, and this is the part to read before trusting a column.
 * `npm run clip:fit -- --t <seconds>` registers our journal against the clip's
 * and prints the clip's pose in these very units; `scripts/journal-path.mjs`
 * reduces that run to these rows. The registration aligns the page's TYPE AND
 * ART, which is what the picture has most of — so it measures where the
 * CONTENT is, not where the frame is, and our layout is not the clip's edition
 * (frame 14: our heading takes two lines with the digit tiles under it, the
 * clip's takes three with the tiles beside it). Therefore:
 *
 *   - `rot` is ABSOLUTE, from the clip. A layout difference shifts and resizes
 *     content inside the page; it cannot rotate it. Checked by eye: with the
 *     clip's angle our outline runs parallel to the clip's page edge, and with
 *     the old table's angle it crosses that edge diagonally
 *     (`_refs/fit/pose-outline-1242.png` against `-1242b.png`).
 *   - `scale`, `cx` and `cy` carry the clip's MOTION added to the storyboard's
 *     anchor for that slide. The motion is sound — content is rigidly attached
 *     to the page, so content motion is page motion — while the absolute values
 *     are not yet separable from our own layout error.
 *
 * SO WHAT IS STILL WRONG HERE, said plainly: the clip puts the journal further
 * LEFT and SMALLER than the storyboard does, by roughly 40-75 design px on the
 * frames looked at, and this table does not carry that. It also has no yaw
 * column, and the clip has a yaw of about 8 degrees on a settled slide, measured
 * from the divergence of its top and bottom page edges (6-7 degrees, against a
 * calibration of exactly 6.0 degrees at rotationY = 8 on our own render). Both
 * are the next session's work — see _context/90-next-session.md.
 *
 * The seconds between a slide's last row and the next slide's first are NOT
 * measured: the journal is edge-on through the turn and four numbers do not
 * describe it there. The spline interpolates, which is what the old half-second
 * `rePose` did too, only smoothly.
 */
// prettier-ignore
export const JOURNAL_PATH = [
  // frame 7 cover
  [6.00, 3.10, 0.7460, 57.70, 48.70],
  [6.97, 3.10, 0.7460, 57.70, 48.70],
  [7.47, 5.10, 0.7527, 55.76, 48.91],
  [7.97, 6.85, 0.7382, 55.29, 47.76],
  [8.47, 8.10, 0.7182, 55.57, 47.14],
  [8.97, 8.60, 0.7130, 55.01, 47.50],
  [9.47, 8.35, 0.7261, 52.70, 48.34],
  [9.97, 7.35, 0.7470, 52.33, 49.27],
  [10.97, 5.35, 0.7515, 57.33, 49.64],
  // frame 8 editors_note
  [12.04, 3.10, 0.6830, 57.40, 47.80],
  [12.54, 2.85, 0.6648, 58.23, 46.50],
  [13.04, 2.10, 0.6579, 61.47, 45.66],
  [13.54, 1.10, 0.6649, 64.07, 45.56],
  [14.04, 0.10, 0.6791, 63.60, 46.45],
  [14.54, -0.65, 0.6843, 60.83, 47.28],
  [15.04, -1.15, 0.6764, 57.86, 47.28],
  [15.54, -1.90, 0.6633, 57.31, 46.39],
  [16.04, -2.40, 0.6524, 55.92, 44.67],
  [16.54, -2.40, 0.6495, 53.79, 43.79],
  [17.04, -2.40, 0.6537, 52.49, 44.31],
  // frame 9 days_in_spotlight
  [18.07, 4.15, 0.6820, 49.40, 54.90],
  [18.57, 2.90, 0.6791, 53.29, 54.48],
  [19.07, 1.40, 0.6618, 53.10, 54.80],
  [19.57, -0.10, 0.6470, 50.05, 56.41],
  [20.07, -1.10, 0.6470, 45.14, 58.18],
  [20.57, -1.35, 0.6636, 41.53, 58.75],
  [21.07, -1.10, 0.6826, 40.79, 58.08],
  [21.57, -0.60, 0.6870, 41.81, 57.56],
  // frame 10 seasonal_power
  [23.04, 7.10, 0.6820, 64.30, 50.80],
  [23.54, 7.35, 0.6913, 62.17, 49.71],
  [24.04, 8.10, 0.6862, 61.34, 47.57],
  [24.54, 9.10, 0.6730, 63.56, 46.63],
  [25.04, 10.10, 0.6619, 67.91, 47.94],
  [25.54, 10.60, 0.6630, 71.15, 50.38],
  // frame 11 vip_status
  [27.04, 12.90, 0.6820, 49.50, 63.10],
  [27.54, 14.65, 0.6925, 45.24, 60.70],
  [28.04, 16.40, 0.7195, 39.31, 60.39],
  [28.54, 17.90, 0.7389, 35.43, 62.68],
  [29.04, 19.15, 0.7411, 35.70, 66.17],
  [29.54, 19.65, 0.7291, 37.83, 67.27],
  // frame 12 money_talks
  [31.07, 12.75, 0.6820, 75.80, 50.80],
  [31.57, 13.25, 0.6872, 77.10, 49.55],
  [32.07, 13.25, 0.6925, 76.82, 49.34],
  [32.57, 13.00, 0.6978, 75.61, 50.49],
  [33.07, 12.50, 0.6989, 74.69, 52.73],
  [33.57, 11.75, 0.6959, 74.87, 54.55],
  // frame 13 headline_win
  [35.04, 7.05, 0.6810, 49.50, 63.10],
  [35.54, 6.05, 0.6903, 51.26, 62.48],
  [36.04, 4.30, 0.6915, 55.43, 61.17],
  [36.54, 2.05, 0.6781, 57.56, 59.71],
  [37.04, -0.20, 0.6538, 56.17, 58.78],
  [37.54, -2.20, 0.6380, 53.76, 58.46],
  [38.04, -3.70, 0.6410, 51.81, 57.21],
  [38.54, -4.70, 0.6624, 51.81, 56.38],
  // frame 14 multiplier_moment
  [40.04, 2.75, 0.6810, 54.80, 50.00],
  [40.54, 2.00, 0.6690, 51.10, 49.64],
  [41.04, 1.75, 0.6610, 48.60, 46.67],
  [41.54, 2.00, 0.6652, 49.15, 43.80],
  [42.04, 2.50, 0.6754, 52.58, 42.34],
  [42.54, 3.50, 0.6766, 55.54, 42.24],
  [43.04, 4.50, 0.6676, 56.00, 42.92],
  [43.54, 5.75, 0.6578, 54.80, 42.71],
  // frame 15 players_pick
  [45.00, 2.75, 0.6810, 54.80, 56.50],
  [45.50, 4.25, 0.6679, 54.80, 58.53],
  [46.00, 6.25, 0.6590, 56.56, 60.04],
  [46.50, 8.50, 0.6640, 58.13, 60.51],
  [47.00, 10.50, 0.6820, 56.93, 59.78],
  [48.00, 13.00, 0.7082, 49.71, 58.06],
  [48.50, 13.25, 0.7115, 49.89, 57.23],
  [49.00, 13.00, 0.6987, 52.39, 56.81],
  // frame 16 bonus_report
  [50.07, 6.30, 0.6810, 46.90, 53.90],
  [50.57, 8.05, 0.6874, 48.47, 56.82],
  [51.07, 10.05, 0.6906, 48.01, 58.80],
  [51.57, 11.55, 0.6835, 45.51, 58.43],
  [52.07, 12.55, 0.6794, 43.10, 54.79],
  [52.57, 13.05, 0.6826, 42.64, 50.88],
  // frame 17 sports_desk
  [54.24, 4.35, 0.6810, 56.30, 51.00],
  [54.74, 5.35, 0.6708, 60.47, 52.82],
  [55.24, 6.85, 0.6690, 61.67, 54.85],
  [55.74, 8.60, 0.6701, 58.15, 56.78],
  [56.24, 9.85, 0.6712, 50.93, 58.03],
  [56.74, 10.85, 0.6722, 46.02, 58.14],
  // frame 18 top_sport_signal
  [58.04, 4.35, 0.6810, 56.30, 51.00],
  [58.54, 5.35, 0.6935, 58.15, 51.31],
  [59.04, 6.85, 0.7071, 58.61, 49.80],
  [59.54, 8.35, 0.7156, 59.26, 47.56],
  [60.04, 9.85, 0.7211, 57.50, 47.04],
  [60.54, 11.85, 0.7254, 53.80, 48.14],
  // frame 19 sponsor
  [62.07, 4.37, 0.6810, 56.31, 52.48],
  [62.57, 4.87, 0.6711, 56.87, 50.71],
  [63.07, 6.12, 0.6531, 58.53, 50.24],
  [63.57, 7.87, 0.6386, 60.66, 50.29],
  [64.07, 10.12, 0.6252, 62.42, 48.00],
  [64.57, 12.12, 0.6244, 63.44, 45.71],
  [65.07, 14.12, 0.6367, 64.00, 45.45],
  [65.57, 16.37, 0.6503, 64.74, 47.84],
  [66.07, 18.62, 0.6591, 64.09, 51.75],
  [66.57, 20.37, 0.6682, 63.44, 53.73],
  // frame 20 space_milk
  [68.04, 3.53, 0.6810, 50.25, 53.48],
  [68.54, 5.28, 0.6854, 47.94, 51.40],
  [69.04, 7.53, 0.6732, 45.34, 52.39],
  [69.54, 9.78, 0.6583, 45.06, 54.99],
  [70.04, 11.53, 0.6388, 44.51, 59.10],
  [70.54, 13.03, 0.6265, 43.95, 61.92],
  [71.04, 14.03, 0.6265, 44.60, 61.97],
  [71.54, 14.53, 0.6339, 46.55, 60.41],
  [72.04, 14.53, 0.6475, 46.82, 58.22],
  [72.54, 13.78, 0.6572, 45.34, 57.23],
  // frame 21 joke
  [74.04, 3.53, 0.6810, 50.25, 51.66],
  [74.54, 4.03, 0.6731, 50.34, 49.00],
  [75.04, 4.03, 0.6661, 48.68, 47.13],
  [76.04, 4.28, 0.6495, 46.18, 48.43],
  [76.54, 4.78, 0.6427, 47.38, 49.37],
  [77.04, 5.28, 0.6419, 50.99, 50.67],
  [77.54, 6.03, 0.6469, 54.79, 52.28],
  // frame 22 gift
  [79.04, 1.65, 0.6810, 52.00, 47.30],
  [79.54, 0.65, 0.6690, 50.80, 46.36],
  [80.04, 0.15, 0.6561, 48.67, 45.22],
  [80.54, 0.15, 0.6552, 47.37, 44.12],
  [81.04, 0.65, 0.6709, 48.57, 43.71],
  [81.54, 1.65, 0.6882, 51.72, 44.07],
  [82.04, 2.90, 0.6996, 52.93, 43.81],
  [82.54, 4.65, 0.7007, 52.37, 43.65],
  // frame 23 final
  [83.03, 1.65, 0.6810, 52.00, 50.20],
]



/** The white flash: past this the journal is gone and the outro owns the screen. */
export const STORY_END = 88.1

/** Timecodes snapped to the 30 fps grid on read (ADR-0009). */
export const SLIDES = RAW.map(s => ({ ...s, at: snap(s.at) }))

/** The 17 distinct journal pages, in story order. */
export const PAGE_ORDER = SLIDES.reduce(
  (acc, s) => (acc.includes(s.page) ? acc : [...acc, s.page]),
  [],
)

/** One slide by its storyboard frame number. */
export const slideByFrame = n => SLIDES.find(s => s.frame === n)

/**
 * The pose the path is at, at `t`. Linear between rows rather than the runtime's
 * Hermite: this is for tools that want a number to park at or to check against,
 * and a reader that needs no state is worth more there than the last per-cent of
 * agreement. The runtime reads the same rows through hermite.js.
 */
export function poseAt(t) {
  const P = JOURNAL_PATH
  if (t <= P[0][0]) t = P[0][0]
  if (t >= P[P.length - 1][0]) t = P[P.length - 1][0]
  let i = 0
  while (i < P.length - 2 && t >= P[i + 1][0]) i++
  const a = P[i], b = P[i + 1]
  const u = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0
  const m = (x, y) => x + (y - x) * u
  return { rot: m(a[1], b[1]), scale: m(a[2], b[2]), cx: m(a[3], b[3]), cy: m(a[4], b[4]) }
}

/**
 * Where the journal is once a slide has SETTLED — past the page turn, which is
 * TIMING.flip.out + .back long. This is the second the lab parks at and the one
 * a gate compares, because during the turn there is no flat pose to compare.
 */
export const settledAt = frame => {
  const s = slideByFrame(frame)
  return s ? snap(s.at + TIMING.flip.out + TIMING.flip.back + 0.03) : 0
}

/**
 * The progress bar and prev/next navigation work in PAGES, not slides: frames
 * 4-7 are all the cover's entrance and 23/24 are both the Final page, so 21
 * slides collapse into 17 navigable segments.
 *
 * `start` is when the JOURNAL starts moving; `cut` is when the CONTENT changes,
 * one edge-on instant later. They differ because the page turn hides the swap:
 * for the first TIMING.flip.out seconds the outgoing page is still the one
 * facing the camera. The page cut keys off `cut`; navigation and the progress
 * bar key off `start`, because that is where the slide's window opens.
 *
 * @typedef {{ page: string, index: number, start: number, cut: number,
 *             end: number, dur: number, firstFrame: number, face: 'cover'|'page',
 *             skip?: string }} Segment
 */
export const STORY_SEGMENTS = PAGE_ORDER.map((page, index) => {
  const own = SLIDES.filter(s => s.page === page)
  const first = own[0]
  const nextPage = PAGE_ORDER[index + 1]
  const end = nextPage
    ? SLIDES.find(s => s.page === nextPage).at
    : STORY_END
  return {
    page,
    index,
    start: first.at,
    // The cover is not turned into view, it flies in — so it has no lead.
    cut: index === 0 ? first.at : snap(first.at + TIMING.flip.out),
    end,
    dur: end - first.at,
    firstFrame: first.frame,
    // Which base size the box is laid out at while this page shows. Carried on
    // the segment because the page stack shares ONE box: a page measured while
    // another face is current is measured at the wrong width (useJournalFit).
    face: first.face,
    skip: first.skip,
  }
})

/**
 * Which segment is ON SCREEN at video time `t`. A pure function of the clock,
 * which is what makes it land correctly after any seek, backwards included
 * (ADR-0008). Returns -1 before the first page exists.
 */
export const segmentAt = t => {
  let idx = -1
  for (let i = 0; i < STORY_SEGMENTS.length; i++) {
    if (t >= STORY_SEGMENTS[i].cut - 1e-3) idx = i
  }
  return idx
}
