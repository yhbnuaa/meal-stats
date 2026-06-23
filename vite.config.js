import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 部署到 GitHub Pages 时，base 改成 '/<仓库名>/'（如 '/meal-stats/'）。
// 本地开发用 '/' 即可；可用环境变量 VITE_BASE 覆盖。
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  // 兼容较老的浏览器内核（部分鸿蒙/华为浏览器），把新语法降级
  build: {
    target: ['es2015', 'chrome64', 'safari11.1', 'firefox60', 'edge18']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '吃饭统计',
        short_name: '吃饭统计',
        description: '团队午饭 / 晚饭报名人数统计',
        theme_color: '#1d9e75',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // 新 SW 立即接管，清掉旧缓存——避免老版本白屏卡住
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // 带 hash 的静态资源(js/css/图标)预缓存即可，文件名变了自然更新
        globPatterns: ['**/*.{js,css,svg,png,ico,webmanifest}'],
        // 页面(HTML)不进预缓存，改为「网络优先」：在线永远拿最新版，
        // 离线时回退到上次访问缓存的版本
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10 }
            }
          }
        ]
      }
    })
  ]
})
