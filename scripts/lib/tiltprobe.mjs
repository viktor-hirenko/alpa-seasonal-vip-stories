/**
 * THE LEAN PROBE — one browser, one scorer, shared by the measurer and its gate.
 *
 * Everything here answers a single question: with the story parked at an
 * instant, how far does OUR page have to lean in depth before it matches the
 * picture we are comparing against? The picture is a frame of the clip when we
 * are measuring, and a photograph of our own page at an angle we chose when we
 * are testing whether the method can measure at all. Nothing else differs
 * between the two uses, which is the point of putting it in one file: a gate
 * that exercises a different code path from the measurement is not a gate.
 *
 * The scoring is clip-fit's gradient registration (see lib/gradfit.mjs): only
 * the DIRECTION of the edges is compared, because the journal in the clip sits
 * inside a bloom as big as itself and any brightness-based comparison scores
 * the bloom. `journal-tilt.mjs` established the shape of this; what is new here
 * is that a candidate may be scored at any instant rather than one per slide,
 * and that it does not re-find the page from scratch every time.
 */
import { spawn, execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import {
  W,
  H,
  pyramid,
  maskPyramid,
  register,
  descend,
  points,
  pageMask,
  boxMask,
  reachMask,
} from './gradfit.mjs'

export { W, H }

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const KEEP = Number(process.env.TILT_KEEP || 0.14)
export const sleep = ms => new Promise(r => setTimeout(r, ms))

const ff = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 29 })
export const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
export const rgbOfVideo = (f, t) =>
  ff([
    '-ss', String(t), '-i', f, '-frames:v', '1',
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]) // prettier-ignore

