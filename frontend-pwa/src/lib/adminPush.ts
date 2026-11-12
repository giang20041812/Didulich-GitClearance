import { adminService } from '@/services/adminService';
import { disablePush as disable, enablePush as enable, type PushApi, type PushState } from '@/lib/webPush';

/**
 * Thông báo đẩy của cổng Admin và cổng NCC — logic chung ở lib/webPush.ts (dùng cả cho nhắc giờ của khách du lịch);
 * file này giữ API mặc định là cổng Admin cho các chỗ gọi cũ.
 */
export type { PushApi } from '@/lib/webPush';
export type AdminPushState = PushState;
export { getPushState, pushSupported, showLocalNotification } from '@/lib/webPush';

export const enablePush = (api: PushApi = adminService) => enable(api);
export const disablePush = (api: PushApi = adminService) => disable(api);
