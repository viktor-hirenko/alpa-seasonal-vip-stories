import { gsap } from 'gsap'
import { EASE } from '@/story/easing.js'
import { TIMING, HOVER_AMP } from '@/story/timing.js'
import { DEPTH } from '@/story/journalGeometry.js'
import { posVars, boxVars } from './poseTween.js'
import { splineReader } from './hermite.js'

/**
 * THE REUSABLE 3D LIBRARY (ticket item 4).
 *
 * Every preset is a PURE FACTORY: (targets, params) => paused gsap.timeline().
 * No DOM queries inside, no reference to the master timeline, no side effects.
 * That is what makes the module reusable and lets the lab just call
 * `preset(targets, params).play()`.
 *
 * Every preset exposes `PARAM_SCHEMA` so the lab can generate its own sliders:
 * add a param, get a slider for free.
 *
 * No preset contains a bare duration or an inline ease string — they all come
 * from timing.js / easing.js (ADR-0009).
 */

const tl = () => gsap.timeline({ paused: true })

/** Merge caller params over defaults, one level deep. */
const P = (defaults, params) => ({ ...defaults, ...(params || {}) })

// ---------------------------------------------------------------------------
// Video-accurate presets — these drive the real story.
// ---------------------------------------------------------------------------

/**
 * ENTRANCE, part 1. The journal lies flat on the floor bottom-left, back cover
 * and rocket logo facing the camera, then swings up.
 *
 * `floorRotX` MUST be past +/-90deg. Verified in the lab: with
 * `backface-visibility: hidden`, rotationX in (-90, 90) shows the FRONT face,
 * and only beyond +/-90 does the back cover appear. The reference shows the back
 * cover with the rocket logo for the first ~1.4 s, so -105 is the floor pose and
 * -80 (the obvious guess) is wrong — it would show the page, not the cover.
 *
 * Note the edge-on instant at t=3.93 is NOT this rotation: it is a vertical
 * spine, i.e. a rotationY = -90 crossing, and it belongs to `swingOpen`.
 *
 * Also dips `--persp` so the entrance keystones hard, the way the reference
 * does — a dolly zoom. Only possible because `.stage-3d` has no animated
 * transform of its own.
 */
export function flyInFromFloor(t, params) {
  const p = P(
    {
      floorRotX: -105,
      liftToRotX: -20,
      floorRotZ: 34,
      fromCx: 22,
      fromCy: 118,
      fromScale: 1.05,
      dur: TIMING.entrance.floorLift,
      perspDip: TIMING.persp.entranceDip,
      ease: EASE.entrance,
    },
    params,
  )
  const s = tl()
  s.set(t.pos, { xPercent: p.fromCx, yPercent: p.fromCy })
  s.set(t.box, { rotationX: p.floorRotX, rotationY: 0, rotationZ: p.floorRotZ, scale: p.fromScale, z: 0 })
  s.set(t.stage, { '--persp': p.perspDip }, 0)
  s.to(t.box, { rotationX: p.liftToRotX, duration: p.dur, ease: p.ease }, 0)
  s.to(t.pos, { xPercent: 46, yPercent: 96, duration: p.dur, ease: p.ease }, 0)
  return s
}
flyInFromFloor.PARAM_SCHEMA = {
  floorRotX: { min: -180, max: -90, step: 1 },
  liftToRotX: { min: -90, max: 20, step: 1 },
  floorRotZ: { min: -60, max: 60, step: 1 },
  fromCx: { min: -50, max: 150, step: 1 },
  fromCy: { min: 50, max: 200, step: 1 },
  fromScale: { min: 0.2, max: 2, step: 0.01 },
  dur: { min: 0.2, max: 4, step: 0.05 },
  perspDip: { min: 600, max: 3000, step: 50 },
}

