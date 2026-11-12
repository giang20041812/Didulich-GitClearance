import axios from 'axios';
import type { PartnerReviewDto } from '@/types/partner';

const API = '/api/v1/partner/reviews';
const config = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('portal_token') ?? ''}` } });

/** UC-NCC-09: đánh giá của khách về Homestay mình quản lý và phản hồi công khai. */
export const partnerReviewService = {
  async list(placeId?: number) {
    return (await axios.get<PartnerReviewDto[]>(API, { ...config(), params: placeId ? { placeId } : undefined })).data;
  },
  async reply(id: number, reply: string) {
    return (await axios.put<PartnerReviewDto>(`${API}/${id}/reply`, { reply }, config())).data;
  },
  async removeReply(id: number) {
    return (await axios.delete<PartnerReviewDto>(`${API}/${id}/reply`, config())).data;
  },
};
