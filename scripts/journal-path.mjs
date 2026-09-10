#!/usr/bin/env node
/**
 * TURN A MOTION RUN INTO THE JOURNAL'S PATH TABLE.
 *
 *   node scripts/journal-measure.mjs --motion --step 0.5   # measure
 *   node scripts/journal-path.mjs                          # reduce
 *
 * This is the reduction step, kept as a script rather than done by hand so the
 * table in slides.js can be rebuilt from the same numbers when the video is
 * re-cut — the same division of labour as `fly:measure` and the flight table.
 *
 * WHAT IS MEASURED, AND WHAT IS ONLY ANCHORED.
 *
 * The rows are ANCHOR + MOTION, and the two halves have very different standing.
 *
 *   MOTION — measured, and measured inside the clip alone. `--motion` registers
 *   a clip frame against another clip frame of the same slide over the journal's
 *   own region, so the answer is how the journal moved between those two
 *   seconds: same artwork, same renderer, same lighting on both sides. Score
 *   0.45-0.95 against a rival of 0.22-0.30 on every slide.
 *
 *   ANCHOR — measured against the clip on fourteen slides of seventeen since
 *   2026-09-07, and the storyboard's on the other three. Where a row says
 *   `storyboard` it is the old number, solved from `Component 17`'s AABB; where
 *   it says `clip` it came from `clip-fit --t <the slide's first measured
 *   second>` and was written only after two windows of different size agreed on
 *   it. See the block above ANCHOR itself, and the note on JOURNAL_PATH in
 *   slides.js.
 *
 * WHY THE MOTION IS NOT TAKEN FROM clip-fit, which reports a pose directly.
 * That instrument registers OUR render against the clip, so its answer is only
 * as good as the agreement between our page and the clip's page — and they are
 * different editions of the copy. On frame 14, where they nearly agree, it
 * scores 0.27-0.33 against a 0.09 rival and traces a smooth arc. On frame 8,
 * where the clip reads "LET'S TAKE A LOOK" and we read "READY TO TAKE A LOOK?",
 * it scores 0.03-0.05 with the rival ABOVE the score on every sample and its
 * answers jump 200 design px between neighbours half a second apart.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = process.argv[2] || `${ROOT}_refs/pose/motion.json`
const REF = `${ROOT}scripts/journal-reference.json`

const slidesSrc = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
const SLIDES = [...slidesSrc.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)]
  .map(m => ({ frame: +m[1], at: +m[2], page: m[3] }))

/**
 * THE ANCHORS — the pose each slide's measured motion is added to.
 *
 * WHERE THEY CAME FROM UNTIL 2026-09-07, and why that was wrong. They were
 * solved analytically from the `Component 17` AABB in each 1080x1920 storyboard
 * frame, residual <= 3e-5, and `npm run audit` confirmed our settled poses sit
 * within 0-2 design px of the mock on every one. Agreeing with the mock is not
 * the claim the product makes, though: since session B the journal's movement is
 * taken from the CLIP, and the clip holds the journal somewhere else. Measured
 * on sixteen anchor seconds, the disagreement runs to 208 design px and changes
 * direction from slide to slide, so it is not one offset anybody could have
 * carried in their head. The owner saw it without any instrument at all: "so on
 * every slide".
 *
 * WHERE THEY COME FROM NOW. `clip-fit --t <second>` registers our render against
 * the clip and reports the difference in exactly these units. Each second was
 * measured through TWO windows — the whole front face, and an automatic window
 * on the page's ART, which is the one thing that is the same image file on both
 * sides — and a number was written only where the two agreed to within 20 design
 * px in position and 0.025 in size. Position agreed on thirteen of sixteen, most
 * of them under ten pixels and four to the pixel; size on eleven.
 *
 * WHAT IS STILL THE STORYBOARD'S, and why:
 *   - frame 7, because its first row is where `swingOpen` hands the journal over
 *     and the two cannot move apart without tearing the handover at 6.0;
 *   - frame 22, because the clip's `gift` page is a different EDITION of the
 *     page — "ENJOY A SPECIAL REWARD FOR YOUR NEXT CHAPTER." over a gold heart
 *     tag against our "YOU TURNED THIS VIP JOURNEY..." over the helmet. There is
 *     almost no shared content to register, the two windows sit 26/47 px apart,
 *     and `clip:selftest` reports no confident peak on that slide and no other.
 *     This one is not waiting for a better run; it needs a different instrument;
 *   - frame 23, the outro, which is out of this session's scope;
 *   - the SIZE of frames 9, 19, 20 and 21, where the two windows agreed on
 *     position to 0-18 px but differed on size by 3-6 %.
 *
 * FRAME 9 IS MEASURED SINCE 2026-09-07 (session O), and what had blocked it was
 * our own print rather than the instrument. `days` = 2257 in SAMPLE draws FOUR
 * digit tiles 350 design px tall in the middle of that page where the clip's run
 * printed 257 and three, and those tiles are the strongest gradient feature the
 * page has: with our print neither window found a peak that beat its own
 * neighbourhood and they answered 77 px apart; with the clip's print they agree
 * to 7 px in cx and to the pixel in cy. The anchor is also no longer read from
 * one second — see `clip-fit --anchor`, which reads every second of the slide
 * and carries each back through the measured motion, exactly as the `rot`
 * column has been read since 05.09. Its `scale` stays the storyboard's: the two
 * windows differ on size by 4 %, which is V-24 and not something a better run
 * fixes.
 *
 * THE SIZE OF FRAMES 9, 19, 20 AND 21 IS MEASURED SINCE 2026-09-07 (session Q),
 * and what had blocked it was neither the instrument nor the yaw. `--anchor`
 * reads a slide at every second, and on these four the readings fall into TWO
 * groups: one whose `rot` lands on the independently measured typographic roll
 * and one that misses it by three degrees. Those are two local maxima of the
 * same search, and only one of them can be the journal. Dropping the readings
 * whose `rot` misses the type by more than ONE DEGREE leaves the two windows
 * agreeing on size to 0.2-1.5 % on all four, where before they stood 4-6 %
 * apart. See the note on the rule below.
 *
 * THE ONE-DEGREE RULE IS THE SUM OF THREE MEASURED ERRORS, not a tuned knob.
 * The typographic roll is proven to 0.34 deg (`journal:selftest`, section 3);
 * the registration reports `rot` on a 0.25 deg grid; the motion drift subtracted
 * from each reading carries a quarter degree of its own. 0.34 + 0.25 + 0.25 =
 * 0.84, rounded up to 1.0. Widening it to 1.5 lets the three-degree group back
 * in on frame 20 and pushes the two windows from 0.2 % apart to 2.6 %; narrowing
 * it to 0.5 leaves frame 21 with too few readings to take a median of.
 *
 * AND THE YAW IS NOT WHAT THAT RESIDUAL WAS. A constant yaw makes the clip's
 * page narrower on EVERY slide, so it can only ever read as "the clip is
 * smaller". Measured, the sign alternates: the clip is 4.5 % smaller than the
 * storyboard on frame 9 and 2.0 % smaller on 21, but 1.1 % LARGER on 19 and
 * 4.0 % larger on 20. That is an unmeasured column, which these four rows now
 * are, and not a projection our transform cannot express. V-24 may still be
 * true about the clip; it was not what these numbers were.
 *
 * WHAT NO INSTRUMENT HERE CAN STILL SEE: a similarity transform has no way to
 * express a yaw or a keystone, so some residual in SIZE can still survive this.
 */
