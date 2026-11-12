import { useState, useEffect, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';
import BackToTop from '@/components/ui/BackToTop';
import OfflineIndicator from '@/components/pwa/OfflineIndicator';
import HeroPwaDownloadBanner from '@/components/pwa/HeroPwaDownloadBanner';
import { useProviderTypeModalOpen } from '@/lib/providerTypeModal';
import { useNearbySuggestions } from '@/lib/nearbyPrefs';
import { usePhoneMissing } from '@/lib/phoneMissing';

// Tải khi cần: hộp chọn loại hình, hộp bổ sung SĐT, gợi ý quanh đây không nằm trong bundle trang đầu.
const ProviderTypeModal = lazy(() => import('@/components/provider/ProviderTypeModal'));
const PhoneRequiredPrompt = lazy(() => import('@/components/auth/PhoneRequiredPrompt'));
const NearbySuggestionWatcher = lazy(() => import('@/components/nearby/NearbySuggestionWatcher'));

import { hasHeroOverlay } from '@/lib/routeUtils';

export default function SidebarLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const providerModalOpen = useProviderTypeModalOpen();
  const nearbyOn = useNearbySuggestions();
  const phoneMissing = usePhoneMissing();

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  // Tự động đóng sidebar khi chuyển đường dẫn (route)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Đóng sidebar khi nhấn phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasHeroImage = hasHeroOverlay(location.pathname);

  // overflow-x-clip (không phải hidden): hidden biến khung này thành vùng cuộn riêng nên mọi phần tử sticky bên trong (cột
  // tóm tắt lịch trình, thẻ "Muốn đi như thế này?"…) không dính được khi cửa sổ cuộn. Trình duyệt cũ chưa có clip (Safari
  // < 16) vẫn dùng hidden để không bị cuộn ngang.
  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] relative overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
      {/* Header cố định ở đỉnh trang: nút 3 sọc chỉ hiện khi sidebar ẩn */}
      <Header 
        isSidebarOpen={isSidebarOpen} 
        toggleSidebar={toggleSidebar} 
      />
      
      {/* Sidebar dạng Drawer ở layer cao nhất z-[9999] với background trong suốt và dấu X góc phải trên cùng */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={closeSidebar} 
      />

      {/* Use the measured header height, including the phone's safe area. */}
      <div className={`flex flex-1 w-full relative transition-all duration-200 ${hasHeroImage ? 'pt-0' : 'pt-[var(--app-header-height,130px)]'}`}>
        {/* Nội dung chính của trang: Rộng rãi, toàn màn hình */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out">
          <main className="flex-1 w-full relative z-10">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>

      {/* Nút nổi về đầu trang — hiện khi cuộn xuống sâu */}
      <BackToTop />

      {/* Chỉ báo mất / lại có mạng — cho du khách vùng núi sóng yếu */}
      <OfflineIndicator />

      {/* Thanh tải app dính đáy — chỉ điện thoại */}
      <HeroPwaDownloadBanner />

      {/* Hộp "Bạn muốn cung cấp gì?" — mở từ header / menu ☰ */}
      {providerModalOpen && <Suspense fallback={null}><ProviderTypeModal /></Suspense>}
      {/* Khách đăng nhập chưa có số điện thoại: bắt buộc bổ sung */}
      {phoneMissing && <Suspense fallback={null}><PhoneRequiredPrompt /></Suspense>}
      {/* Gợi ý quanh đây (khách tự bật trong menu ☰) */}
      {nearbyOn && <Suspense fallback={null}><NearbySuggestionWatcher /></Suspense>}
    </div>
  );
}
