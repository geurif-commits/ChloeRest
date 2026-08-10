import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 👈 Soluciona la pantalla en blanco en Electron y dispositivos móviles en red local
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})