/**
 * `rot` NO LONGER COMES FROM THE STORYBOARD. It is measured off the clip, and
 * that is the one change this table has had since it was written.
 *
 * The storyboard says the journal leans clockwise on every single frame, from
 * +1.65 to +12.9. The clip says it ROCKS: the lean changes sign at every page
 * turn, between about -24 and +15, so on every second slide the storyboard has
 * the journal tipped the wrong way (V-30). The two disagree because Figma can
 * only draw a flat rotation and the numbers there were solved from the bounding
 * box of `Component 17`, whose sign had to be read off the mock by eye — and the
 * mock is a set of stills, so a rock between stills is invisible in it.
 *
 * MEASURED HOW: `npm run journal:pose -- --roll --anchor`, which reads the angle
 * of the STEMS of the type printed on the page — not the journal's edges, which
 * on this clip lie (V-31, V-32). Five seconds are read per slide, each carried
 * back to the slide's anchor second by subtracting the drift `--motion` measured
 * for it, and the median is taken. Those five are independent frames corrected
 * by an independent measurement, so their spread is a check on both: it is
 * 0.2-1.2 deg on fifteen of the sixteen slides and 2.9 on frame 18. The method
 * itself is proven against five of our own renders whose roll is known exactly
 * (`npm run journal:selftest`, section 3): worst error 0.34 deg.
 *
 * `scale`, `cx` and `cy` are UNCHANGED and still the storyboard's. The clip
 * disagrees with them too — it puts the journal 50-130 design px further left
 * (V-25) — but that disagreement cannot yet be separated from our own layout
 * error, and this session did not try. Only the angle is measured here.
 *
 * FRAME 7 IS NOW MEASURED LIKE THE REST (2026-09-05), together with the last
 * three keys of `swingOpen`, because those two numbers can only move as a pair.
 *
 * It used to be the storyboard's +3.1, and the entrance ended on that same +3.1,
 * so the handover at 6.0 was seamless and both ends of it were wrong by twelve
 * degrees. What the clip actually does is roll the cover CONTINUOUSLY through
 * the landing and on into the slide: +10.04 at 6.00, +14.84 at 6.97, peaking
 * near +20.7 at 8.97. The second from 6.00 to 6.97 is a straight line to within
 * 0.09 deg (11.27 / 12.42 / 13.71 measured at the quarters against 11.28 /
 * 12.51 / 13.75 interpolated), so it is not a jump hidden by the page turn — it
 * is the same drift the rest of this table describes, starting one second before
 * the first `--motion` sample.
 *
 * FRAME 23 IS NOW MEASURED LIKE THE REST (2026-09-05), and the reason it was
 * not has gone with `recede`.
 *
 * It used to be the pose `recede` started from, hard-`set` at 83.03 a tenth of
 * a second before the page folds, so the clip's +13.2 could not go in: it would
 * have put a 28 deg turn on screen while the gift page was still face-on. The
 * outro is no longer a re-pose at all — it is the same page, drifting, for five
 * seconds, which is what every other row of this table describes. So frame 23
 * gets an anchor and a motion run like slide 8 does, its samples run 84.03 to
 * 88.03, and the roll crosses the fold on the spline exactly the way the other
 * fifteen page turns do.
 *
 * Its `rot` anchor is the roll at its first measurable second, read off the type
 * (+13.21 at 84.03); its motion run carries the drift, and that run was made
 * with `--roll-type`, so the drift is the type's too and not the registration's
 * quarter-degree grid. Frame 24 keeps no anchor of its own: it is not a page
 * change, only the second the storyboard happens to draw, and the samples run
 * straight through it.
 */
