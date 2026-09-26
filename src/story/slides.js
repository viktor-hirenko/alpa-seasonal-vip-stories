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
 * THE JOURNAL'S POSE — ONE POSE, FOR THE WHOLE STORY.
 *
 * ⚠️ THE PER-SLIDE POSES ARE GONE (2026-09-25, third edition). Two editions
 * before this one tried to make the journal visit the mock's pose on every
 * slide: the first drifted between them across the whole slide, the second held
 * each one and moved between them inside the page turn. The owner rejected both,
 * and the second harder than the first — «он в одной позиции, потом
 * перевертывается и резко начинает двигаться в какую-то позицию, потом
 * замирает». Measured: while holding, the pose moved at 4 design px per second;
 * across a turn it moved at up to 130. A thirty-threefold step is not a motion,
 * it is a jump between stations.
 *
 * WHY NO EDITION OF THAT IDEA COULD HAVE WORKED. The storyboard is 27 SEPARATE
 * DRAWINGS. Each frame was composed on its own — on this page the journal looked
 * better to the right, on that one lower — and there is no path between them,
 * because a path was never drawn. Chaining independently composed stills into a
 * trajectory can only produce stations and dashes between them, whatever easing
 * is put on top. That was a mistake of thinking, not of tuning.
 *
 * SO THE STORY HAS EXACTLY THREE MOVEMENTS: the cover flies in and joins the
 * drift; the journal hangs, for seventy-three seconds, moved by nothing but the
 * levitation; and at the end it shrinks away into the depth. The page turn
 * changes the PAGE, not the place — after it the journal is exactly where it
 * was. That is how the ticket's own reference behaves (the cucumber: one object,
 * one continuous motion, no drift of the centre) and it is what weightlessness
 * actually does.
 *
 * WHERE THE ONE POSE COMES FROM:
 *   cx, cy   50 / 50 for the SPREAD. Dead centre is the only choice that cannot
 *            look silly on a page — the crop on a 19.5:9 phone is then 89 design
 *            px on each side, symmetric, and that is the minimum possible: the
 *            journal is 1065 design px wide and only 886 of the 1080 canvas are
 *            on screen. Every spread's content is centred inside it, so the
 *            symmetric crop is the one that costs the least type.
 *
 *            ⚠️ THE COVER IS THE EXCEPTION, at 51.75 / 48.67. Its type is
 *            LEFT-ALIGNED and it is the wider face (1093 design px against the
 *            spread's 1065), so centring it eats the beginning of every line.
 *            The mock's own frame-7 pose is 57.75; the owner moved it 6 % left
 *            so the left corner crosses the screen edge and the vertical
 *            «JOURNAL» down the right edge comes into view — see below.
 *
 *            ⚠️ WHETHER THE LETTERING SHOWS DEPENDS ON THE SCREEN'S ASPECT, and
 *            that is the whole story. The canvas is 1080x1920 and it is
 *            COVER-FITTED, so a 9:16 screen shows all 1080 of it while a 19.5:9
 *            phone shows 886 and cuts 97 off each side. The lettering lives in
 *            exactly that cut. Measured on rendered frames at 540x960:
 *              left edge of the cover   -19.5..-2.7 px  (just off screen, as asked)
 *              «JOURNAL» right edge     538..547 of 540 (whole at the ends of the
 *                                       drift, 7 px clipped at its middle)
 *              «FEATURING» left         >= 17.9      «VIP CLUB» right  <= 502
 *            The same pose on 430x932 puts «FEATURING» 30 px and the player's
 *            name 35 px off the left edge, and the lettering is still 13 px off
 *            the right — a tall phone cannot show both ends of this face at any
 *            offset, because the face is 568 px wide there against 430 of
 *            screen. Only scale can, and it is steep: 0.616 fits the whole face
 *            on a 19.5:9 phone and makes the cover visibly smaller than the
 *            spreads that follow (0.681). That trade is the owner's call.
 *   [t, rot, scale, cx, cy] — t in absolute video seconds, rot in CSS degrees,
 *   cx/cy the centre as a percent of the 1080x1920 canvas.
 *
 * THE LAST FOUR ROWS ARE THE RECEDE (21770:4988): "the journal shrinks and flies
 * off into the depth; the motion accelerates towards the end — slowly at first".
 * It leaves from rest, because hermite.js zeroes both tangents of the flat run
 * before it, and lands on the mock's frame-24 pose — measured off the drawn
 * frame at 51.9 % rather than taken from that frame's metadata, which is 223
 * design px out. See the header of _context/32-poses.md.
 */
// prettier-ignore
export const JOURNAL_PATH = [
  [6.00, 3.11, 0.7461, 51.75, 48.67], // the cover's pose — see the note above
  [11.19, 3.11, 0.7461, 51.75, 48.67], //   ...and nothing moves until the first fold
  [11.23, 3.00, 0.6810, 50.00, 50.00], // the object becomes a spread: centred, edge-on, invisible
  [84.80, 3.00, 0.6810, 50.00, 50.00], //   ...and nothing moves for the next 73 seconds
  [86.00, 8.00, 0.6000, 49.80, 50.60], // the recede — «спершу повільно»
  [87.00, 14.50, 0.5150, 49.20, 51.30], //   ...picking up
  [88.03, 20.38, 0.4441, 48.64, 51.90], //   ...and the measured frame-24 pose at the end
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
