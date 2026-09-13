import { SLIDES, JOURNAL_PATH, STORY_END, PAGE_ORDER, STORY_SEGMENTS } from './slides.js'
import { TIMING, snap } from './timing.js'

/**
 * THE STORY AS IT WILL ACTUALLY PLAY, once the pages with no data are dropped.
 *
 * A link carries a player's numbers. Anything it does not carry, the story has
 * nothing to say about: "your biggest win: <nothing> EUR" is a broken sentence,
 * not a page. Thor solves this by not building the scene and seeking the video
 * over the hole (useStoryData.js:104, scripts.js:348, useStoryPlayback.js:63);
 * this is the same idea, adapted to a journal that turns pages.
 *
 * WHY IT IS NOT A ONE-LINER LIKE THOR'S. In Thor the background is ordinary
 * footage and a scene is an overlay, so `video.currentTime = next.vstart` is
 * the whole mechanism. Here the journal's POSE — roll, size, position — is a
 * path measured off the clip second by second (JOURNAL_PATH), so cutting four
 * seconds out of the video cuts four seconds out of the journal's dance too,
 * and the two ends of the cut do not meet. Measured at the ten cut points, the
 * far side stands up to 27 deg and 80 screen px away from the near side. Jump
 * straight and the journal visibly teleports.
 *
 * SO THE SEAM IS BRIDGED RATHER THAN CLOSED. Every page change already turns
 * the journal out to edge-on (TIMING.flip: 0.14 s out, 0.6 s back) and swaps
 * the page content at the hairline instant in the middle, where nothing about
 * the front face can be seen. A skipped page reuses exactly that: the video
 * jumps at the hairline instant, and the journal spends the turn's own 0.6 s
 * return travelling to its new pose. From outside it is one ordinary page turn
 * that happens to land two pages further on.
 *
 * WHY THE VIDEO MAY BE JUMPED AT ALL. The delivered background is a room with
 * light and particles and nothing else — the flying objects came out of it on
 * 2026-09-12. Sampled at all ten cut points, consecutive frames differ by 0.4
 * to 3.2 out of 255, i.e. the room is all but still, so a jump inside it has
 * nothing to show. This is the fact the whole mechanism rests on; re-measure it
 * if the background is ever replaced by something that moves.
 *
 * ⚠️ WITH A COMPLETE LINK THIS FILE IS AN IDENTITY. No page is dropped, no
 * window is removed, `toStory` returns its argument, and every table comes back
 * the object it went in as. That is what keeps `pose:check` and `fly:check`
 * comparable with the numbers in _context/90-next-session.md — they measure the
 * full story, and the full story must not have moved by a millisecond.
 */

/** Where a page's content swaps: the turn's edge-on instant (ADR-0008). */
const cutOf = slide => snap(slide.at + TIMING.flip.out)

/**
 * The seconds the journal takes to come back from edge-on. A removed stretch is
 * replaced by exactly this much story time, so the pose has a turn's worth of
 * travel to cross the seam in.
 */
const BRIDGE = TIMING.flip.back

/** Absolute timecodes in TIMING that sit after the skippable block and shift with it. */
const shiftTiming = (timing, toStory) => ({
  ...timing,
  recede: { ...timing.recede, at: toStory(timing.recede.at) },
  exit: {
    ...timing.exit,
    at: toStory(timing.exit.at),
    fadeAt: toStory(timing.exit.fadeAt),
  },
  speed: { ...timing.speed, at: toStory(timing.speed.at) },
  outro: {
    ...timing.outro,
    at: toStory(timing.outro.at),
    exitAt: toStory(timing.outro.exitAt),
  },
  cta: { from: toStory(timing.cta.from), to: toStory(timing.cta.to) },
  replay: { at: toStory(timing.replay.at) },
  duration: toStory(timing.duration),
})

/**
 * @typedef {{ from: number, to: number, at: number }} Gap
 *   A stretch of VIDEO removed from the story. `from` and `to` are video
 *   seconds; `at` is the story second the jump happens on, which is the same
 *   before and after it — the map is continuous across the hole.
 */

/**
 * Build the plan.
 *
 * @param {Record<string, boolean>} [skip] `skip` out of useStoryData: true where
 *   the link carried nothing for that page. An absent or empty record means a
 *   complete link and returns the identity plan.
 * @param {{ flights?: any[] }} [opts] `flights` is FLIGHTS from flyAssets.js.
 *   Passed in rather than imported so this file stays pure data-in/data-out and
 *   can be exercised by a script: flyAssets resolves its art with a Vite glob,
 *   which does not exist outside a build.
 */