const ANCHOR = {
  // MEASURED OFF THE CLIP 2026-09-07 where the row says so, storyboard where it
  // does not. `rot` is the clip's on every row and has been since 05.09.
  7: { rot: 15.23, scale: 0.746, cx: 57.7, cy: 48.7 },      // storyboard — the handover
  8: { rot: -10.94, scale: 0.6871, cx: 53.0, cy: 53.24 },   // clip: position and size
  9: { rot: 13.96, scale: 0.6505, cx: 53.01, cy: 49.02 },   // clip: position and size
  10: { rot: -7.59, scale: 0.6673, cx: 48.1, cy: 50.17 },   // clip: position and size
  11: { rot: -0.25, scale: 0.6206, cx: 60.89, cy: 52.27 },  // clip: position and size
  12: { rot: -4.72, scale: 0.6551, cx: 58.11, cy: 48.51 },  // clip: position and size
  13: { rot: 13.2, scale: 0.6631, cx: 50.94, cy: 54.51 },   // clip: position and size
  14: { rot: -8.43, scale: 0.6985, cx: 50.17, cy: 53.65 },  // clip: position and size
  15: { rot: 10.28, scale: 0.6498, cx: 51.37, cy: 48.01 },  // clip: position and size
  16: { rot: -21.89, scale: 0.6016, cx: 54.96, cy: 51.61 }, // clip: position and size
  // `cy` RE-READ 2026-09-09 (session V): the page sat too low, and two
  // independent flights on this very slide say so in mirror image — the
  // basketball rides ABOVE the page's top edge and our page covered LESS of it
  // than the clip does (10 % vs 33 %, 3 % vs 12 %), while the tennis ball
  // passes UNDER the bottom edge and our page covered MORE (97 % vs 56 %,
  // `CROSSING-POP` at the handover). One offset explains both signs; a size
  // error could not. Of the two windows only `--face` survives the 1.0 deg
  // angle rule (its rot reads 15.01-15.57 against the shipped 15.07, while the
  // art window answers 12.06-13.56 — a second local maximum), and its
  // angle-passing readings put cy at 48.85, 48.88, 49.30, 49.36, 49.37.
  //
  // WHICH OF THOSE FIVE, and why not their median. Not one reading on this
  // slide beat its own neighbourhood — thirteen readings across two windows,
  // every one of them `no peak` — so the registration brackets the answer here
  // and does not pick inside the bracket. The flights do have a confident
  // answer, and they were asked: every candidate was rendered and both flights
  // measured against the CLIP's own covered fractions.
  //
  //     cy      tennis handover   tennis 56.94   basketball 54.17   55.34
  //     49.98         50 % POP        97 %            10 %            3 %
  //     49.30         27 % POP        92 %            15 %            3 %
  //     48.99         19 %            89 %            17 %            5 %
  //     48.85         17 %            87 %            18 %            6 %
  //     48.68         14 %            85 %            19 %            7 %
  //     the clip       6 %            56 %            33 %           12 %
  //
  // All four columns walk toward the clip together and none overshoots it, so
  // the bracket's low end is the best answer inside it: 48.85, the lowest
  // reading that passes the angle rule. 48.68 is lower still and fits better,
  // but it is the median of the window the angle rule rejects, so it is not
  // ours to take. A RESIDUAL REMAINS — even at 48.68 the clip covers less of
  // the tennis ball and more of the basketball than we do — and this
  // instrument cannot resolve it on this slide. That residual is a candidate
  // for a session with a better one, not a reason to keep pushing cy past what
  // was measured.
  //
  // `scale` and `cx` are NOT touched: -3.4 % and +8 px are each inside the
  // spread of those same readings, so neither is a measurement of anything.
  17: { rot: 15.07, scale: 0.6561, cx: 59.68, cy: 48.85 },   // clip: position and size
  18: { rot: -11.58, scale: 0.6602, cx: 54.36, cy: 59.02 }, // clip: position and size
  19: { rot: 8.36, scale: 0.6885, cx: 46.08, cy: 54.33 },   // clip: position and size
  // `cx` RE-READ 2026-09-09 (session U): 52.84 was the odd one out. Four
  // window runs — session Q's two on 07.09 and session U's two today, each ten
  // seconds of the slide carried back to 68.037 and filtered by the 1.0 deg
  // angle rule — put it at 54.21, 54.21, 53.80, 54.21. Of the sixteen readings
  // those medians come from, fifteen sit above 53.7 and exactly one lands on
  // 52.81, so the shipped number was the bottom edge of the distribution
  // rather than its middle. 54.00 is the mean of TODAY'S two windows, which
  // are 4 px apart; session Q's runs are not averaged in because they read a
  // template this repo no longer renders (V-64's brown band, V-66's spine,
  // T-2's page box). `scale` and `cy` are NOT touched: both windows answer
  // 0.7060 and 46.9-47.0 against the shipped 0.7083 and 47.0, which is inside
  // their own spread and so is not a measurement of anything.
  20: { rot: -24.28, scale: 0.7083, cx: 54.0, cy: 47.0 },   // clip: position and size
  21: { rot: 11.03, scale: 0.6677, cx: 51.41, cy: 52.21 },  // clip: position and size
  22: { rot: -18.22, scale: 0.681, cx: 52.0, cy: 47.3 },    // storyboard — the two windows disagreed
  23: { rot: 13.21, scale: 0.681, cx: 52.0, cy: 50.2 },     // storyboard — the outro, out of scope
}

