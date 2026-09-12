<template>
  <div class="fly-obj" :data-fly="rec.id" :style="style">
    <div class="fly-obj__box">
      <img class="fly-obj__art" :src="src" alt="" draggable="false" />
    </div>
  </div>
</template>

<script setup>
/**
 * One flying object. Two nested elements on purpose — the outer one is the
 * full-stage positioner whose --fo-x/--fo-y are stage percentages, the inner
 * one is the object's own box. flyingObject.js explains why, and _fly.scss
 * carries the ownership contract.
 *
 * `--fo-base` is STATIC — the box is laid out once at the flight's largest size
 * so a size change is a transform rather than a relayout. `--fo-z` is NOT: an
 * object flies in front of the journal and crosses behind it partway through,
 * so the value here is only the starting one and flyLayer's `applyAt` owns it
 * from the clock after that.
 *
 * No `alt` text and no pointer events: these are decoration on top of a video,
 * and a screen reader announcing "gift box" mid-story would be noise.
 */
import { computed } from 'vue'
import { OBJECT_URL } from '@/story/flyAssets.js'
import { FLY_Z_FRONT, FLY_GLOW } from '@/story/flyObjects.js'

const props = defineProps({
  rec: { type: Object, required: true },
})

const src = OBJECT_URL[props.rec.asset]
// The halo is per object, not per deck — see FLY_GLOW. An asset with no entry
// would silently fall back to the cash icon's, which is the bug FLY_GLOW fixes,
// so the lookup is explicit and a miss is visible as no halo at all.
const glow = FLY_GLOW[props.rec.asset] ?? [0, 0, 0]
const style = computed(() => ({
  '--fo-z': String(FLY_Z_FRONT),
  '--fo-base': String(props.rec.base),
  '--fo-glow-y': String(glow[0]),
  '--fo-glow-blur': String(glow[1]),
  '--fo-glow-a': String(glow[2]),
}))
</script>
