import { defineConfig } from 'vite'

export default defineConfig({
  base: '/kropki_web/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
})
