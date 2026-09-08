#!/usr/bin/env node
/**
 * THE DIGIT ROW AGAINST THE CLIP'S, AS A NUMBER (V-61).
 *
 *   node scripts/tile-fit.mjs --selftest          prove the method first
 *   node scripts/tile-fit.mjs                     every tile page, five seconds each
 *   node scripts/tile-fit.mjs 12 18 [--n 3]       by storyboard frame
 *
 * WHAT IT ANSWERS. "How tall does the clip draw the digit tiles on this page,
 * in the page's own design px" — one number per page, read off several seconds
 * of the slide and reported as a median with its spread. The product prints the
 * clip's own values here (257 on every tile page, see CLIP_QUERY) so the two
 * rows carry the same three glyphs and differ in size alone.
 *
 * WHY NOT THE THREE THINGS THAT WERE TRIED FIRST (session L, 2026-09-07, all
 * three recorded in _context/36-visual-diff.md under V-61):
 *
 *   - the ratio of the two rows' widths on one frame carries the journal's own
 *     pose residual (V-25): our journal is not the clip's size to the per cent,
 *     so the row's ratio is the tiles' ratio times an unknown;
 *   - correlating our render against the frame over a sweep of `--tile-fit`
 *     locks onto the page BACKGROUND, which is the same in both pictures, and
 *     the answer runs to the ends of the sweep;
 *   - the ratio "row / page plate" inside each picture needs the plate found by
 *     a threshold, and no threshold finds it on half the pages.
 *
 * WHAT THIS DOES INSTEAD. The row is registered as ITS OWN FIGURE: the template
 * is the union of the tile boxes read off our DOM, the edge fields are the
 * gradient-direction fields scripts/lib/gradfit.mjs builds for clip-fit, and the
 * register searches scale AND shift over that template alone — the background
 * is not in the template, so it cannot vote. The journal's pose residual is
 * measured in the same frame through the page's ART window, exactly as
 * `clip-fit --anchor` measures it, and divided out:
 *
 *     H_clip = h_ours * s_row / s_art
 *
 * because the art is the same PNG at the same design size in both renders, so
 * s_art is the pose alone, while s_row is the pose times the tiles.
 *
 * ONE SCREENSHOT PIXEL IS ONE DESIGN PIXEL: 540x960 at deviceScaleFactor 2, the
 * same setup as clip-fit, so the clip frame and our screenshot are on one grid.
 *
 * WHAT --selftest PROVES BEFORE ANY NUMBER IS BELIEVED:
 *   1. our own screenshot warped by a known scale and shift about the row's
 *      centre, and measured back — the maths, with nothing else in the way;
 *   2. the row re-rendered by the browser at a `--tile-fit` we choose, against
 *      the untouched render — park, screenshot, mask, register, end to end,
 *      with the expected answer read off the DOM rather than assumed.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { W, H, pyramid, maskPyramid, register, margin, boxMask } from './lib/gradfit.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const CLIP = `${ROOT}_refs/DP-15152 - preview.mp4`
const OUT = process.env.TILE_OUT || `${ROOT}_refs/tiles`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.TILE_PORT || 9391)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'

/** The clip's own print — same string clip-fit.mjs uses for --anchor. */
const CLIP_QUERY = '?days=257&points=120&level=SILVER&total_wins=257' +
  '&biggest_win=257&biggest_win_game=Dragon%20Coins%20Jackpot&top_multiplier=257' +
  '&top_multiplier_game=Tiger%20Jackpots&favorite_game_name=Tiger%20Jackpots' +
  '&bonuses=257&sports_wins=257&sports_multiplier=257'

/** The seven pages that render JDigitTiles (grep JDigitTiles src/components/pages). */
const TILE_FRAMES = [9, 12, 13, 14, 16, 17, 18]

const argv = process.argv.slice(2)
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1] }
const N = Number(flag('--n') || 5)
/** Same lead past the cut clip-fit measures at; the page turn is over by then. */
const LEAD = 0.95
const TAIL = 0.6
const KEEP = Number(process.env.FIT_KEEP || 0.14)
/** In-plane rotation the row fit may absorb, degrees. Our pose and the clip's
 *  agree to about a degree; the rest is the clip's yaw (V-24) tilting the row. */
