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
  // A `--only` run answers about one frame of the story. Writing that to the
  // cache would leave the next full run reading a table with twenty six flights
  // missing and no sign of why.
  if (only) return v
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
 * THE TOUCH HAS TO BE THE ONE THAT LASTS, and lasting 0.3 s is not enough to
 * prove it. Four flights pass CLOSE to the page long before they go behind it,
 * and the mask reaches into their magenta halo, so the curve lifts to 3–8 % for
 * a second or two and then falls back to zero for another one and a half:
 * calendar-1 lifts at 18.0 and is back at 2 % by 18.9 while the clip still draws
 * the whole clock face; chip-1 lifts at 27.6 and reads a flat ZERO from 28.5 to
 * 29.9; coin-2 lifts at 31.7 and is at zero from 33.1 to 34.0; milkpack-3 lifts
 * at 73.7 and is at zero from 74.6 to 75.4. Taking the first lasting touch put
 * the handover 1.2 to 2.6 s early on those four, and the owner sees exactly
 * that: the object dives under the page while the clip still has it in front.
 *
 * So the crossing is found from the END of the story backwards. First the
 * COMMITMENT — the frame where the page holds a quarter of the body and does
 * not give it back within half a second. That is unmistakable: a graze never
 * reaches a quarter. The crossing is then the frame after the LAST time before
 * that commitment on which the page was clear of the object, so a graze that
 * returns to zero is skipped by construction: the clear stretch between it and
 * the real handover is what the search lands on.
 *
 * "Clear" has to LAST 0.2 s, and that clause is the whole difference between a
 * measurement and a coin toss. The tracker drops a frame now and then, and a
 * dropped frame reads as zero contact: milkpack-2 reads 20 % covered, then one
 * 10 Hz sample of zero, then 64 %. Without the duration that single hole is
 * "the page was clear", and the flight's handover jumps 3.3 s late. The holes
 * are one sample wide; the real gap in calendar-1 is 0.36 s wide, so 0.2 s
 * separates them with room on both sides.
 *
 * `zOut` is the other end — where the page has taken 85 % of the object and
 * keeps it — and it is written to the reference for the gate, not to the table.
 */
