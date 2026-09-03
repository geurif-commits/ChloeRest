/**
 * @file Configuración central (puerto de config.js legacy). La carga de .env
 * ocurre en server.ts vía loadEnv(); aquí solo se leen las variables.
 */

import path from 'node:path';

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
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramOwnerChatId: process.env.TELEGRAM_OWNER_CHAT_ID || null,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://chloerestaurant.lat',
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
        'https://chloerestaurant.lat,https://www.chloerestaurant.lat,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173'
      )
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'null',
    ]),
  ],
  autoFreePort: process.env.AUTO_FREE_PORT === '1',
  login: {
    maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    windowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES || 15),
    lockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 5),
  },
};

export function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || config.corsOrigins.includes(origin);
}
