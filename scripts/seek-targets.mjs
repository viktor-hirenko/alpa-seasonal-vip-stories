#!/usr/bin/env node
/**
 * EVERY SECOND THE PLAYER CAN BE SENT TO, printed for ffmpeg.
 *
 * WHY THIS EXISTS. `encode-video.sh` puts a forced keyframe on each of these,
 * because a seek that lands on a sync sample costs the decoder nothing while
 * one that lands past it costs every frame in between — and on a phone that
 * difference is the whole of the freeze the owner reported on 2026-09-17.
 *
 * ⚠️ IT READS THE STORY, IT DOES NOT RESTATE IT. The first attempt at this was
 * a list of timestamps typed into the encode command by hand, computed as
 * `at + flip.out`. It was wrong on all twenty-one: `cutOf()` SNAPS to the 30 fps
 * grid (ADR-0009) and the hand-written list did not, so ffmpeg placed every
 * keyframe 23 ms past the one place it was needed. Two numbers that must agree
 * may only be written down once.
 *
 * ⚠️ IT PRINTS FRAME NUMBERS, NOT SECONDS, and that is the second thing this
 * got wrong. ffmpeg's timestamp form forces a keyframe on "the first frame with
 * timestamp equal or greater than the computed timestamp", so a target of
 * 11.067 — a rounded print of the exact 11.0666... — selects the frame AFTER
 * the one wanted. Off by one, on all twenty-one, silently. `expr:eq(n,332)`
 * cannot be rounded and cannot drift.
 *
 *   node scripts/seek-targets.mjs           # expr for -force_key_frames
 *   node scripts/seek-targets.mjs --list    # one per line, with what each is
 */
const ROOT = new URL('..', import.meta.url).pathname
const { SLIDES } = await import(`${ROOT}src/story/slides.js`)
const { TIMING, snap, FPS } = await import(`${ROOT}src/story/timing.js`)

const { out, back } = TIMING.flip
const targets = new Map()
const add = (t, what) => {
  const key = snap(Math.max(0, t)).toFixed(3)
  if (!targets.has(key)) targets.set(key, what)
}

for (const s of SLIDES) {
  // Where a tap or an arrow lands while the story is playing: the edge-on
  // instant, `landingTime()` in useStoryPlayback.js.
  add(s.at + out, `${s.page} — приземление тапа`)
  // Where the turn begins. The tape is sent here by the lead-in of a manual
  // turn, and it is where a hole's bridge ends.
  add(s.at, `${s.page} — начало переворота`)
  // Where a jump lands while the story is PAUSED: past the whole turn.
  add(s.at + out + back, `${s.page} — приземление на паузе`)
}

const list = [...targets.keys()].map(Number).sort((a, b) => a - b)

const frames = list.map(t => Math.round(t * FPS))

if (process.argv.includes('--list')) {
  for (const t of list) {
    console.log(
      String(Math.round(t * FPS)).padStart(5),
      t.toFixed(3).padStart(7),
      targets.get(t.toFixed(3)),
    )
  }
  console.log(`\n${list.length} точек`)
} else {
  console.log(`expr:${frames.map(n => `eq(n,${n})`).join('+')}`)
}
