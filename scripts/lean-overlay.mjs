#!/usr/bin/env node
/**
 * THE PICTURE BEHIND THE NUMBER — our page as it ships, our page at the
 * measured lean, and the clip, at the same instant.
 *
 *   node scripts/lean-overlay.mjs --slide 20
 *   node scripts/lean-overlay.mjs --t 68.67 --t 70.37
 *
 * The rule this project runs on, from the session rules: a gate is not proof,
 * and a picture without a number lies just as readily as a number without a
 * picture. `journal-lean-path.mjs` prints the numbers; this prints what they
 * look like. Three frames per instant and two blends:
 *
 *   -clip    the reference frame
 *   -ships   our page exactly as the build plays it today (SLIDE_LEAN, one
 *            constant angle held across the whole slide)
 *   -lean    our page at the angle measured FOR THAT INSTANT
 *   -blend-ships / -blend-lean   each of the two at 50 % over the clip
 *
 * At 50 % anything that agrees reads as one page and anything that does not
 * doubles — the same way review.html is read, and for the same reason: the
 * doubling shows the size AND the direction of the error, which no single
 * number does. Nothing here writes to src/; the page is leaned through the
 * debug hook, in a headless browser, and the build is untouched.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { openStage, shoot, PARK, TILT, W, H, sleep } from './lib/tiltprobe.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const CLIP = process.env.TILT_CLIP || `${ROOT}_refs/DP-15152 - preview.mp4`
const OUT = process.env.TILT_SHOTS || `${ROOT}_refs/tilt/shots`
const PATHJSON = process.env.TILT_PATH || `${ROOT}_refs/tilt/lean-path.json`
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const PERSP = Number(process.env.TILT_PERSP || 1800)
const argv = process.argv.slice(2)
const ff = a => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { maxBuffer: 1 << 29 })

const norm = (src, dst) => ff(['-i', src, '-vf', `scale=${W}:${H}:flags=lanczos`, dst])
const blend = (a, b, dst) =>
  ff(['-i', a, '-i', b, '-filter_complex', '[0][1]blend=all_mode=average', dst])
/** Side by side, so a doubling can be checked against the undoubled pair. */
const strip = (files, dst) =>
  ff([...files.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${files.length}`, dst])

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const rows = JSON.parse(readFileSync(PATHJSON, 'utf8'))
  const ts = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--t') ts.push(Number(argv[i + 1]))
    if (argv[i] === '--slide')
      for (const r of rows.filter(r => r.frame === Number(argv[i + 1]))) ts.push(r.t)
  }
  if (!ts.length) for (const r of rows) ts.push(r.t)

  const { cdp, ws } = await openStage({
    port: Number(process.env.TILT_PORT || 9404),
    profile: 'leanshot-profile',
    origin: ORIGIN,
  })

  console.log('    t   frame  measured rX  measured rY   files')
  for (const t of ts) {
    const row = rows.find(r => Math.abs(r.t - t) < 1e-6)
    if (!row) {
      console.log(`${String(t).padStart(6)}  no measurement at this instant`)
      continue
    }
    await cdp.eval(PARK(t))
    await sleep(120)
    const tag = `${String(row.frame).padStart(2, '0')}-${t.toFixed(2)}`

    // AS IT SHIPS: park and photograph, touching no transform at all, so the
    // constant SLIDE_LEAN the build plays is exactly what lands in the picture.
    const shipsRaw = `${OUT}/.ships.png`
    const s1 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(shipsRaw, Buffer.from(s1.data, 'base64'))

    const leanRaw = `${OUT}/.lean.png`
    await shoot(cdp, row.rx, row.ry, PERSP, leanRaw)

    const clip = `${OUT}/${tag}-clip.png`
    ff(['-ss', String(t), '-i', CLIP, '-frames:v', '1', '-vf', `scale=${W}:${H}`, clip])
    const ships = `${OUT}/${tag}-ships.png`
    const lean = `${OUT}/${tag}-lean.png`
    norm(shipsRaw, ships)
    norm(leanRaw, lean)
    blend(clip, ships, `${OUT}/${tag}-blend-ships.png`)
    blend(clip, lean, `${OUT}/${tag}-blend-lean.png`)
    strip([clip, ships, lean], `${OUT}/${tag}-row.png`)

    // leave the page as we found it before the next park
    await cdp.eval(TILT(0, 0, 1800))
    console.log(
      String(t).padStart(6),
      String(row.frame).padStart(5),
      row.rx.toFixed(2).padStart(11) + '°',
      row.ry.toFixed(2).padStart(12) + '°',
      `   ${tag}-*.png`,
    )
  }
  console.log(`\n-> ${OUT}`)
  ws.close()
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
