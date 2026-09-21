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
  /**
   * ⚠️ frame 8 IS HERE ON A DIFFERENT INSTRUMENT'S WORD, and the note above says
   * it was LEFT OUT — that verdict stands for the instrument that reached it.
   * `journal-lean-path` leans our page and scores it against the clip on the
   * gradient field, i.e. it compares CONTENT, and frame 8 is the slide where the
   * clip's page reads "LET'S TAKE A LOOK" against our "READY TO TAKE A LOOK?".
   * Its 16 % margin was not a weak lean; it was the wrong two pictures.
   *
   * These rows come from the clip's four page EDGES instead
   * (`journal-measure --slide 8`), which share nothing with our layout. They say
   * the clip turns this page AWAY from us to fifteen degrees and back, where
   * SLIDE_LEAN holds it at +6 — the opposite side, 21 degrees out at the worst
   * second, on the slide the owner photographed more than any other.
   *
   * WHY THE SIGN IS BELIEVED AND THE EXACT DEGREE IS NOT. Four edges cannot
   * separate a yaw from a size perfectly — a turned page and a smaller page are
   * both narrower — so this column carries the looser error of the two. The
   * control is frame 10, whose lean is measured and shipped: there the edge fit
   * answers -10 / -14 / 0 against the shipped -4.75 / -7.5 / -8.5, the right
   * sign and the right order, some six degrees loose. Six degrees of looseness
   * does not turn -15 into +6.
   *
   * `rotX` IS LEFT AT ZERO, which is where this slide already was. The edge fit
   * does not report it, so putting a number there would be invention.
   */
  // frame 8 editors_note — the clip's page edges, 19.09
  8: [
    [12.04, 3.00, 0.00],
    [12.54, -0.50, -1.00],
    [13.04, -3.00, -3.00],
    [13.54, -4.50, -6.50],
    [14.04, -6.50, -9.50],
    [14.54, -3.50, -15.50],
    [15.04, -5.00, -16.00],
    [15.54, -5.50, -16.00],
    [16.04, -5.00, -15.50],
    [16.54, -3.50, -13.50],
    [17.04, -7.00, -4.00],
  ],
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
  /**
   * SEVEN MORE SLIDES, ALL FROM THE CLIP'S PAGE EDGES, 19.09 night. Before this
   * the depth turn existed on four slides of seventeen and every other slide
   * held SLIDE_LEAN's one constant — or, on nine of them, a flat zero. The clip
   * turns the page on all of them: +12 deg on frame 9, -16 on frame 21, and it
   * MOVES through the slide rather than holding. The owner, watching review.html:
   * "некоторые перспективы... они немного рисковатые", and on the frames he
   * photographed the page is a trapezium in the clip and a rectangle in ours.
   *
   * ⚠️ WHY THE OTHER INSTRUMENT MISSED THEM, since its verdict is quoted above
   * and says "LEFT OUT". `journal-lean-path` leans OUR page and scores it against
   * the clip on the gradient field, so it compares the two pages' CONTENT — and
   * our print, our line breaks and our art are not the clip's. It reached eight
   * slides and kept four. The edge fit never looks inside the quad.
   *
   * ⚠️ FRAMES 13 AND 15 ARE DELIBERATELY NOT HERE. Their readings do not walk an
   * arc — 13 goes -2 / -7 / -3 / -2 / 0 / +1 / -3 and 15 sits at +2 with a stray
   * +16 — on the two lowest scores of the twelve (0.58 and 0.48). A page that
   * jitters three degrees back and forth is worse than a page held flat, and the
   * rule this table already runs on is that the margin decides, never the angle.
   *
   * ⚠️ THE LAST ROW IS TRIMMED ON 11 AND 16, where it jumps to +8 and +15 against
   * a neighbour at -1 and -7.5. That second is half a second from the next cut,
   * and what the fit is seeing there is the page beginning to turn — which the
   * page turn owns, not this table.
   *
   * ⚠️ FRAMES 10, 14, 18 AND 20 ARE LEFT ALONE. They carry `rotX` as well as
   * `rotY`, measured by the other instrument at margins of 35-111 %, and on
   * frame 18 the two instruments disagree about the SIGN mid-slide. Replacing a
   * strong measurement with a 0.53-score one to gain consistency would be
   * trading evidence for tidiness.
   */
  // frame 9
  9: [
    [18.07, 0.00, 4.00],
    [18.57, 0.00, 6.50],
    [19.07, 0.00, 8.50],
    [19.57, 0.00, 12.00],
    [20.07, 0.00, 11.50],
    [20.57, 0.00, 11.50],
    [21.07, 0.00, 10.50],
    [21.57, 0.00, 6.50],
  ],
  // frame 11
  11: [
    [27.04, -12.00, -6.00],
    [27.54, -12.00, -6.00],
    [28.04, -11.50, -5.50],
    [28.54, -10.50, -5.00],
    [29.04, -9.00, -4.00],
    [29.54, -7.50, -2.50],
  ],
  // frame 12
  12: [
    [31.07, 0.00, 0.00],
    [31.57, 0.00, 3.50],
    [32.07, 0.00, 5.00],
    [32.57, 0.00, 4.50],
    [33.07, 0.00, 3.50],
    [33.57, 0.00, 2.50],
  ],
  /**
   * ⚠️ FRAME 13 IS HERE AND THE NOTE ABOVE SAYS IT IS DELIBERATELY NOT — that
   * verdict stands for the yaw and for the instrument that reached it. What
   * admitted it is the PITCH, which nothing had ever measured on this slide,
   * and it walks -2.5 -> -6.5 -> -0.5 with the margin over a flat page peaking
   * at 30 %. The yaw that comes with it is one solve's other half, not a
   * separate opinion: -4.5 -> -5.0 -> -2.0, an arc, where the reading session
   * AU rejected went -2 / -7 / -3 / -2 / 0 / +1 / -3. The tighter size leash
   * this instrument now runs on is what settled it — see journal-measure.
   *
   * THIS SLIDE HAD NO CONSTANT TO DISPLACE: SLIDE_LEAN has no entry for 13, so
   * before this row set the page sat at a flat zero on both depth channels.
   */
  // frame 13 headline_win — the clip's page edges, 20.09
  13: [
    [35.04, -2.50, -4.50],
    [35.54, -3.50, -4.00],
    [36.04, -4.50, -5.00],
    [36.54, -4.50, -5.00],
    [37.04, -6.50, -4.50],
    [37.54, -6.00, -3.50],
    [38.04, -0.50, -2.00],
    [38.54, 2.00, 1.00],
  ],
  // frame 16
  16: [
    [50.07, -1.00, -4.50],
    [50.57, -1.50, -5.00],
    [51.07, -2.00, -5.50],
    [51.57, -2.50, -5.50],
    [52.07, -3.50, -6.00],
    [52.57, -3.50, -7.00],
  ],
  // frame 17
  17: [
    [54.24, -8.50, 3.50],
    [54.74, -9.00, 3.50],
    [55.24, -9.50, 4.00],
    [55.74, -8.00, 4.00],
    [56.24, -5.50, 5.00],
    [56.74, -0.50, 6.00],
  ],
  // frame 19
  19: [
    [62.07, 4.00, 9.00],
    [62.57, 2.00, 7.50],
    [63.07, 2.00, 6.50],
    [63.57, -0.50, 5.50],
    [64.07, -2.00, 5.00],
    [64.57, -2.50, 5.00],
    [65.07, -2.50, 5.00],
    [65.57, -0.50, 6.00],
    [66.07, 4.50, 7.50],
    [66.57, 8.00, 9.50],
  ],
  // frame 21
  21: [
    [74.04, 0.00, -5.00],
    [74.54, 0.00, -6.50],
    [75.04, 0.00, -9.50],
    [75.54, 0.00, -12.00],
    [76.04, 0.00, -14.00],
    [76.54, 0.00, -16.00],
    [77.04, 0.00, -15.00],
    [77.54, 0.00, -12.50],
  ],
  // frame 23 final — the clip's page edges, 19.09. SLIDE_LEAN held +16 here on a
  // three-instant sweep the note above calls out as too thin to trust ("only 3
  // instants", 27.5 deg between neighbours). Eight chained seconds say +13 to
  // +16, steady — so the constant was right to within three degrees and is now
  // measured rather than guessed, and it no longer snaps to zero at the turn.
  23: [
    [84.03, 0.00, 14.00],
    [84.53, 0.00, 13.00],
    [85.03, 0.00, 13.00],
    [85.53, 0.00, 13.00],
    [86.03, 0.00, 14.00],
    [86.53, 0.00, 15.00],
    [87.03, 0.00, 16.00],
    [87.53, 0.00, 16.00],
  ],
  // frame 22 gift — the clip's page edges, 19.09. This slide had no lean at all
  // before, for the reason its ANCHOR note gives: every content-based instrument
  // is blind here, the clip's `gift` page being a different edition of ours.
  22: [
    [79.04, 6.50, 1.50],
    [79.54, 9.00, 5.00],
    [80.04, 13.50, 7.50],
    [80.54, 13.50, 8.50],
    [81.04, 10.00, 8.50],
    [81.54, 10.50, 8.00],
    [82.04, 9.50, 5.00],
    [82.54, 6.50, 3.00],
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
  [6.00, 19.23, 0.7400, 58.56, 54.10],
  [6.50, 18.98, 0.7478, 55.13, 54.20],
  [7.00, 18.48, 0.7325, 54.30, 53.42],
  [7.50, 17.48, 0.7129, 54.67, 53.01],
  [8.00, 16.23, 0.7077, 54.21, 53.16],
  [8.50, 14.98, 0.7195, 51.25, 53.58],
  [9.00, 13.98, 0.7379, 48.19, 53.42],
  [9.50, 13.48, 0.7468, 47.17, 52.43],
  [10.00, 13.48, 0.7426, 47.54, 51.08],
  [10.50, 14.23, 0.7394, 46.89, 50.30],
  [11.00, 15.23, 0.7318, 46.15, 49.57],
  [11.034, 15.43, 0.7316, 46.09, 49.52], // AW якорь
  [11.05, 15.33, 0.7310, 46.08, 49.50],
  [11.140, 12.82, 0.7231, 46.22, 49.51], // AW держим
  [11.207, 0.00, 0.7143, 46.42, 49.58], // AW ребро
  [11.282, -1.87, 0.7027, 46.71, 49.70], // AW спад
  [11.357, -5.99, 0.6902, 47.07, 49.83], // AW спад
  [11.431, -10.11, 0.6781, 47.46, 49.96], // AW спад
  [11.506, -11.98, 0.6671, 47.87, 50.06], // AW встал
  // frame 8 editors_note
  [11.63, -11.98, 0.6546, 48.52, 50.11],
  [12.04, -11.92, 0.6552, 50.83, 49.38],
  [12.54, -13.77, 0.6602, 53.52, 49.22],
  [13.04, -15.47, 0.6652, 54.81, 49.90],
  [13.54, -18.56, 0.6631, 55.74, 50.73],
  [14.04, -19.51, 0.6591, 54.63, 51.15],
  [14.54, -17.76, 0.6491, 53.89, 50.99],
  [15.04, -16.81, 0.6451, 51.39, 50.32],
  [15.54, -15.01, 0.6391, 48.70, 50.06],
  [16.04, -13.01, 0.6331, 48.79, 50.42],
  [16.54, -10.81, 0.6291, 52.13, 50.99],
  [17.067, -11.06, 0.6280, 52.32, 51.55], // AW якорь
  [17.08, -10.97, 0.6280, 52.32, 51.56],
  [17.173, -10.05, 0.6284, 52.34, 51.66], // AW держим
  [17.240, 0.00, 0.6288, 52.37, 51.72], // AW ребро
  [17.290, 0.89, 0.6292, 52.40, 51.76], // AW спад
  [17.340, 2.85, 0.6296, 52.43, 51.79], // AW спад
  [17.390, 4.82, 0.6301, 52.47, 51.83], // AW спад
  [17.440, 5.71, 0.6307, 52.50, 51.87], // AW встал
  // frame 9 days_in_spotlight
  [18.07, 5.71, 0.6350, 52.00, 52.80],
  [18.57, 5.56, 0.6295, 49.22, 54.78],
  [19.07, 5.96, 0.6364, 47.56, 56.81],
  [19.57, 7.86, 0.6454, 50.52, 57.70],
  [20.07, 8.36, 0.6504, 52.19, 56.65],
  [20.57, 8.96, 0.6384, 52.74, 55.46],
  [21.07, 9.11, 0.6214, 53.02, 54.78],
  [21.57, 7.81, 0.6264, 48.94, 53.74],
  [22.034, 6.70, 0.6308, 45.10, 52.75], // AW якорь
  [22.05, 6.56, 0.6312, 45.02, 52.74],
  [22.140, 5.50, 0.6338, 44.70, 52.81], // AW держим
  [22.207, 0.00, 0.6361, 44.57, 52.97], // AW ребро
  [22.257, -0.35, 0.6380, 44.53, 53.13], // AW спад
  [22.307, -1.14, 0.6401, 44.51, 53.29], // AW спад
  [22.357, -1.92, 0.6422, 44.51, 53.45], // AW спад
  [22.407, -2.27, 0.6445, 44.52, 53.59], // AW встал
  // frame 10 seasonal_power
  [22.63, -2.27, 0.6555, 44.42, 53.52],
  [23.04, -1.43, 0.6800, 43.40, 49.82],
  [23.54, -0.68, 0.6771, 48.40, 47.74],
  [24.04, -0.18, 0.6661, 55.34, 48.10],
  [24.54, -0.18, 0.6611, 59.14, 50.08],
  [25.04, -0.68, 0.6542, 62.94, 53.26],
  [25.54, -1.43, 0.6444, 63.40, 54.82],
  [26.034, -2.24, 0.6344, 64.07, 56.47], // AW якорь
  [26.05, -2.20, 0.6343, 63.87, 56.42],
  // frame 11 vip_status
  [26.63, 1.56, 0.6416, 47.24, 50.33],
  [27.04, -1.25, 0.6416, 48.26, 50.28],
  [27.54, -1.25, 0.6465, 46.50, 51.37],
  [28.04, -1.00, 0.6476, 47.89, 53.61],
  [28.54, -0.75, 0.6440, 48.54, 54.60],
  [29.04, -0.25, 0.6343, 49.00, 53.61],
  [29.54, 0.25, 0.6286, 51.41, 51.53],
  [30.067, 0.81, 0.6221, 53.96, 49.31], // AW якорь
  [30.08, 0.79, 0.6224, 54.03, 49.27],
  // frame 12 money_talks
  [30.66, -1.84, 0.6568, 57.80, 48.63],
  [31.07, -2.05, 0.6708, 58.17, 47.80],
  [31.57, -2.30, 0.6799, 58.08, 46.81],
  [32.07, -2.30, 0.6720, 59.10, 47.07],
  [32.57, -1.80, 0.6591, 61.50, 48.42],
  [33.07, -0.80, 0.6463, 58.73, 50.87],
  [33.57, 0.70, 0.6427, 51.87, 52.80],
  [34.034, 2.11, 0.6388, 45.39, 54.64], // AW якорь
  [34.05, 2.14, 0.6392, 45.28, 54.65],
  // frame 13 headline_win
  [34.63, 2.69, 0.6729, 46.00, 52.50],
  [35.54, 2.45, 0.6773, 49.79, 51.83],
  [36.54, 3.95, 0.6445, 44.70, 50.52],
  [37.04, 5.20, 0.6370, 43.03, 48.60],
  [37.54, 6.20, 0.6458, 45.26, 47.24],
  [38.04, 6.70, 0.6682, 50.35, 47.50],
  [38.54, 6.70, 0.6853, 53.31, 49.22],
  [39.034, 6.70, 0.7028, 56.34, 50.94], // AW якорь
  [39.05, 6.70, 0.7028, 56.35, 50.98],
  [39.140, 6.28, 0.7019, 56.37, 51.19], // AW держим
  [39.207, 0.00, 0.7003, 56.34, 51.32], // AW ребро
  [39.257, -0.41, 0.6987, 56.26, 51.41], // AW спад
  [39.307, -1.32, 0.6969, 56.14, 51.49], // AW спад
  [39.357, -2.23, 0.6947, 55.95, 51.57], // AW спад
  [39.407, -2.64, 0.6923, 55.69, 51.64], // AW встал
  // frame 14 multiplier_moment
  [39.63, -2.64, 0.6796, 53.41, 52.01],
  // ⚠️ ЭТИ ЧЕТЫРЕ СТРОКИ — ЕДИНСТВЕННОЕ МЕСТО В ТАБЛИЦЕ, ГДЕ ФОРМА ВЫБРАНА, А НЕ
  // ИЗМЕРЕНА, и это сделано сознательно по требованию владельца 21.09: «он
  // перевернулся, находится в одной позиции, потом резкое движение влево».
  //
  // ЧТО ЗДЕСЬ ПРОИСХОДИТ. Журнал уезжает влево на 9.9 % ширины кадра за 0.41 с
  // — это 0.97 % за кадр на пике, вчетверо больше, чем на любом другом слайде
  // (остальные пятнадцать идут 0.06..0.46). Само движение ИЗМЕРЕНО и настоящее:
  // строки 39.63 и 40.04 сняты с клипа, и до всей работы 20-21.09 оно было тем
  // же с точностью 0.08 %.
  //
  // ПОЧЕМУ НЕЛЬЗЯ БЫЛО ПРОСТО СГЛАДИТЬ. Между двумя соседними строками кривая
  // уже идёт почти равномерно: пик всего в 1.2 раза выше средней скорости. Ни
  // одна форма не сделает 9.9 % за 0.41 с незаметными — их делает заметными
  // ДЛИНА, а не форма. Промежуточные секунды при этом не измерены ничем:
  // таблица снята с шагом полсекунды.
  //
  // ⚠️ И ЗАМЕР ЭТОГО УЧАСТКА ПОКАДРОВО НЕ ПОЛУЧИЛСЯ. `journal-measure` на 13
  // кадрах 39.63..40.03 дал два разных ответа на одни и те же мгновения — 50.80
  // в прямом проходе против 43.00 в обратном, и скачок 9.2 % за кадр, которого
  // журнал сделать не может. Прибор здесь не арбитр.
  //
  // ЧТО СДЕЛАНО: журнал приезжает В ТУ ЖЕ ТОЧКУ, но за 0.67 с вместо 0.41, и
  // РАВНОМЕРНО. Плавная форма (smoothstep) здесь не годится: её пик в полтора
  // раза выше средней скорости, и она дала 0.80 вместо обещанных 0.45. У
  // равномерного хода пик РАВЕН средней — это минимум, достижимый на данной
  // длине. Пик падает с 0.97 до ~0.50 % за кадр — в один ряд с остальными
  // слайдами. Цена названа честно: между 39.9 и 40.2 мы правее клипа, худшее
  // расхождение около 4 % ширины кадра, и к 40.25 оно сходится в ноль. Строка
  // 40.54 не тронута, дальше таблица ведёт сама.
  [39.86, -3.98, 0.6732, 50.95, 51.94],
  [40.09, -5.31, 0.6667, 48.50, 51.88],
  [40.31, -6.59, 0.6605, 46.15, 51.82],
  [40.54, -7.93, 0.6541, 43.69, 51.75],
  [41.04, -7.68, 0.6630, 48.31, 50.76],
  [41.54, -7.93, 0.6661, 52.57, 49.98],
  [42.04, -8.93, 0.6592, 53.59, 49.46],
  [42.54, -10.43, 0.6543, 51.74, 48.79],
  [43.04, -11.93, 0.6526, 51.65, 47.54],
  [43.54, -13.18, 0.6450, 53.87, 47.22],
  [44.000, -14.60, 0.6380, 55.93, 46.91], // AW якорь
  [44.01, -14.36, 0.6378, 55.97, 46.92],
  // frame 15 players_pick
  [44.59, 17.93, 0.6173, 58.43, 48.81],
  [45.00, 18.78, 0.6255, 58.71, 51.41],
  [45.50, 17.78, 0.6370, 59.17, 52.14],
  [46.00, 16.53, 0.6495, 56.30, 51.36],
  [46.50, 15.03, 0.6478, 51.30, 50.21],
  [47.00, 14.03, 0.6520, 49.54, 49.69],
  [47.50, 13.28, 0.6609, 52.14, 49.80],
  [48.00, 12.53, 0.6620, 56.40, 50.26],
  [48.50, 11.78, 0.6523, 56.95, 50.32],
  [49.067, 11.19, 0.6407, 57.59, 50.37], // AW якорь
  [49.08, 10.91, 0.6411, 57.58, 50.39],
  [49.173, 8.00, 0.6456, 57.49, 50.56], // AW держим
  [49.240, 0.00, 0.6505, 57.40, 50.72], // AW ребро
  [49.327, -2.18, 0.6583, 57.24, 50.97], // AW спад
  [49.415, -6.99, 0.6670, 57.03, 51.24], // AW спад
  [49.502, -11.79, 0.6754, 56.78, 51.51], // AW спад
  [49.589, -13.97, 0.6828, 56.49, 51.75], // AW встал
  // frame 16 bonus_report
  [49.66, -13.97, 0.6874, 56.22, 51.92],
  [50.07, -14.64, 0.7000, 54.00, 52.60],
  [50.57, -15.14, 0.6916, 51.13, 52.70],
  [51.07, -15.89, 0.6815, 49.19, 50.99],
  [51.57, -16.89, 0.6826, 49.37, 48.95],
  [52.07, -17.89, 0.6940, 50.85, 47.81],
  [52.57, -18.89, 0.6951, 51.69, 48.23],
  [53.234, -20.81, 0.6974, 52.71, 48.76], // AW якорь
  [53.25, -20.25, 0.6966, 52.83, 48.80],
  [53.340, -15.67, 0.6903, 53.79, 49.07], // AW держим
  [53.407, 0.00, 0.6838, 54.74, 49.32], // AW ребро
  [53.500, 3.33, 0.6731, 56.27, 49.71], // AW спад
  [53.593, 10.64, 0.6617, 57.87, 50.14], // AW спад
  [53.687, 17.96, 0.6511, 59.35, 50.58], // AW спад
  [53.780, 21.28, 0.6428, 60.49, 51.01], // AW встал
  // frame 17 sports_desk
  [53.83, 21.28, 0.6397, 60.91, 51.22],
  [54.24, 22.06, 0.6370, 61.00, 52.89],
  [54.74, 22.06, 0.6476, 57.02, 54.35],
  [55.24, 21.06, 0.6487, 51.65, 54.56],
  [55.74, 19.56, 0.6400, 50.07, 53.72],
  [56.24, 17.56, 0.6295, 52.67, 53.10],
  [56.74, 15.56, 0.6316, 54.52, 54.09],
  [57.034, 14.55, 0.6329, 55.70, 54.69], // AW якорь
  [57.05, 14.31, 0.6329, 55.68, 54.71],
  // frame 18 top_sport_signal
  [57.63, -2.96, 0.6337, 50.38, 55.13],
  [58.04, -2.75, 0.6420, 48.90, 54.30],
  [58.54, -1.25, 0.6488, 51.31, 52.69],
  [59.04, -0.50, 0.6607, 55.38, 52.95],
  [59.54, -0.50, 0.6749, 57.42, 54.46],
  [60.04, -1.50, 0.6849, 56.96, 55.60],
  [60.54, -3.25, 0.6870, 55.94, 54.61],
  [61.067, -5.34, 0.6895, 54.95, 53.56], // AW якорь
  [61.08, -5.15, 0.6893, 54.83, 53.53],
  [61.173, -2.97, 0.6873, 53.62, 53.30], // AW держим
  [61.240, 0.00, 0.6853, 52.42, 53.09], // AW ребро
  [61.333, 2.39, 0.6819, 50.51, 52.79], // AW спад
  [61.425, 7.66, 0.6781, 48.56, 52.52], // AW спад
  [61.518, 12.93, 0.6739, 46.80, 52.34], // AW спад
  [61.610, 15.32, 0.6699, 45.51, 52.29], // AW встал
  // frame 19 sponsor
  [61.66, 15.32, 0.6677, 45.09, 52.34],
  [62.07, 18.11, 0.6485, 46.57, 54.32],
  [62.57, 20.11, 0.6340, 49.26, 55.00],
  [63.07, 22.61, 0.6265, 53.88, 52.55],
  [63.57, 25.11, 0.6340, 57.22, 49.68],
  [64.07, 26.86, 0.6521, 58.14, 48.64],
  [64.57, 27.61, 0.6641, 57.40, 50.73],
  [65.07, 27.11, 0.6731, 55.27, 53.54],
  [65.57, 25.61, 0.6792, 53.51, 53.85],
  [66.07, 23.36, 0.6815, 53.24, 51.61],
  [66.57, 20.61, 0.6846, 53.79, 49.53],
  [67.034, 18.41, 0.6872, 54.31, 47.58], // AW якорь
  [67.05, 17.97, 0.6876, 54.32, 47.53],
  [67.140, 14.45, 0.6906, 54.38, 47.29], // AW держим
  [67.207, 0.00, 0.6938, 54.42, 47.14], // AW ребро
  [67.286, -1.99, 0.6980, 54.46, 46.98], // AW спад
  [67.366, -6.37, 0.7025, 54.49, 46.86], // AW спад
  [67.445, -10.74, 0.7066, 54.51, 46.78], // AW спад
  [67.525, -12.73, 0.7102, 54.50, 46.76], // AW встал
  // frame 20 space_milk
  [67.63, -12.73, 0.7130, 54.46, 46.84],
  [68.04, -12.58, 0.7083, 53.90, 48.30],
  [68.54, -11.83, 0.6892, 57.23, 50.23],
  [69.04, -11.58, 0.6791, 55.29, 53.14],
  [69.54, -11.58, 0.6863, 50.57, 55.28],
  [70.04, -12.08, 0.6999, 47.42, 55.70],
  [71.04, -13.83, 0.7189, 52.23, 52.94],
  [71.54, -14.08, 0.7213, 52.51, 52.41],
  [72.04, -13.58, 0.7052, 51.77, 53.56],
  [72.54, -12.33, 0.6864, 52.88, 54.76],
  [73.034, -11.29, 0.6675, 54.01, 56.05], // AW якорь
  [73.05, -11.05, 0.6671, 54.02, 55.99],
  // frame 21 joke
  [73.63, 6.16, 0.6625, 52.89, 49.59],
  [74.04, 3.53, 0.6662, 51.41, 48.13],
  [74.54, 3.53, 0.6505, 47.34, 48.49],
  [75.04, 4.53, 0.6300, 45.39, 49.80],
  [75.54, 6.03, 0.6225, 47.61, 50.84],
  [76.54, 10.28, 0.6482, 57.34, 52.24],
  [77.54, 13.53, 0.6571, 56.60, 51.78],
  [78.034, 15.19, 0.6571, 55.11, 51.20], // AW якорь
  [78.05, 14.81, 0.6571, 55.08, 51.20],
  [78.140, 11.43, 0.6553, 54.97, 51.29], // AW держим
  [78.207, 0.00, 0.6520, 54.93, 51.42], // AW ребро
  [78.300, -2.59, 0.6456, 54.92, 51.65], // AW спад
  [78.393, -8.29, 0.6384, 54.94, 51.89], // AW спад
  [78.487, -14.00, 0.6315, 54.97, 52.08], // AW спад
  [78.580, -16.59, 0.6265, 55.01, 52.17], // AW встал
  // frame 22 gift
  [78.63, -16.59, 0.6249, 55.02, 52.16],
  [79.04, -14.97, 0.6289, 55.21, 50.96],
  [79.54, -14.12, 0.6449, 52.99, 51.22],
  [80.04, -13.37, 0.6659, 52.25, 51.95],
  [80.54, -12.62, 0.6789, 54.47, 52.94],
  [81.04, -12.27, 0.6801, 55.49, 52.31],
  [81.54, -12.72, 0.6761, 56.32, 51.01],
  [82.04, -13.87, 0.6741, 58.45, 50.44],
  [82.54, -15.77, 0.6801, 57.25, 51.69],
  [83.000, -17.84, 0.6858, 56.13, 52.89], // AW якорь
  [83.01, -17.56, 0.6857, 56.12, 52.86],
  // frame 23 final
  [83.59, 21.00, 0.6623, 56.92, 47.40],
  [84.03, 20.61, 0.6400, 53.40, 47.35],
  [84.53, 19.36, 0.6250, 55.90, 48.34],
  // frame 24 final
  [85.03, 17.66, 0.6280, 56.83, 50.74],
  [85.53, 15.66, 0.6366, 54.60, 51.05],
  [86.03, 13.56, 0.6416, 52.01, 48.44],
  [86.53, 11.81, 0.6296, 53.12, 45.74],
  [87.03, 10.81, 0.6146, 53.12, 46.10],
  [87.53, 10.71, 0.6176, 51.27, 49.07],
  [88.10, 10.60, 0.6210, 49.16, 52.46],
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
