import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import {
  BookingNotFoundError,
  DuplicateFieldsError,
  HttpError,
  IllegalArgumentError,
  IllegalStateError,
  InvalidFieldsError,
  isDataIntegrityViolation,
} from './errors.js';
import { BadParamError, UnreadableBodyError, ValidationError } from './http.js';
import { logger } from './logger.js';

/**
 * Chuẩn hóa lỗi thành JSON, thay cho các @RestControllerAdvice của bản Java. Dạng thân lỗi phụ thuộc "phong cách" của
 * nhóm route (res.locals.errorStyle — đặt bởi {@link errorStyle} khi gắn router):
 *  - 'default'  : {status, errorCode, message}                      (GlobalApiExceptionHandler)
 *  - 'admin'    : {status, message}                                 (AdminExceptionHandler)
 *  - 'booking'  : {status, message}                                 (PublicBookingExceptionHandler)
 *  - 'adminLocal': IllegalArgument → 400 / IllegalState → 409 dạng {status, message} do @ExceptionHandler riêng của controller
 *                  (AdminPlace, AdminProvider, AdminTraveler); lỗi khác như 'default'
 *  - 'partner'  : {message} (+ fieldErrors khi đăng ký trùng)         (PartnerOperationErrors)
 *  - 'partnerHomestay': ResponseStatusException → {message}; lỗi khác như 'default' (PartnerHomestayController)
 * Không bao giờ trả stack trace ra ngoài.
 */

export type ErrorStyle = 'default' | 'admin' | 'adminLocal' | 'booking' | 'partner' | 'partnerHomestay';

export const errorStyle =
  (style: ErrorStyle): RequestHandler =>
  (_req, res, next) => {
    res.locals.errorStyle = style;
    next();
  };

function errorCodeOf(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 404:
      return 'Không tìm thấy tài nguyên.';
    case 429:
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
    case 503:
      return 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.';
    default:
      return status >= 500 ? 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.' : 'Yêu cầu không hợp lệ.';
  }
}

interface ErrorBody {
  status: number;
  body: Record<string, unknown>;
}

function shape(style: ErrorStyle, status: number, message: string, extras: Record<string, unknown> = {}): ErrorBody {
  if (style === 'default') {
    return { status, body: { status, errorCode: errorCodeOf(status), message, ...extras } };
  }
  return { status, body: { status, message, ...extras } };
}

export function toErrorBody(style: ErrorStyle, err: unknown): ErrorBody {
  if (style === 'partner') {
    // PartnerOperationErrors: thân lỗi chỉ có {message} (+ fieldErrors khi đăng ký trùng); lỗi khác đi qua GlobalApiExceptionHandler.
    if (err instanceof DuplicateFieldsError || err instanceof InvalidFieldsError) {
      return { status: err.status, body: { message: err.reason, fieldErrors: err.fieldErrors } };
    }
    if (err instanceof HttpError) {
      const reason = err.reason && err.reason.trim() ? err.reason : 'Yêu cầu không hợp lệ.';
      return { status: err.status, body: { message: reason } };
    }
    if (err instanceof ValidationError) return { status: 400, body: { message: err.message } };
    if (err instanceof IllegalArgumentError) return { status: 400, body: { message: err.message || 'Yêu cầu không hợp lệ.' } };
    if (err instanceof IllegalStateError) {
      return { status: 409, body: { message: err.message || 'Thao tác không được phép ở trạng thái hiện tại.' } };
    }
    return toErrorBody('default', err);
  }
  if (style === 'adminLocal') {
    if (err instanceof IllegalArgumentError) return { status: 400, body: { status: 400, message: err.message } };
    if (err instanceof IllegalStateError) {
      return { status: 409, body: { status: 409, message: err.message || 'Thao tác không được phép ở trạng thái hiện tại.' } };
    }
    return toErrorBody('default', err);
  }
  if (style === 'partnerHomestay') {
    // @ExceptionHandler(ResponseStatusException) của controller: chỉ {message}; mọi lỗi khác đi qua GlobalApiExceptionHandler.
    if (err instanceof HttpError && !(err instanceof DuplicateFieldsError) && !(err instanceof InvalidFieldsError)) {
      const reason = err.reason && err.reason.trim() ? err.reason : 'Yêu cầu không hợp lệ.';
      return { status: err.status, body: { message: reason } };
    }
    return toErrorBody('default', err);
  }
  if (err instanceof BookingNotFoundError) {
    return shape(style, 404, 'Không tìm thấy đơn đặt phòng.');
  }
  if (err instanceof DuplicateFieldsError || err instanceof InvalidFieldsError) {
    return shape(style, err.status, err.reason, { fieldErrors: err.fieldErrors, ...err.extras });
  }
  if (err instanceof HttpError) {
    const reason = err.reason && err.reason.trim() ? err.reason : defaultMessage(err.status);
    if (err.status >= 500) logger.warn('Lỗi dịch vụ', { status: err.status, reason });
    return shape(style, err.status, reason, err.extras);
  }
  if (err instanceof IllegalArgumentError) {
    return shape(style, 400, err.message || 'Yêu cầu không hợp lệ.');
  }
  if (err instanceof IllegalStateError) {
    return shape(style, 409, err.message || 'Thao tác không được phép ở trạng thái hiện tại.');
  }
  if (err instanceof ValidationError) {
    if (style === 'default') return { status: 400, body: { status: 400, errorCode: 'VALIDATION_ERROR', message: err.message } };
    return shape(style, 400, err.message);
  }
  if (err instanceof UnreadableBodyError || err instanceof BadParamError) {
    if (style === 'admin') return shape(style, 400, 'Dữ liệu gửi lên không đúng định dạng.');
    return shape(style, 400, err.message || 'Dữ liệu gửi lên không hợp lệ.');
  }
  const anyErr = err as { type?: string; status?: number; statusCode?: number; code?: string; message?: string };
  // body-parser: JSON hỏng / quá lớn
  if (anyErr?.type === 'entity.parse.failed' || anyErr?.type === 'encoding.unsupported' || anyErr?.type === 'charset.unsupported') {
    return shape(style, 400, style === 'admin' ? 'Dữ liệu gửi lên không đúng định dạng.' : 'Dữ liệu gửi lên không hợp lệ.');
  }
  if (anyErr?.type === 'entity.too.large' || anyErr?.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, body: { message: 'Tệp quá lớn — mỗi ảnh tối đa 4MB (JPG, PNG hoặc WebP).' } };
  }
  if (style === 'booking' && isDataIntegrityViolation(err)) {
    return shape(style, 409, 'Đơn đặt phòng trùng với một đơn khác còn hiệu lực hoặc dữ liệu không hợp lệ.');
  }
  logger.error('Lỗi không xử lý được', { error: anyErr?.message, stack: (err as Error)?.stack });
  return shape(style, 500, 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.', style === 'default' ? {} : {});
}

/** Middleware lỗi cuối cùng của ứng dụng. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const style = (res.locals.errorStyle as ErrorStyle | undefined) ?? 'default';
  const { status, body } = toErrorBody(style, err);
  res.status(status).json(body);
};

/** 404 cho đường dẫn không có handler. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 404, errorCode: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên.' });
};
