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

// prettier-ignore
export const JOURNAL_PATH = [
  // frame 7 cover
  [6.00, 10.04, 0.7460, 57.70, 48.70],
  [6.97, 15.23, 0.7460, 57.70, 48.70],
  [7.47, 17.39, 0.7527, 55.76, 48.91],
  [7.97, 19.24, 0.7382, 55.29, 47.76],
  [8.47, 20.48, 0.7205, 55.57, 47.14],
  [8.97, 21.12, 0.7152, 55.01, 47.50],
  [9.47, 21.08, 0.7283, 52.70, 48.34],
  [9.97, 20.42, 0.7514, 52.33, 49.22],
  [10.47, 19.56, 0.7617, 54.83, 49.74],
  [10.97, 18.71, 0.7561, 57.33, 49.59],
  [11.05, 18.57, 0.7552, 57.73, 49.57],
  // frame 8 editors_note
  [12.04, -10.94, 0.6871, 53.00, 53.24],
  [12.29, -10.94, 0.6771, 53.09, 52.51],
  [12.79, -11.44, 0.6643, 55.50, 51.26],
  [13.29, -12.44, 0.6636, 59.20, 50.79],
  [13.79, -13.44, 0.6761, 60.50, 51.31],
  [14.29, -14.44, 0.6888, 58.93, 52.46],
  [14.79, -14.94, 0.6881, 55.87, 52.93],
  [15.29, -15.44, 0.6759, 54.02, 52.35],
  [15.54, -15.69, 0.6689, 54.20, 51.73],
  [16.29, -16.19, 0.6563, 51.98, 49.33],
  [16.79, -16.19, 0.6556, 50.13, 49.13],
  [17.04, -16.19, 0.6627, 49.57, 49.59],
  [17.08, -16.19, 0.6639, 49.47, 49.67],
  // frame 9 days_in_spotlight
  [18.07, 13.96, 0.6505, 53.01, 49.02],
  [18.32, 13.46, 0.6516, 55.14, 48.76],
  [18.57, 12.71, 0.6488, 56.62, 48.60],
  [19.07, 11.21, 0.6327, 56.07, 49.02],
  [19.57, 9.71, 0.6178, 52.64, 50.69],
  [20.07, 8.71, 0.6190, 47.64, 52.46],
  [20.57, 8.46, 0.6334, 44.03, 52.87],
  [20.82, 8.46, 0.6413, 43.38, 52.56],
  [21.32, 8.96, 0.6550, 43.75, 51.62],
  [21.57, 9.21, 0.6533, 44.40, 51.52],
  [21.82, 9.46, 0.6505, 45.42, 51.42],
  [22.05, 9.69, 0.6479, 46.36, 51.33],
  // frame 10 seasonal_power
  [23.04, -7.59, 0.6673, 48.10, 50.17],
  [23.29, -7.59, 0.6716, 46.99, 49.65],
  [23.79, -7.09, 0.6758, 45.14, 48.03],
  [24.04, -6.59, 0.6729, 45.14, 46.78],
  [24.54, -5.59, 0.6610, 47.73, 45.69],
  [25.04, -4.34, 0.6493, 52.36, 46.89],
  [25.54, -3.84, 0.6477, 55.60, 49.28],
  [25.79, -3.84, 0.6449, 57.45, 50.95],
  [26.05, -3.84, 0.6420, 59.40, 52.71],
  // frame 11 vip_status
  [27.04, -0.25, 0.6206, 60.89, 52.27],
  [27.54, 1.50, 0.6282, 57.37, 49.87],
  [28.04, 3.25, 0.6513, 52.56, 49.35],
  [28.54, 5.00, 0.6723, 49.59, 51.59],
  [28.79, 5.75, 0.6755, 49.50, 53.26],
  [29.04, 6.50, 0.6746, 50.33, 55.19],
  [29.29, 7.00, 0.6696, 51.45, 56.33],
  [29.54, 7.25, 0.6635, 52.46, 56.54],
  [29.79, 7.00, 0.6567, 53.48, 55.97],
  [30.08, 6.71, 0.6487, 54.68, 55.30],
  // frame 12 money_talks
  [31.07, -4.72, 0.6551, 58.11, 48.51],
  [31.32, -4.47, 0.6582, 58.76, 47.57],
  [31.82, -4.22, 0.6635, 59.22, 47.00],
  [32.32, -4.22, 0.6717, 58.20, 47.36],
  [32.82, -4.47, 0.6761, 56.81, 49.24],
  [33.32, -4.97, 0.6763, 56.35, 51.58],
  [33.57, -5.47, 0.6745, 56.54, 52.52],
  [33.82, -5.97, 0.6707, 55.80, 53.56],
  [34.05, -6.43, 0.6672, 55.12, 54.52],
  // frame 13 headline_win
  [35.04, 13.20, 0.6631, 50.94, 54.51],
  [35.29, 12.95, 0.6673, 51.22, 54.20],
  [35.54, 12.45, 0.6716, 52.51, 53.78],
  [36.04, 10.70, 0.6736, 56.22, 52.43],
  [36.54, 8.45, 0.6589, 57.70, 51.12],
  [37.04, 6.20, 0.6367, 55.75, 50.50],
  [37.54, 4.20, 0.6209, 52.79, 50.40],
  [38.04, 2.70, 0.6230, 50.48, 49.15],
  [38.54, 1.70, 0.6450, 50.11, 48.05],
  [38.79, 1.45, 0.6605, 50.75, 48.00],
  [39.05, 1.19, 0.6768, 51.42, 47.95],
  // frame 14 multiplier_moment
  [40.04, -8.43, 0.6985, 50.17, 53.65],
  [40.54, -9.43, 0.6882, 46.56, 53.23],
  [40.79, -9.68, 0.6832, 45.17, 52.04],
  [41.04, -9.68, 0.6803, 44.15, 50.21],
  [41.54, -9.43, 0.6836, 44.71, 47.40],
  [42.29, -8.43, 0.6935, 49.52, 45.79],
  [42.79, -7.43, 0.6896, 51.37, 46.15],
  [43.29, -6.43, 0.6775, 50.73, 46.51],
  [43.79, -5.43, 0.6717, 49.43, 45.63],
  [44.01, -4.98, 0.6691, 49.02, 45.21],
  // frame 15 players_pick
  [45.00, 10.28, 0.6498, 51.37, 48.01],
  [45.25, 10.78, 0.6430, 51.65, 49.16],
  [45.50, 11.78, 0.6363, 51.74, 50.15],
  [46.25, 14.78, 0.6291, 55.44, 52.02],
  [46.75, 17.03, 0.6408, 56.46, 51.66],
  [47.25, 18.78, 0.6595, 54.33, 50.35],
  [47.50, 19.53, 0.6657, 52.20, 49.88],
  [48.00, 20.53, 0.6783, 49.24, 48.84],
  [48.50, 21.03, 0.6817, 49.52, 47.96],
  [48.75, 21.03, 0.6788, 50.63, 47.75],
  [49.00, 20.78, 0.6718, 52.02, 47.70],
  [49.08, 20.70, 0.6696, 52.45, 47.68],
  // frame 16 bonus_report
  [50.07, -21.89, 0.6016, 54.96, 51.61],
  [50.32, -21.14, 0.6044, 55.98, 53.02],
  [50.57, -20.14, 0.6073, 56.72, 54.63],
  [51.07, -18.14, 0.6111, 56.44, 56.77],
  [51.57, -16.64, 0.6050, 54.03, 56.56],
  [52.07, -15.64, 0.6009, 51.63, 53.02],
  [52.57, -15.14, 0.6029, 51.26, 49.16],
  [52.82, -15.14, 0.6058, 51.81, 47.96],
  [53.25, -15.14, 0.6108, 52.76, 45.90],
  // frame 17 sports_desk
  [54.24, 15.07, 0.6561, 59.68, 48.85],
  [54.49, 15.57, 0.6513, 61.90, 49.68],
  [54.74, 16.07, 0.6466, 63.85, 50.73],
  [55.49, 18.07, 0.6451, 64.40, 53.69],
  [56.24, 20.32, 0.6466, 54.59, 55.99],
  [56.74, 21.32, 0.6470, 49.77, 56.14],
  [56.99, 21.32, 0.6568, 49.31, 56.09],
  [57.05, 21.32, 0.6593, 49.19, 56.08],
  // frame 18 top_sport_signal
  [58.04, -11.58, 0.6602, 54.36, 59.02],
  [58.29, -11.08, 0.6664, 55.29, 59.44],
  [58.54, -10.58, 0.6744, 55.84, 59.49],
  [58.79, -10.08, 0.6807, 56.03, 59.07],
  [59.79, -7.08, 0.6989, 55.47, 55.43],
  [60.79, -3.08, 0.7083, 47.60, 57.20],
  [61.08, -1.91, 0.7110, 45.21, 58.00],
  // frame 19 sponsor
  [62.07, 8.36, 0.6885, 46.08, 54.33],
  [62.32, 8.61, 0.6846, 46.27, 53.34],
  [62.82, 9.61, 0.6694, 47.47, 52.09],
  [63.57, 12.11, 0.6457, 50.89, 51.73],
  [64.32, 15.36, 0.6298, 53.39, 47.87],
  [64.82, 17.11, 0.6338, 53.95, 46.20],
  [65.32, 19.11, 0.6483, 54.32, 46.93],
  [65.57, 20.36, 0.6544, 54.60, 48.39],
  [66.32, 23.61, 0.6647, 53.30, 53.29],
  [66.82, 24.86, 0.6729, 52.93, 53.65],
  [67.05, 25.32, 0.6776, 52.93, 53.46],
  // frame 20 space_milk
  [68.04, -24.28, 0.7083, 54.00, 47.00],
  [68.29, -23.53, 0.7116, 53.26, 45.70],
  [68.54, -22.53, 0.7119, 51.96, 44.97],
  [69.04, -20.28, 0.6982, 49.65, 46.17],
  [69.54, -18.28, 0.6827, 49.65, 49.08],
  [70.29, -15.78, 0.6566, 49.00, 55.23],
  [70.79, -14.53, 0.6501, 49.09, 56.90],
  [71.54, -13.53, 0.6584, 51.87, 55.02],
  [72.04, -13.53, 0.6723, 52.24, 52.73],
  [72.54, -14.28, 0.6818, 50.76, 51.58],
  [72.79, -14.78, 0.6829, 49.93, 51.74],
  [73.05, -15.31, 0.6841, 49.06, 51.91],
  // frame 21 joke
  [74.04, 11.03, 0.6677, 51.41, 52.21],
  [74.29, 11.53, 0.6648, 51.69, 51.01],
  [74.79, 11.78, 0.6572, 50.76, 48.46],
  [75.04, 11.78, 0.6535, 49.74, 47.63],
  [75.29, 11.78, 0.6506, 48.91, 47.47],
  [76.29, 12.28, 0.6327, 47.43, 49.35],
  [76.79, 12.78, 0.6302, 49.93, 50.39],
  [77.54, 14.03, 0.6355, 55.76, 52.73],
  [77.79, 14.53, 0.6396, 56.97, 53.46],
  [78.05, 15.06, 0.6439, 58.24, 54.23],
  // frame 22 gift
  [79.04, -18.22, 0.6810, 52.00, 47.30],
  [79.29, -18.72, 0.6760, 51.07, 46.67],
  [79.79, -19.72, 0.6621, 49.87, 45.95],
  [80.04, -19.97, 0.6572, 48.67, 45.27],
  [80.54, -19.97, 0.6566, 47.28, 44.17],
  [80.79, -19.72, 0.6627, 47.46, 43.91],
  [81.04, -19.22, 0.6738, 48.39, 43.81],
  [81.79, -17.22, 0.6969, 52.28, 44.17],
  [82.54, -14.47, 0.7027, 51.81, 43.86],
  [82.79, -13.72, 0.7009, 51.54, 44.02],
  [83.01, -13.05, 0.6993, 51.30, 44.16],
  // frame 23 final
  [84.03, 13.21, 0.6810, 52.00, 50.20],
  [84.28, 13.08, 0.6821, 50.43, 49.63],
  // frame 24 final
  [85.03, 13.85, 0.6630, 45.24, 49.00],
  [85.53, 14.17, 0.6445, 45.24, 50.67],
  [85.78, 14.28, 0.6417, 45.43, 52.13],
  [86.03, 14.33, 0.6448, 45.06, 53.17],
  [86.53, 14.44, 0.6586, 43.85, 53.27],
  [87.03, 14.37, 0.6719, 43.57, 50.10],
  [87.28, 14.34, 0.6751, 44.22, 47.96],
  [87.78, 14.28, 0.6672, 46.54, 45.67],
  [88.03, 14.27, 0.6592, 47.46, 45.51],
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
