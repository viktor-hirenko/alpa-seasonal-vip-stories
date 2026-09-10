#!/usr/bin/env node
/**
 * APPLY WHAT THE PICTURE SAID, to the flight table.
 *
 *   node scripts/fly-apply.mjs                 print the corrected table
 *   node scripts/fly-apply.mjs --report        just say what would change
 *
 * `fly-fit.mjs` answers, per frame, by how much OUR object has to move, grow and
 * turn to land on the clip's. This turns those answers into a table: it reads
 * the current one, walks its keys, and applies the correction measured at each
 * key's own time.
 *
 * ONLY CONFIDENT FRAMES COUNT. A registration that failed returns a plausible
 * number rather than an error - the lesson written across this project's
 * registry - so frames whose score is under the bar, or whose runner-up is
 * nearly as good, are dropped and their correction comes from the neighbours
 * that passed. A flight with too few confident frames is left ALONE and said so:
 * a table that quietly moved on noise is worse than one that did not move.
 *
 * The correction itself is smoothed over time before it is applied, for the same
 * reason the size column is: one frame's answer is one frame's answer, and the
 * thing being corrected - where the object IS - does not jump.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const CACHE = `${ROOT}.fly-cache`
const argv = process.argv.slice(2)
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1] }
const MIN_V = Number(process.env.APPLY_MIN_V || 0.10)
const MIN_MARGIN = Number(process.env.APPLY_MIN_MARGIN || 1.15)
const MIN_FRAMES = Number(process.env.APPLY_MIN_FRAMES || 5)
const SMOOTH_SEC = Number(process.env.APPLY_SMOOTH || 0.5)
const SW = 420, SH = 747

const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1]

const f = flag('--in') || `${CACHE}/fly-fit.json`
if (!existsSync(f)) { console.error(`no ${f} - run scripts/fly-fit.mjs --all first`); process.exit(1) }
const rows = JSON.parse(readFileSync(f, 'utf8'))

const by = {}
for (const r of rows) (by[r.id] = by[r.id] || []).push(r)

const src = readFileSync(`${ROOT}src/story/flyObjects.js`, 'utf8')
const A = src.indexOf('\nconst RAW = [')
const END = src.indexOf('\n]', A)
const block = src.slice(A, END)

/** The correction at time t, smoothed, from the confident frames of one flight. */
/**
 * A CORRECTION HAS TO BE PLAUSIBLE BEFORE IT IS BELIEVED.
 *
 * A registration that misses returns a confident-looking answer rather than an
 * error - pen-1 came back asking for a 186 px shift, planet-1 for 333/384, and
 * neither can be true: an object that far off would not be recognisable as the
 * same object. So a frame whose answer is outside what a real disagreement can
 * be is dropped as a miss, not applied as a measurement. The bounds are
 * deliberately wide - four times the worst plausible error - so they throw away
 * only nonsense.
 */
const SANE = r =>
  Math.abs(r.dx) <= 40 && Math.abs(r.dy) <= 40 &&
  r.s >= 0.80 && r.s <= 1.45 && Math.abs(r.rot) <= 20

function corrector(list) {
  const good = list.filter(r =>
    r.v >= MIN_V && (r.rival <= 0 || r.v / Math.max(r.rival, 1e-6) >= MIN_MARGIN) && SANE(r))
  if (good.length < MIN_FRAMES) return null
  return t => {
    let sw = 0, sx = 0, sy = 0, ss = 0, sr = 0
    for (const r of good) {
      const d = Math.abs(r.t - t)
      if (d > SMOOTH_SEC) continue
      const w = 1 - d / SMOOTH_SEC
      sw += w; sx += w * r.dx; sy += w * r.dy; ss += w * r.s; sr += w * r.rot
    }
    if (!sw) {
      // outside every window: hold the nearest confident answer rather than
      // inventing one - the object is usually leaving the picture there
      let n = good[0]
      for (const r of good) if (Math.abs(r.t - t) < Math.abs(n.t - t)) n = r
      return { dx: n.dx, dy: n.dy, s: n.s, rot: n.rot }
    }
    return { dx: sx / sw, dy: sy / sw, s: ss / sw, rot: sr / sw }
  }
}

const report = []
let out = block.replace(
  /\{ id: '([^']+)', asset: '([^']+)', frame: (\d+), zFlip: ([\d.]+), keys: \[([\s\S]*?)\n  \] \},/g,
  (whole, id, asset, frame, zFlip, body) => {
    const list = by[id]
    const corr = list ? corrector(list) : null
    if (!corr) { report.push({ id, n: list ? list.length : 0, skipped: true }); return whole }
    let moved = 0, grew = []
    const keys = body.replace(/\[\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\]/g,
      (k, t, x, y, size, rot) => {
        const c = corr(Number(t))
        const nx = Number(x) + (c.dx / SW) * 100
        const ny = Number(y) + (c.dy / SH) * 100
        const ns = Math.round(Number(size) * c.s)
        const nr = Number(rot) + c.rot
        moved++; grew.push(c.s)
        return `[${Number(t).toFixed(2).padStart(6)}, ${nx.toFixed(1).padStart(6)}, ${ny.toFixed(1).padStart(6)}, ${String(ns).padStart(4)}, ${nr.toFixed(1).padStart(6)}]`
      })
    report.push({ id, n: list.length, keys: moved, s: med(grew) })
    return `{ id: '${id}', asset: '${asset}', frame: ${frame}, zFlip: ${zFlip}, keys: [${keys}\n  ] },`
  })

console.error('flight          fitted frames   keys moved   median scale applied')
for (const r of report) {
  if (r.skipped) { console.error(r.id.padEnd(15), String(r.n).padStart(8), '   too few confident frames - LEFT ALONE'); continue }
  console.error(r.id.padEnd(15), String(r.n).padStart(8), String(r.keys).padStart(13), ('x' + r.s.toFixed(3)).padStart(20))
}
if (!argv.includes('--report')) process.stdout.write(out.replace(/^\nconst RAW = \[\n/, '') + '\n')
