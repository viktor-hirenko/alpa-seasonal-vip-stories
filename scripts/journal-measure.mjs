#!/usr/bin/env node
/**
 * THE JOURNAL'S POSE IN THE CLIP, FROM ITS EDGES, AS FOUR NUMBERS.
 *
 *   node scripts/journal-measure.mjs --selftest          prove the method first
 *   node scripts/journal-measure.mjs --t 41.4 42.6       one or more seconds
 *   node scripts/journal-measure.mjs --slide 14          one slide, sampled
 *   node scripts/journal-measure.mjs --all               the whole story
 *   node scripts/journal-measure.mjs --t 41.4 --overlay  ...and draw the result
 *
 * WHY A FOURTH INSTRUMENT, when clip-fit.mjs already measures the journal.
 *
 * `clip-fit` registers the two pictures by their GRADIENT FIELD over the whole
 * front face, which is dominated by the page's own type and art. That is the
 * right instrument for "how far apart are we, frame and page together", and it
 * is what re-shot the entrance, where the face is a single piece of cover art
 * laid out the same way on both sides.
 *
 * It is the WRONG instrument for a data page, and the control says so out loud.
 * Draw the quad `clip-fit --solve/--pose` implies onto OUR OWN render and it
 * lands exactly on our page's edge (`pose-self-*.png`); draw the SAME quad onto
 * the clip and it floats 40-75 design px outside the clip's page. Our layout and
 * the clip's are not the same edition — on frame 14 our heading takes two lines
 * with the digit tiles under it and the clip's takes three with the tiles beside
 * it — so a fit that aligns the CONTENT cannot be aligning the FRAME. The same
 * effect is visible in clip-fit's own self-test 2b, where our render against the
 * Figma render of the same frame reports shifts of +34..+163 px on pages whose
 * journal box agrees to 0-2 px.
 *
 * So this script measures the one thing both sides certainly share: THE FOUR
 * EDGES OF THE PAGE. Nothing inside the quad enters the arithmetic.
 *
 * HOW.
 *   1. The projection is not searched, it is COMPUTED. On a settled slide the
 *      journal has rotationX = rotationY = 0 and no z, so the front face is a
 *      plane parallel to the screen: the whole 3D chain collapses to a 2D
 *      similarity times one constant, K = persp / (persp - jd/2), the face being
 *      half the spine's depth closer to the camera than the box's origin.
 *      Checked against the browser's own getBoundingClientRect projection on
 *      three unrelated poses: every corner within 1.1 design px (--selftest).
 *      That is what takes the browser out of the search loop and makes a dense
 *      sweep of the whole story affordable.
 *   2. A candidate pose is scored by an ORIENTED CHAMFER: the picture's edge
 *      pixels are sorted into four bins by the direction of their gradient, each
 *      bin gets a distance transform, and a pose scores by how close its four
 *      sides lie to edges pointing the right way. Orientation is what keeps the
 *      quad off the room's own furniture. A sample off-canvas scores zero, so a
 *      pose cannot buy points by leaving the frame.
 *   3. Coordinate descent down four funnel radii (60, 30, 12, 5 px), position
 *      first, then angle, then size. See the note on `chamfer` for why the
 *      obvious score — the gradient under the outline — cannot be searched at
 *      all, and what it is still good for.
 *
 * WHAT IT CANNOT DO. It measures a plane. During the entrance and through a page
 * turn the journal is yawed, the face is keystoned, and four numbers cannot
 * describe it — those seconds belong to `clip-fit --solve` and to the silhouette
 * width. This script refuses to report them rather than reporting nonsense: any
 * second within `TURN_BLIND` of a slide's start is skipped.
 *
 * WHAT WAS TRIED AND FAILED, so nobody spends the afternoon again: thresholding
 * the difference mask `preview` minus `clean bg` and taking the journal as its
 * largest connected component. On the ENTRANCE that mask is the instrument (the
 * cover is bright art against an unlit room). On a settled slide it is not: the
 * page's interior is dark, so the mask is bright only where the CONTENT is, and
 * the largest component at any usable threshold is the game thumbnail. At a
 * threshold low enough to close the page into one blob, the journal's own light
 * spilling onto the room's pillars joins it and the blob spans the full width.
 * Measured at t = 40.2 / 41.4 / 42.6, thresholds 20/30/45/60.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { pyramid, maskPyramid, register, margin, quadMask, reachMask, offsetQuad } from './lib/gradfit.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const CLIP = `${ROOT}_refs/DP-15152 - preview.mp4`
const OUT = process.env.JM_OUT || `${ROOT}_refs/pose`
const REF = `${ROOT}scripts/journal-reference.json`

export const W = 1080
export const H = 1920

/** Face geometry, mirroring src/story/journalGeometry.js. */
const FACE = { cover: { w: 1465, h: 1868 }, page: { w: 1564, h: 1911 } }
/** Camera and spine, mirroring src/story/timing.js and journalGeometry.js. */
const PERSP = 1800
const JD = 34
/** The front face rides half the spine towards the camera, unscaled. */
const DZ = JD / 2

/**
 * Seconds after a slide's start during which the journal is still turning and a
 * flat pose is meaningless: TIMING.flip.out + TIMING.flip.back, plus a frame.
 */
const TURN_BLIND = 0.14 + 0.79 + 0.04

const ff = (a, stdin) => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30, input: stdin })

// ===========================================================================
// THE FORWARD MODEL
// ===========================================================================

/**
 * The four corners of the front face, in design px, for a pose — TL, TR, BR, BL.
 *
 * THE WHOLE 3D CHAIN, and it has to be the whole chain rather than a similarity,
 * because the journal in the clip is YAWED. Measured: the clip's top and bottom
 * page edges are not parallel — they diverge by 6.0 to 7.0 degrees — and a flat
 * rectangle cannot do that at any rotation or size. Calibrated against renders
 * of our own journal at rotationY 0, +8 and -8 (`clip-fit --pose ...,<rotY>`):
 * +8 degrees of yaw produces exactly 6.0 degrees of divergence with the top edge
 * the shallower of the two, which is the sign the clip shows. So the clip sits
 * at roughly +8 degrees of yaw where every settled pose in slides.js says zero.
 *
 * The chain: scale, the face's own translateZ of half the spine, rotateY,
 * rotateZ, the centre placed by cx/cy, then the perspective divide about the
 * middle of the stage. Checked against the browser's own projection on the three
 * yaw values above: worst corner 0.6 design px (--selftest).
 */
export function quadOf(pose, face = 'page') {
  const { w, h } = FACE[face]
  const s = pose.scale
  const ty = ((pose.rotY || 0) * Math.PI) / 180
  const tz = (pose.rot * Math.PI) / 180
  const cx = (pose.cx / 100) * W
  const cy = (pose.cy / 100) * H
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([u, v]) => {
    const X = u * s,
      Y = v * s
    const X1 = X * Math.cos(ty) + DZ * Math.sin(ty)
    const Z1 = -X * Math.sin(ty) + DZ * Math.cos(ty)
    const X2 = X1 * Math.cos(tz) - Y * Math.sin(tz)
    const Y2 = X1 * Math.sin(tz) + Y * Math.cos(tz)
    const k = PERSP / (PERSP - Z1)
    return [W / 2 + (cx + X2 - W / 2) * k, H / 2 + (cy + Y2 - H / 2) * k]
  })
}

// ===========================================================================
// PICTURES AND GRADIENTS
// ===========================================================================

