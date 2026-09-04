#!/usr/bin/env node
/**
 * MEASURING OUR JOURNAL AGAINST THE CLIP'S, AS A NUMBER.
 *
 *   node scripts/clip-fit.mjs --selftest        prove the method first
 *   node scripts/clip-fit.mjs 7 8 10 14         by storyboard slide
 *   node scripts/clip-fit.mjs --t 3.93 4.08     by raw timecode
 *   node scripts/clip-fit.mjs --pair a.png b.png [--box x,y,w,h]
 *
 * WHY THIS EXISTS. Everything in this repo that tried to measure the journal in
 * `preview.mp4` measured its BLOOM instead, because the bloom is as big as the
 * journal and no intensity threshold separates them. Three methods were tried
 * and closed (extremes of the difference mask, a percentile of the column
 * profile, fitting the trapezoid ramps) — see _context/35-slide-audit.md. All
 * three lied plausibly, which is worse than failing.
 *
 * THE WAY OUT IS TO STOP MEASURING BRIGHTNESS. A bloom is smooth: it has almost
 * no gradient. The journal's cover border, its type and its art are steps: they
 * are almost all gradient. So this script throws the picture away and keeps only
 * the direction of its gradient, as a unit vector per pixel with everything
 * below an adaptive threshold zeroed. What is left is an edge field in which
 * the glow is invisible by construction — no threshold on the glow is ever
 * chosen, because the glow never enters the arithmetic.
 *
 * Two edge fields are then registered by cosine similarity over a similarity
 * transform (scale, translation, rotation), which is the same idea as the FIT
 * stage of scripts/fly-measure.mjs — that stage already matches a sprite to the
 * clip this way and has been trusted for 27 flights.
 *
 * WHAT IT ANSWERS. "By what per cent and by how many pixels does our journal
 * differ from the clip's": a size ratio ours/clip and the shift of our journal's
 * centre from the clip's, in design px on the 1080x1920 canvas.
 *
 * WHY IT CANNOT SILENTLY AGREE WITH ITSELF. The mask comes from OUR DOM, so the
 * template is our journal and nothing else; the clip frame is never touched by
 * anything derived from our build. And --selftest checks the estimator against
 * three answers known in advance before any of its numbers are used:
 *
 *   1. a synthetic warp of a real CLIP frame, glow and all, by a known amount;
 *   2. our render against the FIGMA storyboard frame, where the answer is known
 *      to be 1.000 / 0 px from exact geometry on both sides (0-2 design px,
 *      _context/35-slide-audit.md section 1);
 *   3. our render against ITSELF with the journal deliberately mis-scaled by a
 *      known factor, which is the only test that exercises the whole pipeline
 *      — park, screenshot, mask, register — end to end.
 *
 * WHAT IT IS NOT. It is not a verdict on page LAYOUT. The mask is the journal's
 * front face, so a heading that is too big inside a correctly-posed journal
 * moves this number only slightly. Layout is judged by blendNN.png.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import {
  W, H, pyramid, maskPyramid, register, margin, reachMask,
  quadMask, boxMask, pageMask, silhouetteBox,
} from './lib/gradfit.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const CLIP = `${ROOT}_refs/DP-15152 - preview.mp4`
const CLEAN = `${ROOT}_refs/DP-15152 - clean bg.mp4`
const SB = `${ROOT}_refs/storyboard`
const OUT = process.env.FIT_OUT || `${ROOT}_refs/fit`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.FIT_PORT || 9377)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ff = (a, stdin) => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30, input: stdin })

// ===========================================================================
// SOURCES
// ===========================================================================

/** One frame of a video, on the canvas grid. */
const rgbOfVideo = (file, t) =>
  ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/** One exact frame written to a PNG, for ffmpeg filters that want a file. */
const file2png = (src, n, out) => {
  ff(['-y', '-i', src, '-vf', `select='eq(n\\,${n})'`, '-vsync', '0', '-frames:v', '1', out])
  return out
}

/** One EXACT frame by number. `-ss` seeks by time and can land on a neighbour,
 *  which matters when a whole argument rests on frames 122 and 123. */
const frameExact = (file, n) =>
  ff(['-i', file, '-vf', `select='eq(n\\,${n})',scale=${W}:${H}`, '-vsync', '0',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/** A still, on the canvas grid. The storyboard renders arrive at 540x960. */
const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

// ===========================================================================
// THE BROWSER
// ===========================================================================

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map()
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data); const q = this.p.get(m.id)
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }
}

/**
 * Park the player at `t` and leave the scene measurable. Copied in spirit from
 * scripts/audit-slides.mjs, and for the same three reasons:
 *
 *   - seek through the PRODUCT (`__story.seek`), because that is what runs
 *     applySegment and therefore what makes the right page visible;
 *   - re-render with events (`tl.seek(t, false)`), because the cover -> page
 *     handover of --jw/--jh is a tl.call();
 *   - kill the idle drift by clearing the transform, NOT by parking it at time
 *     0 — every property in hover() is a fromTo from MINUS its amplitude, so
 *     time 0 is the drift's extreme and parking there shrinks the journal 2.3 %.
 *
 * The flying objects are hidden too: they are ours, they sit on top of the
 * journal, and a coin inside the mask is our own noise in our own template.
 */
