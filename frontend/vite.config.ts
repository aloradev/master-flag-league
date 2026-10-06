import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const apiTarget = loadEnv(mode, '.', '').API_PROXY_TARGET || 'http://localhost:5000';
  return {
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo el frontend llama a /api y Vite lo reenvía a la API.
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        configure: proxy => proxy.on('proxyReq', request => request.removeHeader('origin')),
      },
      // Avatares y logos: los sirve la API cuando no hay Cloudinary.
      '/media': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'react';
          if (id.includes('node_modules/@tanstack')) return 'query';
          if (id.includes('node_modules/daisyui')) return 'ui';
          return undefined;
        },
      },
    },
  },
  };
});
