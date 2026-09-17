import { createApp } from 'vue'
import Lab from './Lab.vue'
import JArt from '@/components/shared/JArt.vue'
import { openArt } from '@/composables/useArtGate.js'
import '@/styles/main.scss'
import './lab.scss'

// ⚠️ THE LAB IS A SECOND COMPOSITION ROOT, SO EVERY GLOBAL HAS TO BE REPEATED
// HERE. `JArt` is registered globally in main.js because it replaced the raw
// `<img>` in all seventeen pages (useArtGate.js) — and this root never
// registered it, so from that change onwards the lab drew every page with NO
// ART AT ALL. An unknown component is a warning in dev and silently nothing in
// a build, which is why nobody saw it: found 17.09 by shooting one page from
// two builds and getting byte-identical files where they could not have been.
//
// ⚠️ AND THE GATE IS OPENED STRAIGHT AWAY. It exists to stop 3.9 MB of page art
// racing the video for a phone's connection; the lab has no video to protect,
// no preloader to shorten and one page on screen, so it has nothing to wait for.
openArt()

createApp(Lab).component('JArt', JArt).mount('#lab')