const PARK = t => `(async () => {
  const s = window.__story, v = s.video
  s.seek(${t})
  await new Promise(r => setTimeout(r, 900))
  v.pause(); s.tl.pause()
  // AND NOW PUT THE VIDEO WHERE IT WAS ASKED TO BE. seek() hands control back to
  // a PLAYING video, so the 900 ms spent waiting for it to settle are 900 ms it
  // spends moving on: measured, tl.time() 4.0667 against video.currentTime
  // 4.9634. On a settled slide the room barely changes in a second and this
  // hides; during the entrance the room is being lit by the journal and it does
  // not. It cost an afternoon here — a backdrop a second late read as a magenta
  // wash over half the canvas, and the wash was blamed on our own spine glow,
  // which was then "measured" at thirty times the clip's.
  v.currentTime = ${t}
  await new Promise(r => {
    if (Math.abs(v.currentTime - ${t}) < 0.02) return r()
    v.addEventListener('seeked', r, { once: true })
    setTimeout(r, 1500)
  })
  s.tl.seek(${t}, false)
  // ...and the PAGE back too: the wait above let the sync loop advance it.
  s.applySegment?.(${t})
  if (s.hoverTl) s.hoverTl.pause()
  const hv = document.querySelector('.journal-hover')
  if (hv) hv.style.transform = 'none'
  const ui = document.querySelector('.stage__ui'); if (ui) ui.style.display = 'none'
  const fl = document.querySelector('.fly-layer'); if (fl) fl.style.visibility = 'hidden'
  return { t: s.tl.time() }
})()`

/**
 * The front face's four corners in design px, straight out of the browser's own
 * projection. getBoxQuads() walks the whole 3D chain including `perspective`,
 * so this is the real on-screen quad — an AABB would carry the room in its
 * corners on any rotated pose, and every pose here is rotated.
 */
const QUAD = `(() => {
  const face = document.querySelector('.jface--front')
  const pos = document.querySelector('.journal-pos')
  if (!face || getComputedStyle(pos).visibility === 'hidden') return null
  // FOUR ZERO-SIZE MARKERS AT THE CORNERS, read back with getBoundingClientRect.
  // getBoxQuads() would be the direct way and is not in this Chrome; a rect is
  // an AABB and would carry the room in its corners on a rotated pose, and every
  // pose here is rotated. A zero-size child has no extent to bound, so its rect
  // IS its projected point — and the browser does the perspective divide for us,
  // which is the part that cannot be reconstructed from the pose numbers alone.
  const mk = (l, t) => {
    const d = document.createElement('i')
    d.style.cssText = 'position:absolute;width:0;height:0;left:' + l + ';top:' + t + ';margin:0;padding:0'
    face.appendChild(d)
    return d
  }
  const ms = [mk('0','0'), mk('100%','0'), mk('100%','100%'), mk('0','100%')]
  const dpr = 2  // set by Emulation.setDeviceMetricsOverride; screenshot px = design px
  const quad = ms.map(d => { const r = d.getBoundingClientRect(); return [r.left * dpr, r.top * dpr] })
  ms.forEach(d => d.remove())
  const r = document.querySelector('.journal-box').getBoundingClientRect()
  // OUR pose, straight off the elements GSAP writes to. Reading it back rather
  // than looking it up in slides.js is the whole point: during the entrance the
  // pose is mid-tween and no table holds it.
  const g = (window.__story && window.__story.gsap) || window.gsap
  const num = (el, p) => { const v = g ? Number(g.getProperty(el, p)) : NaN; return Number.isFinite(v) ? v : 0 }
  const box = document.querySelector('.journal-box')
  const pose = {
    rot: num(box, 'rotationZ'), scale: num(box, 'scaleX'),
    rotX: num(box, 'rotationX'), rotY: num(box, 'rotationY'),
    cx: num(pos, 'xPercent'), cy: num(pos, 'yPercent'),
    persp: parseFloat(getComputedStyle(document.querySelector('.stage')).getPropertyValue('--persp')),
    jd: parseFloat(getComputedStyle(document.querySelector('.stage')).getPropertyValue('--jd')),
    face: [parseFloat(getComputedStyle(document.querySelector('.stage')).getPropertyValue('--jw')),
           parseFloat(getComputedStyle(document.querySelector('.stage')).getPropertyValue('--jh'))],
  }
  return { quad, box: { x: r.left * dpr, y: r.top * dpr, w: r.width * dpr, h: r.height * dpr },
           centre: [(quad[0][0] + quad[2][0]) / 2, (quad[0][1] + quad[2][1]) / 2], pose }
})()`

// ===========================================================================
// REPORTING
// ===========================================================================

/**
 * Turn the transform into the two numbers the question asks for.
 *
 * register() finds the map from OUR pixels to the CLIP's, so the clip's journal
 * is `s` times ours and its centre sits `d` away from ours. Reported the other
 * way round, as the audit reports everything: ours as a fraction of the clip,
 * and where ours sits relative to the clip's.
 */
const report = b => ({
  ratio: 1 / b.s,
  pct: (1 / b.s - 1) * 100,
  dx: -b.dx,
  dy: -b.dy,
  dist: Math.hypot(b.dx, b.dy),
  rot: -b.rot,
  v: b.v,
  cov: b.cov,
})

