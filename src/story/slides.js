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
 * Every row is an ANCHOR plus a MOTION, and the two halves have different
 * standing. `scripts/journal-path.mjs` holds both and builds this table; do not
 * edit the numbers here by hand.
 *
 *   - MOTION — how far the journal moves THROUGH a slide, from
 *     `npm run journal:motion`, which registers a clip frame against another
 *     clip frame of the same slide. Same artwork, same renderer, same lighting
 *     on both sides, so nothing about our own layout enters it. Sound for all
 *     four columns.
 *
 *   - `rot`'s ANCHOR — MEASURED OFF THE CLIP, from the angle of the STEMS of the
 *     type printed on the page (`journal:pose -- --roll --anchor`). This is the
 *     column the storyboard got wrong: Figma's stills have the journal leaning
 *     clockwise on every frame, and the clip ROCKS it, changing the lean's sign
 *     at every page turn between about -24 and +15 degrees. Stems rather than
 *     baselines because the clip's journal is yawed and a yaw fans the baselines
 *     out by 6 degrees down the page while leaving the stems parallel; the page
 *     edges are not used at all, because on this clip they lie (V-31, V-32).
 *     Proven against five of our own renders whose roll is known: worst error
 *     0.34 degrees (`npm run journal:selftest`, section 3).
 *
 *   - `scale`, `cx` and `cy`'s ANCHOR — MEASURED OFF THE CLIP on fourteen slides
 *     of seventeen (2026-09-07), storyboard on the other three. That is V-25,
 *     and it was the largest thing wrong with this table: the storyboard put the
 *     journal up to 208 design px away from where the clip holds it, in a
 *     direction that changed from slide to slide, and the owner could see it on
 *     every page. `scripts/clip-fit.mjs` registers our render against the clip
 *     and prints the answer in these very units; each anchor was measured
 *     through TWO windows of different size and content — the whole front face
 *     and an automatic window on the page's ART — and written only where the two
 *     agreed within 20 px. They agreed on thirteen of sixteen, most of them to
 *     under ten pixels and four of them to the pixel. Frame 7 keeps the
 *     storyboard because its first row is `swingOpen`'s handover, and frame 23
 *     because it is the outro.
 *
 *     FRAME 9 IS MEASURED TOO SINCE 2026-09-07, and what had been blocking it
 *     was our own print. Its digit tiles read 2257 — four tiles 350 design px
 *     tall in the middle of the page — where the clip's run printed 257 and
 *     three, and the tiles are the strongest gradient feature that page has, so
 *     neither window could lock. Print the clip's own numbers and the two
 *     windows agree to 7 px in cx and to the pixel in cy. The anchor is also no
 *     longer read from one second: `clip-fit --anchor` reads it at every second
 *     of the slide and carries each back through the measured motion, the way
 *     the `rot` column has always been read.
 *
 *     FRAME 22 STILL KEEPS THE STORYBOARD, and it is not going to stop. The
 *     clip's `gift` page is a different edition of the page ENTIRELY — "ENJOY A
 *     SPECIAL REWARD FOR YOUR NEXT CHAPTER." over a gold heart tag against our
 *     "YOU TURNED THIS VIP JOURNEY..." over the helmet — so there is almost no
 *     shared content to register. `clip:selftest` says the same thing from the
 *     other side: slide 22 is the one slide where it reports no confident peak.
 *
 *   - `scale`'s anchor is measured on eleven of those fourteen. On frames 19, 20
 *     and 21 the two windows disagreed on SIZE by 3-6 % while agreeing on
 *     position to 3-18 px, so those three keep the storyboard's size and carry a
 *     measured position.
 *
 * SO WHAT IS STILL WRONG HERE, said plainly: there is no yaw column, and the
 * clip has a yaw of about 8 degrees on a settled slide (V-24). A similarity
 * transform cannot express a yaw or a keystone, so whatever the clip's yaw does
 * to the projected face is still sitting inside the size column as a residual —
 * after the fix our journal still reads 2-3 % wider than the clip's on the
 * slides where anything is left over. See _context/90-next-session.md.
 *
 * FRAME 7 IS NO LONGER ONE OF THEM (2026-09-05). Its `rot` was the storyboard's
 * +3.1, kept because that is what `swingOpen` landed on and the two cannot move
 * apart without tearing the handover at 6.0. They moved together: the entrance's
 * last three keys are measured now, and so is this anchor. The first row is the
 * one place in this table where `rot` is NOT anchor-plus-motion — it is the roll
 * read at 6.00 itself, because the clip is still turning the cover as it lands
 * (+10.04 at 6.00, +14.84 at 6.97) and the old row held it still for a second.
 *
 * FRAME 23 IS NO LONGER ONE OF THEM (2026-09-05). Its row used to be the pose
 * `recede` started from, so its `rot` was the storyboard's and the outro was a
 * five-second tween to one hand-picked pose. The outro is measured now, 84.03 to
 * 88.03 at a quarter-second step, and it is the ordinary kind of row: an anchor
 * plus a motion. Its `rot` drift is the type's rather than the registration's,
 * because across those five seconds the journal turns 1.2 degrees and the
 * registration answers on a quarter-degree grid — see `--roll-type`.
 *
 * FRAME 7 IS THE SECOND ONE (2026-09-06), for the same reason and after the
 * same symptom. Its rows came from the registration, and against the type the
 * product ran 0.00 / 0.13 / 0.35 / 0.40 / 0.39 / 0.23 / 0.13 / 0.10 / 0.00 /
 * -0.19 / -0.45 / -0.65 / -0.80 degrees behind the clip over 6.00..10.97 — a
 * lag that grew monotonically rather than scattering, which is the signature of
 * a column that under-rotates rather than of a noisy one. Re-shot with
 * `--motion --slide 7 --roll-type --merge`, the roll reads 2.16 / 4.01 / 5.25 /
 * 5.89 / 5.85 / 5.19 / 4.33 / 3.48 against the registration's 2.00 / 3.75 /
 * 5.00 / 5.50 / 5.25 / 4.25 / 3.25 / 2.25, i.e. the journal keeps turning to
 * the end of the slide instead of settling early. Nine rows changed, 7.47 to
 * 11.05; the handover rows at 6.00 and 6.97 did not, so swingOpen's last key
 * still equals JOURNAL_PATH[0]. That was V-47.
 *
 * The seconds between a slide's last row and the next slide's first are NOT
 * measured: the journal is edge-on through the turn and four numbers do not
 * describe it there. The spline interpolates, which is what the old half-second
 * `rePose` did too, only smoothly.
 */
