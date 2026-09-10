#!/usr/bin/env node
/**
 * MEASURING A FLYING OBJECT AGAINST THE CLIP BY THE PICTURE, NOT BY NUMBERS.
 *
 *   node scripts/fly-fit.mjs --flight report-2            one flight, every frame
 *   node scripts/fly-fit.mjs --flight report-2 --step 5   every fifth frame
 *   node scripts/fly-fit.mjs --all                        all 27
 *   node scripts/fly-fit.mjs --flight report-2 --sheet    ...and write blends
 *
 * WHY THIS EXISTS, and why it should have existed first.
 *
 * Everything that has measured the flying objects until now measured the CLIP
 * with a detector — background plate, colour distance, connected components,
 * sprite correlation — and then compared OUR numbers against THOSE numbers. The
 * detector is itself wrong, and wrong hardest exactly where the owner keeps
 * pointing: a clipboard and a ball have no long axis, so its angle is noise, and
 * a body the frame is cutting reads small, so its size is noise too. Four days
 * of work went into agreeing with a bad measurement.
 *
 * This script never asks the detector anything. It renders OUR object, lays it
 * over the clip's own frame, and asks the only question that matters: by what
 * shift, scale and rotation do the two pictures coincide? That is the same
 * method clip-fit.mjs has used for the journal since session G, on the same
 * gradient-field registration — the glow never enters the arithmetic because
 * only the DIRECTION of the gradient is kept.
 *
 * HOW OUR FRAME IS MADE CLEAN. In dev the backdrop is `ref-clean.mp4`, which has
 * the objects BAKED IN, so a plain screenshot holds two of everything. So the
 * backdrop is hidden, every other flight is hidden, and what is left on black is
 * our object and nothing else. That also makes the run fast: with no video to
 * seek, parking is a timeline seek and a repaint rather than a 900 ms wait for
 * the media clock.
 *
 * WHAT IT WRITES. One row per frame per flight into `.fly-cache/fly-fit.json`:
 *   { id, t, dx, dy, s, rot, v, cov }
 * where dx/dy are design px our object must MOVE, s the factor it must be
 * SCALED by and rot the degrees it must be TURNED by, to land on the clip.
 * A correct object reads dx=dy=0, s=1, rot=0.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { W, H, pyramid, maskPyramid, register, margin, boxMask } from './lib/gradfit.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const CLEAN = `${ROOT}_refs/DP-15152 - clean bg.mp4`
const CACHE = `${ROOT}.fly-cache`
const OUT = process.env.FLYFIT_OUT || `${ROOT}_refs/flyfit`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.FLYFIT_PORT || 9391)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const argv = process.argv.slice(2)
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1] }
const STEP = Number(flag('--step') || 1)
const KEEP = Number(process.env.FLYFIT_KEEP || 0.14)
const SHEET = argv.includes('--sheet')
const SRANGE = (process.env.FLYFIT_SRANGE || '0.8,1.4').split(',').map(Number)
const RROT = (process.env.FLYFIT_RROT || '-25,25').split(',').map(Number)
const DSPAN = Number(process.env.FLYFIT_DSPAN || 0.6)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ff = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30 })
const rgbOfVideo = (file, t) =>
  ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/**
 * EVERY FRAME OF ONE WINDOW IN ONE ffmpeg CALL.
 *
 * Seeking the file per frame costs about a second each — six hours over the
 * story — and almost all of it is ffmpeg opening a 187 MB file again. Decode the
 * flight's window once into one raw buffer and index into it.
 */
function windowFrames(file, t0, t1) {
  const n0 = Math.round(t0 * 30)
  const n = Math.round(t1 * 30) - n0 + 1
  const size = W * H * 3
  // TO A FILE, NOT TO A PIPE. One frame is 6.2 MB at 1080x1920, so a seven
  // second flight is 1.4 GB and execFileSync's buffer gives up with ENOBUFS.
  const raw = `${OUT}/.win.raw`
  ff(['-y', '-ss', String(n0 / 30), '-i', file, '-frames:v', String(n),
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw])
  const fd = openSync(raw, 'r')
  const buf = Buffer.alloc(size)
  return {
    n0,
    at(t) {
      const i = Math.round(t * 30) - n0
      if (i < 0 || i >= n) return null
      const got = readSync(fd, buf, 0, size, i * size)
      return got === size ? buf : null
    },
    close() { try { closeSync(fd) } catch {} },
  }
}
const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

