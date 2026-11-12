import { CATEGORY_KIND_LABEL, EXPLORE_CATEGORY_INFO, SERVICE_GROUP_INFO, exploreCategoryOf, type CategoryKind, type ServiceGroup } from '../domain/enums.js';
import type { PlaceRow } from '../repositories/placeRepo.js';

/** Nhãn loại địa điểm cho khách và điều kiện "khách mở được trang địa điểm" — dùng chung cho gợi ý quanh đây và combo. */

/** Nhóm dịch vụ (Xe khách liên tỉnh…) nếu có, không thì loại địa điểm (Homestay, Ăn uống, Tham quan…). */
export function label(kind: CategoryKind | null | undefined, serviceGroup: ServiceGroup | null | undefined): string | null {
  if (serviceGroup) return SERVICE_GROUP_INFO[serviceGroup].label;
  if (!kind) return null;
  if (kind === 'HOMESTAY') return 'Homestay';
  const category = exploreCategoryOf(kind);
  return category ? EXPLORE_CATEGORY_INFO[category].label : CATEGORY_KIND_LABEL[kind];
}

/** Khách mở được trang địa điểm: chưa xóa, đang hiển thị, đã duyệt. */
export function isPublic(place: Pick<PlaceRow, 'isDeleted' | 'visibility' | 'approvalStatus'> | null | undefined): boolean {
  return !!place && place.isDeleted !== true && place.visibility === 'PUBLISHED' && place.approvalStatus === 'APPROVED';
}