const ROT = Number(process.env.TILE_ROT || 3)
const SHAKY = 0.15

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ff = (a, stdin) => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30, input: stdin })
const rgbOfVideo = (file, t) =>
  ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1] }
const spread = a => Math.max(...a) - Math.min(...a)

mkdirSync(OUT, { recursive: true })

const slidesSrc = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
const SLIDES = [...slidesSrc.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)]
  .map(m => ({ frame: +m[1], at: +m[2], page: m[3] }))

// ===========================================================================
// THE MATHS
// ===========================================================================

/** Register two raw RGB buffers over a template mask. `reach` is the region
 *  the clip side takes its edge threshold from (see gradfit's reachMask). */
function fitPair(rgbA, rgbB, mask, reach, pivot, opt) {
  const Mp = maskPyramid(mask)
  const Ap = pyramid(rgbA, KEEP, mask)
  const Bp = pyramid(rgbB, KEEP, reach)
  const best = register(Ap, Bp, Mp, pivot, opt)
  const rival = margin(Ap, Bp, Mp, pivot, best)
  return { ...best, rival, shaky: best.v - rival < SHAKY }
}

/** The union of the tile boxes, each grown by `pad` px. The AABB of a rotated
 *  tile carries a little room at its corners; room has no edges, so it costs
 *  nothing. */
function rowMask(row, pad) {
  const m = new Uint8Array(W * H)
  for (const [x, y, w, h] of row.tiles) {
    const x0 = Math.max(0, Math.floor(x - pad)), y0 = Math.max(0, Math.floor(y - pad))
    const x1 = Math.min(W - 1, Math.ceil(x + w + pad)), y1 = Math.min(H - 1, Math.ceil(y + h + pad))
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) m[yy * W + xx] = 1
  }
  return m
}

/**
 * THE TILES' OWN BOX, not `.j-tiles`'s. The flex row is as wide as its slot
 * whatever the tiles do, so its rect scales with nothing; the union of the tile
 * rects scales with the tiles, and its centre is the row's centre either way.
 */
function tilesBox(row) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y, w, h] of row.tiles) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h)
  }
  return [x0, y0, x1 - x0, y1 - y0]
}

/** Where the clip's row may be: the tiles' box grown about its centre. The
 *  clip's tiles were expected up to twice ours, and the mask is not a search
 *  limit — the register's dSpan is — only the threshold neighbourhood. */
function rowReach(row, grow = 2.6) {
  const [x, y, w, h] = tilesBox(row)
  const cx = x + w / 2, cy = y + h / 2
  return boxMask(cx - (w * grow) / 2, cy - (h * grow) / 2, w * grow, h * grow)
}

const rowPivot = row => { const [x, y, w, h] = tilesBox(row); return [x + w / 2, y + h / 2] }

function fitRow(rgbA, rgbB, row) {
  const pad = Math.max(4, tilesBox(row)[3] * 0.06)
  return fitPair(rgbA, rgbB, rowMask(row, pad), rowReach(row), rowPivot(row),
    { sRange: [0.7, 2.6], rRange: [-ROT, ROT], dSpan: Number(process.env.TILE_SPAN || 200) })
}

/**
 * THE BOX, BY THE ROW'S WIDTH. The register matched the GLYPHS first: on days
 * at x1.23 the blend showed our warped digits on the clip's digits and our
 * border a clear step inside the clip's; on money at x1.63 the same, smaller;
 * on top sport at x0.96 the clip's border OUTSIDE ours while the mock and the
 * clip are supposed to agree there. The clip's tiles are not drawn to the
 * mock's proportions — their glyph sits smaller inside a bigger box — and a
 * glyph has far more edge than a border, so the row fit is a glyph fit.
 * `height` sets the BOX, so the box is measured on its own, by a window unlike
 * the register's: the extent of gold along the row's own axis, through the
 * tile centres, is the row's width from the first tile's outer border to the
 * last's. Left and right of the row there is only dark page on every tile
 * page, so nothing else can be gold on that line; the label under the row and
 * the art above it are off the axis. Ours is read at the DOM's row, the clip's
 * where the glyph fit put it, and the two widths' ratio is the box scale.
 * (Four ways of fitting the border itself were tried the same day and
 * refused — a ring template locks onto the glyphs at every pyramid level.)
 */
