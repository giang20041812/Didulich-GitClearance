import { useSyncExternalStore } from 'react';

/**
 * Trạng thái mở của hộp "Bạn muốn cung cấp gì?" — mở từ header (máy tính) và menu ☰ (điện thoại); hộp được gắn một lần
 * trong SidebarLayout.
 */
let open = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function openProviderTypeModal() {
  open = true;
  emit();
}

export function closeProviderTypeModal() {
  open = false;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProviderTypeModalOpen() {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
