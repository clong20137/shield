import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.VITE_APP_BASE_PATH || '/shield/' : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('@dotlottie') || id.includes('lottie')) {
            return undefined;
          }

          if (id.includes('emoji-picker-react')) {
            return 'vendor-emoji';
          }

          if (id.includes('xlsx')) {
            return 'vendor-xlsx';
          }

          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }

          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
}))
