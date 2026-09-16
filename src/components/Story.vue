<template>
  <div class="story-root">
    <div ref="stageRef" class="stage">
      <!-- Background: the master clock, and since 2026-09-16 the soundtrack too.
           THE VIDEO CARRIES ITS OWN SOUND. The motion designer's master came
           with the track baked in, so `encode-video.sh prod` keeps it (aac in
           the mp4, opus in the webm) instead of stripping it. One file, one
           clock, one thing to keep in sync — nothing to line up by hand.

           ⚠️ `muted` BELOW IS NOT DEAD WEIGHT AND MUST STAY. A browser refuses
           to autoplay a video that makes noise; muted is what lets the story
           start on its own. The header's sound button is the user gesture that
           earns the sound, and `toggleSound` flips `video.muted` directly and
           synchronously inside the click — see it below. Take this attribute
           off and the story stops starting at all.

           TWO SOURCES, mp4 first. Thor ships webm + mp4 (your_story.vue:21-22)
           and that second format is the real insurance against a codec a device
           will not decode; we were building `story.webm` in encode-video.sh and
           shipping it without ever referencing it. mp4 leads because every
           target device plays it and the webm is the larger file. -->
      <video
        ref="videoPlayer"
        class="stage__bg"
        preload="auto"
        muted
        playsinline
        webkit-playsinline
        @timeupdate="updateTime"
        @ended="handleVideoEnded"
        @error="handleVideoError"
      >
        <!-- ⚠️ THE FAILURE ARRIVES HERE, NOT ON THE <video>. With `<source>`
             children a media element that runs out of candidates sets
             networkState to NETWORK_NO_SOURCE and fires `error` at each SOURCE;
             it never fires one at itself. `@error` on the <video> above is
             still right — it catches a decode failure after a source was
             chosen — but on its own it is silent exactly when the file cannot
             be fetched at all, which is the case worth reporting. Proved by
             blocking story.mp4/webm at the network layer: with the handler only
             on the <video>, nothing happened for 8 seconds. -->
        <source
          v-for="s in videoSources"
          :key="s.src"
          :src="s.src"
          :type="s.type"
          @error="handleSourceError"
        />
      </video>

      <div class="stage-3d">
        <JournalStage :stage-el="stageRef">
          <div
            v-for="seg in segments"
            :key="seg.page"
            class="journal-page"
            :class="{ 'journal-page--active': seg.index === activeSegment }"
            :data-page="seg.page"
            :data-face="seg.face"
          >
            <component
              :is="resolvePage(seg.page)"
              :page="seg.page"
              :frame="seg.firstFrame"
              :start="seg.start"
            />
          </div>
        </JournalStage>

        <FlyLayer />
      </div>

      <div class="stage__speed" />

      <div class="stage__ui">
        <!-- THE VIDEO IS THE CLOCK, so if it never arrives there is no story to
             show and no amount of waiting will produce one. Before this existed
             the player got the buffer timeout's "Tap to start", tapped, and
             nothing happened — a dead screen with no word about why. A-2 in
             _context/95-code-audit.md.

             ⚠️ IT LIVES INSIDE `.stage__ui` AND BEFORE THE HEADER ON PURPOSE.
             Hung outside as a sibling of the UI layer it covered the header
             too, and the close button with it — a player who cannot play the
             story and cannot leave it either. Here the header (z-index 2, and
             later in the DOM) paints over it while the tap zones (z-index 1)
             stay underneath, so "tap to try again" works everywhere except on
             the chrome, which keeps doing its own job.

             ⚠️ The copy is hardcoded English, like "Tap to start" below. Both
             are outside the four locale files on purpose: they are failure
             states nobody has written product copy for yet. -->
        <div v-if="videoFailed" class="story-error" @click="reloadStory">
          <div class="story-error__inner">
            <div class="story-error__title">Story unavailable</div>
            <div class="story-error__hint">Tap to try again</div>
          </div>
        </div>

        <StoryHeader
          :time="currentTime"
          :segments="segments"
          :sound-on="soundOn"
          :is-playing="isPlaying"
          show-pause
          @toggle-sound="toggleSound"
          @toggle-play="togglePlayState"
          @close="closeStory"
        />

        <TapZones @press="handleEvent" @release="handleEventEnd" />

        <!-- The scene's own layers: the outro title and the two buttons. All
             three are chrome, not page content — the mock draws them over the
             journal on storyboard frames 22-25, 25 and 27 — and `.stage__ui` is
             the one layer with no perspective ancestor. -->
        <StoryOutro :visible="showOutro" :lines="copy.outro" />
        <StoryCta :visible="showCta" :label="copy.continue_journey" @click="getGift" />
        <StoryReplay :visible="showReplay" :label="copy.watch_again" @click="watchAgain" />
      </div>

      <!-- Only shown when autoplay is refused, exactly as in Thor. -->
      <div v-if="showPlayButton && !videoFailed" class="story-start" @click="playVideo">
        <div class="story-start__inner">
          <div class="story-start__label">Tap to start</div>
          <div class="story-start__play">
            <svg viewBox="0 0 60 60" aria-hidden="true">
              <path fill="currentColor" d="M20 12 48 30 20 48z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop arrows live OUTSIDE the card, as the reference has them, so
         they are siblings of `.stage` rather than children: `.stage` is the
         rounded card and clips with `overflow: hidden` on desktop, so an arrow
         placed beyond its edge from the inside would simply be cut off. -->
    <StoryArrow direction="back" @nav="jumpToSegment" />
    <StoryArrow direction="forward" @nav="jumpToSegment" />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import JournalStage from '@/components/Journal/JournalStage.vue'
