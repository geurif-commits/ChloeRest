/**
 * @file Authentication Middleware
 * Sistema real: token de sesión opaco validado contra app_sessions (no JWT),
 * más token HMAC firmado para el "Dueño" (panel de plataforma/licencias).
 * Puerto de auth.js + los middlewares requireDueno/adminODueno de server.js.
 */

import { Request, Response, NextFunction } from 'express';
import { httpError, getClientIp } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';
import { UserRole, IRequestContext } from '../types/index.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { verificarDuenoTok } from '../services/authService.js';

const logger = createLogger('auth');

declare global {
   
  namespace Express {
    interface Request {
      auth?: IRequestContext;
    }
  }
}

interface ISessionRow {
  usuario_data: { id: number; nombre: string; rol: UserRole };
  empresa_id: number | null;
  device_id: string | null;
  estado: string;
  rol: UserRole;
  nombre: string;
}

function extractToken(req: Request): string {
  const header = req.get('authorization') || (req.query?.token ? `Bearer ${req.query.token}` : '');
  return header.startsWith('Bearer ') ? header.slice(7) : header || String(req.query?.token || '');
}

/**
 * Middleware: Require authentication (sesión de usuario o token de Dueño)
 */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const token = extractToken(req);
  const deviceId = String(req.get('x-device-id') || '').trim();
  if (!token) {
    return next(httpError(401, 'Sesión no válida o vencida.', 'NO_TOKEN'));
  }

  const dueno = verificarDuenoTok(token);
  if (dueno) {
    req.auth = {
      userId: 0,
      nombre: 'Propietario Sistema',
      userRole: 'Dueno',
      empresaId: 1,
      isDueno: true,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return runWithRequestContext({ platform: true, empresaId: 1 }, () => next());
  }

  try {
    const db = getDatabase();
    const result = await db.queryUnscoped<ISessionRow>(
      `SELECT s.usuario_data, s.empresa_id, s.device_id, u.estado, u.rol, u.nombre
         FROM app_sessions s
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = $1 AND s.expira_en > CURRENT_TIMESTAMP`,
      [token]
    );
    const row = result.rows[0];
    if (!row || row.estado !== 'Activo') {
      return next(httpError(401, 'Sesión no válida o vencida.', 'INVALID_SESSION'));
    }
    if (row.device_id && row.device_id !== deviceId) {
      return next(httpError(401, 'La sesión pertenece a otro dispositivo.', 'DEVICE_MISMATCH'));
    }

    req.auth = {
      userId: row.usuario_data.id,
      nombre: row.nombre,
      userRole: row.rol,
      empresaId: row.empresa_id,
      isDueno: false,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    logger.debug({ action: 'AUTH_SUCCESS', userId: req.auth.userId, userRole: req.auth.userRole });
    return runWithRequestContext({ empresaId: row.empresa_id }, () => next());
  } catch (error) {
    logger.warn({ action: 'AUTH_FAILED', error: (error as Error).message, ip: getClientIp(req) });
    return next(httpError(401, 'Sesión no válida o vencida.', 'INVALID_SESSION'));
  }
};

/**
 * Middleware: Require specific roles (el Dueño siempre tiene acceso)
 */
export const requireRoles =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {return next(httpError(401, 'Autenticación requerida', 'NO_AUTH'));}
    if (req.auth.isDueno) {return next();}
    if (!roles.includes(req.auth.userRole)) {
      logger.warn({
        action: 'UNAUTHORIZED_ROLE_ACCESS',
        userId: req.auth.userId,
        requiredRoles: roles,
        userRole: req.auth.userRole,
      });
      return next(httpError(403, 'No tienes permiso para realizar esta acción.', 'FORBIDDEN'));
    }
    next();
  };

/**
 * Middleware: Solo el Dueño (panel de plataforma/licencias)
 */
export const requireDueno = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractToken(req);
  if (!verificarDuenoTok(token)) {
    return next(httpError(401, 'Acceso de propietario no válido o vencido.', 'DUENO_ONLY'));
  }
  req.auth = {
    userId: 0,
    nombre: 'Propietario Sistema',
    userRole: 'Dueno',
    empresaId: null,
    isDueno: true,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || 'unknown',
  };
  runWithRequestContext({ platform: true }, () => next());
};

/**
 * Middleware: Administrador o Dueño
 */
export const requireAdminODueno = (req: Request, res: Response, next: NextFunction): Promise<void> | void => {
  const token = extractToken(req);
  const dueno = verificarDuenoTok(token);
  if (token && dueno) {
    req.auth = {
      userId: 0,
      nombre: 'Propietario Sistema',
      userRole: 'Dueno',
      empresaId: 1,
      isDueno: true,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return runWithRequestContext({ platform: true }, () => next());
  }
  return requireAuth(req, res, () => {
    if (!req.auth || (req.auth.userRole !== 'Administrador' && !req.auth.isDueno)) {
      return next(httpError(403, 'No tienes permiso para realizar esta acción.', 'FORBIDDEN'));
    }
    return next();
  });
};

/**
 * Middleware: Validate tenant isolation (empresaId)
 */
export const validateTenantAccess = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth) {return next(httpError(401, 'Autenticación requerida', 'NO_AUTH'));}

  const requestedEmpresaId = req.params.empresaId || (req.body as Record<string, unknown>)?.empresaId;
  if (requestedEmpresaId && Number(requestedEmpresaId) !== req.auth.empresaId) {
    logger.error({
      action: 'TENANT_VIOLATION_ATTEMPT',
      userId: req.auth.userId,
      requestedEmpresaId,
      authorizedEmpresaId: req.auth.empresaId,
    });
    return next(httpError(403, 'Acceso a empresa no autorizado', 'TENANT_VIOLATION'));
  }
  next();
};
