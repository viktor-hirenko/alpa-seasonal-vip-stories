/**
 * GRADIENT REGISTRATION — the shared maths behind scripts/clip-fit.mjs.
 *
 * Two pictures of the same thing are compared by the DIRECTION of their
 * gradients and nothing else, then aligned over a similarity transform. The
 * point of throwing the brightness away is stated at the top of clip-fit.mjs:
 * the journal's bloom in `preview.mp4` is as big as the journal and no
 * intensity threshold separates them, but a bloom is smooth and therefore has
 * almost no gradient, while a printed edge is nothing but gradient.
 *
 * Everything here is pure: buffers in, numbers out, no browser and no ffmpeg.
 */

/** The canvas every buffer here is on: 1080x1920 design px. */
export const W = 1080
export const H = 1920

// ===========================================================================
// THE EDGE FIELD
// ===========================================================================

/** Rec.709 luma. The journal is magenta on near-black; luma keeps that step. */
function luma(rgb) {
  const n = W * H
  const l = new Float32Array(n)
  for (let i = 0, q = 0; i < n; i++, q += 3)
    l[i] = 0.2126 * rgb[q] + 0.7152 * rgb[q + 1] + 0.0722 * rgb[q + 2]
  return l
}

/** Separable Gaussian. Cheap, and the only thing that sets how WIDE an edge is
 *  at a given level — which is the same thing as how far the search can step. */
function blur(src, w, h, sigma) {
  if (!(sigma > 0)) return src
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r] }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  const t = new Float32Array(w * h), d = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i
        a += src[y * w + xx] * k[i + r]
      }
      t[y * w + x] = a
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i
        a += t[yy * w + x] * k[i + r]
      }
      d[y * w + x] = a
    }
  return d
}

/** Box-halve. Averaging before differencing is what makes the coarse level of
 *  the pyramid a low-pass view rather than an aliased one. */
function half(src, w, h) {
  const w2 = w >> 1,
    h2 = h >> 1
  const d = new Float32Array(w2 * h2)
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w2; x++) {
      const p = (y * 2 * w + x * 2) | 0
      d[y * w2 + x] = (src[p] + src[p + 1] + src[p + w] + src[p + w + 1]) * 0.25
    }
  return d
}

/**
 * Sobel, then throw the magnitude away and keep only the direction.
 *
 * DISCARDING THE MAGNITUDE IS THE POINT, not an optimisation. Our journal and
 * the clip's are the same artwork at different exposures — the clip's is sat
 * inside a bloom that lifts its local contrast, ours is not. Correlating
 * magnitudes would score the exposure difference; correlating directions scores
 * only where the edges RUN, which is the thing both pictures agree about.
 *
 * `keep` is a quantile, not a level: the threshold is whatever value keeps the
 * strongest `keep` share of pixels inside `region`. So no absolute brightness
 * ever appears in this file, and a dimmer or brighter source cannot move it.
 */
function edgeField(l, w, h, keep, region) {
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  const mag = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      const a = l[p - w - 1], b = l[p - w], c = l[p - w + 1]
      const d = l[p - 1], f = l[p + 1]
      const g = l[p + w - 1], i = l[p + w], j = l[p + w + 1]
      const sx = a + 2 * d + g - c - 2 * f - j
      const sy = a + 2 * b + c - g - 2 * i - j
      gx[p] = sx
      gy[p] = sy
      mag[p] = Math.hypot(sx, sy)
    }
  // Threshold from the quantile of the magnitudes inside the region of interest.
  const sample = []
  const step = region ? 1 : 7
  for (let p = 0; p < w * h; p += step) if (!region || region[p]) sample.push(mag[p])
  sample.sort((a, b) => a - b)
  const cut = sample.length ? sample[Math.min(sample.length - 1, Math.floor((1 - keep) * sample.length))] : 0
  const ex = new Float32Array(w * h)
  const ey = new Float32Array(w * h)
  // Direction with a SOFT weight, not a hard cut. A hard cut gives a grain of
  // sand the same vote as the cover's edge, and half the pixels just above the
  // threshold are noise pointing anywhere. `m / (m + cut)` is 0.5 at the
  // threshold and climbs to 1 for a real step, so strong edges carry the fit and
  // weak ones fade out instead of voting.
  for (let p = 0; p < w * h; p++) {
    const m = mag[p]
    if (m < cut * 0.35 || m === 0) continue
    const k = m / (m + cut) / m
    ex[p] = gx[p] * k
    ey[p] = gy[p] * k
  }
  return { ex, ey, w, h }
}

