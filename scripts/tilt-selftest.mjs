#!/usr/bin/env node
/**
 * DOES THE LEAN MEASURER ACTUALLY MEASURE A LEAN? — the gate AT-1 starts with.
 *
 *   node scripts/tilt-selftest.mjs                 the standard battery
 *   node scripts/tilt-selftest.mjs --curve         score vs angle, one slide
 *   node scripts/tilt-selftest.mjs --slide 20      one slide only
 *
 * WHY THIS EXISTS. `journal-tilt.mjs` answers "how far does the clip's page
 * lean" by tilting OUR page through a grid and keeping whichever candidate
 * scores best against the clip's frame. A best-of-81 always has a winner, so
 * the number it prints is a number whether or not the method can see a lean at
 * all. Every other measurement in this project had to pass the same test before
 * its numbers were allowed into a table: the plane angle was checked against
 * five known renders (worst 0.34 deg), the flying objects against a known
 * offset (0.001), clip-fit shifts a slide and has to find it again.
 *
 * SO PLANT A KNOWN ANSWER. Lean our own page by an angle we chose, photograph
 * it, and hand that photograph to the search in place of the clip's frame. The
 * search does not know what we planted. If it comes back with our angle, the
 * method measures; if it comes back with something else, or with a score that
 * is as good three degrees away as it is at the truth, then the eight numbers
 * in SLIDE_LEAN are best-of-81 winners and nothing more.
 *
 * THE ANGLES ARE PLANTED OFF THE GRID ON PURPOSE. -7.5 deg is not a rung of the
 * production sweep (-14,-10,-6,-3,0,3,6,10,14), so a run that snaps to the
 * nearest rung cannot pass by luck: it has to refine below the rung spacing,
 * which is the only way "accurate to about a degree" can mean anything.
 *
 * TWO WORLDS, BOTH REPORTED.
 *   clean  the planted photograph exactly as the browser rendered it. This
 *          asks one question only: does the score surface peak at the truth,
 *          and can the search walk to it. At the answer the two pictures are
 *          identical, so a failure here is a failure of the search, not of the
 *          optics.
 *   codec  the same photograph pushed through h264 at the clip's own bitrate
 *          and 4:2:0 chroma, which is the one degradation we KNOW sits between
 *          us and the reference. A method that only works on its own pixels is
 *          no use against an mp4.
 *
 * WHAT IT CANNOT PROVE. The clip was rendered by other software, with its own
 * bloom, its own page artwork and its own camera. This test bounds the error
 * the METHOD adds; it cannot bound the error that difference adds. That is what
 * the margin over flat, and the eye on review.html, are for.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import {
  W,
  H,
  pyramid,
  maskPyramid,
  register,
  descend,
  points,
  pageMask,
  reachMask,
} from './lib/gradfit.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = process.env.TILT_OUT || `${ROOT}_refs/tilt`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.TILT_PORT || 9402)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const KEEP = Number(process.env.TILT_KEEP || 0.14)
const argv = process.argv.slice(2)
const flag = n => {
  const i = argv.indexOf(n)
  return i < 0 ? null : argv[i + 1]
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ff = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 29 })
const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/** The clip is h264 4:2:0 at 15.7 Mbit/s. Put our own frame through the same. */
function codecRoundTrip(png) {
  const mp4 = `${OUT}/.codec.mp4`
  rmSync(mp4, { force: true })
  ff([
    '-loop', '1', '-framerate', '30', '-i', png,
    '-t', '1', '-c:v', 'libx264', '-b:v', '15700k', '-pix_fmt', 'yuv420p',
    '-preset', 'medium', mp4,
  ]) // prettier-ignore
  return ff([
    '-ss', '0.5', '-i', mp4, '-frames:v', '1',
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]) // prettier-ignore
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=/tmp/tilt-selftest-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {}
})

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
async function findTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const p = (await r.json()).find(t => t.type === 'page')
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome devtools endpoint never came up')
}

