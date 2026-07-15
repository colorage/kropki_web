import { defineConfig } from 'vite'

export default defineConfig({
  // Custom domain (kropki.siaroza.com) serves at site root — not /kropki_web/
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
})
