import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
  build: {
    chunkSizeWarningLimit: 1500,
  },

  // No dev proxy: the SaaS/reset-password functions are called directly over
  // HTTPS at their asia-south1 cloudfunctions.net URLs (see src/utils/functionsUrl.ts),
  // so `/api/*` no longer needs proxying in `npm run dev` / `npm run dev:uat`.
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
          // NOTE: there is deliberately NO same-origin StaleWhileRevalidate rule.
          // One used to sit here and served the PREVIOUS deploy's index.html, whose
          // lazy chunks (LoginPage-<hash>.js …) no longer exist after a deploy, so
          // pages crashed with "Failed to fetch dynamically imported module" until
          // a manual reload. The app shell is versioned by the precache manifest.
        ],
        // A new deploy takes over immediately and drops the old precache, so a
        // tab never keeps running a build whose chunks were deleted.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
      },
      includeAssets: ['favicon.ico', 'logo.png', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'KaranArjun ERP',
        short_name: 'KaranArjun ERP',
        description: 'Billing, GST invoicing, khata and inventory for agri-input businesses',
        theme_color: '#0f5132',
        background_color: '#fbfaf5',
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
  }
})

