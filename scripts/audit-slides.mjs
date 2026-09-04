#!/usr/bin/env node
/**
 * THE THREE-WAY SLIDE AUDIT.
 *
 * For every one of the 27 storyboard slides it puts three pictures side by side
 * — OUR dev build, the reference CLIP at the same timecode, and the FIGMA
 * storyboard frame — and prints the numbers underneath them.
 *
 *   node scripts/audit-slides.mjs                 # all slides
 *   node scripts/audit-slides.mjs 8 10 14         # just these
 *   AUDIT_OUT=/tmp/audit node scripts/audit-slides.mjs
 *
 * WHY THIS EXISTS. Every gate in this repo so far compared the build against a
 * TABLE that had itself been derived from the mock, and every one of them was
 * green while the owner rejected the build on sight. `pose:check` cannot fail
 * for a pose error, because the pose table is what it checks against. This
 * script is the first thing here that compares the build against the two
 * ORIGINALS, and it deliberately produces pictures a human can judge as well as
 * numbers, because the two disagree more often than is comfortable.
 *
 * THE THREE SOURCES AND WHAT EACH IS GOOD FOR
 *   ours    the live dev server, parked and screenshotted through CDP. The
 *           journal's box is read from the DOM, so it is exact rather than
 *           measured.
 *   clip    `_refs/DP-15152 - preview.mp4`. Authoritative for MOTION — where
 *           things are at a given second, and how they move.
 *   mock    `_refs/storyboard/frNN.png` + `scripts/storyboard.json`, both off
 *           Figma section 21770:4582. Authoritative for STATIC geometry the
 *           clip cannot resolve: which objects exist, their size, and — from
 *           the paint order — whether they belong in front of the journal or
 *           behind it.
 *
 * MEASURING THE JOURNAL IN THE CLIP IS THE HARD PART, and every silhouette
 * method tried here failed for the same reason: the journal's magenta bloom is
 * as big as the journal. `preview` minus `clean bg` isolates journal-plus-glow,
 * and there is no threshold that separates them — the mask's extremes give the
 * glow's box (full frame width on most slides, which is how an earlier session
 * came to believe the journal sat 150 px too low); a percentile of the column
 * profile cuts a fixed share off both ramps of what is, for a rotated page, a
 * TRAPEZOID, so it under-reads in proportion to the rotation and "proves" the
 * clip and the mock disagree on every slide; and fitting those ramps and
 * extrapolating to zero runs into the glow's own shoulder and over-reads past
 * the frame.
 *
 * So the clip is not compared by silhouette at all. It is compared by a
 * LANDMARK that the glow cannot touch: the page's white heading type. It is
 * present in both pictures, it is the same words at the same place, and it is
 * near-white where everything around it is magenta and dark. The identical
 * measurement is run on our screenshot and on the clip frame, and the two boxes
 * are compared. That answers the question that matters — is our page the same
 * size and in the same place as the clip's — without ever having to decide
 * where a glow ends.
 *
 * The journal's own box is still reported for OURS and for the MOCK, where both
 * are exact: ours is read off the DOM, the mock off Figma's own geometry.
 *
 * Regenerating the inputs:
 *   scripts/storyboard.json   get_metadata on 21770:4582, then the extractor
 *                             documented in that file's `_doc`
 *   _refs/storyboard/frNN.png get_screenshot on each slide's node, maxDimension
 *                             960 (they come back 540x960 = half the canvas)
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = process.env.AUDIT_OUT || `${ROOT}_refs/audit`
const CLIP = `${ROOT}_refs/DP-15152 - preview.mp4`
const CLEAN = `${ROOT}_refs/DP-15152 - clean bg.mp4`
const SB = `${ROOT}_refs/storyboard`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.AUDIT_PORT || 9366)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const W = 1080, H = 1920
/** Near-white: the heading type. Everything else on a page is magenta, gold or
 *  near-black, so this picks the type out without touching the glow. */
const WHITE = 190
/** Ignore the chrome at the top and the reflection at the very bottom. */
const BAND = [150, 1800]
/** A white pixel counts only inside a horizontal run this long — kills specks. */
const RUN = 6

const sleep = ms => new Promise(r => setTimeout(r, ms))
const sh = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30 })

// ---------------------------------------------------------------- the sources

const board = JSON.parse(readFileSync(`${ROOT}scripts/storyboard.json`, 'utf8'))

