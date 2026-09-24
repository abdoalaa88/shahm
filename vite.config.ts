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
      includeAssets: ['offline.html', 'shahm-app-icon-192-20260924.png', 'shahm-app-icon-512-20260924.png', 'shahm-logo-mark-20260924.png'],
      manifest: {
        name: 'شَهْم - مساعدة على الطريق',
        short_name: 'شَهْم',
        description: 'منصة تكافلية لمساندة أصحاب الأعطال على الطريق',
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
            src: 'shahm-app-icon-192-20260924.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'shahm-app-icon-512-20260924.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'shahm-app-icon-512-20260924.png',
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
});
