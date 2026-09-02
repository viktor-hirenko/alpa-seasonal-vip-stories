#!/usr/bin/env node
/**
 * Measure the live 3D scene numerically instead of eyeballing screenshots.
 *
 * Drives headless Chrome over the DevTools Protocol using Node's built-in
 * WebSocket (Node >= 22), so there are no dependencies to install.
 *
 *   node scripts/probe.mjs "lab.html?frame=11"            # one pose
 *   node scripts/probe.mjs --all                          # every slide
 *
 * For each slide it reports the journal's on-screen bounding box in DESIGN px
 * and the delta against the box predicted from slides.js, which is what turns
 * "looks a bit off" into "cy is 4.2 design px low".
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'

const args = process.argv.slice(2)
const all = args.includes('--all')
const target = args.find(a => !a.startsWith('--')) || 'lab.html?frame=11'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=420,747',
  '--user-data-dir=/tmp/probe-profile',
  'about:blank',
], { stdio: 'ignore' })

const cleanup = () => { try { chrome.kill() } catch {} }
process.on('exit', cleanup)

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find(t => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome devtools endpoint never came up')
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data)
      const p = this.pending.get(msg.id)
      if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result) }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }
}

/** Runs in the page. Returns the journal AABB in design px plus the raw inputs. */
const MEASURE = `(() => {
  const stage = document.querySelector('.stage')
  const box = document.querySelector('.journal-box')
  if (!stage || !box) return { error: 'no stage/box' }
  const sr = stage.getBoundingClientRect()
  const br = box.getBoundingClientRect()
  const cs = getComputedStyle(stage)
  const jw = parseFloat(cs.getPropertyValue('--jw'))
  const jh = parseFloat(cs.getPropertyValue('--jh'))
  // getComputedStyle on an unregistered custom property returns the DECLARED
  // token ("min(100cqw / 1080, ...)"), not a resolved length — so derive the
  // design-pixel unit from a known layout size instead. offsetWidth is the
  // pre-transform layout width, which is exactly --jw * --u.
  const u = box.offsetWidth / jw
  const toDesign = v => v / u
  return {
    u,
    stage: { w: sr.width, h: sr.height },
    // AABB of the transformed box, relative to the stage, in design px
    aabb: {
      x: toDesign(br.left - sr.left),
      y: toDesign(br.top - sr.top),
      w: toDesign(br.width),
      h: toDesign(br.height),
      cx: toDesign(br.left - sr.left + br.width / 2),
      cy: toDesign(br.top - sr.top + br.height / 2),
    },
    jw,
    jh,
    persp: parseFloat(cs.getPropertyValue('--persp')),
    matrix: getComputedStyle(box).transform,
  }
})()`

/** Predict the AABB from a pose the same way the pose table was solved. */
function predict(pose, jw, jh) {
  const t = (pose.rot * Math.PI) / 180
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t))
  return {
    w: pose.scale * (jw * c + jh * s),
    h: pose.scale * (jw * s + jh * c),
    cx: (pose.cx / 100) * 1080,
    cy: (pose.cy / 100) * 1920,
  }
}

const slidesSrc = readFileSync(new URL('../src/story/slides.js', import.meta.url), 'utf8')
const SLIDES = [...slidesSrc.matchAll(
  /frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)',\s*face:\s*'([^']+)',\s*pose:\s*\{\s*rot:\s*(-?[\d.]+),\s*scale:\s*([\d.]+),\s*cx:\s*(-?[\d.]+),\s*cy:\s*(-?[\d.]+)\s*\}/g,
)].map(m => ({
  frame: +m[1], at: +m[2], page: m[3], face: m[4],
  pose: { rot: +m[5], scale: +m[6], cx: +m[7], cy: +m[8] },
}))

const wsUrl = await findTarget()
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const cdp = new CDP(ws)
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
// --window-size is unreliable with a persistent profile; override the metrics
// so every probe measures the same viewport as the screenshots.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 420, height: 747, deviceScaleFactor: 2, mobile: true,
})

async function probeOne(url) {
  await cdp.send('Page.navigate', { url })
  await sleep(1400)
  return cdp.eval(MEASURE)
}

const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(1)

if (all) {
  console.log('frame page                 measured cx/cy        expected cx/cy       delta cx/cy      w/h delta')
  for (const s of SLIDES) {
    const m = await probeOne(`${ORIGIN}/lab.html?panel=0&bg=grid&frame=${s.frame}`)
    if (m.error) { console.log(`${s.frame}  ${m.error}`); continue }
    const p = predict(s.pose, m.jw, m.jh)
    console.log(
      String(s.frame).padStart(5) + '  ' + s.page.padEnd(20) +
      `${m.aabb.cx.toFixed(1)}/${m.aabb.cy.toFixed(1)}`.padStart(18) +
      `${p.cx.toFixed(1)}/${p.cy.toFixed(1)}`.padStart(20) +
      `${fmt(m.aabb.cx - p.cx)}/${fmt(m.aabb.cy - p.cy)}`.padStart(18) +
      `${fmt(m.aabb.w - p.w)}/${fmt(m.aabb.h - p.h)}`.padStart(16),
    )
  }
} else {
  const m = await probeOne(`${ORIGIN}/${target}`)
  console.log(JSON.stringify(m, null, 2))
  const frame = Number(new URL(`http://x/${target}`).searchParams.get('frame'))
  const s = SLIDES.find(x => x.frame === frame)
  if (s && !m.error) {
    const p = predict(s.pose, m.jw, m.jh)
    console.log('\nexpected AABB (design px):', JSON.stringify(p, null, 2))
    console.log('delta cx/cy:', fmt(m.aabb.cx - p.cx), fmt(m.aabb.cy - p.cy))
    console.log('delta w/h  :', fmt(m.aabb.w - p.w), fmt(m.aabb.h - p.h))
  }
}

ws.close()
cleanup()