/** The storyboard's own `rot`, kept so the two can be printed side by side. */
const MOCK_ROT = { 7: 3.1, 8: 3.1, 9: 4.15, 10: 7.1, 11: 12.9, 12: 12.75, 13: 7.05, 14: 2.75,
  15: 2.75, 16: 6.3, 17: 4.35, 18: 4.35, 19: 4.37, 20: 3.53, 21: 3.53, 22: 1.65, 23: 1.65 }

const slideOf = t => {
  let s = SLIDES[0]
  for (const x of SLIDES) if (x.at <= t + 1e-6) s = x
  return s
}

const rows = JSON.parse(readFileSync(SRC, 'utf8')).rows

// A registration whose peak barely beats its own neighbourhood is a
// coincidence. Those samples are dropped rather than smoothed: a wrong pose
// between two right ones is worse than a gap the spline bridges.
const SHAKY = 0.15
const good = rows.filter(r => r.score - r.rival >= SHAKY)
const dropped = rows.length - good.length

const byFrame = new Map()
for (const r of good) {
  if (!byFrame.has(r.frame)) byFrame.set(r.frame, [])
  byFrame.get(r.frame).push(r)
}

/** Anchor + motion, per the rule in the header. */
const W0 = 1080, H0 = 1920
const keysOf = (frame, samples) => {
  const a = ANCHOR[frame]
  if (!a || !samples.length) return []
  return samples.map(s => ({
    t: s.t,
    rot: +(a.rot + s.rot).toFixed(2),
    scale: +(a.scale * s.size).toFixed(4),
    cx: +(a.cx + (s.dx / W0) * 100).toFixed(2),
    cy: +(a.cy + (s.dy / H0) * 100).toFixed(2),
  }))
}

