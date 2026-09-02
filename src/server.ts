/**
 * @file Server Entrypoint
 * Starts the Express application
 */

import createApp from './app.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('server');

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({
    action: 'SERVER_STARTED',
    details: {
      port: PORT,
      env: NODE_ENV,
    },
  });
});

/**
 * Graceful shutdown
 */
const gracefulShutdown = (): void => {
  logger.info({
    action: 'SERVER_SHUTDOWN',
  });

  server.close(() => {
    logger.info({
      action: 'SERVER_CLOSED',
    });
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error({
      action: 'FORCED_SHUTDOWN',
      details: 'Timeout waiting for connections to close',
    });
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Unhandled error handling
 */
process.on('uncaughtException', (error: Error) => {
  logger.error({
    action: 'UNCAUGHT_EXCEPTION',
    error: {
      message: error.message,
      stack: error.stack,
    },
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error({
    action: 'UNHANDLED_REJECTION',
    details: {
      reason: String(reason),
    },
  });
  process.exit(1);
});

export { app, server };
