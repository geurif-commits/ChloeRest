/**
 * @file Error Handling Middleware
 * Centralized error mapping and response formatting
 */

import { Request, Response, NextFunction } from 'express';
import { HttpError, formatErrorResponse, getClientIp } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';
import { IErrorResponse } from '../types/index.js';

const logger = createLogger('errorHandler');

/**
 * Global error handler (must be last middleware)
 */
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const clientIp = getClientIp(req);
  const timestamp = new Date().toISOString();

  let statusCode: number;
  let response: IErrorResponse;

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    response = {
      success: false,
      error: err.message,
      code: err.code,
      timestamp,
    };

    if (statusCode >= 500) {
      logger.error({
        action: 'HTTP_ERROR_5XX',
        statusCode,
        error: {
          message: err.message,
          stack: err.stack,
        },
        method: req.method,
        path: req.path,
        ip: clientIp,
        userId: req.auth?.userId,
      });
    } else {
      logger.warn({
        action: 'HTTP_ERROR_4XX',
        statusCode,
        error: {
          message: err.message,
        },
        method: req.method,
        path: req.path,
        ip: clientIp,
      });
    }
  } else if (err instanceof SyntaxError && 'body' in err) {
    // JSON parse error
    statusCode = 400;
    response = {
      success: false,
      error: 'JSON inválido',
      code: 'INVALID_JSON',
      timestamp,
    };

    logger.warn({
      action: 'INVALID_JSON',
      method: req.method,
      path: req.path,
      error: {
        message: err.message,
      },
    });
  } else if (err instanceof Error) {
    statusCode = 500;
    response = {
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
      timestamp,
    };

    logger.error({
      action: 'UNHANDLED_ERROR',
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      method: req.method,
      path: req.path,
      userId: req.auth?.userId,
    });
  } else {
    statusCode = 500;
    response = formatErrorResponse(err);

    logger.error({
      action: 'UNKNOWN_ERROR',
      details: err,
      method: req.method,
      path: req.path,
    });
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Handler (must be before error handler)
 */
export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => {
  const error = new HttpError(404, 'Ruta no encontrada', 'NOT_FOUND');
  next(error);
};

/**
 * Validation error handler
 */
export const validationError = (
  statusCode: number = 400,
  message: string,
  code: string = 'VALIDATION_ERROR',
  details?: Record<string, unknown>
): HttpError => {
  const error = new HttpError(statusCode, message, code);
  error.details = details;
  return error;
};
