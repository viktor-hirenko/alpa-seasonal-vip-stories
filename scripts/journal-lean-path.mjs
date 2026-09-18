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
 * ⚠️ DO NOT EDIT ANYTHING UNDER `src/` WHILE THIS IS RUNNING. It measures
 * through the DEV server, and Vite pushes every save into the browser it has
 * open — so a run started before an edit is measuring one build for its first
 * rows and another for the rest, with a hot module swap somewhere in the middle
 * of a parked page. It does not fail: it returns numbers. Session AT-2 lost an
 * hour of run this way and read the result as a bug in its own search, because
 * the give-away was subtle — the flat scores stayed right (they are re-shot per
 * instant) while the searched scores collapsed from 0.55 to 0.21. A two-hour
 * unattended run is exactly the shape of job this bites. Finish the code, then
 * measure, then paste the table.
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
import { openStage, shoot, probe, findLean, makeScorer, rgbOfVideo, rgbOfPng, PARK, TILT, PAGE_AT } from './lib/tiltprobe.mjs' // prettier-ignore

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
const CURVE = (process.env.TILT_CURVE || '-20,20,1').split(',').map(Number)
/**
 * ⚠️ THE COARSE SWEEP HAS TO BE WIDER THAN THE ANSWER. The probe's default
 * rungs stop at +/-14, and on 2026-09-18 (AT-1c) slide 18 was still climbing at -20 —
 * a walk seeded at -14 cannot reach an answer at -30 with a 2 degree step in
 * four rounds. Widen it for the slides where the curve runs off the end, and
 * say in the log which sweep produced the numbers.
 */
const GRID = (process.env.TILT_GRID || '-14,-10,-6,-3,0,3,6,10,14').split(',').map(Number)
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
 * ⚠️ AND IT IS NOT OPTIONAL — SESSION AT-1c's WHOLE RUN WAS TAKEN WITHOUT IT.
 * That run's conditions were never written down, so AT-2 reconstructed them by
 * re-scoring a flat page against the clip and matching the number: at 22.87 the
 * recorded flat is 0.8937453, our page on the demo SAMPLE scores 0.8937453, and
 * on the clip's print 0.8658564. It had been measured on the player's own demo
 * numbers — 1 200 000 points where the clip prints 120 — which is trap 5 in
 * `90-next-session.md` word for word. The run's first line now says which print
 * it used, so nobody has to do that again.
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

/**
 * THE MEASUREMENT, TURNED INTO THE TABLE THE BUILD READS — and the acceptance
 * rule applied out loud rather than by eye.
 *
 *   node scripts/journal-lean-path.mjs --print [--in <lean-path.json>]
 *
 * ⚠️ SLIDE_LEAN_PATH IS PRINTED, NEVER HAND-EDITED, for the same reason
 * JOURNAL_PATH is (`journal-path.mjs`, and the rule written next to the table):
 * a measured table that someone can nudge by hand is no longer a measurement,
 * and the nudge survives every later re-measurement as a number nobody can
 * source. Re-run this and paste the whole block.
 *
 * WHAT DECIDES WHETHER A SLIDE GOES IN. Not the winning angle — a search always
 * returns a winner — but three things, all of which the eight measured slides
 * separate cleanly:
 *
 *  1. NO ROW WORSE THAN A FLAT PAGE. Since the walk tries (0,0) alongside its
 *     carry this cannot happen by construction, so a negative row now means the
 *     run predates that fix, not that the slide is bad. Refuse it either way.
 *     ⚠️ JUDGED AGAINST A FLOOR, NOT AGAINST ZERO. The flat score and the
 *     walk's own (0,0) probe are two separate screenshots of the same state, so
 *     they differ in the ninth decimal and a slide that is exactly flat prints
 *     its margin as "-0%". Read literally, that rejected slide 10 for two rows
 *     that were perfect. Real failures are tens of per cent — -11, -18, -44 —
 *     so anything worse than -0.5 % is the search stuck and anything above it
 *     is arithmetic.
 *  2. THE LEAN DOES REAL WORK SOMEWHERE IN THE SLIDE: PEAK margin at or above
 *     30 %. ⚠️ Peak and not median, and that is a correction to this session's
 *     own first guess. A median is the right bar for ONE answer per slide, which
 *     is what SLIDE_LEAN holds and where its note set it at 15 %. A path is not
 *     one answer: slide 10 opens genuinely flat — two instants that come back
 *     exactly (0,0) — and then leans away to -12 deg with the margin climbing
 *     2 -> 35 %. Its median is 6 % and its shape is textbook. Judging a path by
 *     its median throws away every slide whose lean STARTS somewhere, which is
 *     most of the ones worth having. 30 % is twice the constants' bar, which is
 *     the right way round: a path has many instants to be convincing at, so at
 *     least one of them should be decisive rather than merely positive.
 *  3. THE ANSWERS HOLD ON TO EACH OTHER. Neighbouring instants are half a second
 *     apart, and a page does not swing tens of degrees in half a second: a step
 *     over STEP_CAP on either channel is the search hopping between basins, not
 *     the page moving. This is what separates slide 14 (a smooth arc, and the
 *     margin arcing with it) from slide 15 (twenty-seven degrees between
 *     neighbours). ⚠️ The cap is 12 deg and not 8, because a step is only
 *     suspicious when the SCORE does not follow it. Slide 18's rotX goes
 *     5, 5, 7.75, 18.5, 11.5, 9.25, 9.75 — a 10.75 deg step — and the margin
 *     goes 29, 38, 42, 102, 82, 66, 35: the big step lands exactly on the
 *     instant where the registration is twice as sure as anywhere else, which is
 *     a page that really is there, not a search that slipped. Whether such a
 *     step PLAYS smoothly is a different question and has its own gate —
 *     `smooth:scan`, which reads rotX since this session.
 *
 * ⚠️ A BREAK IN THE LAST ROW IS TRIMMED, A BREAK INSIDE IS FATAL. The final
 * instant of a slide sits against the next cut, where the clip's page is already
 * being taken into its turn and ours is not yet — slide 14's 43.87 breaks its
 * own arc there and nowhere else. Dropping a tail row costs nothing: the lean
 * simply holds its last measured value into the turn, which is what it did for
 * the whole slide under the old constant. A break in the MIDDLE means the search
 * was unreliable across the slide and no part of it can be trusted.
 */
