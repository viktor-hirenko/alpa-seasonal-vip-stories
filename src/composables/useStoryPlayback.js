import { gsap } from 'gsap'
import { EASE } from '@/story/easing.js'
import { STORY_SEGMENTS } from '@/story/slides.js'
import { FPS, TIMING } from '@/story/timing.js'

/**
 * Playback + navigation. Ported from Thor's useStoryPlayback.js, which is ~490
 * lines of hard-won iOS video/GSAP knowledge — the parts that survive verbatim
 * are marked. Do not "simplify" them without reading the comments.
 *
 * Deviations from Thor, all deliberate:
 *  - No gap-skipping. Thor removed skipped scenes from the timeline and seeked
 *    the video over the resulting holes. Here the background is ONE continuous
 *    94 s clip with the choreography baked in, so there are no holes to skip;
 *    a page with no data gets fallback copy instead (see _context/40-open-questions.md #1).
 *  - The sync tolerance is a frame and a half of the clip rather than a
 *    hardcoded 0.04, and it closes by rate rather than by position.
 *  - The idle-drift timeline is separate from the master (it is `repeat: -1`,
 *    which would make the master's duration infinite), so it has to be paused
 *    and resumed alongside the story on every path.
 *  - Page cuts are applied from this rAF loop, not by timeline `.set()` calls,
 *    so they stay frame-exact and correct under an arbitrary seek (ADR-0008).
 *  - The outro FREEZES on the last frame instead of looping the tail: the
 *    hyperspace burst at 92.83 is a one-shot event and looping it reads as a bug.
 */
const PRESS_DURATION = 250 // ms before a press counts as a long-press (hold-to-pause)

