#!/usr/bin/env node
/**
 * Measure the live 3D scene numerically instead of eyeballing screenshots.
 *
 * Drives headless Chrome over the DevTools Protocol using Node's built-in
 * WebSocket (Node >= 22), so there are no dependencies to install.
 *
 *   node scripts/probe.mjs "lab.html?frame=11"            # one pose
 *   node scripts/probe.mjs --all                          # every slide
 *   node scripts/probe.mjs --fly                          # every flight
 *   FLY_ONLY=pen-1 node scripts/probe.mjs --fly           # ...just one
 *   node scripts/probe.mjs --occlusion pen-1              # walk one flight
 *   node scripts/probe.mjs --occlusion planet-1 --step 0.4  # ...on the ref grid
 *
 * For each slide it reports the journal's on-screen bounding box in DESIGN px
 * and the delta against the box predicted from slides.js, which is what turns
 * "looks a bit off" into "cy is 4.2 design px low".
 *
 * `--fly` checks the flying objects on FIVE counts, against
 * scripts/fly-reference.json. Per flight and per sampled second that file holds
 * the object's centre and the fraction of it the journal covers, both measured
 * straight off the two reference clips, plus the silhouette size, angle and
 * elongation the sprite should present. It renders the same instant, isolates
 * the object in a screenshot, and measures OUR pixels with image moments —
 * centre, sqrt(area), principal axis, elongation — plus a pixel test of which
 * side of the page it came out on.
 *
 * WHY FIVE AND NOT ONE. The version this replaces compared the object's centre
 * against the projection of its own table entry — and agreed to 1.6 design px
 * on work that was rejected on sight. It could not have caught any of it: the
 * width it printed was the BOX's width, which is `size * k` by construction, so
 * that column was arithmetic rather than measurement, and nothing looked at
 * angle, at aspect ratio, or at whether the object went behind the journal.
 * Every one of those four was wrong at once.
 *
 * WHAT IT DOES NOT PROVE. Size and angle in fly-reference.json come from the
 * correlation fit in scripts/fly-measure.mjs, so this gate checks the whole
 * chain FROM that fit to the pixels — sprite choice, the perspective
 * compensation in _fly.scss, `--fo-base` and the scale tween, the glow not
 * inflating the object, a 3D rotation not creeping back in (that is what the
 * aspect column is for), and the depth sort. It does not re-derive the fit
 * itself; that is checked by the fit's own correlation scores and by looking at
 * the lab over the clip, where a correct flight reads as one object and an
 * error as two (`lab.html?bg=clean&journal=1&t=<second>`).
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'

const args = process.argv.slice(2)
const all = args.includes('--all')
const flyMode = args.includes('--fly')
// --occlusion <flight id>: walk one flight and report, frame by frame, whether
// the browser put the object or the journal on top where they overlap. This is
// the ADR-0006 claim under test — no z-index anywhere, no `layer` field set,
// depth sorting alone — and the interesting answer is a flight that changes its
// mind mid-way and changes it back.
const occId = (() => {
  const i = args.indexOf('--occlusion')
  return i >= 0 ? args[i + 1] : null
})()
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const shotPath = flag('--shot', null)
// Real milliseconds, not Chrome's --virtual-time-budget: virtual time
// fast-forwards timers but does NOT advance media decoding, so a page gated on
// a video buffer never gets past its preloader under virtual time.
const waitMs = Number(flag('--wait', 1400))
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shot' && args[i - 1] !== '--wait') || 'lab.html?frame=11'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=420,747',
  '--user-data-dir=/tmp/probe-profile',
  'about:blank',
], { stdio: 'ignore' })

const cleanup = () => { try { chrome.kill() } catch {} }
process.on('exit', cleanup)

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome devtools endpoint never came up')
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data)
      const p = this.pending.get(msg.id)
      if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result) }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }
}

/** Runs in the page. Returns the journal AABB in design px plus the raw inputs. */
const MEASURE = `(() => {
  const stage = document.querySelector('.stage')
  const box = document.querySelector('.journal-box')
  if (!stage || !box) return { error: 'no stage/box' }
  const sr = stage.getBoundingClientRect()
  const br = box.getBoundingClientRect()
  const cs = getComputedStyle(stage)
  const jw = parseFloat(cs.getPropertyValue('--jw'))
  const jh = parseFloat(cs.getPropertyValue('--jh'))
  // getComputedStyle on an unregistered custom property returns the DECLARED
  // token ("min(100cqw / 1080, ...)"), not a resolved length — so derive the
  // design-pixel unit from a known layout size instead. offsetWidth is the
  // pre-transform layout width, which is exactly --jw * --u.
  const u = box.offsetWidth / jw
  const toDesign = v => v / u
  return {
    u,
    stage: { w: sr.width, h: sr.height },
    // AABB of the transformed box, relative to the stage, in design px
    aabb: {
      x: toDesign(br.left - sr.left),
      y: toDesign(br.top - sr.top),
      w: toDesign(br.width),
      h: toDesign(br.height),
      cx: toDesign(br.left - sr.left + br.width / 2),
      cy: toDesign(br.top - sr.top + br.height / 2),
    },
    jw,
    jh,
    persp: parseFloat(cs.getPropertyValue('--persp')),
    matrix: getComputedStyle(box).transform,
  }
})()`