/**
 * Keep the rows a spline through the others cannot reproduce.
 *
 * Greedy, and it uses the SAME reader the runtime uses (a straight-line
 * reduction would keep rows the spline does not need and drop rows it does).
 * Tolerances are in the units the eye judges: design px on the canvas, per cent
 * of size, degrees.
 */
const TOL = { pos: 4, scale: 0.005, rot: 0.4 }
const W = 1080,
  H = 1920

function hermite(keys, ch) {
  const M = keys.map((_, i) => {
    const a = keys[Math.max(0, i - 1)],
      b = keys[Math.min(keys.length - 1, i + 1)]
    const dt = b.t - a.t
    return dt > 0 ? (b[ch] - a[ch]) / dt : 0
  })
  return time => {
    let i = 0
    while (i < keys.length - 2 && time >= keys[i + 1].t) i++
    const a = keys[i],
      b = keys[i + 1]
    const h = b.t - a.t
    if (h <= 0) return b[ch]
    const u = Math.min(1, Math.max(0, (time - a.t) / h))
    const u2 = u * u,
      u3 = u2 * u
    return (
      (2 * u3 - 3 * u2 + 1) * a[ch] +
      (u3 - 2 * u2 + u) * h * M[i] +
      (-2 * u3 + 3 * u2) * b[ch] +
      (u3 - u2) * h * M[i + 1]
    )
  }
}

