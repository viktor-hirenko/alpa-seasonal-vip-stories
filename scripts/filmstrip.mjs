#!/usr/bin/env node
/**
 * THE CONTACT SHEET. Frame-by-frame, ours against the clip, for eyes.
 *
 *   node scripts/filmstrip.mjs --flight all              # 27 flight overviews
 *   node scripts/filmstrip.mjs --flight coin-2 --step 4  # one flight, 4-frame step
 *   node scripts/filmstrip.mjs --t 30.1 32.0 --step 4    # a range of seconds
 *   node scripts/filmstrip.mjs --slide all               # journal layout, per slide
 *   node scripts/filmstrip.mjs --slide 19 --lang de      # ...in German
 *
 * WHY THIS EXISTS, on top of `audit-slides.mjs`. The audit takes ONE frame per
 * slide and scales the whole 1080x1920 canvas into a 360 px column, which is
 * enough to see that a journal is in the wrong place and nowhere near enough to
 * see that a glow has square corners or that a coin is the wrong coin. This
 * script keeps the pixels: every panel is a CROP at close to 1:1, centred on
 * the thing being judged, and a sheet holds few enough cells to stay readable.
 *
 * THE THREE PANELS OF A CELL
 *   OURS   our dev build, parked at t. In dev the backdrop is `ref-clean.mp4`,
 *          which is the reference room WITH the flying objects baked in and
 *          WITHOUT the journal. So this panel already answers the position
 *          question on its own: a correct flight reads as ONE object, a wrong
 *          one reads as two.
 *   CLIP   `preview.mp4` at the same second — room, objects and journal, all
 *          the reference's own. This panel alone answers the DEPTH question:
 *          if the baked object is visible where the journal is, the reference
 *          put it in front.
 *   BLEND  the two at 50 % on the same grid. Anything that agrees reads as one
 *          picture; anything that does not doubles, and the doubling shows both
 *          the size and the direction of the error. No threshold, nothing to
 *          fool yourself with.
 *
 * PARKING, and the two traps it has to step over (both cost a session before):
 *   1. `__story.seek()` hands control back to a PLAYING video, so the wait for
 *      the scene to settle is time the backdrop spends moving on — measured,
 *      tl.time() 4.0667 against video.currentTime 4.9634. Every sheet prints
 *      both numbers; if they disagree by more than a frame the cell is marked
 *      SCRAP in its own caption rather than silently believed.
 *   2. `hoverTl.time(0)` is the drift's EXTREME, not its neutral — every
 *      property in hover() is a fromTo from minus its amplitude. Parking there
 *      shrinks the journal 2.3 %. The drift is cleared instead.
 * The flying objects are deliberately left VISIBLE, unlike in clip-fit.mjs:
 * here they are the subject, not noise.
 *
 * ONE HEADLESS CHROME, one page, sequentially. Two of them fight over the
 * profile directory and produce failures that look like real ones.
 *
 * Output: `_refs/strips/*.png`, plus a cache of raw frames in
 * `_refs/strips/.cache/` so a second pass over the same seconds is free.
 */
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = process.env.STRIP_OUT || `${ROOT}_refs/strips`
const CACHE = `${OUT}/.cache`
const CLIP = `${ROOT}_refs/DP-15152 - preview.mp4`
const SB = `${ROOT}_refs/storyboard`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.STRIP_PORT || 9377)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const W = 1080, H = 1920
const FPS = 30

const sleep = ms => new Promise(r => setTimeout(r, ms))
const sh = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 30 })

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2)
const flag = (name, def = null) => {
  const i = argv.indexOf(name)
  return i < 0 ? def : argv[i + 1]
}
const has = name => argv.includes(name)

const STEP = Number(flag('--step', 4))            // in video frames
const COLS = Number(flag('--cols', 2))
const ROWS = Number(flag('--rows', 3))
const LANG = flag('--lang', 'en')
const DRIFT = has('--drift')   // keep the idle drift alive: motion, not pose
const PAD = Number(flag('--pad', 0.14))           // crop padding, share of box
const PANEL = Number(flag('--panel', 470))        // px per panel in the sheet

