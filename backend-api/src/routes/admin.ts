import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  ACTOR_TYPES,
  BOOKING_NOTE_KINDS,
  BOOKING_NOTE_OUTCOMES,
  BOOKING_STATUSES,
  CATEGORY_KINDS,
  CHANGE_REQUEST_STATUSES,
  CHANGE_TARGET_TYPES,
  EMERGENCY_CONTACT_TYPES,
  PLACE_VERIFICATION_STATUSES,
  PLACE_VISIBILITIES,
  PROVIDER_APPLICATION_STATUSES,
  PROVIDER_SERVICE_TYPES,
  PROVIDER_STATUSES,
  REVIEW_STATUSES,
  SOS_REQUEST_TYPES,
} from '../domain/enums.js';
import { IllegalArgumentError } from '../lib/errors.js';
import { errorStyle } from '../lib/errorHandler.js';
import {
  BadParamError,
  boolParam,
  dateParam,
  enumListParam,
  enumParam,
  intParam,
  intParamOr,
  listParam,
  optionalBody,
  parseBody,
  pathId,
  required,
  strParam,
  unauthorizedAccount,
} from '../lib/http.js';
import { int, num, optText, text, whenMissing } from '../lib/validation.js';
import { preAuthorize } from '../security/methodSecurity.js';
import { hasAuthority } from '../security/principal.js';
import * as accountsAdmin from '../services/adminAccountService.js';
import * as auditAdmin from '../services/adminAuditLogService.js';
import * as bookingAdmin from '../services/adminBookingService.js';
import * as cashflow from '../services/adminCashflowService.js';
import * as dashboard from '../services/adminDashboardService.js';
import * as finance from '../services/adminFinanceService.js';
import * as homestayViews from '../services/adminHomestayViewService.js';
import * as placesAdmin from '../services/adminPlaceService.js';
import * as adminMedia from '../services/adminMediaService.js';
import * as providersAdmin from '../services/adminProviderService.js';
import * as reports from '../services/adminReportService.js';
import * as reviewsAdmin from '../services/adminReviewService.js';
import * as roomCalendar from '../services/adminRoomCalendarService.js';
import * as sosAdmin from '../services/adminSosService.js';
import * as travelersAdmin from '../services/adminTravelerService.js';
import * as changeRequests from '../services/changeRequestService.js';
import * as stays from '../services/bookingStayService.js';
import * as showcase from '../services/placeShowcaseService.js';
import * as activity from '../services/travelerActivityService.js';
import type { Action } from '../services/bookingWorkflowService.js';
import { mountNotificationRoutes } from './notificationRoutes.js';

/**
 * Cổng quản trị (/api/v1/admin/**). Phân quyền theo đường dẫn nằm ở security/accessRules.ts (SecurityConfig); ở đây chỉ còn
 * @PreAuthorize mức controller. Kiểu thân lỗi theo từng controller của bản Java: 'admin' (AdminExceptionHandler) cho tài khoản,
 * đơn, báo cáo, tài chính, tổng quan, SOS, nhật ký, yêu cầu thay đổi, hồ sơ NCC, dòng tiền, đánh giá, thông báo; 'adminLocal'
 * cho điểm đến, NCC, khách (@ExceptionHandler riêng); còn lại 'default'.
 */
export const adminRouter = Router();

const admin = errorStyle('admin');
const local = errorStyle('adminLocal');
const plain = errorStyle('default');

const BASE = '/api/v1/admin';
const callerId = (req: Request): number | null => req.principal?.accountId ?? null;
const callerIdRequired = (req: Request): number => {
  const id = req.principal?.accountId;
  if (id == null) throw unauthorizedAccount();
  return id;
};

// ---- Khối dựng schema ------------------------------------------------------------------------------------------------------------

