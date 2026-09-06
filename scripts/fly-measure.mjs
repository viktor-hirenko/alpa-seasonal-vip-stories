#!/usr/bin/env node
/**
 * MEASURE THE FLYING OBJECTS OFF THE REFERENCE CLIPS.
 *
 * Produces the two files the runtime and the gate are built on:
 *   src/story/flyObjects.js   the flight table (printed to stdout with --table)
 *   scripts/fly-reference.json  what the gate checks our pixels against
 *
 *   node scripts/fly-measure.mjs            # full pass, ~20 min
 *   node scripts/fly-measure.mjs --stage tracks   # stop after one stage
 *   node scripts/fly-measure.mjs --only 8         # one storyboard frame
 *
 * Needs `_refs/DP-15152 - clean bg.mp4` and `_refs/DP-15152 - preview.mp4`,
 * and ffmpeg. Intermediates land in `.fly-cache/` so a stage can be re-run
 * without redoing the ones before it.
 *
 * THE FIVE STAGES
 *
 * 1. TRACKS. Background plate = per-pixel temporal MEDIAN of `clean bg` over a
 *    wide window. The ship interior is quasi-static and the objects move, so
 *    they fall out of the median and a colour distance against it isolates them
 *    with no assumption about their colour. Threshold, close, connected
 *    components, nearest-neighbour linking inside each slide's window.
 *
 * 2. OCCLUSION. `preview.mp4` and `clean bg.mp4` are the same render with and
 *    without the journal, so they differ ONLY where the journal is drawn. An
 *    object pixel that differs between them is therefore a pixel the journal
 *    painted over — which makes "is this object in front of the page or behind
 *    it" a pixel measurement rather than a judgement. Every flight but one
 *    reads 0 % covered at its start and 76-100 % at its end.
 *
 * 3. MERGE. A flight crosses slide windows, so tracks that overlap in time and
 *    agree in position are unioned, and what is left is filtered: born already
 *    100 % behind the journal (corridor detail, never visible), too short, too
 *    small, or never moving.
 *
 * 4. FIT. The one stage that is not a blob measurement. For every frame of
 *    every flight the SPRITE is correlated against the clip over angle and
 *    scale — silhouette overlap plus luminance, both masked — which is what
 *    yields `size` and `rot`. Moments alone cannot do this: they give no angle
 *    at all for a round silhouette, and a 180 deg ambiguity for every other.
 *
 * 5. TABLE. Angles fold onto one branch of the artwork's own symmetry, size and
 *    angle are median-smoothed over five frames, and the rows kept are the ones
 *    a straight line between neighbours cannot reproduce.
 *
 * WHAT ASSIGNS AN ASSET TO A TRACK is the table at the bottom of this file, and
 * it is the one part that was done by eye: the tracker finds flights, and which
 * object each one IS was read off contact sheets of the clip. The storyboard's
 * own layer list disagrees in five places and the clip wins — see the note on
 * OBJECTS_BY_FRAME in src/story/flyObjects.js.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const CLEAN = `${ROOT}_refs/DP-15152 - clean bg.mp4`
const PREVIEW = `${ROOT}_refs/DP-15152 - preview.mp4`
const CACHE = `${ROOT}.fly-cache`
const W = 540,
  H = 960,
  FW = 1080,
  FH = 1920,
  K = 72

const args = process.argv.slice(2)
const flag = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const stopAfter = flag('--stage', null)
const only = flag('--only', null) && +flag('--only')

/** Slide cuts, from slides.js. A flight starts as its object clears a frame
 *  edge, a beat BEFORE its own cut is visible. */
const CUTS = [
  [8, 11.07],
  [9, 17.1],
  [10, 22.07],
  [11, 26.07],
  [12, 30.1],
  [13, 34.07],
  [14, 39.07],
  [15, 44.03],
  [16, 49.1],
  [17, 53.27],
  [18, 57.07],
  [19, 61.1],
  [20, 67.07],
  [21, 73.07],
  [22, 78.07],
  [23, 83.03],
]
const slideOf = t => {
  let s = null
  for (const [f, a] of CUTS) if (t + 0.45 >= a) s = f
  return s
}

// ---------------------------------------------------------------- primitives

const sh = (a, o = {}) =>
  execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30, ...o })