// ------------------------------------------------------------------ the story

const { FLY_OBJECTS } = await import(`${ROOT}src/story/flyObjects.js`)

/** slides.js parsed the same way audit-slides.mjs parses it — data, not import,
 *  because the module pulls in Vue aliases that Node cannot resolve. */
const slidesSrc = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
const SLIDES = [...slidesSrc.matchAll(
  /frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g,
)].map(m => ({ frame: +m[1], at: +m[2], page: m[3] }))

/** Page order = what the progress bar counts. The owner says "slide 6" and
 *  means the sixth SEGMENT of that bar, which is a page, not a Figma frame. */
const PAGE_ORDER = SLIDES.reduce((a, s) => (a.includes(s.page) ? a : [...a, s.page]), [])
const pageNoOf = frame => {
  const s = SLIDES.find(x => x.frame === frame)
  return s ? PAGE_ORDER.indexOf(s.page) + 1 : null
}
const frameAt = t => {
  let f = null
  for (const s of SLIDES) if (s.at <= t + 1e-6) f = s.frame
  return f
}

/** Hermite is what the runtime uses; for a crop centre a linear read is fine. */
const sampleFlight = (fl, t) => {
  const k = fl.keys
  if (t <= k[0][0]) return k[0]
  if (t >= k[k.length - 1][0]) return k[k.length - 1]
  for (let i = 1; i < k.length; i++) {
    if (k[i][0] >= t) {
      const a = k[i - 1], b = k[i], u = (t - a[0]) / (b[0] - a[0])
      return a.map((v, j) => v + (b[j] - v) * u)
    }
  }
  return k[k.length - 1]
}

// ------------------------------------------------------------------ chrome

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
 * `keepDrift` — AND WHY IT NO LONGER MATTERS, kept because the flag is in the
 * register and somebody will reach for it.
 *
 * There is no idle drift any more. It was ours, not the reference's: an
 * invented sine that existed to keep the journal alive between slides while the
 * pose table parked it. The pose is a measured path now (JOURNAL_PATH), so two
 * of our frames inside one slide differ because the JOURNAL MOVED, which is the
 * thing being judged — with or without this flag.
 *
 * What the flag used to buy: with the drift cleared, every one of our frames
 * inside a settled slide was identical by construction, so "does ours live the
 * way the clip's does" got the answer `no` before anyone looked. That trap is
 * gone with the drift itself. The flag is now a no-op on the journal;
 * `s.hoverTl` is null and the guard below simply skips.
 */
const PARK = (t, keepDrift) => `(async () => {
  const s = window.__story, v = s.video
  s.seek(${t})
  await new Promise(r => setTimeout(r, 700))
  v.pause(); s.tl.pause()
  v.currentTime = ${t}
  await new Promise(r => {
    if (Math.abs(v.currentTime - ${t}) < 0.02) return r()
    v.addEventListener('seeked', r, { once: true })
    setTimeout(r, 1500)
  })
  s.tl.seek(${t}, false)
  // ...and the PAGE back too: the wait above let the sync loop advance it.
  s.applySegment?.(${t})
  if (s.hoverTl) {
    s.hoverTl.pause()
    ${keepDrift ? `s.hoverTl.seek(${t} % s.hoverTl.duration(), false)` : ''}
  }
  const hv = document.querySelector('.journal-hover')
  if (hv && ${!keepDrift}) hv.style.transform = 'none'
  const ui = document.querySelector('.stage__ui'); if (ui) ui.style.display = 'none'
  await new Promise(r => setTimeout(r, 120))
  return { vt: v.currentTime, tt: s.tl.time() }
})()`