/**
 * HOW FAR SHORT OF SQUARE-ON EACH SLIDE LANDS — the journal's lean, in degrees
 * of rotationY, measured against the clip.
 *
 * WHAT THIS IS. `pageTurn` swings the journal out to edge-on at every cut and
 * brings it back to EXACTLY zero, so between turns our page faces the camera
 * dead on. The clip's page does not: on several slides it stops short of square
 * and stays leaning, and under the stage's perspective that lean is what makes
 * the rectangle read as a trapezium — one edge nearer, the other further. The
 * owner saw it on review.html long before any number found it, and described it
 * exactly: "он наклонён в 3D, становится не квадратным, а трапецией".
 *
 * WHY IT LIVES IN THE TURN rather than in JOURNAL_PATH. The turn already owns
 * rotationY end to end (see the note on `journalPath`, which deliberately does
 * not touch it), so the honest edit is the one the owner proposed: do not finish
 * the turn at zero, finish it here. Nothing else in the pipeline moves.
 *
 * HOW IT WAS MEASURED (scripts/journal-tilt.mjs). Our page is leaned by a
 * candidate angle, rendered, and scored against the clip's own frame on the
 * gradient field — the same registration clip-fit uses, where the bloom cannot
 * vote. The sweep runs the whole grid at each slide and reports the winner
 * against NO lean, because a best-of-nine always has a winner and only the
 * margin over flat means anything.
 *
 * WHAT IS NOT HERE, and why. Angles under 15 % better than flat are left at
 * zero: at that margin the registration is not separating a lean from noise,
 * and a page leaned on a guess is worse than a page left alone. Frames 4-7 are
 * the entrance, owned by swingOpen, and 24 is past the last turn.
 *
 *   slide  page                lean   better than flat
 *      8   editors_note         +6         35 %
 *     10   seasonal_power       +6         17 %
 *     14   multiplier_moment    +6         50 %
 *     15   players_pick         +6         21 %
 *     18   top_sport_signal    -11         66 %
 *     20   space_milk          +11         95 %
 *     21   joke                 -6         16 %
 *     23   final               +16         39 %
 */
export const SLIDE_LEAN = {
  8: 6,
  10: 6,
  14: 6,
  15: 6,
  18: -11,
  20: 11,
  21: -6,
  23: 16,
}