// ===========================================================================
// THE BROWSER
// ===========================================================================

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.p = new Map()
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data),
        q = this.p.get(m.id)
      if (q) {
        this.p.delete(m.id)
        m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result)
      }
    })
  }
  send(m, p = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method: m, params: p }))
    return new Promise((res, rej) => this.p.set(id, { resolve: res, reject: rej }))
  }
  async eval(x) {
    const r = await this.send('Runtime.evaluate', {
      expression: x,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }
}

/**
 * Park the player at `t` and strip the scene down to the page.
 *
 * Verbatim from `journal-tilt.mjs`, which took it from `clip-fit.mjs`, where
 * each line was paid for: seek the story first and let it settle, THEN pin the
 * video, because the story's own seek moves the video too and the two race;
 * pause the idle drift and clear its transform, or a slow sine is sitting on
 * top of every measurement; hide the UI and the flying objects, which are not
 * part of the page and would vote in the registration.
 */
export const PARK = t => `(async () => {
  const s = window.__story, v = s.video
  s.seek(${t})
  await new Promise(r => setTimeout(r, 900))
  v.pause(); s.tl.pause()
  v.currentTime = ${t}
  await new Promise(r => {
    if (Math.abs(v.currentTime - ${t}) < 0.02) return r()
    v.addEventListener('seeked', r, { once: true }); setTimeout(r, 1500)
  })
  s.tl.seek(${t}, false)
  s.applySegment?.(${t})
  if (s.hoverTl) s.hoverTl.pause()
  const hv = document.querySelector('.journal-hover'); if (hv) hv.style.transform = 'none'
  const ui = document.querySelector('.stage__ui'); if (ui) ui.style.display = 'none'
  const fl = document.querySelector('.fly-layer'); if (fl) fl.style.visibility = 'hidden'
  return { t: s.tl.time() }
})()`

/**
 * Lean the page, and say how near the camera is while doing it.
 *
 * `rotationX`/`rotationY` go on `.journal-box`, which is where the page turn
 * writes them too — so a candidate angle REPLACES whatever lean the slide
 * ships, and the number that comes back is the page's absolute lean, not a
 * correction to ours. `--persp` lives on `.stage-3d` and ships at 1800 design
 * px: a long lens, under which ten degrees of lean barely bends the rectangle.
 * If the clip's camera is nearer, no angle under ours can reproduce its
 * trapezium, which is why the strength is a parameter and not a constant.
 */
export const TILT = (rx, ry, persp) => `(() => {
  const g = (window.__story && window.__story.gsap) || window.gsap
  const box = document.querySelector('.journal-box')
  if (!box) return false
  const st = document.querySelector('.stage-3d') || document.querySelector('.stage3d')
  if (st && ${persp}) st.style.setProperty('--persp', String(${persp}))
  g.set(box, { rotationX: ${rx}, rotationY: ${ry} })
  return true
})()`

/** The front face's box on the design canvas, for the mask and the pivot. */
export const QUAD = `(() => {
  const face = document.querySelector('.jface--front')
  const pos = document.querySelector('.journal-pos')
  if (!face || getComputedStyle(pos).visibility === 'hidden') return null
  const s3d = document.querySelector('.stage3d') || document.querySelector('.stage')
  const sr = s3d.getBoundingClientRect()
  const r = face.getBoundingClientRect()
  const k = ${W} / sr.width, kk = ${H} / sr.height
  const quad = [
    [(r.left - sr.left) * k, (r.top - sr.top) * kk],
    [(r.right - sr.left) * k, (r.top - sr.top) * kk],
    [(r.right - sr.left) * k, (r.bottom - sr.top) * kk],
    [(r.left - sr.left) * k, (r.bottom - sr.top) * kk],
  ]
  return { quad, centre: [((r.left + r.right) / 2 - sr.left) * k, ((r.top + r.bottom) / 2 - sr.top) * kk] }
})()`

/**
 * The page's ARTWORK box, in canvas px — the window clip-fit fits through.
 *
 * ⚠️ THIS IS THE DIFFERENCE THAT MATTERS, and `journal-tilt.mjs` does not have
 * it. Its mask is `pageMask` over the axis-aligned bounding box of the front
 * face; on a slide where the page is turned twenty degrees in plane, that box
 * is nearly half again as large as the page and most of the extra is room and
 * bloom. clip-fit stopped fitting through the face for exactly that reason and
 * fits through the largest image on the page instead.
 *
 * Verbatim from clip-fit's ART, including the seventh-of-the-face floor: a
 * window smaller than that is a detail, and a detail is where a register finds
 * coincidences.
 */
export const ART = `(() => {
  const face = document.querySelector('.jface--front')
  if (!face) return null
  const dpr = 2
  const f = face.getBoundingClientRect()
  const fx0 = f.left * dpr, fy0 = f.top * dpr, fx1 = f.right * dpr, fy1 = f.bottom * dpr
  let best = null
  for (const im of face.querySelectorAll('img')) {
    const st = getComputedStyle(im)
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.2) continue
    const r = im.getBoundingClientRect()
    const x0 = Math.max(r.left * dpr, fx0), y0 = Math.max(r.top * dpr, fy0)
    const x1 = Math.min(r.right * dpr, fx1), y1 = Math.min(r.bottom * dpr, fy1)
    if (x1 - x0 < 120 || y1 - y0 < 120) continue
    const a = (x1 - x0) * (y1 - y0)
    if (!best || a > best.a) best = { a, box: [x0, y0, x1 - x0, y1 - y0] }
  }
  if (!best || best.a < (fx1 - fx0) * (fy1 - fy0) / 7) return null
  return best.box
})()`

const READY = `(async () => {
  for (let i = 0; i < 240; i++) {
    const s = window.__story
    if (s && s.tl && s.video && s.tl.duration() > 10) return true
    await new Promise(r => setTimeout(r, 250))
  }
  return false
})()`

/** Boot a headless Chrome on its own profile and port, and park it on the story. */
/**
 * ⚠️ 540x960 AT dpr 2, NOT 420x747. The screenshot is then 1080x1920 device px,
 * which IS the design canvas, and no rescale stands between the browser and the
 * gradient field. `journal-tilt.mjs` shoots 420x747 and ffmpeg stretches its
 * 840x1494 up by 29 % before the Sobel runs — softening, on both axes, exactly
 * the edges the whole measurement is made of. clip-fit has always shot 540x960;
 * the lean tool was copied from it and this one line was not carried over.
 */
export async function openStage({ port, profile, origin, query = '', vw = 540, vh = 960 }) {
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=/tmp/${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  process.on('exit', () => {
    try {
      chrome.kill()
    } catch {}
  })
  let url = null
  for (let i = 0; i < 80 && !url; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      const p = (await r.json()).find(t => t.type === 'page')
      if (p?.webSocketDebuggerUrl) url = p.webSocketDebuggerUrl
    } catch {}
    if (!url) await sleep(250)
  }
  if (!url) throw new Error('chrome devtools endpoint never came up')
  const ws = new WebSocket(url)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.send('Page.navigate', { url: `${origin}/index.html${query}` })
  await sleep(2500)
  if (!(await cdp.eval(READY))) throw new Error('story never became ready')
  return { cdp, ws, chrome }
}

/** Lean the page and photograph it. Returns the picture's own quad with it. */
export async function shoot(cdp, rx, ry, persp, png) {
  await cdp.eval(TILT(rx, ry, persp))
  await sleep(45)
  const geo = await cdp.eval(QUAD)
  if (!geo) return null
  const art = await cdp.eval(ART)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(png, Buffer.from(shot.data, 'base64'))
  return { geo: { ...geo, art }, png }
}

// ===========================================================================
// THE SCORE
// ===========================================================================

export const REG = { sRange: [0.9, 1.12], rRange: [-6, 6], dSpan: 90 }
const DOWN = [1, 2, 4, 8]

/**
 * The same registration, told where to start and which levels to bother with.
 *
 * `register` finds a page it knows nothing about: a scale ladder at 1/8 size,
 * then a polish down all four levels. Six of the eight seconds a candidate
 * costs are spent in the two finest levels, where the mask holds two hundred
 * thousand points and the descent visits it a couple of thousand times. That
 * price buys the ability to find a page that could be anywhere — and here it
 * cannot be anywhere: between one candidate angle and the next the page moves
 * a few pixels, and between one quarter-second of the story and the next it
 * moves a few more, because its position is already fitted to the clip in
 * JOURNAL_PATH. So the full search runs ONCE per parking spot and every
 * candidate walks from its answer.
 *
 * ⚠️ WHICH LEVELS IS A MEASURED CHOICE, NOT A TASTE. `tilt-selftest --curve`
 * prints this against the full search over a whole curve; levels 2 and 1 were
 * adopted because the peak did not move (both at -7.5 deg on a planted -7.5),
 * and the run went from 8.5 s a candidate to 3.
 */
export function registerSeeded(Ap, Bp, Mp, pivot, seed, levels, strides) {
  let best = seed
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i]
    const A = Ap[l],
      B = Bp[l],
      kk = 1 / DOWN[l]
    const pts = points(Mp[l], A.w, A.h, strides[i] || 1)
    const steps = [(0.006 * DOWN[l]) / 2, 1 / kk, (0.5 * DOWN[l]) / 2]
    best = descend(A, B, pts, [pivot[0] * kk, pivot[1] * kk], kk, best, steps, REG.sRange, REG.rRange, 4) // prettier-ignore
  }
  return best
}

