import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Download, KeyRound, MousePointerClick, Printer, ScanLine } from 'lucide-react';
import QrCodeSvg from '@/components/qr/QrCodeSvg';
import { LogoMark, LogoWordmark } from '@/components/ui/logo';
import { qrSvgMarkup } from '@/lib/qrSvg';
import { getApiErrorMessage } from '@/lib/apiError';
import { checkinUrl, fetchCheckinQr, formatCheckinCode } from '@/services/stayService';
import type { CheckinQrView } from '@/types/booking';
import { BlockSkeleton } from '@/components/ui/PageSkeleton';

type Portal = 'admin' | 'partner';

const portalOf = (): Portal | null => {
  try {
    if (!localStorage.getItem('portal_token')) return null;
    const role = (JSON.parse(localStorage.getItem('portal_user') ?? '{}') as { role?: string }).role;
    return role === 'ADMIN' ? 'admin' : role === 'PROVIDER' ? 'partner' : null;
  } catch {
    return null;
  }
};

const STEPS = [
  { Icon: Camera, text: 'Mở camera điện thoại, hướng vào mã QR' },
  { Icon: MousePointerClick, text: 'Bấm đường dẫn hiện ra, đăng nhập tài khoản đã đặt phòng' },
  { Icon: ScanLine, text: 'Bấm “Nhận phòng” — xong! Hết giờ trả phòng hệ thống tự trả phòng' },
];

/**
 * Mã QR nhận phòng của một homestay (Admin / NCC): tờ A5 có tên homestay, mã QR lớn, mã gõ tay và 3 bước cho khách. Mã có
 * sẵn cho mọi homestay, không bao giờ đổi và luôn trỏ về trang chính thức (mở trang này từ đâu cũng được) — chủ nhà chỉ
 * việc in / tải ảnh rồi để ra cho khách quét. Nút "In" và "Tải ảnh" không ra giấy.
 */
export default function CheckinQrPosterPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const portal = portalOf();
  const [qr, setQr] = useState<CheckinQrView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!portal || !placeId) return;
    let alive = true;
    fetchCheckinQr(Number(placeId), portal)
      .then((data) => { if (alive) setQr(data); })
      .catch((err: unknown) => { if (alive) setError(getApiErrorMessage(err, 'Không tải được mã QR. Vui lòng thử lại.')); });
    return () => { alive = false; };
  }, [placeId, portal]);

  if (!portal) return <Navigate to="/login" replace state={{ returnUrl: `/in-ma-qr/${placeId ?? ''}` }} />;

  const back = portal === 'admin' ? '/admin' : '/partner/homestays';
  const url = qr ? checkinUrl(qr.code) : '';

  const download = () => {
    if (!qr) return;
    const blob = new Blob([qrSvgMarkup(url, { margin: 4 })], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ma-qr-nhan-phong-${qr.placeId}.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <div className="min-h-dvh bg-slate-100 px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-[calc(1.5rem+var(--safe-top))] print:bg-white print:p-0">
      <style>{'@page { size: A5 portrait; margin: 8mm; } @media print { html, body { background: #fff !important; } }'}</style>

      <div className="mx-auto mb-5 flex max-w-[148mm] flex-col gap-3 print:hidden">
        <Link to={back} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0a7d64]">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Link>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-lg font-extrabold text-slate-900">Mã QR nhận phòng</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Mã đã có sẵn cho homestay của bạn. In ra (hoặc tải ảnh) rồi để ở quầy lễ tân / cửa phòng — khách tự quét để nhận
            phòng. Mã không bao giờ đổi nên chỉ cần in một lần.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => window.print()} disabled={!qr}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0a7d64] text-base font-bold text-white shadow-sm hover:bg-[#06604a] disabled:opacity-50 cursor-pointer">
              <Printer className="h-5 w-5" /> In mã QR
            </button>
            <button type="button" onClick={download} disabled={!qr}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-[#0a7d64]/40 bg-white text-base font-bold text-[#0a7d64] hover:bg-[#edfbf7] disabled:opacity-50 cursor-pointer">
              <Download className="h-5 w-5" /> Tải ảnh mã
            </button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mx-auto max-w-[148mm] rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{error}</p>}
      {!qr && !error && (
        <BlockSkeleton label="Đang tải mã QR" lines={4} className="mx-auto max-w-[148mm] py-16" />
      )}

      {qr && (
        <article className="mx-auto flex max-w-[148mm] flex-col items-center overflow-hidden rounded-2xl bg-white text-center shadow-lg ring-1 ring-slate-200 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
          <header className="flex w-full items-center justify-center gap-2.5 bg-[#0a7d64] px-6 py-3.5 print:[print-color-adjust:exact]">
            <LogoMark size={34} plate />
            <LogoWordmark size={22} tone="light" />
          </header>

          <div className="flex w-full flex-col items-center px-8 pb-7 pt-6">
            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#0a7d64]">Chào mừng bạn đến</p>
            <h2 className="mt-1 text-[26px] font-black leading-tight text-[#0a2e26]">{qr.placeName}</h2>
            <p className="mt-4 text-[30px] font-black leading-none text-[#e8590c] print:[print-color-adjust:exact]">Quét để nhận phòng</p>

            <div className="mt-5 rounded-2xl border-4 border-[#0a7d64] p-2.5 print:[print-color-adjust:exact]">
              <QrCodeSvg text={url} label={`Mã QR nhận phòng ${qr.placeName}`} className="h-[62mm] w-[62mm]" />
            </div>

            {/* Màn hình hẹp: mã xuống dòng nguyên khối, không bị cắt đôi */}
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <KeyRound className="h-4 w-4 text-[#0a7d64]" /> Không quét được? Nhập mã
              </span>
              <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 font-mono text-lg font-black tracking-[0.12em] text-[#0a2e26] print:[print-color-adjust:exact]">
                {formatCheckinCode(qr.code)}
              </span>
            </p>

            <ol className="mt-5 grid w-full grid-cols-3 gap-2 text-left">
              {STEPS.map(({ Icon, text }, i) => (
                <li key={text} className="flex flex-col items-center gap-1.5 rounded-xl bg-[#f4fbf8] p-2.5 text-center print:[print-color-adjust:exact]">
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#0a7d64] text-white">
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#e8590c] text-[10px] font-black">{i + 1}</span>
                  </span>
                  <span className="text-[11px] font-semibold leading-snug text-slate-700">{text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 break-all font-mono text-[10px] text-slate-400">{url}</p>
          </div>
        </article>
      )}
    </div>
  );
}