/**
 * THE LEAN AS A PATH THROUGH THE SLIDE, not one angle held for five seconds —
 * and the SECOND depth channel with it.
 *
 * WHAT THIS REPLACES, per slide that has a row here. SLIDE_LEAN above is one
 * `rotationY` per slide, landed by the turn and then held until the next cut,
 * and `rotationX` is not driven by anything at all: `swingOpen` zeroes it once
 * at the entrance and no table has ever written it since. The owner, 2026-09-18,
 * watching review.html: «на видео видно, как перспектива тоже меняется на
 * слайде. Он может как бы ближе к нам, то дальше к нам… у нас просто
 * перспектива задана статически». He is describing rotationX, and he is right
 * that ours is a constant — it is a constant zero.
 *
 * Measured against the clip by `scripts/journal-lean-path.mjs`, one answer every
 * half second across each slide, through the same gradient registration as
 * everything else here (`lib/tiltprobe.mjs`, gated by `tilt-selftest.mjs`).
 *
 * ROWS ARE `[t, rotX, rotY]` IN ABSOLUTE VIDEO SECONDS, read through the shared
 * Hermite reader like JOURNAL_PATH and the flight table — exactly through every
 * measured instant, with continuous velocity so nothing snaps at a row.
 *
 * ⚠️ WHY THIS IS ITS OWN TABLE AND NOT TWO MORE COLUMNS ON JOURNAL_PATH, which
 * is what session AT-1's plan proposed. JOURNAL_PATH is PRINTED by
 * `npm run journal:path` and pasted in whole — the rule next to it says never to
 * hand-edit it — so two columns added here by hand would be erased by the next
 * run of a tool that knows nothing about lean. They are also different
 * measurements from different instruments, and the lean exists on eight slides
 * out of twenty-one rather than everywhere.
 *
 * HOW IT MEETS THE PAGE TURN. The turn owns both depth channels while it runs
 * (0.74 s from the cut) and lands on this table's FIRST row; the next turn
 * starts from its LAST row. So the head and tail of each slide's rows are
 * handover values, not just measurements — the same contract swingOpen's last
 * key has with JOURNAL_PATH[0], and the same one HANDOVER_YAW already describes.
 * A slide with no rows here keeps SLIDE_LEAN's constant and rotationX zero.
 *
 * ⚠️ A SLIDE WHOSE MEASUREMENT IS NOT CONFIDENT STAYS OUT OF THIS TABLE. The
 * margin over a page with NO lean is what decides, never the winning angle: a
 * search always returns a winner. The test a slide has to pass is the one
 * slide 14 passes and slide 15 fails — the angle walks a smooth arc AND the
 * margin arcs with it. Same rule that left ten of twenty-seven flights and three
 * slides of scale untouched.
 */
// Printed by `node scripts/journal-lean-path.mjs --print`, 2026-09-18 (AT-2),
// from a 66-instant run on the clip's own print. The verdict on all eight
// measured slides, in the tool's own words:
//
//    8 editors_note       11 pts  peak   16 %  median    4 %  worst step   9.5 deg  LEFT OUT — peak margin 16 % under 30 %
//   10 seasonal_power     7 pts  peak   35 %  median    6 %  worst step   5.3 deg  in
//   14 multiplier_moment  8 pts  peak  111 %  median   74 %  worst step   4.3 deg  in, last 1 row(s) trimmed
//   15 players_pick       9 pts  peak   57 %  median   11 %  worst step  26.8 deg  LEFT OUT — neighbours 26.8 deg apart
//   18 top_sport_signal   7 pts  peak  102 %  median   42 %  worst step  10.8 deg  in
//   20 space_milk         11 pts  peak   86 %  median   34 %  worst step   6.3 deg  in
//   21 joke               9 pts  peak   15 %  median   13 %  worst step  11.3 deg  LEFT OUT — peak margin 15 % under 30 %
//   23 final              3 pts  peak   49 %  median   18 %  worst step  27.5 deg  LEFT OUT — neighbours 27.5 deg apart; only 3 instants
// prettier-ignore
export const SLIDE_LEAN_PATH = {
  // frame 10 seasonal_power
  10: [
    [22.87, 1.50, -2.50],
    [23.37, 0.00, 0.00],
    [23.87, 0.00, 0.00],
    [24.37, -2.50, -4.75],
    [24.87, -6.75, -4.75],
    [25.37, -12.00, -7.50],
    [25.87, -10.75, -8.50],
  ],
  // frame 14 multiplier_moment
  14: [
    [39.87, 2.25, 10.50],
    [40.37, 3.25, 12.50],
    [40.87, 5.25, 13.00],
    [41.37, 5.50, 14.00],
    [41.87, 4.00, 12.25],
    [42.37, 3.25, 8.00],
    [42.87, 2.50, 6.25],
    [43.37, 1.00, 4.50],
  ],
  // frame 18 top_sport_signal
  18: [
    [57.87, 5.25, -6.75],
    [58.37, 5.00, -14.00],
    [58.87, 7.75, -12.75],
    [59.37, 18.50, -10.75],
    [59.87, 11.50, -2.25],
    [60.37, 9.25, -1.75],
    [60.87, 9.75, -1.25],
  ],
  // frame 20 space_milk
  20: [
    [67.87, -0.25, 15.75],
    [68.37, -6.00, 22.00],
    [68.87, -8.00, 20.75],
    [69.37, -5.00, 15.75],
    [69.87, -5.00, 17.75],
    [70.37, -0.75, 14.50],
    [70.87, 0.50, 12.75],
    [71.37, 3.25, 11.50],
    [71.87, 3.00, 9.75],
    [72.37, -0.75, 8.25],
    [72.87, -0.75, 7.75],
  ],
}