/**
 * A scorer bound to one target picture and one parking spot.
 *
 * `flat` is our page at zero lean, photographed at this same instant. It does
 * two jobs: its quad picks the region the target's quantile is taken over — so
 * the target's edge field is built without any knowledge of the angle being
 * hunted — and its full registration is the seed every candidate starts from.
 * Seeding from the first candidate instead would be a bug worth naming: the
 * first candidate may be fifteen degrees out, and a local descent started from
 * a bad alignment stays in it.
 */
export function makeScorer(rgbTarget, flat, opt = {}) {
  const levels = opt.levels || null
  const strides = opt.strides || []
  const faithful = !levels
  // The art window when the page has one, the whole face when it does not —
  // the same fallback clip-fit makes, and for the same reason.
  const useArt = opt.window !== 'face' && !!flat.geo.art
  const maskOf = geo => {
    if (!useArt || !geo.art) return pageMask(geo.quad)
    const [x, y, w, h] = geo.art
    return boxMask(x, y, w, h)
  }
  const reachOf = geo => {
    if (!useArt || !geo.art) return reachMask(geo.quad, geo.centre, 2.0)
    const [x, y, w, h] = geo.art
    return boxMask(x - w / 2, y - h / 2, w * 2, h * 2)
  }
  const reach = reachOf(flat.geo)
  const cachedB = opt.cacheTarget === false ? null : pyramid(rgbTarget, KEEP, reach)
  let seed = null
  if (!faithful) {
    const mask = maskOf(flat.geo)
    seed = register(
      pyramid(rgbOfPng(flat.png), KEEP, mask),
      cachedB || pyramid(rgbTarget, KEEP, reach),
      maskPyramid(mask),
      flat.geo.centre,
      REG,
    )
  }
  const f = (rgbA, geo) => {
    const mask = maskOf(geo)
    const Mp = maskPyramid(mask)
    const Ap = pyramid(rgbA, KEEP, mask)
    const Bp = cachedB || pyramid(rgbTarget, KEEP, reachOf(geo))
    if (faithful) return register(Ap, Bp, Mp, geo.centre, REG)
    return registerSeeded(Ap, Bp, Mp, geo.centre, { ...seed }, levels, strides)
  }
  f.seed = seed
  f.window = useArt ? 'art' : 'face'
  return f
}