const gold = (rgb, x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return false
  const i = (y * W + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]
  return r > 150 && g > 95 && b < 130 && r - b > 55
}

/** Gold extent along the row axis through (cx, cy), rotated `rot` deg, over
 *  three lines 0.15 tile heights apart; null unless gold spans both halves. */
function rowWidth(rgb, cx, cy, span, h, rot) {
  const th = (rot * Math.PI) / 180
  const ax = Math.cos(th), ay = Math.sin(th)     // along the row
  const bx = -Math.sin(th), by = Math.cos(th)    // down the tile
  let lo = Infinity, hi = -Infinity
  for (const off of [-0.15 * h, 0, 0.15 * h])
    for (let d = -span; d <= span; d += 1) {
      const x = Math.round(cx + ax * d + bx * off), y = Math.round(cy + ay * d + by * off)
      if (gold(rgb, x, y)) { lo = Math.min(lo, d); hi = Math.max(hi, d) }
    }
  if (lo === Infinity || lo > -0.2 * span || hi < 0.2 * span) return null
  return hi - lo
}

function fitBox(rgbA, rgbB, row, r) {
  const [, , w, hh] = tilesBox(row)
  const [px, py] = rowPivot(row)
  const h = row.hOurs * row.pose.scale
  const wA = rowWidth(rgbA, px, py, w * 0.62, h, row.pose.rot)
  const wB = rowWidth(rgbB, px + r.dx, py + r.dy, w * r.s * 0.62, h * r.s, row.pose.rot + r.rot)
  if (!wA || !wB) return null
  return { s: (wB / wA), wA, wB }
}

/** The journal's own residual, through the page's art window (clip-fit's
 *  `fitPage`, narrowed: the anchors are measured, so it is never far from 1). */
function fitArt(rgbA, rgbB, art) {
  const [x, y, w, h] = art
  return fitPair(rgbA, rgbB, boxMask(x, y, w, h), boxMask(x - w / 2, y - h / 2, 2 * w, 2 * h),
    [x + w / 2, y + h / 2], { sRange: [0.85, 1.18], rRange: [-3, 3], dSpan: 160 })
}

/** Resample through a similarity we choose (clip-fit's warpRgb): a feature at
 *  `p` lands at `piv + s0 * (p - piv) + d`. Bilinear, for the reason given there. */
function warpRgb(src, piv, s0, dx0, dy0) {
  const b = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = piv[0] + (x - piv[0] - dx0) / s0
      const sy = piv[1] + (y - piv[1] - dy0) / s0
      const ix = Math.floor(sx), iy = Math.floor(sy)
      if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) continue
      const fx = sx - ix, fy = sy - iy
      const o = (y * W + x) * 3, q = (iy * W + ix) * 3
      for (let c = 0; c < 3; c++)
        b[o + c] = src[q + c] * (1 - fx) * (1 - fy) + src[q + 3 + c] * fx * (1 - fy) +
                   src[q + W * 3 + c] * (1 - fx) * fy + src[q + W * 3 + 3 + c] * fx * fy
    }
  return b
}

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

/** Park the player at `t` and leave the scene measurable — clip-fit's PARK,
 *  verbatim, for the same three reasons it gives. */
const PARK = t => `(async () => {
  const s = window.__story, v = s.video
  s.seek(${t})
  await new Promise(r => setTimeout(r, 900))
  v.pause(); s.tl.pause()
  v.currentTime = ${t}
  await new Promise(r => {
    if (Math.abs(v.currentTime - ${t}) < 0.02) return r()
    v.addEventListener('seeked', r, { once: true })
    setTimeout(r, 1500)
  })
  s.tl.seek(${t}, false)
  s.applySegment?.(${t})
  if (s.hoverTl) s.hoverTl.pause()
  const hv = document.querySelector('.journal-hover')
  if (hv) hv.style.transform = 'none'
  const ui = document.querySelector('.stage__ui'); if (ui) ui.style.display = 'none'
  const fl = document.querySelector('.fly-layer'); if (fl) fl.style.visibility = 'hidden'
  return { t: s.tl.time() }
})()`

