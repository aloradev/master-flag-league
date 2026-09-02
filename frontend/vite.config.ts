import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo el frontend llama a /api y Vite lo reenvía a la API.
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      // Avatares y logos: los sirve la API cuando no hay Cloudinary.
      '/media': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