export function buildStoryPlan(skip = {}, opts = {}) {
  const FLIGHTS = opts.flights ?? []
  const dropped = new Set(
    SLIDES.filter(s => s.skip && skip[s.skip]).map(s => s.frame),
  )

  // ⚠️ THE FIRST AND LAST PAGES ARE NEVER DROPPED, and the ten that can be are
  // one unbroken run in the middle (frames 9..18, 17.1 s to 57.07 s). So the
  // cover, the editor's note and the whole tail from the sponsor to the final
  // page keep their own seconds whatever the link carries, and only the middle
  // gets shorter. Nothing here has to reason about the ends.
  if (!dropped.size) return identityPlan(FLIGHTS)

  const kept = SLIDES.filter(s => !dropped.has(s.frame))

  /** @type {Gap[]} */
  const gaps = []
  /** Video time -> the story second it lands on, for the pages we keep. */
  const storyCut = new Map()

  let removed = 0
  for (let i = 0; i < kept.length; i++) {
    const slide = kept[i]
    const prev = kept[i - 1]
    // Slides between this one and the previous kept one, in the original table.
    const skippedBefore =
      prev && SLIDES.indexOf(slide) - SLIDES.indexOf(prev) > 1

    if (skippedBefore) {
      // The hole runs from the first dropped page's own cut — the hairline
      // instant it would have appeared on — to this page's cut, minus the
      // bridge we keep so the pose has somewhere to travel.
      const firstDropped = SLIDES[SLIDES.indexOf(prev) + 1]
      const from = cutOf(firstDropped)
      const to = snap(cutOf(slide) - BRIDGE)
      // A hole shorter than the bridge would run time backwards. It cannot
      // happen with the measured table (the tightest pair of cuts is 3.8 s
      // apart against a 0.6 s bridge), but the guard is cheap and a re-timed
      // video is exactly the kind of change that would break the assumption.
      if (to > from) {
        gaps.push({ from, to, at: +(from - removed).toFixed(4) })
        removed = +(removed + (to - from)).toFixed(4)
      }
    }
    storyCut.set(slide.frame, +(cutOf(slide) - removed).toFixed(4))
  }

  /** How much video has been cut away before video second `v`. */
  const removedBefore = v => {
    let sum = 0
    for (const g of gaps) {
      if (v >= g.to) sum += g.to - g.from
      else if (v > g.from) sum += v - g.from
      else break
    }
    return sum
  }

  const toStory = v => +(v - removedBefore(v)).toFixed(4)

  const toVideo = s => {
    let v = s
    for (const g of gaps) {
      if (v >= g.from) v += g.to - g.from
      else break
    }
    return +v.toFixed(4)
  }

  /** True while `v` is inside a hole — the sync loop jumps out of it. */
  const gapAt = v => gaps.find(g => v >= g.from && v < g.to) ?? null

  // --- The tables, re-timed -------------------------------------------------

  // A turn's edge-on lands on the page's story cut, so it starts a flip.out
  // earlier — which is the page's own `at` again whenever nothing was dropped
  // before it, and is NOT when something was: a dropped page swallows the next
  // page's `at`, and only the cut survives the hole.
  const slides = kept.map(s => ({
    ...s,
    at: +(storyCut.get(s.frame) - TIMING.flip.out).toFixed(4),
    videoAt: s.at,
  }))

  // ⚠️ ROWS INSIDE A HOLE GO, AND THE BRIDGE IS WHAT IS LEFT. The last row
  // before the hole and the first row after it end up BRIDGE seconds apart in
  // story time, so the path's own interpolation carries the journal across at
  // the speed of a page turn instead of teleporting it.
  const path = JOURNAL_PATH.filter(row => !gaps.some(g => row[0] >= g.from && row[0] < g.to)).map(
    row => [toStory(row[0]), ...row.slice(1)],
  )

  // A flight belongs to the page it was measured on, so a dropped page takes
  // its objects with it. The `frame` field is what says which page that is.
  const flights = FLIGHTS.filter(
    f => !dropped.has(f.frame) && !gaps.some(g => f.t0 >= g.from && f.t0 < g.to),
  ).map(f => ({
    ...f,
    keys: f.keys.map(k => [toStory(k[0]), ...k.slice(1)]),
    t0: toStory(f.t0),
    t1: toStory(f.t1),
    zFlip: f.zFlip == null ? f.zFlip : toStory(f.zFlip),
  }))

  const pageOrder = PAGE_ORDER.filter(p => slides.some(s => s.page === p))
  const storyEnd = toStory(STORY_END)
  const segments = buildSegments(slides, pageOrder, storyCut, removed, storyEnd)

  return {
    identity: false,
    dropped,
    droppedPages: PAGE_ORDER.filter(p => !pageOrder.includes(p)),
    slides,
    segments,
    path,
    flights,
    timing: shiftTiming(TIMING, toStory),
    storyEnd,
    gaps,
    gapAt,
    toStory,
    toVideo,
  }
}

/**
 * Segments, in story time. Same shape and same rules as `STORY_SEGMENTS` in
 * slides.js — one per page, `cut` is where the content swaps — but built from
 * the pages that survived and from their re-timed seconds.
 */
function buildSegments(slides, pageOrder, storyCut, removed, storyEnd) {
  return pageOrder.map((page, index) => {
    const own = slides.filter(s => s.page === page)
    const first = own[0]
    const nextPage = pageOrder[index + 1]
    const end = nextPage ? slides.find(s => s.page === nextPage).at : storyEnd
    return {
      page,
      index,
      start: first.at,
      // The cover is not turned into view, it flies in — so it has no lead.
      cut: index === 0 ? first.at : storyCut.get(first.frame),
      end,
      dur: +(end - first.at).toFixed(4),
      firstFrame: first.frame,
      face: first.face,
      skip: first.skip,
    }
  })
}

/**
 * The complete-link plan: every table is the object the rest of the project
 * already imports, and the two maps are the identity. Returned by reference on
 * purpose — a copy here would be a second source of truth for measured numbers.
 */
function identityPlan(FLIGHTS) {
  const same = t => t
  return {
    identity: true,
    dropped: new Set(),
    droppedPages: [],
    slides: SLIDES,
    segments: STORY_SEGMENTS,
    path: JOURNAL_PATH,
    flights: FLIGHTS,
    timing: TIMING,
    storyEnd: STORY_END,
    gaps: [],
    gapAt: () => null,
    toStory: same,
    toVideo: same,
  }
}
