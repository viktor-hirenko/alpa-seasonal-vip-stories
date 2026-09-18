#!/usr/bin/env node
/**
 * HOW THE CLIP'S PAGE LEANS *THROUGH* A SLIDE, not once per slide.
 *
 *   node scripts/journal-lean-path.mjs --dry            what it would measure
 *   node scripts/journal-lean-path.mjs --slide 20       one slide
 *   node scripts/journal-lean-path.mjs --all            every slide with a lean
 *
 * WHAT IS NEW HERE. `journal-tilt.mjs` asks the lean question ONCE per slide,
 * at `at + 1.6`, "a second after the turn, when the page has settled", and the
 * eight answers it gave are in SLIDE_LEAN as eight constants. The owner, on
 * 18.09: "на видео видно, как перспектива тоже меняется на слайде. Он может как
 * бы ближе к нам, то дальше к нам… у нас просто перспектива задана статически."
 * Four of the journal's six channels are measured through time and interpolated
 * (JOURNAL_PATH, 233 rows at a quarter second); the two depth channels are not.
 * This walks the same question across each slide so they can be.
 *
 * ⚠️ THE GATE COMES FIRST, AND IT IS NOT THIS FILE. `tilt-selftest.mjs` plants
 * an angle we chose in a photograph of our own page and makes the same search
 * find it again, off the grid, through the clip's own codec. Until that passes
 * to about a degree, numbers from here are best-of-N winners and belong in no
 * table. Both run the same probe (`lib/tiltprobe.mjs`) on purpose.
 *
 * WHAT COMES BACK, per instant: the lean in degrees, the score, and how much
 * better than a page with NO lean at all. The last column is the one that
 * decides. A search always returns a winner; only the margin over flat says
 * whether the winner means anything, and a slide whose margin stays small is
 * left at zero rather than leaned on a guess — the same rule that kept ten of
 * twenty seven flying objects and three slides of scale untouched.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { openStage, shoot, probe, findLean, makeScorer, rgbOfVideo, rgbOfPng, PARK, TILT } from './lib/tiltprobe.mjs' // prettier-ignore

const ROOT = new URL('..', import.meta.url).pathname
const CLIP = process.env.TILT_CLIP || `${ROOT}_refs/DP-15152 - preview.mp4`
const OUT = process.env.TILT_OUT || `${ROOT}_refs/tilt`
const ORIGIN = process.env.PROBE_ORIGIN || 'http://localhost:5173'
const argv = process.argv.slice(2)
const flag = n => {
  const i = argv.indexOf(n)
  return i < 0 ? null : argv[i + 1]
}

/** The turn runs flip.out + flip.back = 0.74 s past the cut. Start after it. */
const SETTLE = Number(process.env.TILT_SETTLE || 0.8)
const STEP = Number(process.env.TILT_STEP || 0.5)
const TAIL = Number(process.env.TILT_TAIL || 0.05)
const PERSP = Number(process.env.TILT_PERSP || 1800)
const LEVELS = (process.env.TILT_LEVELS || '2,1').split(',').map(Number)
const STRIDES = (process.env.TILT_STRIDES || '1,2').split(',').map(Number)
/**
 * ⚠️ THE CLIP'S OWN PRINT, AND IT IS NOT DECORATION.
 *
 * The reference was rendered with 257 everywhere and 120 seasonal points; the
 * player's SAMPLE carries deliberately wide values (2257 days, 1200000 points).
 * The comparison here is made of EDGES, and on a page of this design most of
 * the edge energy is type — so a page printing different numbers from the clip
 * is being asked to match a picture it cannot match, on the very pixels the
 * score is built from. Same table as clip-fit's CLIP_QUERY and review.html's
 * CLIP_PRINT.
 *
 * ⚠️ IT USED TO MAKE THINGS WORSE, AND 2026-09-18 FOUND OUT WHY. Tried on slide
 * 20 at 68.67 the whole curve fell from 0.09…0.15 to 0.02…0.03 — the signature
 * of a registration that has stopped finding the page at all rather than of a
 * slightly wrong print. It had: the table had no `packs`, `packs` gates
 * `space_milk`, and a dev URL that carries any data parameter at all is taken
 * at its word and fills nothing from the sample. So the page was DROPPED,
 * storyPlan.js rebuilt the story 5.4 s shorter (88.97 s against 94.37), and
 * from 67 s on the flag was parking us one page further along than the clip:
 * at 68.67 our JOKE page against the clip's Space Milk. `packs=257` is on the
 * table now — the clip prints 257 there, read off the frame — and clip-fit
 * carries a guard that refuses to report a row whose page is not the page that
 * was asked for.
 */
const CLIP_QUERY =
  '?days=257&points=120&level=SILVER&total_wins=257' +
  '&biggest_win=257&biggest_win_game=Dragon%20Coins%20Jackpot&top_multiplier=257' +
  '&top_multiplier_game=Tiger%20Jackpots&favorite_game_name=Tiger%20Jackpots' +
  '&bonuses=257&sports_wins=257&sports_multiplier=257&packs=257'
const QUERY = process.env.FIT_QUERY ?? (process.env.TILT_CLIP_PRINT === '1' ? CLIP_QUERY : '')

/** Frames 4-7 are the entrance, owned by swingOpen; 24 is past the last turn. */
const DEFAULT_FRAMES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]

function slides() {
  const src = readFileSync(`${ROOT}src/story/slides.js`, 'utf8')
  return [...src.matchAll(/frame:\s*(\d+),\s*at:\s*([\d.]+),\s*page:\s*'([^']+)'/g)].map(m => ({
    frame: +m[1],
    at: +m[2],
    page: m[3],
  }))
}