/** Consecutive frames of [t, t+dur) as packed RGB at W x H. */
function rgbFrames(file, t, dur, w = W, h = H) {
  const buf = sh([
    '-ss',
    String(t),
    '-t',
    String(dur),
    '-i',
    file,
    '-vf',
    `scale=${w}:${h}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ])
  const sz = w * h * 3,
    n = Math.floor(buf.length / sz)
  return Array.from({ length: n }, (_, i) => buf.subarray(i * sz, (i + 1) * sz))
}
/** One frame every `step` seconds, for the median plate. */
function rgbSampled(file, t, dur, step, w = W, h = H) {
  const buf = sh([
    '-ss',
    String(t),
    '-t',
    String(dur),
    '-i',
    file,
    '-vf',
    `fps=1/${step},scale=${w}:${h}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ])
  const sz = w * h * 3,
    n = Math.floor(buf.length / sz)
  return Array.from({ length: n }, (_, i) => buf.subarray(i * sz, (i + 1) * sz))
}
function medianRGB(frames, w = W, h = H) {
  const out = Buffer.alloc(w * h * 3),
    col = new Array(frames.length)
  for (let p = 0; p < w * h * 3; p++) {
    for (let i = 0; i < frames.length; i++) col[i] = frames[i][p]
    col.sort((a, b) => a - b)
    out[p] = col[col.length >> 1]
  }
  return out
}
/** Colour distance against the plate, then a close to fill the object. */
function colourMask(frame, plate, thr, r = 3, w = W, h = H) {
  const m = new Uint8Array(w * h)
  for (let p = 0, q = 0; p < w * h; p++, q += 3) {
    const dr = frame[q] - plate[q],
      dg = frame[q + 1] - plate[q + 1],
      db = frame[q + 2] - plate[q + 2]
    m[p] = dr * dr + dg * dg + db * db > thr * thr ? 1 : 0
  }
  let x = m
  for (let i = 0; i < r; i++) x = dil(x, w, h)
  for (let i = 0; i < r; i++) x = ero(x, w, h)
  return dil(ero(x, w, h), w, h)
}
function dil(m, w, h) {
  const o = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dy = -1; dy <= 1 && !v; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy,
            xx = x + dx
          if (yy >= 0 && yy < h && xx >= 0 && xx < w && m[yy * w + xx]) {
            v = 1
            break
          }
        }
      o[y * w + x] = v
    }
  return o
}
function ero(m, w, h) {
  const o = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 1
      for (let dy = -1; dy <= 1 && v; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy,
            xx = x + dx
          if (yy < 0 || yy >= h || xx < 0 || xx >= w || !m[yy * w + xx]) {
            v = 0
            break
          }
        }
      o[y * w + x] = v
    }
  return o
}
/** 4-way connected components, largest first. */
function components(m, w = W, h = H, minN = 150) {
  const lab = new Int32Array(w * h).fill(-1),
    out = [],
    st = new Int32Array(w * h)
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s] >= 0) continue
    let sp = 0
    st[sp++] = s
    lab[s] = out.length
    const px = []
    while (sp) {
      const p = st[--sp]
      px.push(p)
      const x = p % w,
        y = (p / w) | 0
      for (const q of [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w])
        if (q !== false && m[q] && lab[q] < 0) {
          lab[q] = out.length
          st[sp++] = q
        }
    }
    out.push({ n: px.length, px })
  }
  return out.filter(c => c.n >= minN).sort((a, b) => b.n - a.n)
}
/** Centroid, principal angle and axis lengths of a pixel set. */
function moments(px, w = W) {
  let sx = 0,
    sy = 0
  for (const p of px) {
    sx += p % w
    sy += (p / w) | 0
  }
  const n = px.length,
    cx = sx / n,
    cy = sy / n
  let mxx = 0,
    myy = 0,
    mxy = 0
  for (const p of px) {
    const dx = (p % w) - cx,
      dy = ((p / w) | 0) - cy
    mxx += dx * dx
    myy += dy * dy
    mxy += dx * dy
  }
  mxx /= n
  myy /= n
  mxy /= n
  const t = Math.sqrt((mxx - myy) ** 2 + 4 * mxy * mxy)
  const l1 = (mxx + myy + t) / 2,
    l2 = (mxx + myy - t) / 2
  return {
    n,
    cx,
    cy,
    deg: (0.5 * Math.atan2(2 * mxy, mxx - myy) * 180) / Math.PI,
    elong: Math.sqrt(Math.max(l1, 1e-9) / Math.max(l2, 1e-9)),
  }
}
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1]
const cache = (name, make) => {
  const f = `${CACHE}/${name}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const v = make()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(f, JSON.stringify(v))
  return v
}

// ------------------------------------------------------------- 1. tracks

function stageTracks() {
  const WINDOWS = []
  for (let i = 0; i < CUTS.length - 1; i++)
    WINDOWS.push({ frame: CUTS[i][0], a: Math.max(0, CUTS[i][1] - 1.2), b: CUTS[i + 1][1] + 1.2 })
  const all = {}
  for (const win of WINDOWS) {
    if (only && win.frame !== only) continue
    const dur = win.b - win.a
    const plate = medianRGB(
      rgbSampled(
        CLEAN,
        Math.max(0, win.a - 10),
        Math.min(94.3 - Math.max(0, win.a - 10), dur + 20),
        0.6,
      ),
    )
    const frames = rgbFrames(CLEAN, win.a, dur)
    const tracks = [],
      open = []
    for (let i = 0; i < frames.length; i++) {
      const t = win.a + i / 30
      const obs = components(colourMask(frames[i], plate, 34)).map(c => {
        const m = moments(c.px)
        let x0 = 1e9,
          y0 = 1e9,
          x1 = -1,
          y1 = -1
        for (const p of c.px) {
          const x = p % W,
            y = (p / W) | 0
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
        return { ...m, bw: x1 - x0 + 1, bh: y1 - y0 + 1 }
      })
      const used = new Set()
      for (const tr of open) {
        const last = tr.pts[tr.pts.length - 1]
        let bi = -1,
          bd = 1e9
        obs.forEach((o, j) => {
          if (used.has(j)) return
          const d = Math.hypot(o.cx - last.px, o.cy - last.py)
          if (d < Math.max(28, 0.9 * Math.sqrt(last.n)) && d < bd) {
            bd = d
            bi = j
          }
        })
        if (bi >= 0) {
          used.add(bi)
          tr.miss = 0
          pushPt(tr, t, obs[bi])
        } else tr.miss++
      }
      for (let j = 0; j < obs.length; j++)
        if (!used.has(j)) {
          const tr = { miss: 0, pts: [] }
          pushPt(tr, t, obs[j])
          tracks.push(tr)
          open.push(tr)
        }
      for (let k = open.length - 1; k >= 0; k--) if (open[k].miss > 4) open.splice(k, 1)
    }
    all[win.frame] = {
      window: [win.a, win.b],
      tracks: tracks.filter(tr => tr.pts.length >= 9).map(tr => ({ pts: tr.pts })),
    }
    console.log(`tracks: frame ${win.frame} -> ${all[win.frame].tracks.length}`)
  }
  return all
}
const pushPt = (tr, t, o) =>
  tr.pts.push({
    t: +t.toFixed(3),
    px: o.cx,
    py: o.cy,
    x: +((o.cx / W) * 100).toFixed(2),
    y: +((o.cy / H) * 100).toFixed(2),
    sq: +Math.sqrt(o.n).toFixed(0),
    n: o.n,
    deg: +o.deg.toFixed(1),
    elong: +o.elong.toFixed(2),
  })

// ---------------------------------------------------------- 2. occlusion

function stageOcclusion(tracks) {
  const res = {}
  for (const [frame, w] of Object.entries(tracks)) {
    const [a, b] = w.window,
      dur = b - a
    const plate = medianRGB(
      rgbSampled(CLEAN, Math.max(0, a - 10), Math.min(94.3 - Math.max(0, a - 10), dur + 20), 0.6),
    )
    const cf = rgbFrames(CLEAN, a, dur),
      pf = rgbFrames(PREVIEW, a, dur)
    const n = Math.min(cf.length, pf.length),
      out = []
    for (let i = 0; i < n; i += 3) {
      const t = a + i / 30
      // Where the two clips differ IS the journal, and nothing else.
      const jm = new Uint8Array(W * H)
      for (let p = 0, q = 0; p < W * H; p++, q += 3) {
        const dr = cf[i][q] - pf[i][q],
          dg = cf[i][q + 1] - pf[i][q + 1],
          db = cf[i][q + 2] - pf[i][q + 2]
        jm[p] = dr * dr + dg * dg + db * db > 26 * 26 ? 1 : 0
      }
      for (const c of components(colourMask(cf[i], plate, 34))) {
        let hid = 0,
          sx = 0,
          sy = 0
        for (const p of c.px) {
          if (jm[p]) hid++
          sx += p % W
          sy += (p / W) | 0
        }
        out.push({
          t: +t.toFixed(3),
          x: +((sx / c.n / W) * 100).toFixed(1),
          y: +((sy / c.n / H) * 100).toFixed(1),
          hid: +(hid / c.n).toFixed(3),
        })
      }
    }
    res[frame] = out
    console.log(`occlusion: frame ${frame} -> ${out.length} readings`)
  }
  return res
}

// -------------------------------------------------------------- 3. merge

function stageMerge(tracks, occl) {
  const all = []
  for (const [frame, w] of Object.entries(tracks))
    for (const tr of w.tracks) all.push({ frame: +frame, ...tr })
  all.sort((a, b) => a.pts[0].t - b.pts[0].t)
  const used = new Array(all.length).fill(false),
    flights = []
  const at = (p, t) => p.reduce((a, q) => (Math.abs(q.t - t) < Math.abs(a.t - t) ? q : a))
  for (let i = 0; i < all.length; i++) {
    if (used[i]) continue
    used[i] = true
    const cur = { pts: all[i].pts.slice() }
    for (let j = i + 1; j < all.length; j++) {
      if (used[j]) continue
      const B = all[j]
      const lo = Math.max(cur.pts[0].t, B.pts[0].t)
      const hi = Math.min(cur.pts[cur.pts.length - 1].t, B.pts[B.pts.length - 1].t)
      if (hi - lo < 0.25) continue
      let d = 0,
        n = 0
      for (let t = lo; t <= hi; t += 0.2) {
        const p = at(cur.pts, t),
          q = at(B.pts, t)
        d += Math.hypot(p.x - q.x, (p.y - q.y) * 0.5625)
        n++
      }
      if (d / n > 4) continue
      used[j] = true
      const seen = new Set(cur.pts.map(p => p.t.toFixed(2)))
      for (const p of B.pts) if (!seen.has(p.t.toFixed(2))) cur.pts.push(p)
      cur.pts.sort((a, b) => a.t - b.t)
    }
    flights.push(cur)
  }
  const occAll = []
  for (const arr of Object.values(occl)) occAll.push(...arr)
  const near = q =>
    occAll.filter(
      o => Math.abs(o.t - q.t) < 0.06 && Math.hypot(o.x - q.x, (o.y - q.y) * 0.5625) < 4,
    )
  const keep = []
  for (const fl of flights) {
    const p = fl.pts,
      dur = p[p.length - 1].t - p[0].t
    const sqMax = Math.max(...p.map(q => q.sq))
    const dx = Math.max(...p.map(q => q.x)) - Math.min(...p.map(q => q.x))
    const dy = Math.max(...p.map(q => q.y)) - Math.min(...p.map(q => q.y))
    if (dur < 0.8 || sqMax < 32 || (dx < 4 && dy < 4)) continue
    const hid = p
      .map(near)
      .filter(c => c.length)
      .map(c => c[0].hid)
    // Born already behind the page and never visible: corridor detail, not a flight.
    if (hid.length && hid[0] >= 0.85) continue
    const slide = slideOf(p[0].t)
    if (slide === null) continue
    keep.push({
      key: `${p[0].t.toFixed(2)}_${sqMax}`,
      slide,
      sqMax,
      t0: +p[0].t.toFixed(2),
      t1: +p[p.length - 1].t.toFixed(2),
      pts: p,
    })
  }
  keep.sort((a, b) => a.t0 - b.t0)
  console.log(`merge: ${keep.length} flights`)
  return keep
}

// ------------------------------------------------------- 3-bis. crossing

/**
 * THE CLIP'S OWN OCCLUSION CURVE, one reading per tracked frame.
 *
 * Stage 2 already measures, at 10 Hz, how much of each blob the journal covers.
 * What used to reach the table from it was a single number per flight, and a
 * badly chosen one: `fly-reference.json` keeps five samples per flight, about a
 * second apart, and `zFlip` was the MIDPOINT between the last of them that read
 * clear and the first that read covered. A handover that takes 0.7 s therefore
 * landed anywhere inside a 1.1 s bracket, and it landed late every time — on
 * all 27 flights the dense curve leaves zero EARLIER than the sparse midpoint,
 * by 0.3 s at best and 4.5 s at worst (milkpack-1, planet-1, basketball-1).
 * Those seconds are the defect the owner reports as "everything flies in front
 * of the journal": the reference has the page holding the object while we are
 * still drawing it on top of the page.
 */
function coverCurves(flights, occl) {
  const occAll = []
  for (const arr of Object.values(occl)) occAll.push(...arr)
  const out = {}
  for (const f of flights) {
    const a = ASSIGN[f.key]
    if (!a) continue
    const curve = []
    for (const q of f.pts) {
      const c = occAll.filter(
        o => Math.abs(o.t - q.t) < 0.06 && Math.hypot(o.x - q.x, (o.y - q.y) * 0.5625) < 4,
      )
      if (c.length) curve.push([+q.t.toFixed(2), c[0].hid])
    }
    out[a.id] = curve
  }
  return out
}

/**
 * WHEN THE OBJECT GOES BEHIND THE PAGE: the first frame the journal touches it.
 *
 * Not the middle of the handover, and the difference is the whole point. What
 * the curve records after that first touch is not depth at all — it is the page
 * EDGE sweeping across an object that is already behind it, which is why the
 * fraction climbs, dips and climbs again (cross-3 hovers between 0.2 and 0.8 for
 * four seconds) instead of stepping. Depth is the one bit the curve does carry:
 * before the first touch the object is in front, after it, behind. Put the step
 * there and the covering that follows is drawn by the geometry, gradually, the
 * way the reference does it — put the step in the middle and the object jumps
 * from wholly drawn to half eaten in one frame.
 *
 * A touch has to LAST 0.3 s to count. The mask reaches into the object's magenta
 * halo, so a single frame can read a percent or two of contact off a glow that
 * merely passes near the page.
 *
 * `zOut` is the other end — where the page has taken 85 % of the object and
 * keeps it — and it is written to the reference for the gate, not to the table.
 */
const CROSS_ON = 0.02
function crossing(curve) {
  if (curve.length < 4) return null
  const t = curve.map(c => c[0])
  const h = curve.map((c, i) => {
    const w = [curve[Math.max(0, i - 1)][1], c[1], curve[Math.min(curve.length - 1, i + 1)][1]]
    return w.sort((a, b) => a - b)[1]
  })
  let zIn = null
  for (let i = 0; i < h.length && zIn === null; i++) {
    if (h[i] <= CROSS_ON) continue
    let held = true
    for (let j = i; j < h.length && t[j] - t[i] < 0.3; j++) if (h[j] <= CROSS_ON) held = false
    if (held) zIn = t[i]
  }
  let zOut = null
  for (let i = 0; i < h.length && zOut === null; i++) {
    if (h[i] < 0.85) continue
    let held = true
    for (let j = i; j < h.length; j++) if (h[j] < 0.6) held = false
    if (held) zOut = t[i]
  }
  return zIn === null ? null : { zIn, zOut: zOut ?? t[t.length - 1] }
}

// ---------------------------------------------------------------- 4. fit

/** sprite -> luminance + alpha on the K grid, and its alpha centroid. */
const sprites = {}
function sprite(name) {
  if (sprites[name]) return sprites[name]
  const buf = sh([
    '-i',
    `${ROOT}src/assets/objects/${name}.webp`,
    '-vf',
    `scale=${K}:${K}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-',
  ])
  const g = new Float32Array(K * K),
    a = new Float32Array(K * K)
  let n = 0,
    sx = 0,
    sy = 0
  for (let p = 0; p < K * K; p++) {
    const q = p * 4
    a[p] = buf[q + 3] / 255
    g[p] = 0.299 * buf[q] + 0.587 * buf[q + 1] + 0.114 * buf[q + 2]
    if (a[p] > 0.5) {
      n++
      sx += p % K
      sy += (p / K) | 0
    }
  }
  return (sprites[name] = { g, a, n, cx: sx / n, cy: sy / n, fill: Math.sqrt(n) / K })
}

