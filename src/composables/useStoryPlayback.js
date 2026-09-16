import { STORY_SEGMENTS } from '@/story/slides.js'
import { SYNC_EPSILON, TIMING } from '@/story/timing.js'

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
    setFace,
    plan,
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

    // OVER THE HOLE FIRST, before anything reads the clock. The jump lands on
    // the far side of a stretch that carries no page of this player's story;
    // it happens at a turn's edge-on instant, where the journal is a hairline,
    // and the delivered background is a near-still room (0.4-3.2 of 255 between
    // cut points), so there is nothing in either picture to see it by.
    const hole = gapAt(v.currentTime)
    if (hole) {
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

    const t = toStory(v.currentTime)
    applySegment(t)

    if (performance.now() < suppressSyncUntil) return
    if (isFinalHolding) {
      if (tl.time() < tl.duration()) tl.time(tl.duration())
      return
    }
    if (Math.abs(tl.time() - t) > SYNC_EPSILON) tl.time(t)
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
   * have restored the level now answered false. Sound on with the level stuck
   * at zero, for the rest of the story. `muted` is the player's intent, and
   * intent is what this has to test.
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

  /**
   * Seek both clocks. See the comment block above — this order matters.
   *
   * `time` is STORY time, the clock the timeline and the segments live on. The
   * tape is asked for the second that story time sits on, which is the same
   * number whenever the link was complete.
   */
  const seekBoth = (time, shouldPlay) => {
    const v = videoPlayer.value
    const videoTime = toVideo(time)
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
      if (shouldPlay) {
        tl.play()
        resumeHover()
      }
      return
    }
    if (Math.abs(v.currentTime - videoTime) < 0.02) {
      if (shouldPlay) {
        suppressSyncUntil = performance.now() + SETTLE_GUARD_MS
        tl.play()
        resumeHover()
        v.play().catch(() => {})
      }
      return
    }
    // Already silent, or the sound is off: nothing to protect, seek at once.
    const wasAudible = audible()
    let done = false
    const finishResume = () => {
      tl.time(toStory(v.currentTime))
      if (shouldPlay) {
        suppressSyncUntil = performance.now() + SETTLE_GUARD_MS
        tl.play()
        resumeHover()
        v.play().catch(() => {})
      }
      if (wasAudible) unduck()
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
    // The `seeked` listener and its fallback are already armed, so the
    // DUCK_MS the fade needs comes out of the fallback's 600, not out of the
    // protocol. With the sound off this is the plain assignment it always was.
    if (wasAudible) {
      rampVolume(0, DUCK_MS, () => {
        v.currentTime = videoTime
      })
    } else {
      v.currentTime = videoTime
    }
  }

  /**
   * Landing rule. Each page's window opens with the journal still mid-turn, so
   * landing exactly on `start` while PAUSED freezes a half-rotated frame. When
   * paused we land past the whole turn so the page reads as fully formed; when
   * playing we land on the exact start so the turn plays.
   */
  const SETTLE_LEAD = TIMING.flip.out + TIMING.flip.back

  const landingTime = seg => {
    const v = videoPlayer.value
    if (!v || !v.paused) return seg.start
    return seg.start + Math.min(SETTLE_LEAD, Math.max(0, seg.dur - 0.3))
  }

  const jumpToSegment = direction => {
    const v = videoPlayer.value
    const t = v ? toStory(v.currentTime) : tl.time()
    // Same definition of "where we are" as the page cut uses, so an arrow
    // pressed mid-turn goes where the eye expects rather than skipping a page.
    const idx = Math.max(0, segmentAt(t))
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
    seekBoth(landingTime(SEGMENTS[targetIdx]), !isPaused.value)
  }

  const seek = time => seekBoth(time, !isPaused.value)

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
