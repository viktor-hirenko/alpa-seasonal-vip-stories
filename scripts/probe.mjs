#!/usr/bin/env node
/**
 * Measure the live 3D scene numerically instead of eyeballing screenshots.
 *
 * Drives headless Chrome over the DevTools Protocol using Node's built-in
 * WebSocket (Node >= 22), so there are no dependencies to install.
 *
 *   node scripts/probe.mjs "lab.html?frame=11"            # one pose
 *   node scripts/probe.mjs --all                          # every slide
 *   node scripts/probe.mjs --fit                          # scene vs backdrop, per device
 *   node scripts/probe.mjs --fly                          # every flight
 *   PROBE_VIEWPORT=430x932 node scripts/probe.mjs --fly    # ...on a real phone
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
// --fit: the registration check. Everything else measures the scene against
// itself at one viewport; this one asks whether the scene and the backdrop
// video are even on the same canvas, at the shapes real devices have.
const fitMode = args.includes('--fit')
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
const target =
  args.find(
    (a, i) => !a.startsWith('--') && args[i - 1] !== '--shot' && args[i - 1] !== '--wait',
  ) || 'lab.html?frame=11'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=420,747',
    '--user-data-dir=/tmp/probe-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const cleanup = () => {
  try {
    chrome.kill()
  } catch {}
}
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
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data)
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''),
      )
    return r.result.value
  }
}

/** Runs in the page. Returns the journal AABB in design px plus the raw inputs. */
const MEASURE = `(() => {
  const stage = document.querySelector('.stage')
  const box = document.querySelector('.journal-box')
  if (!stage || !box) return { error: 'no stage/box' }
  // Design coordinates are measured from the CANVAS (.stage-3d), which is
  // exactly 1080 x 1920 design px, not from the stage, which is the viewport
  // and only coincides with the canvas at 9:16. Measuring from the stage is
  // what let a scene 18 % out of scale read as correct.
  const sr = document.querySelector('.stage-3d').getBoundingClientRect()
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
  const sr = document.querySelector('.stage-3d').getBoundingClientRect()
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

/** Predict the AABB from a pose the same way the storyboard poses were solved. */
function predict(pose, jw, jh) {
  const t = (pose.rot * Math.PI) / 180
  const c = Math.abs(Math.cos(t)),
    s = Math.abs(Math.sin(t))
  return {
    w: pose.scale * (jw * c + jh * s),
    h: pose.scale * (jw * s + jh * c),
    cx: (pose.cx / 100) * 1080,
    cy: (pose.cy / 100) * 1920,
  }
}

/**
 * The story table, IMPORTED rather than scraped.
 *
 * It used to be pulled out of the file with a regular expression that expected
 * `pose: { rot: ..., scale: ..., cx: ..., cy: ... }` on the same line. That is a
 * gate which cannot fail loudly: change the shape of the table and the match
 * count goes to zero, the gate prints an empty report and exits green. slides.js
 * imports nothing but timing.js, so node can load it directly — and a shape
 * change now breaks the import, in the open.
 */
const { SLIDES, JOURNAL_PATH, poseAt, settledAt } = await import('../src/story/slides.js')

/**
 * Flight records, regex-parsed out of the data file the same way SLIDES are.
 * Importing them would drag in gsap and the Vite alias resolver for no gain —
 * the file is a table by construction, and a shape change that breaks this
 * regex is exactly the kind of thing the gate should shout about.
 */
const flySrc = readFileSync(new URL('../src/story/flyObjects.js', import.meta.url), 'utf8')
/**
 * The sprites whose silhouette has no long axis. Parsed rather than imported,
 * like everything else here, so the gate stays dependency-free.
 */
const ROUND_ASSETS = new Set(
  (flySrc.match(/export const ROUND_ASSETS = new Set\(\[([^\]]*)\]/)?.[1] || '')
    .split(',')
    .map(x => x.trim().replace(/^'|'$/g, ''))
    .filter(Boolean),
)
/**
 * THE TABLE IS A POLYLINE, and this parse has to read that shape (2026-09-06).
 * It used to match `size: / t0: / dur: / from: / hold: / to:` — the pose-triple
 * form the table lost on 2026-09-03 — so it matched NOTHING and `FLIGHTS` was
 * the empty array. Nothing noticed, because the only reader is `--occlusion`
 * and `--fly` builds its own list from fly-reference.json; the mode simply
 * failed with `no flight "pen-1"; try ` and an empty list of suggestions.
 * That was V-52.
 *
 * A record is `{ id, asset, frame, zFlip, keys: [[t, x%, y%, size, rot], ...] }`
 * and the rows are what `npm run fly:measure` writes. `t0`/`t1` are the first
 * and last row's second, the way flyObjects.js derives them.
 */
/**
 * Which side of the journal each object is on, straight out of flyObjects.js.
 * The storyboard decides it and it holds for the whole slide (V-96), which is
 * why two of the checks below have to know about it.
 */
const FLY_LAYER = Object.fromEntries(
  [
    ...(/export const FLY_LAYER = \{([\s\S]*?)\n\}/.exec(flySrc)?.[1] ?? '').matchAll(
      /'([^']+)':\s*'(front|behind)'/g,
    ),
  ].map(m => [m[1], m[2]]),
)

const FLIGHTS = [
  ...flySrc.matchAll(
    /\{ id: '([^']+)', asset: '([^']+)', frame: (\d+), zFlip: ([\d.]+), keys: \[([\s\S]*?)\]\s*\}/g,
  ),
].map(m => {
  const keys = [...m[5].matchAll(/\[([^\]]+)\]/g)].map(k =>
    k[1].split(',').map(v => Number(v.trim())),
  )
  return {
    id: m[1],
    asset: m[2],
    frame: +m[3],
    zFlip: +m[4],
    keys,
    t0: keys[0][0],
    t1: keys[keys.length - 1][0],
  }
})

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

let fails = 0
const wsUrl = await findTarget()
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
// --window-size is unreliable with a persistent profile; override the metrics
// so every probe measures the same viewport as the screenshots.
/**
 * The viewport every mode measures at. 420x747 is 9:16 to three decimals, and
 * that is exactly why it must not be the only one: the backdrop video is
 * `object-fit: cover` and the scene is laid out on a 1080x1920 canvas, so the
 * two scales agree ONLY at 9:16. A scene 18 % out of scale on a real phone
 * measured perfect here. `--fit` walks the shapes that matter; PROBE_VIEWPORT
 * re-runs any mode on one of them.
 */
const [VW, VH] = (process.env.PROBE_VIEWPORT || '420x747').split('x').map(Number)
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: VW,
  height: VH,
  deviceScaleFactor: 2,
  mobile: VW < 800,
})

const consoleLines = []
await cdp.send('Log.enable').catch(() => {})
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.consoleAPICalled') {
    consoleLines.push(
      `[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '),
    )
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleLines.push(
      '[uncaught] ' +
        (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text),
    )
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

