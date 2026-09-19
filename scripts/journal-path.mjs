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
const SLIDES = [
  ...slidesSrc.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g),
].map(m => ({ frame: +m[1], at: +m[2], page: m[3] }))

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
  7: { rot: 19.23, scale: 0.74, cx: 58.56, cy: 54.1 }, // clip 19.09 night: pos, size and rot, all three off the clip. Position and size came from 11 seconds of the slide (spread cy 0px cx 2px size 0.3%) and were the 104 px the owner photographed three times — every reading put cy at 53.98-54.22 where we held 48.70. `rot` was the last column here that was still the storyboard's, and it is four degrees: see HANDOVER_ROT in src/journal3d/presets.js, which this row must equal and which this script now READS rather than repeats. The entrance was re-measured with all three rather than after them, so the handover at 6.0 does not tear.
  8: { rot: -11.92, scale: 0.6552, cx: 50.83, cy: 49.38 }, // clip 19.09 night: the PAGE EDGES at 12.04 (`journal-measure --slide 8 --as-motion`), and the whole slide's drift with it
  // ⚠️ THIS SLIDE WAS NEVER THE INSTRUMENT'S TO MEASURE THE OLD WAY. Both
  // instruments that had been pointed at it register CONTENT — `--motion` a
  // clip frame against a clip frame over the journal's region, `clip-fit` our
  // render against the clip — and on frame 8 the clip's page reads "LET'S TAKE
  // A LOOK" where ours reads "READY TO TAKE A LOOK?". There is no shared type
  // to lock onto, so both of them found the room, which is identical on either
  // side, and reported its stillness as the journal's. That is why 07.09 wrote
  // a pose 62 px off the clip, why the 19.09 re-read moved it to 122 px while
  // reporting a 4 px spread, and why `--anchor` on it today spreads 9.5 % in
  // SIZE ALONE across one slide — a journal does not change size by a tenth
  // and back in five seconds.
  //
  // The edge fit shares no content with our page by construction: nothing
  // inside the quad enters its arithmetic. Its readings across this slide walk
  // a smooth arc in all five channels and its backward pass moved two of eleven
  // seconds by 0.05 deg and 0.001 in size, i.e. the chain is self-consistent.
  // Its control is frame 10, where the shipped table is independently verified
  // against the clip to 1 px: there it reads the size to 0.02-0.6 %.
  9: { rot: 6.46, scale: 0.6347, cx: 53.19, cy: 53.15 }, // clip 19.09: pos rot (spread cx 3px rot 0.25deg)
  10: { rot: -1.43, scale: 0.68, cx: 43.4, cy: 49.82 }, // clip 19.09: pos rot (spread cx 2px rot 1.51deg)
  11: { rot: -1.25, scale: 0.6416, cx: 48.26, cy: 50.28 }, // clip 19.09: pos rot (spread cx 3px rot 0.5deg)
  12: { rot: -2.05, scale: 0.6708, cx: 58.17, cy: 47.8 }, // clip 19.09: pos rot (spread cx 2px rot 0.5deg)
  13: { rot: 2.45, scale: 0.6791, cx: 48.22, cy: 52.19 }, // clip 19.09 rot, pos+size 19.09 night (8 seconds, spread cx 19px cy 18px size 2.3% rot 0.5deg)
  // ⚠️ THE 247 PX SPREAD THAT REJECTED THIS SLIDE EARLIER WAS THE TABLE, NOT THE
  // SLIDE. `--anchor` reads each second of a slide and carries it back through
  // the measured drift, which means it renders OUR journal at every one of those
  // seconds — so while JOURNAL_PATH held 55 rows instead of 123 (see the note on
  // decimate below), our render sat somewhere the table did not think it was and
  // the eight readings scattered by 247 px. With the table rebuilt the same eight
  // readings land inside 19 px and the rot they carry matches the type's angle,
  // already shipped, to 0.01 deg. Fixing the table fixed the instrument here.
  14: { rot: -8.68, scale: 0.6472, cx: 43.5, cy: 52.9 }, // clip 19.09: pos rot (spread cx 5px rot 0.76deg)
  15: { rot: 18.78, scale: 0.6255, cx: 58.71, cy: 51.41 }, // clip 19.09: pos rot (spread cx 10px rot 1.16deg)
  16: { rot: -14.64, scale: 0.7, cx: 54.0, cy: 52.6 }, // clip 19.09: pos rot (spread cx 5px rot 1deg)
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
  17: { rot: 22.06, scale: 0.637, cx: 61.0, cy: 52.89 }, // clip 19.09: pos rot (spread cx 13px rot 2.19deg)
  18: { rot: -2.75, scale: 0.642, cx: 48.9, cy: 54.3 }, // clip 19.09: pos rot (spread cx 8px rot 1.76deg)
  19: { rot: 18.11, scale: 0.6485, cx: 46.57, cy: 54.32 }, // clip 19.09: pos rot (spread cx 5px rot 0.37deg)
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
  20: { rot: -12.58, scale: 0.7083, cx: 54.0, cy: 47.0 }, // clip: position and size 07.09 (kept) — ROLL ONLY from the page edges, 19.09 night
  // ⚠️ THE ROLL HERE WAS TEN DEGREES OUT AND THREE INSTRUMENTS NOW SAY SO. The
  // shipped -24.28 came from the registration on 07.09; today `clip-fit`'s own
  // dedicated roll probe puts the clip at -14.96 (0.986 against 0.924 three
  // degrees away, 0.820 at no rotation) and the edge fit walks -12.6 to -15.2
  // across the slide. Ten degrees is what the owner was looking at when he
  // photographed 70.1 s: the page's two copies were the same size and in the
  // same place, and turned against each other.
  //
  // ⚠️ ONLY THE ROLL IS TAKEN FROM THE EDGES HERE, AND THAT IS NOT CAUTION, IT
  // IS A MEASUREMENT. The edge fit is at its noisiest on this slide — scores
  // 0.37-0.55 against frame 8's 0.50-0.61, and its backward pass moved six of
  // ten seconds rather than two of eleven — and its position and size were
  // tried and REJECTED the same evening: with them in place all four of
  // clip-fit's windows agreed, to 13 px, that the page had gone 106 px low and
  // 12 % small. Four windows agreeing is the strongest verdict this project
  // has. So frame 20 keeps the position and size measured on 07.09, which that
  // same test scores at -7/-18 px, and takes from the edges only the one
  // channel three instruments agree the old measurement had wrong.
  //
  // THE DRIFT IS THE 07.09 REGISTRATION'S TOO, for the same reason: it is what
  // the kept position was measured with. The edge run's drift is out of
  // motion.json; only its anchor roll survives, here.
  21: { rot: 3.53, scale: 0.6662, cx: 51.41, cy: 48.13 }, // clip 19.09: pos rot (spread cx 3px rot 0.8deg)
  22: { rot: -14.97, scale: 0.6289, cx: 55.21, cy: 50.96 }, // clip 19.09 night: the PAGE EDGES at 79.04 — the instrument this slide has been waiting for since 07.09
  // THE NOTE THIS REPLACES SAID "not waiting for a better run; it needs a
  // different instrument", and that was exactly right. The clip's `gift` page is
  // a different EDITION of ours — "ENJOY A SPECIAL REWARD FOR YOUR NEXT
  // CHAPTER." over a gold heart tag against our "YOU TURNED THIS VIP JOURNEY..."
  // over the helmet — so no registration that compares CONTENT can work here,
  // and none did: two windows 26/47 px apart, `clip:selftest` reporting no
  // confident peak on this slide and no other, and today's full run scoring
  // 0.467 against a rival of 0.353 with all four windows disagreeing.
  // The edge fit never looks inside the quad, so a different edition of the page
  // costs it nothing. Its eight seconds here walk a smooth arc and its backward
  // pass moved one of them by 0.001 in size.
  23: { rot: 20.61, scale: 0.64, cx: 53.4, cy: 47.35 }, // clip 19.09 night: the PAGE EDGES at 84.03, chained across the outro
  // ⚠️ THE OUTRO IS MEASURED WITH `--chain` AND STOPS AT 87.53, and both halves
  // of that sentence are load-bearing.
  //
  // UNCHAINED, every second of the outro is seeded from OUR table, which here
  // was the storyboard's and out by 13 % in size, so each second set off from
  // the same wrong place: the angle came back 20.6 / 0.1 / 7.6 / 5.6 / 13.6 /
  // 11.8 / -0.7 / 3.0 and the yaw swung +14 / 0 / -16 / -15.5 / +14 / +15. That
  // is a search bouncing between basins, and taking it would have made the
  // journal jitter twenty degrees at the end of the story. Seeded from its
  // neighbour the same eight seconds walk one arc, 20.6 down to 10.8, at scores
  // of 0.65-0.79 — the highest this instrument reaches anywhere in the story.
  //
  // 88.03 IS LEFT OUT because the journal is dissolving by then — TIMING.exit
  // fades `.journal-pos` and the clip's own page goes semi-transparent — so
  // there are no edges left to read. It alone refused to chain and came back
  // 8 deg and 22 deg of yaw away from its neighbour, on a worse score.
  //
  // AND THE SIZE ERROR HERE IS 6 %, NOT THE 25 % clip-fit reports. That number
  // is the type: our final page reads "TO BE CONTINUED... KEEP YOUR COURSE."
  // against the clip's own wording, and a registration that aligns CONTENT
  // charges the difference to the journal. The edge fit never looks inside.
}

