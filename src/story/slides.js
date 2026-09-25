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
  // ⚠️ IT SKIPS ON `days`, THE SAME VALUE days_in_spotlight SHOWS. The page is
  // "PACKS OF [days]" and nothing else, so without the number it is a headline
  // over a blank — which is exactly what the owner photographed on a link with
  // no `days`. It was the only page in the deck with a dynamic value and no
  // `skip`, and the omission was silent: the drop rule selects on the field's
  // presence, so a page that forgets to declare one can never be dropped.
  { frame: 20, at: 67.07, page: 'space_milk', face: 'page', skip: 'packs' },
  { frame: 21, at: 73.07, page: 'joke', face: 'page' },
  { frame: 22, at: 78.07, page: 'gift', face: 'page' },
  { frame: 23, at: 83.03, page: 'final', face: 'page' },
  // Frame 24 is not a page change — it is where the Final page's recede pose
  // lands. Kept in the table so the story has a row to hang RECEDE_POSE on.
  { frame: 24, at: 85.0, page: 'final', face: 'page' },
]

/**
 * THE STORYBOARD'S DRAW-BACK POSE. THE STORY NO LONGER PLAYS IT (2026-09-05).
 *
 * It was the one pose the outro tweened to over five seconds, taken from the
 * mock's frame 24, and _context/35-slide-audit.md recorded it as missing that
 * mock by 137 px. The clip says the miss is not 137 px and not in that
 * direction: measured 84.03 -> 88.03, its journal does not draw back AT ALL. It
 * stays on the same page, wanders under 100 design px, dips 6 % in size and
 * comes back, and rolls one degree — an ordinary levitating slide. This pose
 * shrinks ours by a third (0.681 -> 0.444) and pushes it 275 px DOWN while the
 * clip's drifts 90 px UP, so by 88.10 — the second the old code hid the journal
 * on — ours was half the linear size of the reference's.
 *
 * The outro is JOURNAL_PATH's now, rows 84.03 to 88.03, measured like the rest.
 * This constant stays for the lab, which still has a `recede` button; nothing in
 * src/animations reads it.
 */
export const RECEDE_POSE = { rot: 20.4, scale: 0.444, cx: 48.6, cy: 64.5 }

/**
 * THE JOURNAL'S PATH — the mock's pose per slide, HELD through the slide.
 *
 * ⚠️ TWO CORRECTIONS ON 2026-09-25, BOTH FROM THE OWNER LOOKING AT IT.
 *
 * 1. THE NUMBERS THIS TABLE WAS BUILT FROM WERE WRONG. `_context/32-poses.md`
 *    disagrees with the mock on five frames, and always in the direction that
 *    throws the journal off screen: frame 10 cx 64.3 against 54.45, frame 11 cy
 *    63.1 against 54.88, frame 12 cx 75.8 against 57.20, frame 13 cy 63.1
 *    against 54.35, frame 16 cx 46.9 against 48.17. Their roll was wrong too —
 *    up to 12.9 degrees where the mock draws 2.4. Verified by drawing the box
 *    on the rendered mock frame: the Figma bounds hug the journal, the table's
 *    box is 107 to 201 design px off. With those five fixed the journal's whole
 *    horizontal range across the story is 48.2..57.8 % instead of 46.9..75.8.
 *
 * 2. THE POSE NOW HOLDS. Each anchor is repeated at the next slide's fold, so
 *    the journal SETTLES after its page turn and stays there; the move to the
 *    next pose happens inside the next turn. The previous edition drifted
 *    continuously from one anchor to the next, which travelled up to 243 design
 *    px across a slide — the owner's «траектории очень большие… он уходит
 *    сильно вправо». A floating object does not travel: in weightlessness the
 *    centre of mass cannot move without an outside force, which is exactly what
 *    both of the ticket's own references show (the cucumber "slowly rotating,
 *    drift minimal to none"). The living motion is the levitation on
 *    `.journal-hover`, and it is rotation-led on purpose.
 *
 * hermite.js zeroes both tangents of a flat segment, so a hold is exact and the
 * journal leaves it from rest and arrives at the next pose at rest — the move
 * is an S-curve occupying one page turn, and nothing snaps at either end.
 *
 *   [t, rot, scale, cx, cy]
 *     t      absolute video seconds, the same clock as the film
 *     rot    rotationZ in CSS degrees, from the mock
 *     scale  from the mock; every data page is 0.681-0.683
 *     cx/cy  the pose's centre as a percent of the 1080x1920 canvas
 *
 * WHERE AN ANCHOR SITS: `slide.at + TIMING.flip.out + SLIDE_FLIP_BACK[frame]`,
 * the instant the turn has finished and the spread is flat to the camera. That
 * is the instant the mock draws.
 *
 * ⚠️ FRAME 24 IS MEASURED OFF THE PICTURE, NOT OFF THE METADATA. Figma reports
 * that instance's box 223 design px too low — it is the only frame rotated far
 * enough (20.4 deg) for the discrepancy to show, and the drawn frame puts the
 * journal's centre at 51.9 % where the metadata says 64.5 %. The old table
 * carried the metadata's number, which is why the journal used to sink out of
 * the bottom of the frame as it receded instead of shrinking away near the
 * centre. The last four rows thin in value and thicken in speed — "спершу
 * повільно" (21770:4988) — and land on the measured pose at 88.03, which is
 * where `journalDissolve` picks the scale up from.
 */
