#!/usr/bin/env node
/**
 * Shoot journal pages FLAT — one PNG per page, clipped to the active page box.
 *
 *   node scripts/shoot-pages.mjs <outDir> [lang] [frame ...]
 *   SHOOT_ORIGIN=http://localhost:5173 node scripts/shoot-pages.mjs /tmp/pages de
 *
 * The lab takes the WHOLE pose from the URL, so "flat" is just zero angles —
 * that is the trick session AC found and it is what makes a page comparable
 * with its Figma node at all. Feed the output to `scripts/mock-overlay.py`.
 *
 * ⚠️ THIS SCRIPT EXISTS BECAUSE IT KEEPS BEING LOST. Session AC wrote it in a
 * scratch directory, session AD needed it and it was gone, session AE (V-85)
 * wrote it a third time. It is seventy lines; it belongs in git.
 *
 * It shoots at four device pixels per design px (viewport dsf 2 x clip scale 2),
 * so a data page comes out about 1520x1860 — not smaller than the Figma export
 * it will be compared against, which is what keeps the comparison honest.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9344
const ORIGIN = process.env.SHOOT_ORIGIN || 'http://localhost:5173'
const [outDir, lang = 'en', ...frameArgs] = process.argv.slice(2)
if (!outDir) {
  console.error('usage: node scripts/shoot-pages.mjs <outDir> [lang] [frame ...]')
  process.exit(1)
}
/** Every page of the deck, by slide frame — cover, editor's note, then the run. */
const FRAMES = frameArgs.length
  ? frameArgs.map(Number)
  : [4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
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
    '--user-data-dir=/tmp/shoot-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
process.on('exit', () => {
  try {
    chrome.kill()
  } catch {}
})

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const p = list.find(t => t.type === 'page')
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl
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
      const m = JSON.parse(e.data)
      const p = this.pending.get(m.id)
      if (p) {
        this.pending.delete(m.id)
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej }))
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }
}

const ws = new WebSocket(await findTarget())
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 420,
  height: 747,
  deviceScaleFactor: 2,
  mobile: true,
})
mkdirSync(outDir, { recursive: true })

for (const f of FRAMES) {
  const url =
    `${ORIGIN}/lab.html?frame=${f}&rot=0&rotX=0&rotY=0&cx=50&cy=50&scale=0.62&jd=34` +
    `&panel=0&bg=grid&objects=0&journal=1&lang=${lang}`
  await cdp.send('Page.navigate', { url })
  // Real milliseconds: the page waits on fonts and on decoding its own art, and
  // a shot taken early lands on a half-drawn page that reads as a layout bug.
  await sleep(2200)
  const box = await cdp.eval(`(() => {
    const el = document.querySelector('.journal-page--active')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  if (!box) {
    console.log(`frame ${f}: no active page`)
    continue
  }
  const r = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 2 },
    captureBeyondViewport: true,
  })
  const file = `${outDir}/f${String(f).padStart(2, '0')}.png`
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  console.log(`frame ${f}: ${box.width.toFixed(0)}x${box.height.toFixed(0)} -> ${file}`)
}
ws.close()
chrome.kill()
process.exit(0)