const notNull = (message: string) => whenMissing(message);
const SIZE_500 = 'size must be between 0 and 500';
const note500 = optText({ max: [500, SIZE_500] });
const strOrNull = z.string().nullish();
const idList = z.array(z.number().int()).nullish();
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const createAdminAccount = z.object({
  email: text({ notBlank: 'Email không được để trống', pattern: [EMAIL, 'Email không đúng định dạng'] }),
  phone: text({ notBlank: 'Số điện thoại không được để trống' }),
  password: text({ notBlank: 'Mật khẩu không được để trống', min: [6, 'Mật khẩu tối thiểu 6 ký tự'] }),
  fullName: text({ notBlank: 'Họ tên không được để trống' }),
  adminLevel: z.number().int().nullish(),
});
const updateAccount = z.object({ email: optText({ pattern: [EMAIL, 'Email không đúng định dạng'] }), phone: strOrNull, fullName: strOrNull });
const updateAccountStatus = z.object({ status: z.enum(ACCOUNT_STATUSES, notNull('Trạng thái không được để trống')), reason: strOrNull });
const updateAccountRole = z.object({
  role: z.enum(ACCOUNT_ROLES, notNull('Quyền mới không được để trống')),
  providerId: z.number().int().nullish(),
  reason: text({ notBlank: 'Vui lòng nhập lý do đổi quyền', max: [500, 'Lý do tối đa 500 ký tự'] }),
});
const updateAdminLevel = z.object({
  adminLevel: int({ required: 'Cấp quản trị không được để trống' }),
  reason: optText({ max: [500, 'Lý do tối đa 500 ký tự'] }),
});
const resetPassword = z.object({
  newPassword: text({ notBlank: 'Mật khẩu mới không được để trống', min: [6, 'Mật khẩu mới tối thiểu 6 ký tự'] }),
  reason: strOrNull,
});
const approveInput = z.object({ note: note500 });
const rejectInput = z.object({ reason: text({ notBlank: 'Vui lòng nhập lý do từ chối.', max: [500, SIZE_500] }) });
const actionInput = z.object({ note: note500 });
const noteRequest = z.object({ kind: z.enum(BOOKING_NOTE_KINDS).nullish(), outcome: z.enum(BOOKING_NOTE_OUTCOMES).nullish(), content: strOrNull });
const rejectRefund = z.object({ reason: text({ notBlank: 'Lý do từ chối là bắt buộc', max: [500, SIZE_500] }) });
const createAffiliateLink = z.object({
  accountId: int({ required: 'accountId là bắt buộc' }),
  code: text({ notBlank: 'Code affiliate là bắt buộc', max: [64, 'size must be between 0 and 64'] }),
  commissionRate: num({ required: 'Tỷ lệ hoa hồng là bắt buộc', min: [0.0001, 'Tỷ lệ hoa hồng phải > 0'], max: [1, 'Tỷ lệ hoa hồng phải <= 100%'] }),
});
const createProvider = z.object({
  name: text({ notBlank: 'Tên cơ sở/đối tác không được để trống' }),
  contactName: strOrNull,
  contactPhone: strOrNull,
  contactEmail: strOrNull,
  address: strOrNull,
  note: strOrNull,
  serviceType: z.enum(PROVIDER_SERVICE_TYPES).nullish(),
  accountEmail: text({ notBlank: 'Email tài khoản NCC không được để trống', pattern: [EMAIL, 'Email tài khoản không đúng định dạng'] }),
  accountPhone: strOrNull,
  accountPassword: text({ notBlank: 'Mật khẩu không được để trống', min: [6, 'Mật khẩu tối thiểu 6 ký tự'] }),
  accountFullName: text({ notBlank: 'Họ tên người đại diện không được để trống' }),
});
const updateProvider = z.object({
  name: text({ notBlank: 'Tên cơ sở/đối tác không được để trống' }),
  contactName: strOrNull,
  contactPhone: strOrNull,
  contactEmail: strOrNull,
  address: strOrNull,
  note: strOrNull,
  serviceType: z.enum(PROVIDER_SERVICE_TYPES).nullish(),
});
const updateProviderStatus = z.object({ status: z.enum(PROVIDER_STATUSES, notNull('Trạng thái không được để trống')), reason: strOrNull });
const updatePlaceVerification = z.object({ verification: z.enum(PLACE_VERIFICATION_STATUSES, notNull('Trạng thái xác thực không được để trống')), reason: strOrNull });
const updatePlaceDataVerified = z.object({ dataVerified: z.boolean(notNull('Trạng thái xác thực dữ liệu không được để trống')), reason: strOrNull });
const updatePlaceVisibility = z.object({ visibility: z.enum(PLACE_VISIBILITIES, notNull('Trạng thái hiển thị không được để trống')), reason: strOrNull });
const bulkVerification = z.object({ ids: idList, verification: z.enum(PLACE_VERIFICATION_STATUSES).nullish(), reason: strOrNull });
const deletePlaces = z.object({ ids: idList, reason: strOrNull });
const moderate = z.object({
  action: z.enum(reviewsAdmin.MODERATION_ACTIONS, notNull('Vui lòng chọn cách xử lý')),
  reason: optText({ max: [500, 'Lý do tối đa 500 ký tự'] }),
});
const bulkApprove = z.object({
  ids: z.array(z.number().int(), notNull('Vui lòng chọn ít nhất một hồ sơ.')).min(1, 'Vui lòng chọn ít nhất một hồ sơ.'),
  note: note500,
});
const bulkReject = z.object({
  ids: z.array(z.number().int(), notNull('Vui lòng chọn ít nhất một hồ sơ.')).min(1, 'Vui lòng chọn ít nhất một hồ sơ.'),
  reason: text({ notBlank: 'Vui lòng nhập lý do từ chối.', max: [500, SIZE_500] }),
});
const dispatchSos = z.object({
  assignedContactId: int({ required: 'Đầu mối liên hệ khẩn cấp là bắt buộc' }),
  note: note500,
});
const createContact = z.object({
  regionId: z.number().int().nullish(),
  type: z.enum(EMERGENCY_CONTACT_TYPES, notNull('Loại đầu mối liên hệ là bắt buộc')),
  name: text({ notBlank: 'Tên đầu mối liên hệ là bắt buộc', max: [255, 'size must be between 0 and 255'] }),
  phone: text({ notBlank: 'Số điện thoại là bắt buộc', max: [32, 'size must be between 0 and 32'] }),
  address: optText({ max: [500, SIZE_500] }),
});
const updateContact = z.object({
  regionId: z.number().int().nullish(),
  type: z.enum(EMERGENCY_CONTACT_TYPES).nullish(),
  name: optText({ max: [255, 'size must be between 0 and 255'] }),
  phone: optText({ max: [32, 'size must be between 0 and 32'] }),
  address: optText({ max: [500, SIZE_500] }),
  isActive: z.boolean().nullish(),
});
const publicSos = z.object({
  requesterName: text({ notBlank: 'Tên người yêu cầu là bắt buộc', max: [255, 'size must be between 0 and 255'] }),
  requesterPhone: text({ notBlank: 'Số điện thoại là bắt buộc', max: [32, 'size must be between 0 and 32'] }),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  type: z.enum(SOS_REQUEST_TYPES, notNull('Loại tình huống khẩn cấp là bắt buộc')),
  description: optText({ max: [2000, 'size must be between 0 and 2000'] }),
});

