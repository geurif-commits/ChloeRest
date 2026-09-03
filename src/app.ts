/**
 * @file Express App Factory
 * Creates and configures the Express application (puerto de server.js legacy)
 */

import fs from 'node:fs';
import path from 'node:path';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './lib/logger.js';
import { config } from './lib/config.js';
import { getDatabase } from './db/index.js';
import { telegramActivo } from './services/telegramBotService.js';
import {
  requestIdMiddleware,
  requestLogger,
  healthCheck,
} from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import pingRouter from './routers/ping.js';
import inventarioRouter from './routers/inventario.js';
import authRouter from './routers/auth.js';
import setupRouter from './routers/setup.js';
import sistemaRouter from './routers/sistema.js';
import usuariosRouter from './routers/usuarios.js';
import mesasRouter from './routers/mesas.js';
import productosRouter from './routers/productos.js';
import recetasRouter from './routers/recetas.js';
import menuConfiguracionRouter from './routers/menuConfiguracion.js';
import dispositivosRouter from './routers/dispositivos.js';
import duenoRouter from './routers/dueno.js';
import cajaRouter from './routers/caja.js';
import reportesRouter from './routers/reportes.js';
import dgiiRouter from './routers/dgii.js';
import dgiiEcfRouter from './routers/dgiiEcf.js';
import dgiiReportesRouter from './routers/dgiiReportes.js';
import kdsRouter from './routers/kds.js';
import webhookRouter from './routers/webhook.js';

const logger = createLogger('app');

/**
 * Resuelve el directorio del frontend compilado (mismo orden que server.js).
 */
function resolverFrontendDist(): string | null {
  const candidatos = [
    path.resolve(config.appRoot, 'public'),
    path.resolve(config.appRoot, 'frontend-restaurante', 'dist'),
    path.resolve(config.appRoot, 'dist'),
  ];
  for (const dist of candidatos) {
    if (fs.existsSync(dist) && fs.existsSync(path.join(dist, 'index.html'))) {
      return dist;
    }
  }
  return null;
}

/**
 * Create Express app with middleware stack
 */
export const createApp = (): Express => {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS (misma lista de orígenes que el legacy)
  app.use(
    cors({
      origin: config.corsOrigins,
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

  // Health checks
  app.get('/health', healthCheck);
  app.get('/health/ready', healthCheck);
  app.get('/api/health', async (_req, res) => {
    const inicio = Date.now();
    try {
      const db = getDatabase();
      await db.query('SELECT 1');
      const migRes = await db.query('SELECT id FROM app_migrations ORDER BY ejecutada_en DESC LIMIT 1');
      const ultimaMig = migRes.rowCount ? migRes.rows[0].id : 'ninguna';
      let uploadsOk = true;
      try {
        const probe = path.join(config.uploadsDir, `.health-${process.pid}.tmp`);
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
      } catch {
        uploadsOk = false;
      }
      const mem = process.memoryUsage();
      res.json({
        estado: 'ok',
        version: '2.1.0',
        baseDeDatos: 'conectada',
        migracion: ultimaMig,
        telegram: telegramActivo() ? 'activo' : 'inactivo',
        uploads: uploadsOk ? 'escribible' : 'no_escribible',
        uptimeSegundos: Math.round(process.uptime()),
        memoriaMb: Math.round(mem.rss / 1024 / 1024),
        latenciaMs: Date.now() - inicio,
      });
    } catch (error) {
      logger.warn({
        action: 'HEALTH_DB_DEGRADADA',
        error: { message: error instanceof Error ? error.message : String(error) },
      });
      res.status(503).json({
        estado: 'error',
        version: '2.1.0',
        baseDeDatos: 'degradada',
        telegram: telegramActivo() ? 'activo' : 'inactivo',
      });
    }
  });

  // Archivos subidos (imágenes/CSV)
  app.use(
    '/uploads',
    express.static(config.uploadsDir, {
      maxAge: '30d',
      immutable: false,
      fallthrough: true,
    })
  );

  // ── Routers de negocio (cada uno protege sus propias rutas) ──
  app.use('/ping', pingRouter);
  app.use('/api/inventario', inventarioRouter);
  app.use(authRouter);
  app.use(setupRouter);
  app.use(sistemaRouter);
  app.use(usuariosRouter);
  app.use(mesasRouter);
  app.use(productosRouter);
  app.use(recetasRouter);
  app.use(menuConfiguracionRouter);
  app.use(dispositivosRouter);
  app.use(duenoRouter);
  app.use(cajaRouter);
  app.use(reportesRouter);
  app.use(dgiiRouter);
  app.use(dgiiEcfRouter);
  app.use(dgiiReportesRouter);
  app.use(kdsRouter);
  app.use(webhookRouter);

  // ── Frontend compilado (SPA) en producción/dev ──
  const frontendDist = resolverFrontendDist();
  if (frontendDist) {
    app.use(
      '/assets',
      express.static(path.join(frontendDist, 'assets'), { maxAge: '365d', immutable: true })
    );
    app.use(
      '/assets',
      express.static(frontendDist, { maxAge: '365d', immutable: true, fallthrough: true })
    );
    app.use(express.static(frontendDist, { maxAge: 0, index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/assets/')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(path.join(frontendDist, 'index.html'));
    });
    logger.info({
      action: 'FRONTEND_SERVIDO',
      details: { frontendDist },
    });
  } else {
    logger.warn({
      action: 'FRONTEND_NO_ENCONTRADO',
      details: 'No se encontró dist/. Ejecuta "npm run build" en el frontend.',
    });
  }

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  logger.info({
    action: 'APP_CREATED',
    details: {
      corsOrigins: config.corsOrigins,
    },
  });

  return app;
};

/**
 * Export app factory
 */
export default createApp;