/**
 * The area of the OTHER picture this fit can reach into, as a region for its
 * threshold: the mask's quad blown up about the pivot.
 *
 * WHY THE OTHER PICTURE NEEDS A REGION AT ALL. The threshold is a quantile, so
 * it is only as meaningful as the pixels it is taken over. Taken over the whole
 * 1080x1920 frame — which is mostly an unlit room — "the strongest 14 %" is a
 * bar low enough that half of what survives is codec noise pointing anywhere,
 * and the fit then has a field of random directions to find agreement in. That
 * is not a small loss of accuracy: with the bar set that way a deliberately
 * mis-scaled journal came back 12 % wrong, and the winning score sat BELOW its
 * own rival. Taking the quantile over the neighbourhood the fit can actually
 * reach puts both pictures on comparable footing.
 */
function reachMask(quad, pivot, grow = 2.0) {
  const q = quad.map(([x, y]) => [pivot[0] + (x - pivot[0]) * grow, pivot[1] + (y - pivot[1]) * grow])
  return quadMask(q, 0)
}

/**
 * Four-level pyramid of edge fields, finest first.
 *
 * THE BLUR AT EACH LEVEL IS WHAT MAKES THE SEARCH POSSIBLE, and leaving it out
 * is a trap worth spelling out. Correlating sharp edges gives a peak two or
 * three pixels wide: for a journal 1300 px tall that is a peak ONE PER CENT
 * wide in scale, and a search that steps 2 % walks straight over the answer and
 * settles on a shoulder. Measured: with sharp levels, a journal deliberately
 * enlarged by 5 % came back as 1.4 %, while the score AT the right answer
 * (0.910) was far above the one the search returned (0.747). The score was
 * never wrong; the ladder was too coarse for the peak.
 *
 * So each level is blurred on purpose. A blurred edge is a WIDE peak, the
 * coarse level can be searched with a coarse ladder, and each finer level only
 * has to look in the small window the level above left it in.
 */
const LEVELS = [
  { down: 1, sigma: 0.8 },
  { down: 2, sigma: 1.1 },
  { down: 4, sigma: 1.6 },
  { down: 8, sigma: 1.8 },
]

function pyramid(rgb, keep, region0) {
  const out = []
  let l = luma(rgb),
    w = W,
    h = H,
    r = region0
  for (let k = 0; k < LEVELS.length; k++) {
    out.push(edgeField(blur(l, w, h, LEVELS[k].sigma), w, h, keep, r))
    if (k < LEVELS.length - 1) {
      const nw = w >> 1, nh = h >> 1
      if (r) {
        const nr = new Uint8Array(nw * nh)
        for (let y = 0; y < nh; y++)
          for (let x = 0; x < nw; x++) {
            const p = y * 2 * w + x * 2
            nr[y * nw + x] = r[p] || r[p + 1] || r[p + w] || r[p + w + 1] ? 1 : 0
          }
        r = nr
      }
      l = half(l, w, h)
      w = nw
      h = nh
    }
  }
  return out
}

/** Mask pyramid to match. */
function maskPyramid(m0) {
  const out = [m0]
  let m = m0, w = W, h = H
  for (let k = 0; k < LEVELS.length - 1; k++) {
    const nw = w >> 1, nh = h >> 1
    const n = new Uint8Array(nw * nh)
    for (let y = 0; y < nh; y++)
      for (let x = 0; x < nw; x++) {
        const p = y * 2 * w + x * 2
        // AND, not OR: erode by half a pixel each level so the coarse mask never
        // reaches past the journal's own edge into the room behind it.
        n[y * nw + x] = m[p] && m[p + 1] && m[p + w] && m[p + w + 1] ? 1 : 0
      }
    out.push(n)
    m = n
    w = nw
    h = nh
  }
  return out
}

