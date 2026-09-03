/**
 * @file Server Entrypoint
 * Starts the Express application
 */

// PRIMER import: carga .env como efecto de módulo antes de evaluar config.ts
// (los imports estáticos se ejecutan en orden DFS; config lee process.env).
import './lib/env.js';

import createApp from './app.js';
import { createLogger } from './lib/logger.js';
import { config } from './lib/config.js';
import { createDatabase, getDatabase } from './db/index.js';
import { runMigrations, fixDatabaseConsistency } from './db/migrations.js';
import { iniciarTelegramBot } from './services/telegramBotService.js';
import { obtenerOpcionesTelegramBot } from './services/telegramBotOptions.js';

const logger = createLogger('server');

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

createDatabase({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  port: Number(process.env.DB_PORT || 5432),
  max: Number(process.env.DB_POOL_MAX || 25),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle: false,
});

/**
 * Arranque de base de datos (misma secuencia que server.js legacy):
 * verificación de rol en producción, fix de consistencia y migraciones pendientes.
 */
async function prepararBaseDeDatos(): Promise<void> {
  const db = getDatabase();
  if (config.isProduction) {
    await db.verifyDatabaseRole();
  }
  await fixDatabaseConsistency(db);
  await runMigrations(db);
}

try {
  await prepararBaseDeDatos();
} catch (err) {
  logger.error({
    action: 'DB_BOOT_FALLIDO',
    error: { message: err instanceof Error ? err.message : String(err) },
  });
  if (config.isProduction) {
    process.exit(1);
  }
  logger.warn({
    action: 'MODO_DEGRADADO',
    details: 'El servidor arrancará en modo degradado solo fuera de producción.',
  });
}

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({
    action: 'SERVER_STARTED',
    details: {
      port: PORT,
      env: NODE_ENV,
    },
  });

  if (!config.hasPersistentSessionSecret) {
    logger.warn({
      action: 'SESSION_SECRET_NO_CONFIGURADO',
      details: 'APP_SESSION_SECRET no está configurado: las sesiones se invalidarán al reiniciar el servidor.',
    });
  }

  void iniciarTelegramBot(obtenerOpcionesTelegramBot()).catch((error: Error) => {
    logger.warn({
      action: 'TELEGRAM_INICIO_FALLIDO',
      error: { message: error.message },
    });
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
