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
 *
 * For each slide it reports the journal's on-screen bounding box in DESIGN px
 * and the delta against the box predicted from slides.js, which is what turns
 * "looks a bit off" into "cy is 4.2 design px low".
 *
 * ⚠️ `--fly` AND `--occlusion` ARE GONE (DP-15822). They measured the DOM
 * flying objects, and those moved into the background film; the tables and
 * the sprites they read no longer exist. The history is in
 * _context/33-fly-objects.md and _context/41-levitation.md.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'

const args = process.argv.slice(2)
const all = args.includes('--all')
// --fit: the registration check. Everything else measures the scene against
// itself at one viewport; this one asks whether the scene and the backdrop
// video are even on the same canvas, at the shapes real devices have.
const fitMode = args.includes('--fit')
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
  //   REGISTRATION. The journal's poses are measured in the clip's own frame,
  //   so the scene must use the video's `cover` scale and centre. Lay the scene
  //   out with `contain` instead and the journal slides away from the room it
  //   hangs in — up to 47 px on a 430x932 phone. That shipped once, on the
  //   reasoning that `clean bg` holds neither journal nor objects; but it holds
  //   the ROOM. ⚠️ From DP-15822 the film also carries the levitating objects,
  //   so an object has to pass the porthole where the clip passes it — this
  //   check got stricter, not looser.
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
  console.log('rectangle object-fit: cover gives the video, or the journal slides away')
  console.log('from the room. The desktop card is 9:16 so that costs it no crop.\n')
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