// ---- Tài khoản -----------------------------------------------------------------------------------------------------------------

const ACCOUNTS = `${BASE}/accounts`;

adminRouter.get(ACCOUNTS, admin, async (req, res) => {
  res.json(
    await accountsAdmin.getAccounts(
      enumParam(req.query.role, ACCOUNT_ROLES),
      enumParam(req.query.status, ACCOUNT_STATUSES),
      strParam(req.query.keyword),
      enumParam(req.query.providerStatus, PROVIDER_STATUSES),
      dateParam(req.query.createdFrom),
      dateParam(req.query.createdTo),
      strParam(req.query.sortBy) ?? 'createdAt',
      strParam(req.query.sortDir) ?? 'desc',
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

// Thông tin và cấp của chính mình (mọi ADMIN) đứng trước "/:id".
adminRouter.get(`${ACCOUNTS}/me`, admin, async (req, res) => {
  res.json(await accountsAdmin.me(callerId(req)));
});

adminRouter.get(`${ACCOUNTS}/:id`, admin, async (req, res) => {
  res.json(await accountsAdmin.getAccountById(pathId(req)));
});

adminRouter.post(ACCOUNTS, admin, async (req, res) => {
  res.status(201).json(await accountsAdmin.createAdminAccount(parseBody(createAdminAccount, req.body), callerId(req)));
});

adminRouter.put(`${ACCOUNTS}/:id`, admin, async (req, res) => {
  res.json(await accountsAdmin.updateAccount(pathId(req), parseBody(updateAccount, req.body), callerId(req)));
});

adminRouter.patch(`${ACCOUNTS}/:id/status`, admin, async (req, res) => {
  res.json(await accountsAdmin.updateAccountStatus(pathId(req), parseBody(updateAccountStatus, req.body), callerId(req)));
});

adminRouter.patch(`${ACCOUNTS}/:id/role`, admin, async (req, res) => {
  res.json(await accountsAdmin.updateAccountRole(pathId(req), parseBody(updateAccountRole, req.body), callerId(req)));
});

adminRouter.patch(`${ACCOUNTS}/:id/admin-level`, admin, async (req, res) => {
  res.json(await accountsAdmin.updateAdminLevel(pathId(req), parseBody(updateAdminLevel, req.body), callerId(req)));
});

adminRouter.patch(`${ACCOUNTS}/:id/reset-password`, admin, async (req, res) => {
  await accountsAdmin.resetPassword(pathId(req), parseBody(resetPassword, req.body), callerId(req));
  res.status(204).end();
});

/** Xóa hẳn tài khoản Admin / NCC (chỉ cấp 1). Không tự xóa mình, không xóa Admin cấp 1 cuối cùng. */
adminRouter.delete(`${ACCOUNTS}/:id`, admin, async (req, res) => {
  const reason = required(strParam(req.query.reason));
  await accountsAdmin.deleteAccount(pathId(req), reason, callerId(req));
  res.status(204).end();
});

// ---- Audit log -----------------------------------------------------------------------------------------------------------------

adminRouter.get(`${BASE}/audit-logs`, admin, async (req, res) => {
  res.json(
    await auditAdmin.search({
      from: dateParam(req.query.from),
      to: dateParam(req.query.to),
      actor: enumParam(req.query.actor, ACTOR_TYPES),
      actorId: intParam(req.query.actorId),
      action: strParam(req.query.action),
      entityType: strParam(req.query.entityType),
      entityId: intParam(req.query.entityId),
      result: strParam(req.query.result),
      keyword: strParam(req.query.keyword),
      actionCodes: listParam(req.query.actionCodes),
      page: intParamOr(req.query.page, 0),
      size: intParamOr(req.query.size, 20),
    }),
  );
});

adminRouter.get(`${BASE}/audit-logs/:id`, admin, async (req, res) => {
  res.json(await auditAdmin.detail(pathId(req)));
});

// ---- Đơn đặt phòng ---------------------------------------------------------------------------------------------------------------

const BOOKINGS = `${BASE}/bookings`;

adminRouter.get(BOOKINGS, admin, async (req, res) => {
  // status nhận một hoặc nhiều giá trị phân tách bằng dấu phẩy (vd: status=PENDING,CONFIRMED) để lọc theo nhóm.
  res.json(
    await bookingAdmin.search({
      statuses: enumListParam(req.query.status, BOOKING_STATUSES),
      keyword: strParam(req.query.keyword),
      guest: strParam(req.query.guest),
      place: strParam(req.query.place),
      placeId: intParam(req.query.placeId),
      providerId: intParam(req.query.providerId),
      checkInFrom: dateParam(req.query.checkInFrom),
      checkInTo: dateParam(req.query.checkInTo),
      createdFrom: dateParam(req.query.createdFrom),
      createdTo: dateParam(req.query.createdTo),
      sortBy: strParam(req.query.sortBy) ?? 'createdAt',
      sortDir: strParam(req.query.sortDir) ?? 'desc',
      page: intParamOr(req.query.page, 0),
      size: intParamOr(req.query.size, 20),
    }),
  );
});

adminRouter.get(`${BOOKINGS}/summary`, admin, async (_req, res) => {
  res.json(await bookingAdmin.countByStatus());
});

adminRouter.get(`${BOOKINGS}/:id`, admin, async (req, res) => {
  res.json(await bookingAdmin.monitorDetail(pathId(req)));
});

/** Ghi nhận thông tin xác minh / kết quả giám sát (FR-AD-09, FR-AD-10). */
adminRouter.post(`${BOOKINGS}/:id/notes`, admin, async (req, res) => {
  const body = parseBody(noteRequest, req.body);
  res.status(201).json(await bookingAdmin.addNote(pathId(req), body.kind, body.outcome, body.content, callerId(req)));
});

const BOOKING_ACTIONS: Array<[string, Action]> = [
  ['confirm', 'CONFIRM'],
  ['reject', 'REJECT'],
  ['pay', 'PAY'],
  ['cancel', 'CANCEL'],
  ['check-in', 'CHECK_IN'],
];
for (const [path, action] of BOOKING_ACTIONS) {
  adminRouter.post(`${BOOKINGS}/:id/${path}`, admin, async (req, res) => {
    const raw = optionalBody(req);
    const input = raw === undefined ? undefined : parseBody(actionInput, raw);
    res.json(await bookingAdmin.act(pathId(req), action, input?.note, callerId(req)));
  });
}

// ---- Dòng tiền & tài chính ----------------------------------------------------------------------------------------------------------

adminRouter.get(`${BASE}/finance/cashflow`, admin, async (req, res) => {
  res.json(
    await cashflow.report(
      dateParam(req.query.from),
      dateParam(req.query.to),
      enumParam(req.query.level, cashflow.CASHFLOW_LEVELS) ?? 'PROVIDER',
      intParam(req.query.providerId),
      strParam(req.query.keyword),
      strParam(req.query.sortBy) ?? 'net',
      strParam(req.query.sortDir) ?? 'desc',
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

const FINANCE = `${BASE}/finance`;

adminRouter.get(`${FINANCE}/revenue-summary`, admin, async (_req, res) => {
  res.json(await finance.getRevenueSummary());
});

adminRouter.get(`${FINANCE}/refunds`, admin, async (req, res) => {
  const pendingOnly = boolParam(req.query.pendingOnly) ?? true;
  res.json(pendingOnly ? await finance.getPendingRefunds() : await finance.getAllRefunds());
});

adminRouter.post(`${FINANCE}/refunds/:id/approve`, admin, async (req, res) => {
  res.json(await finance.approveRefund(pathId(req), callerIdRequired(req)));
});

adminRouter.post(`${FINANCE}/refunds/:id/reject`, admin, async (req, res) => {
  const body = parseBody(rejectRefund, req.body);
  res.json(await finance.rejectRefund(pathId(req), callerIdRequired(req), body.reason));
});

adminRouter.get(`${FINANCE}/affiliate-links`, admin, async (_req, res) => {
  res.json(await finance.getAffiliateLinks());
});

adminRouter.post(`${FINANCE}/affiliate-links`, admin, async (req, res) => {
  res.status(201).json(await finance.createAffiliateLink(parseBody(createAffiliateLink, req.body), callerId(req)));
});

adminRouter.delete(`${FINANCE}/affiliate-links/:id`, admin, async (req, res) => {
  await finance.deactivateAffiliateLink(pathId(req), callerId(req));
  res.status(204).end();
});

adminRouter.get(`${FINANCE}/commissions`, admin, async (_req, res) => {
  res.json(await finance.getCommissionSummary());
});

// ---- Yêu cầu thay đổi của NCC -------------------------------------------------------------------------------------------------------

const CHANGES = `${BASE}/change-requests`;

adminRouter.get(CHANGES, admin, async (req, res) => {
  res.json(
    await changeRequests.search(
      enumParam(req.query.status, CHANGE_REQUEST_STATUSES),
      intParam(req.query.providerId),
      intParam(req.query.placeId),
      enumParam(req.query.targetType, CHANGE_TARGET_TYPES),
      strParam(req.query.keyword),
      dateParam(req.query.from),
      dateParam(req.query.to),
      strParam(req.query.sortDir) ?? 'desc',
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

adminRouter.get(`${CHANGES}/summary`, admin, async (_req, res) => {
  res.json({ pending: await changeRequests.pendingCount() });
});

adminRouter.get(`${CHANGES}/:id`, admin, async (req, res) => {
  res.json(await changeRequests.presentDetail(pathId(req)));
});

adminRouter.post(`${CHANGES}/:id/approve`, admin, async (req, res) => {
  const raw = optionalBody(req);
  const input = raw === undefined ? undefined : parseBody(approveInput, raw);
  res.json(await changeRequests.approve(pathId(req), callerIdRequired(req), input?.note));
});

adminRouter.post(`${CHANGES}/:id/reject`, admin, async (req, res) => {
  res.json(await changeRequests.reject(pathId(req), callerIdRequired(req), parseBody(rejectInput, req.body).reason));
});

/** Xem xét lại yêu cầu đã từ chối: đưa về Chờ duyệt (ghi chú tùy chọn, lưu vào Audit Log). */
adminRouter.post(`${CHANGES}/:id/reopen`, admin, async (req, res) => {
  const raw = optionalBody(req);
  const input = raw === undefined ? undefined : parseBody(approveInput, raw);
  res.json(await changeRequests.reopen(pathId(req), callerIdRequired(req), input?.note));
});

// ---- Tổng quan -----------------------------------------------------------------------------------------------------------------

/**
 * Số đếm cho huy hiệu thanh bên trong MỘT lượt gọi. Hàng đợi hồ sơ NCC / yêu cầu thay đổi chỉ trả cho từ cấp 2 (giống accessRules);
 * cấp 3 nhận null.
 */
adminRouter.get(`${BASE}/dashboard/nav-counts`, admin, async (req, res) => {
  const queues = hasAuthority(req.principal, 'ADMIN_L2');
  res.json({
    bookings: await bookingAdmin.countByStatus(),
    pendingApplications: queues ? await providersAdmin.pendingApplicationCount() : null,
    pendingChanges: queues ? await changeRequests.pendingCount() : null,
    pendingSos: await dashboard.pendingSosCount(),
  });
});

adminRouter.get(`${BASE}/dashboard/summary`, admin, async (_req, res) => {
  res.json(await dashboard.getSummary());
});

adminRouter.get(`${BASE}/dashboard/activity`, admin, async (req, res) => {
  res.json(await dashboard.recentActivity(intParamOr(req.query.limit, 8)));
});

// ---- Báo cáo -------------------------------------------------------------------------------------------------------------------

adminRouter.get(`${BASE}/reports/overview`, admin, async (req, res) => {
  res.json(await reports.overview(dateParam(req.query.from), dateParam(req.query.to), intParam(req.query.providerId), strParam(req.query.group) ?? 'ALL'));
});

// ---- Đánh giá ------------------------------------------------------------------------------------------------------------------

adminRouter.get(`${BASE}/reviews`, admin, async (req, res) => {
  res.json(
    await reviewsAdmin.search({
      status: enumParam(req.query.status, REVIEW_STATUSES),
      processed: boolParam(req.query.processed),
      placeId: intParam(req.query.placeId),
      providerId: intParam(req.query.providerId),
      rating: intParam(req.query.rating),
      keyword: strParam(req.query.keyword),
      from: dateParam(req.query.from),
      to: dateParam(req.query.to),
      page: intParamOr(req.query.page, 0),
      size: intParamOr(req.query.size, 20),
    }),
  );
});

adminRouter.get(`${BASE}/reviews/:id`, admin, async (req, res) => {
  res.json(await reviewsAdmin.detail(pathId(req)));
});

adminRouter.post(`${BASE}/reviews/:id/moderate`, admin, async (req, res) => {
  const body = parseBody(moderate, req.body);
  res.json(await reviewsAdmin.moderate(pathId(req), callerIdRequired(req), body.action, body.reason));
});

// ---- Hồ sơ đăng ký NCC ----------------------------------------------------------------------------------------------------------------

const APPLICATIONS = `${BASE}/provider-applications`;

adminRouter.get(APPLICATIONS, admin, async (req, res) => {
  res.json(
    await providersAdmin.searchApplications(
      enumParam(req.query.status, PROVIDER_APPLICATION_STATUSES),
      enumParam(req.query.serviceType, PROVIDER_SERVICE_TYPES),
      strParam(req.query.keyword),
      dateParam(req.query.from),
      dateParam(req.query.to),
      strParam(req.query.sortDir) ?? 'desc',
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

adminRouter.get(`${APPLICATIONS}/summary`, admin, async (_req, res) => {
  res.json({ pending: await providersAdmin.pendingApplicationCount() });
});

adminRouter.get(`${APPLICATIONS}/:id`, admin, async (req, res) => {
  res.json(await providersAdmin.applicationDetail(pathId(req)));
});

/** Hình ảnh, tiện nghi, chính sách lưu trú của hồ sơ (lấy từ Homestay của đối tác khi hồ sơ đã được duyệt). */
adminRouter.get(`${APPLICATIONS}/:id/showcase`, admin, async (req, res) => {
  res.json(await showcase.forApplication(pathId(req)));
});

adminRouter.post(`${APPLICATIONS}/:id/approve`, admin, async (req, res) => {
  const raw = optionalBody(req);
  const input = raw === undefined ? undefined : parseBody(approveInput, raw);
  res.json(await providersAdmin.approveApplication(pathId(req), callerIdRequired(req), input?.note));
});

adminRouter.post(`${APPLICATIONS}/:id/reject`, admin, async (req, res) => {
  res.json(await providersAdmin.rejectApplication(pathId(req), callerIdRequired(req), parseBody(rejectInput, req.body).reason));
});

adminRouter.post(`${APPLICATIONS}/:id/reopen`, admin, async (req, res) => {
  const raw = optionalBody(req);
  const input = raw === undefined ? undefined : parseBody(approveInput, raw);
  res.json(await providersAdmin.reopenApplication(pathId(req), callerIdRequired(req), input?.note));
});

adminRouter.post(`${APPLICATIONS}/bulk-approve`, admin, async (req, res) => {
  const body = parseBody(bulkApprove, req.body);
  const adminId = callerIdRequired(req);
  res.json(await providersAdmin.runBulk(body.ids, (id) => providersAdmin.approveApplication(id, adminId, body.note)));
});

adminRouter.post(`${APPLICATIONS}/bulk-reject`, admin, async (req, res) => {
  const body = parseBody(bulkReject, req.body);
  const adminId = callerIdRequired(req);
  res.json(await providersAdmin.runBulk(body.ids, (id) => providersAdmin.rejectApplication(id, adminId, body.reason)));
});

// ---- Đối tác NCC -----------------------------------------------------------------------------------------------------------------

const PROVIDERS = `${BASE}/providers`;

adminRouter.get(PROVIDERS, local, async (req, res) => {
  res.json(await providersAdmin.getProviders(enumParam(req.query.status, PROVIDER_STATUSES)));
});

adminRouter.get(`${PROVIDERS}/:id/accounts`, local, async (req, res) => {
  res.json(await providersAdmin.getProviderAccounts(pathId(req)));
});

adminRouter.get(`${PROVIDERS}/:id`, local, async (req, res) => {
  res.json(await providersAdmin.getProviderById(pathId(req)));
});

adminRouter.post(PROVIDERS, local, async (req, res) => {
  res.status(201).json(await providersAdmin.createProviderWithAccount(parseBody(createProvider, req.body), callerId(req)));
});

adminRouter.put(`${PROVIDERS}/:id`, local, async (req, res) => {
  res.json(await providersAdmin.updateProvider(pathId(req), parseBody(updateProvider, req.body), callerId(req)));
});

adminRouter.patch(`${PROVIDERS}/:id/status`, local, async (req, res) => {
  res.json(await providersAdmin.updateProviderStatus(pathId(req), parseBody(updateProviderStatus, req.body), callerId(req)));
});

// ---- Điểm đến ------------------------------------------------------------------------------------------------------------------

const PLACES = `${BASE}/places`;

adminRouter.get(PLACES, local, async (req, res) => {
  res.json(
    await placesAdmin.getPlaces(
      {
        keyword: strParam(req.query.keyword),
        visibility: enumParam(req.query.visibility, PLACE_VISIBILITIES),
        verification: enumParam(req.query.verification, PLACE_VERIFICATION_STATUSES),
        dataVerified: boolParam(req.query.dataVerified),
        kind: enumParam(req.query.kind, CATEGORY_KINDS),
        providerId: intParam(req.query.providerId),
        regionId: intParam(req.query.regionId),
        createdFrom: dateParam(req.query.createdFrom),
        createdTo: dateParam(req.query.createdTo),
      },
      strParam(req.query.sortBy) ?? 'createdAt',
      strParam(req.query.sortDir) ?? 'desc',
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

adminRouter.get(`${PLACES}/summary`, local, async (_req, res) => {
  res.json(await placesAdmin.countByVerification());
});

adminRouter.patch(`${PLACES}/verification/bulk`, local, async (req, res) => {
  const body = parseBody(bulkVerification, req.body);
  res.json({ updated: await placesAdmin.bulkUpdateVerification(body.ids ?? null, body.verification, body.reason, callerId(req)) });
});

/** Xóa mềm một hoặc nhiều điểm đến (chỉ Admin cấp 1, bắt buộc lý do). */
adminRouter.post(`${PLACES}/delete`, local, async (req, res) => {
  const body = parseBody(deletePlaces, req.body);
  res.json({ deleted: await placesAdmin.deletePlaces(body.ids ?? null, body.reason, callerId(req)) });
});

adminRouter.get(`${PLACES}/:id/checkin-qr`, local, async (req, res) => {
  res.json(await stays.qrFor(pathId(req)));
});

adminRouter.get(`${PLACES}/:id/showcase`, local, async (req, res) => {
  res.json(await showcase.forPlace(pathId(req)));
});

adminRouter.get(`${PLACES}/:id`, local, async (req, res) => {
  res.json(await placesAdmin.getPlaceById(pathId(req)));
});

adminRouter.patch(`${PLACES}/:id/verification`, local, async (req, res) => {
  res.json(await placesAdmin.updateVerification(pathId(req), parseBody(updatePlaceVerification, req.body), callerId(req)));
});

/** Bật / tắt cờ "dữ liệu đã xác thực" (độc lập với /verification là quy trình duyệt nội dung). */
adminRouter.patch(`${PLACES}/:id/data-verified`, local, async (req, res) => {
  res.json(await placesAdmin.updateDataVerified(pathId(req), parseBody(updatePlaceDataVerified, req.body), callerId(req)));
});

adminRouter.patch(`${PLACES}/:id/visibility`, local, async (req, res) => {
  res.json(await placesAdmin.updateVisibility(pathId(req), parseBody(updatePlaceVisibility, req.body), callerId(req)));
});

// ---- Ảnh điểm đến (admin) -----------------------------------------------------------------------------------------------------

const attachMediaInput = z.object({
  imageId: z.string().min(1).max(500),
  url: z.string().min(1).max(1000),
  caption: z.string().max(500).nullish(),
});

adminRouter.post(`${BASE}/media/upload-config`, local, async (_req, res) => {
  res.json(adminMedia.uploadConfig());
});

adminRouter.get(`${PLACES}/:id/media`, local, async (req, res) => {
  res.json(await adminMedia.listMedia(pathId(req)));
});

adminRouter.post(`${PLACES}/:id/media`, local, async (req, res) => {
  const body = parseBody(attachMediaInput, req.body);
  res.json(await adminMedia.attachMedia(pathId(req), body.imageId, body.url, body.caption));
});

adminRouter.delete(`${PLACES}/:id/media/:mediaId`, local, async (req, res) => {
  res.json(await adminMedia.removeMedia(pathId(req), pathId(req, 'mediaId')));
});

adminRouter.patch(`${PLACES}/:id/media/:mediaId/cover`, local, async (req, res) => {
  res.json(await adminMedia.setCover(pathId(req), pathId(req, 'mediaId')));
});

// ---- Lịch phòng ----------------------------------------------------------------------------------------------------------------

const CALENDAR = `${BASE}/room-calendar`;

adminRouter.get(`${CALENDAR}/homestays`, plain, async (_req, res) => {
  res.json(await roomCalendar.homestays());
});

adminRouter.get(`${CALENDAR}/homestays/:placeId/units`, plain, async (req, res) => {
  res.json(await roomCalendar.units(pathId(req, 'placeId'), required(dateParam(req.query.startDate)), required(dateParam(req.query.endDate))));
});

adminRouter.get(CALENDAR, plain, async (req, res) => {
  res.json(await roomCalendar.calendar(required(dateParam(req.query.startDate)), required(dateParam(req.query.endDate))));
});

// ---- SOS & đầu mối khẩn cấp --------------------------------------------------------------------------------------------------------

adminRouter.get(`${BASE}/sos-requests`, admin, async (req, res) => {
  res.json(await sosAdmin.getSosRequests(strParam(req.query.status)));
});

adminRouter.get(`${BASE}/sos-requests/:id`, admin, async (req, res) => {
  res.json(await sosAdmin.getSosRequest(pathId(req)));
});

adminRouter.post(`${BASE}/sos-requests/:id/dispatch`, admin, async (req, res) => {
  res.json(await sosAdmin.dispatch(pathId(req), parseBody(dispatchSos, req.body), callerId(req)));
});

adminRouter.post(`${BASE}/sos-requests/:id/resolve`, admin, async (req, res) => {
  res.json(await sosAdmin.resolve(pathId(req), callerId(req)));
});

adminRouter.post(`${BASE}/sos-requests/:id/cancel`, admin, async (req, res) => {
  res.json(await sosAdmin.cancel(pathId(req), callerId(req)));
});

adminRouter.get(`${BASE}/emergency-contacts`, admin, async (req, res) => {
  res.json(await sosAdmin.getEmergencyContacts(boolParam(req.query.activeOnly) ?? false));
});

adminRouter.get(`${BASE}/emergency-contacts/:id`, admin, async (req, res) => {
  res.json(await sosAdmin.getEmergencyContact(pathId(req)));
});

adminRouter.post(`${BASE}/emergency-contacts`, admin, async (req, res) => {
  res.status(201).json(await sosAdmin.createEmergencyContact(parseBody(createContact, req.body), callerId(req)));
});

adminRouter.put(`${BASE}/emergency-contacts/:id`, admin, async (req, res) => {
  res.json(await sosAdmin.updateEmergencyContact(pathId(req), parseBody(updateContact, req.body), callerId(req)));
});

adminRouter.delete(`${BASE}/emergency-contacts/:id`, admin, async (req, res) => {
  await sosAdmin.deleteEmergencyContact(pathId(req), callerId(req));
  res.status(204).end();
});

/** Du khách gửi yêu cầu SOS/cứu hộ khẩn cấp — không cần đăng nhập (/api/public/** là permitAll). */
adminRouter.post('/api/public/sos', plain, async (req, res) => {
  res.status(201).json(await sosAdmin.submitPublicSos(parseBody(publicSos, req.body)));
});

// ---- Khách du lịch ---------------------------------------------------------------------------------------------------------------

const TRAVELERS = `${BASE}/travelers`;

function bodyString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new BadParamError();
}

adminRouter.get(TRAVELERS, local, async (req, res) => {
  res.json(
    await travelersAdmin.search(
      enumParam(req.query.status, ACCOUNT_STATUSES),
      strParam(req.query.keyword),
      strParam(req.query.signupMethod),
      dateParam(req.query.createdFrom),
      dateParam(req.query.createdTo),
      strParam(req.query.sortBy) ?? 'createdAt',
      strParam(req.query.sortDir) ?? 'desc',
      intParamOr(req.query.page, 0),
      intParamOr(req.query.size, 20),
    ),
  );
});

adminRouter.post(TRAVELERS, local, async (req, res) => {
  const body = parseBody(z.record(z.unknown()), req.body);
  res
    .status(201)
    .json(await travelersAdmin.create(bodyString(body, 'fullName'), bodyString(body, 'email'), bodyString(body, 'phone'), bodyString(body, 'password'), callerId(req)));
});

adminRouter.patch(`${TRAVELERS}/:id/status`, local, async (req, res) => {
  const body = parseBody(z.record(z.unknown()), req.body);
  const raw = bodyString(body, 'status') ?? '';
  if (!(ACCOUNT_STATUSES as readonly string[]).includes(raw)) throw new IllegalArgumentError('Trạng thái không hợp lệ.');
  res.json(await travelersAdmin.updateStatus(pathId(req), raw as (typeof ACCOUNT_STATUSES)[number], bodyString(body, 'reason'), callerId(req)));
});

/** Xóa hẳn tài khoản khách (chỉ cấp 1); booking cũ được giữ lại. */
adminRouter.delete(`${TRAVELERS}/:id`, local, async (req, res) => {
  const reason = required(strParam(req.query.reason));
  await accountsAdmin.deleteTraveler(pathId(req), reason, callerId(req));
  res.status(204).end();
});

adminRouter.get(`${TRAVELERS}/:travelerId/activity`, plain, preAuthorize('ADMIN_L2'), async (req, res) => {
  res.json(await activity.history(pathId(req, 'travelerId'), strParam(req.query.type) ?? 'ALL', intParamOr(req.query.page, 0), intParamOr(req.query.size, 10)));
});

// ---- Lượt xem homestay -------------------------------------------------------------------------------------------------------------

function viewFilter(req: Request) {
  return { keyword: strParam(req.query.keyword), placeId: intParam(req.query.placeId), from: dateParam(req.query.from), to: dateParam(req.query.to) };
}

adminRouter.get(`${BASE}/homestay-views`, plain, preAuthorize('ADMIN_L2'), async (req, res) => {
  res.json(await homestayViews.byTraveler(viewFilter(req), intParamOr(req.query.page, 0), intParamOr(req.query.size, 20)));
});

adminRouter.get(`${BASE}/homestay-views/summary`, plain, preAuthorize('ADMIN_L2'), async (req, res) => {
  res.json(await homestayViews.summary(viewFilter(req)));
});

// ---- Thông báo ---------------------------------------------------------------------------------------------------------------------

mountNotificationRoutes(adminRouter, `${BASE}/notifications`, [admin], callerId, '/admin');

