#!/usr/bin/env node
/**
 * DOES THE CLIP'S PAGE LEAN AWAY FROM US, AND BY HOW MUCH?
 *
 *   node scripts/journal-tilt.mjs --slide 16        one slide
 *   node scripts/journal-tilt.mjs --all             every slide
 *   node scripts/journal-tilt.mjs --slide 16 --fine finer grid
 *
 * WHY THIS EXISTS. `journalPath` sets four things on a slide - centre x, centre
 * y, rotationZ and scale - and nothing else. Between page turns our page faces
 * the camera dead on: rotationX and rotationY are both zero, by construction,
 * on every slide of the story. The owner saw on review.html that the clip's page
 * does NOT: its top right corner leans back, and in a 50/50 blend the two top
 * edges fan apart by ~140 px while the bottom left corners sit together.
 *
 * clip-fit.mjs cannot answer this. It searches a SIMILARITY - shift, scale,
 * in-plane rotation - and a lean in depth is not in that set, so its answer on
 * a leaning page is the nearest similarity, which is both wrong and confident
 * looking. On slide 16 it reported x1.000 and "NO CONFIDENT PEAK" in the same
 * breath, and the second half is the part that mattered.
 *
 * SO ASK THE PAGE ITSELF. Tilt OUR page by a candidate rotationX/rotationY,
 * render it, and score it against the clip's frame the same way clip-fit does -
 * on the gradient field, where the bloom cannot vote. Walk a grid, keep the best.
 * The answer is in degrees of the page's own transform, which is exactly what
 * JOURNAL_PATH would have to carry to reproduce it.
 *
 * The flying objects and the UI are hidden, and the backdrop is left alone: it
 * is the same room in both pictures and it anchors the registration.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { W, H, pyramid, maskPyramid, register, quadMask, pageMask, reachMask } from './lib/gradfit.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const CLIP = `${ROOT}_refs/DP-15152 - preview.mp4`
const OUT = process.env.TILT_OUT || `${ROOT}_refs/tilt`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.TILT_PORT || 9401)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const argv = process.argv.slice(2)
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1] }
const FINE = argv.includes('--fine')
const KEEP = Number(process.env.TILT_KEEP || 0.14)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ff = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 29 })
const rgbOfVideo = (f, t) =>
  ff(['-ss', String(t), '-i', f, '-frames:v', '1', '-vf', `scale=${W}:${H}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

const QUERY = process.env.FIT_QUERY || ''

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=/tmp/tilt-profile', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map()
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data), q = this.p.get(m.id)
      if (q) { this.p.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result) }
    })
  }
  send(m, p = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method: m, params: p }))
    return new Promise((res, rej) => this.p.set(id, { resolve: res, reject: rej }))
  }
  async eval(x) {
    const r = await this.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
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

/** Park exactly the way clip-fit parks - the traps there cost a session each. */
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

/**
 * Lean the page, and set how STRONG the camera's perspective is while doing it.
 *
 * The lean alone was not enough and the reason is geometric: how much a given
 * lean squashes one edge against the other depends entirely on how near the
 * camera is. `.stage-3d` carries `perspective: --persp` and ships at 1800 design
 * px, which is a long lens - a 10 deg lean under it barely bends the rectangle.
 * If the clip was rendered with the camera nearer, no angle under OUR camera can
 * reproduce its trapezium, and searching angles alone will keep answering "flat
 * is as good", which is exactly what it answered.
 */
const TILT = (rx, ry, persp) => `(() => {
  const g = (window.__story && window.__story.gsap) || window.gsap
  const box = document.querySelector('.journal-box')
  if (!box) return false
  const st = document.querySelector('.stage-3d') || document.querySelector('.stage3d')
  if (st && ${persp}) st.style.setProperty('--persp', String(${persp}))
  g.set(box, { rotationX: ${rx}, rotationY: ${ry} })
  return true
})()`

/** The front face's quad, for the mask - same call clip-fit uses. */
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