/** Indices of the mask's pixels, optionally strided, for the score loop. */
function points(mask, w, h, stride) {
  const a = []
  for (let y = 0; y < h; y += stride)
    for (let x = 0; x < w; x += stride) {
      const p = y * w + x
      if (mask[p]) a.push(p)
    }
  return Int32Array.from(a)
}

// ===========================================================================
// REGISTRATION
// ===========================================================================

/**
 * Cosine similarity of two edge fields under q = pivot + s*R(rot)*(p - pivot) + d.
 *
 * `A` is ours (masked), `B` is the clip. A positive score means the edges run
 * the same way; the sign of the gradient is kept rather than taken absolute,
 * because both pictures are the same artwork and a polarity flip would be a
 * mismatch, not a match.
 *
 * The normalisation runs over the OVERLAP only, so a candidate that pushes most
 * of the template off the frame is judged on what is left — and is then thrown
 * out by the coverage guard rather than winning on a lucky corner.
 */
function score(A, B, pts, pivot, s, dx, dy, rot) {
  const r = (rot * Math.PI) / 180
  const co = Math.cos(r) * s
  const si = Math.sin(r) * s
  const { ex: ax, ey: ay, w } = A
  const { ex: bx, ey: by, w: bw, h: bh } = B
  const [px, py] = pivot
  let num = 0, da = 0, db = 0, cov = 0, n = 0
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]
    const x = p % w, y = (p / w) | 0
    const ux = x - px, uy = y - py
    const qx = px + co * ux - si * uy + dx
    const qy = py + si * ux + co * uy + dy
    if (qx < 0 || qy < 0 || qx >= bw - 1 || qy >= bh - 1) continue
    const x0 = qx | 0, y0 = qy | 0
    const fx = qx - x0, fy = qy - y0
    const i0 = y0 * bw + x0
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy
    const vx = bx[i0] * w00 + bx[i0 + 1] * w10 + bx[i0 + bw] * w01 + bx[i0 + bw + 1] * w11
    const vy = by[i0] * w00 + by[i0 + 1] * w10 + by[i0 + bw] * w01 + by[i0 + bw + 1] * w11
    const uxx = ax[p], uyy = ay[p]
    num += uxx * vx + uyy * vy
    da += uxx * uxx + uyy * uyy
    db += vx * vx + vy * vy
    if (vx || vy) cov++
    n++
  }
  // Not enough of the template landed on anything: refuse rather than score.
  if (n < pts.length * 0.5 || cov < pts.length * 0.06) return { v: -2, cov: 0 }
  return { v: num / Math.sqrt(da * db + 1e-9), cov: cov / pts.length }
}

/**
 * Coarse-to-fine search for (scale, dx, dy, rot).
 *
 * The coarsest level is swept with a SCALE LADDER — a full translation grid at
 * every scale in a geometric series across the whole range — and then every
 * rung is refined before any of them are compared. Two separate lessons are
 * baked into that:
 *
 *   the ladder's rung spacing is set by the blur at that level, not by taste.
 *   Five seeds three per cent apart cannot find a peak one per cent wide, and
 *   the failure does not look like a failure: it returns a plausible number
 *   with a plausible score.
 *
 *   refine every rung, compare last. A page of type has a local maximum every
 *   line-height; before refinement a decoy can out-score the truth by a hair,
 *   and a search that commits early then polishes the decoy.
 */
