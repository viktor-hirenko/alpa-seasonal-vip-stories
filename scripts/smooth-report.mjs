#!/usr/bin/env node
/**
 * READ A SMOOTH SCAN AND NOMINATE THE SUSPECTS.
 *
 *   node scripts/smooth-report.mjs _refs/smooth/full.json
 *   node scripts/smooth-report.mjs _refs/smooth/full.json --signal rotY --t 11 12
 *   node scripts/smooth-report.mjs _refs/smooth/full.json --dump edge --t 16.9 18.2
 *
 * THE DIFFERENCE IS THE SPEED. A scan holds a value per video frame; the
 * difference between neighbouring frames is what the eye actually sees as
 * motion, in design px (or degrees) per frame. Three things go wrong with it:
 *
 *   STALL — the speed collapses to nothing while the frames around it are
 *           moving. This is what six chained `power2.inOut` segments did to the
 *           entrance, and what the owner called "jerks".
 *   JUMP  — the speed spikes far above its neighbours: a teleport.
 *   KINK  — the speed itself steps (a large SECOND difference) without either
 *           collapsing or spiking. A corner in the motion. This is what happens
 *           where two tweens with different eases meet at a shared value: the
 *           position is continuous, the velocity is not.
 *
 * THE THRESHOLDS ARE MINE AND THEY ARE DELIBERATELY LOOSE. Everything here is a
 * NOMINATION, not a verdict — the run prints candidates and each one still has
 * to be drawn and looked at before it counts as a defect. A tight threshold
 * would hide the thing this session exists to find; a loose one costs a look.
 *
 * Speeds are compared against a LOCAL median over a window, never against a
 * global one: the story's motion spans two orders of magnitude between a slow
 * drift and a page turn, so a single global scale would call every quiet second
 * a stall and every turn a jump.
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--')) || '_refs/smooth/full.json'
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const ti = args.indexOf('--t')
const T0 = ti >= 0 ? Number(args[ti + 1]) : -1e9
const T1 = ti >= 0 ? Number(args[ti + 2]) : 1e9
const ONLY = flag('--signal', null)
const DUMP = flag('--dump', null)
const WIN = Number(flag('--win', 12))

const { rows } = JSON.parse(readFileSync(file, 'utf8'))

/** A signal is a name, a per-row getter, and the speed below which nothing it
 *  does can be seen — set from what the property IS, not from the data. */
const SIGNALS = [
  // The journal's visible silhouette. `edge` is the left edge of the projected
  // quad: the one number session K measured the entrance with.
  { key: 'edge', unit: 'px', floor: 0.8, get: r => (r.vis ? r.x : null) },
  { key: 'width', unit: 'px', floor: 0.8, get: r => (r.vis ? r.w : null) },
  { key: 'cx', unit: 'px', floor: 0.5, get: r => (r.vis && r.cx != null ? (r.cx / 100) * 1080 : null) },
  { key: 'cy', unit: 'px', floor: 0.5, get: r => (r.vis && r.cy != null ? (r.cy / 100) * 1920 : null) },
  { key: 'rotZ', unit: 'deg', floor: 0.05, get: r => (r.vis ? r.rotZ : null) },
  { key: 'rotY', unit: 'deg', floor: 0.05, get: r => (r.vis ? r.rotY : null) },
  { key: 'scale', unit: 'x', floor: 0.0008, get: r => (r.vis ? r.sc : null) },
  { key: 'alpha', unit: 'a', floor: 0.01, get: r => r.op },
  { key: 'outroSc', unit: 'x', floor: 0.01, get: r => r.outro?.sc ?? null },
  { key: 'speedSc', unit: 'x', floor: 0.01, get: r => r.speed?.sc ?? null },
  { key: 'speedOp', unit: 'a', floor: 0.01, get: r => r.speed?.op ?? null },
]

// Every flying object becomes three signals of its own. Their frames are only
// the ones the object is on screen for, so an appearance is a break in the
// series rather than a step from zero — the arrival is judged separately.
const ids = [...new Set(rows.flatMap(r => r.objs.map(o => o.id)))]
for (const id of ids) {
  for (const [prop, unit, floor] of [['cx', 'px', 1], ['cy', 'px', 1], ['w', 'px', 0.6]]) {
    SIGNALS.push({
      key: `${id}.${prop}`, unit, floor, fly: id,
      get: r => r.objs.find(o => o.id === id)?.[prop] ?? null,
    })
  }
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }

function analyse(sig) {
  const v = rows.map(sig.get)
  const t = rows.map(r => r.t)
  // Speed, defined only where BOTH samples exist.
  const d = v.map((x, i) => (i > 0 && x != null && v[i - 1] != null ? x - v[i - 1] : null))
  const events = []
  for (let i = 1; i < d.length; i++) {
    if (d[i] == null) continue
    if (t[i] < T0 || t[i] > T1) continue
    const win = []
    for (let j = Math.max(1, i - WIN); j <= Math.min(d.length - 1, i + WIN); j++) {
      if (j !== i && d[j] != null) win.push(Math.abs(d[j]))
    }
    if (win.length < WIN) continue
    const loc = median(win)
    const a = Math.abs(d[i])
    if (loc >= sig.floor && a <= 0.25 * loc) {
      // A TURN IS NOT A STALL. Where the motion reverses, the speed passes
      // through zero because it must, and calling that a defect would condemn
      // every measured extremum in the tables. So a near-zero speed only counts
      // if the motion on both sides of it goes the SAME way — i.e. the journal
      // was travelling, stopped, and set off again in the direction it came.
      let before = 0, after = 0
      for (let j = Math.max(1, i - WIN); j < i; j++) if (d[j] != null) before += d[j]
      for (let j = i + 1; j <= Math.min(d.length - 1, i + WIN); j++) if (d[j] != null) after += d[j]
      if (before * after > 0) {
        events.push({ kind: 'STALL', t: t[i], i, a, loc, sev: (loc - a) / loc })
      }
    } else if (a >= 4 * loc && a >= sig.floor * 3) {
      events.push({ kind: 'JUMP', t: t[i], i, a, loc, sev: a / Math.max(loc, 1e-9) })
    } else if (d[i - 1] != null) {
      const k = Math.abs(d[i] - d[i - 1])
      if (k >= 1.2 * Math.max(loc, sig.floor) && k >= sig.floor * 2) {
        events.push({ kind: 'KINK', t: t[i], i, a, loc, k, sev: k / Math.max(loc, sig.floor) })
      }
    }
  }
  // One line per RUN of adjacent flags of the same kind: a stall is usually
  // several frames long and printing each is noise.
  const runs = []
  for (const e of events) {
    const last = runs[runs.length - 1]
    if (last && last.kind === e.kind && e.i - last.iEnd <= 3) {
      last.iEnd = e.i; last.tEnd = e.t
      if (e.sev > last.sev) { last.sev = e.sev; last.at = e.t; last.a = e.a; last.loc = e.loc; last.k = e.k }
    } else {
      runs.push({ kind: e.kind, t: e.t, tEnd: e.t, iEnd: e.i, at: e.t, a: e.a, loc: e.loc, k: e.k, sev: e.sev })
    }
  }
  return runs
}

if (DUMP) {
  const sig = SIGNALS.find(s => s.key === DUMP)
  if (!sig) { console.error(`no signal "${DUMP}"; have: ${SIGNALS.map(s => s.key).join(' ')}`); process.exit(1) }
  console.log(`${DUMP}   t        value      speed/frame   accel`)
  let prev = null, prevD = null
  for (const r of rows) {
    if (r.t < T0 || r.t > T1) continue
    const x = sig.get(r)
    const d = x != null && prev != null ? x - prev : null
    const k = d != null && prevD != null ? d - prevD : null
    console.log(
      `      ${r.t.toFixed(3).padStart(7)}  ${x == null ? '   —   ' : x.toFixed(3).padStart(10)}` +
      `  ${d == null ? '' : d.toFixed(3).padStart(11)}  ${k == null ? '' : k.toFixed(3).padStart(9)}`,
    )
    prev = x; prevD = d
  }
  process.exit(0)
}

const wanted = ONLY ? SIGNALS.filter(s => s.key === ONLY || s.key.endsWith('.' + ONLY)) : SIGNALS
let total = 0
for (const sig of wanted) {
  const runs = analyse(sig).sort((a, b) => b.sev - a.sev)
  if (!runs.length) continue
  total += runs.length
  console.log(`\n=== ${sig.key} (${sig.unit}/frame, floor ${sig.floor})`)
  for (const r of runs.slice(0, 12)) {
    const span = r.t === r.tEnd ? `${r.t.toFixed(3)}` : `${r.t.toFixed(3)}..${r.tEnd.toFixed(3)}`
    const detail = r.kind === 'KINK'
      ? `speed steps ${r.k.toFixed(3)} where it runs ${r.loc.toFixed(3)}`
      : `${r.a.toFixed(3)} against a local ${r.loc.toFixed(3)}`
    console.log(`  ${r.kind.padEnd(5)} ${span.padEnd(18)} ${detail}   x${r.sev.toFixed(1)}`)
  }
  if (runs.length > 12) console.log(`  ... and ${runs.length - 12} more`)
}
console.log(`\n${total} candidate runs. Every one still has to be drawn and looked at.`)