if (fitMode) {
  const SHAPES = [
    [420, 747, '9:16 exactly'],
    [430, 932, 'iPhone 14/15 Pro Max'],
    [393, 852, 'iPhone 15 Pro'],
    [360, 800, 'Android common'],
    [1512, 945, 'MacBook (desktop card)'],
    [1920, 1080, 'wide desktop'],
  ]
  // THE CLAIM UNDER TEST: the scene is laid out on the VIDEO'S rectangle, and
  // on the desktop card that rectangle is not cropped.
  //
  // Two things have to hold at once and they pull against each other:
  //
  //   REGISTRATION. The flying objects are measured in the clip's own frame, so
  //   the scene must use the video's `cover` scale and centre. Lay the scene out
  //   with `contain` instead and every object slides away from the room it flies
  //   through — up to 47 px on a 430x932 phone. That shipped once, on the
  //   reasoning that `clean bg` holds neither journal nor objects; but it holds
  //   the ROOM, and a coin has to pass the porthole where the clip passes it.
  //
  //   NO CROP WHERE WE CONTROL THE SHAPE. `cover` enlarges and crops on any
  //   aspect but 9:16, and the desktop card's shape is ours to choose, so it is
  //   9:16 and crops nothing. A phone taller than 9:16 does crop the sides, and
  //   that is what a full-screen story does — the design agrees, its `interior`
  //   art is 1340 px wide inside a 1080 px frame.
  //
  // So: registration is asserted everywhere, zero crop is asserted on the
  // desktop card only, and the phones' crop is printed so a change in it cannot
  // pass unnoticed.
  console.log('Scene vs backdrop, per viewport. The scene must be laid out on the SAME')
  console.log('rectangle object-fit: cover gives the video, or every flying object slides')
  console.log('away from the room. The desktop card is 9:16 so that costs it no crop.\n')
  console.log('viewport      device                  canvas       fit    crop   off-centre  video')
  let worst = 0
  for (const [w, h, name] of SHAPES) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: w < 800,
    })
    await cdp.send('Page.navigate', {
      url: `${ORIGIN}/lab.html?panel=0&bg=clean&journal=1&frame=8&t=14.5`,
    })
    await sleep(waitMs + 900)
    const m = await cdp.eval(`(() => {
      const st = document.querySelector('.stage'), sr = st.getBoundingClientRect()
      const cv = document.querySelector('.stage-3d').getBoundingClientRect()
      const box = document.querySelector('.journal-box')
      const bg = document.querySelector('.stage__bg')
      return { sw: sr.width, sh: sr.height, cw: cv.width, ch: cv.height,
        cx: cv.left - sr.left + cv.width / 2, cy: cv.top - sr.top + cv.height / 2,
        u: box.offsetWidth / parseFloat(getComputedStyle(st).getPropertyValue('--jw')),
        bgFit: bg ? getComputedStyle(bg).objectFit : 'none' }
    })()`)
    // The scale `object-fit: cover` gives a 1080x1920 source in this stage.
    const sCover = Math.max(m.sw / 1080, m.sh / 1920)
    const fit = m.u / sCover
    // How far the canvas spills past the stage, i.e. how much is cropped away.
    const crop = Math.max(0, m.cw - m.sw, m.ch - m.sh)
    const off = Math.max(Math.abs(m.cx - m.sw / 2), Math.abs(m.cy - m.sh / 2))
    const isCard = w >= 768
    const bad = Math.abs(fit - 1) > 0.005 || off > 1 || m.bgFit !== 'cover' || (isCard && crop > 1)
    if (bad) fails++
    worst = Math.max(worst, Math.abs(fit - 1))
    console.log(
      `${w}x${h}`.padEnd(14) +
        name.padEnd(24) +
        `${m.cw.toFixed(0)}x${m.ch.toFixed(0)}`.padEnd(12) +
        fit.toFixed(3).padStart(6) +
        crop.toFixed(0).padStart(7) +
        ' px' +
        off.toFixed(1).padStart(11) +
        ' px' +
        '  ' +
        m.bgFit +
        (bad ? (Math.abs(fit - 1) > 0.005 ? '   OUT OF REGISTER' : '   CARD CROPS') : ''),
    )
  }
  console.log(`\n${fails} viewport(s) bad; worst registration error ${(worst * 100).toFixed(1)} %`)
  console.log('crop on a phone is expected — it is what a full-screen story does; crop on')
  console.log('the desktop card is a bug, because the card is ours to shape.')
  if (fails) process.exitCode = 1
} else if (occId) {
  const f = FLIGHTS.find(x => x.id === occId)
  if (!f) throw new Error(`no flight "${occId}"; try ${FLIGHTS.map(x => x.id).join(', ')}`)
  const dur = f.t1 - f.t0
  console.log(
    `${f.id} — frame ${f.frame}, ${f.t0.toFixed(2)}..${f.t1.toFixed(2)} s, ${f.keys.length} rows`,
  )
  console.log(`in front until zFlip ${f.zFlip.toFixed(2)}, behind the page after it\n`)
  // `--step 0.4` walks the reference's own sampling grid, which turns this into
  // the movement comparison: the x%/y%/w% columns are directly the numbers the
  // blob tracker reads off `clean bg.mp4`.
  const step = Number(flag('--step', 0)) || dur / 12
  const n = Math.round(dur / step)
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
    const r = document.querySelector('.stage-3d').getBoundingClientRect()
    const box = document.querySelector('.journal-box')
    return { x: r.left, y: r.top, w: r.width, h: r.height, u: box.offsetWidth / parseFloat(getComputedStyle(s).getPropertyValue('--jw')) }
  })()`
  // `display`, not `visibility`: the page stack switches pages WITH visibility,
  // so the active page carries `visibility: visible` of its own and shrugs off a
  // hidden ancestor. And not `opacity` either — an opacity below 1 flattens a
  // preserve-3d subtree, which would change the very thing being measured.
  const SHOW_JOURNAL = v =>
    `document.querySelector('.journal-pos').style.display = '${v ? '' : 'none'}'`
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
    let sx = 0,
      sy = 0
    for (const p of px) {
      sx += p % W
      sy += (p / W) | 0
    }
    const n = px.length,
      cx = sx / n,
      cy = sy / n
    let mxx = 0,
      myy = 0,
      mxy = 0
    for (const p of px) {
      const dx = (p % W) - cx,
        dy = ((p / W) | 0) - cy
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

  /**
   * When the slide an object belongs to leaves the screen.
   *
   * SAMPLES PAST IT ARE NOT JUDGED, AND THAT IS DELIBERATE (V-95). The product
   * stops drawing a flight the moment its page is turned — the owner asked for
   * it in those words: "when the journal turns the objects should go under it at
   * once". There is nothing to measure on those frames, so scoring them would
   * fail 56 of 162 samples for a reason that is a decision rather than a defect.
   * It costs nothing in coverage: the reference itself has the page hiding every
   * one of the 27 flights 100 % on its own last sample, so those seconds were
   * invisible there too. Each skip is printed with the reference's own hidden
   * fraction beside it, so this stays a stated exemption and not a silent one.
   */
  const slideEnd = frame => {
    const later = SLIDES.filter(s => s.frame > frame).map(s => s.at)
    return later.length ? Math.min(...later) : Infinity
  }

  // `size` IS x1.30 AND NOT x1.16, and the reason is the two rulers rather than
  // the objects. Our side is the sprite's own ALPHA, measured off a pair of
  // screenshots on black and on white; the clip's side is a colour distance
  // against a median plate, dilated to close the object up. Across the 135
  // samples that pair has a median ratio of 1.00 and a 90th percentile of 1.18,
  // with the spread sitting on whole objects at a time — every spark reads 10 %
  // small, every milk carton 15 % large — which is the two masks disagreeing
  // about where a glowing edge stops, not the render. At x1.16 the gate was
  // failing thirteen samples of that spread and would have gone on failing them
  // whatever the scene did.
  //
  // It was x1.16 against a reference file whose size column had been written by
  // an older pass and never regenerated; the first honest regeneration is what
  // exposed the mismatch. See the note in fly-measure.mjs's `tight`.
  //
  // `step` is the one the crossing check below asserts: how much of the object
  // the page may take in the single frame the depth switch happens on.
  const TOL = { pos: 34, size: 0.3, deg: 12, elong: 0.28, step: 0.25 }
  console.log(
    `${REF.flights.length} flights x ${REF.flights[0].samples.length} samples, against ${REF.source}\n`,
  )
  console.log(
    'id             t       our cx/cy       ref cx/cy      d px    size      angle     aspect   behind journal',
  )
  let worstPos = 0,
    worstSize = 0,
    worstDeg = 0,
    worstStep = 0
  for (const f of REF.flights) {
    // FLY_ONLY=<flight id> narrows a full pass to one flight: the whole run is
    // 135 samples at four screenshots each, and chasing one object should not
    // cost ten minutes.
    if (process.env.FLY_ONLY && f.id !== process.env.FLY_ONLY) continue
    const spun = []
    // THE LAST SAMPLE OF EVERY FLIGHT IS A DEPTH CLAIM, NOT A GEOMETRY ONE.
    // `writeReference` picks five samples from the frames where the object is
    // wholly inside the picture, then appends the tracker's very last frame —
    // which is where the occlusion claim lives and where, by then, the tracker
    // is holding on to a remnant. Judging a centre or a size against a remnant
    // is judging noise: it printed x3.89 on chip-1 and 92 px on spark-1 while
    // both objects were sitting where the reference has them. The same rule
    // writeReference uses to choose its five says which those are — a blob under
    // 55 % of the flight's largest.
    const rmax = Math.max(...f.samples.map(s => s[3]))
    const rec = FLIGHTS.find(r => r.id === f.id)
    // A flight is drawn to its own last keyframe: it goes behind the journal at
    // the page turn and carries on there, it is not cut off (flyLayer.js). This
    // used to carry the same clamp the layer did, so the samples after a turn
    // went unjudged on both sides at once — the product stopped drawing them and
    // the gate stopped looking. The reference HAS those samples; they are the
    // seconds the object spends sliding under the turning page, and they are
    // worth checking precisely because nothing else covers them.
    const drawnUntil = rec ? rec.t1 : Infinity
    for (const smp of f.samples) {
      const [t, rx, ry, rsq, rdeg, relong, rhid] = smp // see fly-reference.json's `units`
      if (t > drawnUntil) {
        console.log(
          `${f.id.padEnd(14)} ${t.toFixed(2).padStart(6)}   not judged: the page has turned at ` +
            `${drawnUntil.toFixed(2)} and we stop drawing there (the reference hides it ` +
            `${Math.round(rhid * 100)} % here anyway)`,
        )
        continue
      }
      await cdp.send('Page.navigate', {
        url: `${ORIGIN}/lab.html?panel=0&bg=grid&journal=1&objects=1&frame=${frameAt(t)}&t=${t}`,
      })
      await sleep(waitMs)
      const g = await cdp.eval(ISOLATE(f.id))
      // The angle actually APPLIED, read off the element rather than off the
      // pixels. For a round object the measured angle is noise on both sides of
      // the comparison, so the pixel test below cannot see a spin — which is
      // exactly how a spin shipped. This reads what the code did.
      const applied = await cdp.eval(`(() => {
        const b = document.querySelector('.fly-obj[data-fly="${f.id}"] .fly-obj__box')
        if (!b) return null
        const m = new DOMMatrixReadOnly(getComputedStyle(b).transform)
        return Math.atan2(m.b, m.a) * 180 / Math.PI
      })()`)
      if (applied != null) spun.push(applied)
      await cdp.eval(SHOW_JOURNAL(false))
      const A = await shotGray()
      await cdp.eval(BG('#fff'))
      const Aw = await shotGray()
      await cdp.eval(BG('#000'))
      const W = VW * 2,
        H = VH * 2
      const alpha = new Uint8Array(W * H)
      for (let p = 0; p < W * H; p++) alpha[p] = Aw[p] - A[p] < 128 ? 1 : 0
      const rect = { x: g.x, y: g.y, w: g.w, h: g.h, u: g.u, sx: W / VW }
      const obj = measure(alpha, W, H, rect)
      if (!obj) {
        console.log(`${f.id.padEnd(14)} ${t.toFixed(2).padStart(6)}   NOT RENDERED`)
        fails++
        continue
      }
      // An object still half outside the picture has no measurable size, angle
      // or centre — on either side of the comparison. Its position is the only
      // thing worth reading there, and the entry keys are extrapolated rather
      // than fitted anyway.
      let clipped = false
      for (const p of obj.px) {
        const x = p % W,
          y = (p / W) | 0
        if (x < 2 || x > W - 3 || y < 2 || y > H - 3) {
          clipped = true
          break
        }
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
      let hidden = 0,
        decidable = 0
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
      // angle where BOTH shapes actually have one. The list comes from
      // flyObjects.js rather than from a threshold of its own, because the two
      // rules drifting apart is exactly how a frozen `calendar` ended up being
      // judged on an angle: the runtime called it round at 1.25 and this gate
      // called it measurable at 1.2. One list, used by both.
      const degMatters = !ROUND_ASSETS.has(f.asset) && relong > 1.2 && obj.elong > 1.2
      const bad = []
      let note = ''
      // Geometry is judged only where there is something on screen to judge.
      // `shapeless`: the tracker is holding a remnant (see above). `swallowed`:
      // the reference's own page has taken 85 % of the object, so its centre and
      // its size describe a shape nobody can see — the gate measures ours with
      // the journal hidden, which at that moment is a picture the story never
      // shows. What IS asserted there is depth, below, which is the whole reason
      // those samples exist.
      const shapeless = rsq < 0.55 * rmax
      const swallowed = rhid >= 0.85
      if (!clipped && !shapeless && !swallowed) {
        if (dpos > TOL.pos) bad.push('POS')
        if (Math.abs(rsize - 1) > TOL.size) bad.push('SIZE')
        if (degMatters && Math.abs(ddeg) > TOL.deg) bad.push('ANGLE')
        if (Math.abs(relratio - 1) > TOL.elong) bad.push('ASPECT')
      }
      // While the page is TURNING the reference has a hairline where the lab
      // has a settled pose, so the two are not comparable and the sample is
      // skipped. `flip` runs 0.14 s out and 0.79 s back from each cut.
      const cut = SLIDES.reduce((a, x) => (t >= x.at && x.at > a ? x.at : a), -99)
      const midFlip = t - cut < 0.95
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
      //
      // Only the two ENDS of the reference's scale are asserted. Its middle is
      // not measurable to better than the page's own edge: the page is nearly
      // black along its bottom, so the difference between the two clips dies
      // out before the page does and the journal reads smaller than it is,
      // while along its top the page's glow reads larger. Both were checked —
      // the poses themselves match the design to 0.9 design px on all fifteen
      // slides, so a disagreement in that middle band is the reference's
      // resolution, not the scene's.
      // ⚠️ A `front` OBJECT LEAVES IN FRONT, AND THAT IS THE DESIGN NOW (V-96).
      // The storyboard decides which side of the journal each object is on and
      // it holds for the whole slide; the crossing happens at the page turn, not
      // mid-flight. So for those objects the clip's "all but gone by the end"
      // is not a claim about us — the clip swallows them early, we do not, and
      // that is the owner's decision, not a defect. `OVER-HIDDEN` still applies
      // to everything: being buried when the mock floats you is always wrong.
      const isFront = FLY_LAYER[f.id] === 'front'
      if (!midFlip) {
        if (rhid < 0.05 && hid > 0.75) bad.push('OVER-HIDDEN')
        if (rhid >= 0.85 && hid < 0.6 && !isFront) bad.push('EXIT-NOT-BEHIND')
        if (rhid >= 0.85 && hid < 0.6 && isFront) note = 'floats to the turn (storyboard)'
      }
      if (bad.length) fails++
      if (!clipped && !shapeless && !swallowed) {
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
          (shapeless ? '  (the reference has lost the shape)' : '') +
          (swallowed && !shapeless ? '  (the page has it in the reference too)' : '') +
          (note ? '  (' + note + ')' : '') +
          (bad.length ? '  ' + bad.join(' ') : ''),
      )
    }
    // PER FLIGHT: a round object must not turn at all. The pixel tests above
    // cannot see this — for a round silhouette the measured angle is noise on
    // BOTH sides, so `degMatters` skips it, and that blind spot is precisely
    // how a spin shipped: `rot` for these came from a correlation fit that had
    // no angle to find, and the table carried jumps of up to 87 deg in a single
    // row. So this reads the rotation the code actually APPLIED, off the
    // element, and asserts it never changes. It is not circular: what decides
    // that a shape is round is its own alpha, measured independently.
    if (ROUND_ASSETS.has(f.asset) && spun.length > 1) {
      const spread = Math.max(...spun) - Math.min(...spun)
      if (spread > 1) {
        fails++
        console.log(
          `${f.id.padEnd(14)}   SPIN — a round sprite turned ${spread.toFixed(1)} deg over its flight`,
        )
      }
    }

    // PER FLIGHT: THE HANDOVER MUST NOT POP — the check the owner's complaint
    // deserved and the table never had.
    //
    // Depth is one step per flight, at `zIn`: the first frame the clip's own
    // journal touches the object. Before it the object is in front, so nothing
    // can cover it and our fraction is 0 by construction; the frame AFTER it is
    // therefore the whole of what the switch costs on screen. If the page takes
    // a quarter of the object in that one frame, the object did not go behind
    // the page, it was swallowed — which is what a `zFlip` placed in the middle
    // of the handover looked like, and it is not something the samples above can
    // see: they are a second apart and the pop is one frame wide.
    //
    // A number this asserts and the five samples cannot: it is measured at a
    // time NOT in the reference's sample list, one twentieth of a second after
    // a moment the clip chose.
    // A crossing that falls while the PAGE ITSELF IS TURNING is not judged, for
    // the same reason the samples above are not: for 0.95 s after a cut the page
    // sweeps the whole frame, so "the page took the object" says nothing about
    // depth. Six of the 27 crossings land there — soccer-1's is 0.02 s from its
    // own cut — and they are reported without a verdict.
    if (f.zIn != null) {
      const t = +(f.zIn + 0.05).toFixed(3)
      const cut = SLIDES.reduce((a, x) => (t >= x.at && x.at > a ? x.at : a), -99)
      const turning = t - cut < 0.95
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
      const W = VW * 2,
        H = VH * 2
      const alpha = new Uint8Array(W * H)
      for (let p = 0; p < W * H; p++) alpha[p] = Aw[p] - A[p] < 128 ? 1 : 0
      const obj = measure(alpha, W, H, { x: g.x, y: g.y, w: g.w, h: g.h, u: g.u, sx: W / VW })
      if (obj) {
        await cdp.eval(SHOW_JOURNAL(true))
        await cdp.eval(HIDE_ONE(f.id, true))
        const J = await shotGray()
        await cdp.eval(HIDE_ONE(f.id, false))
        const C = await shotGray()
        let hidden = 0,
          decidable = 0
        for (const p of obj.px) {
          if (Math.abs(A[p] - J[p]) <= 25) continue
          decidable++
          if (Math.abs(C[p] - J[p]) < Math.abs(C[p] - A[p])) hidden++
        }
        const step = decidable ? hidden / decidable : 0
        if (!turning) worstStep = Math.max(worstStep, step)
        const bad = !turning && step > TOL.step
        if (bad) fails++
        console.log(
          `${f.id.padEnd(14)}${t.toFixed(2).padStart(6)}   handover: the page takes ${(step * 100).toFixed(0)} % in the first frame behind it` +
            (turning ? '  (the page is mid-turn)' : '') +
            (bad ? '  CROSSING-POP' : ''),
        )
      }
    }
  }
  console.log(
    `\n${fails} sample(s) out of tolerance` +
      `\nworst: centre ${worstPos.toFixed(1)} design px (tol ${TOL.pos}), ` +
      `size x${(1 + worstSize).toFixed(2)} (tol x${(1 + TOL.size).toFixed(2)}), ` +
      `angle ${worstDeg.toFixed(1)}° (tol ${TOL.deg}°), ` +
      `handover ${(worstStep * 100).toFixed(0)} % (tol ${TOL.step * 100} %)`,
  )
  if (fails) process.exitCode = 1
} else if (all) {
  /**
   * THE POSE GATE, AND WHAT IT NOW ASSERTS.
   *
   * It used to render each slide in the lab, predict that slide's AABB from the
   * pose table, and compare the two. Both sides of that came out of the same
   * four numbers, so it was green by construction and could only ever catch a
   * broken transform chain — never a wrong pose. With the pose table replaced by
   * a measured path, keeping it would have been worse than useless: it would
   * have gone green on the new numbers the moment they were written down, and
   * looked like a verdict on them.
   *
   * What it checks instead is THE CLAIM THIS SESSION MAKES: that the journal
   * moves through a slide the way the clip's does. `scripts/journal-reference.json`
   * holds the clip's own pose, second by second, as measured by clip-fit. For
   * each slide, our journal is parked at each of those seconds IN THE PLAYER —
   * not in the lab, so what is measured is what ships — and its motion SINCE
   * THE SLIDE'S FIRST MEASURED SECOND is compared with the clip's motion over
   * the same interval.
   *
   * The comparison is of deltas rather than absolutes on purpose. clip-fit
   * registers our page's type and art against the clip's, so its absolute answer
   * carries our layout's own difference from the clip's edition; that offset is
   * fixed within a slide and cancels in a delta, which is exactly why the path
   * takes its motion from this instrument and its anchor from elsewhere. An
   * absolute check would be measuring the layout, and would fail for the wrong
   * reason.
   */
  const REFP = JSON.parse(
    readFileSync(new URL('./journal-reference.json', import.meta.url), 'utf8'),
  )
  const PARK = t => `(async () => {
    const s = window.__story, v = s.video
    s.seek(${t})
    await new Promise(r => setTimeout(r, 700))
    v.pause(); s.tl.pause()
    v.currentTime = ${t}
    await new Promise(r => { if (Math.abs(v.currentTime - ${t}) < 0.02) return r()
      v.addEventListener('seeked', r, { once: true }); setTimeout(r, 1200) })
    s.tl.seek(${t}, false)
    s.applySegment?.(${t})
    const g = (window.__story && window.__story.gsap) || window.gsap
    const box = document.querySelector('.journal-box'), pos = document.querySelector('.journal-pos')
    const num = (el, pr) => { const v = Number(g.getProperty(el, pr)); return Number.isFinite(v) ? v : 0 }
    return { t: s.tl.time(), rot: num(box, 'rotationZ'), scale: num(box, 'scaleX'),
             cx: num(pos, 'xPercent'), cy: num(pos, 'yPercent') }
  })()`

  /**
   * GROUPED BY THE ROW'S OWN `frame`, not by re-deriving one from its second.
   *
   * Every column in the reference is relative to THE FIRST SAMPLE OF THE RUN
   * THAT MEASURED IT, and the run is what `frame` names. Re-deriving the frame
   * from `t` against SLIDES gives the same answer everywhere a run stops at the
   * next slide's row — which was everywhere, until the outro was measured as one
   * chain from 84.03 to 88.03 straight through frame 24's row at 85.0. Split
   * there, the second half was compared against a zero it was never measured
   * from, and the gate reported 76 design px of error on eleven rows that are
   * right to a pixel.
   */
  const bySlide = new Map()
  for (const r of REFP.rows) {
    let f = r.frame
    if (f === undefined) {
      f = SLIDES[0].frame
      for (const x of SLIDES) if (x.at <= r.t + 1e-6) f = x.frame
    }
    if (!bySlide.has(f)) bySlide.set(f, [])
    bySlide.get(f).push(r)
  }

  await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html` })
  await sleep(Math.max(waitMs, 7000))

  const TOL = { pos: 9, scale: 0.008, rot: 0.6 }
  console.log(
    `The journal's MOTION against the clip's, from ${REFP.src || 'journal-reference.json'}.`,
  )
  console.log("Each row: how far our journal has moved since this slide's first")
  console.log("measured second, against how far the clip's moved over the same seconds.\n")
  console.log(
    'frame page                     t    ours dcx/dcy   clip dcx/dcy    err px   dsize    drot',
  )
  let fails = 0,
    worstPos = 0,
    worstScale = 0,
    worstRot = 0
  for (const [frame, rows] of [...bySlide].sort((a, b) => a[0] - b[0])) {
    const page = SLIDES.find(x => x.frame === frame)?.page || ''
    let ourBase = null
    for (const r of rows) {
      const m = await cdp.eval(PARK(r.t))
      // The reference's own columns are ALREADY relative to the slide's first
      // sample — dx/dy in design px, size as a ratio, rot in degrees — so this
      // side only has to make ours relative too.
      if (!ourBase) {
        ourBase = m
        continue
      }
      const ourDx = ((m.cx - ourBase.cx) / 100) * 1080
      const ourDy = ((m.cy - ourBase.cy) / 100) * 1920
      const refDx = r.dx
      const refDy = r.dy
      const ePos = Math.hypot(ourDx - refDx, ourDy - refDy)
      const eScale = Math.abs(m.scale / ourBase.scale / r.size - 1)
      const eRot = Math.abs(m.rot - ourBase.rot - r.rot)
      // A comparison that produced no number is a FAILURE, not a pass. NaN loses
      // every `>` it is put through, so a gate that only asks "is the error too
      // big" reports a clean sheet when it has measured nothing at all — which
      // is exactly what this gate did on its first run, against a reference
      // whose columns it was reading by the wrong names.
      const num = [ourDx, ourDy, refDx, refDy, ePos, eScale, eRot].every(Number.isFinite)
      const bad = !num || ePos > TOL.pos || eScale > TOL.scale || eRot > TOL.rot
      if (bad) fails++
      worstPos = Math.max(worstPos, ePos)
      worstScale = Math.max(worstScale, eScale)
      worstRot = Math.max(worstRot, eRot)
      console.log(
        String(frame).padStart(5) +
          '  ' +
          page.padEnd(20) +
          r.t.toFixed(2).padStart(7) +
          `${fmt(ourDx)}/${fmt(ourDy)}`.padStart(16) +
          `${fmt(refDx)}/${fmt(refDy)}`.padStart(16) +
          ePos.toFixed(1).padStart(9) +
          (eScale * 100).toFixed(2).padStart(8) +
          '%' +
          eRot.toFixed(2).padStart(8) +
          (!num ? '  NOT MEASURED' : bad ? '  OUT' : ''),
      )
    }
  }
  console.log(
    `\n${fails} sample(s) out of tolerance` +
      `\nworst: motion ${worstPos.toFixed(1)} design px (tol ${TOL.pos}), ` +
      `size ${(worstScale * 100).toFixed(2)} % (tol ${(TOL.scale * 100).toFixed(1)} %), ` +
      `angle ${worstRot.toFixed(2)}\u00b0 (tol ${TOL.rot}\u00b0)`,
  )
  if (fails) process.exitCode = 1
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
    // Where the PATH has the journal once this slide has settled — the pose the
    // lab's `frame=N` is meant to reproduce.
    const p = predict(poseAt(settledAt(frame)), m.jw, m.jh)
    console.log('\nexpected AABB (design px):', JSON.stringify(p, null, 2))
    console.log('delta cx/cy:', fmt(m.aabb.cx - p.cx), fmt(m.aabb.cy - p.cy))
    console.log('delta w/h  :', fmt(m.aabb.w - p.w), fmt(m.aabb.h - p.h))
  }
}

ws.close()
cleanup()