/** One frame of the clip as raw rgb24 on the canvas grid. */
const clipFrame = t =>
  ff(['-ss', String(t), '-i', CLIP, '-frames:v', '1', '-vf', `scale=${W}:${H}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/** A still on the canvas grid — used by the self-test on our own renders. */
const pngFrame = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/** Luma, as floats: the distance transform below is built from its gradient. */
function luma(rgb) {
  const g = new Float32Array(W * H)
  for (let i = 0, p = 0; i < g.length; i++, p += 3)
    g[i] = 0.299 * rgb[p] + 0.587 * rgb[p + 1] + 0.114 * rgb[p + 2]
  return g
}

/** Central-difference gradient of a luma plane. */
function gradient(g) {
  const gx = new Float32Array(W * H)
  const gy = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      gx[i] = (g[i + 1] - g[i - 1]) * 0.5
      gy[i] = (g[i + W] - g[i - W]) * 0.5
    }
  }
  return { gx, gy }
}

// ===========================================================================
// THE SCORE
// ===========================================================================

const SAMPLES = 220 // per edge

/**
 * WHICH SIDES ARE JUDGED. All four, and that was tested rather than assumed.
 *
 * The quad's shape is rigid, so three sides already determine it, and the top
 * edge is by far the weakest on the clip — fitting each side on its own gives it
 * 4.6 and 5.3 against 27 and 30 for the bottom, because along the top the page
 * is dark against an unlit room. Dropping it therefore looked obvious. It is
 * wrong: without the top edge the self-test on our own renders goes from clean
 * to three failures out of three, the worst 6.2 % of size and 42 design px. The
 * weak edge carries little, but what it carries is the part nothing else does.
 * Sides are indexed the way quadOf returns corners: 0 top, 1 right, 2 bottom,
 * 3 left.
 */
const SIDES = [0, 1, 2, 3]
/**
 * AND WITH WHAT WEIGHT. EQUAL — weighting the bottom edge up was tried and it
 * measures worse, so `--wside` is kept only so the experiment can be repeated
 * rather than taken on trust.
 *
 * The idea is tempting: on a clip frame the top edge is dark page against an
 * unlit room and fits at 4.6 grey levels per pixel where the bottom fits at 27,
 * so counting the strong edge for more looks like listening to the better
 * witness. Run at `--wside 0.5,1,2,1` it does raise the score — 0.56 to 0.68 on
 * frame 14 — and that rise is mechanical: the average is simply taken over less
 * of the weakest side.
 *
 * What it costs: THREE OF THE FIVE self-test cases fail, against none at equal
 * weights. Case 1 lands 13.3 design px out with 1.0 % of size and reports a yaw
 * of -1 where the truth is 0; case 3 lands 17.2 px and 2.1 % out; case 5, the
 * -8 yaw, comes back -9.5 and 12.7 px out. On the clip the trajectory frays in
 * the same way: frame 14 at t = 42.84 jumps to -5.56 deg with 11.5 deg of yaw
 * between neighbours sitting at -8.4 and -6.5 with 6.0.
 *
 * The reason is the reason the whole session exists. THE YAW IS NOTHING BUT THE
 * DIVERGENCE OF THE TOP EDGE FROM THE BOTTOM ONE. Discount the top and the one
 * axis being measured loses the only witness it has. The weak edge carries
 * little, and what it carries is the part nothing else does — the same finding
 * SIDES records for dropping it outright.
 */
let SIDE_W = [1, 1, 1, 1]
const NBIN = 8 // gradient-direction bins over the full 360 degrees

/**
 * ORIENTED CHAMFER — the field the search rolls down.
 *
 * WHY NOT THE OBVIOUS SCORE. The first version scored a pose by the gradient
 * under its outline, sampled point by point. That number is exactly right and
 * completely unusable: measured on a render whose pose is known, it reads 9.75
 * at the truth and 3.6 one design pixel away. It is a needle, not a peak, so a
 * search starting anywhere realistic never finds it, and blurring the picture to
 * widen the basin destroys the very thing being measured — the page's edge is a
 * thin bright rim, and an 8 px blur flattens it to nothing (1.55 at the truth,
 * with neighbours scoring HIGHER).
 *
 * So the edge pixels are found ONCE, sorted into four bins by the direction of
 * their gradient, and each bin gets a distance transform. A pose is then scored
 * by how close its four sides lie to edges POINTING THE RIGHT WAY, which is a
 * smooth funnel of a chosen radius. Orientation is what keeps the quad off the
 * room's own furniture: a horizontal handrail cannot attract a vertical side.
 *
 * Measured on the same known pose: monotone towards the truth on all four axes
 * at every radius tried (12, 30 and 60 px), from 26 px and 5 % away.
 *
 * THE BINS RUN OVER THE FULL 360 DEGREES, NOT 180, and that is not a detail.
 * The journal's border is a glowing strip about 45 design px wide, so every side
 * of the page offers TWO parallel edges: the outer one, which is the face's own
 * boundary and the thing a pose describes, and the inner one, where the glow
 * meets the dark page. Folded onto 180 degrees the two are indistinguishable,
 * and the solver sat on the inner one — 40 and 73 design px of `cx` error on our
 * own renders, with every other number exact and the score perfectly confident.
 * Signed, they are opposites: at the outer edge the picture goes dark to bright
 * INWARD, at the inner edge it goes bright to dark. So a side only matches edges
 * whose gradient points into the journal.
 */
function chamfer(rgb, keep = 0.06) {
  const { gx, gy } = gradient(luma(rgb))
  const mag = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) mag[i] = Math.hypot(gx[i], gy[i])
  const sorted = Float32Array.from(mag).sort()
  const th = sorted[Math.floor((1 - keep) * sorted.length)]
  const D = []
  for (let b = 0; b < NBIN; b++) D.push(new Float32Array(W * H).fill(1e6))
  for (let i = 0; i < W * H; i++) {
    if (mag[i] < th) continue
    let a = Math.atan2(gy[i], gx[i])
    if (a < 0) a += 2 * Math.PI
    D[Math.min(NBIN - 1, Math.floor((a / (2 * Math.PI)) * NBIN))][i] = 0
  }
  // Two-pass chamfer, 3-4 neighbourhood: an approximate Euclidean distance that
  // costs two sweeps rather than a queue, and is well inside a pixel over the
  // radii this search uses.
  for (const d of D) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        let v = d[i]
        if (x > 0) v = Math.min(v, d[i - 1] + 1)
        if (y > 0) v = Math.min(v, d[i - W] + 1)
        if (x > 0 && y > 0) v = Math.min(v, d[i - W - 1] + 1.414)
        if (x < W - 1 && y > 0) v = Math.min(v, d[i - W + 1] + 1.414)
        d[i] = v
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x
        let v = d[i]
        if (x < W - 1) v = Math.min(v, d[i + 1] + 1)
        if (y < H - 1) v = Math.min(v, d[i + W] + 1)
        if (x < W - 1 && y < H - 1) v = Math.min(v, d[i + W + 1] + 1.414)
        if (x > 0 && y < H - 1) v = Math.min(v, d[i + W - 1] + 1.414)
        d[i] = v
      }
  }
  return { D, sharp: { gx, gy } }
}

/**
 * Which direction bin an edge of the quad expects under it: the INWARD normal.
 *
 * The corners come out of quadOf in TL, TR, BR, BL order, so walking side e from
 * quad[e] to quad[e+1] keeps the journal on the right-hand side, and the inward
 * normal of (dx, dy) is (-dy, dx) rotated the other way — (dy, -dx) — in a
 * y-down coordinate system.
 */
function binOf(dx, dy) {
  let a = Math.atan2(-dx, dy) // inward normal, in [0, 2pi)
  if (a < 0) a += 2 * Math.PI
  return Math.min(NBIN - 1, Math.floor((a / (2 * Math.PI)) * NBIN))
}

/** Chamfer score: 1 at the edge, 0 at `dmax` and beyond, averaged over sides. */
function fieldScore(fld, quad, dmax, sides = SIDES) {
  let sum = 0
  let wsum = 0
  for (const e of sides) {
    const a = quad[e],
      b = quad[(e + 1) % 4]
    const dx = b[0] - a[0],
      dy = b[1] - a[1]
    // The bin either side of the expected one is accepted too: a border is not
    // exactly straight, and 45-degree bins with no slack would drop a side that
    // is merely a little curved.
    const b0 = binOf(dx, dy)
    const dA = fld.D[b0]
    const dB = fld.D[(b0 + 1) % NBIN]
    const dC = fld.D[(b0 + NBIN - 1) % NBIN]
    let side = 0
    for (let i = 0; i < SAMPLES; i++) {
      const u = (i + 0.5) / SAMPLES
      const x = Math.round(a[0] + dx * u),
        y = Math.round(a[1] + dy * u)
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const p = y * W + x
      side += Math.max(0, 1 - Math.min(dA[p], dB[p], dC[p]) / dmax)
    }
    // A floor, so a side that is genuinely off-canvas does not zero the product
    // and take the other three down with it.
    sum += (side / SAMPLES) * SIDE_W[e]
    wsum += SIDE_W[e]
  }
  return wsum ? sum / wsum : 0
}

/** Which sides the score is allowed to use. See SIDES below. */

/**
 * How much edge actually lies under the outline, in grey levels per pixel. This
 * is the needle — useless to search with, but the honest number to REPORT: it
 * says whether the pose found is sitting on a real edge or on nothing.
 */
function sharpScore(fld, quad) {
  const { gx, gy } = fld.sharp
  let sum = 0
  for (let e = 0; e < 4; e++) {
    const a = quad[e],
      b = quad[(e + 1) % 4]
    const dx = b[0] - a[0],
      dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len,
      ny = dx / len
    for (let i = 0; i < SAMPLES; i++) {
      const u = (i + 0.5) / SAMPLES
      const x = Math.round(a[0] + dx * u),
        y = Math.round(a[1] + dy * u)
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue
      const p = y * W + x
      sum += Math.abs(gx[p] * nx + gy[p] * ny)
    }
  }
  return sum / (4 * SAMPLES)
}

/**
 * Coordinate descent down four funnel radii, position first, then angle, then
 * size — position is what the wide funnel resolves best and it is what the other
 * two are most sensitive to. `span` caps how far the answer may travel from its
 * seed, so a pose cannot walk off onto the room's own edges without saying so.
 *
 * THE YAW IS NOT ONE OF THE AXES HERE. Let all five loose together and the
 * search trades yaw against size and position: on our own renders, where the
 * truth is known, that cost 3.9 degrees of roll, 5 % of size and 49 design px.
 * Yaw is the weakest of the five — it shows only in how far the top and bottom
 * edges diverge — so it is swept from outside, by solvePose.
 */
function solveFlat(fld, start, face, rotY, bounds) {
  let best = { ...start, rotY }
  const stages = [
    { dmax: 60, cx: 1.0, cy: 1.0, rot: 1.0, scale: 0.02, passes: 3 },
    { dmax: 30, cx: 0.4, cy: 0.4, rot: 0.4, scale: 0.008, passes: 3 },
    { dmax: 12, cx: 0.15, cy: 0.15, rot: 0.15, scale: 0.003, passes: 3 },
    { dmax: 5, cx: 0.05, cy: 0.05, rot: 0.05, scale: 0.001, passes: 3 },
  ]
  for (const st of stages) {
    const sc = p => fieldScore(fld, quadOf(p, face), st.dmax)
    for (let pass = 0; pass < st.passes; pass++) {
      for (const key of ['cx', 'cy', 'rot', 'scale']) {
        let bv = sc(best)
        let moved = true
        while (moved) {
          moved = false
          for (const dir of [1, -1]) {
            const cand = { ...best, [key]: best[key] + dir * st[key] }
            // EVERY leash is tied to a fixed centre, never to this round's own
            // start, so neither polishing nor chaining can walk the answer away
            // a step at a time. There are two of them when a run is chained:
            // see solvePose.
            if (bounds.some(b => Math.abs(cand[key] - b.centre[key]) > b.span[key])) continue
            const v = sc(cand)
            if (v > bv) {
              bv = v
              best = cand
              moved = true
            }
          }
        }
      }
    }
  }
  return best
}

/**
 * The pose, yaw included: a global sweep of the yaw with a full flat solve under
 * every value of it, then a finer sweep around the winner.
 *
 * Global rather than iterative because the yaw's landscape is shallow and has
 * more than one bump — a descent started 6 degrees out settled 10 degrees away
 * on an answer that was known. Sweeping it costs 25 flat solves per frame and
 * buys a number that survives its own self-test.
 */
export function solvePose(fld, seed, face = 'page', opt = {}) {
  seed = { rotY: 0, ...seed }
  // TWO LEASHES, AND EACH ANSWERS A DIFFERENT QUESTION.
  //
  // `span` is how far one second may sit from the second before it, and it is
  // sized off the motion already measured: the widest slide travels 176 design
  // px, turns 16 deg and grows 6.9 % over about five seconds, so 0.4 s of it is
  // 14 px, 1.3 deg and 0.6 %. Three times that is generous and still refuses a
  // jump onto the room's own furniture.
  //
  // `keep` is how far the whole chain may sit from OUR TABLE, and without it a
  // chain has nothing to hold it at all. Measured, with the step leash alone:
  // the scale walked from 0.683 down to 0.230 over ninety steps and the tilt
  // from -6 to -25 deg, every step legal, every pose scoring 0.5 to 0.65 on the
  // way. A leash tied to the previous answer only ever bounds the STEP.
  //
  // The table is wrong — that is this whole session — but it is wrong by a
  // measured amount, not by an order: 12 deg of tilt and about 130 design px on
  // frame 14. The keep-leash is set at several times that, so it contains every
  // disagreement the clip has actually shown and none of the collapses.
  const span = opt.span || { cx: 12, cy: 12, rot: 14, scale: 0.2 }
  const bounds = [{ centre: seed, span }]
  if (opt.keep) bounds.push(opt.keep)
  const at = (y, from) => {
    const p = solveFlat(fld, from, face, y, bounds)
    return { p, v: fieldScore(fld, quadOf(p, face), 12) }
  }
  // THE YAW GETS A LEASH TOO, and it needed one most of all. It is swept from
  // outside the flat solve, so it was the one column with no tie between
  // neighbours at all — and it showed: half a second apart it came back +0.5
  // and -14.5 on the same settled slide. The scene's yaw is a property of the
  // shot, not of the frame; it moves slowly or not at all. Within a chain the
  // sweep is therefore local, and only the second that starts a run — the one
  // with no neighbour to believe — sweeps the whole range.
  const yawFrom = opt.yawNear ?? null
  const sweep = from => {
    let r = null
    if (yawFrom === null) {
      for (let y = -16; y <= 16.001; y += 2) {
        const c = at(y, from)
        if (!r || c.v > r.v) r = c
      }
    } else {
      const lo = Math.max(-YAW_MAX, yawFrom - YAW_SPAN)
      const hi = Math.min(YAW_MAX, yawFrom + YAW_SPAN)
      for (let y = lo; y <= hi + 0.001; y += 1) {
        const c = at(y, from)
        if (!r || c.v > r.v) r = c
      }
    }
    for (let y = r.p.rotY - 1.5; y <= r.p.rotY + 1.5001; y += 0.5) {
      if (Math.abs(y) > YAW_MAX) continue
      if (yawFrom !== null && Math.abs(y - yawFrom) > YAW_SPAN) continue
      const c = at(y, from)
      if (c.v > r.v) r = c
    }
    return r
  }
  // THE SWEEP IS RUN AGAIN FROM ITS OWN WINNER, and that is not tidiness.
  // Coordinate descent from a seed that is far off in size AND position gets
  // trapped: on the -8 calibration render, seeded 3 deg / 5 % / 3 % wrong, the
  // solve under yaw -8 never moved the size off the seed's 0.7308 and scored
  // 0.334, while yaw -9 escaped to 0.695 and scored 0.583 — so the sweep
  // crowned -9 over a truth of -8. Seeded at the truth instead, the same
  // landscape peaks cleanly on -8 at 0.658. One polish round costs 0.3 s a
  // frame and turns that failure into 0.00 deg.
  let best = null
  let from = seed
  for (let round = 0; round < (opt.rounds ?? 3); round++) {
    const r = sweep(from)
    if (best && r.v <= best.v + 1e-4) break
    best = r
    from = r.p
  }
  const bp = best.p
  const quad = quadOf(bp, face)
  return {
    pose: {
      rot: +bp.rot.toFixed(2),
      scale: +bp.scale.toFixed(4),
      cx: +bp.cx.toFixed(2),
      cy: +bp.cy.toFixed(2),
      rotY: +bp.rotY.toFixed(2),
    },
    score: fieldScore(fld, quad, 12),
    sharp: sharpScore(fld, quad),
    stiff: stiffness(fld, bp, face),
  }
}

/**
 * HOW HARD THE PICTURE PUSHES BACK on each of the four numbers, as the fraction
 * of the score lost by a standard nudge: 1 deg, 1 % of size, 1 % of the canvas.
 *
 * THIS IS NOT A NICETY, it is the difference between a measurement and a guess.
 * When a vertical side of the journal runs off the canvas — which happens
 * whenever the journal is wider than the frame — nothing in the picture opposes
 * sliding the quad sideways, because the top and bottom edges are nearly
 * horizontal and a horizontal slide runs ALONG them. The search then stops
 * wherever it happens to be and reports a number that looks exactly like the
 * other three. Measured on our own renders, where the truth is known: rot and
 * scale came back exact and `cx` was out by 40 and 73 design px on the two
 * frames whose right-hand side is off-frame.
 *
 * So each axis is reported with its own stiffness and the caller drops the soft
 * ones rather than believing them.
 */
function stiffness(fld, pose, face) {
  const base = fieldScore(fld, quadOf(pose, face), 12)
  const nudge = { rot: 1, scale: pose.scale * 0.01, cx: 1, cy: 1, rotY: 1 }
  const out = {}
  for (const k of ['rot', 'scale', 'cx', 'cy', 'rotY']) {
    const lo = fieldScore(fld, quadOf({ ...pose, [k]: pose[k] - nudge[k] }, face), 12)
    const hi = fieldScore(fld, quadOf({ ...pose, [k]: pose[k] + nudge[k] }, face), 12)
    out[k] = +(1 - Math.max(lo, hi) / (base || 1)).toFixed(4)
  }
  return out
}

/** How far one second's yaw may sit from the second before it, and how far
 *  from zero it may sit at all. The outer bound is the sweep's own range: past
 *  it the front face is turning towards edge-on, which is the page turn's
 *  business and not a settled pose's. */
const YAW_SPAN = 5
const YAW_MAX = 16

/** Below this a nudge costs nothing and the axis is not measured at all. */
export const SOFT = 0.02

// ===========================================================================
// DRAWING
// ===========================================================================

function drawQuad(rgb, quad, file, colour = [255, 240, 0]) {
  const b = Buffer.from(rgb)
  const put = (x, y) => {
    x = Math.round(x)
    y = Math.round(y)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        const q = (yy * W + xx) * 3
        b[q] = colour[0]
        b[q + 1] = colour[1]
        b[q + 2] = colour[2]
      }
  }
  for (let e = 0; e < 4; e++) {
    const a = quad[e],
      c = quad[(e + 1) % 4]
    const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]))
    for (let i = 0; i <= n; i++) put(a[0] + ((c[0] - a[0]) * i) / n, a[1] + ((c[1] - a[1]) * i) / n)
  }
  mkdirSync(OUT, { recursive: true })
  ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-frames:v', '1', file], b)
}

// ===========================================================================
// THE ROLL, FROM THE PAGE'S OWN TYPE
// ===========================================================================
//
// WHY A SECOND INSTRUMENT FOR ONE NUMBER. Everything above measures the pose by
// the FOUR EDGES of the page, and on the clip those edges lie. The left side
// offers two parallel candidates 34 design px apart — the face's own edge and
// the outer edge of the spine, the spine glowing the brighter of the two — and
// the top edge fits at 4.6 grey levels per pixel against 27 for the bottom,
// because along the top a dark page meets an unlit room. The score built on
// them does not rank right above wrong: the highest-scoring second of the whole
// story (0.650, slide 9) sits 50-80 design px off the page edge, and a second
// scoring 0.575 sits on all four edges exactly (V-31).
//
// The type does not have those problems. The lines are printed on the page, so
// they turn with it and nothing else; there are hundreds of them; they are the
// highest-contrast thing in the picture; and they do not care that the right
// side of the journal has left the frame or that the spine outshines the edge.
//
// WHAT IS ACTUALLY MEASURED, and it is not the baselines. Every stroke of the
// type belongs to one of two families — the STEMS, which run along the page's
// vertical axis, and the BASELINES and crossbars, which run along its
// horizontal one. It is tempting to read the roll straight off the baselines,
// since the roll is what tips them. That is wrong on this clip, and the forward
// model says by how much:
//
//   the journal in the clip is YAWED about 8 degrees (V-24), and a yaw is a
//   rotation about the page's VERTICAL axis. Under it the baselines stop being
//   parallel to each other — at rot -7.25 and yaw +8 they run -3.88 deg across
//   the top of the page and -9.90 deg across the bottom, a spread of 6.0 deg,
//   and at yaw 20 the spread is 15.6 deg. Their average lands within 0.36 deg
//   of `rot` only if the type is spread evenly down the page, which is a
//   property of the copy, not of the geometry.
//
//   the STEMS are parallel to the axis the yaw turns about, so they stay
//   parallel to each other and to nothing else changes. Checked against the
//   forward model at five rolls (-14, -7.25, 0, +2.75, +20) and four yaws
//   (0, +8, -8, +16): the stem direction comes out at exactly rot + 90 in all
//   twenty, to 1e-4 deg, at any point across the width of the page.
//
// So the stem family is the estimator and the baseline family is the witness:
// the gap between them reads out the yaw the picture has, and it is reported
// but not used. Latin display type is mostly stems, which is the other reason
// this is the strong measurement rather than the clever one.
//
// The two families cannot be confused, because they are picked by ANGLE and not
// by strength: every roll in the story lies inside +-21 deg, so the stems land
// in [45, 135) and the baselines outside it, and a peak that reaches the edge
// of its window is reported as a refusal rather than as a number.

/** Edge-tangent angle of a gradient, folded into [0, 180). */
const tangentOf = (gx, gy) => {
  const a = (Math.atan2(gx, -gy) * 180) / Math.PI
  return ((a % 180) + 180) % 180
}

/**
 * Separable Gaussian, and it is the difference between this measurement working
 * and not working.
 *
 * The gradient every other score in this file uses is a raw central difference,
 * which is what you want for LOCATING an edge and is ruinous for ORIENTING one.
 * A straight line tilted 7 degrees is drawn by the rasteriser as a staircase, so
 * a 3x3 difference walking along it reads a direction that jitters by several
 * degrees from pixel to pixel, and a histogram of those directions is not a
 * spike at the truth but a PLATEAU about 12 degrees wide with the truth on its
 * shoulder. That is exactly what the first run produced, and the picture said so
 * out loud: painted by angle bin, one single straight edge of the game card came
 * out in stripes of three different colours.
 *
 * Blurring first turns the staircase into a ramp. Measured on the five renders
 * whose roll is known, as the worst error over all five, against the smoothing:
 *
 *     sigma      0     1.0    1.5     2.0     3.0
 *     worst   4.63    0.72   0.43    0.32    0.30    degrees
 *     peak/floor 3.9  12.6   14.2    12.5     9.2
 *
 * Accuracy is bought by sigma 1 and is flat after 2; the peak's contrast against
 * the floor of the histogram tops out at 1.5 and falls away again as the letters
 * start merging. 2.0 is taken rather than 1.5 because the clip is a compressed
 * video and our renders are clean PNGs, so the noise this has to survive there
 * is larger than anything in the calibration.
 */
function blurLuma(g, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = []
  let s = 0
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    k.push(v)
    s += v
  }
  for (let i = 0; i < k.length; i++) k[i] /= s
  const t = new Float32Array(W * H)
  const o = new Float32Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) a += g[y * W + Math.min(W - 1, Math.max(0, x + i))] * k[i + r]
      t[y * W + x] = a
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) a += t[Math.min(H - 1, Math.max(0, y + i)) * W + x] * k[i + r]
      o[y * W + x] = a
    }
  return o
}

/**
 * The STORYBOARD's `rot` per slide — what the anchor table held before this
 * measurement replaced it — mirrored here so a run can print the two side by
 * side. If it ever drifts from journal-path.mjs the printout is wrong and
 * nothing else is: it is a comment with a value, not a source of truth.
 */
const MOCK_ROT = { 7: 3.1, 8: 3.1, 9: 4.15, 10: 7.1, 11: 12.9, 12: 12.75, 13: 7.05, 14: 2.75,
  15: 2.75, 16: 6.3, 17: 4.35, 18: 4.35, 19: 4.37, 20: 3.53, 21: 3.53, 22: 1.65, 23: 1.65 }

const ROLL_BINS = 720 // 0.25 deg
const ROLL_LIMIT = 45 // the roll the window is allowed to describe
const ROLL_BLUR = 2 // see blurLuma

/**
 * The roll of the page in one picture, in degrees clockwise, from its type.
 *
 * `quad` is only used to say WHERE the page is, and it is shrunk hard before
 * use: the mask has to survive our own anchor being wrong by the 50-130 design
 * px the clip disagrees with it by (V-25), and it has to keep the room out,
 * because the room has verticals of its own. Nothing else about the quad enters
 * the answer — no edge of it is fitted, so an anchor that is off by 100 px
 * moves the window the type is read through and not the angle read from it.
 */
function rollOf(rgb, quad, opt = {}) {
  const shrink = opt.shrink ?? 150
  const keep = opt.keep ?? 0.08
  const m = quadMask(quad, shrink)
  const { gx, gy } = gradient(blurLuma(luma(rgb), opt.blur ?? ROLL_BLUR))

  // The threshold is taken INSIDE the mask. A global one would be set by the
  // glowing rim around the journal and by the room's own lights, and inside a
  // dark page it would then pass almost nothing.
  const mags = []
  for (let i = 0; i < W * H; i++) if (m[i]) mags.push(Math.hypot(gx[i], gy[i]))
  if (mags.length < 20000) return { ok: false, why: `mask too small (${mags.length} px)` }
  mags.sort((a, b) => a - b)
  const th = mags[Math.floor((1 - keep) * (mags.length - 1))]

  const hist = new Float64Array(ROLL_BINS)
  let n = 0
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (!m[i]) continue
      const g = Math.hypot(gx[i], gy[i])
      if (g < th) continue
      hist[Math.min(ROLL_BINS - 1, Math.floor((tangentOf(gx[i], gy[i]) / 180) * ROLL_BINS))] += g
      n++
    }
  if (n < 2000) return { ok: false, why: `too few edge pixels (${n})` }

  // A light circular smoothing, one degree wide. The stems of real type are not
  // one angle but a narrow spray of them — the sides of a stroke are not exactly
  // parallel, and the raster quantises both — and an argmax over raw quarter-
  // degree bins picks the luckiest of those rather than the middle.
  const sm = new Float64Array(ROLL_BINS)
  const R = 2
  for (let b = 0; b < ROLL_BINS; b++) {
    let s = 0
    for (let d = -R; d <= R; d++) s += hist[(b + d + ROLL_BINS) % ROLL_BINS]
    sm[b] = s / (2 * R + 1)
  }

  const deg = b => (b * 180) / ROLL_BINS
  const bin = d => Math.round((((d % 180) + 180) % 180 / 180) * ROLL_BINS) % ROLL_BINS
  /** Strongest bin whose angle lies within `lo..hi` degrees, and its centroid. */
  const peakIn = (lo, hi) => {
    let bb = -1,
      bv = -1
    for (let b = 0; b < ROLL_BINS; b++) {
      const d = deg(b)
      const inside = lo <= hi ? d >= lo && d <= hi : d >= lo || d <= hi
      if (!inside) continue
      if (sm[b] > bv) {
        bv = sm[b]
        bb = b
      }
    }
    if (bb < 0) return null
    // Centroid over +-3 deg of the winner, on the RAW histogram: the smoothing
    // is there to find the peak, not to place it.
    let w = 0,
      s = 0
    const half = Math.round((3 / 180) * ROLL_BINS)
    for (let d = -half; d <= half; d++) {
      const b = (bb + d + ROLL_BINS) % ROLL_BINS
      w += hist[b]
      s += hist[b] * d
    }
    return { at: deg(bb) + (w ? (s / w) * (180 / ROLL_BINS) : 0), peak: bv, bin: bb }
  }

  // The stems: the window is centred on 90 and is exactly as wide as the rolls
  // the story is allowed to contain, so the baselines cannot be mistaken for it.
  const stem = peakIn(90 - ROLL_LIMIT, 90 + ROLL_LIMIT)
  const base = peakIn(180 - ROLL_LIMIT, ROLL_LIMIT) // wraps through 0
  if (!stem) return { ok: false, why: 'no stem peak' }
  const roll = stem.at - 90

  // HOW MUCH TO BELIEVE IT. Two numbers, both from the histogram itself.
  //   `conf`  — how much of the stem window's weight sits within 5 deg of the
  //             peak. Type gives a spike; a page that is mostly art gives a
  //             smear, and this is what tells them apart without opening the
  //             picture.
  //   `rival` — the best bin in the stem window at least 8 deg away from the
  //             winner, over the winner. Near 1 means the window holds two
  //             candidates and the answer is a coin toss.
  let inWin = 0,
    allWin = 0,
    rival = 0
  const near = Math.round((5 / 180) * ROLL_BINS)
  const far = Math.round((8 / 180) * ROLL_BINS)
  for (let b = 0; b < ROLL_BINS; b++) {
    const d = deg(b)
    if (d < 90 - ROLL_LIMIT || d > 90 + ROLL_LIMIT) continue
    allWin += hist[b]
    let dist = Math.abs(b - stem.bin)
    dist = Math.min(dist, ROLL_BINS - dist)
    if (dist <= near) inWin += hist[b]
    if (dist >= far) rival = Math.max(rival, sm[b])
  }
  return {
    ok: true,
    roll: +roll.toFixed(2),
    stem: +stem.at.toFixed(2),
    baseline: base ? +(base.at > 90 ? base.at - 180 : base.at).toFixed(2) : null,
    conf: +(allWin ? inWin / allWin : 0).toFixed(3),
    rival: +(stem.peak ? rival / stem.peak : 1).toFixed(3),
    px: n,
  }
}

/**
 * The proof picture: the answer drawn ON the type it was read from.
 *
 * A comb along the roll, laid over the lines of text, and a comb along the stem
 * direction, laid over the uprights of the letters. Whether the answer is right
 * is then a thing the eye settles in a second — parallel or not parallel — and
 * not a thing a score is asked about. The region actually sampled is outlined
 * too, so a mask that has slid off the page cannot pass unnoticed.
 */
function drawRoll(rgb, quad, roll, file, shrink = 150) {
  const b = Buffer.from(rgb)
  const put = (x, y, c) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const q = (y * W + x) * 3
    b[q] = c[0]
    b[q + 1] = c[1]
    b[q + 2] = c[2]
  }
  const seg = (x0, y0, x1, y1, c, thick = 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n,
        y = y0 + ((y1 - y0) * i) / n
      for (let t = -thick; t <= thick; t++) put(x, y + t, c)
    }
  }
  const inner = offsetQuad(quad, shrink)
  for (let e = 0; e < 4; e++) seg(inner[e][0], inner[e][1], inner[(e + 1) % 4][0], inner[(e + 1) % 4][1], [90, 90, 255], 0)

  const cx = inner.reduce((a, p) => a + p[0], 0) / 4
  const cy = inner.reduce((a, p) => a + p[1], 0) / 4
  const R = (Math.PI / 180) * roll
  // Along the roll (yellow) — must run along the lines of text.
  // Along the stems (cyan) — must run along the uprights of the letters.
  for (const [ang, colour, span, step, len] of [
    [R, [255, 235, 0], 460, 115, 300],
    [R + Math.PI / 2, [0, 240, 255], 380, 190, 190],
  ]) {
    const ux = Math.cos(ang),
      uy = Math.sin(ang)
    const px = -uy,
      py = ux
    for (let o = -span; o <= span; o += step) {
      const ax = cx + px * o,
        ay = cy + py * o
      seg(ax - ux * len, ay - uy * len, ax + ux * len, ay + uy * len, colour, 1)
    }
  }
  mkdirSync(OUT, { recursive: true })
  ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-frames:v', '1', file], b)
}

// ===========================================================================
// THE STORY TABLE
// ===========================================================================

const { SLIDES, poseAt } = await import(`${ROOT}src/story/slides.js`)
const STORY_END = 88.1

/** The window of a slide in which the journal is settled and flat. */
function windowOf(frame) {
  const i = SLIDES.findIndex(s => s.frame === frame)
  const s = SLIDES[i]
  const next = SLIDES[i + 1]
  const end = next ? next.at : STORY_END
  return { t0: +(s.at + TURN_BLIND).toFixed(3), t1: +(end - 0.06).toFixed(3), slide: s }
}

// ===========================================================================
// MAIN
// ===========================================================================

const argv = process.argv.slice(2)
const has = n => argv.includes(n)
const val = n => (has(n) ? argv[argv.indexOf(n) + 1] : null)
// `--wside 0.5,1,1.5,1` — top, right, bottom, left. For the experiment only.
if (has('--wside')) SIDE_W = val('--wside').split(',').map(Number)

const fmtPose = p =>
  `{ rot: ${p.rot.toFixed(2)}, scale: ${p.scale.toFixed(3)}, cx: ${p.cx.toFixed(1)}, ` +
  `cy: ${p.cy.toFixed(1)}, rotY: ${(p.rotY || 0).toFixed(2)} }`

// ---------------------------------------------------------------- --redraw
//
// DRAW A RUN THAT ALREADY HAPPENED, without solving it again.
//
//   node scripts/journal-measure.mjs --redraw 12.04 18.07 27.04
//
// A run of the whole story is minutes of work and its answers land in
// `_refs/pose/last.json`. Reviewing them means putting the quad back on the
// clip and looking at it, which needs no search at all — so this reads the
// rows and draws, and the picture judged is the one the run actually produced.
if (has('--redraw')) {
  const src = JSON.parse(readFileSync(val('--from') || `${OUT}/last.json`, 'utf8'))
  const want = []
  for (let i = argv.indexOf('--redraw') + 1; i < argv.length && !argv[i].startsWith('--'); i++)
    want.push(Number(argv[i]))
  const rows = want.length ? src.filter(r => want.some(w => Math.abs(r.t - w) < 0.06)) : src
  for (const r of rows) {
    drawQuad(clipFrame(r.t), quadOf(r, r.face), `${OUT}/redraw-${r.t.toFixed(2)}.png`)
    console.log(`${r.t.toFixed(2)}  frame ${r.frame}  ${fmtPose(r)}  score ${r.score}  sharp ${r.sharp}`)
  }
  console.log(`\n-> ${OUT}/redraw-*.png`)
  process.exit(0)
}

// ---------------------------------------------------------------- --yawscan
//
// HOW HARD A PICTURE PINS THE YAW, printed as a landscape rather than a number.
//
//   node scripts/journal-measure.mjs --yawscan _refs/fit/.pose-900c.png -7.25,0.696,51.5,45.7
//
// The yaw is the shallowest of the five axes — it shows only in how far the top
// and bottom edges diverge — so "the solver returned 8.0" and "the picture says
// 8.0" are different claims. This prints the second one: a full flat solve under
// every yaw on the sweep's own grid, with the score each one reaches. A peak
// that beats its neighbours by less than the noise is a refusal, and this is
// where that shows.
if (has('--yawscan')) {
  const png = argv[argv.indexOf('--yawscan') + 1]
  const truth = (val('--truth') || argv[argv.indexOf('--yawscan') + 2] || '').split(',').map(Number)
  const seed = { rot: truth[0], scale: truth[1], cx: truth[2], cy: truth[3] }
  const face = val('--face') || 'page'
  const fld = chamfer(png.endsWith('.png') ? pngFrame(png) : clipFrame(Number(png)))
  console.log(`YAW LANDSCAPE of ${png}, seeded at ${fmtPose({ ...seed, rotY: 0 })}\n`)
  console.log('  rotY    score      rot    scale       cx      cy   sharp')
  for (let y = -14; y <= 14.001; y += 1) {
    const p = solveFlat(fld, { ...seed, rotY: 0 }, face, y,
      [{ centre: { ...seed, rotY: 0 }, span: { cx: 12, cy: 12, rot: 14, scale: 0.2 } }])
    const q = quadOf(p, face)
    console.log(
      y.toFixed(1).padStart(6) + fieldScore(fld, q, 12).toFixed(4).padStart(9) +
        p.rot.toFixed(2).padStart(9) + p.scale.toFixed(4).padStart(9) +
        p.cx.toFixed(2).padStart(9) + p.cy.toFixed(2).padStart(8) +
        sharpScore(fld, q).toFixed(2).padStart(8),
    )
  }
  process.exit(0)
}

// ---------------------------------------------------------------- --selftest
if (has('--selftest')) {
  console.log('SELF-TEST — the method against answers known in advance.\n')
  let fails = 0

  console.log('1. THE FORWARD MODEL against the browser\'s own projection.')
  console.log('   Three poses whose quads clip-fit --pose read out of the DOM.')
  const known = [
    { pose: { rot: -8.75, scale: 0.679, cx: 44.5, cy: 48 },
      q: [[-149, 355], [910, 192], [1109, 1487], [50, 1650]] },
    { pose: { rot: 2.75, scale: 0.681, cx: 54.8, cy: 50.0 },
      q: [[87, 278], [1161, 330], [1098, 1642], [24, 1590]] },
    { pose: { rot: -7.25, scale: 0.696, cx: 51.5, cy: 45.7 },
      q: [[-73, 280], [1017, 141], [1186, 1473], [96, 1612]] },
    // ...and with the yaw the clip turns out to have, both ways.
    { pose: { rot: -7.25, scale: 0.696, cx: 51.5, cy: 45.7, rotY: 8 },
      q: [[-93, 249], [994, 175], [1157, 1453], [84, 1640]] },
    { pose: { rot: -7.25, scale: 0.696, cx: 51.5, cy: 45.7, rotY: -8 },
      q: [[-46, 307], [1030, 106], [1207, 1497], [117, 1585]] },
  ]
  for (const k of known) {
    const mine = quadOf(k.pose, 'page')
    const worst = Math.max(...mine.map((c, i) => Math.hypot(c[0] - k.q[i][0], c[1] - k.q[i][1])))
    const ok = worst <= 2
    if (!ok) fails++
    console.log(`   ${fmtPose(k.pose).padEnd(56)} worst corner ${worst.toFixed(1)} px  ${ok ? 'ok' : 'FAIL'}`)
  }

  console.log('\n2. THE SOLVER against OUR OWN renders, whose pose is known exactly.')
  console.log('   Seeded deliberately wrong, so the search has to travel.')
  const cases = [
    { png: `${ROOT}_refs/fit/.pose-1242.png`, truth: { rot: -8.75, scale: 0.679, cx: 44.5, cy: 48 } },
    { png: `${ROOT}_refs/fit/.pose-1278.png`, truth: { rot: -7.25, scale: 0.696, cx: 51.5, cy: 45.7 } },
    { png: `${ROOT}_refs/fit/.pose-1242b.png`, truth: { rot: 2.75, scale: 0.681, cx: 54.8, cy: 50.0 } },
    // THE YAW, AGAINST A TRUTH THAT IS NOT ZERO. Every case above was rendered
    // flat, so the one axis this measurement leans on hardest had no test that
    // could fail. These are the calibration renders behind V-24 — case 2's pose,
    // yawed +8 and -8. Which render carries which yaw was settled by the
    // browser's own quads in table 1, not by this solver: the true quad scores
    // 22-25 grey levels per pixel under its outline, the two wrong ones 1-3.
    { png: `${ROOT}_refs/fit/.pose-900b.png`,
      truth: { rot: -7.25, scale: 0.696, cx: 51.5, cy: 45.7, rotY: 8 } },
    { png: `${ROOT}_refs/fit/.pose-900c.png`,
      truth: { rot: -7.25, scale: 0.696, cx: 51.5, cy: 45.7, rotY: -8 } },
  ]
  // The third case is the worst geometry the story contains — its right-hand
  // side is off the canvas entirely and its left-hand side sits against the
  // frame edge — so one vertical side has to carry both the size and the
  // position. With both sides visible (cases 1 and 2) the method comes back
  // inside 0.15 % and 2 design px; the tolerance is set by the hard case.
  const TOL = { rot: 0.6, scale: 0.012, pos: 8 }
  for (const c of cases) {
    let rgb
    try {
      rgb = pngFrame(c.png)
    } catch {
      console.log(`   ${c.png} missing — run clip-fit --pose first`)
      fails++
      continue
    }
    const fld = chamfer(rgb)
    const seed = { rot: c.truth.rot + 3, scale: c.truth.scale * 1.05, cx: c.truth.cx - 3,
      cy: c.truth.cy + 3, rotY: 6 }
    const r = solvePose(fld, seed, 'page')
    const dRot = Math.abs(r.pose.rot - c.truth.rot)
    const dSc = Math.abs(r.pose.scale / c.truth.scale - 1)
    const dPos = Math.hypot(((r.pose.cx - c.truth.cx) / 100) * W, ((r.pose.cy - c.truth.cy) / 100) * H)
    // Judge each axis only where the picture actually constrains it. An axis the
    // solver reports as soft is not a wrong answer, it is a refusal — and the
    // test is that it says so, not that it guesses right.
    const soft = k => r.stiff[k] < SOFT
    const bad = []
    if (!soft('rot') && dRot > TOL.rot) bad.push('rot')
    if (!soft('scale') && dSc > TOL.scale) bad.push('scale')
    if (!soft('cx') && Math.abs(((r.pose.cx - c.truth.cx) / 100) * W) > TOL.pos) bad.push('cx')
    if (!soft('cy') && Math.abs(((r.pose.cy - c.truth.cy) / 100) * H) > TOL.pos) bad.push('cy')
    if (!soft('rotY') && Math.abs(r.pose.rotY - (c.truth.rotY || 0)) > TOL.rot) bad.push('rotY')
    if (bad.length) fails++
    const softs = ['rot', 'scale', 'cx', 'cy', 'rotY'].filter(soft)
    console.log(
      `   ${fmtPose(r.pose).padEnd(56)} d ${dRot.toFixed(2)}deg ${(dSc * 100).toFixed(2)}% ` +
        `${dPos.toFixed(1)}px  ${bad.length ? 'FAIL ' + bad.join(',') : 'ok'}` +
        (softs.length ? `   soft: ${softs.join(',')}` : ''),
    )
  }


  console.log('\n3. THE ROLL OFF THE TYPE, on the same renders, whose roll is known.')
  console.log('   No edge of the journal enters this one — only the print on the page.')
  // The pose is handed in as the WINDOW the type is read through, not as an
  // answer: it is shrunk 150 design px before use, so it has to be roughly right
  // and no more. That is the whole point of the instrument — on the clip our
  // anchor is out by 50-130 px (V-25) and this still has to work.
  //
  // The truth for every case is the roll the render was drawn at, INCLUDING the
  // two that carry a yaw. That is not an approximation: a yaw turns the page
  // about its own vertical axis, so the stems stay parallel to it, and the
  // forward model puts the stem direction at exactly rot + 90 at five rolls
  // crossed with four yaws, to 1e-4 deg. The baselines do NOT survive the same
  // test — at yaw 8 they fan out over 6 deg from the top of the page to the
  // bottom — which is why the stems are the estimator and the baselines are only
  // printed. The gap between the two is a witness to the yaw and shows here:
  // it is 0.0 on the three flat renders, +1.15 at yaw +8 and -1.33 at yaw -8.
  const ROLL_TOL = 0.5
  for (const c of cases) {
    let rgb
    try {
      rgb = pngFrame(c.png)
    } catch {
      console.log(`   ${c.png} missing — run clip-fit --pose first`)
      fails++
      continue
    }
    const r = rollOf(rgb, quadOf(c.truth, 'page'))
    if (!r.ok) {
      console.log(`   ${c.png.split('/').pop().padEnd(20)} refused: ${r.why}   FAIL`)
      fails++
      continue
    }
    const d = Math.abs(r.roll - c.truth.rot)
    const ok = d <= ROLL_TOL
    if (!ok) fails++
    console.log(
      `   ${c.png.split('/').pop().padEnd(20)} roll ${r.roll.toFixed(2).padStart(7)} ` +
        `truth ${c.truth.rot.toFixed(2).padStart(7)} (yaw ${String(c.truth.rotY || 0).padStart(3)})  ` +
        `d ${d.toFixed(2)}deg  conf ${r.conf.toFixed(2)} rival ${r.rival.toFixed(2)}  ` +
        `base ${(r.baseline - r.roll).toFixed(2).padStart(6)}  ${ok ? 'ok' : 'FAIL'}`,
    )
  }

  console.log(`\n${fails} case(s) failed.`)
  process.exit(fails ? 1 : 0)
}

// ---------------------------------------------------------------- --motion
//
// HOW THE CLIP'S JOURNAL MOVES INSIDE A SLIDE — measured in the clip alone.
//
//   node scripts/journal-measure.mjs --motion            the whole story
//   node scripts/journal-measure.mjs --motion --slide 14
//
// WHY THIS AND NOT clip-fit. `clip-fit` registers OUR render against the clip,
// so its answer is only as good as the agreement between our page and the clip's
// page — and they are different editions of the copy. Measured: on frame 14,
// where the layouts nearly agree, it scores 0.27-0.33 against a 0.09 rival and
// traces a smooth arc. On frame 8, where the clip reads "LET'S TAKE A LOOK" and
// we read "READY TO TAKE A LOOK?", it scores 0.03-0.05 with the rival ABOVE the
// score on every sample, and its answers jump 200 design px between neighbours
// half a second apart. That is noise wearing the shape of data.
//
// The motion, though, does not need our render at all. Register the clip against
// ITSELF at two seconds of the same slide, over the journal's own region, and
// what comes back is how the journal moved between them — same artwork, same
// renderer, same lighting on both sides, nothing to disagree about. The pose it
// cannot give (that needs an outline in absolute terms, which is what solvePose
// above is for); the CHANGE in pose is exactly what it does give.
//
// The region is our own quad at the slide's anchor pose, grown a little. It only
// has to contain the journal and exclude most of the room: the camera moves
// through the clip too, so the room's own edges are a competing motion.
if (has('--motion')) {
  const want = has('--slide')
    ? SLIDES.filter(s => s.frame === Number(val('--slide')))
    // Frame 23 is excluded: its slide starts exactly where the recede does, so
    // every second of it is the outro's own move, not a slide's drift.
    : SLIDES.filter(s => s.frame >= 8 && s.frame <= 22)
  const step = Number(val('--step') || 0.5)
  /**
   * `--t0`/`--t1` OVERRIDE THE WINDOW, and `--seed` the region it starts from.
   *
   * `windowOf` splits the story at every slide row, which is right everywhere a
   * row means a page turn — and wrong for the OUTRO, where frames 23 and 24 are
   * the same page and nothing folds between them. Left to itself the sampler
   * would measure 84.00..84.94 as frame 23 and 85.97..88.04 as frame 24, two
   * chains each anchored on its own first second, when what is actually there is
   * one continuous four-second drift. Given the range by hand it measures it as
   * one.
   *
   * `--seed rot,scale,cx,cy` replaces the pose the FIRST region is cut from.
   * The region is normally seeded with our own table's pose at t0, and past the
   * table's last row `poseAt` clamps — so on the outro it would cut the window
   * at a roll of +1.65 while the clip's journal sits at +13.2, putting two of
   * the four corners a couple of hundred px into the room. It is only the
   * window, so it may be rough; it just has to contain the journal.
   */
  const seed = (val('--seed') || '').split(',').filter(Boolean).map(Number)
  /**
   * `--roll-type` TAKES THE `rot` COLUMN OFF THE TYPE INSTEAD OF THE REGISTRATION.
   *
   * The registration reports rotation on a coarse grid, which is enough
   * everywhere a slide turns several degrees and useless where it turns one:
   * across the whole outro it answers -0.25 on every sample, while the type says
   * the journal rolls from +13.2 to +14.4 and back to +14.3. A degree and a half
   * is above this project's own tolerance for roll (0.4 deg in the decimation,
   * 0.5 in the self-test), so on that stretch the coarse column is not a
   * measurement, it is a flat line.
   *
   * The type is the instrument session H proved for exactly this number
   * (`--roll`, worst error 0.34 deg against renders whose roll is known), so
   * with this flag every sample is read through it and the column carries the
   * drift from the run's first second. Opt-in: the slides measured before it
   * existed keep the numbers they were measured with.
   */
  const rollTyped = has('--roll-type')
  const ropt = { shrink: Number(val('--shrink') || 150) }
  const out = []
  console.log("THE CLIP'S JOURNAL, MOVING INSIDE ITS OWN SLIDE.")
  console.log('Registered clip-against-clip over the journal region, so neither our')
  console.log('layout nor our pose enters the answer. dx/dy are design px on the')
  console.log('1080x1920 canvas, size is a ratio, rot is degrees clockwise.\n')
  console.log('frame page                     t      dx      dy     size      rot   score  rival')
  for (const s of want) {
    const w = { ...windowOf(s.frame) }
    if (has('--t0')) w.t0 = +Number(val('--t0')).toFixed(3)
    if (has('--t1')) w.t1 = +Number(val('--t1')).toFixed(3)
    const seedPose = seed.length === 4
      ? { rot: seed[0], scale: seed[1], cx: seed[2], cy: seed[3] }
      : poseAt(w.t0)
    // THE CHAIN, not a common reference. Registering every second against the
    // slide's first second looks tidier and measures worse: by the end of a
    // slide the journal has moved 150 design px and turned, and the peak falls
    // below its own neighbourhood — score 0.15 against a rival of 0.20 on the
    // last samples of frame 8, which is a refusal dressed as a number. Half a
    // second apart the journal moves about 30 px and the registration is never
    // in doubt; the steps are then added up. Eight steps of a 2-3 px error
    // against a 150 px journey is a trade worth making, and it lets the search
    // shrink to what one step can be, which is most of the speed.
    let acc = { dx: 0, dy: 0, size: 1, rot: 0 }
    let prevRgb = clipFrame(w.t0)
    let first = true
    // The zero the typed roll is reported against: the run's own first second,
    // so the column stays a DRIFT and the anchor keeps owning the absolute.
    let roll0 = null
    if (rollTyped) {
      const r0 = rollOf(prevRgb, quadOf(seedPose, s.face), ropt)
      if (!r0.ok) throw new Error(`--roll-type: the type at ${w.t0} is unreadable (${r0.why})`)
      roll0 = r0.roll
    }
    for (let t = w.t0; t <= w.t1 + 1e-6; t = +(t + step).toFixed(3)) {
      if (first) {
        out.push({ t: +t.toFixed(3), frame: s.frame, page: s.page, dx: 0, dy: 0,
          size: 1, rot: 0, score: 1, rival: 0 })
        console.log(
          String(s.frame).padStart(5) + '  ' + s.page.padEnd(20) + t.toFixed(2).padStart(7) +
            '     0.0     0.0   1.0000     0.00   (reference)',
        )
        first = false
        continue
      }
      // The region follows the journal: quad at the pose we have accumulated so
      // far, grown outward, so a slide that drifts 150 px does not end up
      // measuring the room on one side.
      const here = { rot: seedPose.rot + acc.rot, scale: seedPose.scale * acc.size,
        cx: seedPose.cx + (acc.dx / W) * 100, cy: seedPose.cy + (acc.dy / H) * 100 }
      const quad = quadOf(here, s.face)
      const mask = quadMask(quad, -50)
      const piv = [(quad[0][0] + quad[2][0]) / 2, (quad[0][1] + quad[2][1]) / 2]
      const Ap = pyramid(prevRgb, 0.14, mask)
      const Mp = maskPyramid(mask)
      const cur = clipFrame(t)
      const Bp = pyramid(cur, 0.14, reachMask(quad, piv, 1.4))
      const best = register(Ap, Bp, Mp, piv, { dSpan: 80, sRange: [0.94, 1.07] })
      const rival = margin(Ap, Bp, Mp, piv, best)
      prevRgb = cur
      acc = { dx: acc.dx + best.dx, dy: acc.dy + best.dy,
        size: acc.size * best.s, rot: acc.rot + best.rot }
      // Read on the region THIS sample was registered into, and it replaces the
      // accumulator rather than being reported beside it: the region of the next
      // sample is cut at `acc.rot`, so leaving the coarse value in would keep
      // aiming the window with the number this flag exists to distrust.
      let rollNote = ''
      if (rollTyped) {
        const now = { rot: seedPose.rot + acc.rot, scale: seedPose.scale * acc.size,
          cx: seedPose.cx + (acc.dx / W) * 100, cy: seedPose.cy + (acc.dy / H) * 100 }
        const rt = rollOf(cur, quadOf(now, s.face), ropt)
        if (rt.ok) acc.rot = +(rt.roll - roll0).toFixed(2)
        else rollNote = '  TYPE UNREADABLE, ROT LEFT COARSE'
      }
      const row = { t: +t.toFixed(3), frame: s.frame, page: s.page,
        dx: +acc.dx.toFixed(1), dy: +acc.dy.toFixed(1), size: +acc.size.toFixed(4),
        rot: +acc.rot.toFixed(2), score: +best.v.toFixed(3), rival: +rival.toFixed(3),
        step: { dx: +best.dx.toFixed(1), dy: +best.dy.toFixed(1), s: +best.s.toFixed(4), rot: +best.rot.toFixed(2) } }
      out.push(row)
      console.log(
        String(s.frame).padStart(5) + '  ' + s.page.padEnd(20) + t.toFixed(2).padStart(7) +
          row.dx.toFixed(1).padStart(8) + row.dy.toFixed(1).padStart(8) +
          row.size.toFixed(4).padStart(9) + row.rot.toFixed(2).padStart(9) +
          row.score.toFixed(3).padStart(8) + row.rival.toFixed(3).padStart(7) +
          (row.score - row.rival < 0.15 ? '  NO CONFIDENT PEAK' : '') +
          (Math.abs(best.dx) > 78 || Math.abs(best.dy) > 78 ||
            best.s < 0.945 || best.s > 1.065 ? '  AT THE SEARCH BOUND' : '') + rollNote,
      )
    }
  }
  mkdirSync(OUT, { recursive: true })
  /**
   * `--merge` KEEPS THE FRAMES THIS RUN DID NOT MEASURE.
   *
   * Without it a `--slide` run overwrites motion.json with its one slide, and
   * the file stops being the story's measurement and becomes the last command's
   * scratch. That is survivable while every slide is re-measured together and
   * ruinous once one of them is not: the outro was measured on its own, months
   * of frames 8..22 were not, and re-shooting them to keep the file whole would
   * silently move fifteen shipped slides — the region a run cuts is seeded from
   * OUR table, and that table has changed since they were measured (frame 14
   * re-runs today one search cell away, 1 px and 0.25 deg).
   *
   * So: rows for the frames in this run replace theirs, every other frame is
   * carried over untouched, and `measured` records both dates.
   */
  const dest = `${OUT}/motion.json`
  let rows = out
  let measured = new Date().toISOString().slice(0, 10)
  if (has('--merge') && existsSync(dest)) {
    const prev = JSON.parse(readFileSync(dest, 'utf8'))
    const mine = new Set(want.map(s => s.frame))
    rows = [...prev.rows.filter(r => !mine.has(r.frame)), ...out].sort((a, b) => a.t - b.t)
    measured = `${prev.measured}, frame ${[...mine].join('/')} ${measured}`
  }
  writeFileSync(dest, JSON.stringify({ measured, rows }, null, 1))
  console.log(`\n-> ${dest}  (${out.length} samples${rows.length !== out.length ? `, ${rows.length} in the file` : ''})`)
  process.exit(0)
}

// ---------------------------------------------------------------- --roll
//
//   node scripts/journal-measure.mjs --roll --t 12.04 18.07 --draw
//   node scripts/journal-measure.mjs --roll --all --draw
//   node scripts/journal-measure.mjs --roll --png _refs/fit/.pose-1242.png -8.75,0.679,44.5,48
//
// The pose after --png is rot,scale,cx,cy[,rotY], the same order --yawscan
// takes. It is only the window the type is read through, so it may be rough.
// `--all` reads one second per slide: the middle of the settled window, which
// is the furthest a sample can be from the page turns on either side of it.
//
// `--shrink N` and `--nudge dx,dy` exist to ATTACK the answer rather than to
// tune it. The window is placed by our own anchor, and on the clip that anchor
// is out by 50-130 design px (V-25) — visible in the drawing at t = 12.04,
// where the sampled region hangs about 100 px past the right-hand edge of the
// page. If the roll moved when the window moved, the number would be a property
// of the window and worthless. Displacing it on purpose is how that is settled,
// and the answer is in the log entry for this session.
if (has('--roll')) {
  const draw = has('--draw')
  const nudge = (val('--nudge') || '0,0').split(',').map(Number)
  const ropt = { shrink: Number(val('--shrink') || 150) }
  const shift = q => q.map(([x, y]) => [x + nudge[0], y + nudge[1]])
  const rows = []
  const png = val('--png')
  if (png) {
    const p = (val('--pose') || argv[argv.indexOf('--png') + 2] || '').split(',').map(Number)
    const pose = { rot: p[0], scale: p[1], cx: p[2], cy: p[3], rotY: p[4] || 0 }
    const rgb = pngFrame(png.startsWith('/') ? png : `${ROOT}${png}`)
    const q = shift(quadOf(pose, val('--face') || 'page'))
    const r = rollOf(rgb, q, ropt)
    console.log(png, JSON.stringify(r))
    if (draw && r.ok) drawRoll(rgb, q, r.roll, `${OUT}/roll-png.png`, ropt.shrink)
    process.exit(0)
  }
  // ------------------------------------------------------------ --anchor
  //
  // THE ONE NUMBER PER SLIDE THAT THE TABLE ACTUALLY TAKES.
  //
  // `journal-path.mjs` builds each row as ANCHOR + MOTION, and the motion of a
  // slide is measured relative to that slide's FIRST measurable second. So the
  // anchor's `rot` is not the roll at any convenient moment — it is the roll at
  // that first second, and everything after it is the drift already measured.
  //
  // Reading one frame there would be cheap and brittle: it sits 0.97 s after the
  // page turn, and a flying object crossing the page at that instant would be
  // the whole answer. So the roll is read at several seconds ACROSS the slide,
  // each is carried back to the first second by subtracting the drift the motion
  // run already recorded for it, and the answer is the median of those. The
  // SPREAD of them is the honest confidence: five independent frames, corrected
  // by an independently measured motion, either agree or they do not, and no
  // histogram statistic has to be believed for that to mean something.
  if (has('--anchor')) {
    const motion = JSON.parse(readFileSync(`${OUT}/motion.json`, 'utf8')).rows
    const byFrame = new Map()
    for (const r of motion) {
      if (!byFrame.has(r.frame)) byFrame.set(r.frame, [])
      byFrame.get(r.frame).push(r)
    }
    const N = Number(val('--n') || 5)
    console.log('THE ROLL AT EACH SLIDE\'S ANCHOR SECOND, from the type on its page.')
    console.log('Each sample is carried back to the anchor second by subtracting the')
    console.log('drift `--motion` measured for it, so the columns are comparable and')
    console.log('their spread is a check on both measurements at once.\n')
    console.log('frame page                  anchor   mock   samples (roll @ t, corrected)                    median  spread')
    const outRows = []
    for (const s of SLIDES.filter(x => byFrame.has(x.frame))) {
      const rows = byFrame.get(s.frame).slice().sort((a, b) => a.t - b.t)
      const pick = []
      for (let i = 0; i < N; i++) pick.push(rows[Math.round((i * (rows.length - 1)) / (N - 1))])
      const seen = new Set()
      const vals = []
      const parts = []
      for (const r of pick) {
        if (seen.has(r.t)) continue
        seen.add(r.t)
        const rgb = clipFrame(r.t)
        const m = rollOf(rgb, shift(quadOf(poseAt(r.t), s.face)), ropt)
        if (!m.ok) {
          parts.push(`${r.t.toFixed(2)}:refused`)
          continue
        }
        const corrected = m.roll - r.rot
        vals.push(corrected)
        parts.push(`${r.t.toFixed(2)}:${corrected >= 0 ? '+' : ''}${corrected.toFixed(2)}`)
      }
      vals.sort((a, b) => a - b)
      const med = vals.length ? vals[(vals.length - 1) >> 1] : null
      const spread = vals.length ? vals[vals.length - 1] - vals[0] : null
      outRows.push({ frame: s.frame, page: s.page, t0: rows[0].t, roll: med === null ? null : +med.toFixed(2),
        spread: spread === null ? null : +spread.toFixed(2), n: vals.length, samples: parts })
      console.log(
        String(s.frame).padStart(5) + '  ' + s.page.padEnd(20) +
          (med === null ? '     --' : med.toFixed(2).padStart(8)) +
          (MOCK_ROT[s.frame] === undefined ? '     --' : MOCK_ROT[s.frame].toFixed(2).padStart(7)) +
          '   ' + parts.join(' ').padEnd(46) +
          (med === null ? '      --' : med.toFixed(2).padStart(8)) +
          (spread === null ? '      --' : spread.toFixed(2).padStart(8)) +
          (spread !== null && spread > 3 ? '  SPREAD' : ''),
      )
    }
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/roll-anchor.json`,
      JSON.stringify({ measured: new Date().toISOString().slice(0, 10), rows: outRows }, null, 1))
    console.log(`\n-> ${OUT}/roll-anchor.json`)
    console.log('\nPaste the `median` column into ANCHOR in scripts/journal-path.mjs as `rot`,')
    console.log('then re-run `npm run journal:path`. Do not hand-edit JOURNAL_PATH.')
    process.exit(0)
  }

  const want = []
  if (has('--t'))
    for (let i = argv.indexOf('--t') + 1; i < argv.length && !argv[i].startsWith('--'); i++)
      want.push(Number(argv[i]))
  else
    for (const s of SLIDES.filter(s => s.frame >= 7 && s.frame <= 23)) {
      const w = windowOf(s.frame)
      want.push(+((w.t0 + w.t1) / 2).toFixed(2))
    }
  console.log("THE ROLL OF THE CLIP'S JOURNAL, READ OFF THE TYPE ON ITS PAGE.")
  console.log('`roll` is what the product needs: degrees clockwise, the angle our')
  console.log('own journal must be set to. `base` is the baseline family, kept as a')
  console.log('witness — it is pulled off `roll` by the yaw and by where the copy')
  console.log('happens to sit on the page, so it is printed and not used.\n')
  console.log('    t  frame page                    roll    ours    diff    base   conf  rival      px')
  for (const t of want) {
    const s = slideAt(t)
    const rgb = clipFrame(t)
    const ours = poseAt(t)
    const quad = shift(quadOf(ours, s.face))
    const r = rollOf(rgb, quad, ropt)
    const row = { t, frame: s.frame, page: s.page, ours: +ours.rot.toFixed(2), ...r }
    rows.push(row)
    if (!r.ok) {
      console.log(t.toFixed(2).padStart(5) + String(s.frame).padStart(7) + '  ' + s.page.padEnd(20) + '   ' + r.why)
      continue
    }
    console.log(
      t.toFixed(2).padStart(5) + String(s.frame).padStart(7) + '  ' + s.page.padEnd(20) +
        r.roll.toFixed(2).padStart(8) + row.ours.toFixed(2).padStart(8) +
        (r.roll - row.ours).toFixed(2).padStart(8) +
        (r.baseline === null ? '     --' : r.baseline.toFixed(2).padStart(8)) +
        r.conf.toFixed(3).padStart(7) + r.rival.toFixed(3).padStart(7) +
        String(r.px).padStart(8) +
        (r.conf < 0.35 || r.rival > 0.8 ? '   WEAK' : ''),
    )
    if (draw) drawRoll(rgb, quad, r.roll, `${OUT}/roll-${t.toFixed(2)}.png`, ropt.shrink)
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/roll.json`, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), rows }, null, 1))
  console.log(`\n-> ${OUT}/roll.json  (${rows.length} rows)`)
  process.exit(0)
}

// ---------------------------------------------------------------- measuring
/** Which slide a second belongs to. */
function slideAt(t) {
  let s = SLIDES[0]
  for (const x of SLIDES) if (x.at <= t + 1e-6) s = x
  return s
}

/** Where to start the search. The table's own pose is the natural seed. */
function seedFor(t) {
  return { pose: { ...poseAt(t), rotY: 0 }, slide: slideAt(t) }
}

/**
 * THE SEED IS THE PREVIOUS SECOND'S ANSWER, not our own table's pose.
 *
 * Our table is the storyboard's anchor, and the clip disagrees with it in the
 * one place a seed can least afford: the SIGN of the tilt. On frame 14 the table
 * says +2.75 clockwise and the clip is at -6 to -9 — twelve degrees away, on an
 * axis whose leash is fourteen. Seeding every frame there asks the search to
 * cross the whole basin on every frame, from the same wrong side each time.
 *
 * Chained instead, only the FIRST frame of a run starts from the table; after
 * that each second starts half a second from where it belongs, which is about
 * 18 design px of travel and under a degree. That is the same reasoning
 * `--motion` records for registering neighbours rather than a common reference,
 * and the leash below is sized off the same numbers: the widest slide moves
 * 176 px, turns 16 deg and grows 6.9 % over roughly five seconds, so half a
 * second of it is 18 px, 1.6 deg and 0.7 %. The leash allows several times that
 * and still refuses a jump to the room's own furniture.
 *
 * The chain is NOT broken at a slide boundary — the journal is continuous
 * through a page turn, and the seconds inside the turn are skipped rather than
 * measured, so the last settled pose of one slide is the best seed the next one
 * can have. It IS broken when the FACE changes, because the cover and a data
 * page are laid out at different base sizes (1465x1868 against 1564x1911) and a
 * scale carried across that boundary means nothing.
 */
const CHAIN_SPAN = { cx: 3, cy: 3, rot: 4, scale: 0.03 }
/**
 * AND HOW FAR THE CHAIN AS A WHOLE MAY SIT FROM OUR OWN TABLE. See solvePose
 * for why a step leash alone is not enough. The centre is `poseAt(t)`, which
 * already carries the motion measured off the clip, so this bounds the
 * disagreement in the ANCHOR — the thing this session is here to replace.
 */
const KEEP_SPAN = { cx: 18, cy: 15, rot: 18, scale: 0.1 }

/** One frame's edge field, cached for the two passes that share a second. */
let fldCache = { t: null, fld: null }
const fldOf = t => {
  if (fldCache.t !== t) fldCache = { t, fld: chamfer(clipFrame(t)) }
  return fldCache.fld
}

const times = []
if (has('--t')) {
  for (let i = argv.indexOf('--t') + 1; i < argv.length && !argv[i].startsWith('--'); i++)
    times.push(Number(argv[i]))
} else if (has('--slide') || has('--all')) {
  const step = Number(val('--step') || 0.4)
  const want = has('--all') ? SLIDES.filter(s => s.frame >= 7 && s.frame <= 23)
    : SLIDES.filter(s => s.frame === Number(val('--slide')))
  for (const s of want) {
    const w = windowOf(s.frame)
    for (let t = w.t0; t <= w.t1 + 1e-6; t = +(t + step).toFixed(3)) times.push(t)
  }
} else {
  console.error('nothing asked for: --selftest, --t <secs>, --slide N or --all')
  process.exit(2)
}

console.log('THE CLIP\'S JOURNAL, POSE BY POSE, from its four edges.')
console.log('seed = our table\'s pose for that slide; pose = what the clip is doing.\n')
const HEAD = '     t  frame page                    rot   scale     cx     cy    rotY   score  sharp    seed   soft'
console.log(HEAD)
const chain = !has('--nochain') && !has('--t')

const rowAt = (t, seed, how) => {
  const slide = slideAt(t)
  const keep = { centre: { ...poseAt(t), rotY: 0 }, span: KEEP_SPAN }
  const r = solvePose(fldOf(t), seed, slide.face,
    how === 'table'
      ? { span: KEEP_SPAN }
      : { span: CHAIN_SPAN, keep, yawNear: seed.rotY })
  return { t, frame: slide.frame, page: slide.page, face: slide.face, ...r.pose,
    score: +r.score.toFixed(3), sharp: +r.sharp.toFixed(2),
    soft: ['rot', 'scale', 'cx', 'cy', 'rotY'].filter(k => r.stiff[k] < SOFT),
    seeded: how }
}

/**
 * EVERY SECOND IS SOLVED TWICE, from its neighbour and from our own table, and
 * the picture picks. A chain is a state machine, and a state machine that has
 * entered a bad state stays there: the first cut of this ran the chain alone
 * and watched the scale walk 0.68 -> 0.54 -> 0.23 across three slides while
 * every step stayed inside its leash. The table seed is the escape hatch — it
 * is available at every second, not only at the head, so no run of bad seconds
 * can carry the good ones away with it. It also sweeps the whole yaw range
 * where the chained candidate sweeps only its neighbourhood, which is what lets
 * the yaw come back after a slide has lost it.
 */
const bestOf = (t, prev) => {
  const table = rowAt(t, { ...poseAt(t), rotY: 0 }, 'table')
  if (!prev) return table
  const chained = rowAt(t, { ...prev }, 'chain')
  return chained.score >= table.score ? chained : table
}
const poseOf = r => ({ rot: r.rot, scale: r.scale, cx: r.cx, cy: r.cy, rotY: r.rotY })
const line = r =>
  r.t.toFixed(2).padStart(6) + String(r.frame).padStart(6) + '  ' + r.page.padEnd(20) +
  r.rot.toFixed(2).padStart(8) + r.scale.toFixed(3).padStart(8) +
  r.cx.toFixed(1).padStart(7) + r.cy.toFixed(1).padStart(7) +
  r.rotY.toFixed(2).padStart(8) + r.score.toFixed(3).padStart(8) +
  r.sharp.toFixed(1).padStart(7) + '  ' + r.seeded.padEnd(6) +
  ('  ' + r.soft.join(',')).padEnd(12)

const rows = []
let prev = null
for (const t of times) {
  const slide = slideAt(t)
  const linked = chain && prev && prev.face === slide.face
  const r = linked ? bestOf(t, prev.pose) : rowAt(t, { ...poseAt(t), rotY: 0 }, 'table')
  rows.push(r)
  prev = { face: slide.face, pose: poseOf(r) }
  console.log(line(r))
}

/**
 * AND THE SAME CHAIN BACKWARDS, keeping whichever answer the picture likes more.
 *
 * A chain has one second nobody can seed well: its first. That one starts from
 * our own table, and on a data page the table's tilt has the WRONG SIGN — the
 * clip runs -6 to -9 deg where the table says +2.75 — so the search sets off
 * across the basin from the far side, and it can settle short of the answer
 * every neighbour agrees on. Measured on frame 14: the first two seconds came
 * back at -4.8 and -5.6 deg with 13.5 and 15.5 deg of yaw, scoring 0.405 and
 * 0.398, while every second after them sat near -9 deg with 6-7 of yaw and
 * scored up to 0.558.
 *
 * Run backwards, that second is seeded by the neighbour that got it right, and
 * the two passes are judged by the one number here that is not an opinion: the
 * chamfer score each pose reaches. Nothing is averaged — every row kept is a
 * pose the search actually reached and the picture actually prefers.
 */
if (chain && rows.length > 1) {
  let better = 0
  for (let i = rows.length - 2; i >= 0; i--) {
    if (rows[i].face !== rows[i + 1].face) continue
    const back = rowAt(rows[i].t, poseOf(rows[i + 1]), 'chain')
    if (back.score > rows[i].score) {
      rows[i] = { ...back, seeded: 'back' }
      better++
    }
  }
  console.log(`\nBACKWARD PASS: ${better} of ${rows.length} seconds did better from the other side.`)
  if (better) {
    console.log(HEAD)
    for (const r of rows) if (r.seeded === 'back') console.log(line(r))
  }
}

if (has('--overlay'))
  for (const r of rows)
    drawQuad(clipFrame(r.t), quadOf(r, r.face), `${OUT}/pose-${r.t}.png`)

if (has('--write')) {
  writeFileSync(REF, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), rows }, null, 1))
  console.log(`\n-> ${REF}  (${rows.length} samples)`)
} else {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/last.json`, JSON.stringify(rows, null, 1))
  console.log(`\n-> ${OUT}/last.json  (${rows.length} samples; --write to make it the reference)`)
}
