import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.scss'

createApp(App).mount('#app')

// Hand off from the inline preloader once Vue has mounted and the webfont has
// settled. Fonts matter: the text fitter measures glyphs, so a swap after the
// first fit would invalidate every computed --fit (ADR-0004).
const hidePreloader = () => {
  const el = document.querySelector('.fe-preloader')
  if (el) el.classList.add('fe-preloader--hidden')
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(hidePreloader)
} else {
  hidePreloader()
}