import FlyLayer from '@/components/Journal/FlyLayer.vue'
import StoryHeader from '@/components/UI/StoryHeader.vue'
import StoryArrow from '@/components/UI/StoryArrow.vue'
import TapZones from '@/components/UI/TapZones.vue'
import StoryCta from '@/components/UI/StoryCta.vue'
import StoryOutro from '@/components/UI/StoryOutro.vue'
import StoryReplay from '@/components/UI/StoryReplay.vue'
import { resolvePage } from '@/components/pages/index.js'
import { resolveTargets } from '@/journal3d'
import { buildStoryTimeline } from '@/animations/buildStoryTimeline.js'
import { installStoryDebugHook } from '@/animations/installStoryDebugHook.js'
import { useStoryPlayback } from '@/composables/useStoryPlayback.js'
import { useStoryBridge } from '@/composables/useStoryBridge.js'
import { useJournalFit } from '@/composables/useJournalFit.js'
import { provideStoryData } from '@/composables/useStoryData.js'
import { buildStoryPlan } from '@/story/storyPlan.js'
import { FLIGHTS } from '@/story/flyAssets.js'

// Dev serves the low-res proxy of the reference clip, which is only ever built
// as mp4; production ships both encodes. See scripts/encode-video.sh.
const videoSources = import.meta.env.DEV
  ? [{ src: './video/ref-clean.mp4', type: 'video/mp4' }]
  : [
      { src: './video/story.mp4', type: 'video/mp4' },
      { src: './video/story.webm', type: 'video/webm' },
    ]

const stageRef = ref(null)
const videoPlayer = ref(null)

const currentTime = ref(0)
const activeSegment = ref(-1)
const isPlaying = ref(true)
const isPaused = ref(false)
const showPlayButton = ref(false)
const isBuffering = ref(true)
const soundOn = ref(false)
const longPress = ref(false)
const pressTimer = ref(null)
const endLink = ref('')

/**
 * THE SOUND BUTTON. The video ships with its soundtrack inside it, so there is
 * nothing to start and nothing to line up — only a mute to lift.
 *
 * ⚠️ IT FLIPS THE PROPERTY HERE, NOT THROUGH A BINDING. `muted` on the element
 * stays a plain attribute so the very first render is unambiguously muted and
 * autoplay is granted; the property is then flipped straight from this click,
 * synchronously, because permission to make noise is tied to the gesture and a
 * watcher would run after it. Same reason the reload starts silent every time:
 * a page cannot remember it was allowed.
 */
const toggleSound = () => {
  soundOn.value = !soundOn.value
  const v = videoPlayer.value
  if (!v) return
  v.muted = !soundOn.value
  // ⚠️ THE LEVEL IS RESTORED HERE, AND IT IS NOT BELT AND BRACES. Seeks duck
  // `video.volume` to silence and bring it back (useStoryPlayback), and a duck
  // that is interrupted — a tap arriving while the loop is already fading into
  // a hole it will now never reach — can leave the level at zero. The icon then
  // says the sound is on, `muted` is false, and the player hears nothing until
  // the page is reloaded. The owner hit exactly that on 2026-09-16. Pressing
  // the button is the one moment we KNOW what the level should be.
  if (soundOn.value) v.volume = 1
}

// Parse the link and publish the data layer BEFORE anything renders: the 17
// pages read it through `useStory()` rather than through props, because they
// are mounted by one `<component :is>` and forwarding every field of every page
// through it twice (here and in the lab) is exactly the kind of plumbing
// provide/inject exists to avoid. See useStoryData.js.
const story = provideStoryData()
// `final_link` is where the story sends the player on close / "reach end".
endLink.value = story.data.finalLink

// THE STORY THIS PLAYER ACTUALLY GETS. A page whose parameter the link does not
// carry has nothing to say, so it is dropped and the hole closed — the rule
// Thor has always had (its `skip` map, scenes.js). Built here, before anything
// renders, because the page stack, the steps bar and the timeline all have to
// agree on which pages exist. With a complete link this is the identity and
// every table below is the one the project has always used.
const plan = buildStoryPlan(story.skip, { flights: FLIGHTS })
const segments = plan.segments
const TIMING = plan.timing
if (import.meta.env.DEV && plan.droppedPages.length) {
  // eslint-disable-next-line no-console
  console.info(
    `[story] no data for ${plan.droppedPages.join(', ')} — ` +
      `${plan.droppedPages.length} page(s) dropped, story is ${plan.timing.duration.toFixed(2)} s`,
  )
}

