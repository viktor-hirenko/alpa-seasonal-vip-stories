import { gsap } from 'gsap'
import { SLIDE_LEAN } from '@/story/slides.js'
import { FACE } from '@/story/journalGeometry.js'
import { snap } from '@/story/timing.js'
import {
  swingOpen,
  journalPath,
  pageTurn,
  journalDissolve,
  hyperspaceBurst,
  outroText,
  HANDOVER_YAW,
} from '@/journal3d/presets.js'
import { setPose } from '@/journal3d/poseTween.js'
import { buildFlyLayer } from '@/journal3d/flyLayer.js'
import { FLIGHTS } from '@/story/flyAssets.js'
import { buildStoryPlan } from '@/story/storyPlan.js'

/**
 * Every preset returns a PAUSED timeline so the lab can fire it standalone.
 * GSAP respects that `paused` flag when the timeline is nested, so a paused
 * child never advances with its parent — the master clock ran while nothing
 * animated. Un-pause on the way in.
 *
 * This was a real bug: the journal sat frozen in frame 4's entrance pose for
 * the whole story while tl.time() tracked the video perfectly.
 */
const nest = (parent, child, at) => parent.add(child.paused(false), at)

/**
 * Compose the presets onto the master timeline at ABSOLUTE video timecodes, so
 * `tl.time() === video.currentTime` is an identity map and the sync loop is
 * trivial (the same trick Thor uses).
 *
 * `hoverTl` comes back null: the story no longer has an idle drift. See the note
 * at the end of this function and the one on `hover` in presets.js.
 */
