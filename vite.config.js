import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],

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
