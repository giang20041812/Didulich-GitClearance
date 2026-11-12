import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_firebase_api_key' &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    try {
      auth = initializeAuth(app, {
        persistence: browserLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      auth = getAuth(app);
    }
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  } catch (err) {
    console.error('Lỗi khởi tạo Firebase:', err);
  }
}

/**
 * Đăng nhập "phát một" qua Google Popup bằng Firebase
 * Trả về ID Token đã được Google xác thực để gửi về Backend
 */
export async function signInWithGooglePopup(): Promise<string> {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error(
      'Chưa cấu hình Firebase Client! Vui lòng thêm các biến VITE_FIREBASE_* vào file .env của frontend-pwa.'
    );
  }

  // Firebase Authorized Domains mặc định chỉ cho phép 'localhost', không cho phép '127.0.0.1'
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    window.location.hostname = 'localhost';
    throw new Error('Đang chuyển trang sang http://localhost:5173 để Firebase xác thực...');
  }

  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);

  // Ưu tiên lấy Google OAuth idToken, nếu không có lấy Firebase ID token
  const token = credential?.idToken || (await result.user.getIdToken());
  if (!token) {
    throw new Error('Không thể nhận token xác thực từ Google.');
  }
  return token;
}

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ||
  '812546516455-tiv1qmpfpjbr7rll7amog5248e47d4fj.apps.googleusercontent.com';

/** Tải script Google Identity Services */
export async function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.google?.accounts?.id) return;
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Không thể tải Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không thể tải Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Tự động gọi Google One Tap / Sign-in prompt khi chưa đăng nhập
 */
export async function initGoogleOneTap(onCredential: (idToken: string) => void | Promise<void>): Promise<() => void> {
  try {
    await loadGsiScript();
    if (!window.google?.accounts?.id) return () => {};

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (response.credential) {
          void onCredential(response.credential);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.prompt();

    return () => {
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // ignore
      }
    };
  } catch (err) {
    console.warn('Google One Tap init skipped/error:', err);
    return () => {};
  }
}

/**
 * Fallback trực tiếp bằng Google Identity Services (GSI)
 * Miễn nhiễm 100% với lỗi third-party cookies / chặn iframe của Firebase
 */
export async function signInWithGoogleGsi(): Promise<string> {
  // Nạp script GSI nếu chưa có
  await loadGsiScript();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let hiddenDiv: HTMLDivElement | null = null;

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (hiddenDiv?.isConnected) hiddenDiv.remove();
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    try {
      window.google!.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            finish(() => resolve(response.credential!));
          } else {
            finish(() => reject(new Error('Không nhận được token xác thực từ Google')));
          }
        },
      });

      // Tạo một nút ẩn để kích hoạt popup tự nhiên của Google
      hiddenDiv = document.createElement('div');
      hiddenDiv.style.display = 'none';
      document.body.appendChild(hiddenDiv);

      window.google!.accounts.id.renderButton(hiddenDiv, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
      });

      const button = hiddenDiv.querySelector('div[role=button]') as HTMLElement | null;
      if (button) {
        button.click();
      } else {
        window.google!.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            finish(() => reject(new Error('Trình duyệt đã chặn cửa sổ đăng nhập Google')));
          }
        });
      }

      // Dọn dẹp nút ẩn sau 30 giây
      timeoutId = setTimeout(() => {
        finish(() => {
          const error = new Error('Google popup closed');
          Object.assign(error, { code: 'auth/popup-closed-by-user' });
          reject(error);
        });
      }, 15000);
    } catch (err) {
      finish(() => reject(err));
    }
  });
}

export { auth, googleProvider };