const fmtRow = r =>
  `x${r.ratio.toFixed(3)}`.padStart(8) +
  `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)} %`.padStart(9) +
  `${r.dx >= 0 ? '+' : ''}${r.dx.toFixed(0)}/${r.dy >= 0 ? '+' : ''}${r.dy.toFixed(0)}`.padStart(11) +
  `${r.rot >= 0 ? '+' : ''}${r.rot.toFixed(2)}`.padStart(8) +
  r.v.toFixed(3).padStart(8)

// ===========================================================================
// MAIN
// ===========================================================================

const argv = process.argv.slice(2)
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1] }
const KEEP = Number(process.env.FIT_KEEP || 0.14)
const SHRINK = Number(process.env.FIT_SHRINK || 12)

mkdirSync(OUT, { recursive: true })

/** Register two raw RGB buffers over a mask. Returns the reported numbers. */
function fitPair(rgbA, rgbB, mask, pivot, opt = {}) {
  const keep = opt.keep ?? KEEP
  const Mp = maskPyramid(mask)
  const Ap = pyramid(rgbA, keep, mask)
  // Both thresholds come from the same neighbourhood — see reachMask().
  const Bp = pyramid(rgbB, keep, opt.reach || mask)
  const best = register(Ap, Bp, Mp, pivot, opt)
  const rival = margin(Ap, Bp, Mp, pivot, best)
  return { ...report(best), rival, best }
}

/**
 * How wide a size difference the coarse ladder sweeps.
 *
 * The default 0.5..2.2 is right when nothing is known about the answer — the
 * entrance, where our journal and the clip's can differ by two. On a settled
 * slide it is 38 rungs of a full translation sweep to find something that has
 * never once been outside +/-2.5 %, and it dominates the run: 50 seconds a
 * sample, an hour and three quarters for the story. FIT_SRANGE narrows it. It
 * changes only how far the search LOOKS, never what it measures — and a run that
 * needs the wide ladder can still have it.
 */
const SRANGE = (process.env.FIT_SRANGE || '0.5,2.2').split(',').map(Number)

/** The answer for one pair of pictures. `geo` is what QUAD returned. */
function fitJournal(rgbA, rgbB, geo, opt = {}) {
  const piv = geo.centre
  return fitPair(rgbA, rgbB, pageMask(geo.quad), piv,
    { sRange: SRANGE, ...opt, reach: reachMask(geo.quad, piv, 2.0) })
}

const HEAD = '   ours/clip     size      shift(px)     rot   score  rival'
/** A fit whose peak barely beats its own neighbourhood is a coincidence. Say so
 *  in the row rather than leaving the reader to compare two columns. */
const shaky = r => r.v - r.rival < 0.15
const fmtOne = (tag, r) =>
  tag.padEnd(7) + fmtRow(r) + r.rival.toFixed(3).padStart(7) + (shaky(r) ? '   NO CONFIDENT PEAK' : '')

// ---------------------------------------------------------------- --pair
if (argv.includes('--pair')) {
  const i = argv.indexOf('--pair')
  const a = rgbOfPng(argv[i + 1]), b = rgbOfPng(argv[i + 2])
  const box = (flag('--box') || `${W * 0.15},${H * 0.2},${W * 0.7},${H * 0.6}`).split(',').map(Number)
  const mask = boxMask(...box)
  const piv = [box[0] + box[2] / 2, box[1] + box[3] / 2]
  const r = fitPair(a, b, mask, piv, { reach: boxMask(box[0] - box[2] / 2, box[1] - box[3] / 2, box[2] * 2, box[3] * 2) })
  console.log(HEAD)
  console.log(fmtOne('pair', r))
  process.exit(0)
}

// ---------------------------------------------------------------- browser up
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--user-data-dir=/tmp/clipfit-${PORT}`, 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

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

const ws = new WebSocket(await findTarget())
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
// 540x960 at dsf 2 -> a 1080x1920 screenshot, and --u is max(540/1080, 960/1920)
// = 0.5, so the canvas covers the viewport exactly and ONE SCREENSHOT PIXEL IS
// ONE DESIGN PIXEL. Every number below depends on that identity.
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 2, mobile: true })
// THE PAGE'S OWN NUMBERS ARE PART OF THE TEMPLATE. In dev an absent query
// parameter is filled from SAMPLE (params.js), so the digit tiles read 22257
// where the clip reads 257 — a five-tile block against a three-tile one, and
// the tiles are one of the strongest gradient features on the page. Pass the
// clip's own values with FIT_QUERY so the template and the reference carry the
// same text. It changes what is COMPARED, never how.
await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html${process.env.FIT_QUERY || ''}` })
await sleep(7000)

/**
 * Draw OUR journal's outline onto a picture — normally a frame of the clip.
 *
 * This is the instrument to reach for first, before any fit. Our quad comes
 * from the browser's own projection, so it is exact; laying it over the clip
 * asks the only question that matters — does our journal sit where the clip's
 * sits — and answers it without a threshold, a template or a search. It is also
 * the check that catches the failure mode a fit cannot report: our cover's
 * artwork is not laid out quite like the clip's, so the interior fit can be
 * dragged off by the type while the journal itself is in the right place.
 */