/**
 * THE ENTRANCE. The journal appears already past edge-on, swings through the
 * exact edge, opens towards the camera and recedes into the settled cover.
 *
 * THE KEYS ARE A MEASUREMENT, NOT A CHOREOGRAPHY, and they were re-shot in full
 * rather than slid along the clock. The previous set began at rotationY -90 on
 * TIMING.entrance.start and reached the settled pose 2.1 s later, which put
 * frame 7's pose on frame 6's timecode; in the clip, 4.6 s still has the cover
 * filling the frame from top to bottom.
 *
 * HOW EACH KEY WAS OBTAINED. The clip gives up two numbers per frame without an
 * argument — the left and right edges of the journal, where the difference mask
 * against `clean bg` starts and ends. They are a hard step against an unlit
 * room, and on our own settled frame, where the browser's quad says the edge is
 * at x=46 and the mask says 36, the bloom is worth 10 px on that boundary and
 * no more. Those two numbers pin rotationY (which sets the width) and cx
 * (which follows in closed form), through the browser's own projection, by
 * `node scripts/clip-fit.mjs --solve`. From frame 131 the cover runs off the
 * right of the canvas and only the left edge survives, so from there rotationY
 * comes from the tilt of the cover's top edge instead and the fit is checked by
 * laying our quad over the clip (`--pose`).
 *
 * WHAT COULD NOT BE MEASURED, and is therefore an author's choice: `scale`. The
 * cover is clipped on three sides for most of the entrance, so there is no
 * vertical extent to read, and any scale can be traded against rotationY for
 * the same width. It is a smooth recede from 1.02 to the settled 0.746, chosen
 * to keep the angular rate smooth through the crossing. If the entrance ever
 * looks the wrong size, this is the number to move — and the picture, not a
 * number, is what will say so.
 *
 * Keys are ABSOLUTE seconds from `start`, so a key's second is the clip's
 * second minus 3.9333 and can be checked frame by frame against the table in
 * timing.js.
 */
export function swingOpen(t, params) {
  const p = P(
    {
      ease: EASE.swing,
      keys: [
        // [t from start, rotationY, rotationZ, scale, cx, cy]   clip frame
        [0.0, -104, 0.5, 1.02, 54.5, 50.0], //   118  appears, back cover to camera
        [0.15, -90, 0.5, 0.97, 57.2, 50.0], //   122.5 exactly edge-on
        [0.4, -76.3, 1.6, 0.92, 65.3, 50.0], //  130  front cover swinging into view
        [0.6667, -59.6, 2.0, 0.885, 67.1, 50.0], // 138  fills the canvas
        [1.0667, -36.5, 2.6, 0.845, 66.6, 50.0], // 150
        [1.5667, -15.5, 2.9, 0.79, 61.6, 49.2], // 165
        [2.0667, -4, 3.1, 0.746, 57.7, 48.7], // 180  settled: frame 7's pose
      ],
    },
    params,
  )
  const s = tl()
  const base = p.keys[0]
  // The preset only poses. Making the journal appear is the STORY's business and
  // lives on the master timeline: a `set` inside a nested child cannot hide
  // anything before that child starts, which is exactly the frames that need it.
  s.set(t.box, { rotationX: 0, rotationY: base[1], rotationZ: base[2], scale: base[3], z: 0 }, 0)
  s.set(t.pos, { xPercent: base[4], yPercent: base[5] }, 0)

  p.keys.slice(1).forEach((k, i) => {
    const prev = p.keys[i]
    const dur = k[0] - prev[0]
    s.to(t.box, { rotationY: k[1], rotationZ: k[2], scale: k[3], duration: dur, ease: p.ease }, prev[0])
    s.to(t.pos, { xPercent: k[4], yPercent: k[5], duration: dur, ease: p.ease }, prev[0])
  })
  return s
}
/** No sliders. The times live IN the keys — the second column is the clip's own
 *  frame — and a slider that cannot move anything is worse than none. */
swingOpen.PARAM_SCHEMA = {}

/**
 * THE JOURNAL'S PATH — the pose as a measured polyline, not one pose per slide.
 *
 * WHAT THIS REPLACES, and why. `slides.js` used to hold ONE pose per slide and
 * `rePose` moved between them over half a second; for the remaining four or five
 * seconds of a slide the journal stood still, and the only thing moving was
 * `hover()`, a drift this project invented. Against the clip that is wrong twice
 * over. Two frames inside one slide, 3 s apart, page unchanged (t = 40.2 and
 * 43.2 of frame 14): the clip's journal moves 60-150 design px and turns, ours
 * moved 20 px and grew 1.5 %. Measured across the whole story, the clip's
 * journal never once holds a pose — it drifts through every slide.
 *
 * So the pose is a TRAJECTORY, and it is measured the way the flight table is
 * measured: rows of `[t, rot, scale, cx, cy]` read through the shared Hermite
 * reader, passing exactly through every measured second, with continuous
 * velocity so nothing snaps at a row. See JOURNAL_PATH in slides.js for where
 * the numbers come from and what in them is measured against what is anchored.
 *
 * WHAT THIS PRESET DOES NOT TOUCH: `rotationY`. The page turn owns that, and it
 * is a separate measurement (TIMING.flip). Both write to `.journal-box`, which
 * is safe because they write different properties into the same GSAP transform
 * cache — but it is the reason the turn is no longer bolted onto the re-pose.
 */
