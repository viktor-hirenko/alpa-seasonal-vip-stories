<template>
  <!-- Figma header 21770:2682 — 976x90 at (52, 36) in the 1080x1920 canvas.
       Steps bar on top, then a 946-wide row: Sound left, Close right.
       No logo or brand text in this design (unlike Thor's WinSpirit header). -->
  <header class="story-header">
    <StoryProgressBar :time="time" :segments="segments" />

    <div class="story-header__row">
      <button
        class="story-header__btn story-header__btn--sound"
        type="button"
        :aria-label="soundOn ? 'Turn sound off' : 'Turn sound on'"
        :class="{ 'is-off': !soundOn }"
        @click="$emit('toggle-sound')"
      >
        <img :src="soundIcon" alt="" />
      </button>

      <div class="story-header__spacer" />

      <button
        v-if="showPause"
        class="story-header__btn story-header__btn--pause"
        type="button"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        @click="$emit('toggle-play')"
      >
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <g v-if="isPlaying" fill="currentColor">
            <rect x="19" y="16" width="7" height="28" rx="3" />
            <rect x="34" y="16" width="7" height="28" rx="3" />
          </g>
          <path v-else fill="currentColor" d="M22 15.5 45 30 22 44.5z" />
        </svg>
      </button>

      <button
        class="story-header__btn story-header__btn--close"
        type="button"
        aria-label="Close"
        @click="$emit('close')"
      >
        <img :src="closeIcon" alt="" />
      </button>
    </div>
  </header>
</template>

<script setup>
import StoryProgressBar from './StoryProgressBar.vue'
import soundIcon from '@/assets/ui/sound.svg'
import closeIcon from '@/assets/ui/close.svg'

defineProps({
  time: { type: Number, default: 0 },
  segments: { type: Array, required: true },
  soundOn: { type: Boolean, default: false },
  isPlaying: { type: Boolean, default: true },
  /** The pause button is desktop-only, as in Thor: on mobile a long press pauses. */
  showPause: { type: Boolean, default: false },
})

defineEmits(['toggle-sound', 'toggle-play', 'close'])
</script>
