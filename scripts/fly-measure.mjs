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
 * Fold a fitted angle series onto one branch.
 *
 * The fit answers modulo the artwork's own symmetry and cannot do better: a
 * four-pointed star reads the same every 90 deg, and ANY elongated silhouette
 * reads the same every 180, so the same pen comes back as 77 on one frame and
 * 257 on the next. Both are the same picture; tweening between them spins the
 * object half a turn it never makes.
 *
 * The branch is chosen by evidence rather than declared per asset: try each
 * symmetry, fold every sample into the half-window around the median, and keep
 * the one that leaves the tightest spread. Every flight in the reference turns
 * by tens of degrees at most, so a fold that collapses a 180 deg spread to 6 is
 * reading the symmetry rather than hiding a real rotation. A flight that will
 * not fold below 45 deg says so on stderr.
 */
function fold(rots) {
  let best = null
  for (const sym of SYMS) {
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

function stageTable(fit) {
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
    const fd = fold(sm.map(k => -k.rot))
    if (fd.spread > 45)
      console.error(
        `!! ${f.id}: angle spans ${fd.spread.toFixed(0)} deg after folding at ${fd.sym}`,
      )
    sm.forEach((k, i) => {
      k.rot = fd.g[i]
    })
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
    const z1 = ks[ks.length - 1],
      z2 = ks[ks.length - 2]
    if (f.t1 > z1.t + 0.12 && z2) {
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
    out.push({
      id: f.id,
      asset: f.asset,
      frame: f.frame,
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
    console.log(`  { id: '${f.id}', asset: '${f.asset}', frame: ${f.frame}, keys: [`)
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
function writeReference(flights, occl) {
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
    if (px.length < 80) return [+((q.sq / W) * 100).toFixed(2), q.deg, q.elong]
    const m = moments(px, FW)
    return [+((Math.sqrt(px.length) / FW) * 100).toFixed(2), +m.deg.toFixed(1), +m.elong.toFixed(2)]
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
    out.push({
      id: a.id,
      asset: a.asset,
      frame: a.frame,
      samples: samples.filter(s => s[6] !== null),
    })
  }
  writeFileSync(
    `${ROOT}scripts/fly-reference.json`,
    JSON.stringify(
      {
        source: '_refs/DP-15152 - clean bg.mp4 + preview.mp4, measured by scripts/fly-measure.mjs',
        units:
          '[t seconds, cx % of stage, cy % of stage, sqrt(area) % of stage width, principal angle deg, elongation, fraction the journal covers] — geometry on a tight mask (colour distance 70), which hugs the object body rather than its magenta halo; the occlusion fraction still comes from the loose mask the tracker uses',
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

const tracks = cache('tracks', stageTracks)
if (stopAfter === 'tracks') process.exit(0)
const occl = cache('occlusion', () => stageOcclusion(tracks))
if (stopAfter === 'occlusion') process.exit(0)
const flights = cache('flights', () => stageMerge(tracks, occl))
if (stopAfter === 'merge') process.exit(0)
const fit = cache('fit', () => stageFit(flights))
if (stopAfter === 'fit') process.exit(0)
writeReference(flights, occl)
printTable(stageTable(fit))
