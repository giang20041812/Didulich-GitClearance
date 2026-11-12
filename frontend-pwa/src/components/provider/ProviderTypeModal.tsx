import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import ProviderTypePicker from './ProviderTypePicker';
import { providerRegisterPath, providerServiceByType } from '@/components/layout/providerServices';
import { closeProviderTypeModal, useProviderTypeModalOpen } from '@/lib/providerTypeModal';
import type { ProviderServiceType } from '@/types/partner';

/**
 * "Bạn muốn cung cấp gì?" — chọn Homestay / Trải nghiệm / Nhà xe rồi "Tiếp theo" sang mẫu đăng ký riêng của loại đó.
 * Mở bằng {@link openProviderTypeModal} (header, menu ☰). Điện thoại: khung trượt từ đáy; từ 640px: hộp giữa màn hình.
 */
export default function ProviderTypeModal() {
  const open = useProviderTypeModalOpen();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ProviderServiceType | null>(null);

  const go = (type: ProviderServiceType | null) => {
    if (!type) return;
    closeProviderTypeModal();
    navigate(providerRegisterPath(providerServiceByType(type)));
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeProviderTypeModal(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in-overlay fixed inset-0 z-[10010] bg-ink-deep/45" />
        <Dialog.Content
          aria-describedby="provider-type-hint"
          className="sheet-in fixed inset-x-0 bottom-0 z-[10010] flex max-h-[calc(100dvh-40px)] flex-col rounded-t-3xl bg-white shadow-[var(--shadow-lg)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[min(760px,calc(100vw-48px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        >
          {/* Thanh kéo của khung trượt (chỉ điện thoại) */}
          <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
          <div className="flex shrink-0 items-center px-3 pt-1 sm:px-4 sm:pt-4">
            <Dialog.Close
              aria-label="Đóng"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-deep transition-colors hover:bg-slate-100 cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-10 sm:pb-8">
            <Dialog.Title className="text-center text-2xl font-bold tracking-tight text-ink-deep sm:text-[28px]">
              Bạn muốn cung cấp gì?
            </Dialog.Title>
            <p id="provider-type-hint" className="mx-auto mt-2 mb-6 max-w-md text-center text-sm leading-relaxed text-slate-500 sm:mb-8">
              Mỗi loại hình có mẫu đăng ký riêng. Hồ sơ được quản trị viên duyệt trước khi bạn bắt đầu nhận khách.
            </p>
            <ProviderTypePicker name="provider-type-modal" value={selected} onChange={setSelected} onConfirm={go} />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 pb-[calc(1rem+var(--safe-bottom))] pt-4 sm:px-8 sm:pb-5">
            <span className="text-xs text-slate-500">
              Đã là đối tác?{' '}
              <Link
                to="/portal/login"
                onClick={() => closeProviderTypeModal()}
                className="font-semibold text-ink-deep underline underline-offset-2 hover:text-primary"
              >
                Đăng nhập
              </Link>
            </span>
            <button
              type="button"
              disabled={!selected}
              onClick={() => go(selected)}
              className="h-12 rounded-xl bg-ink-deep px-7 text-[15px] font-semibold text-white transition-[background-color,transform,opacity] duration-200 hover:bg-ink-deep/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
            >
              Tiếp theo
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