const tlRef = shallowRef(null)
const hoverTlRef = shallowRef(null)
let targets = null

const { notify, closeStory, getGift } = useStoryBridge({ endLink })

// The scene's two buttons. Their windows are data (TIMING.cta / TIMING.replay,
// derived from the storyboard frames they appear on), so nothing here decides
// when they show — it only reads the clock.
const copy = story.t('ui')
const showCta = computed(
  () => currentTime.value >= TIMING.cta.from && currentTime.value < TIMING.cta.to,
)
const showReplay = computed(() => currentTime.value >= TIMING.replay.at)
// The outro title. Its SCALE is the timeline's (the `outroText` preset); this
// only says when the element is on screen at all, and it has to, because a
// nested timeline renders at its own time 0 while the playhead is before it.
const showOutro = computed(
  () =>
    currentTime.value >= TIMING.outro.at &&
    currentTime.value < TIMING.outro.exitAt + TIMING.outro.exitDur,
)

/**
 * "Watch again" restarts the story. `seek` clears the final-frame hold on its
 * way through, so the burst at 92.83 plays once more rather than being skipped.
 */
const watchAgain = () => {
  notify('watch_again')
  isPaused.value = false
  isPlaying.value = true
  playback.seek?.(0)
}

// Called from the setup body, not from onMounted: it registers onScopeDispose,
// and an effect scope is only current while setup runs. It waits for
// document.fonts.ready itself and then fits all 17 pages in one sweep — they
// are all mounted and merely `visibility: hidden`, so they are all measurable
// (ADR-0004, ADR-0008).
useJournalFit(stageRef)

let playback = {}
const updateTime = () => playback.updateTime?.()
const handleVideoEnded = () => playback.handleVideoEnded?.()
const togglePlayState = () => playback.togglePlayState?.()
const handleEvent = (dir, e) => playback.handleEvent?.(dir, e)
const handleEventEnd = (dir, e) => playback.handleEventEnd?.(dir, e)
const jumpToSegment = dir => playback.jumpToSegment?.(dir)
const playVideo = () => playback.playVideo?.()

const hidePreloader = () => {
  const el = document.querySelector('.fe-preloader')
  if (el) el.classList.add('fe-preloader--hidden')
}

/**
 * The background video failed to load or decode.
 *
 * ⚠️ THE PRELOADER HAS TO COME OFF HERE TOO. It is dismissed by the buffering
 * watcher, and buffering never ends when the file never arrives — so without
 * this line the message below would render underneath a spinner that spins for
 * ever, and the player would see the spinner, not the message.
 */
const videoFailed = ref(false)
const handleVideoError = () => {
  if (videoFailed.value) return
  videoFailed.value = true
  isBuffering.value = false
  hidePreloader()
  notify('video_error')
}

/**
 * One `<source>` gave up. That is not a failure on its own — the mp4 may be
 * refused by a browser that then plays the webm — so the story is only declared
 * lost once every candidate has fallen.
 */
let deadSources = 0
const handleSourceError = () => {
  deadSources += 1
  if (deadSources >= videoSources.length) handleVideoError()
}

/** The only recovery there is: ask for the file again. */
const reloadStory = () => window.location.reload()

onMounted(async () => {
  // nextTick before resolving targets: the journal's faces and the page stack
  // are v-for output, so selectors resolve to nothing until they are rendered.
  await nextTick()
  targets = resolveTargets(stageRef.value)

  const { tl, hoverTl, setFace } = buildStoryTimeline(targets, {
    plan,
    onUpdate: () => {
      if (!reachedEnd && tl.duration() > 0 && tl.progress() > 0.995) {
        reachedEnd = true
        notify('reach_end')
      }
    },
  })
  tlRef.value = tl
  hoverTlRef.value = hoverTl

  playback = useStoryPlayback({
    tl,
    hoverTl: hoverTlRef,
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
    setFace,
    plan,
  })

  // Show the first page immediately so nothing flashes empty before the video's
  // first frame is presented.
  playback.applySegment(segments[0].start)

  playback.startPlayback()

  installStoryDebugHook({
    tl,
    hoverTl,
    videoPlayer,
    segments,
    seek: playback.seek,
    applySegment: playback.applySegment,
    targets,
  })

  // Hand off from the inline preloader once the fonts have settled AND the
  // first frame is on screen — whichever is later.
  const fonts = document.fonts?.ready ?? Promise.resolve()
  fonts.then(() => {
    if (!isBuffering.value) hidePreloader()
  })
})

let reachedEnd = false

// Clear the preloader as soon as playback actually begins.
const stopWatchingBuffer = (() => {
  const iv = setInterval(() => {
    if (!isBuffering.value) {
      hidePreloader()
      clearInterval(iv)
    }
  }, 120)
  return () => clearInterval(iv)
})()

onUnmounted(() => {
  playback.stopSync?.()
  tlRef.value?.kill()
  hoverTlRef.value?.kill()
  stopWatchingBuffer()
  if (window.__story) delete window.__story
})
</script>