/** Rotate and scale a sprite about its alpha centroid, onto (cx, cy). */
function warp(sp, deg, s, cx, cy) {
  const g = new Float32Array(K * K),
    a = new Float32Array(K * K)
  const r = (-deg * Math.PI) / 180,
    co = Math.cos(r) / s,
    si = Math.sin(r) / s
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const dx = x - cx,
        dy = y - cy
      const u = Math.round(sp.cx + co * dx + si * dy),
        v = Math.round(sp.cy - si * dx + co * dy)
      if (u < 0 || u >= K || v < 0 || v >= K) continue
      const p = v * K + u
      g[y * K + x] = sp.g[p]
      a[y * K + x] = sp.a[p]
    }
  return { g, a }
}

/**
 * Silhouette overlap AND luminance correlation, in that proportion.
 * Neither alone is enough: overlap says nothing about a round object's angle,
 * and luminance alone drifts on a low-contrast sprite over a busy corridor.
 */
function score(tg, tm, w) {
  let n = 0,
    sa = 0,
    sb = 0,
    inter = 0,
    ua = 0,
    ub = 0
  for (let p = 0; p < K * K; p++) {
    const m = tm[p] > 0.5,
      s = w.a[p] > 0.5
    if (m) ua++
    if (s) ub++
    if (m && s) inter++
    if (m || s) {
      n++
      sa += tg[p]
      sb += w.g[p]
    }
  }
  if (!n || !inter) return -1
  const ma = sa / n,
    mb = sb / n
  let num = 0,
    da = 0,
    db = 0
  for (let p = 0; p < K * K; p++) {
    if (!(tm[p] > 0.5 || w.a[p] > 0.5)) continue
    const A = tg[p] - ma,
      B = w.g[p] - mb
    num += A * B
    da += A * A
    db += B * B
  }
  return 0.45 * (num / Math.sqrt(Math.max(da * db, 1e-6))) + 0.55 * (inter / (ua + ub - inter))
}