/** The storyboard's own `rot`, kept so the two can be printed side by side. */
const MOCK_ROT = {
  7: 3.1,
  8: 3.1,
  9: 4.15,
  10: 7.1,
  11: 12.9,
  12: 12.75,
  13: 7.05,
  14: 2.75,
  15: 2.75,
  16: 6.3,
  17: 4.35,
  18: 4.35,
  19: 4.37,
  20: 3.53,
  21: 3.53,
  22: 1.65,
  23: 1.65,
}

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
const W0 = 1080,
  H0 = 1920
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
  const f = {
    rot: hermite(kept, 'rot'),
    scale: hermite(kept, 'scale'),
    cx: hermite(kept, 'cx'),
    cy: hermite(kept, 'cy'),
  }
  let worst = { e: -1, row: null }
  for (const r of all) {
    const e = Math.max(
      Math.abs(f.rot(r.t) - r.rot) / TOL.rot,
      Math.abs(f.scale(r.t) / r.scale - 1) / TOL.scale,
      ((Math.abs(f.cx(r.t) - r.cx) / 100) * W) / TOL.pos,
      ((Math.abs(f.cy(r.t) - r.cy) / 100) * H) / TOL.pos,
    )
    if (e > worst.e) worst = { e, row: r }
  }
  return worst
}