// The clip's demo print, so our page shows what the clip showed — same reason
// as clip-fit's FIT_QUERY. Objects do not carry type, but the page behind them
// does, and a mask that catches a digit catches our noise.
const QUERY = process.env.FIT_QUERY || ''

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=/tmp/flyfit-profile',
  'about:blank',
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

/** Strip the page down to one object on black, once per run. */
const STRIP = `(() => {
  const s = window.__story
  s.video.pause(); s.tl.pause()
  if (s.hoverTl) s.hoverTl.pause()
  const hv = document.querySelector('.journal-hover'); if (hv) hv.style.transform = 'none'
  const ui = document.querySelector('.stage__ui'); if (ui) ui.style.display = 'none'
  // the backdrop has the objects baked into it - hide it or every shot holds two
  for (const v of document.querySelectorAll('video')) v.style.visibility = 'hidden'
  const j = document.querySelector('.journal-pos'); if (j) j.style.visibility = 'hidden'
  const st = document.querySelector('.stage'); if (st) st.style.background = '#000'
  document.body.style.background = '#000'
  return true
})()`

/** Park the timeline. No media clock to wait for: the video is hidden. */
const PARK = t => `(() => {
  const s = window.__story
  s.tl.seek(${t}, false)
  s.applySegment?.(${t})
  return s.tl.time()
})()`

/** Show only this flight, and report where WE put it, in canvas px. */
const ONLY = id => `(() => {
  let box = null
  for (const el of document.querySelectorAll('.fly-obj[data-fly]')) {
    const mine = el.dataset.fly === ${JSON.stringify(id)}
    el.style.visibility = mine ? 'visible' : 'hidden'
    if (!mine) continue
    const ob = el.querySelector('.fly-obj__box')
    if (!ob) continue
    const st = getComputedStyle(el)
    if (st.display === 'none') return null
    const s3d = document.querySelector('.stage3d') || document.querySelector('.stage')
    const sr = s3d.getBoundingClientRect()
    const r = ob.getBoundingClientRect()
    box = {
      cx: ((r.left + r.width / 2 - sr.left) / sr.width) * ${W},
      cy: ((r.top + r.height / 2 - sr.top) / sr.height) * ${H},
      w: (r.width / sr.width) * ${W},
      h: (r.height / sr.height) * ${H},
      vis: getComputedStyle(ob).visibility !== 'hidden' && Number(getComputedStyle(ob).opacity) > 0.05,
    }
  }
  return box
})()`

const READY = `(async () => {
  for (let i = 0; i < 240; i++) {
    const s = window.__story
    if (s && s.tl && s.video && s.tl.duration() > 10) return true
    await new Promise(r => setTimeout(r, 250))
  }
  return false
})()`

/**
 * The pixels our own render actually put on screen, dilated a little so the
 * object's outer edge - the part that carries most of the gradient - is inside.
 * Everything outside the box the DOM reported is dropped, so a second object
 * that slipped through cannot join in.
 */
function silhouetteOf(rgb, box, side) {
  const m = new Float32Array(W * H)
  const x0 = Math.max(0, Math.round(box.cx - side / 2)), x1 = Math.min(W, Math.round(box.cx + side / 2))
  const y0 = Math.max(0, Math.round(box.cy - side / 2)), y1 = Math.min(H, Math.round(box.cy + side / 2))
  let n = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3
      if (rgb[i] + rgb[i + 1] + rgb[i + 2] > 42) { m[y * W + x] = 1; n++ }
    }
  if (n < 200) return boxMask(box.cx - side / 2, box.cy - side / 2, side, side)
  // grow by a few pixels so the silhouette's own edge is covered on both sides
  const g = new Float32Array(W * H)
  const R = 6
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!m[y * W + x]) continue
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < W) g[yy * W + xx] = 1
        }
      }
    }
  return g
}