/** Verbatim from journal-tilt.mjs — the traps in it cost a session each. */
const PARK = t => `(async () => {
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

const TILT = (rx, ry, persp) => `(() => {
  const g = (window.__story && window.__story.gsap) || window.gsap
  const box = document.querySelector('.journal-box')
  if (!box) return false
  const st = document.querySelector('.stage-3d') || document.querySelector('.stage3d')
  if (st && ${persp}) st.style.setProperty('--persp', String(${persp}))
  g.set(box, { rotationX: ${rx}, rotationY: ${ry} })
  return true
})()`

const QUAD = `(() => {
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

const READY = `(async () => {
  for (let i = 0; i < 240; i++) {
    const s = window.__story
    if (s && s.tl && s.video && s.tl.duration() > 10) return true
    await new Promise(r => setTimeout(r, 250))
  }
  return false
})()`

const REG = { sRange: [0.9, 1.12], rRange: [-6, 6], dSpan: 90 }
const DOWN = [1, 2, 4, 8]

/**
 * The same registration, but told where to start and which levels to bother with.
 *
 * WHY IT IS NEEDED AT ALL. `register` finds a page it knows nothing about: it
 * sweeps a scale ladder at 1/8 size and then polishes the winner down all four
 * levels. Six seconds of the eight a candidate costs are spent in the two
 * finest levels, where the mask holds two hundred thousand points and the
 * descent visits it a couple of thousand times. That price buys the ability to
 * find a page that could be anywhere — and here it cannot be anywhere. Between
 * one candidate angle and the next the page moves by a few pixels, and between
 * one quarter second of the story and the next it moves by a few more, because
 * its position is already fitted to the clip in JOURNAL_PATH.
 *
 * So: run the full search ONCE per parking spot, then start every candidate
 * from that answer and let it walk. Which levels to walk is a measured choice,
 * not a guess — `--compare` prints this against the full search over a whole
 * curve, and the levels are only used because the peak did not move.
 */
function registerSeeded(Ap, Bp, Mp, pivot, seed, levels, strides) {
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
 * Score one candidate against the target, exactly as journal-tilt.mjs does.
 *
 * The one liberty taken is caching: the target's edge pyramid is rebuilt on
 * every candidate in the production tool, and it costs a full second of the
 * ten. It depends on the candidate only through `reachMask` — the quad blown up
 * two-fold about its own centre, used to pick a quantile — and a few degrees of
 * lean move that region by a fraction of its own size. `TILT_FAITHFUL=1` turns
 * the cache off, and the two were compared point for point before it was used.
 */
const LEVELS_ENV = (process.env.TILT_LEVELS || '').trim()
const STRIDES_ENV = (process.env.TILT_STRIDES || '').trim()

function makeScorer(rgbTarget, flat) {
  const cached =
    process.env.TILT_FAITHFUL === '1'
      ? null
      : pyramid(rgbTarget, KEEP, reachMask(flat.geo.quad, flat.geo.centre, 2.0))
  const levels = LEVELS_ENV ? LEVELS_ENV.split(',').map(Number) : null
  const strides = STRIDES_ENV ? STRIDES_ENV.split(',').map(Number) : []
  // The seed is the FULL search run once, on the square page. Not on whichever
  // candidate happened to come first: that one may be fifteen degrees out, and
  // a local descent started from a bad alignment stays in it.
  let seed = null
  if (levels) {
    const mask = pageMask(flat.geo.quad)
    seed = register(
      pyramid(rgbOfPng(flat.png), KEEP, mask),
      cached || pyramid(rgbTarget, KEEP, reachMask(flat.geo.quad, flat.geo.centre, 2.0)),
      maskPyramid(mask),
      flat.geo.centre,
      REG,
    )
  }
  return (rgbA, geo) => {
    const mask = pageMask(geo.quad)
    const Mp = maskPyramid(mask)
    const Ap = pyramid(rgbA, KEEP, mask)
    const Bp = cached || pyramid(rgbTarget, KEEP, reachMask(geo.quad, geo.centre, 2.0))
    if (!levels) return register(Ap, Bp, Mp, geo.centre, REG)
    return registerSeeded(Ap, Bp, Mp, geo.centre, { ...seed }, levels, strides)
  }
}

/** Lean the page, photograph it, hand it to the scorer. */
async function shoot(cdp, rx, ry, persp, file) {
  await cdp.eval(TILT(rx, ry, persp))
  await sleep(45)
  const geo = await cdp.eval(QUAD)
  if (!geo) return null
  const png = `${OUT}/${file}`
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(png, Buffer.from(shot.data, 'base64'))
  return { geo, png }
}

async function probe(cdp, scorer, rx, ry, persp) {
  const s = await shoot(cdp, rx, ry, persp, '.s.png')
  if (!s) return null
  const r = scorer(rgbOfPng(s.png), s.geo)
  return { v: r.v, rx, ry }
}

/**
 * Coarse grid, then walk downhill with a shrinking step.
 *
 * The production sweep stops at the grid, and a grid rung is 3-4 deg wide, so
 * on its own it can never answer to a degree. The refinement is the whole
 * difference between "which rung wins" and "what is the angle", and it is also
 * what makes the planted-angle test honest: the truth sits between rungs.
 */
async function search(cdp, scorer, persp, grid, log) {
  let best = null
  let probes = 0
  // rotationY first, on its own, because it is the axis the page turn drives
  // and the one a lean actually lives on; then rotationX at the winner. A full
  // 9x9 costs eighty one renders to answer a question a cross answers in
  // eighteen, and every render here is ten seconds.
  for (const ry of grid) {
    const r = await probe(cdp, scorer, 0, ry, persp)
    probes++
    if (r && (!best || r.v > best.v)) best = r
  }
  if (!best) return null
  for (const rx of grid) {
    if (rx === 0) continue
    const r = await probe(cdp, scorer, rx, best.ry, persp)
    probes++
    if (r && r.v > best.v) best = r
  }
  const coarse = { ...best }
  for (const step of [2, 1, 0.5, 0.25]) {
    for (let round = 0; round < 4; round++) {
      let moved = false
      for (const drx of [-step, 0, step]) {
        for (const dry of [-step, 0, step]) {
          if (!drx && !dry) continue
          const r = await probe(cdp, scorer, +(best.rx + drx).toFixed(3), +(best.ry + dry).toFixed(3), persp) // prettier-ignore
          probes++
          if (r && r.v > best.v) {
            best = r
            moved = true
          }
        }
      }
      if (!moved) break
    }
    if (log) log(`      step ${step}° -> rx ${best.rx} ry ${best.ry} score ${best.v.toFixed(4)}`)
  }
  return { ...best, coarse, probes }
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const src = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
  const SLIDES = [...src.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)].map(
    m => ({ frame: +m[1], at: +m[2], page: m[3] }),
  )
  const want = flag('--slide')
  const pick = (process.env.TILT_SLIDES || '8,18,20,23').split(',').map(Number)
  const list = want
    ? SLIDES.filter(s => s.frame === Number(want))
    : SLIDES.filter(s => pick.includes(s.frame))
  if (!list.length) throw new Error('no such slide')

  const ws = new WebSocket(await findTarget())
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 747,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html` })
  await sleep(2500)
  if (!(await cdp.eval(READY))) throw new Error('story never became ready')

  const PERSPS = (process.env.TILT_PERSPS || '1800,700').split(',').map(Number)
  const grid = (process.env.TILT_GRID || '-14,-10,-6,-3,0,3,6,10,14').split(',').map(Number)
  // Planted off the grid on purpose: none of these is a rung.
  const PLANT = (process.env.TILT_PLANT || '0/-7.5,0/11.5,-4.5/0,-5.5/7.5').split(',').map(p => {
    const [rx, ry] = p.split('/').map(Number)
    return { rx, ry }
  })

  if (argv.includes('--curve')) return curve(cdp, list[0], PERSPS)

  console.log('HOW BADLY DOES THE METHOD ITSELF MISS A KNOWN ANGLE?')
  console.log('(planted angles are deliberately between the sweep’s rungs)\n')
  console.log(
    'slide page              persp world  plant rX  plant rY   got rX   got rY   err rX   err rY    score',
  )
  const rows = []
  for (const sl of list) {
    const t = +(sl.at + 1.6).toFixed(2)
    await cdp.eval(PARK(t))
    for (const persp of PERSPS) {
      for (const pl of PLANT) {
        // plant the truth, photograph it, then hand the photograph to the search
        const truth = await shoot(cdp, pl.rx, pl.ry, persp, '.truth.png')
        const truthPng = truth.png
        // the reach region is taken off the FLAT page, so the target's pyramid
        // is built without any knowledge of the angle the search is hunting
        const flat = await shoot(cdp, 0, 0, persp, '.flat.png')
        const worlds = argv.includes('--clean-only')
          ? [['clean', rgbOfPng(truthPng)]]
          : [
              ['clean', rgbOfPng(truthPng)],
              ['codec', codecRoundTrip(truthPng)],
            ]
        for (const [world, rgbTarget] of worlds) {
          const r = await search(cdp, makeScorer(rgbTarget, flat), persp, grid, null)
          const erx = r ? r.rx - pl.rx : NaN
          const ery = r ? r.ry - pl.ry : NaN
          rows.push({ frame: sl.frame, page: sl.page, persp, world, plant: pl, got: r, erx, ery })
          console.log(
            String(sl.frame).padStart(5),
            sl.page.padEnd(18),
            String(persp).padStart(5),
            world.padEnd(6),
            pl.rx.toFixed(1).padStart(8) + '°',
            pl.ry.toFixed(1).padStart(8) + '°',
            (r ? r.rx.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? r.ry.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? erx.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? ery.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? r.v.toFixed(4) : '  -  ').padStart(8),
          )
        }
      }
    }
    await cdp.eval(TILT(0, 0, 1800))
  }
  writeFileSync(`${OUT}/selftest.json`, JSON.stringify(rows, null, 1))
  const ok = rows.filter(r => r.got && Math.abs(r.erx) <= 1 && Math.abs(r.ery) <= 1).length
  const worst = rows.reduce(
    (a, r) => Math.max(a, r.got ? Math.max(Math.abs(r.erx), Math.abs(r.ery)) : 99),
    0,
  )
  console.log(`\nwithin 1°: ${ok}/${rows.length}   worst miss: ${worst.toFixed(2)}°`)
  console.log(`-> ${OUT}/selftest.json`)
  ws.close()
  process.exit(0)
}

/**
 * How lonely is the winning angle? — the second half of the same question.
 *
 * A search that lands on the truth proves nothing if the score is just as good
 * five degrees away: that is a plateau, and on a real frame, where the pictures
 * differ for a dozen other reasons, the winner would be whichever way those
 * reasons happened to lean. So plant one angle and print the whole curve.
 */
async function curve(cdp, sl, PERSPS) {
  const t = +(sl.at + 1.6).toFixed(2)
  await cdp.eval(PARK(t))
  const plantRy = Number(process.env.TILT_PLANT_RY || -7.5)
  console.log(`score vs rotationY, slide ${sl.frame} ${sl.page} at t=${t}, planted ry=${plantRy}\n`)
  for (const persp of PERSPS) {
    const truth = await shoot(cdp, 0, plantRy, persp, '.truth.png')
    const flat = await shoot(cdp, 0, 0, persp, '.flat.png')
    const scorer = makeScorer(rgbOfPng(truth.png), flat)
    console.log(`  persp ${persp}`)
    const out = []
    for (let ry = plantRy - 10; ry <= plantRy + 10.001; ry += 1) {
      const r = await probe(cdp, scorer, 0, +ry.toFixed(2), persp)
      out.push({ ry: +ry.toFixed(2), v: r ? r.v : null })
      const bar = r ? '#'.repeat(Math.max(0, Math.round((r.v - 0.5) * 120))) : ''
      console.log(
        `    ry ${(+ry.toFixed(2)).toFixed(1).padStart(6)}°  ${r ? r.v.toFixed(4) : '  -  '}  ${bar}`,
      )
    }
    writeFileSync(`${OUT}/curve-${persp}.json`, JSON.stringify(out, null, 1))
  }
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