/** The instants inside one slide where the page is settled and still its own. */
function window_(all, sl) {
  const next = all.find(s => s.at > sl.at)
  const end = (next ? next.at : 88.1) - TAIL
  const ts = []
  for (let t = sl.at + SETTLE; t <= end + 1e-6; t += STEP) ts.push(+t.toFixed(2))
  return ts
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const all = slides()
  const want = flag('--slide')
  const pick = want
    ? [Number(want)]
    : (process.env.TILT_FRAMES || DEFAULT_FRAMES.join(',')).split(',').map(Number)
  const list = all.filter(s => pick.includes(s.frame))
  if (!list.length) throw new Error('no such slide')

  const plan = list.map(sl => ({ sl, ts: window_(all, sl) }))
  const nPts = plan.reduce((a, p) => a + p.ts.length, 0)
  if (argv.includes('--dry')) {
    for (const p of plan)
      console.log(
        String(p.sl.frame).padStart(4),
        p.sl.page.padEnd(20),
        String(p.ts.length).padStart(3) + ' pts ',
        p.ts[0] + ' .. ' + p.ts[p.ts.length - 1],
      )
    console.log(`\n${nPts} instants, ~${Math.round((nPts * 70) / 60)} min at 70 s an instant`)
    process.exit(0)
  }

  const { cdp, ws } = await openStage({
    port: Number(process.env.TILT_PORT || 9403),
    profile: 'leanpath-profile',
    origin: ORIGIN,
    query: QUERY,
  })

  if (argv.includes('--curve')) return curve(cdp, Number(flag('--curve-t') || plan[0].ts[2]))

  const rows = []
  const png = `${OUT}/.p.png`
  let done = 0
  console.log(`${nPts} instants, clip ${CLIP.split('/').pop()}, persp ${PERSP}\n`)
  console.log('   t   slide page                rotX    rotY    score   flat   better  probes')
  for (const { sl, ts } of plan) {
    // Each slide starts from scratch: the lean does not carry across a turn,
    // and a seed from the last instant of the previous slide would be a guess
    // dressed as continuity. Inside the slide it DOES carry, which is the whole
    // reason a walk is cheaper than a sweep.
    let carry = null
    for (const t of ts) {
      await cdp.eval(PARK(t))
      const flat = await shoot(cdp, 0, 0, PERSP, `${OUT}/.flat.png`)
      if (!flat) {
        console.log(`${String(t).padStart(6)}  ${sl.frame}  page not on screen`)
        continue
      }
      const scorer = makeScorer(rgbOfVideo(CLIP, t), flat, { levels: LEVELS, strides: STRIDES })
      const flatScore = scorer(rgbOfPng(flat.png), flat.geo).v
      const r = await findLean(cdp, scorer, PERSP, {
        png,
        seedAngle: carry,
        steps: carry ? [1, 0.5, 0.25] : [2, 1, 0.5, 0.25],
      })
      if (!r) continue
      carry = { rx: r.rx, ry: r.ry }
      const gain = (r.v - flatScore) / Math.max(flatScore, 1e-6)
      rows.push({ t, frame: sl.frame, page: sl.page, rx: r.rx, ry: r.ry, v: r.v, flat: flatScore, gain, probes: r.probes }) // prettier-ignore
      done++
      console.log(
        String(t).padStart(6),
        String(sl.frame).padStart(5),
        sl.page.padEnd(18),
        r.rx.toFixed(2).padStart(6) + '°',
        r.ry.toFixed(2).padStart(6) + '°',
        r.v.toFixed(4).padStart(8),
        flatScore.toFixed(4).padStart(7),
        (gain * 100).toFixed(0).padStart(6) + '%',
        String(r.probes).padStart(6),
        `   [${done}/${nPts}]`,
      )
      writeFileSync(`${OUT}/lean-path.json`, JSON.stringify(rows, null, 1))
    }
    await cdp.eval(TILT(0, 0, 1800))
  }
  console.log(`\n-> ${OUT}/lean-path.json`)
  ws.close()
  process.exit(0)
}

/**
 * Score against the CLIP, degree by degree, at one instant.
 *
 * The self-test proves the search can find an angle we planted in a photograph
 * of our own page. It cannot prove there is anything to find in the clip: that
 * page was drawn by other software, under its own bloom and its own camera, and
 * if the agreement is a plateau rather than a peak then the winner is whichever
 * way the other differences happen to lean, and no walk of it means anything.
 * One curve answers that in a minute, and it is worth a minute before an hour.
 */
async function curve(cdp, t) {
  await cdp.eval(PARK(t))
  const flat = await shoot(cdp, 0, 0, PERSP, `${OUT}/.flat.png`)
  const scorer = makeScorer(rgbOfVideo(CLIP, t), flat, { levels: LEVELS, strides: STRIDES })
  console.log(`score against the clip at t=${t}, persp ${PERSP}\n`)
  const out = []
  for (let ry = -20; ry <= 20.001; ry += 1) {
    const r = await probe(cdp, scorer, 0, +ry.toFixed(2), PERSP, `${OUT}/.p.png`)
    out.push({ ry: +ry.toFixed(2), v: r ? r.v : null })
    const bar = r ? '#'.repeat(Math.max(0, Math.round((r.v - 0.35) * 150))) : ''
    console.log(`  ry ${ry.toFixed(1).padStart(6)}°  ${r ? r.v.toFixed(4) : '  -  '}  ${bar}`)
  }
  writeFileSync(`${OUT}/clip-curve-${t}.json`, JSON.stringify(out, null, 1))
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
