import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function hasNodeModulePackage(id: string, packageName: string) {
  const normalizedId = id.replace(/\\/g, '/')
  return normalizedId.includes(`/node_modules/${packageName}/`)
}

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

          if (id.includes('@zxing')) {
            return 'vendor-scanner';
          }

          if (id.includes('qrcode')) {
            return 'vendor-qrcode';
          }

          if (
            hasNodeModulePackage(id, 'react') ||
            hasNodeModulePackage(id, 'react-dom') ||
            hasNodeModulePackage(id, 'react-router') ||
            hasNodeModulePackage(id, 'react-router-dom')
          ) {
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