/**
 * Where things are, in design px on the 1080x1920 canvas. The journal comes off
 * the DOM so it is exact; each object carries the depth the browser ACTUALLY
 * renders, hit-tested at the centre of its overlap with the journal — which is
 * the only honest way to ask "in front or behind" of a 3D scene that decides it
 * by z, not by z-index.
 */
const MEASURE = `(() => {
  const cv = document.querySelector('.stage-3d').getBoundingClientRect()
  const st = document.querySelector('.stage')
  const box = document.querySelector('.journal-box')
  const u = cv.width / ${W}
  const r = box.getBoundingClientRect()
  const vis = getComputedStyle(document.querySelector('.journal-pos')).visibility !== 'hidden'
  const objs = []
  for (const el of document.querySelectorAll('.fly-obj[data-fly]')) {
    if (getComputedStyle(el).visibility === 'hidden') continue
    const b = el.querySelector('.fly-obj__box'), br = b.getBoundingClientRect()
    const jr = r
    const ox = Math.max(br.left, jr.left), oy = Math.max(br.top, jr.top)
    const ex = Math.min(br.right, jr.right), ey = Math.min(br.bottom, jr.bottom)
    let over = null, overlap = 0
    if (ex > ox && ey > oy) {
      overlap = ((ex - ox) * (ey - oy)) / (br.width * br.height)
      const prev = b.style.pointerEvents
      b.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint((ox + ex) / 2, (oy + ey) / 2)
      b.style.pointerEvents = prev
      over = hit ? (hit.closest('.fly-obj') ? 'front' : hit.closest('.journal-pos') ? 'behind' : 'other') : null
    }
    objs.push({ id: el.dataset.fly,
      x: (br.left - cv.left) / u, y: (br.top - cv.top) / u,
      w: br.width / u, h: br.height / u,
      overlap: +overlap.toFixed(3), over })
  }
  return { vis, journal: { x: (r.left - cv.left) / u, y: (r.top - cv.top) / u, w: r.width / u, h: r.height / u }, objs }
})()`

let chrome = null, cdp = null

/**
 * ONE AT A TIME, enforced rather than remembered. Two runs share this port, this
 * profile directory and `.sheet.html`, so the second one attaches to the first
 * one's page and screenshots ITS sheet: I lost a sheet to exactly that — a
 * contact sheet came back captioned `--at 12.0…38.57` and showing milkpack-1,
 * because the previous job was still composing when this one connected. A wrong
 * picture that looks like a right picture is the worst artefact this repo can
 * produce, so the second run now refuses to start.
 */
function lock() {
  const f = `${OUT}/.lock`
  if (existsSync(f)) {
    const pid = Number(readFileSync(f, 'utf8'))
    let alive = false
    try { process.kill(pid, 0); alive = true } catch {}
    if (alive) {
      console.error(`another filmstrip run is live (pid ${pid}). One headless Chrome at a time.`)
      process.exit(3)
    }
  }
  writeFileSync(f, String(process.pid))
  process.on('exit', () => { try { execFileSync('rm', ['-f', f]) } catch {} })
}

