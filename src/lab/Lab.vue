<template>
  <div class="lab">
    <div class="lab__viewport">
      <div class="story-root">
        <div ref="stageRef" class="stage">
          <div v-if="bg === 'grid'" class="lab__grid" />
          <video
            v-else
            ref="videoRef"
            class="stage__bg"
            :src="bgSrc"
            muted
            playsinline
            loop
            preload="auto"
          />

          <div class="stage-3d">
            <JournalStage :face="face" :depth="depth" :stage-el="stageRef">
              <!-- Marker on the back cover so it is obvious WHICH face is
                   showing during the floor part of the entrance. In the
                   reference the first ~1.4 s shows the back cover, so getting
                   the sign of rotationX right matters. -->
              <template #back>
                <div class="lab-back"><span>BACK COVER</span></div>
              </template>
              <div class="journal-page journal-page--active">
                <!-- The REAL page, through the same registry the player uses,
                     so the lab is the authoring surface for page work too.
                     Pages not yet built fall through to PageStub. -->
                <component
                  :is="resolvePage(slide?.page)"
                  :page="slide?.page || 'journal'"
                  :frame="slide?.frame ?? 0"
                  :start="slide?.at ?? 0"
                />
              </div>
            </JournalStage>
            <div class="fly-layer" />
          </div>

          <div class="stage__flash" />
          <div class="stage__speed" />
        </div>
      </div>
    </div>

    <aside v-if="showPanel" class="lab__panel">
      <div class="lab__h">Backdrop</div>
      <div class="lab__btns">
        <button
          v-for="opt in BG_OPTIONS"
          :key="opt.id"
          class="lab__btn"
          :class="{ 'lab__btn--on': bg === opt.id }"
          @click="setBg(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
      <p class="lab__note">
        The <b>preview</b> backdrop has the journal baked in — if the pose is right, the DOM journal
        lands exactly on it and the composite reads as one object. Any error shows as a doubled edge,
        and both its size and its direction are readable. That is the primary fidelity check.
      </p>

      <div class="lab__h">Presets</div>
      <div class="lab__btns">
        <button
          v-for="name in PRESET_NAMES"
          :key="name"
          class="lab__btn"
          @click="firePreset(name)"
        >
          {{ name }}
        </button>
      </div>
      <div class="lab__btns" style="margin-top: 6px">
        <button class="lab__btn" :class="{ 'lab__btn--on': hoverOn }" @click="toggleHover">
          hover {{ hoverOn ? 'on' : 'off' }}
        </button>
        <button class="lab__btn" @click="resetPose">reset</button>
        <button class="lab__btn" :class="{ 'lab__btn--on': !journalVisible }" @click="toggleJournal">
          journal {{ journalVisible ? 'on' : 'off' }}
        </button>
      </div>

      <div class="lab__h">Params — {{ activePreset || '—' }}</div>
      <div v-if="!schemaRows.length" class="lab__note">No tunable params.</div>
      <div v-for="row in schemaRows" :key="row.key" class="lab__row">
        <label :for="'p-' + row.key">{{ row.key }}</label>
        <input
          :id="'p-' + row.key"
          v-model.number="params[row.key]"
          type="range"
          :min="row.min"
          :max="row.max"
          :step="row.step"
          @input="firePreset(activePreset)"
        />
        <output>{{ params[row.key] }}</output>
      </div>

      <div class="lab__h">Pose parking</div>
      <div v-for="row in POSE_ROWS" :key="row.key" class="lab__row">
        <label :for="'q-' + row.key">{{ row.key }}</label>
        <input
          :id="'q-' + row.key"
          v-model.number="pose[row.key]"
          type="range"
          :min="row.min"
          :max="row.max"
          :step="row.step"
          @input="applyManualPose"
        />
        <output>{{ pose[row.key] }}</output>
      </div>

      <div class="lab__h">Scene</div>
      <div class="lab__row">
        <label for="persp">--persp</label>
        <input id="persp" v-model.number="persp" type="range" min="600" max="4000" step="25" />
        <output>{{ persp }}</output>
      </div>
      <div class="lab__row">
        <label for="depth">--jd</label>
        <input id="depth" v-model.number="depth" type="range" min="2" max="140" step="1" />
        <output>{{ depth }}</output>
      </div>
      <div class="lab__btns">
        <button
          class="lab__btn"
          :class="{ 'lab__btn--on': face === 'cover' }"
          @click="face = face === 'cover' ? 'page' : 'cover'"
        >
          face: {{ face }}
        </button>
      </div>

      <div class="lab__h">Slides (Figma frame №)</div>
      <div class="lab__slides">
        <button
          v-for="s in SLIDES"
          :key="s.frame"
          class="lab__btn"
          :class="{ 'lab__btn--on': slide?.frame === s.frame }"
          @click="gotoSlide(s)"
        >
          {{ s.frame }}
        </button>
      </div>

      <div class="lab__h">Readout</div>
      <div class="lab__readout">{{ readout }}</div>
      <div class="lab__btns" style="margin-top: 6px">
        <button class="lab__btn" @click="copyAsData">copy as data</button>
      </div>
      <p class="lab__note">
        “copy as data” emits a paste-ready object literal for
        <code>src/story/slides.js</code>, so pose authoring is drag → look → copy instead of
        edit → save → reload → guess.
      </p>
    </aside>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { gsap } from 'gsap'
