#!/usr/bin/env node
/**
 * HOW FAST DOES THE CLIP TURN ITS PAGE — ON ALL SEVENTEEN TURNS, NOT ONE.
 *
 *   node scripts/flip-scan.mjs              every cut
 *   node scripts/flip-scan.mjs --slide 12   one cut
 *   node scripts/flip-scan.mjs --step 0.0333
 *
 * WHY THIS EXISTS. TIMING.flip carries ONE measured turn (the cut at 22.07,
 * plus edge-on offsets at four more) and the whole story plays those two
 * numbers on all seventeen. Nothing in the project has ever asked whether the
 * clip turns every page the same way, or whether our single curve fits the
 * other sixteen. The owner watched it and said the turns look different from
 * each other and abrupt against the clip; that is a question about seventeen
 * curves and there was no instrument that produced even two.
 *
 * THE METHOD IS THE ONE TIMING.flip ALREADY RECORDS, so this is a second run of
 * a proven measurement rather than a new idea. `preview.mp4` minus
 * `clean bg.mp4` leaves the journal and the flying objects and nothing else —
 * the two clips differ nowhere else. Of the connected components of that
 * difference, take the TALLEST: the journal stands ~1800 design px, a star
 * ~250. Its width divided by its width lying flat is |cos(yaw)|.
 *
 * ⚠️ WIDTH IS NOT SIGNED AND DOES NOT NEED TO BE. The question here is the
 * CLOCK of the turn — when it leaves flat, when it is edge-on, when it is flat
 * again — and |cos| answers all three. Which side the page comes back on is
 * settled by the keystone (see yawTurn) and is not re-litigated here.
 *
 * ⚠️ AND IT IS READ AT FULL 1080x1920. At edge-on the journal is a ribbon ~70
 * design px wide; a half-size read would quantise the very frames the edge-on
 * instant is interpolated from.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const PREVIEW = `${ROOT}_refs/DP-15152 - preview.mp4`
const CLEAN = `${ROOT}_refs/DP-15152 - clean bg.mp4`
const OUT = `${ROOT}_refs/flip`
const W = 1080
const H = 1920

/** Turn starts, from src/story/slides.js. A turn runs from here for ~0.9 s. */
const CUTS = [
  [8, 11.07], [9, 17.1], [10, 22.07], [11, 26.07], [12, 30.1], [13, 34.07],
  [14, 39.07], [15, 44.03], [16, 49.1], [17, 53.27], [18, 57.07], [19, 61.1],
  [20, 67.07], [21, 73.07], [22, 78.07], [23, 83.03],
] // prettier-ignore

const argv = process.argv.slice(2)
const val = n => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null)
const STEP = Number(val('--step') || 1 / 30)
const THRESH = Number(val('--thresh') || 24)
/**
 * ⚠️ 0.7 IS CALIBRATED, NOT CHOSEN. At this density the flat width on the cut
 * at 17.10 reads 871 px — the exact number TIMING.flip records from the hand
 * measurement — and the whole curve follows the hand table's shape within about
 * a frame. At 0.25 the light spilling down the room's pillars joins the page and
 * flat reads 1064; at 0.85 the page's own dark interior starts to drop out and
 * flat collapses to 518.
 */
const DENSE = Number(val('--dense') || 0.7)
/** Before the turn and after it: enough flat frames on both sides for w0. */
const LEAD = 0.3
const TAIL = 1.1

const ff = args =>
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', ...args], {
    maxBuffer: 1 << 30,
    encoding: 'buffer',
  })

const rgbOfVideo = (file, t) =>
  ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']) // prettier-ignore

/**
 * The journal's on-screen width on one frame, or null if the difference holds
 * nothing tall enough to be a journal.
 *
 * Two-pass connected components with a union-find, 8-connected. Returns the
 * TALLEST component's bounding box, not the largest: a bloom spill can out-area
 * the page, but nothing else in the frame is as tall as it.
 */
