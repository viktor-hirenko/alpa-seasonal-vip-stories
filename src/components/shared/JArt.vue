<template>
  <img :src="shown" :fetchpriority="priority ? 'high' : 'low'" decoding="async" alt="" />
</template>

<script setup>
/**
 * PAGE ART, HELD BACK UNTIL THE STORY CAN AFFORD IT.
 *
 * ⚠️ WHY THIS EXISTS AT ALL. Every one of the seventeen pages is mounted from
 * the first frame — it has to be, because the font fitter measures all of them
 * in one boot-time sweep and a `display: none` page is unmeasurable (ADR-0004,
 * and the note on `.journal-page` in _journal.scss). Mounted meant their art was
 * requested too: 48 files, 3.9 MB, all at once, before a single frame of the
 * story had played. Measured on the deployed build over a 4G link:
 *
 *   - the <video> sat at readyState 0 for FIVE SECONDS on a fast connection and
 *     over ten on 4G — it was queued behind the pictures;
 *   - individual page images took 15 to 19 seconds each;
 *   - the preloader stayed up 15.7 s. The owner saw 8 to 10 on his phone and
 *     called it, correctly, unacceptable.
 *
 * ⚠️ AND THE SAME LOAD IS WHY SAFARI KILLED THE TAB. Decoded, those 48 files are
 * 100.3 MB of RGBA — `space-milk-cow` alone is 6.0 MB at 941x1672. Add the
 * 1080x1920 video layer and seventeen composited pages and an iPhone's per-tab
 * budget is gone. That is the "A problem repeatedly occurred" screen.
 *
 * ⚠️ LAZY LOADING CANNOT DO THIS JOB HERE, which is why the gate is explicit.
 * `loading="lazy"` defers what is outside the viewport; our inactive pages are
 * stacked inside it and merely `visibility: hidden`, so the browser considers
 * every one of them visible and fetches the lot.
 *
 * ⚠️ IT CANNOT SHIFT ANYTHING. Every art element in this project carries its own
 * declared box — inline through `artImg(width, height)` or through a class in
 * `du(...)` units — so the space is reserved whether the file has arrived or
 * not. Lighthouse agrees: Cumulative Layout Shift on the deployed build is 0.
 *
 * `priority` marks the art the player is looking at before anything else can
 * matter — the cover. Everything else is fetched at low priority so the tape,
 * the stylesheet and the font reach the decoder first.
 */
import { computed } from 'vue'
import { artIsOpen } from '@/composables/useArtGate.js'

const props = defineProps({
  src: { type: String, required: true },
  /** The cover: wanted immediately, at high priority. */
  priority: { type: Boolean, default: false },
})

const shown = computed(() => (props.priority || artIsOpen.value ? props.src : undefined))
</script>
