import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        // Dùng IPv4 để tránh Node thử ::1 rồi báo AggregateError khi backend chỉ bind IPv4.
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      // Mirror rewrite /media + /mediac trong vercel.json để dev lẫn preview đều tải được ảnh media.
      '/media': {
        target: 'https://mbmliqykqjufvngjvdjx.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/, '/storage/v1/object/public/viettrek-media'),
      },
      '/imgc': {
        target: 'https://mbmliqykqjufvngjvdjx.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/imgc/, '/storage/v1/render/image/public/viettrek-media'),
      },
    }
  },
  preview: {
    // `npm run preview` phục vụ bản build dist mà không có backend local: mặc định chuyển /api sang
    // backend production để trang hiển thị đủ dữ liệu (không còn lỗi "Không thể kết nối đến hệ thống").
    // Đang chạy backend local thì: PREVIEW_API_TARGET=http://127.0.0.1:8080 npm run preview
    proxy: {
      '/api': {
        target: process.env.PREVIEW_API_TARGET || 'https://vt-api-two.vercel.app',
        changeOrigin: true,
      },
      '/media': {
        target: 'https://mbmliqykqjufvngjvdjx.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/, '/storage/v1/object/public/viettrek-media'),
      },
      '/imgc': {
        target: 'https://mbmliqykqjufvngjvdjx.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/imgc/, '/storage/v1/render/image/public/viettrek-media'),
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Tách React / router / animation ra chunk riêng: ít đổi giữa các lần deploy nên trình duyệt giữ cache lâu hơn.
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'motion-vendor', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-192x192.png', 'pwa-maskable-512x512.png', 'screenshots/desktop-wide.png', 'screenshots/mobile-narrow.png'],
      manifest: {
        id: '/',
        name: 'Đi Du Lịch',
        short_name: 'Đi Du Lịch',
        description: 'Nền tảng đặt homestay bản địa và khám phá trải nghiệm du lịch di sản, sinh thái Việt Nam',
        lang: 'vi',
        dir: 'ltr',
        categories: ['travel', 'tourism', 'food', 'lifestyle'],
        display_override: ['standalone', 'minimal-ui'],
        theme_color: '#043D32',
        background_color: '#F7F5ED',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          {
            src: '/screenshots/desktop-wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Trang chủ Đi Du Lịch trên máy tính'
          },
          {
            src: '/screenshots/mobile-narrow.png',
            sizes: '750x1334',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Ứng dụng Đi Du Lịch trên điện thoại'
          }
        ],
        shortcuts: [
          {
            name: 'Tìm phòng Homestay',
            short_name: 'Homestay',
            description: 'Khám phá và đặt phòng homestay sinh thái',
            url: '/homestays',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Chuyến đi của tôi',
            short_name: 'Chuyến đi',
            description: 'Lịch trình, nhắc giờ tham quan và cẩm nang hôm nay',
            url: '/journeys',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Bản đồ du lịch',
            short_name: 'Bản đồ',
            description: 'Khám phá địa điểm bản đồ',
            url: '/map',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        // Nhận thông báo đẩy của cổng Admin và cổng NCC (public/push-sw.js): hiện ra ngoài màn hình kể cả khi đã đóng tab.
        importScripts: ['push-sw.js'],
        maximumFileSizeToCacheInBytes: 5000000,
        // Chỉ precache VỎ app (shell) ~1MB: trang HTML, entry JS/CSS, vendor chunk dùng chung. Các chunk trang
        // (809KB / ~100 file) KHÔNG tải sẵn nữa — lần đầu vào mạng chậm không bị service worker giành băng thông
        // tải hàng loạt; trang nào đã xem thì chunk đó vào cache runtime (xem rule asset-chunk-cache) và offline
        // vẫn hoạt động như cũ.
        globPatterns: [
          'index.html',
          'manifest.webmanifest',
          'registerSW.js',
          'assets/index-*.{js,css}',
          'assets/{react,motion}-vendor-*.js',
          'assets/{axios,firebase,rolldown-runtime,createLucideIcon,loader-*}-*.js',
        ],
        // Cổng Admin / NCC và trang design-system không cần tải sẵn về máy khách du lịch; vào trang nào tải trang đó.
        globIgnores: ['**/Admin*.js', '**/Partner*.js', '**/DesignSystemPage*.js'],
        // Mở app / chuyển trang khi mất mạng vẫn thấy khung ứng dụng (từ precache) thay vì lỗi trình duyệt.
        navigateFallback: 'index.html',
        // /api/* cùng domain được vercel.json chuyển tiếp sang backend: mở thẳng một URL API trên tab
        // (tải file, link chuyển hướng) phải tới máy chủ, không được trả index.html của SPA.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Font tự host (same-origin, @fontsource): CacheFirst để app mở offline vẫn đúng chữ tiếng Việt.
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 180 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          // Ảnh media từ Supabase Storage (nhà cung cấp hiện tại), Cloudinary / Unsplash (media cũ, URL có
          // query string) và ảnh giấy phép mở của dữ liệu mẫu (Wikimedia Commons, Flickr — trang /nguon-anh);
          // phản hồi opaque status 0 vì <img> khác domain. StaleWhileRevalidate để ảnh lỗi tự được thay ở lần
          // sau; không cache tile bản đồ (destination !== 'image').
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' &&
              (url.hostname === 'res.cloudinary.com' ||
                url.hostname === 'images.unsplash.com' ||
                url.hostname === 'upload.wikimedia.org' ||
                url.hostname === 'live.staticflickr.com' ||
                /\.supabase\.co$/.test(url.hostname)),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          // Ảnh tĩnh same-origin bất biến: /assets/*.webp (hero, logo — hash theo lần build) và /media/*
          // (ảnh media proxy qua Vercel — mỗi lần upload là UUID mới nên URL không bao giờ đổi nội dung):
          // CacheFirst, không bao giờ cần xác thực lại với mạng.
          {
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin && request.destination === 'image' &&
              (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-image-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          // Chunk trang / chunk dùng chung same-origin (tên file có hash, bất biến): trang nào đã xem thì cache
          // chunk đó — chuyển trang đã xem offline vẫn chạy, mà không phải tải sẵn cả trăm chunk lúc cài SW.
          {
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/assets/') &&
              (request.destination === 'script' || request.destination === 'style'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'asset-chunk-cache',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          // Danh mục công khai (cùng domain qua /api), khớp với các đường dẫn backend gắn CDN-Cache-Control.
          // StaleWhileRevalidate: mạng chậm/mất mạng vẫn hiển thị ngay bản đã cache rồi tải làm mới ngầm —
          // dữ liệu hiển thị cũ nhất cũng chỉ bằng độ trễ CDN (s-maxage=60s). Chỉ request KHÔNG kèm
          // Authorization — không bao giờ lưu dữ liệu của người đã đăng nhập vào cache của service worker.
          {
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin &&
              request.method === 'GET' &&
              !request.headers.has('Authorization') &&
              /^\/api\/public\/(home|festivals|places(\/[^/]+(\/(nearby|map-context))?)?)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-data-cache',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ]
      }
    })
  ],
});