async function boot() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(CACHE, { recursive: true })
  lock()
  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--user-data-dir=/tmp/strip-profile-${PORT}`,
    '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' })
  process.on('exit', () => { try { chrome.kill() } catch {} })

  let url = null
  for (let i = 0; i < 80 && !url; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      url = (await r.json()).find(t => t.type === 'page')?.webSocketDebuggerUrl
    } catch {}
    if (!url) await sleep(250)
  }
  if (!url) throw new Error('chrome devtools endpoint never came up')
  const ws = new WebSocket(url)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  cdp = new CDP(ws)
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable')
}

/** The player, at 540x960 dsf 2: one screenshot pixel is one design pixel. */
async function openPlayer() {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Page.navigate', { url: `${ORIGIN}/index.html?lang=${LANG}` })
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    const ok = await cdp.eval(`!!(window.__story && window.__story.tl && window.__story.video)`).catch(() => false)
    if (ok) break
  }
  await sleep(1500)
}

// ------------------------------------------------------------------- capture

const key = t => t.toFixed(3)
const oursPath = t => `${CACHE}/ours-${LANG}${DRIFT ? '-drift' : ''}-${key(t)}.png`
const clipPath = t => `${CACHE}/clip-${key(t)}.png`

async function captureOurs(t) {
  const f = oursPath(t)
  const metaFile = `${f}.json`
  if (existsSync(f) && existsSync(metaFile)) return JSON.parse(readFileSync(metaFile, 'utf8'))
  const park = await cdp.eval(PARK(t, DRIFT))
  const meas = await cdp.eval(MEASURE)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(f, Buffer.from(shot.data, 'base64'))
  // THREE clocks have to agree, not two. Comparing the video against the
  // timeline catches the seek()-hands-back-to-a-playing-video trap, and misses
  // the case where BOTH are parked on the wrong second — which is what a
  // second Chrome attaching to this page produces: a frame captioned 18.6 s
  // whose scene, video and timeline all sat at 72.6 s together, and which the
  // two-clock check waved through.
  const off = Math.max(Math.abs(park.vt - park.tt), Math.abs(park.tt - t))
  const meta = { t, ...park, ...meas, scrap: off > 1 / FPS + 1e-3 }
  writeFileSync(metaFile, JSON.stringify(meta))
  return meta
}

function captureClip(t) {
  const f = clipPath(t)
  if (existsSync(f)) return f
  sh(['-y', '-ss', String(t), '-i', CLIP, '-frames:v', '1', f])
  return f
}

// ------------------------------------------------------------------- compose

/**
 * A sheet is an HTML page screenshotted by the same Chrome. ffmpeg here has no
 * drawtext (no libfreetype), and a caption that says which second you are
 * looking at is not optional — an uncaptioned contact sheet is an argument you
 * cannot check later.
 */
function sheetHtml(cells, title, note) {
  const cell = c => {
    const k = PANEL / c.crop.w
    const bg = (file, k) =>
      `background-image:url('file://${file}');background-size:${(W * k).toFixed(1)}px ${(H * k).toFixed(1)}px;` +
      `background-position:${(-c.crop.x * k).toFixed(1)}px ${(-c.crop.y * k).toFixed(1)}px`
    const ph = Math.round(c.crop.h * k)
    return `<figure class="cell${c.scrap ? ' scrap' : ''}">
      <div class="row" style="height:${ph}px">
        <div class="p" style="width:${PANEL}px;${bg(c.ours, k)}"><b>OURS</b></div>
        <div class="p" style="width:${PANEL}px;${bg(c.clip, k)}"><b>CLIP</b></div>
        <div class="p" style="width:${PANEL}px;${bg(c.ours, k)}">
          <div class="ov" style="${bg(c.clip, k)}"></div><b>BLEND</b></div>
      </div>
      <figcaption>${c.caption}</figcaption>
    </figure>`
  }
  return `<!doctype html><meta charset="utf-8"><style>
    :root{color-scheme:dark}
    body{margin:0;background:#0b0b10;color:#e8e8f0;font:13px/1.35 -apple-system,Helvetica,Arial,sans-serif}
    h1{font:600 17px/1.3 inherit;margin:14px 16px 2px}
    .note{margin:0 16px 12px;color:#9aa;font-size:12px;white-space:pre-wrap}
    .grid{display:grid;grid-template-columns:repeat(${COLS},max-content);gap:14px 18px;padding:0 16px 18px}
    .cell{margin:0}
    .row{display:flex;gap:3px}
    .p{position:relative;background-repeat:no-repeat;background-color:#000;outline:1px solid #2a2a38}
    .p b{position:absolute;left:0;top:0;background:#000a;color:#fff;font:600 10px/1 inherit;padding:3px 4px;letter-spacing:.04em}
    .ov{position:absolute;inset:0;opacity:.5;background-repeat:no-repeat}
    figcaption{margin-top:4px;font:12px/1.35 ui-monospace,Menlo,monospace;color:#cfd}
    .scrap figcaption{color:#f66}
    .scrap .row{outline:2px solid #f33}
  </style>
  <h1>${title}</h1><div class="note">${note}</div>
  <div class="grid">${cells.map(cell).join('')}</div>`
}

async function writeSheet(name, cells, title, note) {
  const file = `${OUT}/.sheet.html`
  writeFileSync(file, sheetHtml(cells, title, note))
  const k = PANEL / cells[0].crop.w
  const width = COLS * (3 * PANEL + 6) + (COLS - 1) * 18 + 32
  const height = 64 + Math.ceil(cells.length / COLS) * (Math.round(cells[0].crop.h * k) + 14 + 22) + 20
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `file://${file}` })
  await sleep(700)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log(`  -> _refs/strips/${name}.png  (${width}x${height})`)
}

// ---------------------------------------------------------------------- crops

const clampCrop = (x, y, w, h) => {
  w = Math.min(w, W); h = Math.min(h, H)
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

/** Union of our object's box and the table's expected box, padded and squared:
 *  a crop centred on ours alone would walk out of frame exactly when ours is
 *  the thing that is wrong. */
function objectCrop(meta, flight, t) {
  const s = sampleFlight(flight, t)
  const ex = { x: (s[1] / 100) * W - s[3] / 2, y: (s[2] / 100) * H - s[3] / 2, w: s[3], h: s[3] }
  const mine = meta.objs.find(o => o.id === flight.id)
  const b = mine ? {
    x0: Math.min(ex.x, mine.x), y0: Math.min(ex.y, mine.y),
    x1: Math.max(ex.x + ex.w, mine.x + mine.w), y1: Math.max(ex.y + ex.h, mine.y + mine.h),
  } : { x0: ex.x, y0: ex.y, x1: ex.x + ex.w, y1: ex.y + ex.h }
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
  const side = Math.max(520, (b.x1 - b.x0) * (1 + 2 * PAD), (b.y1 - b.y0) * (1 + 2 * PAD))
  return clampCrop(cx - side / 2, cy - side / 2, side, side)
}

function journalCrop(meta) {
  const j = meta.journal
  if (!meta.vis || !j.w) return clampCrop(0, 0, W, H)
  const px = j.w * PAD, py = j.h * PAD
  return clampCrop(j.x - px, j.y - py, j.w + 2 * px, j.h + 2 * py)
}

// ----------------------------------------------------------------------- main

const snap = t => Math.round(t * FPS) / FPS
const range = (a, b, stepFrames) => {
  const out = []
  for (let f = Math.round(a * FPS); f <= Math.round(b * FPS) + 1e-6; f += stepFrames) out.push(f / FPS)
  return out
}

await boot()
await openPlayer()

const jobs = []

if (flag('--flight')) {
  const want = flag('--flight')
  const list = want === 'all' ? FLY_OBJECTS : FLY_OBJECTS.filter(f => f.id === want)
  if (!list.length) throw new Error(`no flight named ${want}`)
  // `--win a b` narrows the window to the interesting seconds — the crossing of
  // the journal, usually — so a fine walk stays one readable sheet instead of six.
  const wi = argv.indexOf('--win')
  for (const fl of list) {
    const t0 = wi > 0 ? Number(argv[wi + 1]) : fl.keys[0][0] - 0.5
    const t1 = wi > 0 ? Number(argv[wi + 2]) : fl.keys[fl.keys.length - 1][0] + 0.5
    // An overview walks the whole flight in `cols*rows` steps; --step switches
    // to the fine walk the panel asked for.
    const ts = has('--fine')
      ? range(t0, t1, STEP)
      : Array.from({ length: COLS * ROWS }, (_, i) => snap(t0 + ((t1 - t0) * i) / (COLS * ROWS - 1)))
    jobs.push({ kind: 'flight', flight: fl, ts })
  }
} else if (flag('--slide')) {
  const want = flag('--slide')
  const list = want === 'all' ? SLIDES : SLIDES.filter(s => s.frame === Number(want))
  for (const s of list) jobs.push({ kind: 'slide', slide: s, ts: [snap(s.at + 0.95)] })
} else if (flag('--t')) {
  const i = argv.indexOf('--t')
  jobs.push({ kind: 'range', ts: range(Number(argv[i + 1]), Number(argv[i + 2]), STEP) })
} else if (flag('--at')) {
  // A named list of seconds, whole frame, no crop: the view that answers "is
  // the object over the PAGE or over the room" — a tight crop cannot, because
  // the journal's bounding box is not the page on a rotated pose.
  jobs.push({ kind: 'range', ts: flag('--at').split(',').map(s => snap(Number(s))) })
} else {
  console.error('nothing asked for: use --flight / --slide / --t')
  process.exit(2)
}

// TWO PHASES, and the order is not a style choice: composing a sheet navigates
// this one page to file://, which throws the player away. Every frame is
// captured first, with the player up the whole time; the sheets are built after.
const shots = new Map()
const uniq = [...new Set(jobs.flatMap(j => j.ts.map(key)))]
console.log(`capturing ${uniq.length} unique timecodes (${jobs.length} sheets)`)
let n = 0
for (const j of jobs) {
  for (const t of j.ts) {
    if (shots.has(key(t))) continue
    shots.set(key(t), await captureOurs(t))
    captureClip(t)
    if (++n % 20 === 0) console.log(`  ${n}/${uniq.length}`)
  }
}

for (const job of jobs) {
  const cells = []
  for (const t of job.ts) {
    const meta = shots.get(key(t))
    const clip = clipPath(t)
    const crop = job.kind === 'flight' ? objectCrop(meta, job.flight, t)
      : job.kind === 'slide' ? journalCrop(meta)
        : clampCrop(0, 0, W, H)
    const fr = frameAt(t), pg = pageNoOf(fr)
    const mine = job.flight ? meta.objs.find(o => o.id === job.flight.id) : null
    const depth = mine ? ` ours:${mine.over || 'no-overlap'}${mine.overlap ? ` ov${(mine.overlap * 100) | 0}%` : ''}` : ''
    cells.push({
      ours: oursPath(t), clip, crop, scrap: meta.scrap,
      caption: `t=${t.toFixed(3)}  frame ${fr}  page ${pg}  ` +
        `vt=${meta.vt.toFixed(3)} tt=${meta.tt.toFixed(3)}${meta.scrap ? '  SCRAP' : ''}${depth}`,
    })
  }
  const name = job.kind === 'flight' ? `fly-${job.flight.id}${has('--fine') ? '-fine' : ''}`
    : job.kind === 'slide' ? `slide-${String(job.slide.frame).padStart(2, '0')}-${job.slide.page}-${LANG}`
      : `t-${job.ts[0].toFixed(2)}-${job.ts[job.ts.length - 1].toFixed(2)}`
  const title = job.kind === 'flight'
    ? `${job.flight.id} — sprite ${job.flight.asset}, Figma frame ${job.flight.frame}, page ${pageNoOf(job.flight.frame)} of the bar, zFlip ${job.flight.zFlip}`
    : job.kind === 'slide'
      ? `Figma frame ${job.slide.frame} — ${job.slide.page} — page ${pageNoOf(job.slide.frame)} of the bar — lang ${LANG}`
      : `${job.ts[0].toFixed(2)}…${job.ts[job.ts.length - 1].toFixed(2)} s, step ${STEP} frames`
  const note = 'OURS = dev build over ref-clean.mp4 (objects baked in, no journal): one silhouette = right, two = wrong.\n'
    + 'CLIP = preview.mp4, the reference itself. BLEND = the two at 50 %.'
  await writeSheet(name, cells, title, note)
}

console.log('done')
process.exit(0)
