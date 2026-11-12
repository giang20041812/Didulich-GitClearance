import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bookmark, Check, Share2 } from 'lucide-react';
import DetailGallery from '@/components/common/DetailGallery';
import SectionNavigator from '@/components/homestay/SectionNavigator';

export interface DetailCrumb {
  label: string;
  /** Bỏ trống ở mục cuối (trang hiện tại). */
  to?: string;
}

export interface DetailTab {
  id: string;
  label: string;
}

interface DetailPageShellProps {
  breadcrumb: DetailCrumb[];
  /** Nhãn phân loại phía trên tiêu đề (chip xanh, trạng thái...). */
  badges?: ReactNode;
  title: string;
  /** Dòng thông tin dưới tiêu đề (đánh giá, địa chỉ, thời gian...). */
  meta?: ReactNode;
  images: string[];
  /** Thanh mục dính khi cuộn + nút tròn "đi tới mục". Mục nào không có trên trang thì không đưa vào. */
  tabs: DetailTab[];
  /** Nút hành động chính trên thanh mục dính (vd "Chỉ đường"). */
  cta?: { label: string; onClick: () => void; hint?: ReactNode };
  shareText?: string;
  /** Có thì hiện nút Lưu. */
  saveLabel?: string;
  /** Cột phải (thẻ thông tin dính trên máy tính; điện thoại xếp dưới nội dung). */
  aside: ReactNode;
  /** Các mục nội dung (DetailSection variant="flat"). */
  children: ReactNode;
}

/**
 * Khung trang chi tiết dùng chung, cùng bố cục với trang chi tiết homestay: breadcrumb → tiêu đề + đánh giá/địa chỉ +
 * nút Chia sẻ/Lưu → thư viện ảnh mosaic → thân 2 cột (mục nội dung phẳng bên trái, thẻ thông tin dính bên phải).
 */
export default function DetailPageShell({
  breadcrumb, badges, title, meta, images, tabs, shareText, saveLabel, aside, children,
}: DetailPageShellProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const fallbackBackTo = breadcrumb.length >= 2 ? (breadcrumb[breadcrumb.length - 2]?.to ?? '/') : '/';
  const handleBack = () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate(fallbackBackTo);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title, text: shareText, url: window.location.href }).catch(() => { });
      return;
    }
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-emerald-50/25 via-white to-slate-50/50 text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6">
        {/* Breadcrumb + Nút quay về */}
        <nav aria-label="Đường dẫn" className="mb-4 flex items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={handleBack}
            className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-emerald-300 hover:text-[var(--color-primary)] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay về</span>
          </button>
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 && <span className="text-slate-300" aria-hidden>/</span>}
              {crumb.to ? (
                <Link to={crumb.to} className="shrink-0 transition-colors hover:text-[var(--color-primary)]">{crumb.label}</Link>
              ) : (
                <span aria-current="page" className="truncate font-semibold text-slate-800">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        {/* Đầu trang */}
        <header className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">{title}</h1>
              {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">{meta}</div>}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={handleShare}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4 text-slate-500" />}
                <span>{copied ? 'Đã chép' : 'Chia sẻ'}</span>
              </motion.button>

              {saveLabel && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => setSaved((v) => !v)}
                  className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium shadow-xs transition ${saved
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <Bookmark className={`h-4 w-4 ${saved ? 'fill-rose-600 text-rose-600' : 'text-slate-500'}`} />
                  <span>{saved ? 'Đã lưu' : saveLabel}</span>
                </motion.button>
              )}
            </div>
          </div>
        </header>

        <DetailGallery images={images} name={title} />

        {/* Thân 2 cột */}
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
          <div className="min-w-0 space-y-8">{children}</div>
          <aside className="mt-8 lg:mt-0">
            <div className="space-y-5 lg:sticky lg:top-[calc(var(--app-header-offset,72px)+72px)]">{aside}</div>
          </aside>
        </div>
      </div>

      <SectionNavigator sections={tabs} />
    </div>
  );
}

/** Thẻ thông tin ở cột phải — cùng kiểu thẻ giá của homestay. */
export function DetailAsideCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_4px_24px_rgba(10,46,38,0.06)] transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(10,46,38,0.1)] ${className}`}>
      {children}
    </div>
  );
}

/** Một dòng "nhãn: giá trị" trong thẻ thông tin. */
export function DetailFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{children}</span>
    </div>
  );
}