export function journalPath(t, keys) {
  const at = splineReader(keys)
  const t0 = keys[0][0]
  const t1 = keys[keys.length - 1][0]
  const head = { t: t0 }
  const s = tl()
  s.to(head, {
    t: t1,
    duration: t1 - t0,
    ease: 'none',
    onUpdate() {
      const time = head.t
      gsap.set(t.pos, { xPercent: at(time, 3), yPercent: at(time, 4) })
      gsap.set(t.box, { rotationZ: at(time, 1), scale: at(time, 2) })
    },
  })
  return s
}
/** The times live IN the rows; a slider cannot move a measurement. */
journalPath.PARAM_SCHEMA = {}

/**
 * THE PAGE TURN, on its own.
 *
 * It used to be a flag on `rePose`, because a re-pose and a turn happened at the
 * same instant and shared a tween. Now that the pose is a continuous path, the
 * turn is the only thing left that happens AT a slide boundary, so it is its own
 * preset — and the path underneath it keeps moving through the turn instead of
 * being frozen by it.
 *
 * rotationY is written ABSOLUTELY — a `set` to 0 at the head, then out, then
 * back — never as a relative `+=`. The master timeline is seeked arbitrarily
 * (ADR-0008), and a relative tween would freeze whatever value it happened to
 * find on its first render, so scrubbing backwards would accumulate garbage.
 * That head `set` is also what normalises the -4 deg of yaw the entrance leaves
 * behind, at the first page turn.
 *
 * The measurement behind `peak`, `out` and `back` is in TIMING.flip.
 */
export function pageTurn(t, params) {
  const p = P({ ...TIMING.flip, easeOut: EASE.flipOut, easeBack: EASE.flipBack }, params)
  const s = tl()
  s.set(t.box, { rotationY: 0 }, 0)
  s.to(t.box, { rotationY: p.peak, duration: p.out, ease: p.easeOut }, 0)
  s.to(t.box, { rotationY: 0, duration: p.back, ease: p.easeBack }, p.out)
  return s
}
pageTurn.PARAM_SCHEMA = {
  peak: { min: 0, max: 180, step: 1 },
  out: { min: 0.02, max: 0.6, step: 0.01 },
  back: { min: 0.05, max: 1.5, step: 0.01 },
}
pageTurn.PARAM_DEFAULTS = { ...TIMING.flip }

/**
 * IDLE DRIFT — NO LONGER PART OF THE STORY. Kept as a library preset and used
 * by the lab; `buildStoryTimeline` does not build it any more.
 *
 * IT WAS INVENTED, NOT MEASURED. Its job was to keep the journal alive between
 * slides, because the pose table held one pose per slide and the journal
 * genuinely stood still. The pose is a measured path now, and that path already
 * carries every bit of movement the clip has — adding a synthetic drift on top
 * would not make the journal livelier, it would double the motion and put it
 * out of step with the reference. Removed deliberately; see the log entry for
 * the measurement that decided it.
 *
 * Runs on `.journal-hover`, on its OWN standalone infinite timeline — never on
 * the master. `repeat: -1` on the master would make `tl.duration()` infinite and
 * destroy the whole video-sync and progress model.
 */
export function hover(t, params) {
  const p = P({ amp: HOVER_AMP, period: TIMING.hover, ease: EASE.hoverDrift }, params)
  const s = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: p.ease } })
  s.fromTo(t.hover, { rotationZ: -p.amp.rotZ }, { rotationZ: p.amp.rotZ, duration: p.period.rotZ }, 0)
  s.fromTo(t.hover, { rotationY: -p.amp.rotY }, { rotationY: p.amp.rotY, duration: p.period.rotY }, p.period.stagger * 0)
  s.fromTo(t.hover, { rotationX: -p.amp.rotX }, { rotationX: p.amp.rotX, duration: p.period.rotX }, p.period.stagger * 1)
  s.fromTo(t.hover, { yPercent: -p.amp.y }, { yPercent: p.amp.y, duration: p.period.y }, p.period.stagger * 2)
  s.fromTo(t.hover, { scale: 1 - p.amp.scale }, { scale: 1 + p.amp.scale, duration: p.period.scale }, p.period.stagger * 3)
  return s
}
hover.PARAM_SCHEMA = {}

