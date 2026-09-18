/**
 * THE LEAN PROBE — one browser, one scorer, shared by the measurer and its gate.
 *
 * Everything here answers a single question: with the story parked at an
 * instant, how far does OUR page have to lean in depth before it matches the
 * picture we are comparing against? The picture is a frame of the clip when we
 * are measuring, and a photograph of our own page at an angle we chose when we
 * are testing whether the method can measure at all. Nothing else differs
 * between the two uses, which is the point of putting it in one file: a gate
 * that exercises a different code path from the measurement is not a gate.
 *
 * ⚠️ AND THAT SENTENCE WAS NOT TRUE UNTIL SESSION AT-1c. `tilt-selftest.mjs` was
 * written out a second time in the same commit that created this file — its own
 * PARK, TILT, QUAD, scorer, shoot, probe and search — so the gate and the
 * measurement shared nothing, and a change here could not move a number there.
 * It imports this file now, which is what makes re-running it mean anything.
 *
 * The scoring is clip-fit's gradient registration (see lib/gradfit.mjs): only
 * the DIRECTION of the edges is compared, because the journal in the clip sits
 * inside a bloom as big as itself and any brightness-based comparison scores
 * the bloom. `journal-tilt.mjs` established the shape of this; what is new here
 * is that a candidate may be scored at any instant rather than one per slide,
 * and that it does not re-find the page from scratch every time.
 *
 * ⚠️ WHAT THE WINDOW IS, AND WHY SESSION AT-1c CHANGED IT. This file used to
 * measure through the largest <img> on the page, boxed by `getBoundingClientRect`
 * — which on six of the eight lean slides is the sheet's own gloss, and which
 * on a page turned ten to twenty degrees is a box holding as much ROOM as page.
 * The room is the same footage in both pictures being compared. clip-fit was
 * cured of this the day before; the cure is ported here in WINDOWS, QUAD and
 * makeScorer, and the gate was re-run on the result rather than trusted.
 */
