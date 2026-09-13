#!/usr/bin/env node
/**
 * Build the flying-object sprites from the raw Figma exports.
 *
 * TWO things the raw exports get wrong for our purposes, both found by
 * measuring rather than by looking (see _context/33-fly-objects.md):
 *
 * 1. SOME EXPORTS ARE GROUPS, NOT OBJECTS. `points-a` is three sparkles in one
 *    700x700 frame, `cash-a` is five coins, `cup` is a mug and a saucer. In the
 *    clip those fly INDIVIDUALLY — five separate sparkle flights on frame 10,
 *    three separate coins on frame 12 — so a record naming `points-a` renders a
 *    cluster where the reference has one star. Every alpha-connected component
 *    becomes its own sprite.
 *
 * 2. THE ART FLOATS INSIDE ITS FRAME. The alpha of a raw export covers 48-88 %
 *    of the 700 px box, and the fraction differs per asset, so a `size` in
 *    design px meant one visible size for the planet and another for the milk
 *    carton. Each sprite is re-cropped to a SQUARE that hugs its own alpha, so
 *    `size` in the flight table is the object's real on-screen extent and its
 *    centre is the frame centre.
 *
 * 3. A SQUARE CROP AROUND ONE SHAPE CATCHES ITS NEIGHBOURS. This is the bug the
 *    owner spotted as "broken stars": the component mask was used only to CHOOSE
 *    the crop rectangle, and the rectangle was then cut out of the whole image,
 *    so any other shape overlapping that square came along as a shard. `spark`
 *    (one of five stars in `points-a`) and `cross` both shipped with a sliver of
 *    a neighbour riding beside them. The component's own mask is now MULTIPLIED
 *    into the alpha before the crop, so a sprite contains its shape and nothing
 *    else. The mask is dilated a few pixels first, so the artwork's own
 *    antialiased fringe survives instead of being cut to a hard edge.
 *
 *   node scripts/fly-sprites.mjs            # rebuild src/assets/objects
 *   node scripts/fly-sprites.mjs --dry
 *
 * Needs ffmpeg (decode) and cwebp (encode), same pair as
 * scripts/figma-pick-transparent.sh.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'

const SRC = new URL('../_refs/figma-objects/', import.meta.url)
const RAW = new URL('../src/assets/objects/', import.meta.url)
const N = 700

/**
 * What to keep out of each raw export, in the order the components come out
 * (largest first). `null` drops a component. An asset absent from this map is
 * copied through as a single sprite under its own name.
 */
const PLAN = {
  'points-a': ['spark'], // one shape, five sizes in the clip
  'cash-a': ['coin-face', 'coin-b', 'coin-c', 'coin-d', 'coin-edge'],
}
/** Raw exports nothing references any more — see the cover note in the table. */
const DROP = new Set(['cash-b', 'cash-c', 'cup', 'helm', 'ticket', 'points-a', 'cash-a'])

const dry = process.argv.includes('--dry')
const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : RAW.pathname