function worstError(kept, all) {
  const f = { rot: hermite(kept, 'rot'), scale: hermite(kept, 'scale'), cx: hermite(kept, 'cx'), cy: hermite(kept, 'cy') }
  let worst = { e: -1, row: null }
  for (const r of all) {
    const e = Math.max(
      Math.abs(f.rot(r.t) - r.rot) / TOL.rot,
      Math.abs(f.scale(r.t) / r.scale - 1) / TOL.scale,
      (Math.abs(f.cx(r.t) - r.cx) / 100) * W / TOL.pos,
      (Math.abs(f.cy(r.t) - r.cy) / 100) * H / TOL.pos,
    )
    if (e > worst.e) worst = { e, row: r }
  }
  return worst
}

function decimate(all) {
  if (all.length <= 2) return all.slice()
  let kept = [all[0], all[all.length - 1]]
  for (;;) {
    const w = worstError(kept, all)
    if (w.e <= 1 || kept.length >= all.length) break
    kept.push(w.row)
    kept.sort((a, b) => a.t - b.t)
  }
  return kept
}

/**
 * DECIMATION IS GLOBAL, NOT PER SLIDE, and that was found the hard way.
 *
 * Reducing each slide on its own gives every slide one-sided tangents at its
 * ends — but the runtime reads ONE path across the whole story, so a row near a
 * slide boundary has neighbours from the next slide and sits on a different
 * curve. The first cut of this table was decimated per slide, passed its own
 * check at 4 design px, and then missed a dropped row by 12.3 px in the player.
 * So the rows are built per slide (each anchored on its own storyboard pose) and
 * thinned against the curve the runtime will actually draw.
 */