const CROSS_ON = 0.02       // contact at all, above the halo's own reading
const CROSS_COMMIT = 0.25   // the page has really taken the body
const CROSS_KEEP = 0.1      // ...and has not handed it back
const CROSS_KEEP_S = 0.5
const CROSS_CLEAR_S = 0.2   // ...and a hole in the track is not a clearance
function crossing(curve) {
  if (curve.length < 4) return null
  const t = curve.map(c => c[0])
  const h = curve.map((c, i) => {
    const w = [curve[Math.max(0, i - 1)][1], c[1], curve[Math.min(curve.length - 1, i + 1)][1]]
    return w.sort((a, b) => a - b)[1]
  })
  let commit = -1
  for (let i = 0; i < h.length && commit < 0; i++) {
    if (h[i] < CROSS_COMMIT) continue
    let held = true
    for (let j = i; j < h.length && t[j] - t[i] < CROSS_KEEP_S; j++)
      if (h[j] < CROSS_KEEP) held = false
    if (held) commit = i
  }
  let zIn = null
  if (commit >= 0) {
    let last = -1
    for (let i = commit - 1; i >= 0 && last < 0; i--) {
      if (h[i] > CROSS_ON) continue
      let a = i
      while (a > 0 && h[a - 1] <= CROSS_ON) a--
      if (t[i] - t[a] >= CROSS_CLEAR_S) last = i
      else i = a
    }
    zIn = last < 0 ? t[0] : t[Math.min(last + 1, commit)]
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
 *
 * `tv` marks WHICH CELLS OF THE GRID ARE INSIDE THE PICTURE. Without it a
 * sprite that hangs off the frame is scored against black: the half of the
 * template beyond the edge is counted as "the sprite says yes, the clip says
 * no", which is the whole of an entering object's silhouette and drives the
 * overlap term to nothing. That is why the fit answered `size: 47` about a
 * basketball 321 px across on the frame it first appears — it shrank the
 * template until it fitted the visible arc. Skipping the cells the picture
 * does not cover asks the only answerable question: does the part of the
 * template that IS in frame look like what is in frame there.
 */
function score(tg, tm, w, tv) {
  let n = 0,
    sa = 0,
    sb = 0,
    inter = 0,
    ua = 0,
    ub = 0
  for (let p = 0; p < K * K; p++) {
    if (tv && !tv[p]) continue
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
    if (tv && !tv[p]) continue
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

/**
 * Per-pixel temporal median of a stack of frames — the background plate.
 *
 * Same answer as `fs.map(x => x[i]).sort()` per pixel, and about fifteen times
 * quicker: that form allocated a fresh array and ran a comparator sort for each
 * of six million subpixels, which put a single flight's plate at minutes and a
 * full re-measure at hours. One scratch buffer and an insertion sort over a few
 * dozen bytes does the same work without the garbage.
 */
function medianPlate(fs) {
  const out = Buffer.alloc(FW * FH * 3)
  const k = fs.length,
    c = new Uint8Array(k),
    h = k >> 1
  for (let i = 0; i < FW * FH * 3; i++) {
    for (let j = 0; j < k; j++) {
      const v = fs[j][i]
      let q = j - 1
      while (q >= 0 && c[q] > v) {
        c[q + 1] = c[q]
        q--
      }
      c[q + 1] = v
    }
    out[i] = c[h]
  }
  return out
}

const oneFrame = t =>
  sh(['-ss', String(t), '-i', CLEAN, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/**
 * The K grid under a crop of side L centred on (px, py), plus `tv` — which of
 * its cells fall inside the picture at all. The crop is allowed to hang off
 * the frame: that is the point, because an entering object's centre is out
 * there and a crop that refused to leave the picture could never hold it.
 */
function cropAt(fr, plate, px, py, L) {
  const x0 = Math.round(px) - (L >> 1),
    y0 = Math.round(py) - (L >> 1)
  const tg = new Float32Array(K * K),
    tm = new Float32Array(K * K),
    tv = new Uint8Array(K * K)
  let n = 0,
    edge = 0
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const sx = x0 + Math.round((x * L) / K),
        sy = y0 + Math.round((y * L) / K)
      if (sx < 0 || sx >= FW || sy < 0 || sy >= FH) continue
      tv[y * K + x] = 1
      const s = (sy * FW + sx) * 3
      const dr = fr[s] - plate[s],
        dg = fr[s + 1] - plate[s + 1],
        db = fr[s + 2] - plate[s + 2]
      tg[y * K + x] = 0.299 * fr[s] + 0.587 * fr[s + 1] + 0.114 * fr[s + 2]
      if (Math.sqrt(dr * dr + dg * dg + db * db) > 34) {
        tm[y * K + x] = 1
        n++
        if (sx < 2 || sx >= FW - 2 || sy < 2 || sy >= FH - 2) edge++
      }
    }
  return { tg, tm, tv, n, edge, x0, y0, L }
}

/** How much of a placed sprite the picture actually shows. */
function visFrac(w, tv) {
  let all = 0,
    seen = 0
  for (let p = 0; p < K * K; p++)
    if (w.a[p] > 0.5) {
      all++
      if (tv[p]) seen++
    }
  return all ? seen / all : 0
}

/**
 * WHERE THE WHOLE OBJECT IS, given only the part of it the frame kept.
 *
 * The forward fit never asks this: it takes the tracker's blob centroid as the
 * answer and searches angle and scale about it. A blob the edge has cut in half
 * still has a centre, but it is not the OBJECT's centre — it is dragged inward
 * by exactly the part the frame threw away, and that is what puts an entering
 * basketball two thirds of the way into the picture on its very first frame.
 *
 * So search the centre too, over the cells the picture covers, and let it land
 * outside the frame. Scale is GIVEN, never searched — see the note at the call
 * site for why an entry is the one place it has to be held. `degs` is the list
 * of angles to try: the whole circle on the frame that shows most of the body,
 * one held angle on every frame after it.
 */
function solveCut(sp, cr, degs, s, R) {
  let best = { sc: -2, cx: K / 2, cy: K / 2, s, deg: degs[0] }
  const at = (cx, cy, deg) => {
    const w = warp(sp, deg, s, cx, cy)
    const v = score(cr.tg, cr.tm, w, cr.tv)
    if (v > best.sc) best = { sc: v, cx, cy, s, deg, w }
  }
  for (let dy = -R; dy <= R; dy += 2)
    for (let dx = -R; dx <= R; dx += 2) at(K / 2 + dx, K / 2 + dy, degs[0])
  for (let pass = 0; pass < 2; pass++) {
    if (degs.length > 1) {
      const b = best
      for (const d of degs) at(b.cx, b.cy, d)
      const c = best
      for (let d = c.deg - 6; d <= c.deg + 6; d += 1.5) at(c.cx, c.cy, d)
    }
    const b = best
    for (let dy = -2.5; dy <= 2.5; dy += 0.5)
      for (let dx = -2.5; dx <= 2.5; dx += 0.5) at(b.cx + dx, b.cy + dy, b.deg)
  }
  if (!best.w) return null
  return {
    sc: best.sc,
    px: cr.x0 + (best.cx * cr.L) / K,
    py: cr.y0 + (best.cy * cr.L) / K,
    size: best.s * cr.L,
    rot: +(((best.deg + 180) % 360) - 180).toFixed(1),
    vis: visFrac(best.w, cr.tv),
  }
}

/** Does a box of side `size` centred on (px, py) still touch the picture? */
const touchesFrame = (px, py, size) =>
  px + size / 2 > 0 && px - size / 2 < FW && py + size / 2 > 0 && py - size / 2 < FH

// The bars for an entry key, decided here rather than asked about. 0.25 is one
// notch above the 0.22 the forward fit is trusted at, because a cut silhouette
// has fewer cells to be right about and so a noisier score; 0.12 of the body is
// where a centre stops being placeable — below it the visible arc is a few
// dozen cells and the search wanders along the edge for free.
const ENTRY_OK = 0.25
const ENTRY_VIS = 0.12

function stageFit(flights) {
  const out = []
  for (const f of flights) {
    const a = ASSIGN[f.key]
    if (!a) {
      console.log(`fit: no asset for ${f.key} — dropped`)
      continue
    }
    if (only && a.frame !== only) continue
    const sp = sprite(a.asset)
    const fs = []
    for (let t = Math.max(0, f.t0 - 9); t <= Math.min(94, f.t1 + 9); t += 0.5) fs.push(oneFrame(t))
    const pl = medianPlate(fs)
    const ks = []
    for (let i = 0; i < f.pts.length; i += 8) {
      const q = f.pts[i]
      // 2.7x the object, so a rotated silhouette never leaves the crop. The
      // crop may hang off the frame — pad rather than skip, which is what
      // dropped two thirds of every high-hovering flight in an earlier pass.
      const L = Math.round(Math.max(40, q.sq * 2) * 2.7)
      const cr = cropAt(oneFrame(q.t), pl, (q.x / 100) * FW, (q.y / 100) * FH, L)
      const { tg, tm } = cr
      let n = cr.n
      const edge = cr.edge
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
    out.push({ ...a, t0: f.t0, t1: f.t1, slide: f.slide, ks: withEntry(sp, a, ks, pl) })
    console.log(`fit: ${a.id} ${ks.length} keys`)
  }
  return out
}

/**
 * THE FLIGHT'S FIRST FRAMES, MEASURED INSTEAD OF INVENTED.
 *
 * What was here before was one synthesised row, the first measured leg run
 * 0.1 s backwards. Three frames is not an entry: a basketball crossing the
 * picture at 5 px a frame needs 235 px to clear the top edge, which is 47
 * frames, so the row landed well inside the picture and the object switched on
 * two thirds drawn. Twenty four flights of twenty seven began that way.
 *
 * Running the same straight line further back is not the fix either. In the
 * clip the object arrives FAST and brakes, and the first leg the forward fit
 * catches is already the slow end of that; extended, it makes the object drift
 * in at half the clip's speed. The clip HAS these frames — the object is in
 * them, cut by the edge — so the honest answer is to measure them, which needs
 * two things the forward fit does not do: score only the cells inside the
 * picture (`score`'s `tv`), and search for the centre rather than take the
 * clipped blob's own (`solveCut`).
 *
 * Walk backwards a frame at a time from the flight's first confident key,
 * predicting each next centre from the two already solved, until the object is
 * gone. Then one row that carries it clear of the edge along the speed just
 * MEASURED off those frames — not off the settled leg.
 */
function withEntry(sp, a, ks, pl) {
  const conf = ks.filter(k => k.sc >= 0.22)
  if (conf.length < 2) return ks
  const step = 1 / 30
  const crop = s => Math.round(s * 2.6)
  // Radius of the centre search, in grid cells: rather over half the body, so
  // it reaches the centre of an object the frame has left a tenth of, and still
  // well inside the crop's own margin — the template never leaves the crop, and
  // `tv` therefore only ever means "outside the picture".
  // Radius of the centre search, in grid cells. The SEED needs a wide one: its
  // only guess is the tracker's centroid, dragged inward by however much of the
  // body the frame threw away. Every step after it predicts from measured
  // frames and so gets a tight one, and that is not a saving but a correction —
  // at the seed's radius the search slid along the edge and returned the ball
  // wandering 85, 85, 83, 79 across four frames where it travels smoothly.
  const R_SEED = Math.round(0.55 * K * (1 / 2.6)),
    R_WALK = Math.round(0.15 * K * (1 / 2.6))

  // THE SIZE THE ENTRY IS FLOWN AT is the median of the flight's first five
  // confident keys, not the anchor's own. The anchor is itself a frame the edge
  // is cutting, and its size came off the forward fit, which answers about a cut
  // silhouette by shrinking or swelling the template: the basketball's anchor
  // reads 371 where the four settled frames right after it read 328, 328, 328,
  // 329. Flying the entry at 371 would have the ball arrive an eighth too big
  // and shrink as it lands.
  const size = med(conf.slice(0, 5).map(k => k.size))
  const L = crop(size)
  // THE ANGLE IS HELD AT THE FIRST CONFIDENT KEY'S, and is never searched here.
  // Two other things were tried and both are worse, for the same reason: on a
  // silhouette the edge has cut, a WRONG angle scores HIGHER than the right one
  // — it can turn the template until its in-frame sliver matches, wherever that
  // leaves the rest. Searching the circle on the entry's best frame put the
  // basketball at 19 % visible where it is four fifths drawn, and flying the
  // flight's own folded median (which IS the better measurement) cost the walk
  // most of its frames. Note what this angle is being used for: not as a
  // measurement — stageTable replaces every entry angle with the flight's
  // median anyway — but as the template pose that most resembles what the clip
  // shows on THAT frame, which is what makes the search for the centre
  // well posed.
  const degs = [conf[0].rot]
  const expect = sp.n * (size / L) ** 2

  /** Place the body on one frame, given where it is expected. */
  const place = (t, qx, qy, R, degs) => {
    const cr = cropAt(oneFrame(t), pl, qx, qy, L)
    if (cr.n < 20) return { fail: `nothing above the plate near the prediction at ${t.toFixed(2)}` }
    keepCentral(cr.tm)
    let m = 0
    for (let p = 0; p < K * K; p++) if (cr.tm[p] > 0.5) m++
    if (m < Math.max(12, 0.06 * expect))
      return {
        fail: `only ${m} cells of object at ${t.toFixed(2)} against a whole body of ${Math.round(expect)}`,
      }
    // POSITION ONLY. Scale and angle are held, and that is a decision rather
    // than a shortcut: the entry lasts a third of a second, over which the
    // clip's own size column moves a couple of per cent (the ball reads 341,
    // 328, 328, 328, 329 across it), while a scale free to move can buy overlap
    // by GROWING and pushing the surplus out past the edge, where nothing
    // contradicts it. Let free once and it did exactly that — the ball went
    // 341 -> 382 on the frame it was 56 % visible, and the walk lost every
    // frame after it. The angle is held for the reason stageTable already
    // gives: read off a third of a silhouette it is not a measurement.
    const r = solveCut(sp, cr, degs, size / L, R)
    if (!r) return { fail: `no overlap at all at ${t.toFixed(2)}` }
    if (r.sc < ENTRY_OK)
      return { fail: `score ${r.sc.toFixed(2)} under ${ENTRY_OK} at ${t.toFixed(2)}` }
    if (r.vis < ENTRY_VIS)
      return { fail: `${(r.vis * 100) | 0}% of the body left in the picture at ${t.toFixed(2)}` }
    return r
  }

  const row = r => ({
    t: r.t,
    x: +((r.px / FW) * 100).toFixed(2),
    y: +((r.py / FH) * 100).toFixed(2),
    size,
    rot: r.rot,
    sc: +r.sc.toFixed(3),
    clip: r.vis < 0.995,
    vis: +r.vis.toFixed(2),
    entry: true,
  })

  // WHERE THE WALK STARTS is the first frame the body can be PLACED on, which
  // is not the same as the first frame the tracker sees something. On the
  // milkpacks the tracker opens its flight on four per cent of a carton — too
  // little to say where the carton is — and the forward fit answered anyway,
  // with the row that drops a half-drawn carton into the picture. So step
  // forward from the flight's first confident key until a placement holds, and
  // let everything before that seed be replaced by the walk's own rows.
  let seed = null,
    why = ''
  for (let i = 0; i <= 18 && !seed; i++) {
    const t = +(conf[0].t + i * step).toFixed(3)
    // The tracker's centroid is the only guess available here and it is dragged
    // inward by the part the frame threw away, which is what the search radius
    // is sized to cover.
    const g = conf.reduce((b, k) => (Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b), conf[0])
    const r = place(t, (g.x / 100) * FW, (g.y / 100) * FH, R_SEED, degs)
    if (r.fail) why = r.fail
    else seed = { ...r, t }
  }
  if (!seed) {
    console.error(`!! ${a.id}: the entry walk found no frame it could place the body on — ${why}`)
    return ks
  }

  const solved = [row(seed)]
  let px = seed.px,
    py = seed.py,
    vis = seed.vis
  // Seed the backward step with the flight's own next leg. It is the slow end
  // of the entry and so an underestimate, but it is only the search's starting
  // guess: after two solved frames the prediction runs on measured speed.
  const B = conf.find(k => k.t > seed.t + 0.01) ?? conf[conf.length - 1]
  const vx0 = ((B.x / 100) * FW - px) / (B.t - seed.t),
    vy0 = ((B.y / 100) * FH - py) / (B.t - seed.t)
  let vx = vx0,
    vy = vy0

  why = 'the walk ran out of frames'
  for (let i = 1; i <= 40; i++) {
    const t = +(seed.t - i * step).toFixed(3)
    if (t < 0) break
    const r = place(t, px - vx * step, py - vy * step, R_WALK, degs)
    if (r.fail) {
      why = r.fail
      break
    }
    // TWO CONTINUITY RULES, because a cut silhouette gives the search room to
    // wander along the edge and a wandering answer is worse than none.
    // Going BACK through an entry the object can only become less visible, and
    // it cannot jump: coin-2 without these produced a frame that sent the whole
    // entry off sideways, out of the picture on the wrong side.
    if (r.vis > vis + 0.08) {
      why = `going back it got MORE visible at ${t.toFixed(2)} (${(r.vis * 100) | 0}% after ${(vis * 100) | 0}%), which an entry cannot do`
      break
    }
    const jump = Math.hypot(px - r.px, py - r.py)
    if (jump > Math.max(0.35 * size, 3.5 * Math.hypot(vx, vy) * step)) {
      why = `it moved ${Math.round(jump)} px in one frame at ${t.toFixed(2)}, which the flight's own speed does not allow`
      break
    }
    vx = (px - r.px) / step
    vy = (py - r.py) / step
    px = r.px
    py = r.py
    vis = r.vis
    solved.push(row({ ...r, t }))
    if (r.vis < ENTRY_VIS + 0.03) {
      why = `down to ${(r.vis * 100) | 0}% of the body at ${t.toFixed(2)}`
      break
    }
  }

  const last = solved[solved.length - 1]

  // AN ENTRY THE CLIP NEVER SHOWED IS NOT AN ENTRY.
  //
  // If the earliest frame the walk could measure still holds more than half the
  // body, the clip did not show this object crossing anything: either it is
  // switched on with the slide cut, or the measurement lost it. Three flights
  // end up here — soccer-1, spark-1, spark-2 — and all three fail on the same
  // trap: a slide cut repaints the whole picture, so for a few frames after one
  // EVERYTHING stands above the background plate, and a template dropped on that
  // noise scores as well as it does on an object. soccer-1's first key is such a
  // frame; opened at 57.10 and 57.13 the clip's top left corner is empty room,
  // and the ball's first arc does not cross the edge until 57.17.
  //
  // Extrapolating a crossing out of that answer is worse than not trying: the
  // speed available is the flight's settled leg, and carried far enough back to
  // clear the edge it made the football creep in over a second and a third.
  // These flights keep what they had, which is the row stageTable synthesises.
  if (last.vis > 0.5) {
    console.error(
      `!! ${a.id}: the clip never shows it crossing an edge — its earliest measurable frame already holds ${(last.vis * 100) | 0}% of the body, so the entry is left to the old synthesised row`,
    )
    return ks
  }

  // THE ENTRY IS FLOWN DOWN A STRAIGHT LINE, fitted through the measured frames
  // and weighted by how much of the body each of them shows.
  //
  // Not a tidying-up: perpendicular to the edge a cut body's centre is well
  // determined — the visible cap's depth says where it is — but ALONG the edge
  // it is not, and the raw frames wander. basketball-1 measures 91.0, 85.3,
  // 85.2, 83.5, 79.1, 77.7 across x where nothing in the clip moves in steps
  // like that: 40 px of jitter over a quarter of a second, which is a shudder
  // on the way in. Down the same eight frames the object's own speed shows no
  // trend to lose — y steps 1.5, 2.5, 1.5, 0.6, 1.8 per cent, all noise around
  // 1.5 — because the braking happens AFTER the entry, out where the forward
  // fit measures it properly. So a line over this window describes the clip and
  // drops the jitter, and the row that carries the body clear of the edge is
  // the same line extended rather than a separate guess.
  //
  // Under three measured frames there is no line to fit: the rows stand as
  // measured and the flight's own first leg gives the direction out. It is the
  // slow end of the entry, but a body already most of the way out has only its
  // own last sliver left to travel.
  if (solved.length >= 3) {
    const t0 = solved[0].t
    const line = get => {
      let sw = 0,
        st = 0,
        sv = 0
      for (const q of solved) {
        const w = Math.max(q.vis, 0.05)
        sw += w
        st += w * (q.t - t0)
        sv += w * get(q)
      }
      const mt = st / sw,
        mv = sv / sw
      let num = 0,
        den = 0
      for (const q of solved) {
        const w = Math.max(q.vis, 0.05),
          d = q.t - t0 - mt
        num += w * d * (get(q) - mv)
        den += w * d * d
      }
      const b = den ? num / den : 0
      return t => mv + b * (t - t0 - mt)
    }
    const fx = line(q => (q.x / 100) * FW),
      fy = line(q => (q.y / 100) * FH)
    for (const q of solved) {
      q.x = +((fx(q.t) / FW) * 100).toFixed(2)
      q.y = +((fy(q.t) / FH) * 100).toFixed(2)
    }
    vx = (fx(t0 + 1) - fx(t0)) / 1
    vy = (fy(t0 + 1) - fy(t0)) / 1
  } else {
    vx = vx0
    vy = vy0
  }
  px = (last.x / 100) * FW
  py = (last.y / 100) * FH
  let out = null
  for (let k = 1; k <= 45 && !out; k++) {
    const dt = k * step
    const ox = px - vx * dt,
      oy = py - vy * dt
    if (!touchesFrame(ox, oy, size))
      out = {
        t: +(last.t - dt).toFixed(3),
        x: +((ox / FW) * 100).toFixed(2),
        y: +((oy / FH) * 100).toFixed(2),
        size,
        rot: last.rot,
        sc: 1,
        clip: false,
        vis: 0,
        entry: true,
      }
  }
  if (out && last.t - out.t > 0.4)
    console.error(
      `!! ${a.id}: the clear-of-edge row is ${Math.round((last.t - out.t) * 30)} frames beyond the last frame the clip gave a measurement on — that stretch is extrapolation, not measurement`,
    )
  if (!out)
    console.error(
      `!! ${a.id}: the measured entry speed never carries it clear of the edge — left with ${(last.vis * 100) | 0}% of the body in the picture`,
    )
  const head = solved.slice().reverse()
  if (out) head.unshift(out)
  console.error(
    `   ${a.id}: entry ${head.length} rows over ${head[0].t.toFixed(2)}..${seed.t.toFixed(2)}, ` +
      `earliest measured frame shows ${(last.vis * 100) | 0}% of the body` +
      (out ? `, clear of the edge at ${out.t.toFixed(2)}` : '') +
      ` — stopped because ${why}`,
  )
  if (only) for (const q of head) console.error(`      ${JSON.stringify(q)}`)
  // The walk re-answered every frame up to and including the seed, so the
  // forward pass keeps only what comes after it — dropping the keys the fit
  // produced by shrinking or swelling the template onto a cut silhouette.
  return [...head, ...ks.filter(k => k.t > seed.t + 1e-6)]
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

/** The old entry row, kept for the flights the clip never shows crossing. */
function synthEntry(ks, cut) {
  const a = ks[0],
    b = ks[1]
  const t0 = Math.min(a.t - 0.1, cut ?? a.t),
    dt = a.t - t0
  return {
    t: t0,
    x: a.x - ((b.x - a.x) / (b.t - a.t)) * dt,
    y: a.y - ((b.y - a.y) / (b.t - a.t)) * dt,
    size: a.size,
    rot: a.rot,
  }
}

function stageTable(fit, covers) {
  const CUT = Object.fromEntries(CUTS)
  const out = []
  for (const f of fit) {
    // Entry keys carry their own bar (ENTRY_OK, on the cells inside the
    // picture) and are already past it; judging them again by a score computed
    // over the whole template would throw away exactly the frames measured here.
    const good = f.ks.filter(k => k.entry || k.sc >= 0.22)
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

    // Entry: measured in `withEntry`, off the frames where the picture's edge
    // cuts the object, and nothing is synthesised for the twenty four flights
    // that have it. The three the clip never shows crossing keep the row this
    // block has always made — the first measured leg run 0.1 s backwards, no
    // further than the slide's own cut. It is a poor entry, and it is what
    // shipped; what it is NOT is an invention carried over a second, which is
    // where extrapolating a measurement that does not exist ends up.
    const ks2 = ks[0].entry ? ks : [synthEntry(ks, CUT[f.frame]), ...ks]
    const cr = crossing(covers[f.id] ?? [])
    if (!cr) console.error(`!! ${f.id}: no occlusion curve, zFlip left at the flight's end`)
    out.push({
      id: f.id,
      asset: f.asset,
      frame: f.frame,
      zFlip: cr ? cr.zIn : +f.t1.toFixed(2),
      keys: ks2.map(k => [
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
      plate = medianPlate(fs)
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
          "[t seconds, cx % of stage, cy % of stage, sqrt(area) in design px, principal angle deg, elongation, fraction the journal covers] — size and elongation off the tracker's own blob, the angle off a tight mask (colour distance 70) that hugs the lit body; the occlusion fraction comes from the blob too",
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
// `--stage table` prints the rows and skips the reference, whose own plates
// cost as much again as the whole fit. For a trial on one flight that is the
// difference between minutes and an afternoon; a real run leaves it out.
if (stopAfter !== 'table') writeReference(flights, occl, covers)
printTable(stageTable(fit, covers))
