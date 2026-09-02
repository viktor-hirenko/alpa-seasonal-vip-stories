<template>
  <!-- Placeholder shell. The real composition root (video, header, tap zones,
       master timeline) arrives in phase 3; phase 1 is the 3D scene and the lab. -->
  <div class="story-root">
    <div class="stage">
      <div class="stage-3d">
        <JournalStage face="page">
          <div class="journal-page journal-page--active" style="display: grid; place-items: center">
            <p style="font: 700 5vh/1 Rubik, sans-serif; opacity: 0.5">journal</p>
          </div>
        </JournalStage>
        <div class="fly-layer" />
      </div>
      <div class="stage__flash" />
      <div class="stage__ui" />
    </div>
  </div>
</template>

<script setup>
import JournalStage from '@/components/Journal/JournalStage.vue'
</script>
