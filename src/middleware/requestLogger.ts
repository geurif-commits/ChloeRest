/**
 * @file Request Logging Middleware
 * HTTP request/response logging with timing
 */

import { Request, Response, NextFunction } from 'express';
import { getClientIp, generateRequestId } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const logger = createLogger('http');

/**
 * Attach request ID for tracing
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = generateRequestId();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

/**
 * Log HTTP requests and responses
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = req.id;
  const clientIp = getClientIp(req);

  // Log request
  logger.info({
    action: 'HTTP_REQUEST',
    requestId,
    method: req.method,
    path: req.path,
    ip: clientIp,
    userId: req.auth?.userId,
  });

  // Intercept response
  const originalJson = res.json;
  res.json = function (body: unknown) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    if (statusCode >= 500) {
      logger.error({
        action: 'HTTP_RESPONSE_5XX',
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });
    } else if (statusCode >= 400) {
      logger.warn({
        action: 'HTTP_RESPONSE_4XX',
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });
    } else {
      logger.debug({
        action: 'HTTP_RESPONSE',
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });
    }

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Health check endpoint (no logging)
 */
export const healthCheck = (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};