/**
 * Slide -> the second to compare at. Frames 4-24 come from slides.js; the
 * intro (1-3) and outro (25-27) carry no journal and their timecodes are the
 * landmarks in _context/30-timecodes.md.
 */
const slidesSrc = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
const SLIDES = [...slidesSrc.matchAll(
  /frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)',\s*face:\s*'([^']+)',\s*pose:\s*\{\s*rot:\s*(-?[\d.]+),\s*scale:\s*([\d.]+),\s*cx:\s*(-?[\d.]+),\s*cy:\s*(-?[\d.]+)\s*\}/g,
)].map(m => ({
  frame: +m[1], at: +m[2], page: m[3], face: m[4],
  pose: { rot: +m[5], scale: +m[6], cx: +m[7], cy: +m[8] },
}))
const LANDMARK = { 1: 0.5, 2: 1.5, 3: 2.2, 25: 88.4, 26: 92.9, 27: 93.8 }
/** Land past the whole page turn, so the clip shows a settled page and not a hairline. */
const LEAD = 0.95
const timeOf = n => {
  const s = SLIDES.find(x => x.frame === n)
  return s ? +(s.at + LEAD).toFixed(3) : LANDMARK[n]
}

// -------------------------------------------------------------- clip geometry

const frame = (file, t) =>
  sh(['-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/**
 * The journal's box in the clip, in design px, robust against its own glow.
 *
 * The difference between the two clips is the journal AND everything it lights
 * up. Taking the extremes of that mask measures the bloom. Instead: build the
 * mask, then keep only the columns and rows where the mask is dense — the page
 * is a solid quad, the glow is a thin halo, so a percentile of the column and
 * row sums separates them cleanly and without a magic pixel threshold.
 */
function headingBox(rgb) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0
  for (let y = BAND[0]; y < BAND[1]; y++) {
    let run = 0
    for (let x = 0; x <= W; x++) {
      let on = false
      if (x < W) {
        const q = (y * W + x) * 3
        on = rgb[q] > WHITE && rgb[q + 1] > WHITE && rgb[q + 2] > WHITE
      }
      if (on) run++
      else {
        if (run >= RUN) {
          const a = x - run, b = x - 1
          if (a < x0) x0 = a
          if (b > x1) x1 = b
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          n += run
        }
        run = 0
      }
    }
  }
  if (x1 < 0) return null
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, px: n }
}

const rgbOfPng = f =>
  sh(['-i', f, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

/** The heading landmark in the clip at `t`. */
function headingInClip(t) {
  return headingBox(frame(CLIP, t))
}

// ------------------------------------------------------------------- our build

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
 * Park the player and read the scene. The viewport is 540x960 at dsf 2, so the
 * screenshot is 1080x1920 and ONE SCREENSHOT PIXEL IS ONE DESIGN PIXEL — the
 * same grid the clip and the mock are on, which is what makes the three
 * pictures directly comparable without any scaling.
 *
 * The idle drift is parked at time 0 rather than left running: it is our own
 * invention, it moves the journal by up to 2.5 deg, and leaving it live would
 * put that noise into every number in the register.
 */
const PARK = t => `(async () => {
  const s = window.__story, v = s.video
  // Go through the PRODUCT's own seek, not tl.time(): seekBoth is what calls
  // applySegment, and applySegment is what makes the right page visible. Parking
  // the timeline by hand shows whatever page was last mounted — which on a jump
  // backwards is the cover, on every slide.
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
  // ...and re-render WITH events, because tl.time()/seek() suppress callbacks by
  // default and the cover -> data-page handover (--jw/--jh) is a tl.call().
  s.tl.seek(${t}, false)
  // NEUTRALISE the idle drift — do not park it at time 0. Every property in
  // hover() is a fromTo starting at MINUS its amplitude, so time 0 is the
  // drift's extreme, not its neutral: scale 0.988, rotY -2.5deg, rotX -1.5deg.
  // Parking there shrank every journal in this register by 2.3 % and made the
  // build look closer to the clip than it is. The drift is our own invention
  // and has no counterpart in the reference, so the honest comparison is with
  // it switched off. Clearing the inline transform is safe while paused: GSAP
  // only rewrites it on its next render, and there is not going to be one.
  if (s.hoverTl) s.hoverTl.pause()
  const hv = document.querySelector('.journal-hover')
  if (hv) hv.style.transform = 'none'
  return { vt: v.currentTime, tt: s.tl.time() }
})()`

const MEASURE = `(() => {
  const cv = document.querySelector('.stage-3d').getBoundingClientRect()
  const st = document.querySelector('.stage')
  const box = document.querySelector('.journal-box')
  const u = box.offsetWidth / parseFloat(getComputedStyle(st).getPropertyValue('--jw'))
  const r = box.getBoundingClientRect()
  const vis = getComputedStyle(document.querySelector('.journal-pos')).visibility !== 'hidden'
  const objs = []
  for (const el of document.querySelectorAll('.fly-obj[data-fly]')) {
    if (getComputedStyle(el).visibility === 'hidden') continue
    const b = el.querySelector('.fly-obj__box'), br = b.getBoundingClientRect()
    const jr = box.getBoundingClientRect()
    const ox = Math.max(br.left, jr.left), oy = Math.max(br.top, jr.top)
    const ex = Math.min(br.right, jr.right), ey = Math.min(br.bottom, jr.bottom)
    let over = null
    if (ex > ox && ey > oy) {
      const prev = b.style.pointerEvents
      b.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint((ox + ex) / 2, (oy + ey) / 2)
      b.style.pointerEvents = prev
      over = hit ? (hit.closest('.fly-obj') ? 'front' : hit.closest('.journal-pos') ? 'behind' : 'other') : null
    }
    objs.push({ id: el.dataset.fly,
      x: (br.left - cv.left) / u, y: (br.top - cv.top) / u,
      w: br.width / u, h: br.height / u, over })
  }
  return { vis, u,
    journal: { x: (r.left - cv.left) / u, y: (r.top - cv.top) / u, w: r.width / u, h: r.height / u },
    objs }
})()`

// -------------------------------------------------------------------- compose

const label = (text, w) => {
  const f = `${OUT}/.label.png`
  sh(['-y', '-f', 'lavfi', '-i', `color=c=0x101014:s=${w}x1`, '-frames:v', '1', f])
  return f
}

/** ours | clip | mock, each 1080x1920 scaled to a third of the sheet. */
function sheet(n, ours, clip, mock) {
  const cell = 360, id = String(n).padStart(2, '0')
  sh(['-y', '-i', ours, '-i', clip, '-i', mock, '-filter_complex',
    `[0]scale=${cell}:${cell * 16 / 9}[a];[1]scale=${cell}:${cell * 16 / 9}[b];` +
    `[2]scale=${cell}:${cell * 16 / 9}[c];[a][b][c]hstack=3`,
    '-update', '1', '-frames:v', '1', `${OUT}/slide${id}.png`])
  // The blend is the artefact that actually settles arguments: ours and the
  // clip at 50 % each, on the same grid. Anything that agrees reads as one
  // picture, anything that does not reads as a double edge whose size AND
  // direction can be judged by eye. It needs no threshold and no fit, which is
  // exactly why it is here — see the note on measuring the clip above.
  sh(['-y', '-i', ours, '-i', clip, '-filter_complex', '[0][1]blend=all_mode=average',
    '-update', '1', '-frames:v', '1', `${OUT}/blend${id}.png`])
}

// ----------------------------------------------------------------------- main

const want = process.argv.slice(2).map(Number).filter(Boolean)
const SLIDE_NUMBERS = Object.keys(board.slides).map(Number).sort((a, b) => a - b)
const list = want.length ? want : SLIDE_NUMBERS

mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--user-data-dir=/tmp/audit-profile-${PORT}`, 'about:blank',
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
await cdp.send('Runtime.enable'); await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 2, mobile: true })
await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html` })
await sleep(7000)
await cdp.eval(`(() => { document.querySelector('.stage__ui').style.display = 'none'; return 1 })()`)

const rows = []
console.log('THE JOURNAL, per slide, in design px on the 1080x1920 canvas.')
console.log('ours = read off the DOM. mock = Figma 21770:4582. Both exact.')
console.log('The clip is compared by the white heading type, the one landmark its glow')
console.log('cannot reach: "page vs clip" is our heading over the clip\'s, as a size')
console.log('ratio and the shift of its centre in design px.\n')
console.log('sl     t    page                 ours w x h    mock w x h   d(mock)  |  page vs clip*')

for (const n of list) {
  const t = timeOf(n)
  const rec = board.slides[String(n)]
  const slide = SLIDES.find(x => x.frame === n)
  if (t == null) { console.log(`${String(n).padStart(2)}  (no timecode)`); continue }

  await cdp.eval(PARK(t))
  await sleep(320)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const oursPng = `${OUT}/.ours${n}.png`
  writeFileSync(oursPng, Buffer.from(shot.data, 'base64'))
  const m = await cdp.eval(MEASURE)

  const clipPng = `${OUT}/.clip${n}.png`
  sh(['-y', '-ss', String(t), '-i', CLIP, '-frames:v', '1', clipPng])
  const mockPng = `${SB}/fr${String(n).padStart(2, '0')}.png`
  if (existsSync(mockPng)) sheet(n, oursPng, clipPng, mockPng)

  // Same measurement on both pictures, so the two are directly comparable.
  const hOurs = headingBox(rgbOfPng(oursPng))
  const hClip = headingInClip(t)
  const o = m.vis ? m.journal : null
  const k = rec.journal
  const dMock = o && k ? Math.max(Math.abs(o.w - k.w), Math.abs(o.h - k.h)) : null
  // How our page sits against the clip's, read off the heading: a size ratio
  // and the shift of its centre, both in the clip's own terms.
  let ratio = null, shift = null
  if (hOurs && hClip) {
    ratio = (hOurs.w / hClip.w + hOurs.h / hClip.h) / 2
    shift = {
      x: hOurs.x + hOurs.w / 2 - (hClip.x + hClip.w / 2),
      y: hOurs.y + hOurs.h / 2 - (hClip.y + hClip.h / 2),
    }
  }
  rows.push({ n, t, page: slide?.page ?? '(no journal)', ours: o, mock: k,
    heading: { ours: hOurs, clip: hClip, ratio, shift }, objs: m.objs, board: rec })

  const fmtBox = b => (b ? `${b.w.toFixed(0)}x${b.h.toFixed(0)}`.padStart(12) : '           —')
  console.log(
    String(n).padStart(2) + t.toFixed(2).padStart(7) + '  ' + (slide?.page ?? '—').padEnd(20) +
    fmtBox(o) + fmtBox(k) +
    (dMock == null ? '        —' : dMock.toFixed(0).padStart(9)) + '  |' +
    (ratio == null ? '       —' : ('x' + ratio.toFixed(3)).padStart(8)) +
    (shift == null ? '           —' : `${shift.x >= 0 ? '+' : ''}${shift.x.toFixed(0)}/${shift.y >= 0 ? '+' : ''}${shift.y.toFixed(0)}`.padStart(12)),
  )
}

console.log('\nLEVITATING OBJECTS — ours against the storyboard\'s own paint order.')
console.log('sl  object          ours x/y      w x h     ours depth   mock says')
for (const r of rows) {
  const wanted = r.board.objects
  if (!wanted.length && !r.objs.length) continue
  for (const o of r.objs) {
    console.log(String(r.n).padStart(2) + '  ' + o.id.padEnd(15) +
      `${o.x.toFixed(0)}/${o.y.toFixed(0)}`.padStart(9) +
      `${o.w.toFixed(0)}x${o.h.toFixed(0)}`.padStart(11) +
      (o.over ?? 'no overlap').padStart(13) +
      '   ' + (wanted.length ? wanted.map(q => `${q.name} ${q.inFront ? 'IN FRONT' : 'behind'}`).join(', ') : '(none in mock)'))
  }
  if (!r.objs.length) console.log(String(r.n).padStart(2) + '  (none live)'.padEnd(15) +
    ' '.repeat(33) + wanted.map(q => `${q.name} ${q.inFront ? 'IN FRONT' : 'behind'}`).join(', '))
}

writeFileSync(`${OUT}/audit.json`, JSON.stringify(rows, null, 1))
console.log('\n* INDICATIVE ONLY. The heading landmark is the best glow-immune feature there')
console.log('  is, but on slides that carry other near-white art — the level badge, a game')
console.log('  thumbnail, the astronaut\'s visor — that art lands in the same box and moves')
console.log('  the ratio. Judge the clip by blendNN.png, not by this column.')
console.log(`\ncontact sheets, blends + audit.json -> ${OUT}`)
process.exit(0)
