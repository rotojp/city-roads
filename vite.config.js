import { fileURLToPath, URL } from 'url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from "rollup-plugin-visualizer";


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), visualizer({
  //  template: 'network'
  })],
  base: '',
  // The Garmin FIT SDK uses BigInt literals (ES2020).
  build: {
    target: 'es2020'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020'
    }
  },
  server: {
    port: 8080
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Font files of @fontsource packages. Vite 2 can't resolve them through the
      // packages' "exports" map, so we point to the directory directly.
      '@fontfiles': fileURLToPath(new URL('./node_modules/@fontsource', import.meta.url))
    }
  }
})
