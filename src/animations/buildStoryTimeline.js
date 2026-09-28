import { gsap } from 'gsap'
import { FACE } from '@/story/journalGeometry.js'
import { snap, TIMING, SLIDE_FLIP_BACK } from '@/story/timing.js'
import {
  swingOpen,
  journalPath,
  journalDrift,
  pageTurn,
  journalDissolve,
  outroText,
  HANDOVER_YAW,
} from '@/journal3d/presets.js'
import { setPose } from '@/journal3d/poseTween.js'
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
  const plan = ctx.plan ?? buildStoryPlan({})
  const slides = plan.slides
  const path = plan.path
  const timing = plan.timing

  // ⚠️ 800 ms, NOT GSAP'S 500 AND NOT ZERO. BOTH EXTREMES WERE TRIED TODAY.
  //
  // GSAP's ticker normally pretends that a gap longer than `lagSmoothing`'s
  // threshold was only 33 ms, so one stalled frame does not fling every
  // animation forward. Two things pull in opposite directions here:
  //
  //  - ZERO (real time, no clamp) is what an animation held against an external
  //    clock wants: the tape does not pretend, so any clamp invents
  //    disagreement out of nothing, and with the scene leading the correction
  //    answers by dragging the TAPE backwards.
  //  - ZERO IS ALSO HOW THE STORY BROKE WHEN THE PLAYER SWITCHED APPS. A
  //    backgrounded page stops ticking; on return the whole absence is applied
  //    in one tick. Measured at six seconds away with the tape paused by iOS:
  //    the scene came back six seconds ahead of it and was then yanked back.
  //
  // `onSystemPause` in useStoryPlayback is the real fix — the scene now stops
  // whenever the tape stops, whoever stopped it. ⚠️ But it cannot be the ONLY
  // one: it runs on an EVENT, and an event is delivered after the tick that
  // wakes the page. Measured, with the pause delivered late, the scene still
  // jumped the full six seconds.
  //
  // So a threshold well above any frame this story has ever produced — the
  // worst measured is 80 ms at quarter CPU speed, so 800 is ten times it — and
  // well below any real absence. Inside normal play it never fires; a genuine
  // app switch is caught by whichever of the two notices first.
  gsap.ticker.lagSmoothing(800, 33)

  const tl = gsap.timeline({
    paused: true,
    onUpdate: () => {
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

  // THE LEVITATION, one child across the whole film, on `.journal-hover`.
  //
  // It is nested at 0 rather than at the journal's entrance because the mock
  // asks for the cover to come IN already weightless — «журнал: починає заходити
  // в кадр … у тому ж режимі невагомості» (21770:4964) — and because a drift
  // that starts mid-story has a seam where it starts. Before the journal is
  // visible it writes to an element nobody can see, which costs one `gsap.set`
  // a frame and buys a continuous curve.
  //
  // ⚠️ NOT returned as `hoverTl`. The consumers of that handle call `play(0)`
  // and `pause()` on it, which is right for a standalone looping drift and
  // wrong for a child of the master clock — `play(0)` would throw the story's
  // own second away. It rides the master like every other child instead.
  nest(tl, journalDrift(targets, { to: timing.duration }), 0)

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
  //
  // WHERE A TURN LANDS AND WHERE THE NEXT ONE STARTS, on both depth axes: SQUARE
  // ON, every time (DP-15822). Until this session each slide landed on a lean
  // measured off the clip, and the two depth channels then held that angle until
  // the next turn — frozen for whole seconds at a stretch. The depth is the
  // levitation's now, and the levitation lives on `.journal-hover`, a different
  // element in the same 3D chain, so the turn hands over a clean zero and the
  // drift rides on top of it without either one arguing with the other.
  const SQUARE = { y: 0, x: 0 }

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
      const left = i === 0 ? { y: HANDOVER_YAW, x: 0 } : SQUARE
      const lands = SQUARE
      // ⚠️ EVERY SLIDE TURNS AT ITS OWN MEASURED SPEED (SLIDE_FLIP_BACK, 20.09).
      // The clip's spread is threefold and a single number is right on average
      // and wrong on every page; the table's own note carries the measurement.
      //
      // ⚠️ AND THE CAP THAT USED TO BE HERE IS GONE WITH THE LEAN TABLE. It
      // clipped a turn that ran past the first lean row — four slides were
      // clipped, not the two the old comment named. With nothing else writing
      // rotationY between the turns, every slide now plays its own measurement
      // in full. The anchor in JOURNAL_PATH sits at exactly where it ends.
      const back = SLIDE_FLIP_BACK[slide.frame] ?? TIMING.flip.back
      nest(
        tl,
        pageTurn(targets, { from: left.y, to: lands.y, fromX: left.x, toX: lands.x, back }),
        snap(slide.at),
      )
    })

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
  // NO `from` SINCE 2026-09-28, AND THAT IS THE POINT: journalDissolve used to
  // own a second shrink, which restarted the motion from zero velocity 0.07 s
  // after JOURNAL_PATH had stopped and then ran seventy times faster than it.
  // The whole departure is one curve in JOURNAL_PATH now (its header carries the
  // measurement), and this preset is left with the job its name describes.
  nest(tl, journalDissolve(targets), snap(timing.exit.at))
  // Nested at 88.10, the second the title's own first pixels appear — what the
  // old code called the flash was this arrival (TIMING.outro). Its exit leads
  // the burst by 0.23 s and lives inside the same child, so there is one nest
  // here and not two.
  nest(tl, outroText(targets), snap(timing.outro.at))

  // Pad the timeline to the clip's full length so progress and `reach_end`
  // reflect the video, not just the last tween.
  tl.set({}, {}, timing.duration)

  // `hoverTl` STAYS NULL, and that is not the same as "no drift" any more. The
  // levitation is nested above as an ordinary child of the master clock; this
  // handle exists for a standalone looping timeline that the story no longer
  // has, and every consumer of it is guarded. Handing them the drift would let
  // `play(0)` reset the story's own playhead.
  return { tl, hoverTl: null, setFace, plan }
}
