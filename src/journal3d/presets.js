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
 *
 * ROTATION Z IS NOW MEASURED TOO (2026-09-05), on the last three keys, and it
 * was the one column here that never had been. It came in with the storyboard,
 * which draws the cover leaning +3.1 from the moment it lands; the clip has it
 * still ROLLING as it lands, and it does not stop at 6.0 either — the roll runs
 * on into frame 7 and peaks near +20.7 at 8.97.
 *
 * Read off the STEMS of the type printed on the cover, the instrument sessions H
 * and E used (`--roll`), one frame at a time:
 *
 *   t     4.60  4.90  5.00  5.10  5.20  5.35  5.50  5.65  5.75  5.90  6.00
 *   roll  2.40  4.27  5.00  5.85  6.34  7.21  7.85  8.59  9.03  9.58 10.04
 *
 * From 5.10 on those lie on a straight line, 4.644 deg/s, rms 0.081 — so the
 * three keys below are the measurement itself and not a fit to it.
 *
 * THE WINDOW HAS TO BE PUT ON THE TYPE, and before 5.0 our own pose does not do
 * that: at 4.60 the cover in the clip is far to the left of where we place it,
 * the default window lands on the astronaut's helmet, and the answer comes back
 * at conf 0.193 against a rival of 0.976 — a refusal, drawn and looked at. Moved
 * 250-450 px left onto the type column it reads conf 0.44, rival 0.083, and
 * holds 2.31-2.52 across every displacement tried. Everywhere the two windows
 * overlap they agree to 0.22 deg.
 *
 * KEYS 0-3 ARE UNCHANGED, and that is a finding rather than a decision: the clip
 * at 4.60 says 2.40 where this table already said 2.0, which is inside the
 * instrument's own worst error (0.34 deg, `--selftest`). Behind 4.60 the cover
 * is edge-on or showing its back and there is no type to read at all.
 *
 * THE LAST KEY IS A HANDOVER, not a resting pose. It must equal the first row of
 * JOURNAL_PATH, because the path is nested at 6.0 and takes the journal from
 * here — see the head-row note in scripts/journal-path.mjs. Move one, move both.
 *
 * THE KEYS ARE READ THROUGH THE SPLINE, NOT TWEENED ONE SEGMENT AT A TIME
 * (2026-09-06). They used to be six chained `.to()`s, each carrying
 * `power2.inOut` — an ease whose speed is zero at BOTH ends of every segment.
 * So the entrance stopped dead at every key and set off again: measured on our
 * own rendered frames, the journal's left edge moved 39, 25, 15, 7.5, 2.8, 0.4,
 * 0.2 px per frame into the key at 5.00 and 1.6, 4.2, 8.1, 13.3, 19.3, 26.3,
 * 31.2 out of it. The clip over the same fifteen frames moves 12, 16, 12, 12,
 * 12, 12, 12, 8, 12, 8, 12, 8, 8, 8 — an even glide. Six keys, six stalls, and
 * the owner saw it as "the journal enters in jerks" before any gate did,
 * because no gate samples the entrance: `pose:check` starts at 7.47.
 *
 * The fix is the one `hermite.js` was written for and that the flight table and
 * JOURNAL_PATH already use — a Hermite curve through the measured rows, read by
 * a playhead that advances at a constant rate. It passes exactly through all
 * seven keys, so nothing measured moves, and its velocity is continuous, so
 * nothing stalls between them. `ease` is gone from the params for the same
 * reason `EASE.flyPath` is `none`: the shape of the motion lives in the rows,
 * and an ease on top would re-time the clip's own acceleration into something
 * else.
 */
/**
 * THE YAW THE ENTRANCE LANDS ON, and hands to the first page turn.
 *
 * It is the last key's rotationY below, named because a second reader needs it:
 * nothing drives yaw between the handover at 6.0 and the first fold at 11.07,
 * so the journal sits at this angle for five seconds and the turn has to take
 * it from HERE rather than from zero. See the `from` param on `pageTurn`.
 */
export const HANDOVER_YAW = -4