function journalWidth(a, b) {
  const n = W * H
  const mask = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const d = Math.max(
      Math.abs(a[p] - b[p]),
      Math.abs(a[p + 1] - b[p + 1]),
      Math.abs(a[p + 2] - b[p + 2]),
    )
    if (d > THRESH) mask[i] = 1
  }
  const label = new Int32Array(n)
  const parent = [0]
  const find = x => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]]
    return x
  }
  const union = (x, y) => {
    x = find(x)
    y = find(y) // prettier-ignore
    if (x !== y) parent[y] = x
  }
  let next = 1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!mask[i]) continue
      let best = 0
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx >= 0) continue
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || xx < 0 || xx >= W) continue
          const l = label[yy * W + xx]
          if (!l) continue
          if (!best) best = l
          else union(best, l)
        }
      }
      if (!best) {
        best = next++
        parent[best] = best
      }
      label[i] = best
    }
  }
  const box = new Map()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = label[y * W + x]
      if (!l) continue
      const r = find(l)
      let o = box.get(r)
      if (!o) box.set(r, (o = { x0: x, x1: x, y0: y, y1: y, n: 0 }))
      if (x < o.x0) o.x0 = x
      if (x > o.x1) o.x1 = x
      if (y < o.y0) o.y0 = y
      if (y > o.y1) o.y1 = y
      o.n++
    }
  }
  let best = null
  for (const o of box.values()) {
    if (o.n < 400) continue
    const h = o.y1 - o.y0 + 1
    if (!best || h > best.y1 - best.y0 + 1) best = o
  }
  if (!best) return null
  const root = find([...box.entries()].find(([, o]) => o === best)[0])
  // ⚠️ THE BOUNDING BOX IS THE WRONG WIDTH, AND THE FIRST RUN PROVED IT: it
  // read 1080 px flat — the whole canvas — where the hand measurement in
  // TIMING.flip reads 871. The journal's own light spills down the room's
  // pillars, the spill is connected to the page, and one lit pixel at the frame
  // edge is as good as a thousand to a bounding box. Raising the threshold does
  // not help: at 100 the spill is still there and the page's dark interior has
  // started to go.
  //
  // A COLUMN IS PAGE ONLY IF IT IS DENSE. The page stands ~1800 px tall, so its
  // columns are full; a spill column holds a handful of pixels. Count the mask
  // per column inside the component and keep the columns carrying at least a
  // quarter of its height. That is what survives edge-on too, where the ribbon
  // is thin but still full height.
  const h = best.y1 - best.y0 + 1
  const col = new Int32Array(W)
  for (let y = best.y0; y <= best.y1; y++) {
    for (let x = best.x0; x <= best.x1; x++) {
      const l = label[y * W + x]
      if (l && find(l) === root) col[x]++
    }
  }
  const need = Math.max(8, h * DENSE)
  let x0 = -1
  let x1 = -1
  for (let x = 0; x < W; x++) {
    if (col[x] < need) continue
    if (x0 < 0) x0 = x
    x1 = x
  }
  if (x0 < 0) return null
  return { w: x1 - x0 + 1, h, box: { ...best, x0, x1 } }
}

/** Sub-frame instant of the width minimum, from the parabola through it. */
function vertex(rows) {
  let k = 0
  for (let i = 1; i < rows.length; i++) if (rows[i].w < rows[k].w) k = i
  if (k === 0 || k === rows.length - 1) return { t: rows[k].t, w: rows[k].w }
  const [l, m, r] = [rows[k - 1], rows[k], rows[k + 1]]
  const d = l.w - 2 * m.w + r.w
  const off = d === 0 ? 0 : (0.5 * (l.w - r.w)) / d
  return { t: +(m.t + off * (r.t - m.t)).toFixed(4), w: m.w, i: k }
}

/** When the width first climbs back through `frac` of flat, after edge-on. */
function backTo(rows, i0, w0, frac) {
  const want = w0 * frac
  for (let i = i0; i < rows.length; i++) {
    if (rows[i].w < want) continue
    const p = rows[i - 1]
    if (!p || p.w >= want) return rows[i].t
    const f = (want - p.w) / (rows[i].w - p.w)
    return +(p.t + f * (rows[i].t - p.t)).toFixed(4)
  }
  return null
}

mkdirSync(OUT, { recursive: true })
const only = val('--slide') ? Number(val('--slide')) : null
const list = only ? CUTS.filter(c => c[0] === only) : CUTS
const report = []

