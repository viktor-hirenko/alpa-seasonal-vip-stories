#!/usr/bin/env node
/**
 * DOES THE LEAN MEASURER ACTUALLY MEASURE A LEAN? — the gate AT-1 starts with.
 *
 *   node scripts/tilt-selftest.mjs                 the standard battery
 *   node scripts/tilt-selftest.mjs --curve         score vs angle, one slide
 *   node scripts/tilt-selftest.mjs --slide 20      one slide only
 *
 * WHY THIS EXISTS. `journal-tilt.mjs` answers "how far does the clip's page
 * lean" by tilting OUR page through a grid and keeping whichever candidate
 * scores best against the clip's frame. A best-of-81 always has a winner, so
 * the number it prints is a number whether or not the method can see a lean at
 * all. Every other measurement in this project had to pass the same test before
 * its numbers were allowed into a table: the plane angle was checked against
 * five known renders (worst 0.34 deg), the flying objects against a known
 * offset (0.001), clip-fit shifts a slide and has to find it again.
 *
 * SO PLANT A KNOWN ANSWER. Lean our own page by an angle we chose, photograph
 * it, and hand that photograph to the search in place of the clip's frame. The
 * search does not know what we planted. If it comes back with our angle, the
 * method measures; if it comes back with something else, or with a score that
 * is as good three degrees away as it is at the truth, then the eight numbers
 * in SLIDE_LEAN are best-of-81 winners and nothing more.
 *
 * THE ANGLES ARE PLANTED OFF THE GRID ON PURPOSE. -7.5 deg is not a rung of the
 * production sweep (-14,-10,-6,-3,0,3,6,10,14), so a run that snaps to the
 * nearest rung cannot pass by luck: it has to refine below the rung spacing,
 * which is the only way "accurate to about a degree" can mean anything.
 *
 * TWO WORLDS, BOTH REPORTED.
 *   clean  the planted photograph exactly as the browser rendered it. This
 *          asks one question only: does the score surface peak at the truth,
 *          and can the search walk to it. At the answer the two pictures are
 *          identical, so a failure here is a failure of the search, not of the
 *          optics.
 *   codec  the same photograph pushed through h264 at the clip's own bitrate
 *          and 4:2:0 chroma, which is the one degradation we KNOW sits between
 *          us and the reference. A method that only works on its own pixels is
 *          no use against an mp4.
 *
 * WHAT IT CANNOT PROVE. The clip was rendered by other software, with its own
 * bloom, its own page artwork and its own camera. This test bounds the error
 * the METHOD adds; it cannot bound the error that difference adds. That is what
 * the margin over flat, and the eye on review.html, are for.
 *
 * ⚠️ AND WHAT IT COULD NOT PROVE UNTIL SESSION AT-1c: ANYTHING ABOUT THE PROBE.
 * `lib/tiltprobe.mjs` opens with "a gate that exercises a different code path
 * from the measurement is not a gate", and this file WAS that different code
 * path — its own PARK, TILT, QUAD, scorer, shoot, probe and search, written out
 * a second time in the same commit that created the probe. Nothing measured
 * here touched the file `journal-lean-path.mjs` measures through, so a change
 * to the probe could not move a number here and a pass here said nothing about
 * the probe. It now runs the probe itself and nothing else, which is also why
 * it shoots 540x960 as clip-fit always has: the screenshot is then 1080x1920
 * device px, the design canvas exactly, and no rescale stands between the
 * browser and the gradient field. The copy here shot 420x747 and ffmpeg
 * stretched 840x1494 up by 29 % before the Sobel ran, softening on both axes
 * precisely the edges the whole measurement is made of.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { openStage, shoot, probe, findLean, makeScorer, rgbOfPng, PARK, TILT, W, H } from './lib/tiltprobe.mjs' // prettier-ignore

const ROOT = new URL('..', import.meta.url).pathname
const OUT = process.env.TILT_OUT || `${ROOT}_refs/tilt`
const PORT = Number(process.env.TILT_PORT || 9402)
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const argv = process.argv.slice(2)
const flag = n => {
  const i = argv.indexOf(n)
  return i < 0 ? null : argv[i + 1]
}

const ff = a => execFileSync('ffmpeg', ['-v', 'error', ...a], { maxBuffer: 1 << 29 })

/**
 * The scorer's settings, read from the same environment the measurer reads.
 *
 * `TILT_LEVELS` unset means the faithful path: every candidate runs the full
 * search. That is what a gate should do by default — the seeded walk is an
 * optimisation of the measurement, and `--curve` is where it gets compared.
 */
