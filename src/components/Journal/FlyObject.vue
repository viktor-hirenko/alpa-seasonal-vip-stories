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
 * `--fo-z` and `--fo-base` are STATIC: depth decides only what the object
 * passes behind, and the box is laid out once at the flight's largest size so
 * that a size change is a transform rather than a relayout.
 *
 * No `alt` text and no pointer events: these are decoration on top of a video,
 * and a screen reader announcing "gift box" mid-story would be noise.
 */
import { computed } from 'vue'
import { OBJECT_URL } from '@/story/flyAssets.js'
import { FLY_Z } from '@/story/flyObjects.js'

const props = defineProps({
  rec: { type: Object, required: true },
})

const src = OBJECT_URL[props.rec.asset]
const style = computed(() => ({
  '--fo-z': String(FLY_Z),
  '--fo-base': String(props.rec.base),
}))
</script>
