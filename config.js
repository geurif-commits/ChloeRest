import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function findEnvFile(startDir) {
  let current = startDir;
  const root = path.parse(current).root;
  while (true) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate)) return candidate;
    if (current === root) break;
    current = path.dirname(current);
  }
  return null;
}

const moduleDir = (typeof import.meta !== 'undefined' && import.meta.url)
  ? path.dirname(fileURLToPath(import.meta.url))
  : (typeof __dirname !== 'undefined' ? __dirname : process.cwd());
const appRoot = process.pkg ? path.dirname(process.execPath) : 
moduleDir;
const dotenvPath = findEnvFile(appRoot) || findEnvFile(process.cwd());
if (dotenvPath) loadEnvFile(dotenvPath);

const isProduction = process.env.NODE_ENV === 'production';
const requiredProduction = ['DB_PASSWORD', 'APP_SESSION_SECRET', 'BOOTSTRAP_ADMIN_PIN', 'CORS_ORIGINS'];
if (isProduction) {
  const missing = requiredProduction.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(`Configuración de producción incompleta. Variables obligatorias ausentes: ${missing.join(', ')}`);
  }
}

if (isProduction && !/^\d{6}$/.test(process.env.BOOTSTRAP_ADMIN_PIN.trim())) {
  throw new Error('BOOTSTRAP_ADMIN_PIN debe contener exactamente 6 dígitos en producción.');
}

const generatedSessionSecret = randomBytes(48).toString('base64url');
const sessionSecretValue = process.env.APP_SESSION_SECRET || generatedSessionSecret;

export const config = {
  appRoot,
  isProduction,
  port: Number(process.env.PORT || 3000),
  host: process.env.API_HOST || '0.0.0.0',
  uploadsDir: path.resolve(appRoot, process.env.UPLOADS_DIR || 'uploads'),
  database: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'postgres',
    password: process.env.DB_PASSWORD || (isProduction ? undefined : '012011'),
    port: Number(process.env.DB_PORT || 5432),
  },
  sessionSecret: sessionSecretValue,
  hasPersistentSessionSecret: Boolean(process.env.APP_SESSION_SECRET),
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  supervisorAuthorizationMinutes: Number(process.env.SUPERVISOR_AUTHORIZATION_MINUTES || process.env.SUPERVISOR_AUTH_MINUTES || 5),
  licenseActivationKey: process.env.LICENSE_ACTIVATION_KEY || null,
  bootstrapAdminPin: process.env.BOOTSTRAP_ADMIN_PIN || null,
  ownerPin: process.env.OWNER_PIN || null,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramOwnerChatId: process.env.TELEGRAM_OWNER_CHAT_ID || null,
  corsOrigins: (process.env.CORS_ORIGINS || 'https://chloerestaurant.lat,https://www.chloerestaurant.lat,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  autoFreePort: process.env.AUTO_FREE_PORT === '1',
  login: {
    maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    windowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES || 15),
    lockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 5),
  },
};

export function isAllowedOrigin(origin) {
  return !origin || config.corsOrigins.includes(origin);
}
