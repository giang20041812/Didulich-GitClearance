import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import ScrollToTop from '@/components/layout/ScrollToTop';
import ErrorBoundary from '@/components/ErrorBoundary';
import AppRoutes from '@/routes';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
        {/* Vercel Pro: số liệu truy cập (Web Analytics) + hiệu năng người dùng thật (Speed Insights,
            Core Web Vitals) xem trong dashboard Vercel — script async, không chặn render. */}
        <Analytics />
        <SpeedInsights />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
