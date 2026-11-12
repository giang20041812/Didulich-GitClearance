import { FestivalDto } from '@/types/festival';

export type { FestivalDto };

export const fetchFestivals = async (): Promise<FestivalDto[]> => {
  const response = await fetch('/api/public/festivals');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result: unknown = await response.json();
  if (Array.isArray(result)) {
    return result as FestivalDto[];
  }
  if (typeof result === 'object' && result !== null && 'data' in result) {
    const data = result.data;
    if (Array.isArray(data)) {
      return data as FestivalDto[];
    }
  }

  throw new Error('Invalid festivals response from backend');
};

/**
 * Chi tiết lễ hội (đủ phần mô tả) qua /api/public/festivals/{slug}; danh sách /api/public/festivals không còn gửi mô tả.
 * Backend cũ chưa có đường dẫn chi tiết (404) thì tìm trong danh sách — bản cũ vẫn trả đủ trường.
 */
export const fetchFestivalByIdOrSlug = async (identifier: string): Promise<FestivalDto | null> => {
  try {
    const response = await fetch(`/api/public/festivals/${encodeURIComponent(identifier)}`);
    const isJson = response.headers.get('content-type')?.includes('application/json');
    if (response.ok && isJson) return (await response.json()) as FestivalDto;
  } catch (error) {
    console.warn('Lỗi khi tải chi tiết lễ hội:', error);
  }
  try {
    const festivals = await fetchFestivals();
    const found = festivals.find(
      (f) => f.slug === identifier || f.id.toString() === identifier
    );
    if (found) return found;
  } catch (error) {
    console.warn('Lỗi khi tìm festival theo slug/id:', error);
  }
  return null;
};
