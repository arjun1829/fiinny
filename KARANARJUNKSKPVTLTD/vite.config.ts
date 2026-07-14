import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // No service worker in dev — it precaches the bundle (stale code) and
      // intercepts Firestore. The PWA is only active in production builds.
      devOptions: { enabled: false },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4MB
        // Cache the app shell (HTML, JS, CSS) — stale-while-revalidate
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        runtimeCaching: [
          // Firestore API — NEVER cache/intercept. A service-worker cache in
          // front of Firestore corrupts the SDK's real-time Listen channel and
          // serves stale reads: writes "succeed" (success popup) but the UI keeps
          // showing old data. Firestore handles its own offline persistence.
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          // Firebase Storage — Cache First (images and files)
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts — Cache First
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-static', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
          // Razorpay checkout script — Network First
          {
            urlPattern: /^https:\/\/checkout\.razorpay\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'razorpay-cache', networkTimeoutSeconds: 8 },
          },
          // App navigation — Stale While Revalidate. Same-origin ONLY, so it can
          // never intercept cross-origin Google/Firebase APIs (Firestore, Auth).
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && !url.pathname.startsWith('/api'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-shell-cache', expiration: { maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 } },
          },
        ],
      },
      includeAssets: ['favicon.ico', 'logo.png', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'KaranArjun Retailer SaaS',
        short_name: 'KaranArjun',
        description: 'Premium Retailer Management System for Agri-Business',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})

