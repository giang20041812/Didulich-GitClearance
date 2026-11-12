import React, { useState, useRef } from 'react';
import { Star, X, CheckCircle2, AlertCircle, MessageSquare, Image as ImageIcon, Plus, Trash2, Upload, Loader2 } from 'lucide-react';
import { submitBookingReview, updateBookingReview } from '@/services/bookingService';
import { uploadReviewImageToCloudinary } from '@/services/cloudinaryService';
import type { ReviewDto } from '@/types/review';

interface BookingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingCode: string;
  placeName: string;
  roomTypeName?: string;
  existingReview?: ReviewDto | null;
  onSuccess: (review: ReviewDto) => void;
}

export default function BookingReviewModal({
  isOpen,
  onClose,
  bookingCode,
  placeName,
  roomTypeName,
  existingReview,
  onSuccess,
}: BookingReviewModalProps) {
  const isEditMode = Boolean(existingReview);
  const [rating, setRating] = useState<number>(existingReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [content, setContent] = useState(existingReview?.content || '');
  const [images, setImages] = useState<string[]>(existingReview?.images || []);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 8) {
      setErrorMsg('Tối đa 8 hình ảnh cho một đánh giá.');
      return;
    }

    setIsUploadingFiles(true);
    setErrorMsg(null);

    const uploadedUrls: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        if (!file.type.startsWith('image/')) {
          throw new Error(`File ${file.name} không phải là hình ảnh.`);
        }
        if (file.size > 4 * 1024 * 1024) {
          throw new Error(`Ảnh ${file.name} vượt quá dung lượng tối đa 4MB — hãy nén ảnh rồi thử lại.`);
        }
        const { url: secureUrl } = await uploadReviewImageToCloudinary(file, bookingCode);
        uploadedUrls.push(secureUrl);
      }
      setImages((prev) => [...prev, ...uploadedUrls]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh lên thất bại.';
      setErrorMsg(msg);
    } finally {
      setIsUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddImage = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setErrorMsg('Vui lòng nhập đường dẫn URL ảnh hợp lệ (bắt đầu bằng http:// hoặc https://).');
      return;
    }
    if (images.length >= 8) {
      setErrorMsg('Tối đa 8 hình ảnh cho một đánh giá.');
      return;
    }
    setImages((prev) => [...prev, url]);
    setImageUrlInput('');
    setErrorMsg(null);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content.trim().length < 5) {
      setErrorMsg('Vui lòng chia sẻ nhận xét chi tiết hơn (tối thiểu 5 ký tự).');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      let resultReview: ReviewDto;
      if (isEditMode) {
        resultReview = await updateBookingReview(bookingCode, {
          rating,
          content: content.trim(),
          images,
        });
      } else {
        resultReview = await submitBookingReview(bookingCode, {
          rating,
          content: content.trim(),
          images,
        });
      }
      onSuccess(resultReview);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu đánh giá.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatingLabel = (score: number) => {
    switch (score) {
      case 5:
        return 'Tuyệt vời & rất hài lòng';
      case 4:
        return 'Hài lòng & dịch vụ tốt';
      case 3:
        return 'Bình thường, tạm ổn';
      case 2:
        return 'Chưa được như kỳ vọng';
      case 1:
        return 'Thất vọng, cần cải thiện';
      default:
        return '';
    }
  };

  const activeScore = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 pt-20 sm:pt-24 pb-8 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-lg border border-[var(--color-border)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
        {/* Header modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#F6FAF8]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#0a7d64]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {isEditMode ? 'Chỉnh sửa đánh giá kỳ nghỉ' : 'Đánh giá kỳ nghỉ của bạn'}
              </h3>
              <p className="text-xs text-gray-500">Mã đơn: #{bookingCode}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          <div className="p-3 bg-slate-50 border border-gray-200/70 rounded-md">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Chỗ nghỉ</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">{placeName}</div>
            {roomTypeName && (
              <div className="text-xs text-gray-600 mt-0.5">Hạng phòng: {roomTypeName}</div>
            )}
          </div>

          {/* Chọn số sao */}
          <div className="space-y-1.5 text-center py-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
              Mức độ hài lòng của bạn
            </label>
            <div className="flex items-center justify-center gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                  title={`${star} sao`}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= activeScore
                        ? 'fill-[var(--color-sun)] text-[var(--color-sun)]'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="text-xs font-bold text-[var(--color-coral)] min-h-[18px]">
              {getRatingLabel(activeScore)}
            </div>
          </div>

          {/* Ô nhập nhận xét */}
          <div className="space-y-1.5">
            <label htmlFor="reviewContent" className="block text-xs font-bold text-gray-700">
              Chia sẻ trải nghiệm thực tế <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="reviewContent"
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Chia sẻ về không gian homestay, sự hiếu khách của chủ nhà, món ăn bản địa, vị trí phong cảnh xung quanh..."
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition-all placeholder:text-gray-400"
            />
            <div className="flex justify-between items-center text-[11px] text-gray-400">
              <span>Tối thiểu 5 ký tự</span>
              <span>{content.length}/2000</span>
            </div>
          </div>

          {/* Thêm hình ảnh trải nghiệm thực tế */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Hình ảnh thực tế chuyến đi ({images.length}/8)
              </label>
              <span className="text-[11px] text-gray-400">Không bắt buộc</span>
            </div>

            {/* Options chọn: Upload file hoặc Dán link ảnh */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploadingFiles || images.length >= 8}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-3 py-2 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-md hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  {isUploadingFiles ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang tải ảnh lên...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Tải ảnh từ máy / điện thoại
                    </>
                  )}
                </button>
              </div>

              {/* Dán URL dự phòng */}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddImage();
                    }
                  }}
                  placeholder="Hoặc dán liên kết URL ảnh (https://...)"
                  className="flex-1 px-3 py-1.5 text-xs rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={handleAddImage}
                  disabled={images.length >= 8}
                  className="px-3 py-1.5 text-xs font-semibold bg-[var(--color-primary-50)] text-[var(--color-primary)] border border-[var(--color-primary-200)] rounded-md hover:bg-[var(--color-primary-100)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm URL
                </button>
              </div>
            </div>

            {/* Danh sách ảnh đã thêm */}
            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-2 pt-1">
                {images.map((imgUrl, idx) => (
                  <div key={idx} className="relative group rounded-md overflow-hidden aspect-video border border-gray-200 bg-gray-50">
                    <img
                      src={imgUrl}
                      alt={`Ảnh review ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Ảnh khách tải lên bị lỗi: để trống ô (nền xám) thay vì thay bằng ảnh phong cảnh không liên quan.
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded hover:bg-rose-600 transition-colors opacity-90 group-hover:opacity-100 cursor-pointer"
                      title="Xóa ảnh"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Lời cam kết xanh & Thời hạn 14 ngày */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-md flex items-start gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p>Đánh giá của bạn sẽ giúp cộng đồng du khách tiếp cận dịch vụ chân thực.</p>
              <p className="mt-0.5 font-semibold text-emerald-900">
                Quy định: Bạn có quyền gửi hoặc chỉnh sửa đánh giá trong vòng 14 ngày kể từ khi trả phòng.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white cta cta-coral active:translate-y-0.5 rounded-md transition-all shadow-md shadow-orange-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>{isEditMode ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
