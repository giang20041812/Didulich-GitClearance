import { useState, useEffect, useCallback, useRef } from 'react';
import type { BeforeInstallPromptEvent, PlatformType, PwaInstallState } from '@/types/pwa';

export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [platform, setPlatform] = useState<PlatformType>('desktop-other');
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Kiểm tra trạng thái đã cài đặt (Standalone Mode)
  const checkIsInstalled = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    // 1. Kiểm tra display-mode standalone
    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    
    // 2. iOS Safari standalone
    const nav = window.navigator as unknown as { standalone?: boolean };
    const isIosStandalone = Boolean(nav.standalone);

    // 3. Android app referrer
    const isAndroidApp = document.referrer.includes('android-app://');

    return isStandaloneDisplay || isIosStandalone || isAndroidApp;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Phát hiện thiết bị & trình duyệt
    const ua = navigator.userAgent;
    const detectedIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const detectedAndroid = /Android/i.test(ua);
    const detectedMobile = detectedIos || detectedAndroid || window.innerWidth < 768;
    const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);

    setIsIos(detectedIos);
    setIsMobile(detectedMobile);

    if (detectedIos) {
      setPlatform('ios');
    } else if (detectedAndroid) {
      setPlatform('android');
    } else if (isChrome) {
      setPlatform('desktop-chrome');
    } else {
      setPlatform('desktop-other');
    }

    setIsInstalled(checkIsInstalled());

    // Kiểm tra xem sự kiện beforeinstallprompt đã được bắt ở window sớm hơn chưa
    const globalPrompt = (window as unknown as { __deferredPwaPrompt?: BeforeInstallPromptEvent }).__deferredPwaPrompt;
    if (globalPrompt) {
      promptRef.current = globalPrompt;
      setDeferredPrompt(globalPrompt);
      setCanInstall(true);
    }

    // Lắng nghe sự kiện trước khi cài đặt của trình duyệt (Chrome, Edge, Android...)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      promptRef.current = promptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);
      (window as unknown as { __deferredPwaPrompt?: BeforeInstallPromptEvent }).__deferredPwaPrompt = promptEvent;
    };

    // Lắng nghe khi ứng dụng đã cài đặt xong thành công
    const handleAppInstalled = () => {
      promptRef.current = null;
      setDeferredPrompt(null);
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [checkIsInstalled]);

  // Hành động kích hoạt cài đặt ứng dụng
  const installApp = useCallback(async (): Promise<boolean> => {
    const activePrompt = promptRef.current || deferredPrompt;
    if (!activePrompt) {
      return false;
    }

    try {
      await activePrompt.prompt();
      const choice = await activePrompt.userChoice;

      if (choice.outcome === 'accepted') {
        promptRef.current = null;
        setDeferredPrompt(null);
        setCanInstall(false);
        setIsInstalled(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  return {
    canInstall,
    isInstalled,
    isIos,
    isMobile,
    platform,
    installApp,
  };
}