// prettier-ignore
export const JOURNAL_PATH = [
  // frame 7 cover
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.00, 15.23, 0.7460, 57.70, 48.70],
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.50, 14.98, 0.7539, 54.27, 48.80],
  [9.00, 9.98, 0.7439, 47.33, 48.02],
  [11.05, 11.33, 0.7369, 45.22, 44.10],
  // frame 8 editors_note
  [12.04, -10.94, 0.6871, 53.00, 53.24],
  [14.54, -16.69, 0.6786, 54.94, 56.63],
  [16.04, -12.19, 0.6589, 49.57, 56.26],
  [17.08, -6.98, 0.6506, 55.95, 57.03],
  // frame 9 days_in_spotlight
  [18.07, 6.46, 0.6347, 53.19, 53.15],
  [19.57, 6.96, 0.6446, 48.10, 56.80],
  [22.05, 7.97, 0.6232, 48.34, 53.22],
  // frame 10 seasonal_power
  [23.04, -1.43, 0.6800, 43.40, 49.82],
  [24.04, -0.18, 0.6661, 55.34, 48.10],
  [26.05, -2.20, 0.6343, 63.87, 56.42],
  // frame 11 vip_status
  [27.54, -1.25, 0.6465, 46.50, 51.37],
  [28.54, -0.75, 0.6440, 48.54, 54.60],
  [30.08, 0.79, 0.6224, 54.03, 49.27],
  // frame 12 money_talks
  [32.57, -1.80, 0.6591, 61.50, 48.42],
  [34.05, 2.14, 0.6392, 45.28, 54.65],
  // frame 13 headline_win
  [35.54, 2.46, 0.6614, 52.51, 54.15],
  [37.04, 5.21, 0.6220, 45.75, 50.92],
  [39.05, 6.71, 0.6862, 59.07, 53.30],
  // frame 14 multiplier_moment
  [40.04, -8.68, 0.6472, 43.50, 52.90],
  [42.04, -8.93, 0.6592, 53.59, 49.46],
  [44.01, -14.36, 0.6378, 55.97, 46.92],
  // frame 15 players_pick
  [45.00, 18.78, 0.6255, 58.71, 51.41],
  [47.00, 14.03, 0.6520, 49.54, 49.69],
  [49.08, 10.91, 0.6411, 57.58, 50.39],
  // frame 16 bonus_report
  [50.07, -14.64, 0.7000, 54.00, 52.60],
  [52.07, -17.89, 0.6940, 50.85, 47.81],
  [53.25, -20.25, 0.6966, 52.83, 48.80],
  // frame 17 sports_desk
  [54.24, 22.06, 0.6370, 61.00, 52.89],
  [55.74, 19.56, 0.6400, 50.07, 53.72],
  [57.05, 14.31, 0.6329, 55.68, 54.71],
  // frame 18 top_sport_signal
  [58.04, -2.75, 0.6420, 48.90, 54.30],
  [59.54, -0.50, 0.6749, 57.42, 54.46],
  [61.08, -5.15, 0.6893, 54.83, 53.53],
  // frame 19 sponsor
  [62.07, 18.11, 0.6485, 46.57, 54.32],
  [64.57, 27.61, 0.6641, 57.40, 50.73],
  [65.57, 25.61, 0.6792, 53.51, 53.85],
  [67.05, 17.97, 0.6876, 54.32, 47.53],
  // frame 20 space_milk
  [68.04, -24.28, 0.7083, 54.00, 47.00],
  [69.54, -23.28, 0.6863, 50.67, 53.98],
  [71.54, -25.78, 0.7213, 52.61, 51.11],
  [73.05, -22.75, 0.6671, 54.12, 54.69],
  // frame 21 joke
  [74.04, 3.53, 0.6662, 51.41, 48.13],
  [75.04, 4.53, 0.6300, 45.39, 49.80],
  [76.54, 10.28, 0.6482, 57.34, 52.24],
  [78.05, 14.81, 0.6571, 55.08, 51.20],
  // frame 22 gift
  [79.04, -18.22, 0.6810, 52.00, 47.30],
  [81.04, -14.72, 0.7341, 51.35, 47.72],
  [83.01, -19.64, 0.7358, 61.70, 47.78],
  // frame 23 final
  [84.03, 13.21, 0.6810, 52.00, 50.20],
  // frame 24 final
  [85.53, 8.71, 0.6741, 52.93, 54.94],
  [87.03, 3.71, 0.6513, 52.37, 49.52],
  [88.03, 3.21, 0.6700, 48.30, 56.29],
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
