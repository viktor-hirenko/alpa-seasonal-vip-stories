import { gsap } from 'gsap'
import { SLIDES } from '@/story/slides.js'
import { FACE } from '@/story/journalGeometry.js'
import { TIMING, snap } from '@/story/timing.js'
import {
  flyInFromFloor,
  swingOpen,
  rePose,
  recede,
  whiteFlashExit,
  hyperspaceBurst,
  hover,
} from '@/journal3d/presets.js'
import { setPose } from '@/journal3d/poseTween.js'

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

  const tl = gsap.timeline({
    paused: true,
    onUpdate,
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

  nest(tl, flyInFromFloor(targets), snap(TIMING.entrance.start))
  nest(tl, swingOpen(targets), snap(TIMING.entrance.start))

  // Per-slide re-pose from frame 8 onwards (4-7 are the entrance keyframes,
  // owned by swingOpen).
  const posed = SLIDES.filter(s => s.frame >= 8 && s.frame <= 23)
  posed.forEach((slide, i) => {
    const from = i === 0 ? SLIDES.find(s => s.frame === 7).pose : posed[i - 1].pose
    const at = snap(slide.at)
    tl.call(() => setFace(slide.face), null, at)
    nest(tl, rePose(targets, from, slide.pose), at)
  })

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

  return { tl, hoverTl }
}
