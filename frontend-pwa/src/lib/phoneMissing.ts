import { useEffect, useState } from 'react';

/** Phiên khách đang đăng nhập mà chưa có số điện thoại (đọc localStorage, không gọi mạng). */
export function phoneMissing(): boolean {
  try {
    // Không còn bắt khách bổ sung số điện thoại: đăng ký / đăng nhập chỉ cần email.
    return false;
  } catch {
    return false;
  }
}

export function usePhoneMissing(): boolean {
  const [missing, setMissing] = useState(phoneMissing);
  useEffect(() => {
    const sync = () => setMissing(phoneMissing());
    window.addEventListener('auth_change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('auth_change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return missing;
}
