import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as audit from '../services/auditLogService.js';
import { authoritiesOf } from './principal.js';

/**
 * Kiểm quyền mức controller (tương đương @PreAuthorize): `hasRole('TRAVELER')` → authority "ROLE_TRAVELER",
 * `hasAuthority('ADMIN_L2')` → "ADMIN_L2". Chưa đăng nhập → 403; đã đăng nhập mà thiếu quyền → ghi audit ACCESS_DENIED
 * (NFR-SEC-05) rồi 403 — cùng thân phản hồi với bộ phân quyền theo đường dẫn.
 */
export const preAuthorize =
  (authority: string): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const principal = req.principal;
      if (principal && authoritiesOf(principal).has(authority)) return next();
      if (principal) {
        await audit.recordEvent(
          principal.role === 'PROVIDER' ? 'PROVIDER' : 'ADMIN',
          principal.accountId,
          'ACCESS_DENIED',
          'Endpoint',
          null,
          audit.RESULT_DENIED,
          req.ip,
          `${req.method} ${req.path}`,
          { role: principal.role },
        );
      }
      res.status(403).json({
        timestamp: new Date().toISOString(),
        status: 403,
        error: 'Forbidden',
        errorCode: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này.',
        path: req.path,
      });
    } catch (err) {
      next(err);
    }
  };

export const hasRole = (role: string) => preAuthorize(`ROLE_${role}`);