/**
 * Per-slide re-pose, and with `flip: true` the PAGE TURN.
 *
 * The turn is a yaw out to `peak` and back, not a 180 (TIMING.flip carries the
 * measurement and the reason). The journal therefore keeps its orientation:
 * the spine stays on the left, which is what the reference does on every page.
 *
 * rotationY is written ABSOLUTELY — a `set` to 0 at the head, then out, then
 * back — never as a relative `+=`. The master timeline is seeked arbitrarily
 * (ADR-0008), and a relative tween would freeze whatever value it happened to
 * find on its first render, so scrubbing backwards would accumulate garbage.
 * That head `set` is also what normalises the -4deg of yaw the entrance leaves
 * behind, at the first page turn.
 *
 * The page content cut is clock-driven and lands at `out`, the edge-on instant,
 * where the front face is a hairline — see useStoryPlayback.applySegment.
 */
export function rePose(t, from, to, params) {
  const p = P(
    { dur: TIMING.rePose, ease: EASE.rePose, flip: false, ...TIMING.flip,
      easeOut: EASE.flipOut, easeBack: EASE.flipBack },
    params,
  )
  const s = tl()
  if (from) {
    s.set(t.pos, posVars(from))
    s.set(t.box, boxVars(from))
  }
  s.to(t.pos, { ...posVars(to), duration: p.dur, ease: p.ease }, 0)
  s.to(t.box, { ...boxVars(to), duration: p.dur, ease: p.ease }, 0)
  if (p.flip) {
    s.set(t.box, { rotationY: 0 }, 0)
    s.to(t.box, { rotationY: p.peak, duration: p.out, ease: p.easeOut }, 0)
    s.to(t.box, { rotationY: 0, duration: p.back, ease: p.easeBack }, p.out)
  }
  return s
}
rePose.PARAM_SCHEMA = {
  dur: { min: 0.1, max: 2, step: 0.05 },
  peak: { min: 0, max: 180, step: 1 },
  out: { min: 0.02, max: 0.6, step: 0.01 },
  back: { min: 0.05, max: 1.5, step: 0.01 },
}
/** The lab seeds its sliders from here: the midpoint of a range is a useless
 *  starting point when the real value is a measurement. */
rePose.PARAM_DEFAULTS = { dur: TIMING.rePose, ...TIMING.flip }

/** The journal draws back and tilts before the flash (frames 23 -> 24). */
export function recede(t, from, to, params) {
  const p = P({ dur: TIMING.recede.dur, ease: EASE.recede }, params)
  // No flip: frames 23 and 24 are the same page, so there is nothing to turn.
  return rePose(t, from, to, { dur: p.dur, ease: p.ease })
}
recede.PARAM_SCHEMA = { dur: { min: 1, max: 10, step: 0.1 } }
recede.PARAM_DEFAULTS = { dur: TIMING.recede.dur }

/**
 * EXIT. A white flash covers the screen and the journal is simply gone — it is
 * hidden INSIDE the flash, never faded. Do not "improve" this into a fade:
 * fading would need `opacity` on `.journal-box`, which flattens the faces and
 * makes the volume pop out of existence mid-flight.
 */
export function whiteFlashExit(t, params) {
  const p = P({ ...TIMING.flash }, params)
  const s = tl()
  if (!t.flash) return s
  s.set(t.flash, { opacity: 0 })
  s.to(t.flash, { opacity: 1, duration: p.in, ease: EASE.flashIn }, 0)
  s.set(t.pos, { autoAlpha: 0 }, p.in + p.hold * 0.5)
  s.to(t.flash, { opacity: 0, duration: p.out, ease: EASE.flashOut }, p.in + p.hold)
  return s
}
whiteFlashExit.PARAM_SCHEMA = {
  in: { min: 0.02, max: 0.4, step: 0.01 },
  hold: { min: 0, max: 0.6, step: 0.01 },
  out: { min: 0.1, max: 1.5, step: 0.05 },
}