const LEVELS_ENV = (process.env.TILT_LEVELS || '').trim()
const STRIDES_ENV = (process.env.TILT_STRIDES || '').trim()
const SCORER = {
  levels: LEVELS_ENV ? LEVELS_ENV.split(',').map(Number) : null,
  strides: STRIDES_ENV ? STRIDES_ENV.split(',').map(Number) : [],
  cacheTarget: process.env.TILT_FAITHFUL !== '1',
}

/** The clip is h264 4:2:0 at 15.7 Mbit/s. Put our own frame through the same. */
function codecRoundTrip(png) {
  const mp4 = `${OUT}/.codec.mp4`
  rmSync(mp4, { force: true })
  ff([
    '-loop', '1', '-framerate', '30', '-i', png,
    '-t', '1', '-c:v', 'libx264', '-b:v', '15700k', '-pix_fmt', 'yuv420p',
    '-preset', 'medium', mp4,
  ]) // prettier-ignore
  return ff([
    '-ss', '0.5', '-i', mp4, '-frames:v', '1',
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]) // prettier-ignore
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const src = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
  const SLIDES = [...src.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)].map(
    m => ({ frame: +m[1], at: +m[2], page: m[3] }),
  )
  const want = flag('--slide')
  const pick = (process.env.TILT_SLIDES || '8,18,20,23').split(',').map(Number)
  const list = want
    ? SLIDES.filter(s => s.frame === Number(want))
    : SLIDES.filter(s => pick.includes(s.frame))
  if (!list.length) throw new Error('no such slide')

  const { cdp, ws } = await openStage({
    port: PORT,
    profile: 'tilt-selftest-profile',
    origin: ORIGIN,
  })

  const PERSPS = (process.env.TILT_PERSPS || '1800,700').split(',').map(Number)
  const grid = (process.env.TILT_GRID || '-14,-10,-6,-3,0,3,6,10,14').split(',').map(Number)
  // Planted off the grid on purpose: none of these is a rung.
  const PLANT = (process.env.TILT_PLANT || '0/-7.5,0/11.5,-4.5/0,-5.5/7.5').split(',').map(p => {
    const [rx, ry] = p.split('/').map(Number)
    return { rx, ry }
  })

  if (argv.includes('--curve')) return curve(cdp, list[0], PERSPS)

  console.log('HOW BADLY DOES THE METHOD ITSELF MISS A KNOWN ANGLE?')
  console.log('(planted angles are deliberately between the sweep’s rungs)\n')
  console.log(
    'slide page              persp world  plant rX  plant rY   got rX   got rY   err rX   err rY    score  window          agree',
  )
  const rows = []
  for (const sl of list) {
    const t = +(sl.at + 1.6).toFixed(2)
    await cdp.eval(PARK(t))
    for (const persp of PERSPS) {
      for (const pl of PLANT) {
        // plant the truth, photograph it, then hand the photograph to the search
        const truth = await shoot(cdp, pl.rx, pl.ry, persp, `${OUT}/.truth.png`)
        const truthPng = truth.png
        // the reach region is taken off the FLAT page, so the target's pyramid
        // is built without any knowledge of the angle the search is hunting
        const flat = await shoot(cdp, 0, 0, persp, `${OUT}/.flat.png`)
        const worlds = argv.includes('--clean-only')
          ? [['clean', rgbOfPng(truthPng)]]
          : [
              ['clean', rgbOfPng(truthPng)],
              ['codec', codecRoundTrip(truthPng)],
            ]
        for (const [world, rgbTarget] of worlds) {
          const scorer = makeScorer(rgbTarget, flat, SCORER)
          const r = await findLean(cdp, scorer, persp, { grid, png: `${OUT}/.s.png` })
          const erx = r ? r.rx - pl.rx : NaN
          const ery = r ? r.ry - pl.ry : NaN
          // WHICH WINDOW ANSWERED IS PART OF THE RESULT, not a debug line. The
          // probe now measures through the window its windows agree on, so a
          // pass that came through a window nobody agreed with is worth seeing.
          const win = {
            win: scorer.window,
            group: scorer.group,
            outside: scorer.outside,
            spread: scorer.spread,
            tried: scorer.tried,
          }
          rows.push({ frame: sl.frame, page: sl.page, persp, world, plant: pl, got: r, erx, ery, win }) // prettier-ignore
          console.log(
            String(sl.frame).padStart(5),
            sl.page.padEnd(18),
            String(persp).padStart(5),
            world.padEnd(6),
            pl.rx.toFixed(1).padStart(8) + '°',
            pl.ry.toFixed(1).padStart(8) + '°',
            (r ? r.rx.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? r.ry.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? erx.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? ery.toFixed(2) : '  -  ').padStart(7) + '°',
            (r ? r.v.toFixed(4) : '  -  ').padStart(8),
            ' ' + scorer.window.replace(/\.(webp|png|jpg)$/, '').padEnd(15),
            `${win.group.length}/${win.tried.length}, ${win.spread.toFixed(0)} px`,
          )
        }
      }
    }
    await cdp.eval(TILT(0, 0, 1800))
  }
  writeFileSync(`${OUT}/selftest.json`, JSON.stringify(rows, null, 1))
  const ok = rows.filter(r => r.got && Math.abs(r.erx) <= 1 && Math.abs(r.ery) <= 1).length
  const worst = rows.reduce(
    (a, r) => Math.max(a, r.got ? Math.max(Math.abs(r.erx), Math.abs(r.ery)) : 99),
    0,
  )
  console.log(`\nwithin 1°: ${ok}/${rows.length}   worst miss: ${worst.toFixed(2)}°`)
  console.log(`-> ${OUT}/selftest.json`)
  ws.close()
  process.exit(0)
}