function decimate(all) {
  if (all.length <= 2) return all.slice()
  let kept = [all[0], all[all.length - 1]]
  const held = new Set(kept)
  for (;;) {
    const w = worstError(kept, all)
    // A ROW ALREADY KEPT CANNOT BE KEPT AGAIN, and this guard is not
    // theoretical. Two rows at the SAME t carrying different values are a
    // contradiction no spline can satisfy, so the worst row stays the worst
    // however many times it is added. Without the guard the greedy loop spent
    // its entire budget re-adding one instant — 95 copies of t=6.00 — and
    // stopped on `kept.length >= all.length` before it had looked at any other
    // slide. That is how 19.09 shipped a path with 55 real rows where it had
    // 123, and every slide in the story lost the rows that shape it.
    if (w.e <= 1 || !w.row || held.has(w.row) || kept.length >= all.length) break
    held.add(w.row)
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
  /**
   * THE LAST SLIDE HAS NO FOLD TO CARRY INTO, IT HAS THE DISSOLVE (2026-09-19).
   *
   * There is no `next` after the outro, so `folds` is false and the path simply
   * stopped at its last measured second — and since 19.09 that second is 87.53
   * rather than 88.03, the dissolving frame having no edges left to read. The
   * spline holds past its last row, so the journal would stand perfectly still
   * for the 0.57 s between there and `TIMING.exit.at` at 88.1: the same dead
   * stop the note above was written about, put back at the very end of the
   * story where it is least excusable.
   *
   * So the outro gets the same tail row every other slide gets, carried to the
   * instant the exit takes over instead of to the next slide's cut.
   *
   * ⚠️ "LAST" IS NOT "HAS NO NEXT ROW IN SLIDES". The outro's samples are all
   * filed under frame 23, and SLIDES does carry a frame 24 after it — not a page
   * change but the marker the retired `recede` hung its pose on. So the test is
   * whether any LATER slide shows a different page, which is what a fold is.
   */
  const EXIT_AT = 88.1
  const lastPage = !SLIDES.some(x => x.at > s.at + 1e-6 && x.page !== s.page)
  const carryTo = folds ? +(next.at - 0.02).toFixed(2) : lastPage ? EXIT_AT : null
  if (carryTo != null && full.length) {
    const last = full[full.length - 1]
    const prev = full.length > 1 ? full[full.length - 2] : null
    const t = carryTo
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
  report.push({
    frame: s.frame,
    page: s.page,
    samples: samples.length,
    keys: 0,
    rotFrom: 0,
    rotTo: samples[samples.length - 1].rot,
    span,
    dCx: samples[samples.length - 1].dx,
    dCy: samples[samples.length - 1].dy,
    dScale: +((samples[samples.length - 1].size - 1) * 100).toFixed(1),
  })
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
const HANDOVER_ROT = Number(
  readFileSync(`${ROOT}src/journal3d/presets.js`, 'utf8').match(
    /export const HANDOVER_ROT = ([\d.-]+)/,
  )[1],
)

/**
 * ⚠️ THE COVER'S ROLL: TWO INSTRUMENTS, TEN DEGREES APART, AND NEITHER IS SLOPPY.
 *
 * The value above and the whole entrance ramp under it come from the TYPE'S
 * STEMS (`journal-measure --roll`), which read the clip at 2.40 / 4.27 / 5.00 /
 * 5.85 / 6.34 / 7.21 / 7.85 / 8.59 / 9.03 / 9.58 / 10.04 over 4.60..6.00 — a
 * straight line at 4.644 deg/s with an rms of 0.081. That is not a noisy fit.
 *
 * The REGISTRATION says the clip's cover is at about 19 deg and stays there,
 * and it says so four times, confidently, at four different seconds:
 *
 *     5.50   clip 18.35   roll probe +10.50   0.987 / 0.908 / 0.727
 *     5.75   clip 19.56   roll probe +10.25   0.991 / 0.884 / 0.706   2 of 2 windows to 1 px
 *     6.00   clip 19.23   --anchor, 11 seconds, spread 0.06 deg
 *     6.95   clip 18.57   roll probe  +4.00   0.991 / 0.853 / 0.797   2 of 2 windows to 3 px
 *
 * Flat at ~19 against a line climbing to 10. They cannot both be the clip.
 *
 * NOTHING IS DECIDED HERE, on purpose. Taking 19 means re-measuring the whole
 * entrance ramp behind it, and 19.09 already recorded that taking the OTHER
 * side (anchor 10.04) measured worse on the clip. The position and size above
 * are taken because no instrument contradicts them; this column waits for the
 * one test that settles it, which is the owner's own: render the cover at each
 * angle and look at the blend. See _context/90-next-session.md.
 */

// The head row joins the pool BEFORE thinning, so the curve the decimation
// judges is the curve the runtime draws, ends included.
//
// ⚠️ IT IS THE HEAD ROW, NOT AN EXTRA ONE. Since the cover's drift was measured
// from 6.0 (19.09) the motion run already puts a sample there, and unshifting a
// second one left the pool holding two rows at the same instant with different
// rolls — this 10.04 and the anchor's 15.23. Where the run reaches 6.0 the
// handover therefore overrides the ROLL of the row that is already there, that
// being the one column the handover constrains: the entrance lands on
// HANDOVER_ROT and the path has to leave from the same angle or the two tear.
const head = allFull.find(r => Math.abs(r.t - 6.0) < 1e-6)
if (head) head.rot = HANDOVER_ROT
else allFull.unshift({ t: 6.0, ...ANCHOR[7], rot: HANDOVER_ROT })
allFull.sort((a, b) => a.t - b.t)
const keptAll = decimate(allFull)
for (const r of report)
  r.keys = keptAll.filter(k => {
    let f = SLIDES[0].frame
    for (const x of SLIDES) if (x.at <= k.t + 1e-6) f = x.frame
    return f === r.frame
  }).length
const out = keptAll.map(k => [
  k.t,
  +k.rot.toFixed(2),
  +k.scale.toFixed(4),
  +k.cx.toFixed(2),
  +k.cy.toFixed(2),
])
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

console.log(
  `${rows.length} samples in, ${dropped} dropped as unconfident, ${out.length} keys out.\n`,
)
console.log(
  'frame page                 n  keys   drot     dcx    dcy   dsize   farthest    rot: mock -> clip',
)
for (const r of report)
  console.log(
    String(r.frame).padStart(5) +
      '  ' +
      r.page.padEnd(20) +
      String(r.samples).padStart(3) +
      String(r.keys).padStart(6) +
      r.rotTo.toFixed(2).padStart(8) +
      r.dCx.toFixed(0).padStart(8) +
      r.dCy.toFixed(0).padStart(7) +
      ((r.dScale >= 0 ? '+' : '') + r.dScale.toFixed(1)).padStart(7) +
      ' %' +
      r.span.toFixed(0).padStart(10) +
      ' px' +
      MOCK_ROT[r.frame].toFixed(2).padStart(12) +
      ' ->' +
      ANCHOR[r.frame].rot.toFixed(2).padStart(8) +
      (Math.sign(MOCK_ROT[r.frame]) !== Math.sign(ANCHOR[r.frame].rot) ? '   SIGN' : ''),
  )

writeFileSync(
  REF,
  JSON.stringify(
    {
      measured: new Date().toISOString().slice(0, 10),
      src: SRC,
      tol: TOL,
      units: "dx/dy design px, size ratio, rot degrees, all relative to the slide's first sample",
      rows: good,
    },
    null,
    1,
  ),
)
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
  console.log(
    `  [${k[0].toFixed(2)}, ${k[1].toFixed(2)}, ${k[2].toFixed(4)}, ${k[3].toFixed(2)}, ${k[4].toFixed(2)}],`,
  )
}
console.log(']')
