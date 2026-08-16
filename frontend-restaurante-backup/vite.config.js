import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración de Vite para ChloeRestaurant
export default defineConfig({
  plugins: [react()],

  // En producción web los recursos deben resolverse desde la raíz del dominio.
  // Esto evita problemas de carga de JS/CSS en distintos dispositivos.
  base: '/',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    // Los archivos generados por Vite llevan hash automáticamente.
    // Esto permite que cada nueva versión tenga assets diferentes.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})