import { spawn, execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import {
  W,
  H,
  pyramid,
  maskPyramid,
  register,
  descend,
  points,
  margin,
  pageMask,
  quadMask,
  localRectQuad,
  reachMask,
} from './gradfit.mjs'

export { W, H }

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const KEEP = Number(process.env.TILT_KEEP || 0.14)
export const sleep = ms => new Promise(r => setTimeout(r, ms))

const ff = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 29 })
export const rgbOfPng = f =>
  ff(['-i', f, '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
export const rgbOfVideo = (f, t) =>
  ff([
    '-ss', String(t), '-i', f, '-frames:v', '1',
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]) // prettier-ignore

// ===========================================================================
// THE BROWSER
// ===========================================================================

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

/**
 * Park the player at `t` and strip the scene down to the page.
 *
 * Verbatim from `journal-tilt.mjs`, which took it from `clip-fit.mjs`, where
 * each line was paid for: seek the story first and let it settle, THEN pin the
 * video, because the story's own seek moves the video too and the two race;
 * pause the idle drift and clear its transform, or a slow sine is sitting on
 * top of every measurement; hide the UI and the flying objects, which are not
 * part of the page and would vote in the registration.
 */
export const PARK = t => `(async () => {
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
 * Lean the page, and say how near the camera is while doing it.
 *
 * `rotationX`/`rotationY` go on `.journal-box`, which is where the page turn
 * writes them too — so a candidate angle REPLACES whatever lean the slide
 * ships, and the number that comes back is the page's absolute lean, not a
 * correction to ours. `--persp` lives on `.stage-3d` and ships at 1800 design
 * px: a long lens, under which ten degrees of lean barely bends the rectangle.
 * If the clip's camera is nearer, no angle under ours can reproduce its
 * trapezium, which is why the strength is a parameter and not a constant.
 */
export const TILT = (rx, ry, persp) => `(() => {
  const g = (window.__story && window.__story.gsap) || window.gsap
  const box = document.querySelector('.journal-box')
  if (!box) return false
  const st = document.querySelector('.stage-3d') || document.querySelector('.stage3d')
  if (st && ${persp}) st.style.setProperty('--persp', String(${persp}))
  g.set(box, { rotationX: ${rx}, rotationY: ${ry} })
  return true
})()`

/**
 * THE FRONT FACE'S FOUR CORNERS, AS THE BROWSER ITSELF PROJECTS THEM.
 *
 * ⚠️ THIS WAS ONE `getBoundingClientRect()` UNTIL AT-1c, AND A RECT IS AN
 * AXIS-ALIGNED BOX. Measured on the eight lean slides, that box ran 84 % to
 * 126 % of the whole canvas while the page itself is about half of it — on
 * slide 20 the box was LARGER THAN THE FRAME. Everything it held beyond the
 * page is ROOM, and the room is not neutral here: our render plays the clip's
 * own background behind the journal, so it is the same footage in both pictures
 * being compared and its long straight edges score the same after a shift along
 * themselves. Every mask built on it carried that room, and so did the pivot.
 *
 * Verbatim from clip-fit's QUAD: four zero-size markers at the face's corners,
 * read back with getBoundingClientRect. getBoxQuads() would be the direct way
 * and is not in this Chrome. A zero-size child has no extent to bound, so its
 * rect IS its projected point — and the browser does the perspective divide for
 * us, which is the part that cannot be reconstructed from the pose numbers
 * alone. `.jface--front` is `position: absolute` (the j-face mixin), so the
 * markers hang off the face and not off some ancestor.
 *
 * ⚠️ THE SCALE COMES OFF THE VIEWPORT, NOT OFF `.stage-3d`. The screenshot is
 * the viewport and `rgbOfPng` rescales the viewport onto the design canvas;
 * `.stage-3d` IS the canvas and on any shape that is not 9:16 it is cropped by
 * the viewport rather than equal to it. The old line asked for `.stage3d` — a
 * class that does not exist in this DOM, the element is `.stage-3d` — and fell
 * silently through to `.stage`, which is `inset: 0` of the viewport and is the
 * only reason it ever agreed. At 540x960 all three coincide; say which one is
 * meant rather than relying on that.
 */
export const QUAD = `(() => {
  const face = document.querySelector('.jface--front')
  const pos = document.querySelector('.journal-pos')
  if (!face || getComputedStyle(pos).visibility === 'hidden') return null
  const k = ${W} / window.innerWidth, kk = ${H} / window.innerHeight
  const mk = (l, t) => {
    const d = document.createElement('i')
    d.style.cssText = 'position:absolute;width:0;height:0;left:' + l + ';top:' + t + ';margin:0;padding:0'
    face.appendChild(d)
    return d
  }
  const ms = [mk('0','0'), mk('100%','0'), mk('100%','100%'), mk('0','100%')]
  const quad = ms.map(d => { const r = d.getBoundingClientRect(); return [r.left * k, r.top * kk] })
  ms.forEach(d => d.remove())
  return { quad, centre: [(quad[0][0] + quad[2][0]) / 2, (quad[0][1] + quad[2][1]) / 2] }
})()`

/**
 * EVERY WINDOW THE PAGE OFFERS, IN THE PAGE'S OWN COORDINATES.
 *
 * WHY A WINDOW ON THE ART AND NOT ON THE WHOLE FACE. The art is the one thing
 * on the page that is the SAME IMAGE FILE in both renders: our type is a
 * different edition of the copy and our digits are a different number, but the
 * galaxy, the cow and the helmet are the very files the clip was rendered from.
 *
 * ⚠️ THIS FILE'S OLD `ART` GOT THREE THINGS WRONG, ALL THREE MEASURED — the
 * same three clip-fit was cured of on 2026-09-18 and this copy carried until
 * in AT-1c. Re-measured here before the change, on all eight lean slides:
 *
 *   IT WAS NOT PICKING THE ART. The rule was "the largest <img> inside the
 *   front face", and the largest <img> on almost every page of this journal is
 *   `page__sheen` — the sheet's own gloss, an inline SVG gradient covering the
 *   page edge to edge. It won on six of the eight lean slides; on the other two
 *   the winner was a full-bleed backdrop overflowing the face. So the window
 *   was the whole page every time, and the promise above was never kept: a
 *   gradient we draw ourselves is not a file the clip was rendered from. An
 *   inline `data:` source is refused outright now — that promise written as a
 *   rule, and it throws out `page__spine` and `page__edge` with it, which are
 *   the journal's chrome rather than its art.
 *
 *   IT WAS AN AXIS-ALIGNED BOX, both for the art and for the `face` fallback.
 *   Measured: the window ran 81 % to 123 % of the canvas, and the face's own
 *   rect 84 % to 126 % — on slide 20 a box larger than the frame. See QUAD.
 *
 *   AND "LARGEST" WAS THE WRONG QUESTION ANYWAY. On slide 8 the largest real
 *   file is `galaxy-3`, a nebula — smooth, almost no gradient — and it scores
 *   no better than its own neighbourhood, while the mini cover at half the area
 *   locks hard. No property measurable on OUR side ranks those two correctly.
 *   So the choice is not made in advance any more — see makeScorer().
 *
 * The floor stays what it was: a window smaller than a seventh of the face is a
 * detail, and a detail is where a register finds coincidences.
 *
 * Ported from clip-fit's WINDOWS, and checked against it: on the eight lean
 * slides this returns the same windows clip-fit reported, slide for slide.
 */
export const WINDOWS = `(() => {
  const face = document.querySelector('.jface--front')
  if (!face) return null
  const fw = face.offsetWidth, fh = face.offsetHeight
  if (!fw || !fh) return null
  // An element's box in the FACE's own untransformed pixels. offsetLeft is
  // measured against offsetParent, so the two are walked together; anything
  // that does not land on the face is not part of the page and is dropped.
  const local = el => {
    let x = 0, y = 0, n = el
    for (let i = 0; n && n !== face && i < 16; i++) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent }
    return n === face ? [x, y, el.offsetWidth, el.offsetHeight] : null
  }
  const out = []
  for (const im of face.querySelectorAll('img')) {
    const st = getComputedStyle(im)
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.2) continue
    const src = im.currentSrc || im.src || ''
    // A file, not a gradient we drew. See the note above.
    if (!src || src.startsWith('data:')) continue
    const b = local(im)
    if (!b) continue
    const x0 = Math.max(b[0], 0), y0 = Math.max(b[1], 0)
    const x1 = Math.min(b[0] + b[2], fw), y1 = Math.min(b[1] + b[3], fh)
    if ((x1 - x0) * (y1 - y0) < fw * fh / 7) continue
    out.push({ src: src.split('/').pop(), local: [x0, y0, x1 - x0, y1 - y0] })
  }
  return { face: [fw, fh], list: out }
})()`

const READY = `(async () => {
  for (let i = 0; i < 240; i++) {
    const s = window.__story
    if (s && s.tl && s.video && s.tl.duration() > 10) return true
    await new Promise(r => setTimeout(r, 250))
  }
  return false
})()`

/** Boot a headless Chrome on its own profile and port, and park it on the story. */
/**
 * ⚠️ 540x960 AT dpr 2, NOT 420x747. The screenshot is then 1080x1920 device px,
 * which IS the design canvas, and no rescale stands between the browser and the
 * gradient field. `journal-tilt.mjs` shoots 420x747 and ffmpeg stretches its
 * 840x1494 up by 29 % before the Sobel runs — softening, on both axes, exactly
 * the edges the whole measurement is made of. clip-fit has always shot 540x960;
 * the lean tool was copied from it and this one line was not carried over.
 */
export async function openStage({ port, profile, origin, query = '', vw = 540, vh = 960 }) {
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=/tmp/${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  process.on('exit', () => {
    try {
      chrome.kill()
    } catch {}
  })
  let url = null
  for (let i = 0; i < 80 && !url; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      const p = (await r.json()).find(t => t.type === 'page')
      if (p?.webSocketDebuggerUrl) url = p.webSocketDebuggerUrl
    } catch {}
    if (!url) await sleep(250)
  }
  if (!url) throw new Error('chrome devtools endpoint never came up')
  const ws = new WebSocket(url)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.send('Page.navigate', { url: `${origin}/index.html${query}` })
  await sleep(2500)
  if (!(await cdp.eval(READY))) throw new Error('story never became ready')
  return { cdp, ws, chrome }
}

/**
 * Lean the page and photograph it. Returns the picture's own geometry with it.
 *
 * `win` is read on every shot rather than once per parking spot, so a shot is
 * self-contained — but its contents do not depend on the lean: the rectangles
 * are in the face's own untransformed pixels and `rotationX/Y` on `.journal-box`
 * moves the face, not the layout inside it. What does change per candidate is
 * `quad`, and that is what projects them.
 */
export async function shoot(cdp, rx, ry, persp, png) {
  await cdp.eval(TILT(rx, ry, persp))
  await sleep(45)
  const geo = await cdp.eval(QUAD)
  if (!geo) return null
  const win = await cdp.eval(WINDOWS)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(png, Buffer.from(shot.data, 'base64'))
  return { geo: { ...geo, win }, png }
}

// ===========================================================================
// THE SCORE
// ===========================================================================

export const REG = { sRange: [0.9, 1.12], rRange: [-6, 6], dSpan: 90 }
const DOWN = [1, 2, 4, 8]

/**
 * The same registration, told where to start and which levels to bother with.
 *
 * `register` finds a page it knows nothing about: a scale ladder at 1/8 size,
 * then a polish down all four levels. Six of the eight seconds a candidate
 * costs are spent in the two finest levels, where the mask holds two hundred
 * thousand points and the descent visits it a couple of thousand times. That
 * price buys the ability to find a page that could be anywhere — and here it
 * cannot be anywhere: between one candidate angle and the next the page moves
 * a few pixels, and between one quarter-second of the story and the next it
 * moves a few more, because its position is already fitted to the clip in
 * JOURNAL_PATH. So the full search runs ONCE per parking spot and every
 * candidate walks from its answer.
 *
 * ⚠️ WHICH LEVELS IS A MEASURED CHOICE, NOT A TASTE. `tilt-selftest --curve`
 * prints this against the full search over a whole curve; levels 2 and 1 were
 * adopted because the peak did not move (both at -7.5 deg on a planted -7.5),
 * and the run went from 8.5 s a candidate to 3.
 */
export function registerSeeded(Ap, Bp, Mp, pivot, seed, levels, strides) {
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

/** How far two windows' shifts may differ and still count as the same place. */
export const TOL = Number(process.env.TILT_TOL || 25)

/**
 * A scorer bound to one target picture and one parking spot — MEASURING
 * THROUGH THE WINDOW THE PAGE'S WINDOWS AGREE ON.
 *
 * `flat` is our page at zero lean, photographed at this same instant. It does
 * three jobs now: it chooses the window, it gives the region the target's
 * quantile is taken over — so the target's edge field is built without any
 * knowledge of the angle being hunted — and its registration is the seed every
 * candidate starts from. Seeding from the first candidate instead would be a
 * bug worth naming: the first candidate may be fifteen degrees out, and a local
 * descent started from a bad alignment stays in it.
 *
 * WHY THE WINDOW IS NOT PICKED IN ADVANCE, and why the loneliest peak is not
 * the rule either. This is clip-fit's finding, ported (`fitPage`, and
 * `_context/32-poses.md`, "ПОЧЕМУ КЛИП НЕ ОТВЕЧАЛ"): no property computable on
 * our side ranks the windows correctly — on slide 8 the nebula is both larger
 * and denser in edge energy than the mini cover, and the mini cover is the one
 * that locks. And the window that locks hardest can be answering the WRONG
 * QUESTION: that same mini cover says our journal sits 100 px right of the
 * clip's while the page, the planets and the nebula all say 7 px left, because
 * the cover is simply laid out elsewhere inside the page. That is the mock's
 * business, not the animation's — the owner, 2026-09-18: «Вёрстку мы берём из
 * журнала… Меня интересует только анимация самого журнала».
 *
 * SO EACH WINDOW IS AN INDEPENDENT WITNESS AND THE POSE IS WHAT THEY AGREE ON.
 * Every window is registered once, on the flat page, against the target; the
 * largest group whose shifts fall within `TOL` of each other is the pose, and
 * inside that group the loneliest peak speaks for it. A window that agrees with
 * nobody is not promoted whatever its confidence — it is measuring layout — and
 * it is named in `f.outside` rather than dropped silently.
 *
 * ⚠️ THE PAGE IS ALWAYS A WITNESS. It is the only window that is the journal
 * rather than something printed on it, so it is the one that cannot be
 * answering a layout question by mistake. `opt.window === 'face'` forces it
 * alone, for comparison.
 *
 * ⚠️ AND THE PIVOT IS THE FACE'S CENTRE FOR EVERY WINDOW, not each window's own
 * centre. The shifts have to be in one frame to be comparable at all, which is
 * the whole point of the agreement test.
 *
 * WHAT THIS COSTS. One full registration per window per parking spot, where
 * before there was one (or, in faithful mode, none). It is paid once and the
 * candidate walk is unchanged — and it is the same price clip-fit pays per
 * slide.
 */
export function makeScorer(rgbTarget, flat, opt = {}) {
  const levels = opt.levels || null
  const strides = opt.strides || []
  const faithful = !levels
  const list = opt.window === 'face' || !flat.geo.win ? [] : flat.geo.win.list

  // A window is a page-local rectangle, or `null` for the face itself. The quad
  // is rebuilt per candidate: everything on the page is coplanar with the page,
  // so the homography its four corners define places any of them exactly.
  //
  // ⚠️ THE FACE'S OWN SIZE IS TAKEN ONCE, OFF THE FLAT SHOT. It is layout —
  // `offsetWidth`/`offsetHeight`, which `rotationX/Y` on `.journal-box` cannot
  // touch — so it is the same for every candidate. Reading it off each shot
  // instead would put a silent fallback to the whole page in the middle of a
  // search on any shot whose WINDOWS came back empty, and a mask that changes
  // size mid-search does not measure one thing.
  const faceDims = flat.geo.win ? flat.geo.win.face : null
  const quadOf = (c, geo) =>
    c.local && faceDims ? localRectQuad(faceDims, c.local, geo.quad) : geo.quad
  const maskOf = (c, geo) => (c.local ? quadMask(quadOf(c, geo)) : pageMask(geo.quad))
  const reachOf = (c, geo) => reachMask(quadOf(c, geo), geo.centre, 2.0)

  const cands = [...list.map(c => ({ win: c.src, local: c.local })), { win: 'face', local: null }]
  const flatRgb = rgbOfPng(flat.png)
  const tried = []
  for (const c of cands) {
    const mask = maskOf(c, flat.geo)
    const Mp = maskPyramid(mask)
    const Ap = pyramid(flatRgb, KEEP, mask)
    const Bp = pyramid(rgbTarget, KEEP, reachOf(c, flat.geo))
    const best = register(Ap, Bp, Mp, flat.geo.centre, REG)
    tried.push({ ...c, r: best, rival: margin(Ap, Bp, Mp, flat.geo.centre, best) })
  }

  const lonely = x => x.r.v - x.rival
  const near = (a, b) => Math.hypot(a.r.dx - b.r.dx, a.r.dy - b.r.dy) <= TOL
  let group = []
  for (const a of tried) {
    const g = tried.filter(b => near(a, b))
    // Bigger group wins; same size, the one whose best member is loneliest.
    const conf = xs => Math.max(...xs.map(lonely))
    if (g.length > group.length || (g.length === group.length && conf(g) > conf(group))) group = g
  }
  const chosen = group.slice().sort((a, b) => lonely(b) - lonely(a))[0]
  const seed = faithful ? null : { ...chosen.r }

  const cachedB =
    opt.cacheTarget === false ? null : pyramid(rgbTarget, KEEP, reachOf(chosen, flat.geo))
  const f = (rgbA, geo) => {
    const mask = maskOf(chosen, geo)
    const Mp = maskPyramid(mask)
    const Ap = pyramid(rgbA, KEEP, mask)
    const Bp = cachedB || pyramid(rgbTarget, KEEP, reachOf(chosen, geo))
    if (faithful) return register(Ap, Bp, Mp, geo.centre, REG)
    return registerSeeded(Ap, Bp, Mp, geo.centre, { ...seed }, levels, strides)
  }
  f.seed = seed
  f.window = chosen.win
  f.group = group.map(x => x.win)
  f.outside = tried.filter(x => !group.includes(x)).map(x => x.win)
  f.spread =
    group.length > 1
      ? Math.max(...group.map(a => Math.max(...group.map(b => Math.hypot(a.r.dx - b.r.dx, a.r.dy - b.r.dy))))) // prettier-ignore
      : 0
  f.tried = tried.map(x => ({ win: x.win, dx: x.r.dx, dy: x.r.dy, v: x.r.v, rival: x.rival }))
  return f
}

/** One candidate, end to end. */
export async function probe(cdp, scorer, rx, ry, persp, png) {
  const s = await shoot(cdp, rx, ry, persp, png)
  if (!s) return null
  const r = scorer(rgbOfPng(s.png), s.geo)
  return { v: r.v, rx, ry }
}

/**
 * Find the lean: a cross, then a shrinking walk.
 *
 * rotationY is swept first and on its own, because it is the axis the page turn
 * drives and the one a lean actually lives on; rotationX is then swept at the
 * winner. A full grid costs eighty one renders to answer what a cross answers
 * in eighteen, and at three seconds a render that difference is the whole run.
 * The walk is what makes the answer finer than the grid — the rungs are three
 * to four degrees apart, so a sweep alone can never speak to a degree.
 */
export async function findLean(cdp, scorer, persp, opt = {}) {
  const grid = opt.grid || [-14, -10, -6, -3, 0, 3, 6, 10, 14]
  const png = opt.png || '/tmp/.tiltprobe.png'
  const steps = opt.steps || [2, 1, 0.5, 0.25]
  let best = opt.seedAngle ? await probe(cdp, scorer, opt.seedAngle.rx, opt.seedAngle.ry, persp, png) : null // prettier-ignore
  let probes = best ? 1 : 0
  if (!opt.seedAngle) {
    for (const ry of grid) {
      const r = await probe(cdp, scorer, 0, ry, persp, png)
      probes++
      if (r && (!best || r.v > best.v)) best = r
    }
    if (!best) return null
    for (const rx of grid) {
      if (rx === 0) continue
      const r = await probe(cdp, scorer, rx, best.ry, persp, png)
      probes++
      if (r && r.v > best.v) best = r
    }
  }
  if (!best) return null
  const coarse = { ...best }
  for (const step of steps) {
    for (let round = 0; round < 4; round++) {
      let moved = false
      for (const drx of [-step, 0, step]) {
        for (const dry of [-step, 0, step]) {
          if (!drx && !dry) continue
          const r = await probe(cdp, scorer, +(best.rx + drx).toFixed(3), +(best.ry + dry).toFixed(3), persp, png) // prettier-ignore
          probes++
          if (r && r.v > best.v) {
            best = r
            moved = true
          }
        }
      }
      if (!moved) break
    }
  }
  return { ...best, coarse, probes }
}
