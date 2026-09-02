import { STORY_SEGMENTS } from '@/story/slides.js'
import { SYNC_EPSILON } from '@/story/timing.js'

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
 *  - SYNC_EPSILON is 1/30 rather than a hardcoded 0.04.
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
  } = ctx

  let frameHandle = null
  let syncStarted = false
  let isFinalHolding = false

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
  // clock; we only nudge the timeline when it drifts past one frame.
  const syncToVideo = () => {
    const v = videoPlayer.value
    if (!v || v.seeking || v.paused) return
    if (isPaused.value || longPress.value) return

    applySegment(v.currentTime)

    if (performance.now() < suppressSyncUntil) return
    if (isFinalHolding) {
      if (tl.time() < tl.duration()) tl.time(tl.duration())
      return
    }
    const t = v.currentTime
    if (Math.abs(tl.time() - t) > SYNC_EPSILON) tl.time(t)
  }

  /**
   * Frame-exact page cut, driven by the clock rather than the timeline.
   *
   * Binary-search-free because 17 entries is nothing, but the important part is
   * that it is a pure function of currentTime: it therefore lands correctly
   * after ANY seek, including backwards and from the debug hook, which a
   * timeline `.set()` could not do without reverse bookkeeping.
   */
  const applySegment = t => {
    let idx = -1
    for (let i = 0; i < STORY_SEGMENTS.length; i++) {
      if (t >= STORY_SEGMENTS[i].start - 1e-3) idx = i
    }
    if (idx !== activeSegment.value) {
      activeSegment.value = idx
      onSegmentChange?.(idx)
    }
  }

  const startSync = () => {
    if (syncStarted) return
    syncStarted = true
    const loop = () => {
      syncToVideo()
      currentTime.value = videoPlayer.value?.currentTime ?? tl.time()
      frameHandle = requestAnimationFrame(loop)
    }
    frameHandle = requestAnimationFrame(loop)
  }

  const stopSync = () => {
    if (frameHandle != null) cancelAnimationFrame(frameHandle)
    frameHandle = null
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

  const onWaiting = () => {
    wasWaiting = true
    tl.pause()
    pauseHover()
  }
  const onPlaying = () => {
    if (!wasWaiting) return
    wasWaiting = false
    const v = videoPlayer.value
    if (!v) return
    if (isPaused.value || longPress.value) return // respect a user-intended pause
    tl.time(v.currentTime)
    tl.play()
    resumeHover()
  }

  const attachStallHandlers = () => {
    const v = videoPlayer.value
    if (!v || stallHandlersAttached) return
    stallHandlersAttached = true
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('stalled', onWaiting)
    v.addEventListener('playing', onPlaying)
  }
  const detachStallHandlers = () => {
    const v = videoPlayer.value
    stallHandlersAttached = false
    wasWaiting = false
    if (!v) return
    v.removeEventListener('waiting', onWaiting)
    v.removeEventListener('stalled', onWaiting)
    v.removeEventListener('playing', onPlaying)
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
      attachStallHandlers()
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

  // --- Seeking ------------------------------------------------------------
  const SETTLE_GUARD_MS = 220 // suppress sync after a seek-resume
  const SEEK_FALLBACK_MS = 600 // cap if `seeked` never fires (iOS edge case)
  const FRAME_WAIT_MS = 200 // cap if rVFC never fires (throttled tab)

  /**
   * Resolve on the next actually-presented frame. `seeked` only means the seek
   * is LOGICALLY complete — on iOS the decoded frame may not be composited yet,
   * so starting GSAP there races a still-settling picture.
   */
  const onNextPresentedFrame = (v, cb) => {
    if (typeof v.requestVideoFrameCallback !== 'function') return cb()
    let fired = false
    const run = () => {
      if (fired) return
      fired = true
      cb()
    }
    v.requestVideoFrameCallback(run)
    setTimeout(run, FRAME_WAIT_MS)
  }

  /** Seek both clocks. See the comment block above — this order matters. */
  const seekBoth = (time, shouldPlay) => {
    const v = videoPlayer.value
    isFinalHolding = false
    tl.pause()
    pauseHover()
    tl.time(time)
    applySegment(time)

    if (!v) {
      if (shouldPlay) {
        tl.play()
        resumeHover()
      }
      return
    }
    if (Math.abs(v.currentTime - time) < 0.02) {
      if (shouldPlay) {
        suppressSyncUntil = performance.now() + SETTLE_GUARD_MS
        tl.play()
        resumeHover()
        v.play().catch(() => {})
      }
      return
    }
    let done = false
    const finishResume = () => {
      tl.time(v.currentTime)
      if (shouldPlay) {
        suppressSyncUntil = performance.now() + SETTLE_GUARD_MS
        tl.play()
        resumeHover()
        v.play().catch(() => {})
      }
    }
    const resume = () => {
      if (done) return
      done = true
      clearTimeout(fallback)
      v.removeEventListener('seeked', resume)
      onNextPresentedFrame(v, finishResume)
    }
    v.addEventListener('seeked', resume, { once: true })
    const fallback = setTimeout(resume, SEEK_FALLBACK_MS)
    v.currentTime = time
  }

  /**
   * Landing rule. Each page's window opens with the journal still mid-turn, so
   * landing exactly on `start` while PAUSED freezes a half-rotated frame. When
   * paused we land past the re-pose so the page reads as fully formed; when
   * playing we land on the exact start so the turn plays.
   */
  const SETTLE_LEAD = 0.75

  const landingTime = seg => {
    const v = videoPlayer.value
    if (!v || !v.paused) return seg.start
    return seg.start + Math.min(SETTLE_LEAD, Math.max(0, seg.dur - 0.3))
  }

  const jumpToSegment = direction => {
    const v = videoPlayer.value
    const t = v ? v.currentTime : tl.time()
    let idx = 0
    for (let i = 0; i < STORY_SEGMENTS.length; i++) {
      if (t >= STORY_SEGMENTS[i].start - 1e-3) idx = i
    }
    let targetIdx
    if (direction === 'forward') {
      if (idx >= STORY_SEGMENTS.length - 1) return // already on the last page
      targetIdx = idx + 1
      notify('click_forward')
    } else {
      targetIdx = Math.max(0, idx - 1)
      notify('click_backward')
    }
    // Resume based on the user's INTENT (isPaused), not the transient v.paused
    // flag, which can momentarily read "paused" mid-seek and would otherwise
    // leave the timeline frozen after a forward arrow.
    seekBoth(landingTime(STORY_SEGMENTS[targetIdx]), !isPaused.value)
  }

  const seek = time => seekBoth(time, !isPaused.value)

  return {
    playVideo,
    updateTime,
    handleVideoEnded,
    togglePlayState,
    press,
    release,
    handleEvent,
    handleEventEnd,
    jumpToSegment,
    startPlayback,
    startSync,
    stopSync,
    seek,
    applySegment,
  }
}
