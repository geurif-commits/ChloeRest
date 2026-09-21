/**
 * @file Configuración central (puerto de config.js legacy). La carga de .env
 * ocurre en server.ts vía loadEnv(); aquí solo se leen las variables.
 */

import path from 'node:path';
import fs from 'node:fs';

function leerVersionApp(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    if (pkg.version) {return String(pkg.version);}
  } catch {
    /* sin package.json: usar env */
  }
  return process.env.APP_VERSION || '0.0.0';
}

export const config = {
  appRoot: process.cwd(),
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  host: process.env.API_HOST || '0.0.0.0',
  uploadsDir: path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads'),
  sessionSecret: process.env.APP_SESSION_SECRET || '',
  hasPersistentSessionSecret: Boolean(process.env.APP_SESSION_SECRET),
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  supervisorAuthorizationMinutes: Number(
    process.env.SUPERVISOR_AUTHORIZATION_MINUTES || process.env.SUPERVISOR_AUTH_MINUTES || 5
  ),
  licenseActivationKey: process.env.LICENSE_ACTIVATION_KEY || null,
  bootstrapAdminPin: process.env.BOOTSTRAP_ADMIN_PIN || null,
  ownerPin: process.env.OWNER_PIN || null,
  /** Respaldos automáticos de la base de datos (ver services/backupService.ts). */
  backup: {
    enabled: process.env.BACKUP_ENABLED === '1',
    dir: path.resolve(process.cwd(), process.env.BACKUP_DIR || path.join('backups', 'auto')),
    retentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14)),
    hour: Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR ?? 3))),
    pgBinDir: process.env.PG_BIN_DIR || null,
    /** Solo instalaciones de un negocio: el Administrador puede ver, crear y descargar respaldos. */
    tenantAccess: process.env.BACKUP_TENANT_ACCESS === '1',
  },
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramOwnerChatId: process.env.TELEGRAM_OWNER_CHAT_ID || null,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://chloerestaurant.lat',
  // Versión pública de la app y datos de la última actualización disponible.
  // El cliente Electron consulta /api/app/version para detectar updates.
  appVersion: leerVersionApp(),
  appDownloadUrl: process.env.APP_DOWNLOAD_URL || null,
  appUpdateNotes: process.env.APP_UPDATE_NOTES || null,
  /*
   * Orígenes CORS permitidos. La variable CORS_ORIGINS (si existe) se combina
   * SIEMPRE con los orígenes de escritorio/desarrollo: la app Electron carga
   * desde http://127.0.0.1:3000 o file:// (origin 'null') y esos fetch
   * cross-origin al servidor central deben funcionar sin depender del .env
   * de producción.
   */
  corsOrigins: [
    ...new Set([
      ...(process.env.CORS_ORIGINS ||
        'https://chloerestaurant.lat,https://www.chloerestaurant.lat'
      )
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...(process.env.NODE_ENV !== 'production'
        ? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']
        : []),
      ...(!['production'].includes(process.env.NODE_ENV || '') || process.env.ALLOW_NULL_ORIGIN === '1'
        ? ['null']
        : []),
    ]),
  ],
  autoFreePort: process.env.AUTO_FREE_PORT === '1',
  runMigrations: process.env.RUN_MIGRATIONS === '1',
  login: {
    maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    windowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES || 15),
    lockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 5),
  },
};

export function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || config.corsOrigins.includes(origin);
}
