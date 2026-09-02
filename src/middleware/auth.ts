/**
 * @file Authentication Middleware
 * JWT validation and role-based authorization
 */

import { Request, Response, NextFunction } from 'express';
import { httpError, getClientIp } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';
import { IAuthPayload, UserRole, IRequestContext } from '../types/index.js';
import jwt from 'jsonwebtoken';

const logger = createLogger('auth');
const JWT_SECRET = process.env.APP_SESSION_SECRET || 'development-secret';

/**
 * Extend Express Request with auth context
 */
declare global {
  namespace Express {
    interface Request {
      auth?: IRequestContext;
    }
  }
}

/**
 * Verify JWT token and extract payload
 */
export const verifyToken = (token: string): IAuthPayload => {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as IAuthPayload;
    return payload;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    throw httpError(401, 'Token inválido o expirado', 'INVALID_TOKEN');
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (
  userId: number,
  userRole: UserRole,
  empresaId: number,
  expiresIn: string = '24h'
): string => {
  return jwt.sign(
    {
      userId,
      userRole,
      empresaId,
    },
    JWT_SECRET as string,
    { expiresIn } as Parameters<typeof jwt.sign>[2]
  );
};

/**
 * Middleware: Require authentication
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw httpError(401, 'Token no proporcionado', 'NO_TOKEN');
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    req.auth = {
      userId: payload.userId,
      userRole: payload.userRole,
      empresaId: payload.empresaId,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    logger.debug({
      action: 'AUTH_SUCCESS',
      userId: payload.userId,
      userRole: payload.userRole,
    });

    next();
  } catch (error) {
    if (error instanceof Error) {
      logger.warn({
        action: 'AUTH_FAILED',
        error: error.message,
        ip: getClientIp(req),
      });
    }
    next(error);
  }
};

/**
 * Middleware: Require specific roles
 */
export const requireRoles =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(httpError(401, 'Autenticación requerida', 'NO_AUTH'));
    }

    if (!roles.includes(req.auth.userRole)) {
      logger.warn({
        action: 'UNAUTHORIZED_ROLE_ACCESS',
        userId: req.auth.userId,
        requiredRoles: roles,
        userRole: req.auth.userRole,
      });

      return next(httpError(403, 'Acceso denegado', 'FORBIDDEN'));
    }

    next();
  };

/**
 * Middleware: Require propietario role
 * Special rate limiting for sensitive operations
 */
export const requirePropietario = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) {
    return next(httpError(401, 'Autenticación requerida', 'NO_AUTH'));
  }

  if (req.auth.userRole !== 'Propietario') {
    logger.warn({
      action: 'PROPIETARIO_ONLY_DENIED',
      userId: req.auth.userId,
      userRole: req.auth.userRole,
    });

    return next(httpError(403, 'Solo el propietario puede acceder', 'PROPIETARIO_ONLY'));
  }

  next();
};

/**
 * Middleware: Validate tenant isolation (empresaId)
 */
export const validateTenantAccess = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) {
    return next(httpError(401, 'Autenticación requerida', 'NO_AUTH'));
  }

  const requestedEmpresaId = req.params.empresaId || req.body?.empresaId;

  if (requestedEmpresaId && parseInt(requestedEmpresaId) !== req.auth.empresaId) {
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