/**
 * How lonely is the winning angle? — the second half of the same question.
 *
 * A search that lands on the truth proves nothing if the score is just as good
 * five degrees away: that is a plateau, and on a real frame, where the pictures
 * differ for a dozen other reasons, the winner would be whichever way those
 * reasons happened to lean. So plant one angle and print the whole curve.
 */
async function curve(cdp, sl, PERSPS) {
  const t = +(sl.at + 1.6).toFixed(2)
  await cdp.eval(PARK(t))
  const plantRy = Number(process.env.TILT_PLANT_RY || -7.5)
  console.log(`score vs rotationY, slide ${sl.frame} ${sl.page} at t=${t}, planted ry=${plantRy}\n`)
  for (const persp of PERSPS) {
    const truth = await shoot(cdp, 0, plantRy, persp, `${OUT}/.truth.png`)
    const flat = await shoot(cdp, 0, 0, persp, `${OUT}/.flat.png`)
    const scorer = makeScorer(rgbOfPng(truth.png), flat, SCORER)
    console.log(`  persp ${persp}   window ${scorer.window}, agree ${scorer.group.length}/${scorer.tried.length}`) // prettier-ignore
    const out = []
    for (let ry = plantRy - 10; ry <= plantRy + 10.001; ry += 1) {
      const r = await probe(cdp, scorer, 0, +ry.toFixed(2), persp, `${OUT}/.s.png`)
      out.push({ ry: +ry.toFixed(2), v: r ? r.v : null })
      const bar = r ? '#'.repeat(Math.max(0, Math.round((r.v - 0.5) * 120))) : ''
      console.log(
        `    ry ${(+ry.toFixed(2)).toFixed(1).padStart(6)}°  ${r ? r.v.toFixed(4) : '  -  '}  ${bar}`,
      )
    }
    writeFileSync(`${OUT}/curve-${persp}.json`, JSON.stringify(out, null, 1))
  }
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
