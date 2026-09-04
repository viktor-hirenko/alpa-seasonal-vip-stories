import { gsap } from 'gsap'
import { SLIDES } from '@/story/slides.js'
import { FACE } from '@/story/journalGeometry.js'
import { TIMING, snap } from '@/story/timing.js'
import {
  swingOpen,
  rePose,
  recede,
  whiteFlashExit,
  hyperspaceBurst,
  hover,
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
 * The idle drift is built SEPARATELY and returned alongside: it is `repeat: -1`,
 * and putting it on the master would make `tl.duration()` infinite and destroy
 * the sync and progress model entirely.
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
  setPose(targets, entrance.pose)
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

  // Per-slide re-pose from frame 8 onwards (4-7 are the entrance keyframes,
  // owned by swingOpen). Every one of these IS a page turn: the journal yaws
  // out to edge-on and back while it re-poses. Measured at five separate cuts,
  // including the cover -> page handover at 11.07 (TIMING.flip).
  const posed = SLIDES.filter(s => s.frame >= 8 && s.frame <= 23)
  posed.forEach((slide, i) => {
    const from = i === 0 ? SLIDES.find(s => s.frame === 7).pose : posed[i - 1].pose
    const at = snap(slide.at)
    // The face swap (cover 1465x1868 -> page 1564x1911) is a 6 % size change,
    // so it goes where the content cut goes: the edge-on instant, where the
    // front face is a hairline and nothing about it can be seen.
    tl.call(() => setFace(slide.face), null, snap(at + TIMING.flip.out))
    nest(tl, rePose(targets, from, slide.pose, { flip: true }), at)
  })

  // Nested at 0 because the flight timeline is already in absolute video time.
  nest(tl, fly.tl, 0)

  const f23 = SLIDES.find(s => s.frame === 23)
  const f24 = SLIDES.find(s => s.frame === 24)
  nest(tl, recede(targets, f23.pose, f24.pose), snap(TIMING.recede.at))
  nest(tl, whiteFlashExit(targets), snap(TIMING.flash.at))
  nest(tl, hyperspaceBurst(targets), snap(TIMING.speed.at))

  // Pad the timeline to the clip's full length so progress and `reach_end`
  // reflect the video, not just the last tween.
  tl.set({}, {}, TIMING.duration)

  const hoverTl = hover(targets)
  hoverTl.pause()

  return { tl, hoverTl, fly }
}
