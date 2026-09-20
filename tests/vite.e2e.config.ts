import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Config de test: sirve SOLO el renderer para E2E con Playwright, sin Electron.
// No forma parte del build de producción (ver electron.vite.config.ts).
export default defineConfig({
  root: resolve(process.cwd(), 'src/renderer'),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true
  }
})