/**
 * THE ROW, OFF OUR DOM. Every tile's projected box on the 1080x1920 canvas,
 * the row's text and its laid-out tile height in design px (computed height
 * over --u: a layout metric, so the pose cannot touch it — ADR-0004), plus our
 * pose so a screen shift can be put back into page px.
 */
const ROW = `(() => {
  const dpr = 2
  const active = document.querySelector('.journal-page--active')
  if (!active) return null
  const el = [...active.querySelectorAll('.j-tiles')].find(e => e.getBoundingClientRect().width > 1)
  if (!el) return null
  const box = r => [r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr]
  const tiles = [...el.querySelectorAll('.j-tile')]
  // The design unit the way useJournalFit derives it: --u itself is a
  // container-query expression and does not read back as a number.
  const st = document.querySelector('.stage')
  const jb = document.querySelector('.journal-box')
  const u = jb.offsetWidth / parseFloat(getComputedStyle(st).getPropertyValue('--jw'))
  const g = (window.__story && window.__story.gsap) || window.gsap
  const num = p => { const v = g ? Number(g.getProperty(jb, p)) : NaN; return Number.isFinite(v) ? v : 0 }
  return {
    page: active.dataset.page || '',
    text: el.textContent.trim(),
    box: box(el.getBoundingClientRect()),
    tiles: tiles.map(t => box(t.getBoundingClientRect())),
    hOurs: parseFloat(getComputedStyle(tiles[0]).height) / u,
    wOurs: tiles.map(t => parseFloat(getComputedStyle(t).width) / u),
    tileFit: el.style.getPropertyValue('--tile-fit') || '1',
    pose: { rot: num('rotationZ'), scale: num('scaleX') },
  }
})()`