/**
 * Runs in the page. AABB of every LIVE flying object, in design px, plus which
 * of it and the journal the browser painted on top at their overlap — read from
 * the actual pixels rather than from any z bookkeeping, because the whole claim
 * of ADR-0006 is that there is no bookkeeping to read.
 */
const MEASURE_FLY = `(() => {
  const stage = document.querySelector('.stage')
  const jbox = document.querySelector('.journal-box')
  if (!stage) return { error: 'no stage' }
  const sr = stage.getBoundingClientRect()
  const jw = parseFloat(getComputedStyle(stage).getPropertyValue('--jw'))
  const u = jbox.offsetWidth / jw
  const jr = jbox.getBoundingClientRect()
  const objs = []
  for (const el of document.querySelectorAll('.fly-obj[data-fly]')) {
    if (getComputedStyle(el).visibility === 'hidden') continue
    const box = el.querySelector('.fly-obj__box')
    const r = box.getBoundingClientRect()
    // Centre of the overlap between the object and the journal, if any: the one
    // point where "which is in front" is a question the compositor answers.
    const ox = Math.max(r.left, jr.left), oy = Math.max(r.top, jr.top)
    const ex = Math.min(r.right, jr.right), ey = Math.min(r.bottom, jr.bottom)
    let over = null
    if (ex > ox && ey > oy) {
      const px = (ox + ex) / 2, py = (oy + ey) / 2
      // The layer ships with pointer-events: none, so hit-testing has to be
      // opted into for the length of one call. Chrome hit-tests a preserve-3d
      // subtree by its transformed geometry, so the answer IS the compositor's
      // depth sort — which is the only thing under test here.
      //
      // Opt in on the BOX, never on the positioner: the positioner is the whole
      // stage, so making it hit-testable answers "where is the object's PLANE"
      // instead of "where is the object", and the two disagree wherever the
      // plane's own projected rect no longer covers the overlap.
      // (No backticks in here — this whole function is a template literal.)
      const prev = box.style.pointerEvents
      box.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint(px, py)
      box.style.pointerEvents = prev
      over = hit
        ? hit.closest('.fly-obj')
          ? 'object'
          : hit.closest('.journal-pos')
            ? 'journal'
            : 'other'
        : null
    }
    objs.push({
      id: el.dataset.fly,
      cx: (r.left - sr.left + r.width / 2) / u,
      cy: (r.top - sr.top + r.height / 2) / u,
      w: r.width / u,
      h: r.height / u,
      over,
    })
  }
  return { u, objs }
})()`