const allFull = []
const report = []
for (const s of SLIDES) {
  const samples = byFrame.get(s.frame)
  if (!samples) continue
  samples.sort((a, b) => a.t - b.t)
  const full = keysOf(s.frame, samples)
  /**
   * HOLD THE POSE UNTIL THE PAGE FOLDS, and this row is why the measured roll
   * can be shipped at all.
   *
   * A slide's last sample sits up to half a second before the next slide starts,
   * because the sampler steps 0.5 s and stops short of the turn. That gap never
   * mattered while every anchor leaned the same way — the angle moved three or
   * four degrees across a turn and the spline could smear it anywhere. With the
   * roll measured off the clip the angle moves THIRTY degrees across a turn, and
   * a spline that starts turning at the last sample rotates the journal in plain
   * sight, half a second before the page begins to fold.
   *
   * Where the clip actually puts that change is measured, not assumed. Read
   * straight through the turn at 78.07 — which the type allows, because the stem
   * direction is unaffected by yaw right up to edge-on:
   *
   *   t     77.54  77.94  78.04 | 78.14  78.24  78.44  78.64 | 78.84  79.04
   *   roll  +14.2  +15.0  +15.2 | +10.3   +0.2  -12.4  -16.7 | -17.8  -18.3
   *                       fold -^                            ^- back face-on
   *
   * The journal holds +15 until the fold and has done almost all of its turning
   * by the time the page comes back. So the row below repeats the slide's last
   * measured pose at the last instant before the fold: holding is right to about
   * a degree (+15.2 measured against +14.2 held), where interpolating from the
   * last sample is about ten degrees wrong at the same instant.
   *
   * ONLY WHERE THE PAGE ACTUALLY FOLDS, which is why the test is on the page and
   * not on the existence of a next row. Frame 24 is not a page change — it is
   * the second the storyboard happens to draw of the SAME final page — so frame
   * 23's samples run straight through it. Left as `next && ...` this row copied
   * the pose the outro ends on, at 88.03, back to 84.98, and the spline then had
   * five seconds of measured drift to reach a pose it had already been given.
   */
  const next = SLIDES.find(x => x.at > s.at + 1e-6)
  const folds = next && next.page !== s.page
  /**
   * THE TAIL ROW CARRIES THE MOTION ON, IT DOES NOT FREEZE IT (2026-09-10).
   *
   * This row used to be a COPY of the slide's last measured pose, which made the
   * journal stand perfectly still for the last 0.3-0.7 s of almost every slide —
   * and once hermite.js started holding flat segments exactly (V-55), that stand
   * became a dead stop the owner could see: "перед переключением слайда журнал
   * замирает, этого не было".
   *
   * The copy was never a measurement. The sampler stepped 0.5 s and stopped
   * short of the turn, so the gap simply had no data and "it holds" was the
   * assumption filling it. Measured on 2026-09-10 with journal-measure --t
   * straight into one of those gaps, the clip does no such thing:
   *
   *   t      66.57   66.75   66.90   67.00      (fold at 67.07)
   *   rot    25.56   25.91   26.26   26.41      still turning
   *   scale  0.661   0.664   0.667   0.668      still growing
   *   cx      54.1    54.2    54.4    54.5      still travelling
   *
   * — a straight continuation of the leg before it, to a fraction of a degree.
   * So the row continues the last measured STEP instead of repeating the pose,
   * and the motion table underneath it was re-shot at 0.25 s (233 samples) so
   * the leg being continued is short and the extrapolation spans a quarter of a
   * second rather than half of one.
   *
   * What the old note below is right about stands: the journal must not start
   * its THIRTY-degree turn early, and it does not — this carries the slide's own
   * drift of a degree or two, not the fold.
   */
  if (folds && full.length) {
    const last = full[full.length - 1]
    const prev = full.length > 1 ? full[full.length - 2] : null
    const t = +(next.at - 0.02).toFixed(2)
    if (prev && last.t > prev.t) {
      const k = (t - last.t) / (last.t - prev.t)
      full.push({
        t,
        rot: +(last.rot + (last.rot - prev.rot) * k).toFixed(2),
        scale: +(last.scale + (last.scale - prev.scale) * k).toFixed(4),
        cx: +(last.cx + (last.cx - prev.cx) * k).toFixed(2),
        cy: +(last.cy + (last.cy - prev.cy) * k).toFixed(2),
      })
    } else {
      full.push({ ...last, t })
    }
  }
  allFull.push(...full)
  // How far the journal travels over the slide, and how far it wanders from
  // where it started — the second number is the one that says "this slide
  // drifts" rather than "this slide ends up somewhere else".
  const span = samples.reduce((m, x) => Math.max(m, Math.hypot(x.dx, x.dy)), 0)
  report.push({ frame: s.frame, page: s.page, samples: samples.length, keys: 0,
    rotFrom: 0, rotTo: samples[samples.length - 1].rot, span,
    dCx: samples[samples.length - 1].dx, dCy: samples[samples.length - 1].dy,
    dScale: +((samples[samples.length - 1].size - 1) * 100).toFixed(1) })
}
/**
 * THE HANDOVER ROLL, read off the clip at 6.00 exactly the way the anchors are.
 *
 * The head row used to be a straight copy of ANCHOR[7], on the reasoning that
 * `swingOpen` lands the journal at 6.0 and the first measured second is 6.97, so
 * the second between them was a hold. The clip does not hold it: it is still
 * rolling, 10.04 at 6.00 against 14.84 at 6.97, and reading the quarters in
 * between (11.27 / 12.42 / 13.71) puts them on a straight line to 0.09 deg.
 *
 * So this row carries its own angle and the anchor's position and size — those
 * two the entrance and the table already agree on, and neither is measured
 * against the clip yet (V-25). It is the same number as the last key of
 * `swingOpen`; the two have to match or the handover tears.
 *
 * Measured twice through two independently built windows — one from the
 * entrance's own pose (rotY -4), one from `poseAt` (rotY 0) — which agreed at
 * 10.04 and 10.03. Window displaced +/-100 px in both axes and re-cropped from
 * 80 to 220: worst change 0.14 deg.
 */
