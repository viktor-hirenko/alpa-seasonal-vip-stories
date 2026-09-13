#!/usr/bin/env node
/**
 * Is the loading screen's logo still registered with the clip's opening frame?
 *
 *   npm run preloader:fit                    # dev server, the phone sizes
 *   PRELOADER_ORIGIN=http://localhost:4177 npm run preloader:fit   # ...the build
 *   node scripts/preloader-fit.mjs --vp 430x932
 *
 * WHY THIS EXISTS. Frame one of the backdrop clip is a RocketPlay lock-up, held
 * still for about half a second, and the inline loader in index.html fades out
 * straight into it. So the two marks are on screen together for the length of
 * the 0.35 s crossfade, and if they are not the same size in the same place the
 * logo visibly jumps at the handoff. index.html sizes the loader in the clip's
 * own unit to prevent that (`--u`, cover onto the 1080x1920 canvas), which
 * holds only as long as the clip keeps opening the way it opens today.
 *
 * THE FINAL VIDEO WILL REPLACE ref-clean.mp4/story.mp4. When it lands, run this.
 * If the new clip opens differently, the numbers in index.html are stale and no
 * other gate in this repo will notice: none of them look at the loader at all.
 *
 * HOW IT MEASURES. It pins the video on frame zero, photographs the same instant
 * twice — once with the loader forced opaque, once with it removed — and
 * compares the yellow trefoil in the two frames. The trefoil and not the
 * wordmark, for two reasons: the clip's lock-up sets the wordmark 1.5x larger
 * relative to the trefoil than the brand SVG does (they are different lock-ups
 * and no single scale reconciles them), and the trefoil is the heavier shape,
 * so it is the one the eye tracks across the cut.
 *
 * AND THE LARGEST CONNECTED BLOB, not a bbox over every yellow pixel: the mark's
 * orbiting dots are the same yellow, and a plain bbox measures the whole swarm
 * (174 px where the trefoil is 55) without failing or warning.
 */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9407
const PROFILE = `/tmp/preloaderfit-${PORT}`
const ORIGIN = process.env.PRELOADER_ORIGIN || 'http://localhost:5173'

const arg = (n, d) => {
  const i = process.argv.indexOf(n)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d
}
// Both phone shapes the other gates use, plus the desktop card, which takes its
// scale from the card and not the window and so is a separate branch in the CSS.
const VIEWPORTS = arg('--vp', '430x932,393x852,360x800,1440x900').split(',')

// What the eye starts to catch on a 0.35 s crossfade. Sub-pixel is not the goal;
// "does not jump" is.
const TOL_SIZE = 0.03 // 3 % of the clip's trefoil width
const TOL_SHIFT = 3 // CSS px

const sleep = ms => new Promise(r => setTimeout(r, ms))
rmSync(PROFILE, { recursive: true, force: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
// SIGTERM, never -9: killing headless Chrome hard makes macOS spend minutes in
// ReportCrash, and anything measured meanwhile is a lie (see 20-log.md, 08.09).
const cleanup = () => {
  try {
    chrome.kill()
  } catch {}
}
process.on('exit', cleanup)

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome devtools endpoint never came up')
}

const ws = new WebSocket(await endpoint())
await new Promise(r => ws.addEventListener('open', r))
let seq = 0
const pending = new Map()
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data)
  const p = pending.get(msg.id)
  if (p) {
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  }
})
const send = (method, params = {}) => {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}

await send('Page.enable')
await send('Runtime.enable')