function drawQuad(rgb, quad, file, rgbColour = [255, 240, 0]) {
  const b = Buffer.from(rgb)
  const put = (x, y) => {
    x = Math.round(x); y = Math.round(y)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        const q = (yy * W + xx) * 3
        b[q] = rgbColour[0]; b[q + 1] = rgbColour[1]; b[q + 2] = rgbColour[2]
      }
  }
  for (let i = 0; i < quad.length; i++) {
    const [ax, ay] = quad[i], [bx, by] = quad[(i + 1) % quad.length]
    const n = Math.ceil(Math.hypot(bx - ax, by - ay))
    for (let k = 0; k <= n; k++) put(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n)
  }
  ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-frames:v', '1', file], b)
}

/** Paint a mask over a copy of the picture, so a mask bug is visible rather
 *  than merely suspected. */
function dumpMask(rgb, mask, file) {
  const b = Buffer.from(rgb)
  for (let p = 0; p < W * H; p++)
    if (mask[p]) { b[p * 3] = 255; b[p * 3 + 1] = (b[p * 3 + 1] * 0.3) | 0; b[p * 3 + 2] = 255 }
  ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-frames:v', '1', file], b)
}

async function ourFrame(t, file) {
  await cdp.eval(PARK(t))
  await sleep(320)
  const g = await cdp.eval(QUAD)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return { rgb: rgbOfPng(file), geo: g }
}

const slidesSrc = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
const SLIDES = [...slidesSrc.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)]
  .map(m => ({ frame: +m[1], at: +m[2], page: m[3] }))
const LEAD = 0.95