export function useStoryPlayback(ctx) {
  const {
    tl,
    hoverTl,
    videoPlayer,
    notify,
    longPress,
    pressTimer,
    isPlaying,
    isPaused,
    currentTime,
    activeSegment,
    showPlayButton,
    isBuffering,
    onSegmentChange,
    setFace,
    plan,
    targets,
  } = ctx

  // TWO CLOCKS, AND ONLY WHEN A PAGE WAS DROPPED. `video.currentTime` is the
  // tape; `tl.time()` is the story the player is watching. With a complete link
  // the plan's maps are the identity and the two are the same number, which is
  // the contract every comment in this file was written against. With a page
  // dropped they differ by the stretches storyPlan.js cut out, and the video is
  // jumped over each of them at the hairline instant of a page turn.
  const SEGMENTS = plan?.segments ?? STORY_SEGMENTS
  const toStory = plan?.toStory ?? (t => t)
  const toVideo = plan?.toVideo ?? (t => t)
  const gapAt = plan?.gapAt ?? (() => null)

  /** Which segment is on screen at STORY time `t`; same rule as slides.js. */
  const segmentAt = t => {
    let idx = -1
    for (let i = 0; i < SEGMENTS.length; i++) {
      if (t >= SEGMENTS[i].cut - 1e-3) idx = i
    }
    return idx
  }

  let frameHandle = null
  let syncStarted = false
  let isFinalHolding = false

  /**
   * ⚠️ WHICH PAGE THE ARROWS ARE COUNTING FROM, and it is NOT the one on screen.
   *
   * A forward jump lands on the target segment's `start`, which is
   * TIMING.flip.out BEFORE its `cut` — so for those 0.14 s `segmentAt()` still
   * answers with the PREVIOUS page, by design: the turn has to play before the
   * content swaps. Navigation used to count from that answer, which means a
   * second press arriving inside the window computed the same target again and
   * seeked back to where it already was. Press faster than the window and the
   * story never advances at all: it sits there re-seeking one page, the journal
   * twitching, the content flicking forward and back. Measured 2026-09-17,
   * eight presses 60 ms apart moved the story exactly one page — and it does
   * the same on the build from before any of this month's work, so it is old,
   * not new.
   *
   * Counting from the last REQUESTED page instead makes a burst of presses walk
   * forward one page each. It is cleared on arrival, so ordinary playback and
   * any other kind of seek go back to reading the clock.
   */
  let requestedIdx = null

  // After a manual seek iOS keeps decoding from the previous keyframe for a few
  // frames past `seeked`, so currentTime briefly advances non-monotonically. If
  // sync re-pinned tl.time() to those jittery values it would scrub the
  // animation back and forth — the visible "shaking" of the overlay. This
  // timestamp suppresses corrections for a short settle window after a resume.
  let suppressSyncUntil = 0

  const pauseHover = () => hoverTl?.value?.pause()
  const resumeHover = () => {
    if (!isPaused.value && !longPress.value) hoverTl?.value?.resume()
  }

  // --- Continuous video -> timeline sync ----------------------------------
  // The master timeline is positioned in ABSOLUTE video time, so syncing is an
  // identity map: tl.time() === video.currentTime. The <video> stays the master
  // clock; we only nudge the timeline towards it.
  //
  // ⚠️ TOWARDS, NOT ONTO. This used to be `tl.time(t)` — the scene teleported
  // onto the tape's clock the instant they disagreed by a frame. That is
  // exactly the shake the owner reported on an iPhone on 2026-09-17: after a
  // manual seek iOS keeps decoding from the previous keyframe for a few frames,
  // `currentTime` advances NON-MONOTONICALLY, and every wobble in it was
  // scrubbed straight into the journal. Measured even on desktop Chrome at a
  // quarter speed: one press sent the scene 19 ms BACKWARDS and produced four
  // reversals of the turn's direction in a second and a half.
  //
  // Three things replace it, and they are three because the shake has three
  // causes:
  //
  //  1. THE TAPE IS FILTERED. A step backwards smaller than TAPE_WOBBLE is
  //     decoder noise, not playback, and is ignored — the clock is held at its
  //     last honest value instead. A real backwards move (an arrow, "watch
  //     again") is seconds, not milliseconds, and passes straight through.
  //  2. THE ERROR IS CLOSED BY SPEED, NOT BY POSITION. The timeline is run a
  //     few per cent fast or slow until it catches up, so THE SCENE NEVER MOVES
  //     BACKWARDS — which is the whole of what the eye reads as shaking. Nudging
  //     the playhead instead was the first attempt and it still stepped back,
  //     just less: measured against a simulated iOS stutter, 50 ms of reversal
  //     became 28-33 ms. A rate correction cannot reverse at all.
  //  3. A REAL JUMP STILL SNAPS. Past SYNC_SNAP the two clocks are not drifting
  //     apart, something moved the playhead, and easing towards it over a
  //     second would be the bug rather than the fix.
  const SYNC_SNAP = 0.5 // s — beyond this it is a jump, not drift
  const SYNC_GAIN = 2 // how hard the playback rate leans on the error
  const SYNC_RATE_MAX = 0.12 // and never more than 12 % off real time
  const TAPE_WOBBLE = 0.3 // s — a step back shorter than this is decoder noise

  /**
   * ⚠️ THE DEAD BAND IS A FRAME AND A HALF, NOT A FRAME, AND THE RATE RAMPS.
   *
   * Safari does not interpolate `currentTime`: it reports the time of the frame
   * that is actually on screen, so the tape's clock climbs in 1/30 steps while
   * the timeline's runs continuously. The gap between them therefore sweeps a
   * whole frame every frame, and averages half a frame low, PERMANENTLY — it is
   * the shape of the grid, not drift, and there is nothing to correct.
   *
   * With the band at exactly one frame that sweep crossed the threshold on its
   * own and the correction switched on and off against a clock that was never
   * wrong. Measured against a simulated frame-grid clock: `timeScale` stepped
   * between 1 and 0.933 — the scene ran 7 % slow in bursts. Nobody sees 7 % on
   * a page turn; on a slide where the journal is levitating it is the only
   * motion there is, and the owner reported exactly that on `space_milk`.
   *
   * So: nothing under three frames is treated as an error at all, and what is
   * left is approached by RAMPING the rate rather than stepping it, at
   * RATE_SLEW per frame. A real divergence still closes in about a fifth of a
   * second; the grid's own sawtooth never gets a rate change out of it.
   *
   * ⚠️ THREE FRAMES, NOT ONE AND A HALF. The grid alone is one frame, but the
   * tape also arrives from a jump a little behind the scene — it does not
   * advance while it seeks, and only the second jump onwards is pre-compensated
   * for that (`seekLead`). Measured on this machine, a first jump leaves 46 ms;
   * the grid's sawtooth then swings the READING between -80 and -15 ms, which
   * at a band of 50 straddles the edge and made the correction chatter, 82
   * changes of speed in 240 frames. What the band costs is that the scene may
   * sit up to a tenth of a second from the tape uncorrected — and the tape is a
   * near-still room, while the page cut is read off the scene's own clock, so
   * there is nothing in the frame that can show it.
   */
  const SYNC_DEADBAND = 3 / FPS // s — under this it is the frame grid, not drift
  const RATE_SLEW = 0.02 // per frame — how fast `timeScale` may be changed
  let lastTape = -1

  /** The tape's clock with iOS's post-seek stutter filtered out. */
  const tapeTime = v => {
    const raw = v.currentTime
    if (lastTape >= 0 && raw < lastTape && lastTape - raw < TAPE_WOBBLE) return lastTape
    lastTape = raw
    return raw
  }

  /**
   * ⚠️ HALF A FRAME PAST THE GRID, ALWAYS. WebKit rounds a requested time into
   * the media timescale, and a request landing exactly on a frame boundary can
   * truncate into the frame BEFORE the one asked for (WebKit bug 52697). Every
   * number this file hands the tape is already snapped to the 30 fps grid, so
   * without this they are all boundary values.
   */
  const SEEK_MID_FRAME = 0.5 / FPS

  /**
   * ⚠️ `fastSeek` EXISTS ON EXACTLY THE BROWSER THAT IS SLOW. Assigning
   * `currentTime` compiles, in WebKit, to an AVFoundation seek with zero
   * tolerance on both sides — the most expensive mode there is, and Apple's own
   * documentation says it "may incur additional decoding delay".
   * `fastSeek` passes a tolerance instead, so the decoder may stop on a sync
   * sample rather than decoding forward to the exact frame. Safari and Firefox
   * have it since 2014; Chrome never shipped it and does not need to.
   *
   * ⚠️ IT MAY LAND SHORT, AND THAT IS FINE HERE. WebKit's forward path allows
   * anywhere in [current, target] and its backward path allows anything at or
   * before the target, so the tape can arrive on an earlier keyframe than the
   * one asked for. Nothing in this file assumes it did not: the scene is the
   * clock now, and a tape that lands short is corrected by `chaseTape` without
   * the picture ever moving backwards. The forced keyframes in encode-video.sh
   * put a sync sample on every one of these targets so that in practice it
   * lands exactly.
   */
  /**
   * ⚠️ WHERE WE LAST SENT THE TAPE, IN STORY TIME, AND WHY IT HAS TO BE KEPT.
   *
   * "The scene leads" is only true of a divergence WE caused. If something else
   * moves the tape — the lab, the debug hook, a gate parking the player, one
   * day a browser doing something clever — then the tape is the authority and
   * the scene has to go to it. Without this the first such move wedged the
   * story on the cover for good: the scene stayed at zero and dragged the tape
   * back to it every frame. Caught by the measurement scripts, which park the
   * player by assigning `currentTime` directly.
   *
   * So: if the tape is near the last place we sent it, it is our own seek
   * arriving late and the scene keeps the lead. If it is somewhere else, the
   * scene follows.
   */
  let tapeTarget = null

  const moveTape = (v, storyTime) => {
    tapeTarget = storyTime
    seekTape(v, toVideo(storyTime) + SEEK_MID_FRAME)
  }

  const seekTape = (v, videoTime) => {
    const t = Math.max(0, videoTime)
    if (typeof v.fastSeek === 'function') {
      try {
        v.fastSeek(t)
        return
      } catch {
        // fall through — some engines throw on a detached or unloaded element
      }
    }
    v.currentTime = t
  }

  /**
   * Put the TAPE where the scene is. Called only past SYNC_SNAP, which after a
   * manual jump means the seek landed late and the scene has moved on.
   *
   * ⚠️ AT MOST ONE IN FLIGHT AND NOT MORE OFTEN THAN CHASE_COOLDOWN. Apple's
   * own guidance for the native equivalent (QA1820) is that seeks issued in
   * rapid succession cancel each other, "resulting in a lot of seeking and not
   * a lot of displaying of the target frames" — and WebKit does exactly that,
   * `seekWithTolerance` cancels any pending seek. A chase that re-fires every
   * frame on a slow device would never land at all.
   */
  const CHASE_COOLDOWN = 900 // ms between corrective moves of the tape
  let chaseAllowedAt = 0

  const chaseTape = () => {
    const v = videoPlayer.value
    const now = performance.now()
    if (!v || v.seeking || now < chaseAllowedAt) return
    chaseAllowedAt = now + CHASE_COOLDOWN
    tl.timeScale(1)
    moveTape(v, tl.time())
  }

  const syncToVideo = () => {
    const v = videoPlayer.value
    if (!v || v.seeking || v.paused) return
    if (isPaused.value || longPress.value) return
    // A manual turn owns the timeline until it lands. See `turnThenSeek`.
    if (turnTween) return

    // OVER THE HOLE FIRST, before anything reads the clock. The jump lands on
    // the far side of a stretch that carries no page of this player's story;
    // it happens at a turn's edge-on instant, where the journal is a hairline,
    // and the delivered background is a near-still room (0.4-3.2 of 255 between
    // cut points), so there is nothing in either picture to see it by.
    const hole = gapAt(v.currentTime)
    if (hole) {
      // Story time is continuous across a hole by construction, so the scene
      // does not move; the tape does, and it is us moving it.
      tapeTarget = toStory(hole.to)
      v.currentTime = hole.to
      if (duckedForSeam) {
        duckedForSeam = false
        unduck()
      }
      return
    }
    // The holes are known before a frame of this story is drawn (plan.gaps), so
    // unlike a tap this seam can be seen coming and faded into properly.
    //
    // ⚠️ THE LOOK-AHEAD IS TWICE THE FADE, and it has to be. The tape reaches
    // the seam DUCK_LEAD seconds of real time after this line first sees it,
    // and the fade needs DUCK_MS of that; with the two equal the ramp is caught
    // four fifths done and the jump lands at a volume of 0.34 — measured.
    if (!duckedForSeam && audible() && gapAt(v.currentTime + DUCK_LEAD)) {
      duckedForSeam = true
      rampVolume(0, DUCK_MS)
    }

    const t = toStory(tapeTime(v))

    // ⚠️ THE CUT FOLLOWS THE SCENE'S CLOCK, NOT THE TAPE'S, and the difference
    // is visible. The turn is rendered from `tl.time()`, so reading the swap
    // off the tape means the two can disagree by the few milliseconds the rate
    // correction is busy closing — and a few milliseconds of a turn that covers
    // 90 degrees in 0.14 s is a lot of angle. Measured the moment this loop
    // started correcting by rate: the natural swap slid from -88 degrees, a
    // hairline, to 75, where a quarter of the page is still facing the camera.
    // Both are clocks and both are pure functions of time (ADR-0008); this one
    // is the one the player is actually looking at.
    applySegment(tl.time())

    if (performance.now() < suppressSyncUntil) return
    if (isFinalHolding) {
      if (tl.time() < tl.duration()) tl.time(tl.duration())
      return
    }
    const error = t - tl.time()
    const size = Math.abs(error)
    if (size > SYNC_SNAP) {
      // ⚠️ THE TAPE IS CHASED TO THE SCENE, NOT THE SCENE TO THE TAPE.
      //
      // This used to be `tl.time(t)`, and on a phone that line is the second
      // half of the defect the owner reported. The scene is the only thing in
      // the frame anyone is looking at; the tape is a near-still room behind
      // it. Whichever of the two has to move, it must be the room.
      //
      // Measured on a build that simply stopped waiting for the seek: with the
      // tape 500 ms late the journal played its turn, settled — and then this
      // line threw it back to the start of the turn and played it again.
      //
      // GSAP's own reference for syncing a timeline to media (`mediaTimeline`,
      // codepen xxQrGBY) is built this way round: the timeline leads and the
      // media is corrected, and only past half a second of drift. dash.js's
      // liveCatchup is the same shape — rate inside the threshold, a hard move
      // only past it, and the hard move is on the media.
      //
      // ⚠️ UNLESS THE TAPE IS SOMEWHERE WE DID NOT SEND IT — see `tapeTarget`.
      if (tapeTarget !== null && Math.abs(t - tapeTarget) < SYNC_SNAP) {
        chaseTape()
      } else {
        tapeTarget = null
        tl.timeScale(1)
        tl.time(t)
      }
      return
    }
    const wanted =
      size > SYNC_DEADBAND
        ? 1 + Math.max(-SYNC_RATE_MAX, Math.min(SYNC_RATE_MAX, error * SYNC_GAIN))
        : 1
    const now = tl.timeScale()
    const next = now + Math.max(-RATE_SLEW, Math.min(RATE_SLEW, wanted - now))
    if (Math.abs(next - now) > 1e-4) tl.timeScale(next)
  }

  /**
   * Frame-exact page cut, driven by the clock rather than the timeline.
   *
   * The boundary is the segment's `cut`, not its `start`: the journal begins
   * turning at `start` and is edge-on TIMING.flip.out later, and that hairline
   * instant is where the content may swap without being seen. Before it, the
   * outgoing page is still the one facing the camera.
   *
   * `segmentAt` is a pure function of currentTime, so the cut lands correctly
   * after ANY seek, including backwards and from the debug hook — which a
   * timeline `.set()` could not do without reverse bookkeeping (ADR-0008).
   *
   * THE FACE RIDES ALONG, for exactly the same reason. It used to be a
   * `tl.call()` on the master timeline, and a `tl.call()` fires only when the
   * playhead moves FORWARD over it: any move back across the 11.21 handover —
   * the desktop "back" arrow from frame 8, a debug seek, "watch again" — left
   * the page-sized face (1564x1911) standing under the cover, which is 6 %
   * bigger than the cover's own 1465x1868. Same bug ADR-0008 describes for the
   * content cut, same cure: read it off the clock.
   */
  const applySegment = t => {
    const idx = segmentAt(t)
    if (requestedIdx !== null && idx === requestedIdx) requestedIdx = null
    if (idx !== activeSegment.value) {
      activeSegment.value = idx
      // Before the first cut no page is on screen yet, but the face still has
      // to be the one the cover flies in on — hence the clamp rather than a
      // guard: seeking to 0 must put 1465x1868 back, not leave the last page's.
      setFace?.(SEGMENTS[Math.max(idx, 0)].face)
      onSegmentChange?.(idx)
    }
  }

  const startSync = () => {
    if (syncStarted) return
    syncStarted = true
    const loop = () => {
      syncToVideo()
      currentTime.value = videoPlayer.value ? toStory(videoPlayer.value.currentTime) : tl.time()
      frameHandle = requestAnimationFrame(loop)
    }
    frameHandle = requestAnimationFrame(loop)
  }

  const stopSync = () => {
    if (frameHandle != null) cancelAnimationFrame(frameHandle)
    frameHandle = null
    // A manual turn outlives the rAF loop otherwise: it is a tween of its own.
    killTurn()
    if (volumeRamp != null) cancelAnimationFrame(volumeRamp)
    volumeRamp = null
    syncStarted = false
    detachStallHandlers()
  }

  // --- Stall handling -----------------------------------------------------
  // If the buffer drains mid-playback (common on a cold iOS load of a heavy
  // mp4) the video freezes while currentTime stops advancing, but GSAP would
  // keep being re-pinned to a stuttering value — visible as jank. So on a
  // reported stall we PAUSE the timeline and only resume, re-aligned to the
  // freshly decoded frame, once the video is actually playing again. Gated on a
  // real stall (wasWaiting) so it never interferes with normal seeks.
  let stallHandlersAttached = false
  let wasWaiting = false

  /**
   * ⚠️ A SEEK IS NOT A STALL, AND THE DIFFERENCE HAD TO BE MADE EXPLICIT.
   *
   * The note above used to claim `wasWaiting` kept these handlers out of a
   * normal seek. It does not: a seek makes the element buffer BY DEFINITION, so
   * `waiting` fires, `wasWaiting` goes true, and `playing` then resumes the
   * timeline while the seek routine is still waiting for a presented frame.
   * Two owners, one timeline. Traced on a single tap, 2026-09-17:
   *
   *     356  pause() + time(73.200)   seekNow parks the scene
   *     359  video:waiting            the seek buffers
   *     360  time(73.200) + play()    onPlaying resumes it -- too early
   *     405  time(73.200)             finishResume re-pins: 31 ms BACKWARDS
   *
   * The journal had already swung 31 ms out of the turn and was yanked back
   * through about 20 degrees. The seek routine owns the resume from the moment
   * it touches the tape until `finishResume`; in that window these handlers
   * must not exist.
   */
  let seekInFlight = false

  const onWaiting = () => {
    if (seekInFlight) return
    wasWaiting = true
    tl.pause()
    pauseHover()
  }
  const onPlaying = () => {
    if (seekInFlight) return
    if (!wasWaiting) return
    wasWaiting = false
    const v = videoPlayer.value
    if (!v) return
    if (isPaused.value || longPress.value) return // respect a user-intended pause
    // ⚠️ IT RESUMES THE SCENE AND DOES NOT RE-TIME IT. This was the last line
    // in the file that moved the scene to wherever the tape said it was, and
    // with the seek no longer being waited for it fired constantly: a seek
    // rebuffers, `playing` arrives after the scene has run on, and the journal
    // was thrown back by exactly the seek's latency. Traced at a faked 300 and
    // 500 ms, the turn replayed itself from the edge every time.
    //
    // Nothing is lost by dropping it. A real stall pauses this timeline and the
    // tape together, so they resume together; anything that moved the tape
    // underneath is closed afterwards by rate, or past SYNC_SNAP by moving the
    // TAPE (`chaseTape`) — never the picture the player is watching.
    tl.timeScale(1)
    tl.play()
    resumeHover()
  }

  // --- The system stopping the tape ---------------------------------------
  /**
   * ⚠️ THE SCENE STOPS WITH THE TAPE, WHOEVER STOPPED IT.
   *
   * Until now a pause was only ever handled when the PLAYER asked for one. The
   * system asks too, and nothing answered: switching apps, the phone locking,
   * an audio session interrupted by AirPods connecting. The sync loop returns
   * early on `v.paused`, so it does not correct — but nothing paused the
   * timeline either, and GSAP's ticker does not care that the tape has stopped.
   * The scene simply carried on alone.
   *
   * Measured, with the tape paused for six seconds and the page not ticking,
   * exactly as a backgrounded tab behaves:
   *
   *     before   scene  8.60   tape 8.62      together
   *     after    scene 14.62   tape 8.62      six seconds apart
   *     resumed  scene  9.08   tape 9.04      yanked back five and a half
   *
   * That yank is the owner's «дергается». And when the system does NOT resume
   * the tape by itself, the scene runs on to the end of the timeline, which
   * then completes and cannot advance — nothing moves again until a manual seek,
   * because a seek is the only path in this file that calls `play()`. That is
   * his «завис… только если я нажму перемотку».
   *
   * ⚠️ IT DOES NOT TOUCH `isPaused`. That ref is the PLAYER'S intention, which
   * the UI reads and which decides whether a jump resumes playback. A phone
   * call is not the player deciding to pause the story.
   */
  const onSystemPause = () => {
    if (isPaused.value || longPress.value) return
    tl.pause()
    pauseHover()
  }

  const onSystemPlay = () => {
    if (isPaused.value || longPress.value) return
    tl.timeScale(1)
    tl.play()
    resumeHover()
  }

  /**
   * Coming back from another app. The tape is asked to carry on, because iOS
   * does not always do it by itself, and a story frozen with no way back is
   * what this whole handler exists to prevent. A refused `play()` is not an
   * error here — the story is simply left paused, which is honest.
   */
  const onVisibility = () => {
    const v = videoPlayer.value
    if (!v) return
    // ⚠️ GOING AWAY IS HANDLED TOO, AND IT IS THE HALF THAT MATTERS. This event
    // arrives while the page can still run, ahead of the freeze — whereas the
    // tape's own `pause` may not be delivered until the page wakes, by which
    // time the ticker has already applied the absence.
    if (document.hidden) {
      onSystemPause()
      return
    }
    if (isPaused.value || longPress.value || showPlayButton.value) return
    if (v.paused) v.play().catch(() => {})
    // Already running — then the tape never stopped and only the timeline has
    // to be let go. Belt and braces: if `play()` is refused the `play` event
    // never comes, and a story that cannot restart itself is the bug.
    else onSystemPlay()
  }

  const attachStallHandlers = () => {
    const v = videoPlayer.value
    if (!v || stallHandlersAttached) return
    stallHandlersAttached = true
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('stalled', onWaiting)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('pause', onSystemPause)
    v.addEventListener('play', onSystemPlay)
    document.addEventListener('visibilitychange', onVisibility)
  }
  const detachStallHandlers = () => {
    const v = videoPlayer.value
    stallHandlersAttached = false
    wasWaiting = false
    if (!v) return
    v.removeEventListener('waiting', onWaiting)
    v.removeEventListener('stalled', onWaiting)
    v.removeEventListener('playing', onPlaying)
    v.removeEventListener('pause', onSystemPause)
    v.removeEventListener('play', onSystemPlay)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  // --- Buffer gate --------------------------------------------------------
  // Hold the start until the clip can genuinely play its first seconds
  // smoothly, so GSAP never races a choppy cold decode. Ready means
  // readyState >= HAVE_FUTURE_DATA AND the buffered range covering the playhead
  // extends at least START_BUFFER ahead. A timeout guarantees we always start.
  const START_BUFFER = 1.5
  const BUFFER_TIMEOUT = 6000

  const hasStartBuffer = v => {
    if (!v) return true
    if (v.readyState < 3 /* HAVE_FUTURE_DATA */) return false
    try {
      const t = v.currentTime
      const ranges = v.buffered
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= t + 1e-3 && ranges.end(i) - t >= START_BUFFER) return true
      }
    } catch {
      // `buffered` can throw before metadata is known; treat as not-ready
    }
    return false
  }

  const awaitStartBuffer = v =>
    new Promise(resolve => {
      if (hasStartBuffer(v)) return resolve()
      let done = false
      const events = ['progress', 'canplay', 'canplaythrough', 'loadeddata']
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        events.forEach(e => v.removeEventListener(e, check))
        resolve()
      }
      const check = () => {
        if (hasStartBuffer(v)) finish()
      }
      const timer = setTimeout(finish, BUFFER_TIMEOUT)
      events.forEach(e => v.addEventListener(e, check))
    })

  /**
   * Kick off the fetch (iOS often won't preload a paused <video> until
   * load()/play() is called), wait for a safe buffer, then play the video and
   * gate tl.play(0) on the FIRST PRESENTED FRAME so both clocks begin aligned.
   */
  const startPlayback = () => {
    const v = videoPlayer.value
    if (!v) {
      if (isBuffering) isBuffering.value = false
      tl.play(0)
      hoverTl?.value?.play(0)
      startSync()
      return
    }
    const begin = () => {
      const go = () => {
        tl.play(0)
        hoverTl?.value?.play(0)
        startSync()
        if (isBuffering) isBuffering.value = false
      }
      if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(go)
      else go()
    }
    const launch = () => {
      const p = v.play()
      if (p && typeof p.then === 'function') {
        p.then(begin).catch(() => {
          // Autoplay refused: show the tap-to-start overlay rather than failing.
          if (isBuffering) isBuffering.value = false
          showPlayButton.value = true
          startSync()
        })
      } else {
        begin()
      }
    }
    // ⚠️ ATTACHED BEFORE THE FIRST PLAY, NOT AFTER IT. These used to go on
    // inside the first presented frame's callback, which never arrives if the
    // player switches away during the load — and then nothing is listening for
    // the system stopping the tape, which is the one moment it is most likely
    // to happen.
    attachStallHandlers()
    if (isBuffering) isBuffering.value = true
    try {
      v.load() // ensure buffered ranges actually grow on iOS
    } catch {
      /* no-op */
    }
    awaitStartBuffer(v).then(launch)
  }

  const playVideo = () => {
    videoPlayer.value?.play()
    tl.play()
    hoverTl?.value?.play()
    showPlayButton.value = false
  }

  const updateTime = () => {
    /* video timeupdate; the rAF loop owns currentTime */
  }

  /**
   * Freeze on the final frame. Thor looped the last 3 s so its CTA could hold,
   * but here the tail contains the one-shot hyperspace burst at 92.83 — looping
   * it would replay the burst and read as a bug.
   */
  const handleVideoEnded = () => {
    const v = videoPlayer.value
    if (!v) return
    isFinalHolding = true
    tl.time(tl.duration())
    isPlaying.value = false
    pauseHover()
  }

  const playerPause = () => {
    setTimeout(() => {
      if (longPress.value) {
        isPlaying.value = false
        isPaused.value = true
        tl.pause()
        pauseHover()
        videoPlayer.value?.pause()
        notify('click_pause')
      }
    }, PRESS_DURATION + 10)
  }

  const playerPlay = () => {
    isPlaying.value = true
    isPaused.value = false
    tl.play()
    resumeHover()
    videoPlayer.value?.play()
    if (longPress.value && currentTime.value > 0.4) notify('click_start')
  }

  const togglePlayState = () => {
    if (isPlaying.value) {
      isPlaying.value = false
      isPaused.value = true
      tl.pause()
      pauseHover()
      videoPlayer.value?.pause()
      notify('click_pause')
    } else {
      isPlaying.value = true
      isPaused.value = false
      tl.play()
      resumeHover()
      videoPlayer.value?.play()
      notify('click_start')
    }
  }

  const press = () => {
    playerPause()
    pressTimer.value = setTimeout(() => {
      longPress.value = true
    }, PRESS_DURATION)
  }

  const release = direction => {
    clearTimeout(pressTimer.value)
    if (longPress.value) {
      playerPlay()
    } else {
      playerPlay()
      jumpToSegment(direction)
    }
    longPress.value = false
  }

  const handleEvent = (direction, event) => {
    if (event.type === 'touchstart') {
      event.preventDefault()
      press(direction)
    } else if (event.type === 'mousedown') {
      press(direction)
    }
  }

  const handleEventEnd = (direction, event) => {
    if (event.type === 'touchend') {
      event.preventDefault()
      release(direction)
    } else if (event.type === 'mouseup') {
      release(direction)
    }
  }

  // --- The soundtrack's seams ----------------------------------------------
  /**
   * EVERY SEEK SPLICES THE MUSIC, AND A SPLICE CLICKS. Measured 2026-09-16 on
   * the delivered track: at a skipped page's seam the waveform steps by
   * 0.29..0.57, while the steepest step the music itself takes anywhere near it
   * is 0.11..0.19. Three times bigger than anything in the material is not a
   * "jump in the music" — it is a click, and it is audible on tap navigation,
   * on the desktop arrows, on "watch again" and on every hole left by a page
   * this player has no data for.
   *
   * The fix is the oldest one in editing: take the level to silence before the
   * cut and bring it back after. There is nothing to hear at zero, so there is
   * no step to hear.
   *
   * ⚠️ THE FADE-OUT HAS TO FINISH BEFORE THE SEEK, not with it. Slamming the
   * volume to 0 is itself a step — from wherever the waveform happened to be
   * straight down to nothing — and clicks for the same reason the splice does.
   * Hence DUCK_MS of tape at the start and the deferred assignment below.
   *
   * ⚠️ AND IT ALL SKIPS ITSELF WHEN THE SOUND IS OFF. `audible()` guards every
   * branch, so with the default muted video the seek path is exactly the code
   * that shipped before the soundtrack — same order, same timers, no added
   * delay. The protocol below was paid for over several sessions; it should not
   * be re-litigated by a feature that only matters when the player has pressed
   * the speaker.
   */
  const DUCK_MS = 70 // fade to silence before a jump
  const DUCK_RECOVER_MS = 180 // and back up after it
  const DUCK_LEAD = (2 * DUCK_MS) / 1000 // seconds of tape to see a hole coming
  let volumeRamp = null
  /**
   * ⚠️ ONE FADE PER SEAM. The look-ahead below is true on EVERY animation frame
   * of the approach, and `rampVolume` restarts from the current level each time
   * it is called — so without this latch the ramp is re-armed sixty times a
   * second, decays geometrically and never actually arrives. Measured: the jump
   * landed at a volume of 0.116 instead of 0.
   */
  let duckedForSeam = false

  /**
   * Is the player asking to hear this?
   *
   * ⚠️ IT ASKS ABOUT `muted`, NOT ABOUT THE LEVEL, and that distinction is a
   * bug fix. It used to require `volume > 0` as well, which reads as "can be
   * heard" and is true right up until a duck has finished — at which point an
   * interrupted duck could never be undone, because the very check that would
   * have restored the level now answered false. Sound on, level stuck at zero,
   * for the rest of the story. `muted` is the player's intent, and intent is
   * what this has to test.
   */
  const audible = () => {
    const v = videoPlayer.value
    return !!v && !v.muted
  }

  /**
   * ⚠️ `onDone` IS HOW THE SEEK LEARNS THE FADE IS OVER, and it is not
   * decoration. Running the seek off its own `setTimeout(DUCK_MS)` in parallel
   * looks equivalent and is not: the ramp advances on animation frames, so its
   * last step lands up to a frame BEFORE the timer, and the jump then happens
   * at a volume of 0.07..0.13 instead of 0 — measured, 2026-09-16. Audible
   * residue is exactly what this whole mechanism exists to remove.
   */
  const rampVolume = (to, ms, onDone) => {
    const v = videoPlayer.value
    if (!v) return
    if (volumeRamp != null) cancelAnimationFrame(volumeRamp)
    volumeRamp = null
    const from = v.volume
    if (ms <= 0 || from === to) {
      v.volume = to
      onDone?.()
      return
    }
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      v.volume = from + (to - from) * k
      if (k < 1) {
        volumeRamp = requestAnimationFrame(step)
      } else {
        volumeRamp = null
        onDone?.()
      }
    }
    volumeRamp = requestAnimationFrame(step)
  }

  /** Bring the level back after a jump. Safe to call when nothing was ducked. */
  const unduck = () => rampVolume(1, DUCK_RECOVER_MS)

  // --- Seeking ------------------------------------------------------------
  /**
   * ⚠️ 400, NOT 220. The window exists because iOS keeps decoding from the
   * previous keyframe for a while after a seek, and 220 ms turned out to be
   * shorter than that on a real device: the guard lifted while the clock was
   * still unreliable and the correction that followed was the visible shake.
   * With the gradual catch-up above, a window that is slightly too long costs
   * nothing — the scene simply eases onto the tape a few frames later.
   */
  const SETTLE_GUARD_MS = 400 // suppress sync after a seek-resume
  const SEEK_FALLBACK_MS = 600 // cap if `seeked` never fires (iOS edge case)

  /**
   * ⚠️ WHAT A SEEK COSTS ON *THIS* DEVICE, LEARNED WHILE IT RUNS.
   *
   * There is no way to ask, and the spread between machines is the whole
   * problem: a few milliseconds here, hundreds on a phone, and the published
   * numbers for a low-end Android are worse again. So it is measured — the time
   * from asking the tape to move to its `seeked` — and the next jump aims that
   * far ahead so the two clocks meet instead of having to be reconciled.
   *
   * Held as a decaying maximum rather than an average: one slow seek matters
   * more than ten fast ones, but a single outlier must not aim every later jump
   * half a second into the future. Capped, because past the cap the lead would
   * skip more story than the seek saves.
   */
  const SEEK_COST_CAP = 0.45 // s — the most we will ever aim ahead
  const SEEK_COST_DECAY = 0.85
  let seekCost = 0

  const noteSeekCost = ms => {
    const s = Math.min(SEEK_COST_CAP, Math.max(0, ms / 1000))
    seekCost = s > seekCost ? s : seekCost * SEEK_COST_DECAY + s * (1 - SEEK_COST_DECAY)
  }

  /**
   * ⚠️ THE LEAD IS NOT GATED ON ANYTHING. It was, briefly, on the sync dead
   * band — and this machine's seek costs 47 ms against a 50 ms band, so the
   * lead never applied and every jump left the tape 47 ms behind the scene for
   * good. Measured: the correction then sat on the edge of the band and
   * chattered between full speed and 0.88 for the rest of the slide, 65 changes
   * in 240 frames. The lead is not a tolerance, it is compensation for time the
   * tape provably loses while it seeks, so it is always applied.
   */
  const seekLead = () => seekCost
  /**
   * Seek both clocks. See the comment block above — this order matters.
   *
   * `time` is STORY time, the clock the timeline and the segments live on. The
   * tape is asked for the second that story time sits on, which is the same
   * number whenever the link was complete.
   */
  let seekGen = 0

  /**
   * ⚠️ THE FADE HAPPENS BEFORE ANYTHING IN THE SCENE MOVES, and this wrapper is
   * the whole reason it does.
   *
   * The first version faded and seeked at the end of `seekNow`, after the
   * timeline had already been paused and re-timed. Measured on a single arrow
   * press: the journal stood dead for 75 ms while the tape carried on playing,
   * and then everything jumped at once. The owner saw it immediately and could
   * not name it — «виден какой-то рывок». Nothing about the scene may move
   * until the tape is ready to move with it.
   *
   * ⚠️ AND THE JUMP IS GUARANTEED TO HAPPEN. A second press during the fade
   * restarts the ramp and drops the first one's callback, so the timer below is
   * not belt and braces: without it a superseded seek is simply lost. The
   * generation check is what keeps the older of two presses from firing after
   * the newer one has already landed.
   */
  const seekBoth = (time, shouldPlay) => {
    const gen = ++seekGen
    if (!audible()) {
      seekNow(time, shouldPlay, false)
      return
    }
    let fired = false
    const go = () => {
      if (fired || gen !== seekGen) return
      fired = true
      seekNow(time, shouldPlay, true)
    }
    rampVolume(0, DUCK_MS, go)
    setTimeout(go, DUCK_MS + 80)
  }

  let seekToken = 0

  const seekNow = (time, shouldPlay, wasAudible) => {
    killTurn()
    // Only the newest seek may lower the flag: a superseded one can still reach
    // its `seeked` and would otherwise hand the stall handlers a seek that is
    // very much still in flight.
    const token = ++seekToken
    const release = () => {
      if (token === seekToken) seekInFlight = false
    }
    const v = videoPlayer.value
    const videoTime = toVideo(time)
    // The monotonic filter guards against decoder noise, not against a seek:
    // forget the old reading so a deliberate jump backwards is taken at once.
    lastTape = -1
    isFinalHolding = false
    // A tap can land while the loop is already fading into a hole it will now
    // never reach. Clearing the latch here is what keeps the level from being
    // stranded at zero for the rest of the story.
    duckedForSeam = false
    tl.pause()
    pauseHover()
    tl.time(time)
    applySegment(time)

    if (!v) {
      release()
      if (shouldPlay) {
        tl.play()
        resumeHover()
      }
      return
    }
    // ⚠️ A FRAME AND A HALF, NOT 20 ms — THE SAME BAND THE SYNC LOOP IGNORES.
    // A manual turn sends the tape ahead and it arrives a few tens of
    // milliseconds short, because an element does not play while it seeks:
    // measured, 44 ms. At 20 ms that counted as "not there yet" and bought a
    // second seek whose whole cost is paid standing edge-on — four frames here,
    // and a phone's seek is an order slower. Inside the band the tape is left
    // alone; the story's own clock still lands exactly on the number asked for,
    // and the loop below tolerates the difference by design rather than
    // chasing it.
    if (Math.abs(v.currentTime - videoTime) < SYNC_DEADBAND) {
      release()
      if (shouldPlay) {
        suppressSyncUntil = performance.now() + SETTLE_GUARD_MS
        tl.play()
        resumeHover()
        v.play().catch(() => {})
      }
      // ⚠️ THE LEVEL COMES BACK HERE TOO. This branch used to return without
      // it, which was harmless only because nothing reached it: the tape was
      // never already at the destination. A manual turn sends the tape ahead
      // precisely so that it is, so every tap would now have ended with the
      // sound ducked to zero and no way back — the same stuck-at-zero fault
      // that cost a day on 16.09, by a different road.
      if (wasAudible) unduck()
      return
    }
    // ⚠️ THE SCENE DOES NOT WAIT FOR THE TAPE. THIS IS THE WHOLE FIX.
    //
    // What stood here paused the timeline, asked the tape to move, and resumed
    // only on `seeked` plus a presented frame. On this machine that wait is a
    // few milliseconds and invisible. On the owner's iPhone it is hundreds, and
    // it is spent standing edge-on — the freeze he reported three times.
    //
    // Measured with the seek's latency faked in the browser, the journal's
    // still time inside the turn against that latency:
    //
    //     latency   150    300    500    800 ms
    //     waiting    84    251    451    668 ms
    //     not         0      0      0      0
    //
    // It is not a trade: the HTML spec runs the seek in parallel with script
    // (the seeking algorithm, step 5 onwards), so nothing was gained by
    // standing still. The tape freezes on its last frame for the length of the
    // seek and then arrives. That frame is a near-still neon room — sampled at
    // all sixteen cut points, a jump across one differs by 2.4 to 13.4 of 255.
    // Freezing THAT rather than the journal is the entire point.
    seekInFlight = true
    const issued = performance.now()
    let landed = false
    const onLanded = () => {
      if (landed) return
      landed = true
      clearTimeout(fallback)
      v.removeEventListener('seeked', onLanded)
      release()
      noteSeekCost(performance.now() - issued)
      // ⚠️ CHECK WHERE IT ACTUALLY LANDED. `fastSeek` is allowed to stop on an
      // earlier sync sample than the one asked for — WebKit's backward path
      // permits anything at or before the target — and the forced keyframes in
      // encode-video.sh are what make it land exactly in practice. "In
      // practice" is not a thing to rely on for a page the player is looking
      // at, so if it came down somewhere else, put it right precisely, once.
      const aim = toVideo(tapeTarget ?? time)
      if (Math.abs(v.currentTime - aim) > 2 / FPS) v.currentTime = aim + SEEK_MID_FRAME
    }
    v.addEventListener('seeked', onLanded, { once: true })
    const fallback = setTimeout(onLanded, SEEK_FALLBACK_MS)

    // ⚠️ AIMED WHERE THE SCENE WILL BE, NOT WHERE IT IS. The tape arrives
    // `seekCost` late, by which time the scene has run on by the same amount,
    // and without the lead every jump would end with the two that far apart —
    // which is what `chaseTape` would then have to spend a second seek fixing.
    // The lead is this device's own measured cost, so it is right on a phone
    // and near zero here.
    tapeTarget = time + seekLead()
    seekTape(v, videoTime + seekLead() + SEEK_MID_FRAME)

    tl.timeScale(1)
    tl.time(time)
    if (shouldPlay) {
      suppressSyncUntil = performance.now() + SETTLE_GUARD_MS
      tl.play()
      resumeHover()
      v.play().catch(() => {})
    }
    if (wasAudible) unduck()
  }

  // --- The manual page turn -----------------------------------------------
  /**
   * ⚠️ A TAP TURNS THE PAGE, AND THE JUMP RIDES INSIDE THE TURN.
   *
   * Both landings tried before this were wrong, and measuring them side by side
   * says why. Tapping on `space_milk` at 68.90 for `joke`, the journal's pose in
   * design px:
   *
   *     cy  45.7 -> 51.9     y  107 -> 269     rotZ  -20.9 -> -15.0
   *
   * The journal is 162 px lower, rolled six degrees and smaller — and that is
   * the SAME jump whichever instant is landed on, because the pose is a
   * function of the clock and the clock moved four seconds. In ordinary
   * playback those four seconds carry it there gradually; a tap has to put it
   * there at once.
   *
   *  - LANDING ON `start` shows the jump in full: the journal is flat and facing
   *    the camera, so it visibly slides down and rolls, and only then turns.
   *    The owner: «он перемещается на другое место, а потом только
   *    перекручивается... это бред».
   *  - LANDING ON `cut` hides the jump — at edge-on the journal is a hairline
   *    and there is nothing to see it by, which is exactly why the story puts
   *    its own content cut there (ADR-0008) and why storyPlan jumps the tape
   *    over a dropped page there. But the turn ITSELF then goes missing: one
   *    frame flat, the next edge-on. «Сразу показывается ребро».
   *
   * So the jump belongs at the edge and the turn belongs on screen, and the
   * only way to have both is to TURN FIRST AND JUMP INSIDE IT: the journal
   * swings from wherever it is to the yaw the target instant holds, playing on
   * its own while the tape runs on, and the seek happens on arrival, under the
   * hairline. The story's own out-leg ease and duration, so a manual turn and a
   * natural one are the same motion.
   *
   * ⚠️ THE SYNC LOOP MUST NOT RUN DURING IT. The timeline is paused while the
   * tape keeps playing, so the gap between the two clocks grows for the length
   * of the turn; left alone the loop would first lean on the rate and then,
   * past SYNC_SNAP, snap the timeline and destroy the turn mid-flight.
   */
  let turnTween = null
  let turnToken = 0

  const killTurn = () => {
    if (!turnTween) return
    turnTween.kill()
    turnTween = null
  }

  /**
   * ⚠️ THE WHOLE POSE, NOT JUST THE YAW, and the difference is a visible flick.
   *
   * Turning only the yaw leaves the journal wearing the pose of the slide being
   * left, so at the landing frame its roll, size and place all changed at once.
   * Hidden at the edge, yes — the page is a hairline there — but it is a hairline
   * that jumped 73 px and rolled nine degrees in one frame, and the story's own
   * cut changes none of those. Carrying the pose across the turn as well makes
   * the landing frame change NOTHING, which is what the timeline taking over
   * should look like, and on the way it is the same glide into place that
   * ordinary playback spends the whole slide on.
   *
   * ⚠️ SAMPLED WITH `suppressEvents` FALSE, AND THE DEFAULT IS THE TRAP. GSAP's
   * `.seek()` suppresses by default and `.time()` does not, and with them
   * suppressed a seek moves the YAW and nothing else — measured here on a live
   * story: seeking 70.26 -> 73.21 gave rotationY 11 -> -89.86 while the roll,
   * the size and the place did not budge, and the same seek unsuppressed
   * carried all five. That is why this reads nothing but the yaw when left on
   * the default, and why the frame-by-frame scan in scripts/ passes `false`
   * too. Both seeks happen inside one task, so the browser only ever sees the
   * second.
   *
   * Landing on the timeline's own numbers rather than a rounded 90 matters — at
   * edge-on half a degree is still ten pixels of width.
   */
  const POSE_BOX = ['rotationY', 'rotationZ', 'rotationX', 'scaleX', 'scaleY']
  const POSE_POS = ['xPercent', 'yPercent']

  const poseAt = time => {
    const { box, pos } = targets ?? {}
    if (!box) return null
    const read = (el, keys) => {
      const out = {}
      for (const k of keys) {
        const n = Number(gsap.getProperty(el, k))
        if (Number.isFinite(n)) out[k] = n
      }
      return out
    }
    const home = tl.time()
    tl.seek(time, false)
    const shot = { box: read(box, POSE_BOX), pos: pos ? read(pos, POSE_POS) : null }
    tl.seek(home, false)
    return shot
  }

  const turnThenSeek = (time, shouldPlay) => {
    const box = targets?.box
    const v = videoPlayer.value
    // Nothing to turn, or the story is parked: land the old way. A paused jump
    // goes past the whole turn anyway (see `landingTime`), so there is no turn
    // to play and no moving journal to hide the jump behind.
    if (!box || !v || v.paused) {
      seekBoth(time, shouldPlay)
      return
    }
    const token = ++turnToken
    killTurn()
    // ⚠️ THE TURN OWNS BOTH CLOCKS FROM HERE, and this line is why. Sending the
    // tape ahead makes it buffer, `waiting` fires, and the stall handler used
    // to answer it — traced mid-turn: `time(73.080)` and `play()` on the master
    // timeline while the turn was still swinging. The page stayed put only
    // because the sync loop was already standing down; the journal's POSITION
    // did not, and jumped 90 px inside the turn. Released by the `seekNow`
    // every path out of here reaches.
    seekInFlight = true
    tl.pause()
    pauseHover()
    // Under the turn, so the level is already down when the tape jumps. The
    // seek's own ramp then finds 0 and fires straight through.
    if (audible()) rampVolume(0, DUCK_MS)

    const from = Number(gsap.getProperty(box, 'rotationY'))
    const shot = poseAt(time)
    // ⚠️ ALWAYS OUT TO THE NEAR EDGE. `cut` sits on the seam between the turn's
    // two legs — the out-leg ends at +peak and the back-leg begins at -peak, the
    // same silhouette mirrored — so which sign the sample returns depends on
    // which side of the seam the landing rounds to. Taken literally, a -90
    // would send the journal sweeping the wrong way through flat and out the
    // far side: a hundred degrees of turn nobody asked for. The frame after the
    // landing is the timeline's own and may be either sign; that is one frame
    // of a hairline, and ordinary playback does it too.
    if (shot && Math.abs(shot.box.rotationY) > TIMING.flip.peak * 0.9) {
      shot.box.rotationY = Math.abs(shot.box.rotationY)
    }
    const to = shot?.box.rotationY
    const span = Math.abs(to - from)
    // A second tap arriving mid-turn has nothing left to play.
    if (!shot || !Number.isFinite(from) || !Number.isFinite(to) || span < 1) {
      seekBoth(time, shouldPlay)
      return
    }
    const dur = TIMING.flip.out * Math.min(1, span / TIMING.flip.peak)

    // ⚠️ THE TAPE IS SENT AHEAD SO ITS DECODE HAPPENS UNDER THE TURN. Left to
    // the end, the wait for a decoded frame is spent standing edge-on — four
    // frames of it even on this machine, and on a phone a seek is hundreds of
    // milliseconds. That stop is what the owner reported first: «на ребре
    // как бы зависает». Aimed `dur` short of the landing, the tape plays the
    // rest in real time and arrives as the turn does, so the seek that follows
    // finds it already there and resumes without waiting at all. The frames it
    // plays meanwhile are the target turn's own, which is what the background
    // does under a natural turn anyway.
    //
    // Not across a hole, though: inside one the tape is showing seconds that
    // belong to a page this player was never given, and only `syncToVideo`
    // knows how to cross it — and it is standing down for the length of the
    // turn.
    const aim = toVideo(time)
    const lead = Math.max(0, aim - dur)
    if (!gapAt(lead)) v.currentTime = lead

    turnTween = gsap.timeline({
      onComplete: () => {
        turnTween = null
        if (token !== turnToken) return
        seekBoth(time, shouldPlay)
      },
    })
    turnTween.to(box, { ...shot.box, duration: dur, ease: EASE.flipOut }, 0)
    if (shot.pos && targets.pos) {
      turnTween.to(targets.pos, { ...shot.pos, duration: dur, ease: EASE.flipOut }, 0)
    }
  }

  /**
   * Landing rule for the ARROWS AND TAPS. Ordinary playback never comes here.
   *
   * ⚠️ IT LANDS ON `start`, WHERE THE TURN BEGINS — NOT ON `cut`, THE EDGE-ON
   * INSTANT. Landing on `cut` was tried on 2026-09-17 and reverted the same
   * day, because it puts the landing at the fastest-moving frame of the whole
   * story and everything that goes near it becomes visible:
   *
   *  - THE TURN IS NEVER DRAWN. Traced frame by frame on a tap: the journal
   *    went from 11 degrees to 90 in ONE frame and the out-leg — the page
   *    taking its leave — was skipped entirely. The owner described exactly
   *    that: «нам не показывается, как журнал переворачивается, сразу
   *    показывается ребро».
   *  - EVERY MILLISECOND OF CLOCK DISAGREEMENT BECOMES ANGLE. The turn covers
   *    90 degrees in TIMING.flip.out, about 640 degrees a second, so a 31 ms
   *    correction that is invisible anywhere else is 20 degrees here. And a
   *    seek on iOS takes hundreds of milliseconds, all of them spent frozen on
   *    the one pose in the story that cannot hide a freeze.
   *
   * At `start` the journal is flat and nearly still, so the seek settles where
   * nothing is moving and the whole turn then plays live, exactly as it does in
   * ordinary playback.
   *
   * ⚠️ THE PRICE, STATED PLAINLY: for TIMING.flip.out the page facing the
   * camera is the one being left. That is the design (ADR-0008, 34-page-flip.md)
   * and it is what the clip does. The owner photographed it on 2026-09-17 and
   * called it a bug — but the bug in that screenshot was navigation counting
   * from the page on screen (see `requestedIdx`), which sent a press to the
   * wrong page entirely; that is fixed, and this is not the same thing.
   *
   * ⚠️ AND PAUSED IS STILL DIFFERENT. Frozen at `start` the journal would sit
   * showing the page being left with no turn to follow, so a paused jump keeps
   * landing past the whole turn where the page reads as fully formed.
   */
  const SETTLE_LEAD = TIMING.flip.out + TIMING.flip.back

  const landingTime = seg => {
    const v = videoPlayer.value
    if (!v || !v.paused) return seg.cut
    return seg.start + Math.min(SETTLE_LEAD, Math.max(0, seg.dur - 0.3))
  }

  const jumpToSegment = direction => {
    const v = videoPlayer.value
    const t = v ? toStory(v.currentTime) : tl.time()
    // Same definition of "where we are" as the page cut uses, so an arrow
    // pressed mid-turn goes where the eye expects rather than skipping a page.
    // Where the player last ASKED to be, falling back to where the clock says
    // we are. See `requestedIdx`.
    const idx = requestedIdx ?? Math.max(0, segmentAt(t))
    let targetIdx
    if (direction === 'forward') {
      if (idx >= SEGMENTS.length - 1) return // already on the last page
      targetIdx = idx + 1
      notify('click_forward')
    } else {
      targetIdx = Math.max(0, idx - 1)
      notify('click_backward')
    }
    // Resume based on the user's INTENT (isPaused), not the transient v.paused
    // flag, which can momentarily read "paused" mid-seek and would otherwise
    // leave the timeline frozen after a forward arrow.
    requestedIdx = targetIdx
    turnThenSeek(landingTime(SEGMENTS[targetIdx]), !isPaused.value)
  }

  /** Any seek that is not an arrow — "watch again", the debug hook — forgets
   *  where the arrows were counting from. */
  const seek = time => {
    requestedIdx = null
    seekBoth(time, !isPaused.value)
  }

  return {
    playVideo,
    updateTime,
    handleVideoEnded,
    togglePlayState,
    handleEvent,
    handleEventEnd,
    jumpToSegment,
    startPlayback,
    stopSync,
    seek,
    applySegment,
  }
}
