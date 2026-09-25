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
 * THE JOURNAL'S PATH — one anchor pose per storyboard frame, read as a curve.
 *
 * ⚠️ THIS TABLE CHANGED ITS SOURCE ON 2026-09-25 (DP-15822, ADR-0012). Until
 * then it was 232 rows measured off the reference clip half a second at a time,
 * and the journal replayed that clip frame for frame. The owner's decision
 * retires the clip as the motion reference: the poses now come from the
 * STORYBOARD (21770:4582, tabulated in _context/32-poses.md) and everything
 * between them is the curve through them plus the levitation on `.journal-hover`.
 *
 * WHY THE CLIP HAD TO GO, in numbers rather than taste. Six of the sixteen folds
 * carried no measured row across them, so the spline crossed a whole page turn
 * in one 0.58 s interval: +38.6 degrees of roll after frame 22 (66.5 deg/s),
 * +32.3 after frame 14, and `cx` moving at 28.7 % of the stage per second after
 * frame 11. Those six intervals were the fastest motion in the whole story and
 * none of them was asked for by anything — they were the gaps between two
 * measuring runs. A table of anchors has no gaps to fall into.
 *
 *   [t, rot, scale, cx, cy]
 *     t      absolute video seconds, the same clock as the film
 *     rot    rotationZ in CSS degrees, from the mock
 *     scale  from the mock; every data page is 0.681-0.683, so the journal's
 *            size does not change once the cover is gone
 *     cx/cy  the pose's centre as a percent of the 1080x1920 canvas
 *
 * WHERE EACH ANCHOR SITS: `slide.at + TIMING.flip.out + SLIDE_FLIP_BACK[frame]`,
 * i.e. the instant the page turn has finished and the new spread is flat to the
 * camera. That is the instant the mock draws. Between two anchors the journal
 * drifts from one to the other across the whole slide, which is what the mock's
 * own note asks for — its frames are samples of a journal hanging in
 * weightlessness, not stations it stops at.
 *
 * ⚠️ FRAMES 17/18, 14/15, 20/21 AND 22/23 SHARE CHANNELS, and that is the mock,
 * not a copy-paste. Where two neighbouring rows carry the same value hermite.js
 * zeroes both tangents, so those channels hold exactly still and the levitation
 * is the only thing moving them. A hold is a hold.
 *
 * THE FIRST TWO ROWS ARE THE LANDING'S OVERSHOOT. The mock's frame 7 says the
 * journal "sits" onto its place with a light overshoot and no hard stop
 * (21770:4967), so the entrance arrives just past the pose at 6.00 — 2 degrees
 * of roll, 0.8 % of the stage, half a per cent of size — and eases back onto it
 * by 6.55. swingOpen's last key IS the 6.00 row; the two are quoted from each
 * other rather than retyped.
 *
 * THE LAST FOUR ROWS ARE THE RECEDE (21770:4988): "the journal shrinks, flies
 * off into the depth as if pulled into an event horizon; the motion accelerates
 * towards the end — slowly at first." So the rows thin out in value and thicken
 * in speed: 0.02 of scale in the first 1.2 s, 0.09 in the next 1.2, then 0.08
 * and 0.046 over one second each. It lands on the mock's own frame-24 pose at
 * 88.03, which is where `journalDissolve` picks the scale up from.
 */
/**
 * ⚠️ THE MEASURED LEAN IS GONE (2026-09-25, DP-15822, ADR-0012).
 *
 * `SLIDE_LEAN` — one `rotationY` per slide — and `SLIDE_LEAN_PATH` — fifteen
 * slides of six to eleven rows of `[t, rotX, rotY]` through the slide — both
 * came off the reference clip, and both went out with it.
 *
 * WHAT THEY COST WHILE THEY WERE HERE is worth recording, because it is the
 * second half of why this session exists. Between the turn's back-leg ending at
 * rest and the lean table's first row, and again between its last row and the
 * next turn, NOTHING wrote the two depth channels: 0.19 to 0.70 s of frozen
 * depth at each end of every slide — measured 0.30/0.06 on frame 8, 0.27/0.50
 * on 9, 0.26/0.66 on 14, 0.19/0.70 on 16, 0.50/0.50 on 19. "Hold still, then
 * move" twice a slide, bracketed by a curve arriving at zero velocity and one
 * leaving at a spline's tangent, which is exactly what a smoothness gate
 * nominates as a STALL followed by a KINK.
 *
 * The depth now comes from the levitation on `.journal-hover`, which is a
 * continuous function of the clock and so has no ends to stall at. The measured
 * numbers, the runs behind them and the seven rejected attempts at the roll
 * reversal on the page's edge are in _context/32-poses.md and the git history.
 */

// prettier-ignore
export const JOURNAL_PATH = [
  [6.00, 1.05, 0.7508, 56.90, 47.95], // frame 7 cover — the overshoot the entrance carries in
  [6.55, 3.10, 0.7460, 57.70, 48.70], // frame 7 cover — settled onto the mock (21770:4716)
  [11.74, 3.10, 0.6830, 57.40, 47.80], // frame 8 editors_note
  [17.80, 4.15, 0.6820, 49.40, 54.90], // frame 9 days_in_spotlight
  [22.85, 7.10, 0.6820, 64.30, 50.80], // frame 10 seasonal_power
  [27.10, 12.90, 0.6820, 49.50, 63.10], // frame 11 vip_status
  [30.91, 12.75, 0.6820, 75.80, 50.80], // frame 12 money_talks
  [34.87, 7.05, 0.6810, 49.50, 63.10], // frame 13 headline_win
  [39.61, 2.75, 0.6810, 54.80, 50.00], // frame 14 multiplier_moment
  [44.58, 2.75, 0.6810, 54.80, 56.50], // frame 15 players_pick
  [49.88, 6.30, 0.6810, 46.90, 53.90], // frame 16 bonus_report
  [53.97, 4.35, 0.6810, 56.30, 51.00], // frame 17 sports_desk
  [58.10, 4.35, 0.6810, 56.30, 51.00], // frame 18 top_sport_signal
  [61.57, 4.37, 0.6810, 56.31, 52.48], // frame 19 sponsor
  [67.61, 3.53, 0.6810, 50.25, 53.48], // frame 20 space_milk
  [73.96, 3.53, 0.6810, 50.25, 51.66], // frame 21 joke
  [79.04, 1.65, 0.6810, 52.00, 47.30], // frame 22 gift
  [83.60, 1.65, 0.6810, 52.00, 50.20], // frame 23 final
  [84.80, 3.50, 0.6600, 51.50, 51.50], // frame 24 — «спершу повільно»
  [86.00, 9.00, 0.5700, 50.30, 56.00], // frame 24 — picking up
  [87.00, 15.00, 0.4900, 49.30, 61.00], // frame 24 — faster
  [88.03, 20.40, 0.4440, 48.60, 64.50], // frame 24 — the mock pose, reached at the end
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
