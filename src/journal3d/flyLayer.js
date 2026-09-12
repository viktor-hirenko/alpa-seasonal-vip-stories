import { gsap } from 'gsap'
import { snap } from '@/story/timing.js'
import { FLY_Z, FLY_Z_FRONT, FLY_LAYER } from '@/story/flyObjects.js'
import { SLIDES } from '@/story/slides.js'
import { flyingObject } from './flyingObject.js'

/**
 * Compose every flight onto one timeline, positioned at ABSOLUTE video
 * timecodes so `tl.time() === video.currentTime` stays an identity map — the
 * same contract buildStoryTimeline uses for the journal.
 *
 * Returns `{ tl, applyAt, entries }`:
 *   `tl`      paused, finite, ready to nest at position 0 on a master timeline
 *             or to be driven directly with `.time(t)` (which is what the lab
 *             does, since it has no master).
 *   `applyAt` switches each object's `visibility` for the clock time `t`.
 *
 * WHY VISIBILITY IS NOT ON THE TIMELINE. When the playhead rewinds past a
 * nested child, GSAP re-renders that child at its own time 0 — so a `set` to
 * "visible" at the head of a flight fires again for every time BEFORE the
 * flight, and the object hangs around from the first frame of the story. Any
 * ordering of sets inside the child has the same defect in one direction or the
 * other. Deriving it from the clock instead is a pure function of `t`, so it is
 * right after any seek, backwards included. That is exactly the argument
 * ADR-0008 makes for the page cut.
 *
 * WHAT `visibility` IS AND IS NOT FOR. It is the flight's window, not its exit.
 * In the reference an object does not fade or blink out: it drifts down onto
 * the journal and the journal covers it, which is why every flight in the table
 * ends BEHIND the page and reading 90-100 % occluded on the reference's own
 * frames. The switch happens after that, on an object the page is already
 * hiding — turning it off any earlier is the "objects vanish instead of going
 * behind the journal" the first pass shipped. Getting BEHIND the page is
 * `--fo-z`, set below at the flight's own measured `zFlip`; before that moment
 * the object is in front and the page must not clip it.
 *
 * @param {HTMLElement} layerEl the `.fly-layer` element
 * @param {import('@/story/flyObjects.js').FlyRecord[]} records
 */
/**
 * When the slide an object belongs to leaves the screen.
 *
 * THE PAGE TURN IS A HARD CEILING ON BEING IN FRONT (owner, 2026-09-12: "when
 * the journal turns, the objects should go under it at once — the journal has
 * to cover them; it is ugly when the page has already turned and an object from
 * the previous slide is still shrinking on top of it"). An object may fly over
 * its OWN page for as long as the measurement says, but the moment the next
 * page arrives it belongs behind the journal, whatever `zFlip` was measured at.
 *
 * Only `pen-1` actually crosses that line — its `zFlip` is 18.17 and its slide
 * ends at 17.10, so it floated over the next page for 1.07 s and then blinked
 * out, which is the pen the owner named. The other 26 already flip earlier, and
 * for them this ceiling changes nothing. Measured against the reference clip,
 * the pen at t = 17.67 was 0 % covered for us and 96 % covered there, so this
 * also moves us TOWARDS the clip rather than away from it.
 */
const slideEnd = frame => {
  const later = SLIDES.filter(s => s.frame > frame).map(s => s.at)
  return later.length ? Math.min(...later) : Infinity
}

export function buildFlyLayer(layerEl, records) {
  const tl = gsap.timeline({ paused: true })
  const entries = []

  for (const rec of records) {
    const pos = layerEl?.querySelector(`.fly-obj[data-fly="${rec.id}"]`)
    const box = pos?.querySelector('.fly-obj__box')
    if (!pos || !box) continue

    // `t0` snaps onto the frame grid like every other cue (ADR-0009); the END
    // does not, because snapping it ROUNDS DOWN as often as up and a flight
    // asked for its own last keyframe then renders nothing. It is the moment
    // the page has already swallowed the object, so a frame of slack there
    // costs nothing and a frame short is a visible pop.
    const at = snap(rec.t0)
    entries.push({
      rec, el: pos, at, live: null, front: null,
      // ...and it stops being drawn there too. Every flight in the table
      // outlives its own slide by 0.8-2.5 s, and for 24 of the 27 those seconds
      // are spent 100 % behind the page, so cutting them changes nothing on
      // screen. For the other three it is the fix: the object was still out in
      // the open beside the turned page, shrinking, which is what the owner
      // called ugly.
      end: Math.min(rec.t1, slideEnd(rec.frame)),
      // ONE depth for the whole flight, from the storyboard (FLY_LAYER), and
      // it ends at the page turn. There is no mid-slide crossing any more: that
      // crossing was a visible pop, because the object was already overlapping
      // the journal when it changed sides (V-96).
      frontUntil: FLY_LAYER[rec.id] === 'behind' ? -Infinity : slideEnd(rec.frame),
    })
    tl.add(flyingObject({ pos, box }, rec).paused(false), at)
  }

  const applyAt = t => {
    for (const e of entries) {
      const live = t >= e.at && t <= e.end
      if (live !== e.live) {
        e.live = live
        e.el.style.visibility = live ? 'visible' : 'hidden'
      }
      // Depth belongs here for exactly the reason visibility does: it is a pure
      // function of the clock, so it is right after any seek, backwards
      // included. An object flies IN FRONT of the journal and crosses behind it
      // at `zFlip` — measured off the clip, see flyObjects.js.
      //
      // A single step, not a ramp, and now that `zFlip` is the FIRST frame the
      // page touches the object rather than the middle of the handover, the step
      // is the honest shape. Ramping z would sweep the page's tilted plane
      // through the object and wipe it diagonally — a handsome effect that the
      // reference never performs. What the reference actually does after the
      // crossing is let the page EDGE ride across an object already behind it,
      // and that we get for free from the geometry, gradually, provided the step
      // lands while the page still covers nothing. It used not to: the crossing
      // sat seconds late, deep inside the page, and the object went from wholly
      // drawn to half eaten between two frames.
      const front = t < e.frontUntil
      if (front !== e.front) {
        e.front = front
        e.el.style.setProperty('--fo-z', String(front ? FLY_Z_FRONT : FLY_Z))
      }
    }
  }

  // One full pass forward and back, to INITIALISE every nested flight.
  // A GSAP tween resolves its start values on first render, and a parent
  // playhead landing EXACTLY on a child's start time does not count as one — so
  // seeking to a flight's own `t0`, which is precisely what `fly:check` and the
  // debug hook do, would otherwise render the object untransformed for that
  // frame. Measured: pen-1 at t = 11.20 sat at the stage's top-left at 1:1,
  // while t = 11.24 was correct.
  tl.progress(1, true).progress(0, true)

  // Park everything hidden before the first render, so a story that starts at
  // t = 0 never flashes an object at its entry pose.
  applyAt(-1)

  return { tl, applyAt, entries }
}