/**
 * Keep the blob the crop is centred on and drop the neighbours.
 *
 * Flooding the RAW mask is not enough: plenty of these objects break into
 * pieces under a threshold — the orbit dial is a ring with loose markers — and
 * keeping only the piece under the centre made those measure roughly half their
 * real size. The flood runs on a DILATED copy, which bridges the gaps inside
 * one object without reaching a neighbour a whole object away.
 */
function keepCentral(m) {
  const d = new Uint8Array(K * K)
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      let v = 0
      for (let dy = -2; dy <= 2 && !v; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const yy = y + dy,
            xx = x + dx
          if (yy >= 0 && yy < K && xx >= 0 && xx < K && m[yy * K + xx] > 0.5) {
            v = 1
            break
          }
        }
      d[y * K + x] = v
    }
  const c = K / 2
  let seed = -1,
    bd = 1e9
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      if (!d[y * K + x]) continue
      const q = (x - c) ** 2 + (y - c) ** 2
      if (q < bd) {
        bd = q
        seed = y * K + x
      }
    }
  if (seed < 0) return
  const keep = new Uint8Array(K * K),
    st = [seed]
  keep[seed] = 1
  while (st.length) {
    const p = st.pop(),
      x = p % K,
      y = (p / K) | 0
    for (const q of [x > 0 && p - 1, x < K - 1 && p + 1, y > 0 && p - K, y < K - 1 && p + K])
      if (q !== false && d[q] && !keep[q]) {
        keep[q] = 1
        st.push(q)
      }
  }
  for (let p = 0; p < K * K; p++) if (!keep[p]) m[p] = 0
}

