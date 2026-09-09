#!/usr/bin/env node
/**
 * THE SMOOTHNESS SCAN — look for stalls and jumps BETWEEN the seconds the
 * other gates sample.
 *
 *   node scripts/smooth-scan.mjs                  # whole story, one video frame per step
 *   node scripts/smooth-scan.mjs --t 8 24         # a window of seconds
 *   node scripts/smooth-scan.mjs --tempo          # frame pacing on a live playback
 *
 * WHY THIS EXISTS. Every existing gate parks the story at a handful of seconds
 * and asks "is the pose right there". A stall lives BETWEEN those seconds: the
 * pose is right on both sides of it and the motion between them stops dead. The
 * owner saw exactly that on the entrance ("the journal enters in jerks") half a
 * day before any gate could have, and when session K finally looked frame by
 * frame there were six full stops in 2 seconds — `swingOpen` was six chained
 * `.to()`s carrying `power2.inOut`, an ease whose speed is zero at BOTH ends of
 * every segment.
 *
 * WHAT IT MEASURES. The story is seeked one video frame at a time and the pose
 * is read out of the live DOM — the same numbers the compositor draws from, not
 * a table's opinion of them. What matters is not the value but the DIFFERENCE
 * between neighbouring frames: that difference IS the on-screen speed, in
 * design px per frame. A stall is a near-zero difference sitting inside a run
 * of large ones; a jump is a difference several times its neighbours.
 *
 * NO SCREENSHOTS. Session K shot 138 png frames to see this on the entrance,
 * which is fine for 2 seconds and hopeless for 94. Seeking a paused timeline is
 * deterministic and costs nothing, so the whole story fits in one pass — and it
 * separates the two diseases that a screenshot run mixes together: motion the
 * animation computed wrong, and motion the browser failed to paint in time.
 * The second one is `--tempo`, on a real playback, and it is a different run.
 *
 * WHAT IT CANNOT SEE. Anything that is not a number on an element: art, colour,
 * the page content cut. And it does not judge — it reports the candidates, and
 * a candidate is only a defect once it has been drawn and looked at.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9341
const PROFILE = '/tmp/smooth-profile'
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const FPS = 30

const args = process.argv.slice(2)
const has = n => args.includes(n)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const ti = args.indexOf('--t')
const T0 = ti >= 0 ? Number(args[ti + 1]) : 0
const T1 = ti >= 0 ? Number(args[ti + 2]) : 94.3667
const STEP = Number(flag('--step', 1)) / FPS
const TEMPO = has('--tempo')
const OUT = flag('--out', null)

const sleep = ms => new Promise(r => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--window-size=420,747',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch {} }
process.on('exit', cleanup)

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome devtools endpoint never came up')
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data)
      const p = this.pending.get(m.id)
      if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej }))
  }
  async eval(expr, timeout = 120000) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, timeout,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    }
    return r.result.value
  }
}

/**
 * Installed once, called per chunk. The loop runs IN THE PAGE: a round trip per
 * frame would be 2800 round trips, and the numbers would be the same.
 *
 * The journal's visible edge is `.journal-box`, not `.journal-pos` — the
 * positioner carries only cx/cy and its own rect is the whole stage. Session K
 * measured the wrong element first; this is that lesson, written down.
 */
const INSTALL = `(() => {
  const s = window.__story
  const stage = document.querySelector('.stage')
  const s3d = document.querySelector('.stage-3d')
  const box = document.querySelector('.journal-box')
  const pos = document.querySelector('.journal-pos')
  const outro = document.querySelector('.story-outro')
  const speed = document.querySelector('.stage__speed')
  const g = s.gsap
  const num = (el, p) => { if (!el) return null; const v = Number(g.getProperty(el, p)); return Number.isFinite(v) ? v : null }
  window.__scan = times => {
    const rows = []
    for (const t of times) {
      s.tl.seek(t, false)
      // The page cut AND the face size are read off the clock, not scheduled on
      // the timeline (ADR-0008, and V-58 for the face), so a raw seek leaves
      // both showing whatever the previous sample left. Every parking routine
      // in scripts/ calls this for the same reason.
      s.applySegment?.(t)
      const sr = s3d.getBoundingClientRect()
      const cs = getComputedStyle(stage)
      const jwv = parseFloat(cs.getPropertyValue('--jw'))
      const u = box.offsetWidth / jwv
      const br = box.getBoundingClientRect()
      const pcs = getComputedStyle(pos)
      const row = {
        t,
        // The projected quad's bounding box, design px, measured from the canvas.
        x: (br.left - sr.left) / u, y: (br.top - sr.top) / u,
        w: br.width / u, h: br.height / u,
        rotY: num(box, 'rotationY'), rotZ: num(box, 'rotationZ'), sc: num(box, 'scaleX'),
        cx: num(pos, 'xPercent'), cy: num(pos, 'yPercent'),
        op: Number(pcs.opacity), vis: pcs.visibility === 'visible',
        jw: jwv,
        objs: [],
      }
      if (outro) {
        const ocs = getComputedStyle(outro)
        const orr = outro.getBoundingClientRect()
        row.outro = { sc: num(outro, 'scaleX'), op: Number(ocs.opacity),
                      vis: ocs.visibility === 'visible' && ocs.display !== 'none',
                      w: orr.width / u, h: orr.height / u }
      }
      if (speed) {
        const scs = getComputedStyle(speed)
        row.speed = { sc: num(speed, 'scaleX'), op: Number(scs.opacity),
                      vis: scs.visibility === 'visible' && scs.display !== 'none' }
      }
      for (const el of document.querySelectorAll('.fly-obj[data-fly]')) {
        const ecs = getComputedStyle(el)
        if (ecs.visibility === 'hidden' || ecs.display === 'none') continue
        const ob = el.querySelector('.fly-obj__box')
        if (!ob) continue
        const r = ob.getBoundingClientRect()
        row.objs.push({ id: el.dataset.fly,
          cx: (r.left - sr.left + r.width / 2) / u,
          cy: (r.top - sr.top + r.height / 2) / u,
          w: r.width / u, h: r.height / u, op: Number(getComputedStyle(ob).opacity) })
      }
      rows.push(row)
    }
    return rows
  }
  return true
})()`

