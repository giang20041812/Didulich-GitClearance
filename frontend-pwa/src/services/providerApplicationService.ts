import axios from 'axios';
import type { ProviderApplicationStatusInput, ProviderApplicationStatusResult, ProviderRegisterInput, ProviderRegisterResult } from '@/types/partner';

/** UC-NCC-08: NCC tự đăng ký. Hồ sơ chờ Admin duyệt (FR-AD-03, module Admin). */
export const providerApplicationService = {
  async register(input: ProviderRegisterInput) {
    return (await axios.post<ProviderRegisterResult>('/api/v1/auth/provider/register', input)).data;
  },
  /** UC-NCC-01 "Xem trạng thái": tra cứu bằng mã hồ sơ + số điện thoại đã đăng ký. */
  async status(input: ProviderApplicationStatusInput) {
    return (await axios.post<ProviderApplicationStatusResult>('/api/v1/auth/provider/application-status', input)).data;
  },
};
