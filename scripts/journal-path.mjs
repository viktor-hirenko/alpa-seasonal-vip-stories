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
 *   ANCHOR — NOT measured against the clip. It is the pose table as it stood
 *   before, solved from the storyboard's own `Component 17` AABB and agreeing
 *   with the mock to 0-2 design px. The clip does not agree with it, and this
 *   table does not pretend otherwise: see the note on JOURNAL_PATH in slides.js
 *   for the three ways it differs and what it would take to measure them.
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
 * THE ANCHORS — the pose table as it stood before this path replaced it.
 *
 * Solved analytically from the `Component 17` AABB in each 1080x1920 storyboard
 * frame, residual <= 3e-5, and checked by `npm run audit`: our settled poses sit
 * within 0-2 design px of the mock on every one. They are kept here, in the
 * reduction script rather than in the runtime, because that is exactly their
 * standing now — the origin of a number, not the number itself. The clip
 * disagrees with them in POSITION and SIZE, by an amount no instrument in this
 * repo can yet separate from our own layout error, and it disagrees with them in
 * ANGLE outright, which is why `rot` is taken from the clip and these three are
 * used only as the zero the measured motion is added to.
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
 * FRAME 7 IS DELIBERATELY NOT MEASURED. Its row is where `swingOpen` hands the
 * journal over at t = 6.0, and the entrance ends on exactly this rotationZ of
 * 3.1 (see the last key of swingOpen). The clip's cover is at +15.2 there, so
 * the entrance is wrong by 12 deg as well — but moving this number without
 * moving that key would tear the handover, and the entrance is frozen. Recorded
 * as an open defect instead.
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
  7: { rot: 3.1, scale: 0.746, cx: 57.7, cy: 48.7 },
  8: { rot: -10.94, scale: 0.683, cx: 57.4, cy: 47.8 },
  9: { rot: 13.96, scale: 0.682, cx: 49.4, cy: 54.9 },
  10: { rot: -7.59, scale: 0.682, cx: 64.3, cy: 50.8 },
  11: { rot: -0.25, scale: 0.682, cx: 49.5, cy: 63.1 },
  12: { rot: -4.72, scale: 0.682, cx: 75.8, cy: 50.8 },
  13: { rot: 13.2, scale: 0.681, cx: 49.5, cy: 63.1 },
  14: { rot: -8.43, scale: 0.681, cx: 54.8, cy: 50.0 },
  15: { rot: 10.28, scale: 0.681, cx: 54.8, cy: 56.5 },
  16: { rot: -21.89, scale: 0.681, cx: 46.9, cy: 53.9 },
  17: { rot: 15.07, scale: 0.681, cx: 56.3, cy: 51.0 },
  18: { rot: -11.58, scale: 0.681, cx: 56.3, cy: 51.0 },
  19: { rot: 8.36, scale: 0.681, cx: 56.31, cy: 52.48 },
  20: { rot: -24.28, scale: 0.681, cx: 50.25, cy: 53.48 },
  21: { rot: 11.03, scale: 0.681, cx: 50.25, cy: 51.66 },
  22: { rot: -18.22, scale: 0.681, cx: 52.0, cy: 47.3 },
  23: { rot: 13.21, scale: 0.681, cx: 52.0, cy: 50.2 },
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
  if (folds && full.length) full.push({ ...full[full.length - 1], t: +(next.at - 0.02).toFixed(2) })
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
// The head and tail rows join the pool BEFORE thinning, so the curve the
// decimation judges is the curve the runtime draws, ends included.
allFull.unshift({ t: 6.0, ...ANCHOR[7] })
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
 * 6.0 repeating the pose swingOpen ends on lets the path own the journal from
 * the moment the entrance hands it over. It is not an extra number: the first
 * measured row IS that pose (its own reference, dx = dy = 0, size = 1, rot = 0).
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