for (const [frame, at] of list) {
  const rows = []
  for (let t = +(at - LEAD).toFixed(4); t <= at + TAIL + 1e-9; t = +(t + STEP).toFixed(4)) {
    const r = journalWidth(rgbOfVideo(PREVIEW, t), rgbOfVideo(CLEAN, t))
    rows.push({ t, w: r ? r.w : 0, h: r ? r.h : 0 })
  }
  // ⚠️ TWO FLAT WIDTHS, NOT ONE — the first run found this the hard way. The
  // page that comes back is NOT the page that left: it settles at its own yaw
  // and its own size, so frames 14 and 15 never climbed back through 90 % of
  // the width they had BEFORE the turn and reported no back-leg at all. The
  // out-leg is judged against the width going in, the back-leg against the
  // width coming out. That is also the honest definition of "the turn is over":
  // the page has reached the pose it will hold, not some earlier page's pose.
  const med = a => {
    const v = a.map(r => r.w).sort((x, y) => x - y)
    return v[Math.floor(v.length / 2)] || 1
  }
  const nPre = Math.max(2, Math.round(LEAD / STEP) - 1)
  const w0 = med(rows.slice(0, nPre))
  const v = vertex(rows)
  const i0 = v.i ?? 0
  const w1 = med(rows.slice(Math.max(i0 + 1, rows.length - nPre)))
  const leaves = (() => {
    // When the width first falls through 90 % of flat, going into the turn.
    for (let i = 1; i <= i0; i++) {
      if (rows[i].w >= w0 * 0.9) continue
      const p = rows[i - 1]
      const f = (w0 * 0.9 - p.w) / (rows[i].w - p.w)
      return +(p.t + f * (rows[i].t - p.t)).toFixed(4)
    }
    return null
  })()
  const rec = {
    frame,
    at,
    w0,
    edgeOn: v.t,
    edgeOnW: v.w,
    leaves,
    out: leaves == null ? null : +(v.t - leaves).toFixed(4),
    w1,
    back90: backTo(rows, i0, w1, 0.9),
    t75: backTo(rows, i0, w1, 0.25),
    t50: backTo(rows, i0, w1, 0.5),
    t25: backTo(rows, i0, w1, 0.75),
    t10: backTo(rows, i0, w1, 0.9),
    rows,
  }
  rec.back = rec.back90 == null ? null : +(rec.back90 - v.t).toFixed(4)
  rec.total = rec.out == null || rec.back == null ? null : +(rec.out + rec.back).toFixed(4)
  report.push(rec)
  console.log(
    `frame ${String(frame).padStart(2)}  at ${at.toFixed(2)}  flat ${String(w0).padStart(4)}/${String(w1).padStart(4)} px  ` +
      `edge-on ${rec.edgeOn.toFixed(3)} (${String(rec.edgeOnW).padStart(3)} px)  ` +
      `out ${rec.out == null ? '  -  ' : rec.out.toFixed(3)}  ` +
      `back ${rec.back == null ? '  -  ' : rec.back.toFixed(3)}  ` +
      `total ${rec.total == null ? '  -  ' : rec.total.toFixed(3)}`,
  )
}

writeFileSync(`${OUT}/flip-scan.json`, JSON.stringify(report, null, 2))
console.log(`\n-> ${OUT}/flip-scan.json`)

if (report.length > 1) {
  const f = k => report.map(r => r[k]).filter(v => v != null)
  const stat = (k, lbl) => {
    const v = f(k)
    if (!v.length) return
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    console.log(
      `${lbl.padEnd(22)} мин ${Math.min(...v).toFixed(3)}  сред ${mean.toFixed(3)}  ` +
        `макс ${Math.max(...v).toFixed(3)}  разброс ${(Math.max(...v) - Math.min(...v)).toFixed(3)} с`,
    )
  }
  console.log('\nКЛИП, разброс по всем переворотам:')
  stat('out', 'уход до ребра')
  stat('back', 'возврат от ребра')
  stat('total', 'весь переворот')
  console.log('\nНАШЕ, из TIMING.flip:  уход 0.140  возврат 0.600  весь 0.740')
}