import JournalStage from '@/components/Journal/JournalStage.vue'
import { resolvePage } from '@/components/pages/index.js'
import { resolveTargets, setPose } from '@/journal3d'
import * as presets from '@/journal3d/presets.js'
import { SLIDES } from '@/story/slides.js'
import { DEPTH, PAGE_SCALE } from '@/story/journalGeometry.js'
import { TIMING } from '@/story/timing.js'

const BG_OPTIONS = [
  { id: 'grid', label: 'grid' },
  { id: 'clean', label: 'clean bg' },
  { id: 'preview', label: 'preview' },
]

/** Presets worth a button. `hover` and `flyingObject` are driven separately. */
const PRESET_NAMES = [
  'edgeOnPose',
  'flyInFromFloor',
  'swingOpen',
  'flyInFromBelow',
  'zoomToCamera',
  'pageFlip3D',
  'orbit',
  'recede',
  'whiteFlashExit',
  'hyperspaceBurst',
]

const POSE_ROWS = [
  { key: 'rotationX', min: -180, max: 180, step: 1 },
  { key: 'rotationY', min: -180, max: 180, step: 1 },
  { key: 'rot', min: -60, max: 60, step: 0.05 },
  { key: 'scale', min: 0.1, max: 2, step: 0.001 },
  { key: 'z', min: -2000, max: 800, step: 10 },
  { key: 'cx', min: -50, max: 200, step: 0.1 },
  { key: 'cy', min: -50, max: 200, step: 0.1 },
]

const stageRef = ref(null)
const videoRef = ref(null)

/**
 * URL params seed every control, which makes the lab scriptable: headless
 * Chrome can park a pose and screenshot it, and `scripts/compare-frames.sh`
 * can diff that against a reference frame without anyone clicking anything.
 *   ?frame=11&rotY=90&jd=34&persp=1800&bg=preview&panel=0
 */
const Q = new URLSearchParams(location.search)
const qNum = (k, fallback) => (Q.has(k) ? Number(Q.get(k)) : fallback)
const qStr = (k, fallback) => (Q.has(k) ? String(Q.get(k)) : fallback)
const seedSlide =
  SLIDES.find(s => s.frame === qNum('frame', 11)) || SLIDES.find(s => s.frame === 11) || SLIDES[0]

