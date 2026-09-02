<template>
  <!--
    The persistent journal. One instance for the whole 94 s: never unmounted,
    never re-keyed, never re-created. Only its pose changes and its page content
    cuts. That is both what the reference does and the only way to keep the idle
    drift continuous.

    The four-layer nesting is the transform-ownership contract from ADR-0002 —
    read _stage.scss before changing it.
  -->
  <div class="journal-pos">
    <div class="journal-hover">
      <div class="journal-box">
        <JournalFaces>
          <template #back><slot name="back" /></template>
          <slot />
        </JournalFaces>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import JournalFaces from './JournalFaces.vue'
import { FACE, DEPTH, SEAM } from '@/story/journalGeometry.js'

const props = defineProps({
  /** Which base component the box is laid out at. */
  face: { type: String, default: 'page' },
  /** Spine thickness override, design px. */
  depth: { type: Number, default: DEPTH },
  /** Element that carries the `--jw`/`--jh`/`--jd` custom properties. Defaults
   *  to the nearest `.stage` ancestor, resolved on mount. */
  stageEl: { type: Object, default: null },
})

let host = null

/**
 * Geometry lives on the stage rather than on the box because `--jw`/`--jh` are
 * also read by every face. Changing them is a layout change, not a transform,
 * so it costs one reflow of a ~1.5k-px box — and it always happens on the same
 * frame as a hard content cut, which makes it invisible.
 */
const applyGeometry = () => {
  if (!host) return
  const { w, h } = FACE[props.face] || FACE.page
  host.style.setProperty('--jw', String(w))
  host.style.setProperty('--jh', String(h))
  host.style.setProperty('--jd', String(props.depth))
  host.style.setProperty('--jseam', String(SEAM))
}

onMounted(() => {
  host = props.stageEl || document.querySelector('.stage')
  applyGeometry()
})

watch(() => [props.face, props.depth], applyGeometry)
</script>
