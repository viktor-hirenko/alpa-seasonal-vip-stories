<template>
  <div class="story-root">
    <div ref="stageRef" class="stage">
      <!-- Background: the master clock.
           ⚠️ THE SOUND BUTTON IN THE HEADER IS NOT WIRED, AND THREE THINGS HAVE
           TO CHANGE TOGETHER BEFORE IT CAN BE. The motion designer is adding a
           soundtrack later; when it lands:
             1. scripts/encode-video.sh strips audio with `-an` on all four
                encode paths, so the shipped file has no track to unmute;
             2. `muted` below is a fixed attribute, not a binding;
             3. nothing anywhere assigns `video.muted` — `soundOn` only picks
                which glyph the header draws.
           The start-muted-then-unmute-on-tap shape is RIGHT and must stay: a
           browser refuses to autoplay a video with sound, so the button is the
           user gesture that earns it. See _context/95-code-audit.md.

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
      >
        <source v-for="s in videoSources" :key="s.src" :src="s.src" :type="s.type" />
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
        <StoryHeader
          :time="currentTime"
          :segments="segments"
          :sound-on="soundOn"
          :is-playing="isPlaying"
          show-pause
          @toggle-sound="soundOn = !soundOn"
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
      <div v-if="showPlayButton" class="story-start" @click="playVideo">
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