function scoreAt(rgbA, rgbB, geo) {
  const mask = pageMask(geo.quad)
  const Mp = maskPyramid(mask)
  const Ap = pyramid(rgbA, KEEP, mask)
  const Bp = pyramid(rgbB, KEEP, reachMask(geo.quad, geo.centre, 2.0))
  // a NARROW search: we are asking whether the lean helps, not re-finding the page
  const best = register(Ap, Bp, Mp, geo.centre, { sRange: [0.9, 1.12], rRange: [-6, 6], dSpan: 90 })
  return best
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const src = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
  const SLIDES = [...src.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)]
    .map(m => ({ frame: +m[1], at: +m[2], page: m[3] }))
  const want = flag('--slide')
  const list = argv.includes('--all') ? SLIDES : SLIDES.filter(s => s.frame === Number(want))
  if (!list.length) { console.error('no such slide'); process.exit(1) }

  const ws = new WebSocket(await findTarget())
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 420, height: 747, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html${QUERY}` })
  await sleep(2500)
  if (!(await cdp.eval(READY))) throw new Error('story never became ready')

  // The neighbourhood is known from slide 16 (rotX -10, rotY -3, persp 700), so
  // the sweep no longer has to cover the whole circle - it has to say, per
  // slide, how much lean that slide carries and in which direction.
  const grid = FINE
    ? [-16, -12, -9, -6, -4, -2, 0, 2, 4, 6, 9, 12, 16]
    : (process.env.TILT_GRID || '-14,-10,-6,-3,0,3,6,10,14').split(',').map(Number)
  // 1800 is what ships. Nearer cameras bend the page more for the same angle.
  const PERSPS = (process.env.TILT_PERSPS || '1800,1200,800,550').split(',').map(Number)
  const RXS = (process.env.TILT_RX || grid.join(',')).split(',').map(Number)

  console.log('slide  page              best rotX  best rotY  persp    score  flat     лучше на')
  const out = []
  for (const sl of list) {
    // a second into the slide, where the page is settled and the turn is over
    const t = +(sl.at + 1.6).toFixed(2)
    await cdp.eval(PARK(t))
    const rgbB = rgbOfVideo(CLIP, t)
    // WHAT WE SHIP TODAY, measured first, so the lean has something to beat.
    // A best-of-81 always finds a winner; the only question worth answering is
    // whether that winner is better than zero by more than the noise.
    let flat = null
    let best = null
    for (const persp of PERSPS) {
    // THE LEAN THAT MATTERS IS AROUND THE VERTICAL, and that is not a guess about
    // geometry - it is what the mechanism does. The page turn spins the journal
    // around its vertical axis and lands it back at exactly zero; if the clip
    // lands it short of zero, the page stays leaning, which is the trapezium.
    // TILT_RX pins the other axis so a sweep costs eight renders, not sixty four.
    for (const rx of RXS) {
      for (const ry of grid) {
        await cdp.eval(TILT(rx, ry, persp))
        await sleep(45)
        const geo = await cdp.eval(QUAD)
        if (!geo) continue
        const png = `${OUT}/.t.png`
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(png, Buffer.from(shot.data, 'base64'))
        const r = scoreAt(rgbOfPng(png), rgbB, geo)
        // The baseline is no-lean at the FIRST perspective in the list, so a run
        // that sweeps only the near camera still has something to compare with.
        if (rx === 0 && ry === 0 && persp === PERSPS[0]) flat = { v: r.v, s: r.s, dx: r.dx, dy: r.dy }
        if (!best || r.v > best.v) best = { v: r.v, rx, ry, persp, s: r.s, dx: r.dx, dy: r.dy }
      }
    }
    }
    await cdp.eval(TILT(0, 0, 1800))
    if (!best) { console.log(String(sl.frame).padStart(5), sl.page.padEnd(20), '  no read'); continue }
    out.push({ frame: sl.frame, page: sl.page, t, ...best, flat: flat && flat.v })
    const gain = flat ? best.v - flat.v : null
    // 10 % better than flat, and at least 3 deg of lean, before it is called a lean
    const leans = gain !== null && gain / Math.max(flat.v, 1e-6) > 0.10 &&
      (Math.abs(best.rx) >= 3 || Math.abs(best.ry) >= 3)
    console.log(String(sl.frame).padStart(5), sl.page.padEnd(20),
      best.rx.toFixed(0).padStart(9) + '°', best.ry.toFixed(0).padStart(10) + '°', String(best.persp).padStart(7),
      best.v.toFixed(3).padStart(8), (flat ? flat.v.toFixed(3) : '  -  ').padStart(9),
      (gain !== null ? ((gain / Math.max(flat.v, 1e-6)) * 100).toFixed(0) + '%' : '-').padStart(8),
      leans ? '  <<< LEANS' : '   flat is as good')
  }
  writeFileSync(`${OUT}/tilt.json`, JSON.stringify(out, null, 1))
  console.log(`\n-> ${OUT}/tilt.json`)
  ws.close(); process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
