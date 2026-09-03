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
import { execSync } from 'node:child_process';
import type { Express } from 'express';

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

/**
 * ¿El PID corresponde a una instancia del POS? (puerto de server.js legacy).
 * En Windows solo se libera un proceso cuyo nombre sea ServidorPOS; en
 * Linux/Passenger se libera cualquier proceso node que ocupe el puerto.
 */
function esProcesoDelPos(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
      return /ServidorPOS/i.test(out);
    }
    const out = execSync(`ps -o comm= -p ${pid}`, { encoding: 'utf8' });
    return /ServidorPOS|node/i.test(out.trim());
  } catch {
    return false;
  }
}

/** Libera el proceso previo del POS que ocupa el puerto (puerto de server.js legacy). */
function liberarPuertoProcesoPrevio(port: number): void {
  try {
    const cmd =
      process.platform === 'win32'
        ? `netstat -ano | findstr :${port}`
        : `lsof -i :${port} -t`;
    const output = execSync(cmd, { encoding: 'utf8' });
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING') || (process.platform !== 'win32' && line.trim())) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && pid !== process.pid && esProcesoDelPos(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
            logger.warn({
              action: 'PUERTO_LIBERADO',
              details: { pid, port },
            });
          } catch {
            // proceso ya terminado o sin permisos
          }
        }
      }
    }
  } catch {
    // sin netstat/lsof disponible
  }
}

/**
 * Arranca el listener con reintento si AUTO_FREE_PORT=1 y el puerto está ocupado.
 * (puerto de arrancarServidor de server.js legacy).
 */
function arrancarServidor(app: Express, intento = 1): void {
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

  server.on('error', (err: Error & { code?: string }) => {
    if (err.code === 'EADDRINUSE') {
      if (config.autoFreePort && intento <= 2) {
        logger.warn({
          action: 'PUERTO_OCUPADO_LIBERANDO',
          details: { port: PORT, intento },
        });
        liberarPuertoProcesoPrevio(PORT);
        setTimeout(() => arrancarServidor(app, intento + 1), 600);
        return;
      }
      logger.error({
        action: 'PUERTO_OCUPADO',
        details: {
          port: PORT,
          mensaje: 'El puerto ya está en uso por otra instancia del servidor POS. Define AUTO_FREE_PORT=1 para liberarlo automáticamente.',
        },
      });
      process.exit(1);
    } else {
      throw err;
    }
  });

  registrarShutdown(server);
}

/**
 * Arranque completo (misma secuencia que server.js legacy). Se invoca al final
 * del módulo para que el bundle CJS de pkg no dependa de top-level await.
 */
async function inicializarAplicacion(): Promise<void> {
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
  arrancarServidor(app);
}

/**
 * Graceful shutdown
 */
function registrarShutdown(server: ReturnType<Express['listen']>): void {
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
}

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

// Arranque (compatible con ESM y con el bundle CJS de pkg).
void inicializarAplicacion();