const oneFrame = t =>
  sh(['-ss', String(t), '-i', CLEAN, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

function stageFit(flights) {
  const out = []
  for (const f of flights) {
    const a = ASSIGN[f.key]
    if (!a) {
      console.log(`fit: no asset for ${f.key} — dropped`)
      continue
    }
    const sp = sprite(a.asset)
    const fs = []
    for (let t = Math.max(0, f.t0 - 9); t <= Math.min(94, f.t1 + 9); t += 0.5) fs.push(oneFrame(t))
    const pl = Buffer.alloc(FW * FH * 3)
    for (let i = 0; i < FW * FH * 3; i++) {
      const c = fs.map(x => x[i]).sort((p, q) => p - q)
      pl[i] = c[c.length >> 1]
    }
    const ks = []
    for (let i = 0; i < f.pts.length; i += 8) {
      const q = f.pts[i]
      // 2.7x the object, so a rotated silhouette never leaves the crop. The
      // crop may hang off the frame — pad rather than skip, which is what
      // dropped two thirds of every high-hovering flight in an earlier pass.
      const L = Math.round(Math.max(40, q.sq * 2) * 2.7)
      const x0 = Math.round((q.x / 100) * FW) - (L >> 1),
        y0 = Math.round((q.y / 100) * FH) - (L >> 1)
      const fr = oneFrame(q.t)
      const tg = new Float32Array(K * K),
        tm = new Float32Array(K * K)
      let n = 0,
        edge = 0
      for (let y = 0; y < K; y++)
        for (let x = 0; x < K; x++) {
          const sx = x0 + Math.round((x * L) / K),
            sy = y0 + Math.round((y * L) / K)
          if (sx < 0 || sx >= FW || sy < 0 || sy >= FH) continue
          const s = (sy * FW + sx) * 3
          const dr = fr[s] - pl[s],
            dg = fr[s + 1] - pl[s + 1],
            db = fr[s + 2] - pl[s + 2]
          tg[y * K + x] = 0.299 * fr[s] + 0.587 * fr[s + 1] + 0.114 * fr[s + 2]
          if (Math.sqrt(dr * dr + dg * dg + db * db) > 34) {
            tm[y * K + x] = 1
            n++
            if (sx < 2 || sx >= FW - 2 || sy < 2 || sy >= FH - 2) edge++
          }
        }
      if (n < 60) continue
      keepCentral(tm)
      n = 0
      let cx = 0,
        cy = 0
      for (let y = 0; y < K; y++)
        for (let x = 0; x < K; x++)
          if (tm[y * K + x] > 0.5) {
            n++
            cx += x
            cy += y
          }
      if (n < 60) continue
      cx /= n
      cy /= n
      const s0 = Math.sqrt(n) / (sp.fill * K)
      let best = { sc: -2 }
      for (let deg = 0; deg < 360; deg += 6)
        for (const sm of [0.88, 1, 1.14]) {
          const sc = score(tg, tm, warp(sp, deg, s0 * sm, cx, cy))
          if (sc > best.sc) best = { sc, deg, s: s0 * sm }
        }
      for (let deg = best.deg - 6; deg <= best.deg + 6; deg += 1.5)
        for (let k = -4; k <= 4; k++) {
          const s = best.s * (1 + k * 0.03)
          const sc = score(tg, tm, warp(sp, deg, s, cx, cy))
          if (sc > best.sc) best = { sc, deg, s }
        }
      ks.push({
        t: q.t,
        x: q.x,
        y: q.y,
        size: Math.round(best.s * L),
        rot: +(((best.deg + 180) % 360) - 180).toFixed(1),
        sc: +best.sc.toFixed(3),
        clip: edge > 0.01 * n,
      })
    }
    out.push({ ...a, t0: f.t0, t1: f.t1, slide: f.slide, ks })
    console.log(`fit: ${a.id} ${ks.length} keys`)
  }
  return out
}

// -------------------------------------------------------------- 5. table

const SYMS = [90, 180, 360]

/**
 * THE ARTWORK'S OWN SYMMETRY, measured off the sprite instead of searched for
 * in the answers.
 *
 * The fold below has to know which rotations of a sprite are the SAME PICTURE,
 * because those are the ones the fit is free to return interchangeably. Picking
 * that by "whichever symmetry leaves the tightest spread" cannot work: folding
 * at 90 can only ever leave a spread as tight as folding at 180, so 90 always
 * won, and a milk carton — which has no 90 deg symmetry at all — had a quarter
 * turn quietly taken out of its angle. On the contact sheet for milkpack-3 that
 * is a carton lying on its side at t = 74.07 where the clip stands it upright.
 *
 * So ask the sprite. Rotate it onto itself and score it with the same function
 * the fit uses — silhouette overlap and luminance together, which is the point:
 * a carton's OUTLINE nearly survives a half turn, and its cap does not, so a
 * mask-only test would call it 180-symmetric and lose the cap.
 */
function symOf(sp) {
  for (const sym of [90, 180]) {
    let worst = 1
    for (let d = sym; d < 360; d += sym)
      worst = Math.min(worst, score(sp.g, sp.a, warp(sp, d, 1, sp.cx, sp.cy)))
    if (worst >= SYM_SAME) return sym
  }
  // 180 rather than 360 as the floor: a silhouette and its half turn have the
  // same principal axis, and the luminance term that tells them apart is the
  // weakest one in `score` — which is how the pen came back as 77 on one frame
  // and 257 on the next off art that is only 0.35 similar to its own half turn.
  return 180
}
const SYM_SAME = 0.9
const ANGLE_OUTLIER = 30

/**
 * Fold a fitted angle series onto one branch.
 *
 * The fit answers modulo the artwork's own symmetry and cannot do better: a
 * four-pointed star reads the same every 90 deg, and ANY elongated silhouette
 * reads the same every 180, so the same pen comes back as 77 on one frame and
 * 257 on the next. Both are the same picture; tweening between them spins the
 * object half a turn it never makes.
 *
 * WHICH symmetry comes from the SPRITE (symOf above), not from a search over
 * the answers. Searching for the tightest spread was the old rule and it could
 * only ever return 90, since folding at 90 leaves a spread no wider than
 * folding at 180 — so every flight was quietly quantised to quarter turns the
 * artwork does not have. Measured, none of the seventeen sprites is 90 deg
 * symmetric, not even the cross or the four-pointed spark: the art is shaded
 * and lit from one side, and the fit scores that shading. So they all fold at
 * 180, which is the ambiguity a silhouette correlation genuinely has.
 *
 * Every flight in the reference turns by tens of degrees at most, so a fold
 * that collapses a 180 deg spread to 6 is reading the symmetry rather than
 * hiding a real rotation. A flight that will not fold below 45 deg says so on
 * stderr.
 *
 * FOLDING IS ROUND THE FLIGHT'S OWN MEDIAN, not along the flight. Chaining each
 * sample to its neighbours reads better on paper — a branch ought to be
 * continuous in time — and it was tried here: on these objects it drifts. Their
 * silhouettes are round enough that the fitted angle is noisy, an unwrap adds
 * every noise step to its running total, and half the flights walked a whole
 * 180 deg branch away over their length (report-1 ended at a median of -228,
 * milkpack-3 at -227). A window round the median cannot drift, which on a
 * measurement this noisy is worth more than continuity between neighbours.
 * Outliers are dealt with in stageTable instead, where the fit's own score says
 * which keys to believe.
 */
function fold(rots, only = null) {
  let best = null
  for (const sym of only ? [only] : SYMS) {
    const c = med(rots)
    const f = rots.map(r => {
      let d = r - c
      d -= Math.round(d / sym) * sym
      return c + d
    })
    const s = med(f)
    const g = f.map(r => {
      let d = r - s
      d -= Math.round(d / sym) * sym
      return s + d
    })
    const spread = Math.max(...g) - Math.min(...g)
    if (!best || spread < best.spread - 1e-6) best = { sym, spread, g }
  }
  return best
}

/** Douglas-Peucker on one channel of a polyline. */
function dp(ks, get, tol) {
  const keep = new Set([0, ks.length - 1])
  const rec = (a, b) => {
    if (b - a < 2) return
    const ta = ks[a].t,
      tb = ks[b].t,
      va = get(ks[a]),
      vb = get(ks[b])
    let bi = -1,
      bd = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(get(ks[i]) - (va + (vb - va) * ((ks[i].t - ta) / (tb - ta))))
      if (d > bd) {
        bd = d
        bi = i
      }
    }
    if (bi < 0) return
    keep.add(bi)
    rec(a, bi)
    rec(bi, b)
  }
  rec(0, ks.length - 1)
  return keep
}

function stageTable(fit, covers) {
  const CUT = Object.fromEntries(CUTS)
  const out = []
  for (const f of fit) {
    const good = f.ks.filter(k => k.sc >= 0.22)
    if (good.length < 4) {
      console.error(`!! ${f.id}: only ${good.length} usable keys`)
      continue
    }
    // Angle and size are properties of the object, not of one frame: a single
    // outlier must not become a keyframe.
    const sm = good.map((k, i) => ({
      ...k,
      size: Math.round(med(good.slice(Math.max(0, i - 2), i + 3).map(q => q.size))),
    }))
    // The fitter rotates the SPRITE onto the frame; CSS rotates the element the
    // other way round, so the angle changes sign on the way into the table.
    const fd = fold(
      sm.map(k => -k.rot),
      symOf(sprite(f.asset)),
    )
    if (fd.spread > 45)
      console.error(
        `!! ${f.id}: angle spans ${fd.spread.toFixed(0)} deg after folding at ${fd.sym}`,
      )
    sm.forEach((k, i) => {
      k.rot = fd.g[i]
    })
    // AN ANGLE FITTED ON A SILHOUETTE THE FRAME CUTS IN HALF IS NOT A MEASUREMENT.
    //
    // Every flight enters past an edge and most of them hover against one, and
    // while the object is half outside the picture the correlation has half a
    // shape to match — it answers, with a decent score, about a shape that is
    // not the object's. milkpack-3 is the case that made this visible: its
    // first five keys read 86-93 deg where the settled flight reads 47, and on
    // the contact sheet that is a carton lying on its side at t = 74.07 where
    // the clip stands it up (V-07). pen-1 and milkpack-1 have the same defect on
    // their entry key.
    //
    // The flight's own confident keys are the better estimate, so anything far
    // enough from their median is replaced by it. FAR ENOUGH IS 30 DEG, and that
    // comes off the reference rather than off taste: read the clip's own
    // principal axis across a whole flight and it moves 31 deg on milkpack-1,
    // 37 on milkpack-2, 18 on coin-1. Nothing in this story turns further than
    // that in six seconds, so a key a third of a turn from its flight's median
    // is not the object turning, it is the fit answering about the half of a
    // silhouette the frame has cut off. At 45 deg the rule missed exactly the
    // keys it was written for — milkpack-3 keeps -85.5 against a median of -47,
    // and that pair of frames IS the carton on its side.
    //
    // Position and size are untouched: those the tracker measures off the blob,
    // and a blob clipped by the frame still has a centre.
    const scs = sm.map(k => k.sc).sort((a, b) => a - b)
    const cut = scs[Math.floor(scs.length / 2)]
    const trend = med(sm.filter(k => k.sc >= cut).map(k => k.rot))
    let fixed = 0
    for (const k of sm)
      if (Math.abs(k.rot - trend) > ANGLE_OUTLIER) {
        k.rot = trend
        fixed++
      }
    if (fixed)
      console.error(
        `!! ${f.id}: ${fixed} of ${sm.length} angles were more than ${ANGLE_OUTLIER} deg off the flight's own median (${trend.toFixed(0)}) and were replaced by it`,
      )
    // Angle keeps a 5-frame median; POSITION IS LEFT ALONE. The tracker's
    // centroid wanders a pixel or two between frames, and an earlier cut of
    // this script smoothed it — but the runtime reads these rows through a
    // spline (flyingObject.js), and measured at 60 Hz through that spline the
    // path already turns by less than 60 deg on every frame of every flight and
    // changes speed by at most 5 % of the stage per second. Smoothing the rows
    // as well would move the table away from the measurement for nothing.
    const sm2 = sm.map((k, i) => ({
      ...k,
      rot: +med(sm.slice(Math.max(0, i - 2), i + 3).map(q => q.rot)).toFixed(1),
    }))

    const keep = new Set([
      ...dp(sm2, k => k.x, 0.35),
      ...dp(sm2, k => k.y, 0.35),
      ...dp(sm2, k => k.size, 0.045 * med(sm2.map(k => k.size))),
      ...dp(sm2, k => k.rot, 2.5),
    ])
    const ks = [...keep].sort((a, b) => a - b).map(i => sm2[i])

    // Exit: the object sinks onto the page and the page covers it. The fit stops
    // where the clip stops giving it something to measure, which is a beat BEFORE
    // the tracker loses it, so the last measured leg is carried on to the
    // flight's own end. Without this the object is switched off while the
    // reference still has it on screen — which is the "objects vanish instead of
    // going behind the journal" this table was rebuilt to fix.
    // ...and it runs to the tracker's own last frame, not to within a tenth of
    // it. The gate reads the clip's last frame as the flight's occlusion claim,
    // so a flight that stops 0.1 s short answers NOT RENDERED to it.
    const z1 = ks[ks.length - 1],
      z2 = ks[ks.length - 2]
    if (f.t1 > z1.t + 0.01 && z2) {
      const dt2 = z1.t - z2.t,
        ex = f.t1 - z1.t
      ks.push({
        t: f.t1,
        x: z1.x + ((z1.x - z2.x) / dt2) * ex,
        y: z1.y + ((z1.y - z2.y) / dt2) * ex,
        size: Math.max(
          Math.round(z1.size * 0.45),
          Math.round(z1.size + ((z1.size - z2.size) / dt2) * ex),
        ),
        rot: z1.rot,
      })
    }

    // Entry: the object slides in from beyond a frame edge, where the fit has
    // nothing to measure. Extrapolate the first measured leg back to the cut.
    const a = ks[0],
      b = ks[1]
    const t0 = Math.min(a.t - 0.1, CUT[f.frame] ?? a.t),
      dt = a.t - t0
    const entry = {
      t: t0,
      x: a.x - ((b.x - a.x) / (b.t - a.t)) * dt,
      y: a.y - ((b.y - a.y) / (b.t - a.t)) * dt,
      size: a.size,
      rot: a.rot,
    }
    const cr = crossing(covers[f.id] ?? [])
    if (!cr) console.error(`!! ${f.id}: no occlusion curve, zFlip left at the flight's end`)
    out.push({
      id: f.id,
      asset: f.asset,
      frame: f.frame,
      zFlip: cr ? cr.zIn : +f.t1.toFixed(2),
      keys: [entry, ...ks].map(k => [
        +k.t.toFixed(2),
        +k.x.toFixed(1),
        +k.y.toFixed(1),
        k.size,
        +k.rot.toFixed(1),
      ]),
    })
  }
  return out
}

/** The rows of src/story/flyObjects.js, ready to paste between its markers. */
function printTable(table) {
  for (const f of table) {
    console.log(
      `  // ${f.id} — frame ${f.frame}, ${f.keys[0][0].toFixed(2)}..${f.keys[f.keys.length - 1][0].toFixed(2)} s`,
    )
    console.log(
      `  { id: '${f.id}', asset: '${f.asset}', frame: ${f.frame}, zFlip: ${f.zFlip}, keys: [`,
    )
    for (const k of f.keys)
      console.log(
        `    [${k[0].toFixed(2).padStart(5)}, ${k[1].toFixed(1).padStart(6)}, ${k[2].toFixed(1).padStart(6)}, ${String(k[3]).padStart(4)}, ${k[4].toFixed(1).padStart(6)}],`,
      )
    console.log('  ] },')
  }
}

/**
 * What the gate checks our pixels against: the clip's own numbers.
 *
 * Geometry comes off a TIGHT mask (colour distance 70) rather than the loose
 * one the tracker uses (34). The loose threshold deliberately reaches into the
 * magenta halo so a dim object is never lost mid-flight; that halo is not the
 * object, and compared against a glow-free render it made everything read
 * about 20 % small and, for a thin object like the pen, roughly a third too
 * round. The occlusion fraction still comes from the loose mask, where reaching
 * a little wide is harmless.
 */
function writeReference(flights, occl, covers) {
  const occAll = []
  for (const arr of Object.values(occl)) occAll.push(...arr)
  const hidAt = q => {
    const c = occAll.filter(
      o => Math.abs(o.t - q.t) < 0.08 && Math.hypot(o.x - q.x, (o.y - q.y) * 0.5625) < 4,
    )
    return c.length ? c[0].hid : null
  }
  /** sqrt(area) % of stage width, principal angle, elongation — on the tight mask. */
  const tight = q => {
    const fr = oneFrame(q.t)
    const cx = Math.round((q.x / 100) * FW),
      cy = Math.round((q.y / 100) * FH)
    const R = Math.round(q.sq * 2 * 1.9)
    const px = []
    for (let y = Math.max(0, cy - R); y < Math.min(FH, cy + R); y++)
      for (let x = Math.max(0, cx - R); x < Math.min(FW, cx + R); x++) {
        const p = (y * FW + x) * 3
        const dr = fr[p] - plate[p],
          dg = fr[p + 1] - plate[p + 1],
          db = fr[p + 2] - plate[p + 2]
        if (dr * dr + dg * dg + db * db > 70 * 70) px.push(y * FW + x)
      }
    // SIZE COMES OFF THE TRACKER'S OWN BLOB, in design px, and only the angle and
    // the elongation come off the tight mask. Two corrections in one line, both
    // found by re-running a measurement nobody had re-run in three days:
    //
    //  - PX, NOT PER CENT. `fly:check` measures our silhouette on the 1080-wide
    //    canvas and divides one by the other. This had been changed to a
    //    percentage of the stage on the writing side only, and the file on disk
    //    still held the px of an older pass, so nothing complained until the
    //    first re-run printed size ratios of x23.
    //  - THE TIGHT MASK CANNOT MEASURE SIZE. A colour distance of 70 hugs the
    //    lit part of an object and drops the rest of it into the corridor: it
    //    reads the football at 101 px where the blob reads 190 and the sprite is
    //    180 across. Our side of the comparison is measured off the sprite's
    //    ALPHA, which is the whole object, so the two are not the same quantity.
    //    The blob is: its 190 against our 180 is the 5 % the gate is for.
    //  - AND IT CANNOT MEASURE ELONGATION EITHER, for the same reason and in the
    //    other direction: keeping only the lit core of a shape makes it thinner
    //    than it is. The pen reads 11.6-12.2 tight, 8.4-8.8 loose, and its own
    //    sprite is 8.31 — the blob has it, the core does not. Only `deg` comes
    //    off the tight mask now, where hugging the body IS the point.
    //
    // What the old file on disk carried in this column was neither: it was the
    // SPRITE's own elongation, constant down every flight (8.31 for the pen,
    // 1.69 for coin-2), so the aspect check was asking whether our render had
    // squashed the sprite — a question it could only answer yes to. That is how
    // the coins were re-assigned by elongation against numbers that were never
    // measured off the clip at all: coin-2's own silhouette measures 3.2-3.9
    // there, which is `coin-edge` (3.95) and not the 1.69 of `coin-d`.
    if (px.length < 80) return [+(q.sq * (FW / W)).toFixed(1), q.deg, q.elong]
    const m = moments(px, FW)
    return [+(q.sq * (FW / W)).toFixed(1), +m.deg.toFixed(1), q.elong]
  }

  const N = 5
  const out = []
  let plate = null
  for (const f of flights) {
    const a = ASSIGN[f.key]
    if (!a) continue
    // Only frames wholly inside the picture: a silhouette clipped by the edge
    // has no measurable size.
    const ok = f.pts.filter(
      q => q.x > 6 && q.x < 94 && q.y > 4 && q.y < 96 && q.sq >= 0.55 * f.sqMax,
    )
    if (!ok.length) continue
    {
      const fs = []
      for (let t = Math.max(0, f.t0 - 9); t <= Math.min(94, f.t1 + 9); t += 0.7)
        fs.push(oneFrame(t))
      plate = Buffer.alloc(FW * FH * 3)
      for (let i = 0; i < FW * FH * 3; i++) {
        const c = fs.map(x => x[i]).sort((p, q) => p - q)
        plate[i] = c[c.length >> 1]
      }
    }
    const samples = []
    for (let i = 0; i < N; i++) {
      const q = ok[Math.round(((ok.length - 1) * i) / (N - 1))]
      if (!q) continue
      samples.push([+q.t.toFixed(2), q.x, q.y, ...tight(q), hidAt(q)])
    }
    // ...and the last frame of all, which is where the occlusion claim lives.
    const last = f.pts[f.pts.length - 1]
    if (samples.length && samples[samples.length - 1][0] < last.t - 0.2)
      samples.push([+last.t.toFixed(2), last.x, last.y, ...tight(last), hidAt(last)])
    const cr = crossing(covers[a.id] ?? [])
    out.push({
      id: a.id,
      asset: a.asset,
      frame: a.frame,
      // The crossing the runtime is built on, so the gate judges our depth
      // against the same measurement rather than against our own table.
      zIn: cr ? cr.zIn : null,
      zOut: cr ? cr.zOut : null,
      samples: samples.filter(s => s[6] !== null),
      // The whole curve, decimated to 10 Hz: five samples cannot say whether
      // the page takes the object gradually or in one step, and that shape is
      // exactly what the owner judges the flights by.
      cover: (covers[a.id] ?? []).filter((c, i) => i % 3 === 0).map(c => [c[0], +c[1].toFixed(2)]),
    })
  }
  writeFileSync(
    `${ROOT}scripts/fly-reference.json`,
    JSON.stringify(
      {
        source: '_refs/DP-15152 - clean bg.mp4 + preview.mp4, measured by scripts/fly-measure.mjs',
        units:
          '[t seconds, cx % of stage, cy % of stage, sqrt(area) in design px, principal angle deg, elongation, fraction the journal covers] — geometry on a tight mask (colour distance 70), which hugs the object body rather than its magenta halo; the occlusion fraction still comes from the loose mask the tracker uses',
        flights: out,
      },
      null,
      1,
    ),
  )
  console.log(
    `reference: ${out.length} flights, ${out.reduce((s, f) => s + f.samples.length, 0)} samples`,
  )
}

/**
 * WHICH OBJECT EACH FLIGHT IS. Keyed by the merge stage's own key so a re-run
 * lands on the same rows. Read off contact sheets of the clip — see the header.
 * Frames 4-7 are absent on purpose: the "Ithems fly" group is either scenery
 * inside the camera's fly-through or 100 % behind the cover, and nothing of it
 * is visible in the composite.
 */
const ASSIGN = {
  '10.97_73': { id: 'pen-1', asset: 'pen', frame: 8 },
  '17.23_152': { id: 'calendar-1', asset: 'calendar', frame: 9 },
  '21.97_39': { id: 'spark-1', asset: 'spark', frame: 10 },
  '22.07_61': { id: 'spark-2', asset: 'spark', frame: 10 },
  '22.07_73': { id: 'spark-3', asset: 'spark', frame: 10 },
  '22.23_88': { id: 'spark-4', asset: 'spark', frame: 10 },
  '22.53_56': { id: 'spark-5', asset: 'spark', frame: 10 },
  '25.87_123': { id: 'chip-1', asset: 'points-b', frame: 11 },
  '26.47_80': { id: 'chip-2', asset: 'points-b', frame: 11 },
  // Frame 12's three coins are three POSES of one cluster export: the Figma
  // nodes 2726/2727/2728 all exported the same five-coin image.
  '30.23_55': { id: 'coin-1', asset: 'coin-d', frame: 12 },
  '30.47_78': { id: 'coin-2', asset: 'coin-edge', frame: 12 },
  '30.73_66': { id: 'coin-3', asset: 'coin-b', frame: 12 },
  '34.30_129': { id: 'planet-1', asset: 'planet', frame: 13 },
  '39.14_82': { id: 'cross-1', asset: 'cross', frame: 14 },
  '39.47_100': { id: 'cross-2', asset: 'cross', frame: 14 },
  '44.66_72': { id: 'heart-1', asset: 'heart', frame: 15 },
  '49.53_94': { id: 'report-1', asset: 'report', frame: 16 },
  '49.56_102': { id: 'report-2', asset: 'report', frame: 16 },
  '53.03_123': { id: 'basketball-1', asset: 'basketball', frame: 17 },
  // The clip plainly shows a tennis ball on frame 17 and there is no Tennis
  // node in the `21770:2667` section to export. The sprite is cut out of the
  // clip itself — see the note in src/assets/objects.
  '53.80_60': { id: 'tennis-1', asset: 'tennis', frame: 17 },
  '57.17_95': { id: 'soccer-1', asset: 'soccer', frame: 18 },
  '57.57_91': { id: 'cross-3', asset: 'cross', frame: 18 },
  '61.60_105': { id: 'planet-cow-1', asset: 'planet-cow', frame: 19 },
  '67.20_138': { id: 'milkpack-1', asset: 'milkpack', frame: 20 },
  '67.53_132': { id: 'milkpack-2', asset: 'milkpack', frame: 20 },
  '73.30_141': { id: 'milkpack-3', asset: 'milkpack', frame: 21 },
  '78.54_129': { id: 'gift-1', asset: 'gift', frame: 22 },
}

// ------------------------------------------------------------------ main

// `--syms`: what each sprite thinks its own symmetry is, which is what the
// fold trusts. Prints and exits, touching no cache.
if (args.includes('--syms')) {
  for (const name of [...new Set(Object.values(ASSIGN).map(a => a.asset))].sort()) {
    const sp = sprite(name)
    const at = d => score(sp.g, sp.a, warp(sp, d, 1, sp.cx, sp.cy)).toFixed(3)
    console.log(`${name.padEnd(12)} 90:${at(90)} 180:${at(180)} 270:${at(270)} -> ${symOf(sp)}`)
  }
  process.exit(0)
}

const tracks = cache('tracks', stageTracks)
if (stopAfter === 'tracks') process.exit(0)
const occl = cache('occlusion', () => stageOcclusion(tracks))
if (stopAfter === 'occlusion') process.exit(0)
const flights = cache('flights', () => stageMerge(tracks, occl))
if (stopAfter === 'merge') process.exit(0)
const covers = coverCurves(flights, occl)
const fit = cache('fit', () => stageFit(flights))
if (stopAfter === 'fit') process.exit(0)
writeReference(flights, occl, covers)
printTable(stageTable(fit, covers))