function register(Ap, Bp, Mp, pivot0, opt = {}) {
  const sRange = opt.sRange || [0.5, 2.2]
  const rRange = opt.rRange || [-14, 14]
  const dSpan = opt.dSpan ?? 240

  // --- coarsest level: the ladder.
  const L = LEVELS.length - 1
  const k = 1 / LEVELS[L].down
  let best = null
  {
    const A = Ap[L], B = Bp[L]
    const pts = points(Mp[L], A.w, A.h, 1)
    const piv = [pivot0[0] * k, pivot0[1] * k]
    const span = Math.round(dSpan * k), step = 2
    // One rung every 4 %: at 1/8 scale a blurred edge is ~4 px wide over a
    // ~80 px radius, so 4 % is half a peak and nothing can hide between rungs.
    const rungs = []
    for (let s = sRange[0]; s <= sRange[1] * 1.0001; s *= 1.04) rungs.push(s)
    for (const s of rungs) {
      let top = null
      for (let dy = -span; dy <= span; dy += step)
        for (let dx = -span; dx <= span; dx += step) {
          const v = score(A, B, pts, piv, s, dx, dy, 0)
          if (!top || v.v > top.v) top = { v: v.v, s, dx: dx / k, dy: dy / k, rot: 0 }
        }
      if (!top) continue
      const r = descend(A, B, pts, piv, k, top, [0.012, 1 / k, 1.5], sRange, rRange, 6)
      if (!best || r.v > best.v) best = r
    }
    if (!best) return { v: -2, cov: 0, s: 1, dx: 0, dy: 0, rot: 0 }
  }
  // --- each finer level only has to look in the window the last one left.
  for (let l = L - 1; l >= 0; l--) {
    const A = Ap[l], B = Bp[l]
    const kk = 1 / LEVELS[l].down
    const pts = points(Mp[l], A.w, A.h, l === 0 ? 2 : 1)
    const piv = [pivot0[0] * kk, pivot0[1] * kk]
    const steps = [0.006 * LEVELS[l].down / 2, 1 / kk, 0.5 * LEVELS[l].down / 2]
    best = descend(A, B, pts, piv, kk, best, steps, sRange, rRange, 5)
  }
  return best
}

/**
 * Local search, iterated until it stops improving.
 *
 * Scale and translation are searched JOINTLY, not one after the other. They are
 * coupled — scaling about a pivot that is not exactly the journal's centre also
 * moves it — so pure coordinate descent zigzags down a diagonal valley and
 * stops early with both parameters wrong by compensating amounts. Rotation is
 * nearly independent of the two and is left on its own axis.
 */
function descend(A, B, pts, piv, k, start, steps, sRange, rRange, rounds) {
  let { s, dx, dy, rot } = start
  const [ds, dd, dr] = steps
  const at = (s, dx, dy, rot) => score(A, B, pts, piv, s, dx * k, dy * k, rot)
  let cur = at(s, dx, dy, rot)
  for (let r = 0; r < rounds; r++) {
    let moved = false
    for (let is = -3; is <= 3; is++) {
      const ts = Math.min(sRange[1], Math.max(sRange[0], s + is * ds))
      for (let iy = -3; iy <= 3; iy++)
        for (let ix = -3; ix <= 3; ix++) {
          if (!is && !ix && !iy) continue
          const tx = dx + ix * dd, ty = dy + iy * dd
          const v = at(ts, tx, ty, rot)
          if (v.v > cur.v) { cur = v; s = ts; dx = tx; dy = ty; moved = true }
        }
    }
    for (let i = -6; i <= 6; i++) {
      if (!i) continue
      const t = Math.min(rRange[1], Math.max(rRange[0], rot + i * dr))
      const v = at(s, dx, dy, t)
      if (v.v > cur.v) { cur = v; rot = t; moved = true }
    }
    if (!moved) break
  }
  return { v: cur.v, cov: cur.cov, s, dx, dy, rot }
}

/**
 * How lonely the winning peak is. Re-scan translation at the coarse level and
 * report the best score at least 60 design px away from the winner: a peak that
 * barely beats its neighbourhood is a coincidence, not a measurement.
 */