export function swingOpen(t, params) {
  const p = P(
    {
      keys: [
        // [t from start, rotationY, rotationZ, scale, cx, cy]   clip frame
        [0.0, -104, 0.5, 1.02, 54.5, 50.0], //   118  appears, back cover to camera
        [0.15, -90, 0.5, 0.97, 57.2, 50.0], //   122.5 exactly edge-on
        [0.4, -76.3, 1.6, 0.92, 65.3, 50.0], //  130  front cover swinging into view
        [0.6667, -59.6, 2.0, 0.885, 67.1, 50.0], // 138  fills the canvas
        [1.0667, -36.5, 5.0, 0.845, 66.6, 50.0], // 150
        [1.5667, -15.5, 7.85, 0.79, 61.6, 49.2], // 165
        [2.0667, HANDOVER_YAW, 10.04, 0.746, 57.7, 48.7], // 180  handover: JOURNAL_PATH's first row
      ],
      // The row the PATH reaches one second after the handover, in this
      // preset's own seconds and without a yaw column — see `next` above.
      next: null,
    },
    params,
  )

  // The ghost row is never rendered: the playhead stops at the last real key.
  // It exists so the finite difference at that key is two-sided like every
  // other one, i.e. so the entrance arrives travelling at the speed the path
  // leaves at. Yaw has no continuation to lean on — nothing drives rotationY
  // between the handover and the first page turn — so the ghost holds it.
  const last = p.keys[p.keys.length - 1]
  const rows = p.next ? [...p.keys, [p.next[0], last[1], p.next[1], p.next[2], p.next[3], p.next[4]]] : p.keys

  const at = splineReader(rows)
  const t0 = p.keys[0][0]
  const t1 = last[0]
  const head = { t: t0 }
  const s = tl()
  // The preset only poses. Making the journal appear is the STORY's business and
  // lives on the master timeline: a `set` inside a nested child cannot hide
  // anything before that child starts, which is exactly the frames that need it.
  const base = p.keys[0]
  s.set(t.box, { rotationX: 0, rotationY: base[1], rotationZ: base[2], scale: base[3], z: 0 }, 0)
  s.set(t.pos, { xPercent: base[4], yPercent: base[5] }, 0)
  s.to(
    head,
    {
      t: t1,
      duration: t1 - t0,
      ease: 'none',
      onUpdate() {
        const time = head.t
        gsap.set(t.box, { rotationY: at(time, 1), rotationZ: at(time, 2), scale: at(time, 3) })
        gsap.set(t.pos, { xPercent: at(time, 4), yPercent: at(time, 5) })
      },
    },
    0,
  )
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
 * rotationY is written ABSOLUTELY — a `set` at the head, then out, then back —
 * never as a relative `+=`. The master timeline is seeked arbitrarily
 * (ADR-0008), and a relative tween would freeze whatever value it happened to
 * find on its first render, so scrubbing backwards would accumulate garbage.
 *
 * `from` IS THE YAW THIS TURN STARTS AT, and it exists because that head `set`
 * used to be a hard zero (2026-09-06). The entrance lands at HANDOVER_YAW and
 * nothing drives yaw for the next five seconds, so the first turn's `set`
 * discarded four degrees in a single frame, one frame BEFORE the turn's own
 * motion began. Measured on our rendered frames: the journal's silhouette lost
 * 18 design px of width and slid 7 px left between 11.033 and 11.067, where the
 * frames either side of it were moving 1.6 and 2.4 px — and differencing those
 * two frames draws the whole cover twice, type, art and edges. Starting the
 * out-leg from `from` puts those four degrees inside the swing, where the page
 * is on its way to edge-on and no one can see them. The turn still ENDS at an
 * absolute zero, so every later turn is unaffected and a backwards seek is
 * still exact.
 *
 * The measurement behind `peak`, `out` and `back` is in TIMING.flip.
 */
export function pageTurn(t, params) {
  const p = P({ ...TIMING.flip, from: 0, to: 0, easeOut: EASE.flipOut, easeBack: EASE.flipBack }, params)
  const s = tl()
  s.set(t.box, { rotationY: p.from }, 0)
  yawTurn(s, t, p)
  return s
}
pageTurn.PARAM_SCHEMA = {
  to: { min: -30, max: 30, step: 1 },
  peak: { min: 0, max: 180, step: 1 },
  out: { min: 0.02, max: 0.6, step: 0.01 },
  back: { min: 0.05, max: 1.5, step: 0.01 },
}
pageTurn.PARAM_DEFAULTS = { ...TIMING.flip }

/**
 * THE YAW ITSELF. Out to edge-on, THROUGH it, and on round — the page arrives
 * leaning the OTHER way (V-100, 12.09).
 *
 * WHAT THIS REPLACES AND WHY. Until now the back-leg tweened from `+peak` down
 * to `to`, i.e. the journal turned out to its edge and came back the way it
 * went, so the incoming page swung in from the same side the outgoing one left
 * by. The owner said three times that the clip does not look like that, and he
 * is right. The old reading rested on two arguments, and both are duds:
 *
 *   - "the glowing spine stays on the left, so there is no flip" - it stays on
 *     the left in the clip AFTER the turn as well, because both faces of the
 *     designer's journal are dressed the same way. It cannot separate the two.
 *   - "the silhouette width goes w0 -> 0 -> w0 either way" - true, and that is
 *     exactly why width alone was never going to settle it.
 *
 * WHAT DOES SEPARATE THEM is the PERSPECTIVE KEYSTONE: the edge nearer the
 * camera projects taller. An out-and-back keeps the same edge near the whole
 * way; a turn that carries on past edge-on swaps it. Measured on the clip as
 * the journal's vertical extent at its left end over the same at its right end
 * (`preview` minus `clean` in RGB, largest component - luma tears the page
 * apart where its own black matches the room's), sampled on each leg at the
 * same silhouette width so the lean magnitudes match:
 *
 *     cut    out  back        cut    out  back        cut    out  back
 *    11.07  1.42  0.78      34.07  1.14  0.71      61.10  2.33  0.70
 *    17.10  1.14  0.69      39.07  1.34  0.89      67.07  1.10  0.35
 *    22.07  1.44  0.68      44.03  1.43  0.91      73.07  1.25  0.75
 *    26.07  1.13  0.70      49.10  1.47  0.56      78.07  1.05  0.70
 *    30.10  1.34  0.70      53.27  0.77  0.60      83.03  1.14  0.59
 *                           57.07  0.92  0.72
 *
 * The back-leg column is unanimous: sixteen cuts, sixteen readings under 1, and
 * every cut drops from its own out-leg to its own back-leg. (The out-leg column
 * has three soft entries — 53.27, 57.07 and 78.07. The out-leg is only four
 * frames long, so on those three the 0.80-width sample had to be taken well off
 * that width; and at rest the journal is wider than the canvas, which clips its
 * left edge and drags the ratio down. Neither touches the back-leg, which is
 * sampled mid-turn with the whole page inside the frame.)
 *
 * Every page turn in the story is the same turn, and it is not an out-and-back.
 *
 * WHY THIS IS STILL ONE FACE AND NOT A SECOND PAGE STACK. A real +180 would
 * need a back face, a two-slot page ring, and a re-think of useJournalFit
 * (ADR-0004 measures all pages in one pass). It is not needed: the clip's two
 * faces are dressed identically - magenta spine down the left, gold page-block
 * down the right, copy reading normally - and for identical faces the render at
 * `180 + a` is pixel-for-pixel the render at `a`. So carrying on to 180 and
 * showing the back is the same picture as passing through `-peak` and showing
 * the front, which is what this does. The jump lands ON the edge-on instant,
 * where the face is a hairline; it is the same frame the content cut already
 * hides behind (STORY_SEGMENTS.cut = start + flip.out).
 *
 * The clip agrees frame for frame that the jump is right rather than merely
 * convenient: at ±90 what faces the camera is a SIDE of the box, and the two
 * sides are not alike. Just before edge-on the clip's sliver is the magenta
 * spine (its magenta band 1815 px tall against 168 px of gold); just after, it
 * is the gold fore-edge (1523 against 1028). It swaps in one frame, exactly as
 * passing from +90 to -90 does.
 *
 * `fromTo` with `immediateRender: false`, not `set` + `to`: the master timeline
 * is seeked arbitrarily (ADR-0008), and a plain `to` would record whatever
 * rotationY it found on its first render as its start value.
 *
 * `to` IS WHERE THE TURN LANDS, and it is not always square-on. The clip stops
 * several of its slides short of zero and leaves the page leaning - which under
 * the stage's perspective is the trapezium the owner kept pointing at on
 * review.html. Landing at zero everywhere was the reason our page always faced
 * the camera dead on. See SLIDE_LEAN in slides.js for the measured angles and
 * for why the ones under the bar are left at zero. It does NOT change with this
 * fix: the turn ends where it always ended, it just gets there the long way, so
 * `pose:check` measures the same settled poses.
 */
function yawTurn(s, t, p) {
  s.to(t.box, { rotationY: p.peak, duration: p.out, ease: p.easeOut }, 0)
  s.fromTo(
    t.box,
    { rotationY: -p.peak },
    { rotationY: p.to, duration: p.back, ease: p.easeBack, immediateRender: false },
    p.out,
  )
}

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
  // The lab parks the turn through here (`?lead=`), so it has to be the SAME
  // yaw the story plays or the lab lies about the product — which is how the
  // old out-and-back survived as long as it did. One helper, both callers.
  if (p.flip) {
    s.set(t.box, { rotationY: 0 }, 0)
    yawTurn(s, t, { ...p, to: 0 })
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

/**
 * The journal draws back and tilts at the end of the story (frames 23 -> 24).
 *
 * A LIBRARY PRESET WITH A BUTTON IN THE LAB, NOT PART OF THE STORY since
 * 2026-09-05 — the same standing `hover` has. The clip has no draw-back to play:
 * measured 84.03 to 88.03 its journal stays on the final page and drifts under
 * 100 design px, so the outro is JOURNAL_PATH's like every other slide. See the
 * note on RECEDE_POSE in src/story/slides.js.
 */
export function recede(t, from, to, params) {
  const p = P({ dur: TIMING.recede.dur, ease: EASE.recede }, params)
  // No flip: frames 23 and 24 are the same page, so there is nothing to turn.
  return rePose(t, from, to, { dur: p.dur, ease: p.ease })
}
recede.PARAM_SCHEMA = { dur: { min: 1, max: 10, step: 0.1 } }
recede.PARAM_DEFAULTS = { dur: TIMING.recede.dur }

/**
 * THE EXIT. The journal DISSOLVES; nothing covers the screen.
 *
 * WHAT THIS REPLACES, and why the old comment here was wrong on both counts.
 * It read: "A white flash covers the screen and the journal is simply gone — it
 * is hidden INSIDE the flash, never faded. Do not 'improve' this into a fade."
 * The reference has no flash at all — its brightest outro frame is mean luma
 * 119.8 against our 235.4, and every dark thing in it stays dark — and its
 * journal is plainly semi-transparent for half a second, the room showing
 * through the page. TIMING.exit carries both measurements.
 *
 * The old comment's REASON was sound and is honoured: opacity on `.journal-box`
 * would flatten its faces. So the fade goes on `.journal-pos`, which is the
 * escape hatch _stage.scss names for exactly this, and it is safe HERE
 * specifically because of where in the story it happens: the last page turn
 * ended at 83.96, so the journal is face-on with no side face to lose, and no
 * flight is in the air after 87 s, so the stacking context this creates cannot
 * disturb the depth sorting against `.fly-layer` (ADR-0006).
 *
 * `set` then `to`, absolutely, never a relative tween: the master timeline is
 * seeked arbitrarily (ADR-0008).
 */
export function journalDissolve(t, params) {
  const p = P(
    {
      dur: TIMING.exit.dur,
      ease: EASE.dissolve,
      scale: TIMING.exit.scale,
      // The scale the path leaves the journal at. Passed in rather than
      // imported so this file keeps knowing nothing about slides.js.
      from: null,
      fadeAt: TIMING.exit.fadeAt - TIMING.exit.at,
      fadeDur: TIMING.exit.fadeDur,
    },
    params,
  )
  const s = tl()
  if (!t.pos) return s
  s.set(t.pos, { autoAlpha: 1 })
  // THE SHRINK IS THE EXIT; the fade is a tail on the end of it. See
  // TIMING.exit for the measurement, and note that `scale` goes on `.journal-box`
  // — the same element the pose owns — which is safe here only because
  // JOURNAL_PATH has ended by this second and nothing else writes it after.
  if (p.from != null) {
    s.set(t.box, { scale: p.from }, 0)
    s.to(t.box, { scale: p.from * p.scale, duration: p.dur, ease: 'power1.in' }, 0)
  }
  s.to(t.pos, { autoAlpha: 0, duration: p.fadeDur, ease: p.ease }, p.fadeAt)
  return s
}
journalDissolve.PARAM_SCHEMA = { dur: { min: 0.1, max: 2, step: 0.05 } }
journalDissolve.PARAM_DEFAULTS = { dur: TIMING.exit.dur }

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

/**
 * THE OUTRO TEXT (21770:4871). It arrives oversized over the dark room, shrinks
 * onto it, holds, then accelerates past the camera ahead of the hyperspace
 * burst.
 *
 * Both legs are one preset because they are one layer's life, and the hold
 * between them is not a tween — the element simply keeps the scale the first
 * leg left it at.
 *
 * This preset owns SCALE and nothing else. Visibility is Story.vue's, read off
 * the clock from `TIMING.outro` exactly as the two buttons are: a nested
 * timeline renders at its own time 0 whenever the parent playhead is before it,
 * so an `autoAlpha: 1` here would put the oversized text on screen from the
 * first second of the story.
 */
export function outroText(t, params) {
  const p = P({ ...TIMING.outro }, params)
  const s = tl()
  if (!t.outro) return s
  s.set(t.outro, { scale: p.scale })
  s.to(t.outro, { scale: 1, duration: p.dur, ease: EASE.outroIn }, 0)
  s.to(
    t.outro,
    { scale: p.exitScale, duration: p.exitDur, ease: EASE.outroOut },
    p.exitAt - p.at,
  )
  return s
}
outroText.PARAM_SCHEMA = {
  dur: { min: 0.2, max: 2, step: 0.05 },
  scale: { min: 1, max: 20, step: 0.1 },
  exitDur: { min: 0.2, max: 2, step: 0.05 },
  exitScale: { min: 1, max: 20, step: 0.1 },
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