const STEP_CAP = Number(process.env.TILT_STEP_CAP || 12)
const MIN_PEAK = Number(process.env.TILT_MIN_PEAK || 0.3)
/** Below this a row is genuinely stuck; above it, two screenshots disagreeing. */
const WORSE_THAN_FLAT = -0.005

function printTable() {
  const file = flag('--in') || `${OUT}/lean-path.json`
  const all = JSON.parse(readFileSync(file, 'utf8'))
  const byFrame = new Map()
  for (const r of all) {
    if (!byFrame.has(r.frame)) byFrame.set(r.frame, [])
    byFrame.get(r.frame).push(r)
  }
  const med = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const worstStep = rows => {
    let w = 0
    for (let i = 1; i < rows.length; i++)
      w = Math.max(w, Math.abs(rows[i].rx - rows[i - 1].rx), Math.abs(rows[i].ry - rows[i - 1].ry))
    return w
  }
  console.log(`\n// from ${file.split('/').pop()}, ${all.length} instants`)
  console.log(`// accept: no row under flat, peak margin >= ${(MIN_PEAK * 100).toFixed(0)} %, no neighbour step > ${STEP_CAP} deg\n`) // prettier-ignore
  const verdicts = []
  const accepted = []
  for (const frame of [...byFrame.keys()].sort((a, b) => a - b)) {
    let rows = byFrame.get(frame)
    const page = rows[0].page
    const bad = rows.filter(r => r.gain < WORSE_THAN_FLAT).length
    let trimmed = 0
    // Only ever from the tail, and only while the tail is what breaks the step.
    while (
      rows.length > 3 &&
      worstStep(rows) > STEP_CAP &&
      worstStep(rows.slice(0, -1)) <= STEP_CAP
    ) {
      // prettier-ignore
      rows = rows.slice(0, -1)
      trimmed++
    }
    const m = med(rows.map(r => r.gain))
    const peak = Math.max(...rows.map(r => r.gain))
    const step = worstStep(rows)
    const why = []
    if (bad) why.push(`${bad} row(s) worse than flat`)
    if (peak < MIN_PEAK) why.push(`peak margin ${(peak * 100).toFixed(0)} % under ${(MIN_PEAK * 100).toFixed(0)} %`) // prettier-ignore
    if (step > STEP_CAP) why.push(`neighbours ${step.toFixed(1)} deg apart`)
    if (rows.length < 4) why.push(`only ${rows.length} instants`)
    verdicts.push(
      `//   ${String(frame).padStart(2)} ${page.padEnd(18)} ${rows.length} pts  peak ${(peak * 100).toFixed(0).padStart(4)} %  median ${(m * 100).toFixed(0).padStart(4)} %  worst step ${step.toFixed(1).padStart(5)} deg  ` + // prettier-ignore
        (why.length ? `LEFT OUT — ${why.join('; ')}` : `in${trimmed ? `, last ${trimmed} row(s) trimmed` : ''}`), // prettier-ignore
    )
    if (!why.length) accepted.push({ frame, page, rows })
  }
  console.log(verdicts.join('\n'))
  console.log('\n// paste into src/story/slides.js\n')
  console.log('export const SLIDE_LEAN_PATH = {')
  for (const { frame, page, rows } of accepted) {
    console.log(`  // frame ${frame} ${page}`)
    console.log(`  ${frame}: [`)
    for (const r of rows)
      console.log(`    [${r.t.toFixed(2)}, ${r.rx.toFixed(2)}, ${r.ry.toFixed(2)}],`)
    console.log('  ],')
  }
  console.log('}')
  process.exit(0)
}