function margin(Ap, Bp, Mp, pivot0, best) {
  const L = 2, k = 1 / LEVELS[2].down
  const A = Ap[L], B = Bp[L]
  const pts = points(Mp[L], A.w, A.h, 2)
  const piv = [pivot0[0] * k, pivot0[1] * k]
  let rival = -2
  for (let dy = -60; dy <= 60; dy += 2)
    for (let dx = -60; dx <= 60; dx += 2) {
      const gx = best.dx + dx / k * 1, gy = best.dy + dy / k * 1
      if (Math.hypot(gx - best.dx, gy - best.dy) < 60) continue
      const v = score(A, B, pts, piv, best.s, gx * k, gy * k, best.rot)
      if (v.v > rival) rival = v.v
    }
  return rival
}

/**
 * Offset a convex quad by `d` design px along each edge's own normal
 * (positive = inward), by shifting the four edge lines and re-intersecting them.
 *
 * Not "pull the corners towards the centroid": that moves a corner diagonally,
 * so a 100 px pull takes 71 px off each side and the band ends up a different
 * width at the corners than along the edges. On a journal at 23 deg of yaw that
 * difference is the whole measurement.
 */
function offsetQuad(quad, d) {
  const n = quad.length
  const cx = quad.reduce((a, p) => a + p[0], 0) / n
  const cy = quad.reduce((a, p) => a + p[1], 0) / n
  const lines = []
  for (let i = 0; i < n; i++) {
    const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % n]
    let nx = -(by - ay), ny = bx - ax
    const L = Math.hypot(nx, ny) || 1
    nx /= L; ny /= L
    // point the normal at the centroid, so `d > 0` always means inward
    if (nx * (cx - ax) + ny * (cy - ay) < 0) { nx = -nx; ny = -ny }
    lines.push([nx, ny, nx * (ax + nx * d) + ny * (ay + ny * d)])
  }
  const out = []
  for (let i = 0; i < n; i++) {
    const [a1, b1, c1] = lines[(i + n - 1) % n]
    const [a2, b2, c2] = lines[i]
    const det = a1 * b2 - a2 * b1
    if (Math.abs(det) < 1e-9) return quad
    out.push([(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det])
  }
  return out
}

/** Rasterise a convex quad (design px) into a full-canvas mask. */
function quadMask(quad, shrink = 0) {
  const m = new Uint8Array(W * H)
  const q = shrink ? offsetQuad(quad, shrink) : quad
  let y0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[1]))))
  let y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map(p => p[1]))))
  for (let y = y0; y <= y1; y++) {
    const xs = []
    for (let i = 0; i < q.length; i++) {
      const [ax, ay] = q[i], [bx, by] = q[(i + 1) % q.length]
      if (ay === by) continue
      if (y + 0.5 >= Math.min(ay, by) && y + 0.5 < Math.max(ay, by))
        xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i])), b = Math.min(W - 1, Math.floor(xs[i + 1]))
      for (let x = a; x <= b; x++) m[y * W + x] = 1
    }
  }
  return m
}

const boxMask = (x, y, w, h) => quadMask([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 0)

/**
 * THE MASK IS THE JOURNAL'S FACE WITH ITS MARGIN CUT AWAY.
 *
 * A FOURTH METHOD TRIED AND CLOSED, recorded here so nobody spends the day on
 * it twice. The register (_context/35-slide-audit.md section 7) says the
 * journal's frame and the page laid out inside it diverge from the reference by
 * different amounts, so the obvious move is to measure them separately: fit a
 * thin ribbon astride the silhouette for the POSE and the interior for the
 * LAYOUT. The interior fit works and is what this file ships. The ribbon does
 * not, in two distinct ways, both measured:
 *
 *   A WIDE band inside the edge just re-reads the layout. On six settled slides
 *   its answer tracked the interior's, slide for slide, within 20 px — because a
 *   117 px margin still holds heading and art, and type outweighs an outline.
 *
 *   A THIN ribbon has no confident peak at all. Against the Figma render its
 *   score came out BELOW its own rival (0.51 vs 0.63, 0.43 vs 0.61, ...) and its
 *   answer swung from -18 % to +64 % across slides whose pose is known to agree
 *   to 2 px. An outline is a handful of straight lines: two of them are the
 *   frame's own edge where the journal is cropped, and what is left is a shape a
 *   blurred correlation can slide along.
 *
 * So there is ONE number here and it covers the journal AS DRAWN, frame and
 * page together. On the cover — the entrance, where the artwork is a single
 * piece — that IS the pose. On a data page a mismatch could be either, and
 * which one is a question for blendNN.png, not for this file.
 */
/** How far the page's own margin is kept out of the fit. */
function bandWidth(quad) {
  const w = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1])
  const h = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1])
  return Math.min(220, Math.max(60, 0.11 * Math.min(w, h)))
}