/** The page's art window — clip-fit's ART, verbatim. */
const ART = `(() => {
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

/** Force a `--tile-fit` on the active row (self-test 2), or clear it. */
const SET_FIT = f => `(() => {
  const active = document.querySelector('.journal-page--active')
  const el = [...active.querySelectorAll('.j-tiles')].find(e => e.getBoundingClientRect().width > 1)
  ${f == null ? "el.style.removeProperty('--tile-fit')" : `el.style.setProperty('--tile-fit', '${f}')`}
  return true
})()`

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--user-data-dir=/tmp/tilefit-${PORT}`, 'about:blank',
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
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 2, mobile: true })
await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html${process.env.FIT_QUERY ?? CLIP_QUERY}` })
await sleep(7000)

async function shoot(file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return rgbOfPng(file)
}

/** Park at t; return our screenshot as RGB, the row and the art window. */
async function ourFrame(t, file) {
  await cdp.eval(PARK(t))
  await sleep(320)
  const row = await cdp.eval(ROW)
  const art = await cdp.eval(ART)
  const rgb = await shoot(file)
  return { rgb, row, art }
}

// ===========================================================================
// REPORTING
// ===========================================================================

/** A screen shift, put back into page design px: undo our in-plane rotation,
 *  then our pose scale (one page px is one scene px before the pose, ADR-0010). */
function toPagePx(dx, dy, pose) {
  const r = (-pose.rot * Math.PI) / 180
  const x = dx * Math.cos(r) - dy * Math.sin(r), y = dx * Math.sin(r) + dy * Math.cos(r)
  return [x / pose.scale, y / pose.scale]
}

const fmt = (r, w = 8, d = 3) => r.toFixed(d).padStart(w)
const sign = (v, d = 0) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

/**
 * Ours and the clip's, THE SAME WINDOW OF THE SAME SECOND, side by side. The
 * window is the union of our row and where the fit says the clip's row is,
 * padded, so the size difference is read straight off the sheet with no
 * scaling of either half.
 */
function sheet(oursPng, t, row, fit, file) {
  const [x, y, w, h] = tilesBox(row)
  const [px, py] = rowPivot(row)
  const cx1 = px + fit.dx, cy1 = py + fit.dy, w1 = w * fit.s, h1 = h * fit.s
  const x0 = Math.min(x, cx1 - w1 / 2), x1 = Math.max(x + w, cx1 + w1 / 2)
  const y0 = Math.min(y, cy1 - h1 / 2), y1 = Math.max(y + h, cy1 + h1 / 2)
  const padX = (x1 - x0) * 0.2, padY = (y1 - y0) * 0.5
  const cx = Math.max(0, Math.round(x0 - padX)), cy = Math.max(0, Math.round(y0 - padY))
  const cw = Math.min(W - cx, Math.round(x1 - x0 + 2 * padX)), ch = Math.min(H - cy, Math.round(y1 - y0 + 2 * padY))
  const crop = `crop=${cw}:${ch}:${cx}:${cy}`
  ff(['-y', '-i', oursPng, '-ss', String(t), '-i', CLIP, '-filter_complex',
    `[0]${crop}[a];[1]${crop},pad=iw+6:ih:6:0:0x808080[b];[a][b]hstack`, '-frames:v', '1', file])
}

/**
 * OURS WARPED BY THE FIT, AVERAGED WITH THE CLIP, in the sheet's window. At a
 * right answer the tile borders read as one line; at a wrong one they double,
 * and the doubling shows the size and the direction of the error. The warp
 * carries the fit's scale and shift; its rotation (under two degrees on every
 * page measured) is left out.
 */
function blendSheet(rgbA, rgbB, t, row, fit, file) {
  const warped = warpRgb(rgbA, rowPivot(row), fit.s, fit.dx, fit.dy)
  const mix = Buffer.alloc(W * H * 3)
  for (let i = 0; i < mix.length; i++) mix[i] = (warped[i] + rgbB[i]) >> 1
  const [x, y, w, h] = tilesBox(row)
  const [px, py] = rowPivot(row)
  const cx1 = px + fit.dx, cy1 = py + fit.dy, w1 = w * fit.s, h1 = h * fit.s
  const x0 = Math.min(x, cx1 - w1 / 2), x1 = Math.max(x + w, cx1 + w1 / 2)
  const y0 = Math.min(y, cy1 - h1 / 2), y1 = Math.max(y + h, cy1 + h1 / 2)
  const padX = (x1 - x0) * 0.2, padY = (y1 - y0) * 0.5
  const cx = Math.max(0, Math.round(x0 - padX)), cy = Math.max(0, Math.round(y0 - padY))
  const cw = Math.min(W - cx, Math.round(x1 - x0 + 2 * padX)), ch = Math.min(H - cy, Math.round(y1 - y0 + 2 * padY))
  writeFileSync(`${OUT}/.mix.rgb`, mix)
  ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', `${OUT}/.mix.rgb`,
    '-vf', `crop=${cw}:${ch}:${cx}:${cy}`, '-frames:v', '1', file])
}

// ===========================================================================
// --selftest
// ===========================================================================

if (argv.includes('--selftest')) {
  let fails = 0
  const t = 32.0
  console.log('SELF-TEST — the method against answers known in advance.\n')
  const { rgb: A, row } = await ourFrame(t, `${OUT}/.self-a.png`)
  if (!row) { console.log('no digit row on screen at', t); process.exit(2) }
  console.log(`1. Our own frame (${row.page}, "${row.text}", t ${t}) warped by a known scale`)
  console.log('   and shift about the row\'s centre, and measured back.\n')
  console.log('   applied              recovered            err size   err px')
  for (const [s0, dx0, dy0] of [[1.0, 0, 0], [1.6, 30, -20], [2.1, -40, 25], [0.8, 15, 10]]) {
    const B = warpRgb(A, rowPivot(row), s0, dx0, dy0)
    const r = fitRow(A, B, row)
    const errS = Math.abs(r.s - s0) / s0 * 100
    const errD = Math.hypot(r.dx - dx0, r.dy - dy0)
    const bad = errS > 1.0 || errD > 4
    if (bad) fails++
    console.log(`   x${s0.toFixed(2)} ${sign(dx0).padStart(4)}/${sign(dy0).padStart(4)}` +
      `        x${r.s.toFixed(3)} ${sign(r.dx).padStart(5)}/${sign(r.dy).padStart(5)}` +
      `     ${errS.toFixed(2)} %`.padStart(11) + `${errD.toFixed(1)} px`.padStart(10) +
      `   score ${r.v.toFixed(3)}` + (bad ? '   FAIL' : ''))
  }

  console.log('\n2. The row re-rendered by the browser at a --tile-fit we choose, against the')
  console.log('   untouched render. The expected answer is read off the DOM, not assumed.\n')
  console.log('   fit    expected             recovered            err size   err px')
  for (const f of [1.5, 0.75, 2.0]) {
    await cdp.eval(SET_FIT(f))
    await sleep(250)
    const rowB = await cdp.eval(ROW)
    const B = await shoot(`${OUT}/.self-b.png`)
    await cdp.eval(SET_FIT(null))
    await sleep(250)
    // A tile's own rect scales with the tile; the flex row's does not (see tilesBox).
    const sExp = rowB.tiles[0][3] / row.tiles[0][3]
    const [pxA, pyA] = rowPivot(row), [pxB, pyB] = rowPivot(rowB)
    const dxExp = pxB - pxA, dyExp = pyB - pyA
    const r = fitRow(A, B, row)
    const errS = Math.abs(r.s - sExp) / sExp * 100
    const errD = Math.hypot(r.dx - dxExp, r.dy - dyExp)
    const bad = errS > 1.5 || errD > 5
    if (bad) fails++
    console.log(`   ${f.toFixed(2)}   x${sExp.toFixed(3)} ${sign(dxExp).padStart(5)}/${sign(dyExp).padStart(5)}` +
      `      x${r.s.toFixed(3)} ${sign(r.dx).padStart(5)}/${sign(r.dy).padStart(5)}` +
      `     ${errS.toFixed(2)} %`.padStart(11) + `${errD.toFixed(1)} px`.padStart(10) +
      `   score ${r.v.toFixed(3)}  rival ${r.rival.toFixed(3)}` + (bad ? '   FAIL' : ''))
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed')
  process.exit(fails ? 1 : 0)
}

// ===========================================================================
// MEASURE
// ===========================================================================

const want = argv.filter(a => !a.startsWith('--') && a !== String(N)).map(Number).filter(Boolean)
const frames = want.length ? want : TILE_FRAMES

console.log('THE DIGIT TILES THE CLIP DRAWS, page by page, from several seconds of each.')
console.log('row   = the clip\'s row over ours, as the register finds it (size, shift px, score, rival)')
console.log('art   = the journal\'s own residual through the art window, the same way')
console.log('H     = our tile height in design px times row / art: the clip\'s tile height')
console.log('dy    = where the clip keeps the row\'s centre against ours, page design px\n')

const out = []
for (const frame of frames) {
  const i = SLIDES.findIndex(s => s.frame === frame)
  if (i < 0) { console.log(`frame ${frame}: not in slides.js`); continue }
  const s = SLIDES[i], next = SLIDES[i + 1]
  const t0 = s.at + LEAD, t1 = (next ? next.at : s.at + 4) - TAIL
  const ts = [...new Set(Array.from({ length: N }, (_, k) => +(t0 + ((t1 - t0) * k) / Math.max(1, N - 1)).toFixed(3)))]
  console.log(`frame ${frame} ${s.page}`)
  console.log('      t   text  h_ours     row: size   shift     rot   score  rival     art: size  score  rival        H     dy   box by row width -> H')
  const got = []
  for (const t of ts) {
    const file = `${OUT}/.ours-${frame}-${t}.png`
    const { rgb, row, art } = await ourFrame(t, file)
    if (!row) { console.log(`  ${t.toFixed(2)}  (no digit row on screen)`); continue }
    const clip = rgbOfVideo(CLIP, t)
    const r = fitRow(rgb, clip, row)
    const a = art ? fitArt(rgb, clip, art) : null
    const sArt = a && !a.shaky ? a.s : 1
    const Hc = row.hOurs * r.s / sArt
    const bx = fitBox(rgb, clip, row, r)
    const Hb = bx ? row.hOurs * bx.s / sArt : null
    const [dxp, dyp] = toPagePx(r.dx, r.dy, row.pose)
    const g = { t, text: row.text, hOurs: +row.hOurs.toFixed(2), s: +r.s.toFixed(4), dx: +r.dx.toFixed(1), dy: +r.dy.toFixed(1),
      rot: +r.rot.toFixed(2), score: +r.v.toFixed(3), rival: +r.rival.toFixed(3), shaky: r.shaky,
      art: a ? { s: +a.s.toFixed(4), score: +a.v.toFixed(3), rival: +a.rival.toFixed(3), shaky: a.shaky } : null,
      H: +Hc.toFixed(1), dxPage: +dxp.toFixed(1), dyPage: +dyp.toFixed(1), pose: row.pose,
      box: bx ? { s: +bx.s.toFixed(4), wOurs: +bx.wA.toFixed(1), wClip: +bx.wB.toFixed(1), H: +Hb.toFixed(1) } : null,
      pivot: rowPivot(row).map(v => +v.toFixed(1)), tiles: row.tiles.map(b => b.map(v => +v.toFixed(1))) }
    got.push(g)
    sheet(file, t, row, r, `${OUT}/row-${frame}-${t}.png`)
    blendSheet(rgb, clip, t, row, r, `${OUT}/blend-${frame}-${t}.png`)
    if (bx) blendSheet(rgb, clip, t, row, { ...r, s: bx.s }, `${OUT}/blend-box-${frame}-${t}.png`)
    console.log('  ' + t.toFixed(2).padStart(6) + row.text.padStart(6) + fmt(row.hOurs, 8, 1) +
      `       x${r.s.toFixed(3)}` + `${sign(r.dx)}/${sign(r.dy)}`.padStart(10) + fmt(r.rot, 8, 2) + fmt(r.v, 8) + fmt(r.rival, 7) +
      (a ? `       x${a.s.toFixed(3)}` + fmt(a.v, 7) + fmt(a.rival, 7) : '        (no art)'.padEnd(29)) +
      fmt(Hc, 9, 1) + fmt(dyp, 7, 1) +
      (bx ? `   width ${bx.wA.toFixed(0)} -> ${bx.wB.toFixed(0)} x${bx.s.toFixed(3)} -> ${Hb.toFixed(1)}` : '   width: not found') +
      (r.shaky ? '   no peak' : '') + (a && a.shaky ? '   art: no peak' : ''))
  }
  if (!got.length) { console.log('  (nothing measurable)\n'); continue }
  const firm = got.filter(g => !g.shaky)
  const rep = firm.length >= 2 ? firm : got
  const row = {
    frame, page: s.page, n: rep.length, firm: firm.length, of: got.length,
    hOurs: rep[0].hOurs, text: rep[0].text,
    H: +med(rep.map(g => g.H)).toFixed(1),
    ratio: +med(rep.map(g => g.H / g.hOurs)).toFixed(4),
    dyPage: +med(rep.map(g => g.dyPage)).toFixed(1),
    dxPage: +med(rep.map(g => g.dxPage)).toFixed(1),
    Hbox: (() => { const b = rep.filter(g => g.box).map(g => g.box.H); return b.length ? +med(b).toFixed(1) : null })(),
    ratioBox: (() => { const b = rep.filter(g => g.box).map(g => g.box.H / g.hOurs); return b.length ? +med(b).toFixed(4) : null })(),
    spreadBoxPct: (() => { const b = rep.filter(g => g.box).map(g => g.box.H); return b.length ? +(spread(b) / med(b) * 100).toFixed(1) : null })(),
    nBox: rep.filter(g => g.box).length,
    spreadPct: +(spread(rep.map(g => g.H)) / med(rep.map(g => g.H)) * 100).toFixed(1),
    spreadDy: +spread(rep.map(g => g.dyPage)).toFixed(1),
    samples: got,
  }
  out.push(row)
  console.log(`  MEDIAN of ${rep.length}${firm.length >= 2 ? ' firm' : ' (no firm majority — all used)'}` +
    `   H ${row.H} (x${row.ratio} of ours ${row.hOurs})   centre dx ${row.dxPage} dy ${row.dyPage} page px`)
  console.log(`  SPREAD   H ${row.spreadPct} %   dy ${row.spreadDy} px` +
    (row.Hbox ? `      BOX by row width  H ${row.Hbox} (x${row.ratioBox})  spread ${row.spreadBoxPct} %  of ${row.nBox}` : '      BOX: not found') + '\n')
}
writeFileSync(`${OUT}/tiles.json`, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), rows: out }, null, 1))
console.log(`-> ${OUT}/tiles.json  and  ${OUT}/row-<frame>-<t>.png (ours | clip, same window, same second)`)
process.exit(0)