/** One candidate, end to end. */
export async function probe(cdp, scorer, rx, ry, persp, png) {
  const s = await shoot(cdp, rx, ry, persp, png)
  if (!s) return null
  const r = scorer(rgbOfPng(s.png), s.geo)
  return { v: r.v, rx, ry }
}

/**
 * Find the lean: a cross, then a shrinking walk.
 *
 * rotationY is swept first and on its own, because it is the axis the page turn
 * drives and the one a lean actually lives on; rotationX is then swept at the
 * winner. A full grid costs eighty one renders to answer what a cross answers
 * in eighteen, and at three seconds a render that difference is the whole run.
 * The walk is what makes the answer finer than the grid — the rungs are three
 * to four degrees apart, so a sweep alone can never speak to a degree.
 */
export async function findLean(cdp, scorer, persp, opt = {}) {
  const grid = opt.grid || [-14, -10, -6, -3, 0, 3, 6, 10, 14]
  const png = opt.png || '/tmp/.tiltprobe.png'
  const steps = opt.steps || [2, 1, 0.5, 0.25]
  let best = opt.seedAngle ? await probe(cdp, scorer, opt.seedAngle.rx, opt.seedAngle.ry, persp, png) : null // prettier-ignore
  let probes = best ? 1 : 0
  if (!opt.seedAngle) {
    for (const ry of grid) {
      const r = await probe(cdp, scorer, 0, ry, persp, png)
      probes++
      if (r && (!best || r.v > best.v)) best = r
    }
    if (!best) return null
    for (const rx of grid) {
      if (rx === 0) continue
      const r = await probe(cdp, scorer, rx, best.ry, persp, png)
      probes++
      if (r && r.v > best.v) best = r
    }
  }
  if (!best) return null
  const coarse = { ...best }
  for (const step of steps) {
    for (let round = 0; round < 4; round++) {
      let moved = false
      for (const drx of [-step, 0, step]) {
        for (const dry of [-step, 0, step]) {
          if (!drx && !dry) continue
          const r = await probe(cdp, scorer, +(best.rx + drx).toFixed(3), +(best.ry + dry).toFixed(3), persp, png) // prettier-ignore
          probes++
          if (r && r.v > best.v) {
            best = r
            moved = true
          }
        }
      }
      if (!moved) break
    }
  }
  return { ...best, coarse, probes }
}