const READY = `(async () => {
  for (let i = 0; i < 240; i++) {
    const s = window.__story
    if (s && s.tl && s.video && s.tl.duration() > 10) return { ok: true, dur: s.tl.duration() }
    await new Promise(r => setTimeout(r, 250))
  }
  return { ok: false }
})()`

/** Pause both clocks. With the video paused the rAF sync loop returns early and
 *  leaves the timeline alone, so seeking it is safe and repeatable. */
const PARK = `(async () => {
  const s = window.__story, v = s.video
  s.seek(0)
  await new Promise(r => setTimeout(r, 600))
  v.pause(); s.tl.pause()
  return { paused: v.paused, t: s.tl.time() }
})()`

/**
 * Frame pacing on a REAL playback: how long the browser actually took between
 * paints. Session K's run was 5574 frames, median 16.7 ms, ten frames over
 * 25 ms and all ten in the outro.
 */
const TEMPO_RUN = `(async () => {
  const s = window.__story, v = s.video
  s.seek(0)
  await new Promise(r => setTimeout(r, 800))
  const gaps = []
  let last = performance.now(), stop = false
  const loop = now => { gaps.push([s.tl.time(), now - last]); last = now; if (!stop) requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  v.play()
  await new Promise(r => {
    const iv = setInterval(() => { if (s.tl.time() > 94.2 || v.ended) { clearInterval(iv); r() } }, 250)
    setTimeout(() => { clearInterval(iv); r() }, 105000)
  })
  stop = true
  return gaps
})()`

const wsUrl = await findTarget()
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: Number(process.env.PROBE_VIEWPORT?.split('x')[0] || 420),
  height: Number(process.env.PROBE_VIEWPORT?.split('x')[1] || 747),
  deviceScaleFactor: 1, mobile: true,
})
await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html` })

const ready = await cdp.eval(READY)
if (!ready?.ok) { console.error('the story never came up'); process.exit(1) }

mkdirSync(new URL('../_refs/smooth/', import.meta.url), { recursive: true })

if (TEMPO) {
  const gaps = await cdp.eval(TEMPO_RUN, 130000)
  const ms = gaps.map(g => g[1]).slice(1)
  const sorted = [...ms].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  const long = gaps.slice(1).filter(g => g[1] > 25)
  console.log(`frames ${ms.length}  median ${med.toFixed(1)} ms  p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} ms  max ${sorted[sorted.length - 1].toFixed(1)} ms`)
  console.log(`longer than 25 ms: ${long.length}`)
  for (const [t, g] of long) console.log(`   t=${t.toFixed(2)}  ${g.toFixed(1)} ms`)
  const path = new URL('../_refs/smooth/tempo.json', import.meta.url)
  writeFileSync(path, JSON.stringify({ gaps }, null, 0))
  console.log(`\nwrote ${path.pathname}`)
  process.exit(0)
}

await cdp.eval(PARK)
await cdp.eval(INSTALL)

const times = []
for (let t = T0; t <= T1 + 1e-9; t += STEP) times.push(Math.round(t * 1e4) / 1e4)

const rows = []
const CHUNK = 150
for (let i = 0; i < times.length; i += CHUNK) {
  const part = await cdp.eval(`window.__scan(${JSON.stringify(times.slice(i, i + CHUNK))})`)
  rows.push(...part)
  process.stderr.write(`\r  ${rows.length}/${times.length} frames`)
}
process.stderr.write('\n')

const out = OUT || new URL(`../_refs/smooth/scan-${T0}-${T1}.json`, import.meta.url).pathname
writeFileSync(out, JSON.stringify({ t0: T0, t1: T1, step: STEP, fps: FPS, rows }, null, 0))
console.log(`wrote ${out}  (${rows.length} frames)`)
process.exit(0)