const HANDOVER_ROT = 10.04

// The head and tail rows join the pool BEFORE thinning, so the curve the
// decimation judges is the curve the runtime draws, ends included.
allFull.unshift({ t: 6.0, ...ANCHOR[7], rot: HANDOVER_ROT })
allFull.sort((a, b) => a.t - b.t)
const keptAll = decimate(allFull)
for (const r of report)
  r.keys = keptAll.filter(k => {
    let f = SLIDES[0].frame
    for (const x of SLIDES) if (x.at <= k.t + 1e-6) f = x.frame
    return f === r.frame
  }).length
const out = keptAll.map(k => [k.t, +k.rot.toFixed(2), +k.scale.toFixed(4), +k.cx.toFixed(2), +k.cy.toFixed(2)])
/**
 * ONE ROW THAT IS NOT MEASURED, added to the pool above before thinning.
 *
 * At the head: the cover's first measured second is 6.97 — a second after
 * `swingOpen` lands it at 6.0, because the window skips the turn — so a row at
 * 6.0 lets the path own the journal from the moment the entrance hands it over.
 * Its POSITION AND SIZE are still not measured, and that is the part that is not:
 * they repeat the anchor's, as they always did. Its ANGLE now is measured, at
 * 6.00, off the clip — see HANDOVER_ROT above.
 *
 * THERE IS NO LONGER ONE AT THE TAIL. A hand-written row sat at 83.03 carrying
 * the storyboard's pose for frame 23, because the outro was a `recede` that
 * started there and frame 23 had no measured samples to put in its place. It
 * now has seventeen of them, running 84.03 to 88.03, so the tail of this table
 * is measured like the rest of it and the path owns the journal until the flash.
 */

console.log(`${rows.length} samples in, ${dropped} dropped as unconfident, ${out.length} keys out.\n`)
console.log('frame page                 n  keys   drot     dcx    dcy   dsize   farthest    rot: mock -> clip')
for (const r of report)
  console.log(
    String(r.frame).padStart(5) + '  ' + r.page.padEnd(20) + String(r.samples).padStart(3) +
      String(r.keys).padStart(6) + r.rotTo.toFixed(2).padStart(8) +
      r.dCx.toFixed(0).padStart(8) + r.dCy.toFixed(0).padStart(7) +
      ((r.dScale >= 0 ? '+' : '') + r.dScale.toFixed(1)).padStart(7) + ' %' +
      r.span.toFixed(0).padStart(10) + ' px' +
      MOCK_ROT[r.frame].toFixed(2).padStart(12) + ' ->' +
      ANCHOR[r.frame].rot.toFixed(2).padStart(8) +
      (Math.sign(MOCK_ROT[r.frame]) !== Math.sign(ANCHOR[r.frame].rot) ? '   SIGN' : ''),
  )

writeFileSync(REF, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), src: SRC,
  tol: TOL, units: 'dx/dy design px, size ratio, rot degrees, all relative to the slide\'s first sample',
  rows: good }, null, 1))
console.log(`\n-> ${REF}`)

console.log('\n// paste into src/story/slides.js\n')
console.log('const PATH = [')
let lastFrame = null
for (const k of out) {
  const f = slideOf(k[0])
  if (f.frame !== lastFrame) {
    console.log(`  // frame ${f.frame} ${f.page}`)
    lastFrame = f.frame
  }
  console.log(`  [${k[0].toFixed(2)}, ${k[1].toFixed(2)}, ${k[2].toFixed(4)}, ${k[3].toFixed(2)}, ${k[4].toFixed(2)}],`)
}
console.log(']')
