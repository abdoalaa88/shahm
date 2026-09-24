import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['offline.html'],
      manifest: {
        name: 'شَهْم - نقل الحالات العلاجية',
        short_name: 'شَهْم',
        description: 'منصة تكافلية غير ربحية لنقل الحالات العلاجية',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F8F9',
        theme_color: '#005131',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          {
            src: 'pwa-512x512.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg}'],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