const bg = ref(qStr('bg', 'grid'))
const face = ref(qStr('face', seedSlide.face))
const depth = ref(qNum('jd', DEPTH))
const persp = ref(qNum('persp', TIMING.persp.base))
const slide = ref(seedSlide)
const showPanel = ref(qStr('panel', '1') !== '0')
const livePlay = qStr('play', '0') === '1'
const hoverOn = ref(false)
const journalVisible = ref(qStr('journal', '1') !== '0')
const activePreset = ref('')
const params = reactive({})
const pose = reactive({
  rotationX: qNum('rotX', 0),
  rotationY: qNum('rotY', 0),
  rot: qNum('rot', seedSlide.pose.rot),
  scale: qNum('scale', seedSlide.pose.scale ?? PAGE_SCALE),
  z: qNum('z', 0),
  cx: qNum('cx', seedSlide.pose.cx),
  cy: qNum('cy', seedSlide.pose.cy),
})

// Vite resolves these at build time; keep the dev proxy out of prod bundles by
// pointing at public/, which is copied verbatim.
const bgSrc = computed(() =>
  bg.value === 'preview' ? './video/ref-preview.mp4' : './video/ref-clean.mp4',
)

let targets = null
let current = null
let hoverTl = null

const readout = computed(() => {
  const u = targets ? getComputedStyle(targets.stage).getPropertyValue('--u').trim() : '?'
  const m = targets ? getComputedStyle(targets.box).transform : '?'
  return [
    `face      ${face.value}`,
    `--u       ${u}`,
    `--persp   ${persp.value} design px`,
    `--jd      ${depth.value} design px`,
    `pose      rot ${pose.rot}  scale ${pose.scale}`,
    `          cx ${pose.cx}%  cy ${pose.cy}%`,
    `          rotX ${pose.rotationX}  rotY ${pose.rotationY}  z ${pose.z}`,
    `matrix    ${m}`,
  ].join('\n')
})

const schemaRows = computed(() => {
  const fn = presets[activePreset.value]
  const schema = fn && fn.PARAM_SCHEMA
  if (!schema) return []
  return Object.entries(schema).map(([key, cfg]) => ({ key, ...cfg }))
})

function killCurrent() {
  if (current) {
    current.kill()
    current = null
  }
}

function applyManualPose() {
  if (!targets) return
  killCurrent()
  setPose(targets, { rot: pose.rot, scale: pose.scale, cx: pose.cx, cy: pose.cy })
  gsap.set(targets.box, { rotationX: pose.rotationX, rotationY: pose.rotationY, z: pose.z })
  gsap.set(targets.pos, { autoAlpha: 1 })
}

function resetPose() {
  killCurrent()
  Object.assign(pose, {
    rotationX: 0,
    rotationY: 0,
    rot: slide.value?.pose.rot ?? 0,
    scale: slide.value?.pose.scale ?? PAGE_SCALE,
    z: 0,
    cx: slide.value?.pose.cx ?? 50,
    cy: slide.value?.pose.cy ?? 50,
  })
  if (targets) gsap.set([targets.pos, targets.flash, targets.speed].filter(Boolean), { clearProps: 'opacity,visibility' })
  applyManualPose()
}

function firePreset(name) {
  if (!targets || !name) return
  const fn = presets[name]
  if (typeof fn !== 'function') return

  if (activePreset.value !== name) {
    activePreset.value = name
    // Seed the sliders from the preset's own defaults by reading the schema
    // midpoint only where we have nothing better — the preset itself owns the
    // real defaults, so an unset param just means "use the default".
    Object.keys(params).forEach(k => delete params[k])
    const schema = fn.PARAM_SCHEMA || {}
    const probe = fn.length >= 3 ? null : fn(targets, {})
    Object.keys(schema).forEach(k => {
      const fromTimeline = probe && probe.vars && probe.vars[k]
      params[k] = fromTimeline ?? schema[k].min + (schema[k].max - schema[k].min) / 2
    })
    if (probe) probe.kill()
  }

  killCurrent()
  gsap.set(targets.pos, { autoAlpha: 1 })

  // rePose/recede take (targets, from, to, params); the rest take (targets, params).
  if (name === 'recede') {
    const from = SLIDES.find(s => s.frame === 23)?.pose
    const to = SLIDES.find(s => s.frame === 24)?.pose
    current = fn(targets, from, to, params)
  } else {
    current = fn(targets, params)
  }
  current.play(0)
}

