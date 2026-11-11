import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves project sites at https://<user>.github.io/<repo>/,
  // so production assets and the router must live under /return-scanner-pro/.
  // Keep the dev server at the root for convenience.
  base: mode === 'production' ? '/return-scanner-pro/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Return Scanner Pro — Retours colis',
        short_name: 'ReturnScan',
        description:
          'Scannez et validez les retours colis par liste, hors ligne. Registre unique, sons, exports et sauvegardes locales.',
        lang: 'fr',
        dir: 'ltr',
        // start_url and scope are derived from `base` by vite-plugin-pwa.
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#070d18',
        theme_color: '#070d18',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true, allowedHosts: ['.trycloudflare.com'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