// prettier-ignore
export const JOURNAL_PATH = [
  [6.00, 3.11, 0.7461, 57.75, 48.67], // frame 7 cover — settles here
  [11.07, 3.11, 0.7461, 57.75, 48.67], //   ...and holds until the next fold
  [11.74, 3.11, 0.6826, 57.43, 47.77], // frame 8 editors_note — settles here
  [17.10, 3.11, 0.6826, 57.43, 47.77], //   ...and holds until the next fold
  [17.80, 4.13, 0.6825, 49.39, 54.85], // frame 9 days_in_spotlight — settles here
  [22.07, 4.13, 0.6825, 49.39, 54.85], //   ...and holds until the next fold
  [22.85, 2.40, 0.6826, 54.45, 50.84], // frame 10 seasonal_power — settles here
  [26.07, 2.40, 0.6826, 54.45, 50.84], //   ...and holds until the next fold
  [27.10, 4.33, 0.6812, 49.45, 54.88], // frame 11 vip_status — settles here
  [30.10, 4.33, 0.6812, 49.45, 54.88], //   ...and holds until the next fold
  [30.91, 3.86, 0.6811, 57.20, 50.85], // frame 12 money_talks — settles here
  [34.07, 3.86, 0.6811, 57.20, 50.85], //   ...and holds until the next fold
  [34.87, 2.19, 0.6810, 50.31, 54.35], // frame 13 headline_win — settles here
  [39.07, 2.19, 0.6810, 50.31, 54.35], //   ...and holds until the next fold
  [39.61, 2.73, 0.6810, 54.82, 50.02], // frame 14 multiplier_moment — settles here
  [44.03, 2.73, 0.6810, 54.82, 50.02], //   ...and holds until the next fold
  [44.58, 2.73, 0.6810, 54.82, 56.48], // frame 15 players_pick — settles here
  [49.10, 2.73, 0.6810, 54.82, 56.48], //   ...and holds until the next fold
  [49.88, 2.44, 0.6810, 48.17, 52.19], // frame 16 bonus_report — settles here
  [53.27, 2.44, 0.6810, 48.17, 52.19], //   ...and holds until the next fold
  [53.97, 4.38, 0.6811, 56.32, 51.02], // frame 17 sports_desk — settles here
  [57.07, 4.38, 0.6811, 56.32, 51.02], //   ...and holds until the next fold
  [58.10, 4.37, 0.6812, 56.31, 51.02], // frame 18 top_sport_signal — settles here
  [61.10, 4.37, 0.6812, 56.31, 51.02], //   ...and holds until the next fold
  [61.57, 4.37, 0.6812, 56.31, 52.48], // frame 19 sponsor — settles here
  [67.07, 4.37, 0.6812, 56.31, 52.48], //   ...and holds until the next fold
  [67.61, 3.53, 0.6811, 50.25, 53.48], // frame 20 space_milk — settles here
  [73.07, 3.53, 0.6811, 50.25, 53.48], //   ...and holds until the next fold
  [73.96, 3.53, 0.6811, 50.25, 51.66], // frame 21 joke — settles here
  [78.07, 3.53, 0.6811, 50.25, 51.66], //   ...and holds until the next fold
  [79.04, 1.63, 0.6810, 52.03, 47.27], // frame 22 gift — settles here
  [83.03, 1.63, 0.6810, 52.03, 47.27], //   ...and holds until the next fold
  [83.60, 1.63, 0.6810, 52.03, 50.21], // frame 23 final — settles here
  [84.80, 1.63, 0.6810, 52.03, 50.21], //   ...and holds until the next fold
  [86.00, 8.00, 0.6000, 50.80, 50.80], // frame 24 — picking up
  [87.00, 14.50, 0.5150, 49.60, 51.40], // frame 24 — faster
  [88.03, 20.38, 0.4441, 48.64, 51.90], // frame 24 — the measured mock pose
]

/** Where the last PAGE segment ends for the progress bar: the second the outro
 *  title arrives (TIMING.outro.at). Not the journal's exit — that is a dissolve
 *  at 88.35 (TIMING.exit) — and not the path's end, which is 88.03. */
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
  const a = P[i],
    b = P[i + 1]
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
  const end = nextPage ? SLIDES.find(s => s.page === nextPage).at : STORY_END
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