const pageMask = quad => quadMask(quad, bandWidth(quad) + 20)

/**
 * THE JOURNAL'S OWN BOX IN A FRAME, WITHOUT ITS BLOOM.
 *
 * `a` is the picture with the journal, `b` the same instant without it, so
 * a-b is the journal AND everything it lights up. The register lists three
 * attempts to get a box out of that mask and why each failed; all three tried
 * to separate journal from bloom by BRIGHTNESS, and there is no such level.
 *
 * This one never asks. It keeps only pixels that are (1) inside the difference,
 * so the room is out, and (2) on a strong gradient of the picture itself, so the
 * bloom is out — a bloom is smooth by definition and cannot survive a gradient
 * threshold that a printed edge sails through. The extremes of what is left are
 * the cover's own edges.
 *
 * Two guards, both earned: a pixel counts only inside a horizontal run of the
 * difference (codec noise is speckle, and speckle at the frame's edge decides
 * the answer), and the extremes are taken as percentiles over rows and columns
 * rather than as the single furthest pixel.
 */
function silhouetteBox(a, b, opt = {}) {
  const T = opt.diff ?? 40
  const RUN = opt.run ?? 12
  const KEEP = opt.keep ?? 0.02
  const la = blur(luma(a), W, H, 1)
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    let run = 0
    for (let x = 0; x <= W; x++) {
      let on = false
      if (x < W) {
        const q = (y * W + x) * 3
        on = Math.max(Math.abs(a[q] - b[q]), Math.abs(a[q + 1] - b[q + 1]), Math.abs(a[q + 2] - b[q + 2])) > T
      }
      if (on) run++
      else {
        if (run >= RUN) for (let k = x - run; k < x; k++) mask[y * W + k] = 1
        run = 0
      }
    }
  }
  const mag = new Float32Array(W * H)
  const vals = []
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x
      if (!mask[p]) continue
      const gx = la[p - W - 1] + 2 * la[p - 1] + la[p + W - 1] - la[p - W + 1] - 2 * la[p + 1] - la[p + W + 1]
      const gy = la[p - W - 1] + 2 * la[p - W] + la[p - W + 1] - la[p + W - 1] - 2 * la[p + W] - la[p + W + 1]
      mag[p] = Math.hypot(gx, gy)
      vals.push(mag[p])
    }
  if (!vals.length) return null
  vals.sort((p, q) => p - q)
  const cut = vals[Math.floor((1 - KEEP) * (vals.length - 1))]
  const xs = [], ys = []
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1
    for (let x = 0; x < W; x++) if (mag[y * W + x] > cut) { if (lo < 0) lo = x; hi = x }
    if (lo >= 0) { xs.push([lo, hi]); ys.push(y) }
  }
  if (!xs.length) return null
  const q = (arr, f) => { const c = [...arr].sort((p, r) => p - r); return c[Math.min(c.length - 1, Math.max(0, Math.round(f * (c.length - 1))))] }
  const x0 = q(xs.map(v => v[0]), 0.02), x1 = q(xs.map(v => v[1]), 0.98)
  const y0 = q(ys, 0.01), y1 = q(ys, 0.99)
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, rows: ys.length }
}


export { reachMask, luma, half, edgeField, pyramid, maskPyramid, points, score, register, descend, margin, offsetQuad, quadMask, boxMask, bandWidth, pageMask, silhouetteBox }
