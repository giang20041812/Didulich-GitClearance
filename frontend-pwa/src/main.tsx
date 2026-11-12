import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Font tự host thay cho Google Fonts: cùng origin, có hash cache bất biến, không còn CSS chặn render từ bên thứ 3.
// Tiêu đề: DT Phudu (src/assets/fonts, khai báo ở styles/fonts.css), nội dung toàn web: Montserrat.
import './styles/fonts.css'
import '@fontsource/montserrat/vietnamese-400.css'
import '@fontsource/montserrat/vietnamese-500.css'
import '@fontsource/montserrat/vietnamese-600.css'
import '@fontsource/montserrat/vietnamese-700.css'
import '@fontsource/montserrat/vietnamese-800.css'
import '@fontsource/montserrat/latin-ext-400.css'
import '@fontsource/montserrat/latin-ext-500.css'
import '@fontsource/montserrat/latin-ext-600.css'
import '@fontsource/montserrat/latin-ext-700.css'
import '@fontsource/montserrat/latin-ext-800.css'
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-600.css'
import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-800.css'
import '@fontsource/dancing-script/vietnamese-600.css'
import '@fontsource/dancing-script/vietnamese-700.css'
import '@fontsource/dancing-script/latin-600.css'
import '@fontsource/dancing-script/latin-700.css'
import '@fontsource/playfair-display/vietnamese-600.css'
import '@fontsource/playfair-display/vietnamese-700.css'
import '@fontsource/playfair-display/vietnamese-800.css'
import '@fontsource/playfair-display/latin-600.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/playfair-display/latin-800.css'
import './styles/globals.css'
import './styles/cta.css'
import App from './App.tsx'
import { installApiBase } from './lib/apiBase'
import { installRoutePrefetch } from './lib/routePrefetch'
import { installCtaFx } from './lib/ctaFx'
import { installImageFx } from './lib/imageFx'
import { initSentryLazy } from './lib/sentry'
import { HERO_SIZES, HERO_SRCSET } from '@/lib/heroImages'

// Ảnh hero trang chủ chỉ được phát hiện sau khi JS chạy xong và React render. Preload ngay khi module này thực thi
// (chỉ khi vào thẳng trang chủ) để ảnh tải song song với JS — cùng srcset/sizes với <img> nên tải đúng một bản.
if (typeof document !== 'undefined' && window.location.pathname === '/' && !document.querySelector('link[rel="preload"][as="image"]')) {
  const preload = document.createElement('link')
  preload.rel = 'preload'
  preload.as = 'image'
  preload.imageSrcset = HERO_SRCSET
  preload.imageSizes = HERO_SIZES
  preload.fetchPriority = 'high'
  document.head.appendChild(preload)
}

// Capture beforeinstallprompt immediately at the earliest possible lifecycle
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as unknown as { __deferredPwaPrompt?: Event }).__deferredPwaPrompt = e;
  });
}

installApiBase()
// Rê chuột / focus vào link nào thì tải trước chunk trang đó — lần đầu vào web chuyển trang gần như tức thì.
installRoutePrefetch()
installCtaFx()
// Ảnh chưa tải xong: skeleton lấp lánh, tải xong mới hiện trọn ảnh (không vẽ dần từng dải, không giật).
installImageFx()
// Sentry chỉ tải khi đặt VITE_SENTRY_DSN (xem lib/sentry.ts) — không ảnh hưởng lượt tải đầu.
initSentryLazy()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