function alphaMask(file, n = N) {
  const buf = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      `format=rgba,alphaextract,scale=${n}:${n}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { maxBuffer: 1 << 28 },
  )
  const m = new Uint8Array(n * n)
  for (let p = 0; p < n * n; p++) m[p] = buf[p] > 20 ? 1 : 0
  return m
}

/** 4-way connected components, largest first. */
function parts(m, n = N, min = 300) {
  const lab = new Int32Array(n * n).fill(-1),
    out = [],
    st = new Int32Array(n * n)
  for (let s = 0; s < n * n; s++) {
    if (!m[s] || lab[s] >= 0) continue
    let sp = 0
    st[sp++] = s
    lab[s] = out.length
    const px = []
    while (sp) {
      const p = st[--sp]
      px.push(p)
      const x = p % n,
        y = (p / n) | 0
      for (const q of [x > 0 && p - 1, x < n - 1 && p + 1, y > 0 && p - n, y < n - 1 && p + n])
        if (q !== false && m[q] && lab[q] < 0) {
          lab[q] = out.length
          st[sp++] = q
        }
    }
    let x0 = n,
      y0 = n,
      x1 = -1,
      y1 = -1
    for (const p of px) {
      const x = p % n,
        y = (p / n) | 0
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    out.push({ n: px.length, px, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 })
  }
  return out.filter(c => c.n >= min).sort((a, b) => b.n - a.n)
}

/**
 * A grayscale PNG holding ONLY this component, dilated by `grow` pixels.
 *
 * Dilation matters: the component was found on a hard alpha threshold (>20), so
 * its mask stops short of the artwork's antialiased fringe. Multiplying by the
 * bare mask would shave that fringe off and leave a visibly hard edge; a few
 * pixels of growth keeps the original softness and still excludes a neighbour,
 * because the shapes in these exports are separated by far more than that.
 */
function componentMaskPng(comp, file, n = N, grow = 5) {
  const m = new Uint8Array(n * n)
  for (const p of comp.px) m[p] = 255
  const d = new Uint8Array(m)
  for (let it = 0; it < grow; it++) {
    const prev = new Uint8Array(d)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (prev[y * n + x]) continue
        if (
          (x > 0 && prev[y * n + x - 1]) ||
          (x < n - 1 && prev[y * n + x + 1]) ||
          (y > 0 && prev[(y - 1) * n + x]) ||
          (y < n - 1 && prev[(y + 1) * n + x])
        )
          d[y * n + x] = 255
      }
  }
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-s',
      `${n}x${n}`,
      '-i',
      '-',
      '-frames:v',
      '1',
      file,
    ],
    { input: Buffer.from(d) },
  )
}

if (!existsSync(SRC.pathname)) {
  console.error(
    `no raw exports in ${SRC.pathname}\n` +
      'Move the Figma exports there first (see the header of this file).',
  )
  process.exit(1)
}
mkdirSync(dir, { recursive: true })

const made = []
for (const f of readdirSync(SRC.pathname)
  .filter(x => x.endsWith('.webp'))
  .sort()) {
  const base = f.replace(/\.webp$/, '')
  const src = SRC.pathname + f
  const names = PLAN[base] || (DROP.has(base) ? [] : [base])
  if (!names.length) {
    console.log(`${base.padEnd(13)} skipped`)
    continue
  }
  const cs = parts(alphaMask(src))
  cs.slice(0, names.length).forEach((c, i) => {
    const name = names[i]
    // Square crop that hugs the alpha, 4 % breathing room so the glow filter
    // has somewhere to land and bilinear resampling never clips an edge.
    const pad = Math.round(Math.max(c.w, c.h) * 0.04)
    const side = Math.max(c.w, c.h) + pad * 2
    const x = Math.round(c.x0 + c.w / 2 - side / 2)
    const y = Math.round(c.y0 + c.h / 2 - side / 2)
    console.log(`${name.padEnd(13)} <- ${base}  ${c.w}x${c.h} -> ${side}px square`)
    if (dry) return
    const png = `${dir}/.${name}.png`
    const maskPng = `${dir}/.${name}-mask.png`
    componentMaskPng(c, maskPng)
    // Multiply this component's mask into the source alpha BEFORE cropping, so
    // the square cannot pick up a neighbouring shape. `alphaextract` +
    // `blend=multiply` + `alphamerge` rather than a plain `alphamerge` with the
    // mask, because the latter would replace the alpha and throw away the
    // artwork's own soft edge.
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      src,
      '-i',
      maskPng,
      '-filter_complex',
      `[0:v]format=rgba,scale=${N}:${N}[src];` +
        `[src]split[rgb][a0];[a0]alphaextract[a];` +
        `[1:v]format=gray,scale=${N}:${N}[m];` +
        `[a][m]blend=all_mode=multiply[am];` +
        `[rgb][am]alphamerge,crop=${side}:${side}:${x}:${y},scale=512:512[out]`,
      '-map',
      '[out]',
      '-y',
      png,
    ])
    rmSync(maskPng)
    execFileSync('cwebp', [
      '-quiet',
      '-q',
      '90',
      '-alpha_q',
      '100',
      '-m',
      '6',
      png,
      '-o',
      `${dir}/${name}.webp`,
    ])
    rmSync(png)
    made.push(name)
  })
}
console.log(`\n${made.length} sprites in ${dir}`)
