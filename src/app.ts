/**
 * @file Express App Factory
 * Creates and configures the Express application
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './lib/logger.js';
import {
  requestIdMiddleware,
  requestLogger,
  healthCheck,
} from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import pingRouter from './routers/ping.js';

const logger = createLogger('app');

/**
 * Create Express app with middleware stack
 */
export const createApp = (): Express => {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      maxAge: 3600,
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Tracing and logging
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // Health check (no auth required)
  app.get('/health', healthCheck);
  app.get('/health/ready', healthCheck);

  // Mount routers
  app.use('/ping', pingRouter);
  // app.use('/api/auth', authRouter);
  // app.use('/api/usuarios', usuariosRouter);
  // app.use('/api/cuentas', cuentasRouter);
  // etc.

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  logger.info({
    action: 'APP_CREATED',
    details: {
      corsOrigins,
    },
  });

  return app;
};

/**
 * Export app factory
 */
export default createApp;