/** Hyperspace burst: the `Speed` overlay scales 1080 -> 2338 px. */
export function hyperspaceBurst(t, params) {
  const p = P({ dur: TIMING.speed.dur, scale: TIMING.speed.scale, ease: EASE.zoom }, params)
  const s = tl()
  if (!t.speed) return s
  s.set(t.speed, { opacity: 0, scale: 1 })
  s.to(t.speed, { opacity: 1, duration: p.dur * 0.3 }, 0)
  s.to(t.speed, { scale: p.scale, duration: p.dur, ease: p.ease }, 0)
  s.to(t.speed, { opacity: 0, duration: p.dur * 0.4 }, p.dur * 0.6)
  return s
}
hyperspaceBurst.PARAM_SCHEMA = {
  dur: { min: 0.3, max: 3, step: 0.05 },
  scale: { min: 1, max: 4, step: 0.05 },
}

// ---------------------------------------------------------------------------
// The brief's simple presets. Kept, exported, and used by the lab and future
// stories even though the real story follows the reference choreography.
// ---------------------------------------------------------------------------

/** Exactly the brief: y 100vh, z -500, rotationX -45 -> 0/0/10, back.out(1.5). */
export function flyInFromBelow(t, params) {
  const p = P({ fromY: 100, fromZ: -500, fromRotX: -45, toRotX: 10, dur: 1.2, ease: EASE.backOut }, params)
  const s = tl()
  s.set(t.pos, { xPercent: 50, yPercent: 50 })
  s.set(t.box, { yPercent: p.fromY, z: p.fromZ, rotationX: p.fromRotX, rotationY: 0, rotationZ: 0, scale: 1 })
  s.to(t.box, { yPercent: 0, z: 0, rotationX: p.toRotX, duration: p.dur, ease: p.ease }, 0)
  return s
}
flyInFromBelow.PARAM_SCHEMA = {
  fromY: { min: 0, max: 200, step: 5 },
  fromZ: { min: -3000, max: 0, step: 50 },
  fromRotX: { min: -90, max: 90, step: 1 },
  toRotX: { min: -45, max: 45, step: 1 },
  dur: { min: 0.2, max: 4, step: 0.05 },
}

/**
 * Fly into the camera and vanish.
 *
 * `opacity` deliberately goes on `.journal-pos`, NOT `.journal-box`: animating
 * opacity on the box flattens its faces mid-flight and the volume disappears.
 * That is encoded here so a caller cannot get it wrong.
 */
export function zoomToCamera(t, params) {
  const p = P({ scale: 3, dur: 0.9, ease: EASE.zoom }, params)
  const s = tl()
  s.to(t.box, { scale: p.scale, duration: p.dur, ease: p.ease }, 0)
  s.to(t.pos, { opacity: 0, duration: p.dur * 0.6, ease: p.ease }, p.dur * 0.4)
  return s
}
zoomToCamera.PARAM_SCHEMA = {
  scale: { min: 1, max: 8, step: 0.1 },
  dur: { min: 0.2, max: 3, step: 0.05 },
}

/** A real 3D page turn. Not used by the story (the reference always hard-cuts),
 *  but it is the obvious "base 3D animation" for the library. */
export function pageFlip3D(t, params) {
  const p = P({ dur: 0.8, ease: EASE.swing }, params)
  const s = tl()
  s.fromTo(t.front, { rotationY: 0 }, { rotationY: -180, duration: p.dur, ease: p.ease }, 0)
  return s
}
pageFlip3D.PARAM_SCHEMA = { dur: { min: 0.2, max: 3, step: 0.05 } }

/** Continuous orbit around the shared vanishing point. */
export function orbit(t, params) {
  const p = P({ dur: 8 }, params)
  return gsap.timeline({ repeat: -1, paused: true }).to(t.box, {
    rotationY: 360,
    duration: p.dur,
    ease: 'none',
  })
}
orbit.PARAM_SCHEMA = { dur: { min: 2, max: 30, step: 0.5 } }

/** Park the journal edge-on. The acceptance test for the faux volume: this must
 *  show a glowing magenta spine, not a hairline. */
export function edgeOnPose(t, params) {
  const p = P({ rotationY: 90, scale: 0.7 }, params)
  const s = tl()
  s.set(t.pos, { xPercent: 50, yPercent: 50 })
  s.set(t.box, { rotationX: 0, rotationZ: 0, rotationY: p.rotationY, scale: p.scale, z: 0 })
  return s
}
edgeOnPose.PARAM_SCHEMA = {
  rotationY: { min: 0, max: 180, step: 1 },
  scale: { min: 0.2, max: 2, step: 0.01 },
}

export const DEFAULT_DEPTH = DEPTH