function toggleHover() {
  if (!targets) return
  hoverOn.value = !hoverOn.value
  if (hoverOn.value) {
    hoverTl = presets.hover(targets)
  } else if (hoverTl) {
    hoverTl.kill()
    hoverTl = null
    gsap.set(targets.hover, { clearProps: 'transform' })
  }
}

function gotoSlide(s) {
  slide.value = s
  face.value = s.face
  Object.assign(pose, {
    rotationX: 0,
    rotationY: 0,
    rot: s.pose.rot,
    scale: s.pose.scale,
    cx: s.pose.cx,
    cy: s.pose.cy,
    z: 0,
  })
  applyManualPose()
  const v = videoRef.value
  if (v) {
    v.pause()
    v.currentTime = s.at + SEEK_LEAD
  }
}

/** Toggle the journal on/off so the baked reference can be read on its own. */
function toggleJournal() {
  journalVisible.value = !journalVisible.value
  if (targets) gsap.set(targets.pos, { autoAlpha: journalVisible.value ? 1 : 0 })
}

/**
 * Park the backdrop just after the current slide's cut and HOLD it.
 *
 * Two things had to be right here, both learned the hard way:
 *
 * 1. HOLD, don't play. The baked journal keeps drifting after the cut, so a
 *    playing underlay compares the DOM pose against a drifted one and every
 *    slide looks misaligned. `?play=1` opts into live playback for checking
 *    motion rather than poses.
 *
 * 2. Seek to `at + SEEK_LEAD`, not `at`. The scene-detection timecodes are the
 *    first frame of the new content, but seeking to exactly that timestamp
 *    lands on the frame BEFORE it, so you end up comparing the DOM against the
 *    previous page — and against the previous page's pose, which makes a
 *    correct pose look badly wrong.
 */
const SEEK_LEAD = qNum('lead', 0.2)
function setBg(id) {
  bg.value = id
  requestAnimationFrame(() => {
    const v = videoRef.value
    if (!v) return
    const seek = () => {
      v.currentTime = (slide.value?.at ?? 0) + SEEK_LEAD
      if (livePlay) v.play().catch(() => {})
      else v.pause()
    }
    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })
  })
}

function copyAsData() {
  const literal = `{ frame: ${slide.value?.frame ?? 0}, at: ${slide.value?.at ?? 0}, page: '${
    slide.value?.page ?? ''
  }', face: '${face.value}', pose: { rot: ${pose.rot}, scale: ${pose.scale}, cx: ${pose.cx}, cy: ${
    pose.cy
  } } },`
  navigator.clipboard?.writeText(literal)
  console.log(literal)
}

watch(persp, v => {
  if (stageRef.value) stageRef.value.style.setProperty('--persp', String(v))
})

onMounted(() => {
  targets = resolveTargets(stageRef.value)
  stageRef.value.style.setProperty('--persp', String(persp.value))
  applyManualPose()
  if (!journalVisible.value) gsap.set(targets.pos, { autoAlpha: 0 })
  if (bg.value !== 'grid') setBg(bg.value)

  // Debug hook — DEV only, same shape as the story's own.
  if (import.meta.env.DEV) {
    window.__lab = {
      targets,
      presets,
      pose,
      setPersp: v => (persp.value = v),
      setDepth: v => (depth.value = v),
      goto: n => {
        const s = SLIDES.find(x => x.frame === n)
        if (s) gotoSlide(s)
      },
    }
  }
})

onBeforeUnmount(() => {
  killCurrent()
  if (hoverTl) hoverTl.kill()
  if (window.__lab) delete window.__lab
})
</script>