const main = async () => {
  if (argv.includes('--print')) return printTable()
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
  let wrongPage = 0
  // ⚠️ SAY WHICH PRINT THIS RUN USED, IN THE RUN'S OWN FIRST LINE. Session
  // AT-1c's 66-instant run left it unrecorded, and session AT-2 had to
  // reconstruct it by re-scoring a flat page against the clip and matching the
  // number: it had been taken on the demo SAMPLE, which is the one thing trap 5
  // says a pose measurement must never do. A run whose conditions are not in
  // its own log is a run somebody has to re-do to find out what it means.
  console.log(
    `${nPts} instants, clip ${CLIP.split('/').pop()}, persp ${PERSP}, print ${QUERY ? 'CLIP' : '⚠️ SAMPLE (demo)'}, grid ${GRID.join(',')}\n`, // prettier-ignore
  )
  console.log('   t   slide page                rotX    rotY    score   flat   better  probes')
  for (const { sl, ts } of plan) {
    // Each slide starts from scratch: the lean does not carry across a turn,
    // and a seed from the last instant of the previous slide would be a guess
    // dressed as continuity. Inside the slide it DOES carry, which is the whole
    // reason a walk is cheaper than a sweep.
    let carry = null
    for (const t of ts) {
      await cdp.eval(PARK(t))
      // The guard refuses rather than warns: a row measured against the wrong
      // page is worse than a missing row, because it looks like an answer.
      const now = await cdp.eval(PAGE_AT(t))
      if (now && now.page !== sl.page) {
        wrongPage++
        console.log(
          `${String(t).padStart(6)}  ${sl.frame}  ⚠️  WRONG PAGE — showing '${now.page}', not '${sl.page}'.` +
            `\n        The link dropped a page and the timeline is ${now.dur.toFixed(2)} s, not 94.37.` +
            `\n        Every skip-gated parameter must be on the query. NOT MEASURED.`,
        )
        continue
      }
      const flat = await shoot(cdp, 0, 0, PERSP, `${OUT}/.flat.png`)
      if (!flat) {
        console.log(`${String(t).padStart(6)}  ${sl.frame}  page not on screen`)
        continue
      }
      const scorer = makeScorer(rgbOfVideo(CLIP, t), flat, { levels: LEVELS, strides: STRIDES })
      const flatScore = scorer(rgbOfPng(flat.png), flat.geo).v
      const r = await findLean(cdp, scorer, PERSP, {
        png,
        grid: GRID,
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
  if (wrongPage) console.log(`⚠️  ${wrongPage} instants NOT MEASURED: wrong page on screen.`)
  ws.close()
  process.exit(wrongPage ? 3 : 0)
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
  console.log(`score against the clip at t=${t}, persp ${PERSP}, window ${scorer.window}, agree ${scorer.group.length}/${scorer.tried.length}\n`) // prettier-ignore
  const out = []
  // ⚠️ THE SWEEP HAS TO BE WIDER THAN THE ANSWER, AND ONCE IT WAS NOT. On
  // 2026-09-18 (AT-1c) slide 18 peaked at -20 — the last rung — still climbing,
  // which
  // says the answer is outside the sweep and not that the score is flat there.
  // Reading a boundary peak as "the lean does not help" is the trap this file's
  // own notes already paid for once (`32-poses.md`, "ЛОВУШКА, УЖЕ ОПЛАЧЕННАЯ").
  for (let ry = CURVE[0]; ry <= CURVE[1] + 0.001; ry += CURVE[2]) {
    const r = await probe(cdp, scorer, 0, +ry.toFixed(2), PERSP, `${OUT}/.p.png`)
    out.push({ ry: +ry.toFixed(2), v: r ? r.v : null })
    const bar = r ? '#'.repeat(Math.max(0, Math.round((r.v - 0.35) * 150))) : ''
    console.log(`  ry ${ry.toFixed(1).padStart(6)}°  ${r ? r.v.toFixed(4) : '  -  '}  ${bar}`)
  }
  const tag = `${t}-p${PERSP}-${CURVE[0]}_${CURVE[1]}`
  writeFileSync(`${OUT}/clip-curve-${tag}.json`, JSON.stringify(out, null, 1))
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