/** Predict the AABB from a pose the same way the pose table was solved. */
function predict(pose, jw, jh) {
  const t = (pose.rot * Math.PI) / 180
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t))
  return {
    w: pose.scale * (jw * c + jh * s),
    h: pose.scale * (jw * s + jh * c),
    cx: (pose.cx / 100) * 1080,
    cy: (pose.cy / 100) * 1920,
  }
}

const slidesSrc = readFileSync(new URL('../src/story/slides.js', import.meta.url), 'utf8')
const SLIDES = [...slidesSrc.matchAll(
  /frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)',\s*face:\s*'([^']+)',\s*pose:\s*\{\s*rot:\s*(-?[\d.]+),\s*scale:\s*([\d.]+),\s*cx:\s*(-?[\d.]+),\s*cy:\s*(-?[\d.]+)\s*\}/g,
)].map(m => ({
  frame: +m[1], at: +m[2], page: m[3], face: m[4],
  pose: { rot: +m[5], scale: +m[6], cx: +m[7], cy: +m[8] },
}))

/**
 * Flight records, regex-parsed out of the data file the same way SLIDES are.
 * Importing them would drag in gsap and the Vite alias resolver for no gain —
 * the file is a table by construction, and a shape change that breaks this
 * regex is exactly the kind of thing the gate should shout about.
 */
const flySrc = readFileSync(new URL('../src/story/flyObjects.js', import.meta.url), 'utf8')
const FLIGHTS = [
  ...flySrc.matchAll(
    /id: '([^']+)', asset: '([^']+)', frame: (\d+), size: (\d+),\s*\n\s*t0: ([\d.]+), dur: ([\d.]+),\s*\n\s*from: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?\d+) \},\s*\n\s*hold: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?\d+) \},\s*\n\s*to: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?\d+) \}/g,
  ),
].map(m => ({
  id: m[1],
  asset: m[2],
  frame: +m[3],
  size: +m[4],
  t0: Math.round(+m[5] * 30) / 30,
  dur: Math.round(+m[6] * 30) / 30,
  from: { x: +m[7], y: +m[8], z: +m[9] },
  hold: { x: +m[10], y: +m[11], z: +m[12] },
  to: { x: +m[13], y: +m[14], z: +m[15] },
}))

/** Scene anchor -> screen, in design px. The forward form of the inversion the
 *  table was built with; P must match TIMING.persp.base. */
const project = (a, size, P = 1800) => {
  const k = P / (P - a.z)
  return {
    cx: (a.x / 100) * 1080 * k + 540 * (1 - k),
    cy: (a.y / 100) * 1920 * k + 960 * (1 - k),
    w: size * k,
    k,
  }
}

const wsUrl = await findTarget()
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
// --window-size is unreliable with a persistent profile; override the metrics
// so every probe measures the same viewport as the screenshots.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 420, height: 747, deviceScaleFactor: 2, mobile: true,
})

const consoleLines = []
await cdp.send('Log.enable').catch(() => {})
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.consoleAPICalled') {
    consoleLines.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '))
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleLines.push('[uncaught] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    consoleLines.push('[network] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''))
  }
})

async function probeOne(url) {
  consoleLines.length = 0
  await cdp.send('Page.navigate', { url })
  await sleep(waitMs)
  return cdp.eval(MEASURE)
}

async function shoot(file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, Buffer.from(r.data, 'base64'))
}

const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(1)

