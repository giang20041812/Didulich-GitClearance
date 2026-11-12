import axios, { type InternalAxiosRequestConfig } from 'axios';
import { acquireApiSlot } from './requestQueue';
import { HEDGE_PARAM, hedged } from './hedge';
import { API_ORIGIN, isTargetingOurApi, RETRY_STATUSES, RETRY_DELAY_MS, wait } from './apiBase';
import {
  PORTAL_SUSPENDED_PATH,
  bearerTokenOf,
  clearPortalSession,
  endPortalSession,
  serverMessage,
} from './authInterceptor';

/**
 * Cấu hình axios (baseURL, timeout, xếp hàng request, hedge, thử lại, interceptor 401 phiên cổng).
 *
 * Tách khỏi lib/apiBase.ts (nạp lúc boot) để axios ~50KB không nằm trong bundle tải đầu của khách du lịch —
 * service phía traveler đã dùng fetch từ trước. File này được nạp bởi cổng NCC / Admin (các chunk portal import tĩnh:
 * AdminGuard, PartnerLayout, PortalLoginPage — chạy trước khi component nào gọi axios; lib/routePrefetch.ts tải trước khi
 * người dùng rê chuột vào link portal) và các trang khách dùng services/journeyService (lịch trình, đơn, Trải nghiệm, hồ
 * sơ) — mỗi trang gọi installAxiosBoot() ở đầu module.
 */

type RetryableConfig = InternalAxiosRequestConfig & { _apiRetried?: boolean };

let installed = false;

export const installAxiosBoot = () => {
  if (installed) return;
  installed = true;

  if (API_ORIGIN) {
    axios.defaults.baseURL = API_ORIGIN;
  }

  // Không để request treo vô hạn (mạng yếu, backend lạnh). 45s đủ dung cho lần khởi động
  // container backend sau deploy; các API nhanh tự đặt timeout ngắn hơn.
  axios.defaults.timeout = 45000;

  // Request axios tới backend xếp hàng (lib/requestQueue): gửi song song là đánh thức thêm container nguội ~15 giây.
  // Bọc ở adapter để thời gian chờ lượt không tính vào timeout của request.
  const sendAxios = axios.getAdapter(axios.defaults.adapter);
  axios.defaults.adapter = async (config) => {
    if (!isTargetingOurApi(config.url)) return sendAxios(config);
    const release = await acquireApiSlot(config.apiPriority ?? 'high', config.signal as AbortSignal | undefined);
    try {
      // GET chậm bất thường (đang chờ container nguội) → gửi thêm một bản sao, dùng bản về trước (lib/hedge.ts).
      if ((config.method ?? 'get').toLowerCase() !== 'get' || config.apiHedge === false) return await sendAxios(config);
      return await hedged((signal, isHedge) => sendAxios({
        ...config,
        signal,
        params: isHedge ? { ...(config.params as Record<string, unknown> | undefined), [HEDGE_PARAM]: 1 } : config.params,
      }), config.signal);
    } finally {
      release();
    }
  };

  axios.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config || axios.isCancel(error)) {
      return Promise.reject(error);
    }
    const config = error.config as RetryableConfig;
    const status = error.response?.status;
    const transient = status === undefined ? error.code !== 'ERR_CANCELED' : RETRY_STATUSES.has(status);
    if (
      (config.method ?? 'get').toLowerCase() !== 'get' ||
      config._apiRetried ||
      !transient ||
      config.signal?.aborted ||
      !isTargetingOurApi(config.url)
    ) {
      return Promise.reject(error);
    }
    config._apiRetried = true;
    await wait(RETRY_DELAY_MS);
    return axios.request(config);
  });

  axios.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (!axios.isAxiosError(error) || !error.response) return Promise.reject(error);
      const { status } = error.response;
      const data = error.response.data as { errorCode?: unknown; message?: unknown } | undefined;
      const errorCode = typeof data?.errorCode === 'string' ? data.errorCode : undefined;

      if (status === 403 && errorCode === 'PROVIDER_SUSPENDED') {
        if (window.location.pathname !== PORTAL_SUSPENDED_PATH) {
          clearPortalSession();
          window.location.assign(PORTAL_SUSPENDED_PATH);
        }
        return Promise.reject(error);
      }

      const sentToken = bearerTokenOf(error.config);
      if (!sentToken) return Promise.reject(error);

      if (sentToken === localStorage.getItem('portal_token')) {
        if (status === 401) {
          endPortalSession(serverMessage(data) ?? 'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.');
        } else if (status === 403 && errorCode === 'ACCOUNT_INACTIVE') {
          endPortalSession(serverMessage(data) ?? 'Tài khoản của bạn đã bị vô hiệu hóa.');
        }
      } else if (status === 401 && sentToken === localStorage.getItem('traveler_token')) {
        // Phiên khách du lịch bị từ chối: xóa đúng phiên đó (trước đây xóa nhầm phiên cổng) để không lặp lỗi.
        localStorage.removeItem('traveler_token');
        localStorage.removeItem('traveler_user');
        window.dispatchEvent(new Event('auth_change'));
      }
      return Promise.reject(error);
    },
  );
};
