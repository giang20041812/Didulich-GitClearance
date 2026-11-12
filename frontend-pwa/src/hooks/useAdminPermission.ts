import { createContext, useContext } from 'react';
import { levelCan, type AdminCapability } from '@/lib/adminPermissions';
import type { AdminLevel } from '@/types/admin';

/** Cấp quản trị của người đang đăng nhập; mặc định cấp 3 (ít quyền nhất) khi ngoài cổng Admin. */
export const AdminLevelContext = createContext<AdminLevel>(3);

export function useAdminPermission() {
  const level = useContext(AdminLevelContext);
  return { level, can: (capability: AdminCapability) => levelCan(level, capability) };
}