// Installed once and reused per viewport: decode a screenshot and return the
// bounding box of the biggest connected run of saturated yellow, in CSS px.
const BLOB = `window.__trefoil = async (b64, dpr) => {
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64 })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const W = c.width, H = c.height, mask = new Uint8Array(W * H)
  // Nothing else in either frame is this yellow: the galaxy is magenta, so a
  // high red-minus-blue with a low blue separates the mark cleanly.
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2]
    if (r > 180 && g > 140 && b < 110 && r - b > 90) mask[p / 4] = 1
  }
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H)
  let best = null
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue
    let sp = 0; stack[sp++] = s; seen[s] = 1
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0
    while (sp) {
      const i = stack[--sp], px = i % W, py = (i / W) | 0
      n++
      if (px < x0) x0 = px; if (px > x1) x1 = px
      if (py < y0) y0 = py; if (py > y1) y1 = py
      if (px > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1 }
      if (px < W - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1 }
      if (py > 0 && mask[i - W] && !seen[i - W]) { seen[i - W] = 1; stack[sp++] = i - W }
      if (py < H - 1 && mask[i + W] && !seen[i + W]) { seen[i + W] = 1; stack[sp++] = i + W }
    }
    if (!best || n > best.n) best = { x0, y0, x1, y1, n }
  }
  if (!best) return null
  return {
    w: +((best.x1 - best.x0 + 1) / dpr).toFixed(1),
    cx: +((best.x0 + best.x1 + 1) / 2 / dpr).toFixed(1),
    cy: +((best.y0 + best.y1 + 1) / 2 / dpr).toFixed(1),
  }
}`

const rows = []
for (const vp of VIEWPORTS) {
  const [W, H] = vp.split('x').map(Number)
  const dpr = 2
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: dpr,
    mobile: W < 800,
  })
  await send('Page.navigate', { url: ORIGIN + '/' })

  // Real time, not --virtual-time-budget: virtual time fast-forwards timers but
  // does not advance media decoding, so a page gated on a video buffer never
  // gets past its own preloader under it.
  let ready = false
  for (let i = 0; i < 200 && !ready; i++) {
    ready = await evaluate(
      `(() => { const v = document.querySelector('video'); return !!v && v.readyState >= 2 })()`,
    )
    if (!ready) await sleep(100)
  }
  if (!ready)
    throw new Error(`${vp}: the backdrop video never presented a frame — is ${ORIGIN} up?`)
  await evaluate(
    `(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 0; return true })()`,
  )
  await sleep(700)

  await evaluate(`(() => {
    const p = document.querySelector('.fe-preloader')
    p.classList.remove('fe-preloader--hidden')
    p.style.transition = 'none'
    return true
  })()`)
  await sleep(300)
  const withLoader = (await send('Page.captureScreenshot', { format: 'png' })).data

  await evaluate(`(() => { document.querySelector('.fe-preloader').remove(); return true })()`)
  await sleep(300)
  const clipOnly = (await send('Page.captureScreenshot', { format: 'png' })).data

  await evaluate(BLOB)
  const loader = await evaluate(`window.__trefoil(${JSON.stringify(withLoader)}, ${dpr})`)
  const clip = await evaluate(`window.__trefoil(${JSON.stringify(clipOnly)}, ${dpr})`)
  if (!loader || !clip) throw new Error(`${vp}: no yellow mark found in one of the two frames`)

  const size = loader.w / clip.w
  const dx = loader.cx - clip.cx
  const dy = loader.cy - clip.cy
  const bad = Math.abs(size - 1) > TOL_SIZE || Math.abs(dx) > TOL_SHIFT || Math.abs(dy) > TOL_SHIFT
  rows.push({ vp, loader: loader.w, clip: clip.w, size, dx, dy, bad })
}

console.log("\nLoading-screen mark vs the clip's opening frame, at the handoff.")
console.log('Both measured on the same page, video pinned on frame zero.\n')
console.log('viewport      loader    clip     size      dx       dy')
for (const r of rows) {
  console.log(
    r.vp.padEnd(13) +
      `${r.loader}`.padStart(6) +
      ' px' +
      `${r.clip}`.padStart(7) +
      ' px' +
      `${(100 * r.size).toFixed(1)} %`.padStart(9) +
      `${r.dx.toFixed(1)}`.padStart(8) +
      `${r.dy.toFixed(1)}`.padStart(9) +
      (r.bad ? '   <-- OUT' : ''),
  )
}
const bad = rows.filter(r => r.bad).length
console.log(
  `\n${bad} viewport(s) out of tolerance (size ${100 * TOL_SIZE} %, shift ${TOL_SHIFT} px).`,
)
if (bad) {
  console.log("The clip's opening changed, or index.html did. Re-read the loader block")
  console.log('in index.html: the 707 and the -18 are design px measured off this.')
}

ws.close()
cleanup()
await sleep(300)
process.exit(bad ? 1 : 0)
