import { useState } from 'react';
import type { JourneyView } from '@/types/journey';
import { getApiErrorMessage } from '@/lib/apiError';
import { publishJourney, unpublishJourney } from '@/services/journeyService';

/**
 * Đăng / gỡ lịch trình ở mục Khám phá (trang Lịch trình). Đăng tự tạo link chia sẻ nếu chưa có (máy chủ trả mã chia sẻ) nên
 * cập nhật cả shareToken; gỡ bài giữ nguyên link chia sẻ. Lịch trình chưa có điểm nào thì máy chủ từ chối đăng.
 */
export function usePublishJourney(journey: JourneyView, onChange: (journey: JourneyView) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const published = !!journey.publishedAt;

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const { shareToken, publishedAt } = await publishJourney(journey.id);
      onChange({ ...journey, shareToken, publishedAt });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa đăng công khai được. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    setError('');
    try {
      await unpublishJourney(journey.id);
      // Trạng thái Admin ẩn bài vẫn giữ trên máy chủ (đăng lại vẫn bị ẩn) — chỉ bỏ thời điểm đăng.
      onChange({ ...journey, publishedAt: null });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chưa gỡ được khỏi mục Khám phá. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  return { published, busy, error, publish, unpublish, toggle: () => (published ? unpublish() : publish()) };
}
