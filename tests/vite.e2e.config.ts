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
    // Respeta SYNAPSE_E2E_PORT para que e2e/run.sh pueda mover el puerto
    // (lo propaga con --port y con la variable); por defecto 5174.
    port: Number(process.env.SYNAPSE_E2E_PORT ?? 5174),
    strictPort: true
  }
})