export function buildStoryTimeline(targets, ctx) {
  const { onUpdate } = ctx

  // THE STORY AS IT WILL PLAY, not as the tables were measured. A link with
  // missing data drops those pages and closes the hole (storyPlan.js); with a
  // complete link the plan hands back the very objects imported above, so
  // everything below is byte-identical to what it was before skipping existed.
  const plan = ctx.plan ?? buildStoryPlan({}, { flights: FLIGHTS })
  const slides = plan.slides
  const path = plan.path
  const timing = plan.timing

  // The 30 flights of flyObjects.js, already positioned at absolute timecodes.
  // Their visibility is a pure function of the clock and is applied from this
  // timeline's onUpdate, which fires on every render including a seek — see
  // flyLayer.js for why it cannot live on the timeline itself.
  const fly = buildFlyLayer(targets.flyLayer, plan.flights, slides)

  // ⚠️ REAL TIME, JUMPS AND ALL. GSAP ships with `lagSmoothing(500, 33)`: when
  // more than 500 ms passes between two ticks it pretends only 33 did, so a
  // long frame does not fling every animation forward. That is right for
  // ordinary motion and wrong for ours — the tape's clock does not pretend, so
  // after one long frame on a phone the two disagree by most of that frame's
  // length, out of nothing. GSAP's own documentation names this case: turn it
  // off when the animation must stay locked to an external clock.
  gsap.ticker.lagSmoothing(0)

  const tl = gsap.timeline({
    paused: true,
    onUpdate: () => {
      fly.applyAt(tl.time())
      onUpdate?.()
    },
  })

  // Face geometry changes at the cover -> data-page handover. It is a layout
  // change, not a transform, and it lands on the same frame as a hard content
  // cut, so it is invisible.
  //
  // WHO CALLS THIS: useStoryPlayback's `applySegment`, off the clock, together
  // with the content cut it belongs to. It is returned rather than scheduled
  // here because a `tl.call()` only fires forwards, and the face has to be
  // right after a backwards seek too — see the note on `applySegment`.
  const setFace = face => {
    const { w, h } = FACE[face]
    targets.stage.style.setProperty('--jw', String(w))
    targets.stage.style.setProperty('--jh', String(h))
  }

  const entrance = slides[0]
  setFace(entrance.face)
  // The pose at t = 0 is whatever swingOpen will `set` when it starts; before
  // that the journal is hidden, so any value paints nothing. The path's first
  // row is used because it is a value in the file rather than a literal here.
  setPose(targets, {
    rot: path[0][1],
    scale: path[0][2],
    cx: path[0][3],
    cy: path[0][4],
  })
  // AND HIDDEN FROM THE FIRST PAINT. The timeline's own `set` at time 0 below
  // only lands once something renders the timeline, and nothing does until
  // playback starts — so without this the journal is on screen, in frame 4's
  // entrance pose, for however long the preloader and the autoplay gesture
  // take. The DOM's initial state has to be the state at t = 0.
  gsap.set(targets.pos, { autoAlpha: 0 })

  // BEFORE THE ENTRANCE THE JOURNAL IS NOT THERE. Not faded, not off-screen —
  // absent, the way it is absent from every clip frame before 118. This pair of
  // `set`s is on the MASTER rather than inside swingOpen, because a `set` inside
  // a nested child cannot act on the seconds before that child begins, which is
  // the whole span that needs it.
  //
  // `autoAlpha` goes on `.journal-pos`, never on `.journal-box`: opacity on the
  // box flattens its faces and the volume pops out of existence. journalDissolve
  // fades the same element at the other end of the story.
  tl.set(targets.pos, { autoAlpha: 0 }, 0)
  tl.set(targets.pos, { autoAlpha: 1 }, snap(timing.entrance.start))

  // `flyInFromFloor` is NOT part of the story any more, and stays exported only
  // as a library preset. It described a journal lying on the floor and lifting,
  // which the clip does not contain — there is nothing at all until 3.9333, and
  // then a cover already past edge-on. It was also inert: nested at the same
  // second as swingOpen, whose `set` on the same properties rendered after it.
  //
  // `next` HANDS THE ENTRANCE THE PATH'S SECOND ROW, in the entrance's own
  // seconds. The two tables already share a row — swingOpen's last key IS
  // JOURNAL_PATH[0], and the comment on that key says move one, move both — but
  // sharing a POSITION is not sharing a SPEED. Without this the entrance's final
  // tangent is one-sided and it arrives at 6.0 travelling at 23 deg/s of yaw and
  // -7.8 %/s of cx, into a path that starts flat; with it the tangent is
  // two-sided like every other one and the seam is 7.8 deg/s and -2.7 %/s.
  // Nothing is rendered from this row: the entrance's playhead stops at its own
  // last key.
  nest(
    tl,
    swingOpen(targets, {
      next: [path[1][0] - timing.entrance.start, ...path[1].slice(1)],
    }),
    snap(timing.entrance.start),
  )

  // THE POSE IS ONE CONTINUOUS PATH from the settled cover to the dissolve, not a
  // tween per slide. It is nested at its own first second, and it runs THROUGH
  // the page turns rather than being interrupted by them — which is what the
  // clip does, and what the old one-pose-per-slide model could not express.
  nest(tl, journalPath(targets, path), path[0][0])

  // The page turn is now only the yaw. Frames 4-7 are the entrance, owned by
  // swingOpen; every cut from 8 to 23 turns the journal out to edge-on and back.
  // Measured at five separate cuts, including the cover -> page handover at
  // 11.07 (TIMING.flip).
  //
  // THE FIRST TURN STARTS FROM THE YAW THE ENTRANCE LEFT, not from zero. Nothing
  // drives rotationY between the handover at 6.0 and this fold, so the journal
  // stands at HANDOVER_YAW for five seconds; the turn's head `set` used to throw
  // those four degrees away in one frame, and one frame before its own motion
  // started, so it read as a twitch of its own rather than as the start of the
  // turn — 18 design px of silhouette width and 7 px of position, where the
  // neighbouring frames were moving under 2.5. Every later turn already begins
  // at zero, so they pass 0 and nothing changes for them.
  slides
    .filter(s => s.frame >= 8 && s.frame <= 23)
    .forEach((slide, i, arr) => {
      // The face swap (cover 1465x1868 -> page 1564x1911) is a 6 % size change,
      // so it goes where the content cut goes: the edge-on instant, where the
      // front face is a hairline and nothing about it can be seen. It is applied
      // from the clock alongside that cut, not scheduled here — see `setFace`.
      // A TURN NOW STARTS WHERE THE PREVIOUS ONE LANDED. Leaving `from` at zero
      // while `to` is a lean would throw the lean away in one frame at the head of
      // the next turn - the same twitch the HANDOVER_YAW note below describes,
      // only on every slide that leans.
      const prev = arr[i - 1]
      const from = i === 0 ? HANDOVER_YAW : (SLIDE_LEAN[prev.frame] ?? 0)
      nest(tl, pageTurn(targets, { from, to: SLIDE_LEAN[slide.frame] ?? 0 }), snap(slide.at))
    })

  // Nested at 0 because the flight timeline is already in absolute video time.
  nest(tl, fly.tl, 0)

  // NO RECEDE. The outro used to be a five-second tween from the path's last row
  // to one storyboard pose, hard-`set` at 83.03 — a tenth of a second BEFORE the
  // final page folds, so the pose it started from had to stay the storyboard's
  // or the journal would have swung 28 degrees in plain sight. Measured off the
  // clip 84.03 to 88.03 there is no draw-back to play: the journal stays on the
  // page, wanders under 100 design px, dips 6 % and comes back. So the outro is
  // just more path, its roll crosses the fold on the spline like every other page
  // turn, and there is nothing here to nest. `recede` stays a library preset with
  // a button in the lab, the way `hover` did when the path replaced it.
  // `from` is the scale the path leaves behind, so the shrink starts from
  // exactly where the pose stopped rather than from a number repeated here.
  nest(tl, journalDissolve(targets, { from: path[path.length - 1][2] }), snap(timing.exit.at))
  nest(tl, hyperspaceBurst(targets), snap(timing.speed.at))
  // Nested at 88.10, the second the title's own first pixels appear — what the
  // old code called the flash was this arrival (TIMING.outro). Its exit leads
  // the burst by 0.23 s and lives inside the same child, so there is one nest
  // here and not two.
  nest(tl, outroText(targets), snap(timing.outro.at))

  // Pad the timeline to the clip's full length so progress and `reach_end`
  // reflect the video, not just the last tween.
  tl.set({}, {}, timing.duration)

  // NO IDLE DRIFT. It was invented rather than measured, and it existed only to
  // keep a journal alive that the pose table had parked. The path moves the
  // journal the way the clip moves it, all the way through every slide, so a
  // synthetic drift on top would double the motion and put it out of step with
  // the reference. `hover` stays a library preset and the lab still has a button
  // for it; the story does not build one. Every consumer of `hoverTl` guards it.
  return { tl, hoverTl: null, fly, setFace, plan }
}
