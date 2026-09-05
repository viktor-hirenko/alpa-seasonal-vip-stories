import { gsap } from 'gsap'
import { SLIDES, JOURNAL_PATH, RECEDE_POSE } from '@/story/slides.js'
import { FACE } from '@/story/journalGeometry.js'
import { TIMING, snap } from '@/story/timing.js'
import {
  swingOpen,
  journalPath,
  pageTurn,
  recede,
  whiteFlashExit,
  hyperspaceBurst,
  outroText,
} from '@/journal3d/presets.js'
import { setPose } from '@/journal3d/poseTween.js'
import { buildFlyLayer } from '@/journal3d/flyLayer.js'
import { FLIGHTS } from '@/story/flyAssets.js'

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

  // The 30 flights of flyObjects.js, already positioned at absolute timecodes.
  // Their visibility is a pure function of the clock and is applied from this
  // timeline's onUpdate, which fires on every render including a seek — see
  // flyLayer.js for why it cannot live on the timeline itself.
  const fly = buildFlyLayer(targets.flyLayer, FLIGHTS)

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
  const setFace = face => {
    const { w, h } = FACE[face]
    targets.stage.style.setProperty('--jw', String(w))
    targets.stage.style.setProperty('--jh', String(h))
  }

  const entrance = SLIDES[0]
  setFace(entrance.face)
  // The pose at t = 0 is whatever swingOpen will `set` when it starts; before
  // that the journal is hidden, so any value paints nothing. The path's first
  // row is used because it is a value in the file rather than a literal here.
  setPose(targets, {
    rot: JOURNAL_PATH[0][1], scale: JOURNAL_PATH[0][2],
    cx: JOURNAL_PATH[0][3], cy: JOURNAL_PATH[0][4],
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
  // box flattens its faces and the volume pops out of existence. whiteFlashExit
  // hides it in the same place at the other end of the story.
  tl.set(targets.pos, { autoAlpha: 0 }, 0)
  tl.set(targets.pos, { autoAlpha: 1 }, snap(TIMING.entrance.start))

  // `flyInFromFloor` is NOT part of the story any more, and stays exported only
  // as a library preset. It described a journal lying on the floor and lifting,
  // which the clip does not contain — there is nothing at all until 3.9333, and
  // then a cover already past edge-on. It was also inert: nested at the same
  // second as swingOpen, whose `set` on the same properties rendered after it.
  nest(tl, swingOpen(targets), snap(TIMING.entrance.start))

  // THE POSE IS ONE CONTINUOUS PATH from the settled cover to the recede, not a
  // tween per slide. It is nested at its own first second, and it runs THROUGH
  // the page turns rather than being interrupted by them — which is what the
  // clip does, and what the old one-pose-per-slide model could not express.
  nest(tl, journalPath(targets, JOURNAL_PATH), JOURNAL_PATH[0][0])

  // The page turn is now only the yaw. Frames 4-7 are the entrance, owned by
  // swingOpen; every cut from 8 to 23 turns the journal out to edge-on and back.
  // Measured at five separate cuts, including the cover -> page handover at
  // 11.07 (TIMING.flip).
  SLIDES.filter(s => s.frame >= 8 && s.frame <= 23).forEach(slide => {
    const at = snap(slide.at)
    // The face swap (cover 1465x1868 -> page 1564x1911) is a 6 % size change,
    // so it goes where the content cut goes: the edge-on instant, where the
    // front face is a hairline and nothing about it can be seen.
    tl.call(() => setFace(slide.face), null, snap(at + TIMING.flip.out))
    nest(tl, pageTurn(targets), at)
  })

  // Nested at 0 because the flight timeline is already in absolute video time.
  nest(tl, fly.tl, 0)

  // The recede starts from wherever the path leaves the journal, so it is read
  // off the path's last row rather than restated.
  const last = JOURNAL_PATH[JOURNAL_PATH.length - 1]
  const from = { rot: last[1], scale: last[2], cx: last[3], cy: last[4] }
  nest(tl, recede(targets, from, RECEDE_POSE), snap(TIMING.recede.at))
  nest(tl, whiteFlashExit(targets), snap(TIMING.flash.at))
  nest(tl, hyperspaceBurst(targets), snap(TIMING.speed.at))
  // Nested at the flash, not after it: the text's first frame IS the flash's
  // first frame. Its exit leads the burst by 0.23 s and lives inside the same
  // child, so there is one nest here and not two.
  nest(tl, outroText(targets), snap(TIMING.outro.at))

  // Pad the timeline to the clip's full length so progress and `reach_end`
  // reflect the video, not just the last tween.
  tl.set({}, {}, TIMING.duration)

  // NO IDLE DRIFT. It was invented rather than measured, and it existed only to
  // keep a journal alive that the pose table had parked. The path moves the
  // journal the way the clip moves it, all the way through every slide, so a
  // synthetic drift on top would double the motion and put it out of step with
  // the reference. `hover` stays a library preset and the lab still has a button
  // for it; the story does not build one. Every consumer of `hoverTl` guards it.
  return { tl, hoverTl: null, fly }
}
