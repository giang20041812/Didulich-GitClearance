import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { ReasonDialog } from './AdminFilters';

/** Tài khoản cần xóa: khách (bảng traveler) hoặc tài khoản Admin / NCC (bảng account). */
export interface DeleteAccountTarget {
  kind: 'TRAVELER' | 'ADMIN' | 'PROVIDER';
  id: number;
  name: string;
}

const KIND_LABEL: Record<DeleteAccountTarget['kind'], string> = {
  TRAVELER: 'tài khoản khách',
  ADMIN: 'tài khoản quản trị viên',
  PROVIDER: 'tài khoản nhà cung cấp',
};

const CONSEQUENCE: Record<DeleteAccountTarget['kind'], string> = {
  TRAVELER: 'Khách không thể đăng nhập lại bằng tài khoản này; các booking cũ vẫn được giữ lại để đối soát.',
  ADMIN: 'Người này mất toàn bộ quyền quản trị ngay lập tức.',
  PROVIDER:
    'Tài khoản đăng nhập của nhà cung cấp bị xóa (hồ sơ đối tác và homestay vẫn giữ). Nếu đây là tài khoản hoạt động cuối cùng, các booking đang chờ của nhà cung cấp sẽ bị hủy.',
};

/** Hộp xóa hẳn tài khoản: bắt buộc lý do, có bước xác nhận lần cuối, không thể hoàn tác. */
export default function DeleteAccountDialog({
  target,
  onClose,
  onDeleted,
  notify,
}: {
  target: DeleteAccountTarget;
  onClose: () => void;
  onDeleted: () => void;
  notify: (type: 'success' | 'error', text: string) => void;
}) {
  const [error, setError] = useState('');
  const label = KIND_LABEL[target.kind];

  const confirm = async (reason: string) => {
    setError('');
    try {
      if (target.kind === 'TRAVELER') await adminService.deleteTraveler(target.id, reason);
      else await adminService.deleteAccount(target.id, reason);
      notify('success', `Đã xóa ${label} ${target.name}.`);
      onDeleted();
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, `Không thể xóa ${label}.`));
    }
  };

  return (
    <ReasonDialog
      title={`Xóa ${label}`}
      description={`Xóa vĩnh viễn ${label} "${target.name}". ${CONSEQUENCE[target.kind]}`}
      finalConfirm={`Bạn sắp XÓA VĨNH VIỄN ${label} "${target.name}". Thao tác này không thể hoàn tác. ${CONSEQUENCE[target.kind]}`}
      confirmLabel="Xóa vĩnh viễn"
      reasonRequired
      reasonRequiredMessage="Vui lòng nhập lý do xóa tài khoản."
      tone="danger"
      error={error}
      onCancel={onClose}
      onConfirm={confirm}
    />
  );
}

/** Nút thùng rác nhỏ dùng trên dòng của bảng tài khoản. */
export function DeleteAccountButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Xóa tài khoản"
      aria-label={`Xóa tài khoản ${label}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger active:scale-95 sm:h-auto sm:w-auto sm:p-1.5"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
