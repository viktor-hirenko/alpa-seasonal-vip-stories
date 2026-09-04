import { gsap } from 'gsap'
import { TIMING } from '@/story/timing.js'

/**
 * DEV-only debug hook, ported from Thor.
 *
 * `seekPage` takes a Figma FRAME NUMBER rather than an array index: the
 * designer talks in frame numbers, and removing that translation step from
 * every conversation is worth the two lines. It lands past the page turn, not
 * on the cut, so what you land on is the settled page rather than a journal
 * caught on its edge.
 */
export function installStoryDebugHook(ctx) {
  if (!import.meta.env.DEV) return
  const { tl, hoverTl, videoPlayer, segments, seek, applySegment, targets } = ctx

  // Merge rather than assign: useJournalFit parks its report on the same
  // object, and the two are installed independently.
  window.__story = Object.assign(window.__story || {}, {
    // Exposed so a measuring script can read the LIVE pose. Mid-entrance the
    // pose is a tween and no table holds it, and decomposing the computed
    // matrix3d back into rotationX/Y/Z plus scale is exactly the guesswork
    // GSAP already did on the way in.
    gsap,
    tl,
    hoverTl,
    get video() {
      return videoPlayer.value
    },
    targets,
    segments,
    seek,
    /**
     * THE PAGE CUT, ON DEMAND — for measuring scripts, not for the product.
     *
     * `seek` already applies it, but every parking routine in scripts/ then
     * waits for the video to settle, and during that wait the video is still
     * PLAYING and the sync loop keeps applying the cut for the advancing
     * second. The park ends by putting the video and the timeline back where
     * they were asked to be; nothing put the PAGE back. Contact sheets around a
     * cut therefore showed the next page against the clip's previous one — seen
     * at t = 30.0, where our panel had `money_talks` and the clip still had
     * `vip_status`. Parking scripts call this last.
     */
    applySegment,
    seekPage(frame) {
      const seg = segments.find(s => s.firstFrame === frame)
      if (!seg) return console.warn('[story] no segment for frame', frame)
      seek(seg.start + TIMING.flip.out + TIMING.flip.back)
    },
    pose() {
      if (!targets?.box) return null
      return {
        matrix: getComputedStyle(targets.box).transform,
        jw: getComputedStyle(targets.stage).getPropertyValue('--jw').trim(),
        jh: getComputedStyle(targets.stage).getPropertyValue('--jh').trim(),
      }
    },
  })
}
