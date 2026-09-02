import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Configuración de Vite para ChloeRestaurant
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // En producción web los recursos deben resolverse desde la raíz del dominio.
  // Esto evita problemas de carga de JS/CSS en distintos dispositivos.
  base: '/',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    // Los archivos generados por Vite llevan hash automáticamente.
    // Esto permite que cada nueva versión tenga assets diferentes.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
        },
      },
    },
  },
})