// ---------------------------------------------------------------- --selftest
if (argv.includes('--selftest')) {
  let fails = 0
  console.log('SELF-TEST — the method against three answers known in advance.\n')

  // 1. Synthetic warp of a real clip frame, bloom and all.
  console.log('1. A CLIP frame warped by a known amount and measured back.')
  console.log('   If the bloom biased this method the way it biased the other three,')
  console.log('   this is where it would show: the input is the clip itself.\n')
  console.log('   t      applied            recovered           err size   err px')
  const CASES = [
    [22.07 + LEAD, 1.0, 0, 0], [22.07 + LEAD, 1.12, 40, -25],
    [26.07 + LEAD, 0.88, -30, 18], [39.07 + LEAD, 1.06, 12, 55],
    [4.6 + LEAD, 1.15, -20, -40],
  ]
  for (const [t, s0, dx0, dy0] of CASES) {
    const base = rgbOfVideo(CLIP, t)
    // Build B(q) = base(p) with q = piv + s0*(p - piv) + d0, by inverse sampling.
    const piv = [W / 2, H / 2]
    const b = Buffer.alloc(W * H * 3)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const sx = piv[0] + (x - piv[0] - dx0) / s0
        const sy = piv[1] + (y - piv[1] - dy0) / s0
        // Bilinear, not nearest: nearest-neighbour resampling stamps a
        // staircase onto every edge, and a method that reads edge DIRECTION
        // would then be graded on the staircase rather than on the picture.
        const ix = Math.floor(sx), iy = Math.floor(sy)
        if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue
        const fx = sx - ix, fy = sy - iy
        const o = (y * W + x) * 3, q = (iy * W + ix) * 3
        for (let c = 0; c < 3; c++)
          b[o + c] = base[q + c] * (1 - fx) * (1 - fy) + base[q + 3 + c] * fx * (1 - fy) +
                     base[q + W * 3 + c] * (1 - fx) * fy + base[q + W * 3 + 3 + c] * fx * fy
      }
    const mask = boxMask(260, 480, 560, 900)
    const r = fitPair(base, b, mask, piv, { reach: boxMask(120, 260, 840, 1340) })
    const errS = Math.abs(1 / r.ratio - s0) / s0 * 100
    const errD = Math.hypot(-r.dx - dx0, -r.dy - dy0)
    const bad = errS > 1.0 || errD > 6
    if (bad) fails++
    console.log(
      `   ${t.toFixed(2).padStart(5)}  x${s0.toFixed(2)} ${String(dx0).padStart(4)}/${String(dy0).padStart(4)}` +
      `      x${(1 / r.ratio).toFixed(3)} ${(-r.dx).toFixed(0).padStart(4)}/${(-r.dy).toFixed(0).padStart(4)}` +
      `     ${errS.toFixed(2)} %`.padStart(12) + `${errD.toFixed(1)} px`.padStart(10) + (bad ? '   FAIL' : ''))
  }

  // 2. Cross-source, against the Figma storyboard renders.
  //
  //    THE ASSERTION HERE IS NOT "ZERO", and getting that wrong cost an hour.
  //    The register establishes that our journal's BOX matches the mock's to
  //    0-2 design px; it says nothing about the artwork inside it, and this fit
  //    measures the artwork. What is known in advance is weaker and still worth
  //    testing: whatever the answer is, it must be the SAME on every slide (a
  //    method with a slide-dependent bias could not manage that) and it must
  //    report no rotation, because there is none.
  //
  //    2a is the control that makes 2b readable. The mock renders arrive at
  //    540x960 and are blown up to the canvas; run our own frame through that
  //    same trip and the fit must come back at 1.000. Then whatever 2b reports
  //    over and above it belongs to the pictures, not to the pipeline.
  console.log('\n2a. CONTROL — our own frame through the mock\'s 540x960 round trip.')
  console.log('    Whatever the resampling costs, it is this. Expect 1.000 / 0 px.\n')
  console.log(' ' + HEAD)
  let ctl = 0
  {
    const sl = SLIDES.find(x => x.frame === 8)
    const { rgb, geo } = await ourFrame(sl.at + LEAD, `${OUT}/.ours8.png`)
    ff(['-y', '-i', `${OUT}/.ours8.png`, '-vf', 'scale=540:960', '-update', '1', '-frames:v', '1', `${OUT}/.half8.png`])
    const r = fitJournal(rgb, rgbOfPng(`${OUT}/.half8.png`), geo)
    ctl = r.pct
    const bad = Math.abs(r.pct) > 0.3 || r.dist > 3 || shaky(r)
    if (bad) fails++
    console.log(fmtOne('8 round trip', r) + (bad ? '   FAIL' : ''))
  }

  console.log('\n2b. OUR render against the FIGMA storyboard renders, six slides.')
  console.log('    The size must land in the same place on all six; the spread is the test.\n')
  console.log(' ' + HEAD)
  const pcts = []
  for (const n of [7, 8, 10, 14, 19, 22]) {
    const sl = SLIDES.find(x => x.frame === n)
    const mock = `${SB}/fr${String(n).padStart(2, '0')}.png`
    if (!existsSync(mock)) continue
    const { rgb, geo } = await ourFrame(sl.at + LEAD, `${OUT}/.ours${n}.png`)
    if (!geo) { console.log(`   ${n}: no journal`); continue }
    if (argv.includes('--mask')) dumpMask(rgb, pageMask(geo.quad), `${OUT}/mask-${n}.png`)
    const r = fitJournal(rgb, rgbOfPng(mock), geo)
    pcts.push(r.pct)
    const bad = Math.abs(r.rot) > 1 || shaky(r)
    if (bad) fails++
    console.log(fmtOne(`${n} ${sl.page}`.slice(0, 20), r) + (bad ? '   FAIL' : ''))
  }
  const spread = Math.max(...pcts) - Math.min(...pcts)
  const bad2 = spread > 0.8
  if (bad2) fails++
  console.log(`   spread ${spread.toFixed(2)} % across ${pcts.length} slides` +
    (bad2 ? '   FAIL' : '   — one systematic offset, not a per-slide error') +
    `\n   of which ${Math.abs(ctl).toFixed(2)} % is the round trip (2a); the rest is our` +
    ` page rendering that\n   much larger than Figma\'s inside a box the register puts at 0-2 px.`)

  // 3. End to end: our render against our own render with the journal scaled by
  //    a known factor. This is the only case that exercises park -> screenshot
  //    -> quad -> register as one thing.
  console.log('\n3. OUR render against OURS with the journal deliberately mis-scaled.')
  console.log('   The whole pipeline end to end, against a factor we set ourselves.\n')
  console.log('   sl  applied ' + HEAD)
  for (const [n, k] of [[7, 1.1], [10, 1.1], [14, 0.92], [19, 1.05]]) {
    const sl = SLIDES.find(x => x.frame === n)
    const t = sl.at + LEAD
    const a = await ourFrame(t, `${OUT}/.a${n}.png`)
    await cdp.eval(`(() => {
      const b = document.querySelector('.journal-box')
      const m = new DOMMatrix(getComputedStyle(b).transform)
      b.style.transform = 'scale(${k}) ' + m.toString()
      return 1
    })()`)
    await sleep(250)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/.b${n}.png`, Buffer.from(shot.data, 'base64'))
    const r = fitJournal(a.rgb, rgbOfPng(`${OUT}/.b${n}.png`), a.geo)
    // `scale()` is prepended to the box's own transform, whose origin is the box
    // centre, so the journal grows in place: only the size should move.
    const err = (Math.abs(1 / r.ratio - k) / k) * 100
    const bad = err > 1.5 || shaky(r)
    if (bad) fails++
    console.log(`   ${String(n).padStart(2)}  x${k.toFixed(2)}  ` + fmtRow(r) +
      r.rival.toFixed(3).padStart(7) + `   err ${err.toFixed(2)} %` + (bad ? '   FAIL' : ''))
  }

  console.log(`\n${fails} case(s) failed.`)
  process.exitCode = fails ? 1 : 0
  process.exit(process.exitCode)
}

// ---------------------------------------------------------------- --solve
//
// SOLVE A POSE FROM THE TWO EDGES THE CLIP ACTUALLY SHOWS.
//
//   node scripts/clip-fit.mjs --solve 130:516,1017,1.00 126:573,821,1.00
//        frame : left edge , right edge , scale     (design px, scale fixed)
//
// The journal's left and right edges are the only geometry the clip gives up
// without an argument. They are a strong step against an unlit room, they are
// where the difference mask starts and ends, and — checked on our own settled
// frame, where the browser's quad says 46 and the mask says 36 — the bloom is
// worth about 10 px on that boundary and nothing more. The cover's top and
// bottom, by contrast, are off the frame for most of the entrance, so there is
// no vertical measurement to be had and `scale` has to be supplied rather than
// solved. Two edges, two unknowns: rotationY sets the width, and the position
// then follows in closed form because a translation moves the quad and nothing
// else.
//
// The browser is the oracle throughout — the quad comes out of the same
// projection the story renders through, so nothing here can drift from what
// ships the way a re-implemented transform chain would.
if (argv.includes('--solve')) {
  const i = argv.indexOf('--solve')
  const jobs = []
  for (let k = i + 1; k < argv.length && !argv[k].startsWith('--'); k++) {
    const [f, list] = argv[k].split(':')
    const v = list.split(',').map(Number)
    jobs.push({ n: parseInt(f, 10), tag: f, left: v[0], right: v[1], scale: v[2],
      rotZ: v[3] ?? 2.8, persp: v[4] ?? 1800 })
  }
  await cdp.eval(PARK(6.95))
  await sleep(320)
  const put = async (rot, scale, cx, cy, rotY, persp) => {
    await cdp.eval(`(() => {
      const g = window.__story.gsap
      document.querySelector('.stage').style.setProperty('--persp', '${persp}')
      g.set('.journal-pos', { xPercent: ${cx}, yPercent: ${cy} })
      g.set('.journal-box', { rotationZ: ${rot}, rotationY: ${rotY}, rotationX: 0, scale: ${scale} })
      return 1
    })()`)
    const q = await cdp.eval(QUAD)
    const xs = q.quad.map(p => p[0])
    return { quad: q.quad, x0: Math.min(...xs), x1: Math.max(...xs) }
  }
  console.log('frame    want w   rotY    scale     cx      got w   left   right   err')
  for (const j of jobs) {
    const want = j.right - j.left
    let best = null, cx = 50
    // ANGLE AND POSITION HAVE TO BE SOLVED TOGETHER, and finding that out cost
    // a round: `perspective-origin` sits at the middle of the frame, so sliding
    // the journal sideways does not merely move it — it changes how much of the
    // cone it occupies, and therefore its width. Solve the angle, move, and the
    // width has moved too (by a factor of two, at 500 px off centre). So each
    // pass re-solves the angle at the position the last pass produced.
    for (let pass = 0; pass < 5; pass++) {
      best = null
      let step = pass ? 0.4 : 2
      let lo = pass ? bestRotY - 3 : -89.8, hi = pass ? bestRotY + 3 : -2
      for (let refine = 0; refine < 3; refine++) {
        for (let ry = lo; ry <= hi + 1e-9; ry += step) {
          const r = await put(j.rotZ, j.scale, cx, 50, ry, j.persp)
          const e = Math.abs(r.x1 - r.x0 - want)
          if (!best || e < best.e) best = { e, rotY: ry, x0: r.x0, x1: r.x1 }
        }
        lo = best.rotY - step; hi = best.rotY + step; step /= 5
      }
      var bestRotY = best.rotY
      cx += ((j.left - best.x0) / W) * 100
    }
    const chk = await put(j.rotZ, j.scale, cx, 50, best.rotY, j.persp)
    console.log(j.tag.padStart(6) + String(want).padStart(8) +
      best.rotY.toFixed(2).padStart(8) + j.scale.toFixed(3).padStart(8) +
      cx.toFixed(1).padStart(8) + (chk.x1 - chk.x0).toFixed(0).padStart(9) +
      chk.x0.toFixed(0).padStart(8) + chk.x1.toFixed(0).padStart(8) +
      best.e.toFixed(0).padStart(6))
  }
  process.exit(0)
}

// ---------------------------------------------------------------- --pose
//
// PUT A POSE ON THE JOURNAL AND LAY IT OVER A FRAME OF THE CLIP.
//
//   node scripts/clip-fit.mjs --pose 138:7.8,1.02,60,50,-38 180:3.1,0.746,57.7,48.7
//        frame : rotZ , scale , cx% , cy% [, rotY [, persp]]
//
// WHY BY EYE AND NOT BY A FIT. Two attempts to get the clip's cover box out of
// the pictures are recorded above and in the register; the fourth, a silhouette
// from the gradient of the difference mask, failed its own control by 155 design
// px on OUR render, where the answer was known — it locked onto the type block
// rather than the cover, because on this artwork the printed type is a stronger
// step than the cover's edge against an unlit room.
//
// What does work is drawing our quad, which the browser projects exactly, on top
// of the clip and looking. A straight line either lies along an edge or it does
// not, and no threshold is involved on either side. So this mode makes that loop
// fast: a pose in, two pictures out — the outline over the clip, and the two at
// 50 % each.
if (argv.includes('--pose')) {
  const i = argv.indexOf('--pose')
  const jobs = []
  for (let k = i + 1; k < argv.length && !argv[k].startsWith('--'); k++) {
    const [f, list] = argv[k].split(':')
    const v = list.split(',').map(Number)
    // `118a`, `118b`, ... so several candidates for one frame can be compared.
    jobs.push({ n: parseInt(f, 10), tag: f, rot: v[0], scale: v[1], cx: v[2], cy: v[3],
      rotY: v[4] ?? 0, persp: v[5] ?? 1800 })
  }
  // Park somewhere the RIGHT FACE is live, then overwrite the pose. The default
  // 6.95 is the cover: past the entrance, so nothing is mid-tween and nothing
  // re-renders over what we set. For a POSE ON A DATA PAGE that default is
  // wrong by 6 % — the cover face is laid out at 1465x1868 and a page at
  // 1564x1911 (FACE in journalGeometry.js) — so `--park <t>` parks on the page
  // whose pose is being judged. It also makes that page the visible one, which
  // is what makes the blend readable.
  const parkAt = argv.includes('--park') ? Number(argv[argv.indexOf('--park') + 1]) : 6.95
  await cdp.eval(PARK(parkAt))
  await sleep(320)
  console.log('frame     t    pose                                        quad x/y  w x h')
  for (const j of jobs) {
    const t = j.n / 30
    await cdp.eval(`(() => {
      const g = window.__story.gsap
      document.querySelector('.stage').style.setProperty('--persp', '${j.persp}')
      g.set('.journal-pos', { xPercent: ${j.cx}, yPercent: ${j.cy} })
      g.set('.journal-box', { rotationZ: ${j.rot}, rotationY: ${j.rotY}, rotationX: 0, scale: ${j.scale} })
      return 1
    })()`)
    await sleep(200)
    const geo = await cdp.eval(QUAD)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const ours = `${OUT}/.pose-${j.tag}.png`
    writeFileSync(ours, Buffer.from(shot.data, 'base64'))
    const clip = frameExact(CLIP, j.n)
    ff(['-y', '-i', file2png(CLIP, j.n, `${OUT}/.clipfr-${j.tag}.png`), '-i', ours, '-filter_complex',
      '[0][1]blend=all_mode=average', '-update', '1', '-frames:v', '1', `${OUT}/pose-blend-${j.tag}.png`])
    drawQuad(clip, geo.quad, `${OUT}/pose-outline-${j.tag}.png`)
    // THE CONTROL FOR THE OVERLAY ITSELF. The same quad on OUR OWN frame answers
    // a question the clip overlay cannot: how far the front FACE sits outside
    // the page as drawn. Without it, a face that carries bleed beyond the
    // visible page reads as "our pose is 30 px off the clip" on every frame.
    drawQuad(rgbOfPng(ours), geo.quad, `${OUT}/pose-self-${j.tag}.png`)
    const qx = Math.min(...geo.quad.map(p => p[0])), qX = Math.max(...geo.quad.map(p => p[0]))
    const qy = Math.min(...geo.quad.map(p => p[1])), qY = Math.max(...geo.quad.map(p => p[1]))
    console.log(j.tag.padStart(5) + t.toFixed(3).padStart(8) + '  ' +
      `rot ${j.rot} sc ${j.scale} cx ${j.cx} cy ${j.cy} rotY ${j.rotY} p ${j.persp}`.padEnd(40) +
      `${qx.toFixed(0)}/${qy.toFixed(0)} ${(qX - qx).toFixed(0)}x${(qY - qy).toFixed(0)}`.padStart(20) +
      '   corners ' + geo.quad.map(c => `${c[0].toFixed(0)},${c[1].toFixed(0)}`).join(' '))
  }
  console.log(`\n-> ${OUT}/pose-outline-*.png (our quad on the clip) and pose-blend-*.png`)
  process.exit(0)
}

// ---------------------------------------------------------------- --trace
//
// ONE REFERENCE RENDER OF OURS, MANY FRAMES OF THE CLIP.
//
// The default mode parks our player at the same second as the clip frame, which
// is the right thing when the question is "how far apart are we". It is the
// WRONG thing when the question is "what is the clip doing", because during the
// entrance our journal is a hairline at the very seconds the clip's is wide
// open: a fit between two slivers has nothing to lock onto and answers noise.
//
// So this mode parks our journal ONCE, at a second where the cover is open and
// its pose is known exactly from the DOM, and slides that one template along the
// clip. Every answer is then "the clip's cover, relative to a pose we know",
// which is what re-shooting the entrance keys needs.
//
// It still cannot see rotationY or a keystone — a similarity transform has no
// such term — so the fit degrades as the clip's cover turns away, and `score`
// says by how much. Near the edge-on crossing there is nothing here to measure
// and the silhouette width is the instrument instead.
if (argv.includes('--trace')) {
  const i = argv.indexOf('--trace')
  const rest = []
  for (let k = i + 1; k < argv.length && !argv[k].startsWith('--'); k++) rest.push(Number(argv[k]))
  const tRef = rest.shift()
  const list = rest.length ? rest : [4.6, 4.8, 5.0, 5.2, 5.5, 6.0, 6.5]
  const ref = await ourFrame(tRef, `${OUT}/.ref.png`)
  const p = ref.geo.pose
  console.log(`Template: OUR journal parked at t=${tRef}.`)
  console.log(`  { rot: ${p.rot.toFixed(2)}, scale: ${p.scale.toFixed(3)}, cx: ${p.cx.toFixed(1)}, ` +
    `cy: ${p.cy.toFixed(1)} }  rotX ${p.rotX.toFixed(1)} rotY ${p.rotY.toFixed(1)} persp ${p.persp}`)
  console.log('\nWhat the CLIP is doing at each frame, in slides.js terms.')
  console.log('A low score means the clip is turned away from us and a similarity fit')
  console.log('cannot follow it — read those rows as indicative and use the widths.\n')
  console.log('   t    frame        rot   scale     cx     cy    score  rival')
  const out = []
  for (const t of list) {
    const clipRgb = rgbOfVideo(CLIP, t)
    drawQuad(clipRgb, ref.geo.quad, `${OUT}/outline-${t}.png`)
    const r = fitJournal(ref.rgb, clipRgb, ref.geo, { dSpan: Number(process.env.FIT_SPAN || 460) })
    const c = impliedClipPose(p, r)
    out.push({ t, ...c, score: r.v, rival: r.rival })
    console.log(t.toFixed(3).padStart(7) + String(Math.round(t * 30)).padStart(7) + '  ' +
      c.rot.toFixed(2).padStart(9) + c.scale.toFixed(3).padStart(8) +
      c.cx.toFixed(1).padStart(7) + c.cy.toFixed(1).padStart(7) +
      r.v.toFixed(3).padStart(9) + r.rival.toFixed(3).padStart(7) +
      (shaky(r) ? '  NO CONFIDENT PEAK' : ''))
  }
  writeFileSync(`${OUT}/trace.json`, JSON.stringify({ ref: p, tRef, rows: out }, null, 1))
  console.log(`\n-> ${OUT}/trace.json`)
  process.exit(0)
}

// ---------------------------------------------------------------- measure
const times = []
if (argv.includes('--t')) {
  for (let i = argv.indexOf('--t') + 1; i < argv.length && !argv[i].startsWith('--'); i++)
    times.push({ label: `t=${argv[i]}`, t: Number(argv[i]) })
} else {
  const want = argv.filter(a => !a.startsWith('--')).map(Number).filter(Boolean)
  const list = want.length ? want : SLIDES.map(s => s.frame)
  for (const n of list) {
    const s = SLIDES.find(x => x.frame === n)
    if (s) times.push({ label: `${n} ${s.page}`, t: +(s.at + LEAD).toFixed(3) })
  }
}

console.log('OUR JOURNAL AGAINST THE CLIP\'S, by gradient registration.')
console.log('size  = ours as a fraction of the clip\'s journal (x1.000 = same size)')
console.log('shift = our centre minus the clip\'s, design px on the 1080x1920 canvas')
console.log('score = cosine similarity of the two edge fields; rival = best score')
console.log('        60 px away, so score-rival is how lonely the peak is.\n')
/**
 * Our pose is known exactly, and the fit says how the clip's differs from it,
 * so the clip's own pose follows — in the very units slides.js and swingOpen
 * are written in. That is the number this whole file exists to produce.
 *
 * `rot` is clockwise in both systems: the fit's rotation carries ours ONTO the
 * clip's, so the clip's angle is ours plus it. Position is a percentage of the
 * 1080x1920 canvas because `.journal-pos` is exactly that box (poseTween.js).
 *
 * WHAT IT CANNOT SEE: rotationX and --persp. A similarity transform has no way
 * to express a keystone, so a difference in either shows up as a residual the
 * fit cannot remove — read it off `score`, and off the blend, not off these
 * four numbers.
 */
function impliedClipPose(pose, fit) {
  const b = fit.best
  return {
    rot: +(pose.rot + b.rot).toFixed(2),
    scale: +(pose.scale * b.s).toFixed(3),
    cx: +(pose.cx + (b.dx / W) * 100).toFixed(1),
    cy: +(pose.cy + (b.dy / H) * 100).toFixed(1),
  }
}

console.log(HEAD)
const rows = []
for (const { label, t } of times) {
  const { rgb, geo } = await ourFrame(t, `${OUT}/.ours-${t}.png`)
  if (!geo) { console.log(label + '  (no journal on screen)'); continue }
  const clipPng = `${OUT}/.clip-${t}.png`
  ff(['-y', '-ss', String(t), '-i', CLIP, '-frames:v', '1', clipPng])
  const clipRgb = rgbOfVideo(CLIP, t)
  drawQuad(clipRgb, geo.quad, `${OUT}/outline-${t}.png`)
  const r = fitJournal(rgb, clipRgb, geo, { dSpan: Number(process.env.FIT_SPAN || 240) })
  const implied = impliedClipPose(geo.pose, r)
  rows.push({ label, t, fit: r, ours: geo.box, pose: geo.pose, implied })
  // A blend of the two, always: the number says how much and the picture says
  // whether the number is about the right thing.
  ff(['-y', '-i', `${OUT}/.ours-${t}.png`, '-i', clipPng, '-filter_complex',
    '[0][1]blend=all_mode=average', '-update', '1', '-frames:v', '1', `${OUT}/blend-${t}.png`])
  const p = geo.pose
  console.log(label)
  console.log(fmtOne('fit', r))
  if (!p || !Number.isFinite(p.rot)) { console.log('  (pose unreadable)'); continue }
  console.log(`  ours { rot: ${p.rot.toFixed(2)}, scale: ${p.scale.toFixed(3)}, ` +
    `cx: ${p.cx.toFixed(1)}, cy: ${p.cy.toFixed(1)} }  rotX ${p.rotX.toFixed(1)} rotY ${p.rotY.toFixed(1)}`)
  console.log(`  CLIP { rot: ${implied.rot}, scale: ${implied.scale}, ` +
    `cx: ${implied.cx}, cy: ${implied.cy} }   <- what the clip is doing, in slides.js terms`)
}
writeFileSync(`${OUT}/fit.json`, JSON.stringify(rows, null, 1))
console.log(`\n-> ${OUT}/fit.json`)
process.exit(0)