function fitPair(rgbA, rgbB, mask, pivot, opt = {}) {
  const Mp = maskPyramid(mask)
  const Ap = pyramid(rgbA, KEEP, mask)
  const Bp = pyramid(rgbB, KEEP, opt.reach || mask)
  const best = register(Ap, Bp, Mp, pivot, opt)
  const rival = margin(Ap, Bp, Mp, pivot, best)
  return { ...best, rival }
}

/**
 * PROVE THE METHOD BEFORE USING ITS NUMBERS.
 *
 * Take OUR OWN frame, warp it by an amount we choose, and ask the fit to find
 * that amount back. If it cannot recover a scale it was handed, nothing it says
 * about the clip is worth reading. This is the same guard clip-fit.mjs carries,
 * and the reason it exists is written all over this project's registry: a
 * registration that fails returns a plausible number rather than an error.
 */
function warpRgb(rgb, cx, cy, s, dx, dy) {
  const out = Buffer.alloc(rgb.length)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // where this output pixel comes from in the input
      const sx = cx + (x - cx - dx) / s
      const sy = cy + (y - cy - dy) / s
      const ix = Math.round(sx), iy = Math.round(sy)
      const o = (y * W + x) * 3
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue
      const i = (iy * W + ix) * 3
      out[o] = rgb[i]; out[o + 1] = rgb[i + 1]; out[o + 2] = rgb[i + 2]
    }
  }
  return out
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const { FLY_OBJECTS } = await import(`${ROOT}src/story/flyObjects.js`)
  const want = flag('--flight')
  const list = argv.includes('--all') ? FLY_OBJECTS : FLY_OBJECTS.filter(f => f.id === want)
  if (!list.length) { console.error('no such flight; use --flight <id> or --all'); process.exit(1) }

  const ws = new WebSocket(await findTarget())
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 420, height: 747, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html${QUERY}` })
  await sleep(2500)
  if (!(await cdp.eval(READY))) throw new Error('story never became ready')
  await cdp.eval(STRIP)

  // ------------------------------------------------------------- --selftest
  if (argv.includes('--selftest')) {
    const rec = list[0]
    const mid = rec.keys[Math.floor(rec.keys.length / 2)][0]
    await cdp.eval(PARK(mid))
    const box = await cdp.eval(ONLY(rec.id))
    if (!box) { console.error('selftest: the object is not on screen at ' + mid); process.exit(1) }
    const png = `${OUT}/.self.png`
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(png, Buffer.from(shot.data, 'base64'))
    const rgb = rgbOfPng(png)
    const side = Math.max(box.w, box.h) * 2.2
    const mask = boxMask(box.cx - side / 2, box.cy - side / 2, side, side)
    const reach = boxMask(box.cx - side, box.cy - side, side * 2, side * 2)
    console.log(`SELF-TEST on ${rec.id} at t=${mid}: our own frame, warped by a known amount.\n`)
    console.log('  asked            got                       error')
    let bad = 0
    for (const c of [
      { s: 1.00, dx: 0, dy: 0 }, { s: 1.10, dx: 0, dy: 0 }, { s: 0.90, dx: 0, dy: 0 },
      { s: 1.00, dx: 20, dy: -14 }, { s: 1.12, dx: -10, dy: 8 },
    ]) {
      const warped = warpRgb(rgb, box.cx, box.cy, c.s, c.dx, c.dy)
      const r = fitPair(rgb, warped, mask, [box.cx, box.cy],
        { sRange: [0.6, 1.7], rRange: [-45, 45], dSpan: Math.round(side * 0.6), reach })
      const es = Math.abs(r.s - c.s), ex = Math.abs(r.dx - c.dx), ey = Math.abs(r.dy - c.dy)
      const ok = es < 0.02 && ex < 6 && ey < 6
      if (!ok) bad++
      console.log(`  x${c.s.toFixed(2)} ${String(c.dx).padStart(4)}/${String(c.dy).padStart(4)}   ` +
        `x${r.s.toFixed(3)} ${r.dx.toFixed(1).padStart(6)}/${r.dy.toFixed(1).padStart(6)} rot ${r.rot.toFixed(1).padStart(5)}   ` +
        `x${es.toFixed(3)} ${ex.toFixed(1)}/${ey.toFixed(1)} px  ${ok ? 'ok' : '<<< FAIL'}`)
    }
    console.log(`\n${bad} case(s) failed.`)
    ws.close()
    process.exit(bad ? 1 : 0)
  }

  const rows = []
  for (const rec of list) {
    const t0 = rec.keys[0][0], t1 = rec.keys[rec.keys.length - 1][0]
    const frames = []
    for (let n = Math.round(t0 * 30); n <= Math.round(t1 * 30); n += STEP) frames.push(n / 30)
    process.stderr.write(`${rec.id}: ${frames.length} frames\n`)
    const win = windowFrames(CLEAN, t0, t1)
    let done = 0
    for (const t of frames) {
      await cdp.eval(PARK(t))
      const box = await cdp.eval(ONLY(rec.id))
      if (!box || !box.vis) continue
      const png = `${OUT}/.shot.png`
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(png, Buffer.from(shot.data, 'base64'))
      const rgbA = rgbOfPng(png)
      const rgbB = win.at(t)
      if (!rgbB) continue
      // THE MASK IS THE OBJECT ITSELF, NOT A BOX AROUND IT.
      //
      // A square window is what the journal fit uses, and there it is right: the
      // journal fills its window. An object does not - at 2.2x the body, four
      // fifths of the window is room, and the room is in the CLIP frame but not
      // in ours, which is black. The registration then has to match our object
      // against object-plus-room and mostly fails: measured over 27 flights,
      // only 2 frames of 28 came back confident on pen-1 and the answer was a
      // 186 px shift that cannot be true. Mask by the silhouette we actually
      // drew - every pixel of our own frame that is not black - and the room
      // never enters the arithmetic.
      const side = Math.max(box.w, box.h) * 2.2
      const mask = silhouetteOf(rgbA, box, side)
      const reach = boxMask(box.cx - side / 2, box.cy - side / 2, side, side)
      // HOW FAR THE SEARCH LOOKS, and why it is narrow. The coarse ladder walks
      // the scale range in 4 % rungs and sweeps a full translation grid at each
      // one, so a 0.6..1.7 range costs 26 rungs and thirteen seconds a frame -
      // four hours over the story. The first four flights measured on the wide
      // range answered x1.055..x1.115, so 0.8..1.4 holds the answer with room to
      // spare either side, and the same for +/-25 deg against the 4-8 deg found.
      // FLYFIT_SRANGE widens it again for a flight that needs it.
      const r = fitPair(rgbA, rgbB, mask, [box.cx, box.cy],
        { sRange: SRANGE, rRange: RROT, dSpan: Math.round(side * DSPAN), reach })
      rows.push({
        id: rec.id, t: +t.toFixed(3),
        dx: +((r.dx / W) * 420).toFixed(2), dy: +((r.dy / H) * 747).toFixed(2),
        s: +r.s.toFixed(4), rot: +r.rot.toFixed(2),
        v: +r.v.toFixed(3), rival: +r.rival.toFixed(3),
      })
      if (++done % 20 === 0) process.stderr.write(`  ${done}/${frames.length}\n`)
    }
    win.close()
  }
  mkdirSync(CACHE, { recursive: true })
  const f = `${CACHE}/fly-fit${want ? '-' + want : ''}.json`
  writeFileSync(f, JSON.stringify(rows))
  console.log(`wrote ${f}  (${rows.length} frames)`)
  // a compact read-out, so a run says something without a second command
  const by = {}
  for (const r of rows) (by[r.id] = by[r.id] || []).push(r)
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1]
  console.log('\nflight          frames  median dx/dy   median scale  median rot   confident')
  for (const id in by) {
    const g = by[id].filter(r => r.v > 0.10)
    if (!g.length) { console.log(id.padEnd(15), String(by[id].length).padStart(6), '   no confident frame'); continue }
    console.log(id.padEnd(15), String(by[id].length).padStart(6),
      (med(g.map(r => r.dx)).toFixed(1) + '/' + med(g.map(r => r.dy)).toFixed(1)).padStart(14),
      ('x' + med(g.map(r => r.s)).toFixed(3)).padStart(14),
      (med(g.map(r => r.rot)).toFixed(1) + '°').padStart(12),
      (g.length + '/' + by[id].length).padStart(12))
  }
  ws.close()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
