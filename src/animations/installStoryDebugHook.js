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
  const { tl, hoverTl, videoPlayer, segments, seek, targets } = ctx

  window.__story = {
    tl,
    hoverTl,
    get video() {
      return videoPlayer.value
    },
    targets,
    segments,
    seek,
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
  }
}
