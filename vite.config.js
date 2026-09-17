import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

/**
 * ⚠️ THE FONT IS ASKED FOR FROM THE HTML, BECAUSE OTHERWISE IT IS FOURTH IN THE
 * CHAIN. Measured on the deployed build: the document, then the stylesheet,
 * then the face it names — 688 ms of that wait is pure discovery of a file
 * whose name is known here, at build time.
 *
 * And nothing hides the wait. `font-display: block` is deliberate (_fonts.scss:
 * a face swapping mid-story would re-wrap every fitted line) and the preloader
 * holds until `document.fonts.ready` (Story.vue), so the font is squarely on
 * the path to the first page the player sees.
 *
 * ⚠️ `latin` ONLY. `latin-ext` is gated by unicode-range and downloads just for
 * the locales that touch one of its codepoints; preloading it would spend 19 KB
 * of a phone's connection on most loads for nothing.
 *
 * ⚠️ AND `crossorigin` IS NOT DECORATION. A font is always fetched in CORS
 * mode, so a preload without it does not match the request the stylesheet makes
 * and the file is fetched TWICE.
 */
const preloadLatinFont = () => ({
  name: 'alpa-preload-latin-font',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      // lab.html is the motion designer's page and has no preloader to shorten.
      if (!ctx.path.endsWith('/index.html')) return
      const emitted = Object.keys(ctx.bundle ?? {}).find(
        n => /rubik-latin-[^/]+\.woff2$/.test(n) && !n.includes('rubik-latin-ext'),
      )
      // No bundle means dev, where Vite serves the source path unhashed.
      const href = emitted ? `./${emitted}` : '/src/assets/fonts/rubik-latin.woff2'
      return {
        html,
        tags: [
          {
            tag: 'link',
            attrs: { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  },
})

export default defineConfig({
  plugins: [vue(), preloadLatinFont()],

  // Relative base so the build can be dropped into any CDN subdirectory and
  // embedded via iframe on the product domain (same as Thor VIP Stories).
  base: './',

  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },

  build: {
    // The casino audience runs old iPhones; Vite's default `modules` target
    // assumes Safari 15+.
    target: ['es2020', 'safari14'],
    rollupOptions: {
      input: {
        // lab.html ships in production on purpose: ~10 KB, linked from nowhere,
        // and it lets the motion designer review the 3D presets on their phone.
        main: path.resolve(import.meta.dirname, 'index.html'),
        lab: path.resolve(import.meta.dirname, 'lab.html'),
      },
    },
  },

  css: {
    preprocessorOptions: { scss: { api: 'modern-compiler' } },
  },

  server: { host: true, port: 5173 },
})
