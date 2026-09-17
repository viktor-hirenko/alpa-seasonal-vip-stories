import { createApp } from 'vue'
import App from './App.vue'
import JArt from './components/shared/JArt.vue'
import './styles/main.scss'

// ⚠️ GLOBAL ON PURPOSE. `JArt` replaces the raw `<img>` in all seventeen page
// components (see the file itself for why the art has to be held back), and
// registering it here keeps that from adding an import line to every one of
// them. It is the only global component in the app; everything else is
// imported where it is used.
createApp(App).component('JArt', JArt).mount('#app')