if (occId) {
  const f = FLIGHTS.find(x => x.id === occId)
  if (!f) throw new Error(`no flight "${occId}"; try ${FLIGHTS.map(x => x.id).join(', ')}`)
  console.log(`${f.id} — frame ${f.frame}, ${f.t0.toFixed(2)}..${(f.t0 + f.dur).toFixed(2)} s`)
  console.log(`from z ${f.from.z}  hold z ${f.hold.z}  to z ${f.to.z}\n`)
  // `--step 0.4` walks the reference's own sampling grid, which turns this into
  // the movement comparison: the x%/y%/w% columns are directly the numbers the
  // blob tracker reads off `clean bg.mp4`.
  const step = Number(flag('--step', 0)) || f.dur / 12
  const n = Math.round(f.dur / step)
  console.log(
    '     t   --fo-z   object cx/cy       w      x%    y%    w%   overlaps journal  painted on top',
  )
  for (let i = 0; i <= n; i++) {
    const t = +(f.t0 + i * step).toFixed(3)
    await cdp.send('Page.navigate', {
      url: `${ORIGIN}/lab.html?panel=0&bg=grid&journal=1&frame=${f.frame}&t=${t}`,
    })
    await sleep(waitMs)
    const m = await cdp.eval(MEASURE_FLY)
    const o = m.objs?.find(x => x.id === f.id)
    const z = await cdp.eval(
      `parseFloat(getComputedStyle(document.querySelector('.fly-obj[data-fly="${f.id}"]')).getPropertyValue('--fo-z'))`,
    )
    console.log(
      String(t.toFixed(2)).padStart(6) +
        String(Math.round(z)).padStart(9) +
        (o
          ? `   ${o.cx.toFixed(0)}/${o.cy.toFixed(0)}`.padEnd(18) +
            o.w.toFixed(0).padStart(6) +
            ((o.cx / 1080) * 100).toFixed(1).padStart(8) +
            ((o.cy / 1920) * 100).toFixed(1).padStart(6) +
            ((o.w / 1080) * 100).toFixed(1).padStart(6)
          : '   (not live)'.padEnd(44)) +
        (o?.over ? '              yes  ' + o.over : '               no  -'),
    )
  }
} else if (flyMode) {
  const REF = JSON.parse(readFileSync(new URL('./fly-reference.json', import.meta.url), 'utf8'))

  /**
   * Strip the scene down to one thing at a time. Everything the gate measures
   * has to be isolable in a screenshot, so the backdrop goes black, the chrome
   * goes away, and the glow comes off — see the note at the filter line.
   */
  const ISOLATE = id => `(() => {
    const s = document.querySelector('.stage')
    s.style.background = '#000'
    for (const el of document.querySelectorAll('.lab__grid, .stage__bg, .stage__flash, .stage__speed, .lab__panel'))
      el.style.display = 'none'
    // Glow off: fly-reference.json measures the object's BODY on a tight mask,
    // so ours has to be the body too. Left on, a 38-px drop-shadow fattens a
    // 20-px-wide pen enough to halve its measured elongation.
    for (const el of document.querySelectorAll('.fly-obj__art')) el.style.filter = 'none'
    for (const el of document.querySelectorAll('.fly-obj'))
      el.style.display = el.dataset.fly === '${id}' ? '' : 'none'
    const r = s.getBoundingClientRect()
    const box = document.querySelector('.journal-box')
    return { x: r.left, y: r.top, w: r.width, h: r.height, u: box.offsetWidth / parseFloat(getComputedStyle(s).getPropertyValue('--jw')) }
  })()`
  // `display`, not `visibility`: the page stack switches pages WITH visibility,
  // so the active page carries `visibility: visible` of its own and shrugs off a
  // hidden ancestor. And not `opacity` either — an opacity below 1 flattens a
  // preserve-3d subtree, which would change the very thing being measured.
  const SHOW_JOURNAL = v => `document.querySelector('.journal-pos').style.display = '${v ? '' : 'none'}'`
  const BG = c => `document.querySelector('.stage').style.background = '${c}'`
  const HIDE_ONE = (id, v) =>
    `document.querySelector('.fly-obj[data-fly="${id}"]').style.display = '${v ? 'none' : ''}'`

  /**
   * Screenshot -> one grey byte per device pixel, decoded by the same ffmpeg
   * the asset scripts use rather than a PNG library we would have to install.
   *
   * LET THE FRAME LAND FIRST. `Page.captureScreenshot` returns whatever the
   * compositor already has, and a style change made microseconds earlier is not
   * in it yet: the occlusion column read 41 % on an object the page covers
   * completely, purely because the shot pre-dated the repaint. 220 ms settles
   * it. (An awaited `requestAnimationFrame` would be the tidier signal and does
   * not work here — headless throttles the callback and the await never
   * returns.)
   */
  const shotGray = async () => {
    await sleep(220)
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
    return execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { input: Buffer.from(r.data, 'base64'), maxBuffer: 1 << 28 },
    )
  }

  /**
   * Second-order image moments of the object's silhouette.
   *
   * The silhouette is its ALPHA, not its brightness. These sprites are dark
   * navy with gold trim, so on a black stage a luminance threshold throws away
   * the body and keeps the highlights — which measured every object about 15 %
   * small and pulled its centre towards whichever end happened to be lit. Two
   * shots, one on black and one on white, give alpha exactly: a fully opaque
   * pixel reads the same in both, a fully transparent one differs by 255.
   */
  const measure = (mask, W, H, rect) => {
    const px = []
    for (let p = 0; p < W * H; p++) if (mask[p]) px.push(p)
    if (px.length < 40) return null
    let sx = 0, sy = 0
    for (const p of px) { sx += p % W; sy += (p / W) | 0 }
    const n = px.length, cx = sx / n, cy = sy / n
    let mxx = 0, myy = 0, mxy = 0
    for (const p of px) {
      const dx = (p % W) - cx, dy = ((p / W) | 0) - cy
      mxx += dx * dx; myy += dy * dy; mxy += dx * dy
    }
    mxx /= n; myy /= n; mxy /= n
    const t = Math.sqrt((mxx - myy) ** 2 + 4 * mxy * mxy)
    const l1 = (mxx + myy + t) / 2, l2 = (mxx + myy - t) / 2
    return {
      n,
      // design px, via the screenshot's own scale factor against the stage rect
      cx: (cx / rect.sx - rect.x) / rect.u,
      cy: (cy / rect.sx - rect.y) / rect.u,
      sq: Math.sqrt(n) / rect.sx / rect.u,
      deg: (0.5 * Math.atan2(2 * mxy, mxx - myy) * 180) / Math.PI,
      elong: Math.sqrt(Math.max(l1, 1e-9) / Math.max(l2, 1e-9)),
      px,
    }
  }

  /** Which slide is on screen at `t` — the journal's pose has to follow the
   *  clock, not the flight's own frame. A flight outlives its slide: the pen
   *  enters on frame 8 and is still sinking behind frame 9's page, and posing
   *  the journal for frame 8 there measured the occlusion against a page that
   *  is not the one covering it. */
  const frameAt = t => {
    let f = SLIDES[0].frame
    for (const s of SLIDES) if (t >= s.at) f = s.frame
    return f
  }

  const TOL = { pos: 34, size: 0.16, deg: 12, elong: 0.28 }
  console.log(`${REF.flights.length} flights x ${REF.flights[0].samples.length} samples, against ${REF.source}\n`)
  console.log('id             t       our cx/cy       ref cx/cy      d px    size      angle     aspect   behind journal')
  let fails = 0, worstPos = 0, worstSize = 0, worstDeg = 0
  for (const f of REF.flights) {
    // FLY_ONLY=<flight id> narrows a full pass to one flight: the whole run is
    // 135 samples at four screenshots each, and chasing one object should not
    // cost ten minutes.
    if (process.env.FLY_ONLY && f.id !== process.env.FLY_ONLY) continue
    for (const smp of f.samples) {
      const [t, rx, ry, rsq, rdeg, relong, rhid] = smp   // see fly-reference.json's `units`
      await cdp.send('Page.navigate', {
        url: `${ORIGIN}/lab.html?panel=0&bg=grid&journal=1&objects=1&frame=${frameAt(t)}&t=${t}`,
      })
      await sleep(waitMs)
      const g = await cdp.eval(ISOLATE(f.id))
      await cdp.eval(SHOW_JOURNAL(false))
      const A = await shotGray()
      await cdp.eval(BG('#fff'))
      const Aw = await shotGray()
      await cdp.eval(BG('#000'))
      const W = 420 * 2, H = 747 * 2
      const alpha = new Uint8Array(W * H)
      for (let p = 0; p < W * H; p++) alpha[p] = Aw[p] - A[p] < 128 ? 1 : 0
      const rect = { x: g.x, y: g.y, w: g.w, h: g.h, u: g.u, sx: W / 420 }
      const obj = measure(alpha, W, H, rect)
      if (!obj) { console.log(`${f.id.padEnd(14)} ${t.toFixed(2).padStart(6)}   NOT RENDERED`); fails++; continue }
      // An object still half outside the picture has no measurable size, angle
      // or centre — on either side of the comparison. Its position is the only
      // thing worth reading there, and the entry keys are extrapolated rather
      // than fitted anyway.
      let clipped = false
      for (const p of obj.px) {
        const x = p % W, y = (p / W) | 0
        if (x < 2 || x > W - 3 || y < 2 || y > H - 3) { clipped = true; break }
      }

      // Depth order, read off the pixels and nothing else — no z bookkeeping is
      // consulted, which is the whole claim of ADR-0006. Three renders: the
      // object alone (A), the page alone (J), and both (C). For each pixel of
      // the object, whichever of A and J the composite matches is the one the
      // browser put in front.
      //
      // A CLASSIFICATION, not a difference threshold, and it has to be. "Did
      // this pixel change by more than 38" answers NOT COVERED for an object
      // sitting dead centre on a page that is nearly black over most of its
      // area — measured: 41 % on a planet the page hides completely.
      //
      // Pixels where the object and the page look alike anyway carry no
      // information; they are left out of the fraction rather than guessed at.
      await cdp.eval(SHOW_JOURNAL(true))
      await cdp.eval(HIDE_ONE(f.id, true))
      const J = await shotGray()
      await cdp.eval(HIDE_ONE(f.id, false))
      const C = await shotGray()
      let hidden = 0, decidable = 0
      for (const p of obj.px) {
        if (Math.abs(A[p] - J[p]) <= 25) continue
        decidable++
        if (Math.abs(C[p] - J[p]) < Math.abs(C[p] - A[p])) hidden++
      }
      const hid = decidable ? hidden / decidable : 0

      const dcx = obj.cx - (rx / 100) * 1080
      const dcy = obj.cy - (ry / 100) * 1920
      const dpos = Math.hypot(dcx, dcy)
      const rsize = obj.sq / rsq
      let ddeg = obj.deg - rdeg
      while (ddeg > 90) ddeg -= 180
      while (ddeg < -90) ddeg += 180
      const relratio = obj.elong / relong
      // A round silhouette has no meaningful principal axis; only judge the
      // angle where BOTH shapes actually have one. A four-pointed star measures
      // an elongation just over the line and an axis that is pure noise.
      const degMatters = relong > 1.2 && obj.elong > 1.2
      const bad = []
      if (!clipped) {
        if (dpos > TOL.pos) bad.push('POS')
        if (Math.abs(rsize - 1) > TOL.size) bad.push('SIZE')
        if (degMatters && Math.abs(ddeg) > TOL.deg) bad.push('ANGLE')
        if (Math.abs(relratio - 1) > TOL.elong) bad.push('ASPECT')
      }
      // Depth is an ORDERING claim, not a percentage. The reference's own
      // fraction is read off a mask that reaches into the object's magenta
      // halo, and the halo overlaps the page sooner than the object does, so
      // the two numbers are not the same quantity and matching them digit for
      // digit would be false precision. Three things are worth asserting, and
      // the last of them is the defect this whole table was rebuilt for:
      //   - an object the clip shows clear of the page is not buried here;
      //   - an object the clip shows mostly covered is at least partly covered;
      //   - an object the clip shows all but gone at the END of its flight is
      //     mostly behind the page here — it leaves by going behind the
      //     journal, not by being switched off in open view.
      if (rhid < 0.05 && hid > 0.6) bad.push('OVER-HIDDEN')
      if (rhid > 0.6 && hid < 0.25) bad.push('NOT-BEHIND')
      if (rhid >= 0.85 && hid < 0.6) bad.push('EXIT-NOT-BEHIND')
      if (bad.length) fails++
      if (!clipped) {
        worstPos = Math.max(worstPos, dpos)
        worstSize = Math.max(worstSize, Math.abs(rsize - 1))
        if (degMatters) worstDeg = Math.max(worstDeg, Math.abs(ddeg))
      }
      console.log(
        f.id.padEnd(14) +
          t.toFixed(2).padStart(6) +
          `   ${obj.cx.toFixed(0)}/${obj.cy.toFixed(0)}`.padEnd(15) +
          `${((rx / 100) * 1080).toFixed(0)}/${((ry / 100) * 1920).toFixed(0)}`.padStart(11) +
          dpos.toFixed(0).padStart(7) +
          `  x${rsize.toFixed(2)}` +
          (degMatters ? fmt(ddeg).padStart(9) + '°' : '        -') +
          `  x${relratio.toFixed(2)}` +
          `   ${(hid * 100).toFixed(0)}% vs ${(rhid * 100).toFixed(0)}%` +
          (clipped ? '  (at the frame edge)' : '') +
          (bad.length ? '  ' + bad.join(' ') : ''),
      )
    }
  }
  console.log(
    `\n${fails} sample(s) out of tolerance` +
      `\nworst: centre ${worstPos.toFixed(1)} design px (tol ${TOL.pos}), ` +
      `size x${(1 + worstSize).toFixed(2)} (tol x${(1 + TOL.size).toFixed(2)}), ` +
      `angle ${worstDeg.toFixed(1)}° (tol ${TOL.deg}°)`,
  )
  if (fails) process.exitCode = 1
} else if (all) {
  console.log('frame page                 measured cx/cy        expected cx/cy       delta cx/cy      w/h delta')
  for (const s of SLIDES) {
    const m = await probeOne(`${ORIGIN}/lab.html?panel=0&bg=grid&frame=${s.frame}`)
    if (m.error) { console.log(`${s.frame}  ${m.error}`); continue }
    const p = predict(s.pose, m.jw, m.jh)
    console.log(
      String(s.frame).padStart(5) + '  ' + s.page.padEnd(20) +
      `${m.aabb.cx.toFixed(1)}/${m.aabb.cy.toFixed(1)}`.padStart(18) +
      `${p.cx.toFixed(1)}/${p.cy.toFixed(1)}`.padStart(20) +
      `${fmt(m.aabb.cx - p.cx)}/${fmt(m.aabb.cy - p.cy)}`.padStart(18) +
      `${fmt(m.aabb.w - p.w)}/${fmt(m.aabb.h - p.h)}`.padStart(16),
    )
  }
} else {
  const m = await probeOne(`${ORIGIN}/${target}`)
  if (shotPath) {
    await shoot(shotPath)
    console.log('screenshot ->', shotPath)
  }
  if (consoleLines.length) {
    console.log('--- console ---')
    consoleLines.slice(0, 25).forEach(l => console.log(l))
    console.log('---------------')
  }
  console.log(JSON.stringify(m, null, 2))
  // Whatever is flying at this instant, in the same units. Free to print and it
  // saves a second run whenever a flight is the thing under suspicion.
  const fm = await cdp.eval(MEASURE_FLY)
  if (fm.objs?.length) console.log('live objects:', JSON.stringify(fm.objs, null, 2))
  const frame = Number(new URL(`http://x/${target}`).searchParams.get('frame'))
  const s = SLIDES.find(x => x.frame === frame)
  if (s && !m.error) {
    const p = predict(s.pose, m.jw, m.jh)
    console.log('\nexpected AABB (design px):', JSON.stringify(p, null, 2))
    console.log('delta cx/cy:', fmt(m.aabb.cx - p.cx), fmt(m.aabb.cy - p.cy))
    console.log('delta w/h  :', fmt(m.aabb.w - p.w), fmt(m.aabb.h - p.h))
  }
}

ws.close()
cleanup()
