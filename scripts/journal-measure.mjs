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
import { writeFileSync, mkdirSync } from 'node:fs'
import { pyramid, maskPyramid, register, margin, quadMask, reachMask } from './lib/gradfit.mjs'

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
    sum += side / SAMPLES
  }
  return sum / sides.length
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
function solveFlat(fld, seed, face, rotY, span) {
  let best = { ...seed, rotY }
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
            if (Math.abs(cand[key] - seed[key]) > span[key]) continue
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
  const span = opt.span || { cx: 12, cy: 12, rot: 14, scale: 0.2 }
  const at = y => {
    const p = solveFlat(fld, seed, face, y, span)
    return { p, v: fieldScore(fld, quadOf(p, face), 12) }
  }
  let best = null
  for (let y = -16; y <= 16.001; y += 2) {
    const r = at(y)
    if (!best || r.v > best.v) best = r
  }
  for (let y = best.p.rotY - 1.5; y <= best.p.rotY + 1.5001; y += 0.5) {
    const r = at(y)
    if (r.v > best.v) best = r
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

const fmtPose = p =>
  `{ rot: ${p.rot.toFixed(2)}, scale: ${p.scale.toFixed(3)}, cx: ${p.cx.toFixed(1)}, ` +
  `cy: ${p.cy.toFixed(1)}, rotY: ${(p.rotY || 0).toFixed(2)} }`

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
  const out = []
  console.log("THE CLIP'S JOURNAL, MOVING INSIDE ITS OWN SLIDE.")
  console.log('Registered clip-against-clip over the journal region, so neither our')
  console.log('layout nor our pose enters the answer. dx/dy are design px on the')
  console.log('1080x1920 canvas, size is a ratio, rot is degrees clockwise.\n')
  console.log('frame page                     t      dx      dy     size      rot   score  rival')
  for (const s of want) {
    const w = windowOf(s.frame)
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
      const here = { rot: poseAt(w.t0).rot + acc.rot, scale: poseAt(w.t0).scale * acc.size,
        cx: poseAt(w.t0).cx + (acc.dx / W) * 100, cy: poseAt(w.t0).cy + (acc.dy / H) * 100 }
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
            best.s < 0.945 || best.s > 1.065 ? '  AT THE SEARCH BOUND' : ''),
      )
    }
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/motion.json`, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), rows: out }, null, 1))
  console.log(`\n-> ${OUT}/motion.json  (${out.length} samples)`)
  process.exit(0)
}

// ---------------------------------------------------------------- measuring
/** Where to start the search. The table's own pose is the natural seed. */
function seedFor(t) {
  let s = SLIDES[0]
  for (const x of SLIDES) if (x.at <= t + 1e-6) s = x
  return { pose: { ...poseAt(t), rotY: 0 }, slide: s }
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
console.log('     t  frame page                    rot   scale     cx     cy    rotY   score   soft')
const rows = []
for (const t of times) {
  const { pose: seed, slide } = seedFor(t)
  const fld = chamfer(clipFrame(t))
  const r = solvePose(fld, seed, slide.face)
  const soft = ['rot', 'scale', 'cx', 'cy', 'rotY'].filter(k => r.stiff[k] < SOFT)
  rows.push({ t, frame: slide.frame, page: slide.page, face: slide.face, ...r.pose,
    score: +r.score.toFixed(3), sharp: +r.sharp.toFixed(2), soft })
  console.log(
    t.toFixed(2).padStart(6) + String(slide.frame).padStart(6) + '  ' + slide.page.padEnd(20) +
      r.pose.rot.toFixed(2).padStart(8) + r.pose.scale.toFixed(3).padStart(8) +
      r.pose.cx.toFixed(1).padStart(7) + r.pose.cy.toFixed(1).padStart(7) +
      r.pose.rotY.toFixed(2).padStart(8) + r.score.toFixed(3).padStart(8) +
      ('  ' + soft.join(',')).padEnd(12),
  )
  if (has('--overlay')) {
    const rgb = clipFrame(t)
    drawQuad(rgb, quadOf(r.pose, slide.face), `${OUT}/pose-${t}.png`)
  }
}

if (has('--write')) {
  writeFileSync(REF, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), rows }, null, 1))
  console.log(`\n-> ${REF}  (${rows.length} samples)`)
} else {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/last.json`, JSON.stringify(rows, null, 1))
  console.log(`\n-> ${OUT}/last.json  (${rows.length} samples; --write to make it the reference)`)
}
