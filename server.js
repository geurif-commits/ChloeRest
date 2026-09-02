import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import db, { verifyDatabaseRole } from './db.js';
import { config, isAllowedOrigin } from './config.js';
import { authenticate, assertValidPin, assertSixDigitPin, createSession, firmarDuenoTok, hashPin, requireRoles, signSupervisorAuthorization, verificarDuenoTok, verifyPin, verifySupervisorAuthorization } from './auth.js';
import { runMigrations } from './migrations.js';
import { registrarAuditoria } from './audit.js';
import { iniciarTelegramBot, notificarSolicitud, notificarPago, enviarClaveActivacion, telegramActivo, validarWebhookSecret, procesarActualizacionWebhook } from './telegramBot.js';
import { runWithRequestContext } from './db.js';
import { validarRNC, normalizarRNC } from './lib/rnc.js';
import { construirECF } from './lib/ecf.js';
import { formatearFila607, formatearFila606, serializarTXT, serializarCSV, COLS_607, COLS_606 } from './lib/dgii.js';

// ── Exception handlers (PM2 reinicia en <2s si el proceso cae) ──
process.on('uncaughtException', (err) => {
  console.error('💥 uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 unhandledRejection:', reason);
});

// Graceful shutdown para PM2
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('🛑 SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

const ROLES_OPERACION = ['Administrador', 'Cajero', 'Camarero', 'Capitán de Camareros'];
const ROLES_USUARIO = [...ROLES_OPERACION, 'Cocina', 'Bar'];
const ROLES_CAJA = ['Administrador', 'Cajero'];
const ROLES_ADMIN = ['Administrador'];

fs.mkdirSync(config.uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadsDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

const uploadCsv = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    const isCsv = allowed.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv');
    callback(null, isCsv);
  },
});

// ── Validación de firma real de archivos de imagen (magic bytes) ──
function esImagenValida(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const buf = Buffer.alloc(12);
    const leidos = fs.readSync(fd, buf, 0, 12, 0);
    if (leidos < 3) return false;
    const cabecera = buf.subarray(0, leidos);
    if (leidos >= 3 && cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff) return true;
    if (leidos >= 8 && cabecera.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (leidos >= 12 && cabecera.subarray(0, 4).toString('ascii') === 'RIFF' && cabecera.subarray(8, 12).toString('ascii') === 'WEBP') return true;
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function validarImagenSubida(req, _res, next) {
  if (req.file && !esImagenValida(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    const error = httpError(400, 'El archivo subido no es una imagen válida (JPG, PNG o WEBP).');
    return next(error);
  }
  return next();
}

function validarImagenesSubidas(req, _res, next) {
  const files = req.files || {};
  const archivos = Object.values(files).flat();
  for (const archivo of archivos) {
    if (!esImagenValida(archivo.path)) {
      try { fs.unlinkSync(archivo.path); } catch {}
      const error = httpError(400, 'El archivo subido no es una imagen válida (JPG, PNG o WEBP).');
      return next(error);
    }
  }
  return next();
}

const uploadImagenesSistema = upload.fields([{ name: 'fondo_archivo', maxCount: 1 }, { name: 'logo_archivo', maxCount: 1 }]);

const app = express();
app.disable('x-powered-by');

// El despliegue real corre tras el proxy de Passenger/Apache (cPanel).
// Confiamos un solo salto para que clientIp() / rate-limits / auditoría usen
// la IP real del cliente (X-Forwarded-For) y no el IP local del proxy.
app.set('trust proxy', 1);

// Cabeceras defensivas para reducir clickjacking, sniffing, fuga de referrer y
// ejecución accidental de recursos no autorizados. Se mantienen compatibles
// con el frontend: React usa estilos inline y el POS sirve sus propios assets.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Request-ID', crypto.randomUUID());
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: http: https:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Middleware CORS autocontenido (sin dependencia de closures):
// permite Electron (sin origin), mismo origen (dominio que apunta al
// servidor), orígenes autorizados (CORS_ORIGINS), localhost y red local.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const permitido =
    !origin ||
    (() => {
      try {
        const o = new URL(origin);
        const hostPeticion = req.get('host');
        return hostPeticion && o.host === hostPeticion;
      } catch { return false; }
    })() ||
    isAllowedOrigin(origin) ||
    (() => { try { const h = new URL(origin).hostname; return h === 'localhost' || h === '127.0.0.1'; } catch { return false; } })() ||
    /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);

  if (permitido) {
    // Nunca combinar wildcard con credenciales. Las peticiones sin Origin no
    // necesitan cabecera CORS (Electron/CLI), pero sí deben poder continuar.
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Supervisor-Authorization, X-Session-Token, X-Device-ID');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }

  return res.status(403).json({ error: 'Origen no autorizado.' });
});

app.use(express.json({ limit: '256kb' }));

app.post('/api/telegram/webhook', route(async (req, res) => {
  if (!validarWebhookSecret(req.get('x-telegram-bot-api-secret-token'))) {
    return res.status(401).json({ error: 'Webhook no autorizado.' });
  }
  await procesarActualizacionWebhook(req.body);
  return res.sendStatus(200);
}));

// El cliente solo identifica el dispositivo; la empresa siempre se resuelve
// en servidor mediante dispositivo/licencia, nunca desde empresa_id del body.
app.use(async (req, _res, next) => {
  const deviceId = String(req.get('x-device-id') || req.body?.deviceId || '').trim();
  const clave = String(req.body?.clave || '').trim();
  const hash = clave ? crypto.createHash('sha256').update(clave).digest('hex') : null;
  const result = await db.queryUnscoped(
    `SELECT d.id IS NOT NULL AS device_exists,
            COALESCE(l.empresa_id, d.empresa_id) AS empresa_id
       FROM (SELECT $1::varchar AS device_id) x
       LEFT JOIN dispositivos d ON d.device_id = x.device_id
       LEFT JOIN licencias l ON l.clave_hash = $2
      LIMIT 1`,
    [deviceId || null, hash],
  ).catch(() => ({ rows: [] }));
  const deviceExists = result.rows[0]?.device_exists === true;
  
  const rutasExentas = [
    '/api/health',
    '/api/planes',
    '/api/solicitudes-licencia',
    '/api/activar-dispositivo',
    '/api/dispositivo/registrar',
    '/api/dispositivo/estado',
    '/api/dispositivo/verificar',
    '/api/dispositivo/activar',
    '/api/telegram/webhook',
    '/api/owner/login',
    '/api/dueno/login',
  ];
  const esRutaExenta = rutasExentas.some((r) => req.path === r || req.path.startsWith('/api/owner/') || req.path.startsWith('/api/dueno/') || req.path.startsWith('/api/dgii/') || req.path.startsWith('/api/pagos/'));

  if (deviceId && !deviceExists && !esRutaExenta) {
    return _res.status(401).json({ error: 'Dispositivo no registrado. Regístralo antes de acceder al sistema.' });
  }
  const empresaId = result.rows[0]?.empresa_id || 1;
  return runWithRequestContext({ empresaId, platform: esRutaExenta }, next);
});
// ============================================================
// ARCHIVOS SUBIDOS
// ============================================================

fs.mkdirSync(config.uploadsDir, { recursive: true });

app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    fallthrough: true,
  })
);

// Si una imagen ya no existe, devolver 404 limpio.
// Nunca devolver index.html para /uploads.
app.use('/uploads', (_req, res) => {
  res.status(404).json({
    error: 'Archivo no encontrado',
    tipo: 'UPLOAD_NOT_FOUND',
  });
});
const sseClients = new Set();
function notificarKDS(evento = 'actualizacion') {
  const payload = `data: ${JSON.stringify({ type: evento, time: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

const sseMesaClients = new Set();
function notificarMesas(evento = 'mesa_actualizada') {
  const payload = `data: ${JSON.stringify({ type: evento, time: Date.now() })}\n\n`;
  for (const client of sseMesaClients) {
    try { client.write(payload); } catch { sseMesaClients.delete(client); }
  }
}

// Mantener vivas las conexiones SSE en producción (evita desconexiones por proxy/timeout)
setInterval(() => {
  for (const client of sseClients) {
    try { client.write(': ping\n\n'); } catch { sseClients.delete(client); }
  }
  for (const client of sseMesaClients) {
    try { client.write(': ping\n\n'); } catch { sseMesaClients.delete(client); }
  }
}, 20000);

function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ── Limitador de intentos de PIN (anti fuerza bruta) ──
const loginLimiter = {
  intentos: new Map(),
  maxAttempts: config.login.maxAttempts,
  windowMs: config.login.windowMinutes * 60 * 1000,
  lockoutMs: config.login.lockoutMinutes * 60 * 1000,
  limpiarVencidos() {
    const now = Date.now();
    for (const [key, record] of this.intentos) {
      if (record.bloqueadoHasta && record.bloqueadoHasta <= now) this.intentos.delete(key);
      else if (!record.bloqueadoHasta && now - record.primerIntento > this.windowMs) this.intentos.delete(key);
    }
  },
};

function verificarRateLimit(ip) {
  loginLimiter.limpiarVencidos();
  const record = loginLimiter.intentos.get(ip);
  if (!record || !record.bloqueadoHasta) return;
  const restanteMin = Math.ceil((record.bloqueadoHasta - Date.now()) / 60000);
  throw httpError(429, `Demasiados intentos fallidos. Reintenta en ${restanteMin} min.`);
}

function registrarIntentoFallido(ip) {
  const now = Date.now();
  const record = loginLimiter.intentos.get(ip) || { count: 0, primerIntento: now, bloqueadoHasta: null };
  record.count += 1;
  if (record.count >= loginLimiter.maxAttempts) {
    record.bloqueadoHasta = now + loginLimiter.lockoutMs;
    record.count = 0;
    console.warn(`⚠️ IP ${ip} bloqueada temporalmente tras ${loginLimiter.maxAttempts} intentos fallidos.`);
  }
  loginLimiter.intentos.set(ip, record);
}

function registrarIntentoExitoso(ip) {
  loginLimiter.intentos.delete(ip);
}

function positiveInteger(value, field) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw httpError(400, `${field} no es válido.`);
  return numeric;
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || null;
}

function uploadUrl(req, file) {
  const host = req.get('host') || '';
  const fwd = (req.get('x-forwarded-proto') || req.get('x-forwarded-scheme') || '').split(',')[0].trim();
  const isHttps = fwd === 'https' || req.secure || /chloerestaurant\.lat$/i.test(host);
  const proto = isHttps ? 'https' : (req.protocol || 'http');
  return `${proto}://${host}/uploads/${encodeURIComponent(file.filename)}`;
}

// Protección adicional para endpoints públicos que escriben datos. El límite
// es deliberadamente independiente del login para evitar que un atacante pueda
// saturar solicitudes de licencia, confirmaciones o activaciones.
const publicMutationLimiter = new Map();
const PUBLIC_MUTATION_LIMIT = 20;
const PUBLIC_MUTATION_WINDOW = 10 * 60 * 1000;
const PUBLIC_MUTATION_PATHS = new Set([
  '/api/dispositivo/registrar',
  '/api/dispositivo/activar',
  '/api/solicitud-licencia',
  '/api/setup/registro',
  '/api/dueno/login',
]);

app.use((req, res, next) => {
  if (req.method !== 'POST' || !PUBLIC_MUTATION_PATHS.has(req.path)) return next();
  const key = `${clientIp(req) || 'unknown'}:${req.path}`;
  const now = Date.now();
  const previous = publicMutationLimiter.get(key);
  const record = previous && now - previous.startedAt < PUBLIC_MUTATION_WINDOW
    ? previous
    : { startedAt: now, count: 0 };
  record.count += 1;
  publicMutationLimiter.set(key, record);
  if (record.count > PUBLIC_MUTATION_LIMIT) {
    res.setHeader('Retry-After', String(Math.ceil((record.startedAt + PUBLIC_MUTATION_WINDOW - now) / 1000)));
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
  }
  if (publicMutationLimiter.size > 2000) {
    for (const [entry, value] of publicMutationLimiter) {
      if (now - value.startedAt >= PUBLIC_MUTATION_WINDOW) publicMutationLimiter.delete(entry);
    }
  }
  return next();
});

// ── Limitador de tasa general por IP (protege todos los endpoints) ──
// Complementa al limitador de login y al de mutaciones públicas. Es generoso
// para no interferir con el uso legítimo del POS (polling, SSE, operaciones
// de caja) pero bloquea abuso/DDoS. Configurable vía API_RATE_LIMIT.
const apiRateLimiter = new Map();
const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT || 600);
const API_RATE_WINDOW = 60 * 1000;
app.use((req, res, next) => {
  if (req.path.startsWith('/api/health')) return next();
  const key = clientIp(req) || 'unknown';
  const now = Date.now();
  const record = apiRateLimiter.get(key);
  const current = record && now - record.startedAt < API_RATE_WINDOW
    ? record
    : { startedAt: now, count: 0 };
  current.count += 1;
  apiRateLimiter.set(key, current);
  if (current.count > API_RATE_LIMIT) {
    res.setHeader('Retry-After', String(Math.ceil((current.startedAt + API_RATE_WINDOW - now) / 1000)));
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
  }
  if (apiRateLimiter.size > 5000) {
    for (const [entry, value] of apiRateLimiter) {
      if (now - value.startedAt >= API_RATE_WINDOW) apiRateLimiter.delete(entry);
    }
  }
  return next();
});

// ── Logging estructurado de peticiones (observabilidad) ──
// Registra método, ruta, estado, duración e IP de cada petición. En producción
// solo se loguean errores (>=400) para no saturar los logs; en desarrollo se
// loguea todo. No expone datos sensibles (ni body ni query).
app.use((req, res, next) => {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    const status = res.statusCode;
    if (config.isProduction && status < 400) return;
    const linea = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${status} ${duracionMs.toFixed(1)}ms ip=${clientIp(req) || '-'}`;
    if (status >= 500) console.error('❌ ' + linea);
    else if (status >= 400) console.warn('⚠️ ' + linea);
    else console.log('ℹ️ ' + linea);
  });
  return next();
});

// ─── Claves de activación con duración: CHLOE-<DURACION>-<FIRMA> ───
// Formato: CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX | CHLOE-12M-... | CHLOE-L-...
// FIRMA = HMAC-SHA256(LICENSE_ACTIVATION_KEY, 'CHLOE:<DURACION>') → hex (primeros 20), grupos de 5.
function firmarDuracion(dur) {
  const secret = config.licenseActivationKey || '';
  return crypto.createHmac('sha256', secret).update(`CHLOE:${String(dur).toUpperCase()}`).digest('hex').toUpperCase().slice(0, 20);
}

function parsearDuracion(codigo) {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') return { vitalicia: true, meses: -1 };
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0 || n > 120) return null;
  const meses = m[2] === 'M' ? n : Math.ceil(n / 30);
  return { vitalicia: false, meses };
}

function vencimientoDesdeMeses(meses) {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha;
}

async function requireDueno(req, res, next) {
  const value = req.get('authorization') || '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (!verificarDuenoTok(token)) return res.status(401).json({ error: 'Acceso de propietario no válido o vencido.' });
  req.dueno = true;
  return runWithRequestContext({ platform: true }, next);
}

async function adminODueno(req, res, next) {
  const value = req.get('authorization') || (req.query.token ? `Bearer ${req.query.token}` : '');
  const token = value.startsWith('Bearer ') ? value.slice(7) : (value || req.query.token || '');
  const duenoPayload = verificarDuenoTok(token);
  if (token && duenoPayload) {
    req.dueno = true;
    req.user = { id: 0, rol: 'Dueno', empresaId: 1 };
    return runWithRequestContext({ platform: true }, next);
  }
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return authenticate(req, res, () => {
    if (!req.user || (req.user.rol !== 'Administrador' && req.user.rol !== 'Dueno')) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    next();
  });
}

async function transaction(work) {
  const client = await db.connect();
  try {
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cuentaAbiertaParaMesa(client, mesaId, lock = false) {
  const result = await client.query(
    `SELECT id, mesa_id, camarero_id, estado, tipo_servicio
     FROM cuentas
     WHERE mesa_id = $1 AND estado = 'Abierta'
     ${lock ? 'FOR UPDATE' : ''}`,
    [mesaId],
  );
  return result.rows[0] || null;
}

async function siguienteComprobante(client, tipoComprobante, cuentaId) {
  const sequence = await client.query(
    `SELECT id, prefijo, secuencia_actual, secuencia_final
     FROM dgii_secuencias
     WHERE tipo_comprobante = $1 AND activa = TRUE AND fecha_vencimiento >= CURRENT_DATE
     ORDER BY id
     LIMIT 1
     FOR UPDATE`,
    [tipoComprobante],
  );

  if (!sequence.rowCount) throw httpError(400, `No hay secuencia activa para ${tipoComprobante}. Configura una secuencia en DGII > Secuencias NCF.`);

  const row = sequence.rows[0];
  if (row.secuencia_actual >= row.secuencia_final) {
    throw httpError(400, `Secuencia de ${tipoComprobante} agotada (${row.secuencia_actual}/${row.secuencia_final}). Crea una nueva secuencia o amplía el rango.`);
  }

  await client.query('UPDATE dgii_secuencias SET secuencia_actual = secuencia_actual + 1 WHERE id = $1', [row.id]);
  const ncf = `${row.prefijo || tipoComprobante}${String(row.secuencia_actual).padStart(8, '0')}`;

  // Alerta silenciosa si quedan menos de 1000 comprobantes
  const restantes = row.secuencia_final - row.secuencia_actual;
  if (restantes < 1000) {
    console.warn(`⚠️ Secuencia ${tipoComprobante}: quedan ${restantes} comprobantes (${ncf})`);
  }

  return ncf;
}

async function calcularTotales(client, cuentaId) {
  const detailResult = await client.query(
    `SELECT cd.producto_id, cd.cantidad, cd.precio_unitario, COALESCE(p.tasa_itbis, 18) AS tasa_itbis
     FROM cuenta_detalles cd
     JOIN productos p ON p.id = cd.producto_id
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL
     FOR UPDATE`,
    [cuentaId],
  );
  if (!detailResult.rowCount) throw httpError(400, 'No se puede cobrar una cuenta sin productos activos.');

  let subtotal = 0;
  let totalItbis = 0;
  let totalExento = 0;
  let totalGravado = 0;

  for (const item of detailResult.rows) {
    const montoItem = money(Number(item.cantidad) * Number(item.precio_unitario));
    subtotal += montoItem;
    const tasa = Number(item.tasa_itbis ?? 18);
    if (tasa === 0) {
      totalExento += montoItem;
    } else {
      const gravado = money(montoItem / (1 + tasa / 100));
      totalGravado += gravado;
      totalItbis += money(gravado * tasa / 100);
    }
  }

  subtotal = money(subtotal);
  totalItbis = money(totalItbis);
  totalExento = money(totalExento);
  totalGravado = money(totalGravado);

  const businessResult = await client.query('SELECT cobrar_itbis, cobrar_propina FROM negocio_config ORDER BY id LIMIT 1 FOR UPDATE');
  const business = businessResult.rows[0] || { cobrar_itbis: true, cobrar_propina: true };
  const itbis = business.cobrar_itbis === false ? 0 : totalItbis;
  const propina = business.cobrar_propina === false ? 0 : money(subtotal * 0.1);
  return { detalles: detailResult.rows, subtotal, itbis, propina, total: money(subtotal + itbis + propina), totalExento, totalGravado, totalItbis };
}

async function descontarInventario(client, detalles) {
  const cantidades = new Map();
  for (const detail of detalles) cantidades.set(detail.producto_id, (cantidades.get(detail.producto_id) || 0) + Number(detail.cantidad));

  for (const [productoId, cantidad] of cantidades) {
    const recipe = await client.query(
      `SELECT i.id, i.nombre, i.stock_actual, r.cantidad_necesaria
       FROM receta_productos r
       JOIN ingredientes i ON i.id = r.ingrediente_id
       WHERE r.producto_id = $1
       FOR UPDATE OF i`,
      [productoId],
    );
    for (const ingredient of recipe.rows) {
      const required = Number(ingredient.cantidad_necesaria) * cantidad;
      if (Number(ingredient.stock_actual) < required) {
        throw httpError(409, `Inventario insuficiente para ${ingredient.nombre}.`);
      }
      await client.query('UPDATE ingredientes SET stock_actual = stock_actual - $1 WHERE id = $2', [required, ingredient.id]);
    }
  }
}

async function cobrarCuenta({ cuentaId, actor, body, req }) {
  const allowedMethods = ['Efectivo', 'Tarjeta', 'Transferencia'];
  const metodoPago = String(body.metodo_pago || '');
  const metodoPago2 = body.metodo_pago_2 || null;
  const montoPago2 = Number(body.monto_pago_2 || 0);
  const bancoPago2 = body.banco_pago_2 || null;
  const tipoComprobante = ['B01', 'B02', 'E31', 'E32', 'e-CF'].includes(body.tipo_comprobante) ? body.tipo_comprobante : 'B02';
  if (!allowedMethods.includes(metodoPago)) throw httpError(400, 'Método de pago no válido.');
  if (metodoPago === 'Tarjeta' && !/^\d{4}$/.test(String(body.tarjeta_ultimos_4 || ''))) {
    throw httpError(400, 'Debes indicar los últimos cuatro dígitos de la tarjeta.');
  }
  if (metodoPago2 && !allowedMethods.includes(metodoPago2)) throw httpError(400, 'Método de pago 2 no válido.');
  if (metodoPago2 === 'Transferencia' && montoPago2 <= 0) throw httpError(400, 'Indica el monto de la transferencia.');
  if (metodoPago2 === metodoPago) throw httpError(400, 'No puedes repetir el mismo método de pago en pago mixto.');

  return transaction(async (client) => {
    const account = await client.query('SELECT * FROM cuentas WHERE id = $1 AND estado = $2 FOR UPDATE', [cuentaId, 'Abierta']);
    if (!account.rowCount) throw httpError(404, 'La cuenta no está abierta o no existe.');

    const totals = await calcularTotales(client, cuentaId);
    await descontarInventario(client, totals.detalles);
    const comprobante = await siguienteComprobante(client, tipoComprobante, cuentaId);

    await client.query(
      `UPDATE cuentas
       SET estado = 'Cerrada', metodo_pago = $1, subtotal = $2, itbis = $3, propina = $4, total = $5,
           fecha_cierre = CURRENT_TIMESTAMP, tipo_comprobante = $6, rnc_cedula_cliente = $7,
           ncf_ecf_generado = $8, tarjeta_ultimos_4 = $9, tarjeta_marca = $10, cajero_id = $12,
           metodo_pago_2 = $13, monto_pago_2 = $14, banco_pago_2 = $15
       WHERE id = $11`,
      [metodoPago, totals.subtotal, totals.itbis, totals.propina, totals.total, tipoComprobante,
        body.rnc_cedula_cliente?.trim() || null, comprobante,
        metodoPago === 'Tarjeta' ? body.tarjeta_ultimos_4 : null,
        metodoPago === 'Tarjeta' ? String(body.tarjeta_marca || '').trim() || null : null,
        cuentaId, actor.id,
        metodoPago2 || null, montoPago2 || null,
        metodoPago2 === 'Transferencia' ? String(bancoPago2 || '').trim() || null : null],
    );

    if (account.rows[0].mesa_id) {
      await client.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = $1", [account.rows[0].mesa_id]);
    }
    await registrarAuditoria(client, {
      usuarioId: actor.id,
      accion: 'COBRAR_CUENTA',
      entidad: 'cuentas',
      entidadId: cuentaId,
      detalle: { metodoPago, metodoPago2, montoPago2, comprobante, ...totals },
      ip: clientIp(req),
    });
    notificarMesas('mesa_actualizada');
    return { comprobante, cajero_nombre: actor.nombre, ...totals };
  });
}

app.get('/api/health', route(async (_req, res) => {
  const inicio = Date.now();
  try {
    await db.query('SELECT 1');
    // Obtener última migración aplicada
    const migRes = await db.query("SELECT id FROM app_migrations ORDER BY ejecutada_en DESC LIMIT 1");
    const ultimaMig = migRes.rowCount ? migRes.rows[0].id : 'ninguna';
    // Verificar que el directorio de uploads es escribible
    let uploadsOk = true;
    try {
      const probe = path.join(config.uploadsDir, `.health-${process.pid}.tmp`);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
    } catch { uploadsOk = false; }
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
    console.warn('⚠️ Health check con base de datos degradada:', error.message);
    res.status(503).json({ estado: 'error', version: '2.1.0', baseDeDatos: 'degradada', telegram: telegramActivo() ? 'activo' : 'inactivo' });
  }
}));

// ════════════════════════════════════════════════════════════════════════
// Endpoint PÚBLICO para pantalla de login (info del sistema)
// ════════════════════════════════════════════════════════════════════════
app.get('/api/sistema/info', async (_req, res) => {
  try {
    // Caja estado
    const cajaRes = await db.query("SELECT estado, monto_inicial FROM aperturas_caja WHERE fecha::date = CURRENT_DATE ORDER BY id DESC LIMIT 1");
    const cajaAbierta = cajaRes.rowCount && cajaRes.rows[0].estado === 'Abierta';
    const montoCaja = cajaRes.rowCount ? Number(cajaRes.rows[0].monto_inicial) : 0;

    // Cajera/cajero de turno: quien abrió la caja hoy
    const cajeraRes = await db.query(
      "SELECT u.nombre FROM aperturas_caja a JOIN usuarios u ON u.id = a.usuario_id WHERE a.estado = 'Abierta' AND a.fecha::date = CURRENT_DATE ORDER BY a.id DESC LIMIT 1"
    );
    const cajera = cajeraRes.rowCount ? cajeraRes.rows[0].nombre : null;

    // Sucursal / Negocio
    const negRes = await db.query('SELECT nombre_comercial, provincia, direccion, telefono FROM negocio_config ORDER BY id LIMIT 1');
    const negocio = negRes.rowCount ? negRes.rows[0] : { nombre_comercial: 'Chloe Restaurant', provincia: '', direccion: '', telefono: '' };

    // Mesas ocupadas
    const mesasRes = await db.query("SELECT COUNT(*) as total FROM mesas WHERE estado = 'Ocupada'");
    const mesasOcupadas = mesasRes.rowCount ? parseInt(mesasRes.rows[0].total) : 0;

    res.json({
      version: '2.1.0',
      caja: { abierta: cajaAbierta, monto: montoCaja },
      sucursal: negocio.provincia || 'No configurada',
      provincia: negocio.provincia || null,
      cajera,
      nombreNegocio: negocio.nombre_comercial || 'Chloe Restaurant',
      direccion: negocio.direccion,
      telefono: negocio.telefono,
      mesasOcupadas,
      horaServidor: new Date().toISOString(),
    });
  } catch (e) {
    res.json({ version: '2.1.0', caja: { abierta: false, monto: 0 }, sucursal: 'No disponible', provincia: null, cajera: null, error: true });
  }
});

app.get('/api/licencia/verificar', route(async (_req, res) => {
  const result = await db.queryUnscoped('SELECT fecha_instalacion, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1');
  if (!result.rowCount) return res.json({ bloqueado: false, esNuevo: true });
  const negocio = result.rows[0];
  if (negocio.licencia_bloqueada) return res.json({ bloqueado: true, motivo: 'La licencia se encuentra suspendida.', contacto: 'Comunícate con soporte técnico.' });
  if (negocio.duracion_meses === -1) return res.json({ bloqueado: false, tipo: 'Vitalicia' });
  const daysAllowed = negocio.duracion_meses > 0 ? negocio.duracion_meses * 30 : 7;
  const elapsedDays = (Date.now() - new Date(negocio.fecha_instalacion).getTime()) / 86400000;
  if (elapsedDays > daysAllowed) {
    return res.json({ bloqueado: true, motivo: 'El período de licencia ha finalizado.', contacto: 'Comunícate con soporte técnico.' });
  }
  return res.json({ bloqueado: false, diasRestantes: Math.ceil(daysAllowed - elapsedDays) });
}));

app.post('/api/dispositivo/registrar', route(async (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim();
  const headerDeviceId = String(req.get('x-device-id') || '').trim();
  if (!deviceId || deviceId.length > 100) throw httpError(400, 'Identificador de dispositivo inválido.');
  if (headerDeviceId && headerDeviceId !== deviceId) throw httpError(400, 'El identificador del dispositivo no coincide.');
  const navegador = String(req.body.navegador || '').slice(0, 300);
  const ip = clientIp(req);
  const result = await db.queryUnscoped(
    `INSERT INTO dispositivos (device_id, empresa_id, navegador, ip, ultimo_acceso)
     VALUES ($1, 1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (device_id) DO UPDATE
       SET navegador = $2, ip = $3, ultimo_acceso = CURRENT_TIMESTAMP
     RETURNING device_id, empresa_id, estado, activado_en, licencia_duracion, licencia_vencimiento`,
    [deviceId, navegador, ip]
  );
  const fila = result.rows[0];
  if (!fila) throw httpError(500, 'No se pudo registrar el dispositivo.');
  const vencido = fila.estado === 'Activo' && fila.licencia_vencimiento && new Date(fila.licencia_vencimiento).getTime() < Date.now();
  if (vencido) {
    await db.queryUnscoped("UPDATE dispositivos SET estado = 'Pendiente' WHERE device_id = $1", [fila.device_id]);
  }
  res.json({
    deviceId: fila.device_id,
    activado: fila.estado === 'Activo' && !vencido,
    vencido: Boolean(vencido),
    licenciaDuracion: fila.licencia_duracion || null,
    licenciaVencimiento: fila.licencia_vencimiento ? fila.licencia_vencimiento.toISOString() : null,
    empresaId: fila.empresa_id,
    tenantId: fila.empresa_id,
  });
}));

app.post('/api/dispositivo/activar', route(async (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim();
  const clave = String(req.body.clave || '').trim().toUpperCase();
  const ip = clientIp(req);
  if (!deviceId || deviceId.length > 100) throw httpError(400, 'Identificador de dispositivo inválido.');
  if (!clave) throw httpError(400, 'Ingresa la clave de activación del dispositivo.');

  let deviceRes = await db.queryUnscoped('SELECT id, empresa_id, estado, intentos_fallidos, clave_activacion FROM dispositivos WHERE device_id = $1', [deviceId]);
  if (!deviceRes.rowCount) {
    const navegador = String(req.get('user-agent') || '').slice(0, 300);
    deviceRes = await db.queryUnscoped(
      `INSERT INTO dispositivos (device_id, empresa_id, estado, navegador, ip)
       VALUES ($1, 1, 'Pendiente', $2, $3)
       ON CONFLICT (device_id) DO UPDATE SET ultimo_acceso = CURRENT_TIMESTAMP
       RETURNING id, empresa_id, estado, intentos_fallidos, clave_activacion`,
      [deviceId, navegador, ip]
    );
  }
  const dispositivo = deviceRes.rows[0];

  const claveHash = crypto.createHash('sha256').update(clave).digest('hex');
  let storedLicense = await db.queryUnscoped('SELECT empresa_id, duracion_codigo, activa, admin_pin_hash FROM licencias WHERE clave_hash = $1', [claveHash]).catch(() => ({ rowCount: 0, rows: [] }));

  // Si la clave fue generada por el Bot de Telegram / Propietario pero no está aún en la tabla de licencias,
  // la validamos por formato/firma y la registramos dinámicamente:
  if (!storedLicense.rowCount && clave !== config.licenseActivationKey) {
    const match = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){1,15})$/i.exec(clave);
    if (match) {
      const parsed = parsearDuracion(match[1]);
      if (parsed) {
        const pinInicial = String(crypto.randomInt(100000, 1000000));
        const pinHash = hashPin(pinInicial);
        const nuevaEmpresaId = await transaction(async (client) => {
          const emp = await client.query(
            `INSERT INTO empresas (nombre, slug) VALUES ($1, $2) RETURNING id`,
            [`Empresa ${clave.slice(-8)}`, `empresa-${crypto.randomUUID()}`],
          );
          await client.query(
            `INSERT INTO licencias (empresa_id, clave_hash, duracion_codigo, admin_pin_hash, activa)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [emp.rows[0].id, claveHash, match[1].toUpperCase(), pinHash],
          );
          return emp.rows[0].id;
        });
        storedLicense = {
          rowCount: 1,
          rows: [{
            empresa_id: nuevaEmpresaId,
            duracion_codigo: match[1].toUpperCase(),
            activa: true,
            admin_pin_hash: pinHash
          }]
        };
      }
    }
  }

  const empresaId = storedLicense.rowCount ? storedLicense.rows[0].empresa_id : 1;

  // 1) Clave maestra antigua (compatibilidad) → Vitalicia
  // 2) CHLOE-<DURACION>-<FIRMA> → valida firma y aplica la duración
  let licencia;
  let claveCanonica;
  if (storedLicense.rowCount && !storedLicense.rows[0].activa) throw httpError(403, 'La licencia está inactiva.');
  if (storedLicense.rowCount) {
    const parsed = parsearDuracion(storedLicense.rows[0].duracion_codigo);
    licencia = { vitalicia: parsed.vitalicia, meses: parsed.meses, codigo: storedLicense.rows[0].duracion_codigo };
    claveCanonica = clave;
  } else if (clave === config.licenseActivationKey) {
    if (dispositivo.empresa_id !== 1) throw httpError(403, 'La clave legacy solo puede usarse con la empresa LEGACY.');
    licencia = { vitalicia: true, meses: -1, codigo: 'L' };
    claveCanonica = config.licenseActivationKey;
  } else {
    const intentos = (dispositivo.intentos_fallidos || 0) + 1;
    await db.query('UPDATE dispositivos SET intentos_fallidos = $1 WHERE id = $2', [intentos, dispositivo.id]);
    throw httpError(401, 'Clave de activación no registrada o formato inválido.');
  }

  if (dispositivo.estado === 'Activo' && dispositivo.empresa_id === empresaId && dispositivo.clave_activacion === claveCanonica) {
    return res.json({ activado: true, empresaId: dispositivo.empresa_id, tenantId: dispositivo.empresa_id });
  }

  const activacion = await runWithRequestContext({ empresaId }, () => transaction(async (client) => {
    // Serializa activaciones concurrentes de la misma clave antes de contar.
    // PG10 no tiene hashtextextended (PG14+): se deriva la llave en Node.
    const lockKey = BigInt('0x' + claveHash.slice(0, 15));
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey]);
    const contador = await client.query(
      `SELECT COUNT(*)::int AS total FROM dispositivos
       WHERE estado = 'Activo' AND clave_activacion = $1 AND empresa_id = $2 AND id != $3`,
      [claveCanonica, empresaId, dispositivo.id],
    );
    if (contador.rows[0].total >= 2) {
      throw httpError(403, 'Esta clave de licencia ya tiene 2 dispositivos activos. Usa otra clave o gestiona los dispositivos activos.');
    }

    // El dispositivo pendiente puede estar en LEGACY; la reasignación queda
    // explícitamente limitada a la empresa de la licencia resuelta.
    if (dispositivo.empresa_id !== empresaId) await client.query("SELECT set_config('app.platform', 'true', true)");
    const vencimiento = licencia.vitalicia ? null : vencimientoDesdeMeses(licencia.meses);
    await client.query(
      `UPDATE dispositivos SET estado = 'Activo', activado_en = CURRENT_TIMESTAMP,
          intentos_fallidos = 0, licencia_duracion = $1, licencia_vencimiento = $2,
          clave_activacion = $3, empresa_id = $5 WHERE id = $4`,
      [licencia.codigo, vencimiento, claveCanonica, dispositivo.id, empresaId],
    );
    if (dispositivo.empresa_id !== empresaId) await client.query("SELECT set_config('app.platform', 'false', true)");

// Sólo se crea el negocio si aún no existe uno para esa empresa: evita
    // duplicados y cumple las columnas NOT NULL (razon_social, rnc, telefono,
    // direccion) con un rnc único por empresa (hay índice UNIQUE sobre rnc).
    const negocioExistente = await client.query('SELECT id FROM negocio_config WHERE empresa_id = $1 LIMIT 1', [empresaId]);
    if (!negocioExistente.rowCount) {
      const ncRnc = String(empresaId).padStart(11, '0');
      await client.query(
        `INSERT INTO negocio_config (empresa_id, nombre_comercial, razon_social, rnc, telefono, direccion, duracion_meses, estado_licencia)
         VALUES ($1, 'Mi Restaurante', 'Mi Restaurante', $2, '', '', $3, 'Activa')`,
        [empresaId, ncRnc, licencia.meses],
      );
    }
    await client.query(
      `INSERT INTO configuracion_sistema (empresa_id, setup_completado)
       VALUES ($1, FALSE) ON CONFLICT DO NOTHING`,
      [empresaId],
    );
    if (storedLicense.rowCount && storedLicense.rows[0].admin_pin_hash) {
      const admin = await client.query("SELECT 1 FROM usuarios WHERE empresa_id = $1 AND rol = 'Administrador' AND estado = 'Activo' LIMIT 1", [empresaId]);
      if (!admin.rowCount) {
        await client.query(
          `INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, requiere_cambio_pin, estado)
           VALUES ($1, 'Administrador Sistema', 'Administrador', NULL, $2, TRUE, 'Activo')`,
          [empresaId, storedLicense.rows[0].admin_pin_hash],
        );
      }
    }
    if (storedLicense.rowCount) await client.query('UPDATE licencias SET activada_en = COALESCE(activada_en, CURRENT_TIMESTAMP) WHERE clave_hash = $1 AND empresa_id = $2', [claveHash, empresaId]);

    const negocio = await client.query('SELECT id, duracion_meses FROM negocio_config WHERE empresa_id = $1 LIMIT 1', [empresaId]);
    if (negocio.rowCount && negocio.rows[0].duracion_meses !== -1) {
      if (licencia.vitalicia) {
        await client.query('UPDATE negocio_config SET duracion_meses = -1, licencia_bloqueada = FALSE WHERE id = $1 AND empresa_id = $2', [negocio.rows[0].id, empresaId]);
      } else if (vencimiento) {
        const diasRestantes = Math.max(0, Math.ceil((vencimiento - Date.now()) / 86400000));
        const nuevosMeses = Math.max(negocio.rows[0].duracion_meses || 0, Math.ceil(diasRestantes / 30));
        await client.query('UPDATE negocio_config SET duracion_meses = $1, licencia_bloqueada = FALSE WHERE id = $2 AND empresa_id = $3', [nuevosMeses, negocio.rows[0].id, empresaId]);
      }
    }
    await registrarAuditoria(client, {
      usuarioId: null, accion: 'ACTIVAR_DISPOSITIVO', entidad: 'dispositivos',
      entidadId: String(dispositivo.id), detalle: { deviceId, duracion: licencia.codigo, vitalicia: licencia.vitalicia }, ip,
    });
    return { vencimiento };
  }));
  const vencimiento = activacion.vencimiento;
  res.json({
    activado: true,
    empresaId,
    tenantId: empresaId,
    licenciaDuracion: licencia.codigo,
    vitalicia: licencia.vitalicia,
    licenciaVencimiento: vencimiento ? vencimiento.toISOString() : null,
    diasRestantes: vencimiento ? Math.max(0, Math.ceil((vencimiento - Date.now()) / 86400000)) : null,
    pinAdministradorGenerado: Boolean(storedLicense.rowCount && storedLicense.rows[0].admin_pin_hash),
  });
}));

app.get('/api/dispositivos', adminODueno, route(async (req, res) => {
  const empresaId = req.user?.empresaId || req.user?.empresa_id || 1;
  const query = req.dueno
    ? `SELECT id, device_id, nombre, navegador, ip, estado, intentos_fallidos, activado_en,
              licencia_duracion, licencia_vencimiento, creado_en, ultimo_acceso, empresa_id, clave_activacion
       FROM dispositivos ORDER BY creado_en DESC`
    : `SELECT id, device_id, nombre, navegador, ip, estado, intentos_fallidos, activado_en,
              licencia_duracion, licencia_vencimiento, creado_en, ultimo_acceso, empresa_id, clave_activacion
       FROM dispositivos WHERE empresa_id = $1 ORDER BY creado_en DESC`;
  const params = req.dueno ? [] : [empresaId];
  const result = await db.query(query, params);
  res.json({
    dispositivos: result.rows,
    limiteMaximo: 2,
    licenciaConfigurada: Boolean(config.licenseActivationKey),
    ...( req.dueno ? { claveMaestra: config.licenseActivationKey || '' } : {}),
  });
}));

app.post('/api/dispositivos/:id/estado', adminODueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const estado = String(req.body.estado || '').trim();
  if (!['Activo', 'Inactivo'].includes(estado)) throw httpError(400, 'Estado inválido.');
  const result = await db.query(
    `UPDATE dispositivos
       SET estado = $1::VARCHAR,
           activado_en = CASE WHEN $1::VARCHAR = 'Activo' THEN COALESCE(activado_en, CURRENT_TIMESTAMP) ELSE activado_en END,
           intentos_fallidos = 0
     WHERE id = $2 RETURNING id, device_id`,
    [estado, id]
  );
  if (!result.rowCount) throw httpError(404, 'Dispositivo no encontrado.');
  res.json({ ok: true, dispositivo: result.rows[0] });
}));

app.delete('/api/dispositivos/:id', adminODueno, route(async (req, res) => {
  const id = Number(req.params.id);
  if (!id || id <= 0) throw httpError(400, 'ID de dispositivo inválido.');
  const empresaId = req.user?.empresaId || req.user?.empresa_id || 1;
  const query = req.dueno
    ? 'DELETE FROM dispositivos WHERE id = $1 RETURNING id, device_id'
    : 'DELETE FROM dispositivos WHERE id = $1 AND empresa_id = $2 RETURNING id, device_id';
  const params = req.dueno ? [id] : [id, empresaId];
  const result = await db.query(query, params);
  if (!result.rowCount) throw httpError(404, 'Dispositivo no encontrado.');
  res.json({ ok: true, mensaje: 'Dispositivo eliminado correctamente.', id });
}));

// ──── Planes de licencia (público) ────
app.get('/api/planes', route(async (_req, res) => {
  const result = await db.query(
    `SELECT id, nombre, duracion_codigo, precio, moneda, destacado, orden
     FROM planes_licencia WHERE activo = TRUE ORDER BY orden, id`
  );
  res.json({ planes: result.rows });
}));

// ──── Métodos de pago (público, para la web de venta) ────
app.get('/api/metodos-pago', route(async (_req, res) => {
  const result = await db.query(
    `SELECT id, tipo, nombre, titular, detalle, dato1, dato2, dato3, link_pago, orden
     FROM metodos_pago WHERE activo = TRUE ORDER BY orden, id`
  );
  res.json({ metodos: result.rows });
}));

// ──── Solicitud de licencia (público, desde el formulario de registro) ────
app.post('/api/solicitud-licencia', route(async (req, res) => {
  const planId = Number(req.body.plan_id);
  const propietario = String(req.body.propietario || '').trim();
  const negocio = String(req.body.negocio || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const email = String(req.body.email || '').trim();
  const provincia = String(req.body.provincia || '').trim();
  const notas = String(req.body.notas || '').trim();

  if (!Number.isInteger(planId) || planId <= 0) {
    throw httpError(400, 'Favor seleccionar el plan que más se ajuste a sus necesidades.');
  }

  if (!propietario || !negocio || !telefono || !email) {
    throw httpError(400, 'Completa los datos de la solicitud: propietario, negocio, teléfono y correo.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'El correo electrónico no es válido.');

  const planRes = await db.query('SELECT id, nombre FROM planes_licencia WHERE id = $1 AND activo = TRUE', [planId]);
  if (!planRes.rows[0]) {
    throw httpError(400, 'El plan seleccionado no es válido o no está disponible.');
  }
  const planNombre = planRes.rows[0].nombre;

  const tokenPago = crypto.randomBytes(24).toString('hex');
  const result = await db.query(
    `INSERT INTO solicitudes_licencia (plan_id, plan_nombre, propietario, negocio, telefono, email, provincia, notas, token_pago)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, token_pago`,
    [planId, planNombre, propietario, negocio, telefono, email, provincia || null, notas || null, tokenPago]
  );

  const nuevaId = result.rows[0].id;
  try {
    const nueva = await obtenerSolicitudPorId(nuevaId);
    if (nueva) notificarSolicitud(nueva);
  } catch (err) {
    console.warn('Telegram: no se pudo notificar la nueva solicitud:', err.message);
  }

  res.json({ mensaje: 'Tu solicitud fue enviada correctamente. Te contactaremos con tu clave de activación.', id: nuevaId, tokenPago: result.rows[0].token_pago });
}));

// ──── Confirmación de pago (público, desde la pantalla de métodos de pago) ────
app.post('/api/solicitud-licencia/:id/confirmar-pago', route(async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.body.token || '').trim();
  const metodoId = Number(req.body.metodo_id);
  const comprobante = String(req.body.comprobante || '').trim() || null;
  if (!token || !Number.isInteger(metodoId) || metodoId <= 0) {
    throw httpError(400, 'Faltan datos para confirmar el pago.');
  }
  const sol = await db.query(
    'SELECT id, token_pago, estado FROM solicitudes_licencia WHERE id = $1',
    [id]
  );
  if (!sol.rowCount) throw httpError(404, 'Solicitud no encontrada.');
  if (!sol.rows[0].token_pago || sol.rows[0].token_pago !== token) {
    throw httpError(403, 'Token de pago inválido.');
  }
  const met = await db.query('SELECT nombre FROM metodos_pago WHERE id = $1 AND activo = TRUE', [metodoId]);
  if (!met.rowCount) throw httpError(400, 'Método de pago no disponible.');
  const estadoActual = sol.rows[0].estado;
  const result = await db.query(
    `UPDATE solicitudes_licencia
        SET estado = 'Pagada',
            metodo_pago = COALESCE(metodo_pago, $1),
            comprobante = COALESCE($2, comprobante),
            pagada_en = COALESCE(pagada_en, CURRENT_TIMESTAMP)
      WHERE id = $3 RETURNING id, estado, metodo_pago, pagada_en`,
    [met.rows[0].nombre, comprobante, id]
  );
  await generarFacturaSolicitud(id);
  await registrarAuditoria(db, { usuarioId: null, accion: 'CONFIRMAR_PAGO', entidad: 'solicitudes_licencia', entidadId: String(id), detalle: { metodo: met.rows[0].nombre, estadoAnterior: estadoActual }, ip: clientIp(req) });
  try {
    const pagada = await obtenerSolicitudPorId(id);
    if (pagada) notificarPago(pagada);
  } catch (err) {
    console.warn('Telegram: no se pudo notificar el pago:', err.message);
  }
  res.json({ ok: true, solicitud: result.rows[0] });
}));

// ──── Facturas de activación (manejo interno del dueño) ────
// Genera el número de factura y congela el monto del plan al momento del pago.
async function generarFacturaSolicitud(solicitudId) {
  const sol = await db.query(
    `SELECT id, numero_factura, plan_id
       FROM solicitudes_licencia WHERE id = $1`,
    [solicitudId]
  );
  if (!sol.rowCount || sol.rows[0].numero_factura) return;
  const fila = sol.rows[0];
  const numero = `FAC-${String(fila.id).padStart(6, '0')}`;
  let monto = 0;
  let moneda = 'RD$';
  if (fila.plan_id) {
    const plan = await db.query('SELECT precio, moneda FROM planes_licencia WHERE id = $1', [fila.plan_id]);
    if (plan.rowCount) {
      monto = Number(plan.rows[0].precio || 0);
      moneda = plan.rows[0].moneda || 'RD$';
    }
  }
  await db.query(
    `UPDATE solicitudes_licencia
        SET numero_factura = $1, monto = $2, moneda = $3
      WHERE id = $4`,
    [numero, monto, moneda, fila.id]
  );
}

async function obtenerSolicitudPorId(id) {
  const res = await db.query(
    `SELECT s.id, s.plan_id, s.plan_nombre, s.propietario, s.negocio, s.telefono, s.email, s.provincia, s.notas,
            s.estado, s.metodo_pago, s.comprobante, s.monto, s.moneda, s.numero_factura, s.pagada_en, s.creado_en, s.atendida_en,
            s.clave_generada, s.clave_pin_inicial, s.clave_enviada_en,
            p.duracion_codigo AS plan_duracion
       FROM solicitudes_licencia s
       LEFT JOIN planes_licencia p ON p.id = s.plan_id
      WHERE s.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function cambiarEstadoSolicitud(id, estado, ip = null, origen = null) {
  if (!['Pendiente', 'Pagada', 'Atendida', 'Rechazada'].includes(estado)) return { error: 'Estado inválido.' };
  
  if (estado === 'Rechazada') {
    const result = await db.query('DELETE FROM solicitudes_licencia WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) return { error: 'Solicitud no encontrada.' };
    await registrarAuditoria(db, { usuarioId: null, accion: 'RECHAZAR_Y_ELIMINAR_SOLICITUD', entidad: 'solicitudes_licencia', entidadId: String(id), detalle: { origen }, ip: ip || null });
    return { ok: true, eliminada: true, solicitud: { id, estado: 'Rechazada' } };
  }

  const result = await db.query(
    `UPDATE solicitudes_licencia
        SET estado = $1::VARCHAR,
            atendida_en = CASE WHEN $1::VARCHAR = 'Pendiente' THEN NULL ELSE COALESCE(atendida_en, CURRENT_TIMESTAMP) END,
            pagada_en = CASE WHEN $1::VARCHAR = 'Pagada' THEN COALESCE(pagada_en, CURRENT_TIMESTAMP) ELSE pagada_en END
      WHERE id = $2 RETURNING id, estado, numero_factura`,
    [estado, id]
  );
  if (!result.rowCount) return { error: 'Solicitud no encontrada.' };
  const solicitud = result.rows[0];
  if (estado === 'Pagada') {
    await generarFacturaSolicitud(id);
    const actualizada = await obtenerSolicitudPorId(id);
    if (actualizada) solicitud.numero_factura = actualizada.numero_factura;
  }
  await registrarAuditoria(db, { usuarioId: null, accion: 'ATENDER_SOLICITUD', entidad: 'solicitudes_licencia', entidadId: String(id), detalle: { estado, origen }, ip: ip || null });
  return { ok: true, solicitud };
}

async function marcarClaveEnviada(id) {
  await db.query(
    `UPDATE solicitudes_licencia SET clave_enviada_en = COALESCE(clave_enviada_en, CURRENT_TIMESTAMP)
      WHERE id = $1`,
    [id],
  );
}

function generarClaveLicencia(dur) {
  const duracion = String(dur || '').trim().toUpperCase();
  const parsed = parsearDuracion(duracion);
  if (!parsed) return { error: 'Duración inválida. Usa por ejemplo 7D, 15D, 30D, 90D, 6M, 12M, 24M o L.' };
  const firma = crypto.randomBytes(20).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
  return { clave: `CHLOE-${duracion}-${firma}`, duracion, vitalicia: parsed.vitalicia };
}

async function crearLicenciaConAdministrador(dur) {
  const resultado = generarClaveLicencia(dur);
  if (resultado.error) return resultado;
  const pinInicial = String(crypto.randomInt(100000, 1000000));
  const pinHash = hashPin(pinInicial);
  const licencia = await transaction(async (client) => {
    const empresa = await client.query(
      `INSERT INTO empresas (nombre, slug) VALUES ($1, $2) RETURNING id`,
      [`Empresa ${resultado.clave.slice(-8)}`, `empresa-${crypto.randomUUID()}`],
    );
    await client.query(
      `INSERT INTO licencias (empresa_id, clave_hash, clave_texto, duracion_codigo, admin_pin_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [empresa.rows[0].id, crypto.createHash('sha256').update(resultado.clave).digest('hex'), resultado.clave, resultado.duracion, pinHash],
    );
    return empresa.rows[0].id;
  });
  return { ...resultado, empresaId: licencia, pinInicial };
}

function validarClaveLicencia(clave) {
  const c = String(clave || '').trim().toUpperCase();
  if (!c) return { error: 'Ingresa la clave a verificar.' };
  if (config.licenseActivationKey && c === config.licenseActivationKey) {
    return { valida: true, duracion: 'L', vitalicia: true };
  }
  const match = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){1,15})$/i.exec(c);
  if (!match) return { error: 'Formato inválido. Usa CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX.' };
  const parsed = parsearDuracion(match[1]);
  if (!parsed) return { error: 'Duración inválida.' };
  return { valida: true, registrada: false, duracion: match[1].toUpperCase(), vitalicia: parsed.vitalicia };
}

app.get('/api/dueno/facturas', requireDueno, route(async (_req, res) => {
  const result = await db.query(
    `SELECT id, numero_factura, plan_id, plan_nombre, propietario, negocio, telefono, email,
            provincia, metodo_pago, comprobante, monto, moneda, estado, pagada_en, creado_en
       FROM solicitudes_licencia
      WHERE numero_factura IS NOT NULL
      ORDER BY pagada_en DESC NULLS LAST, creado_en DESC`
  );
  res.json({ facturas: result.rows });
}));

// ──── Gestión de Licencias Usadas y Activas (Panel Dueño) ────
app.get('/api/dueno/licencias', requireDueno, route(async (_req, res) => {
  const result = await db.query(
    `SELECT
       l.id,
       l.empresa_id,
       l.clave_hash,
       COALESCE(l.clave_texto, 'CHLOE-' || l.duracion_codigo || '-******') AS clave,
       l.duracion_codigo,
       l.activa,
       l.revocada,
       l.motivo_revocacion,
       l.creado_en,
       l.activada_en,
       l.vencimiento,
       e.nombre AS empresa_nombre,
       cfg.nombre_negocio,
       (SELECT COUNT(*)::int FROM dispositivos d WHERE d.empresa_id = l.empresa_id) AS total_dispositivos,
       (SELECT COUNT(*)::int FROM dispositivos d WHERE d.empresa_id = l.empresa_id AND d.estado = 'Activo') AS dispositivos_activos,
       (SELECT s.propietario FROM solicitudes_licencia s WHERE s.clave_generada = l.clave_texto LIMIT 1) AS propietario,
       (SELECT s.email FROM solicitudes_licencia s WHERE s.clave_generada = l.clave_texto LIMIT 1) AS email,
       (SELECT s.telefono FROM solicitudes_licencia s WHERE s.clave_generada = l.clave_texto LIMIT 1) AS telefono
     FROM licencias l
     JOIN empresas e ON e.id = l.empresa_id
     LEFT JOIN configuracion_sistema cfg ON cfg.empresa_id = l.empresa_id
     ORDER BY l.creado_en DESC`
  );
  res.json({ licencias: result.rows });
}));

app.post('/api/dueno/licencias/:id/revocar', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const motivo = String(req.body.motivo || 'Revocada por el propietario').trim();
  const lic = await db.query('SELECT id, empresa_id FROM licencias WHERE id = $1', [id]);
  if (!lic.rowCount) throw httpError(404, 'Licencia no encontrada.');
  const empresaId = lic.rows[0].empresa_id;

  await transaction(async (client) => {
    await client.query('UPDATE licencias SET activa = FALSE, revocada = TRUE, motivo_revocacion = $1 WHERE id = $2', [motivo, id]);
    await client.query("UPDATE dispositivos SET estado = 'Inactivo' WHERE empresa_id = $1", [empresaId]);
    await client.query('UPDATE negocio_config SET licencia_bloqueada = TRUE WHERE empresa_id = $1', [empresaId]);
    await client.query('DELETE FROM app_sessions WHERE empresa_id = $1', [empresaId]);
  });

  res.json({ ok: true, mensaje: 'Licencia revocada y terminales bloqueadas.' });
}));

app.post('/api/dueno/licencias/:id/reactivar', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const lic = await db.query('SELECT id, empresa_id FROM licencias WHERE id = $1', [id]);
  if (!lic.rowCount) throw httpError(404, 'Licencia no encontrada.');
  const empresaId = lic.rows[0].empresa_id;

  await transaction(async (client) => {
    await client.query('UPDATE licencias SET activa = TRUE, revocada = FALSE, motivo_revocacion = NULL WHERE id = $1', [id]);
    await client.query("UPDATE dispositivos SET estado = 'Activo' WHERE empresa_id = $1", [empresaId]);
    await client.query('UPDATE negocio_config SET licencia_bloqueada = FALSE WHERE empresa_id = $1', [empresaId]);
  });

  res.json({ ok: true, mensaje: 'Licencia reactivada correctamente.' });
}));

app.delete('/api/dueno/licencias/:id', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const lic = await db.query('SELECT id, empresa_id FROM licencias WHERE id = $1', [id]);
  if (!lic.rowCount) throw httpError(404, 'Licencia no encontrada.');
  const empresaId = lic.rows[0].empresa_id;

  await transaction(async (client) => {
    await client.query('DELETE FROM licencias WHERE id = $1', [id]);
    if (empresaId !== 1) {
      await client.query('DELETE FROM empresas WHERE id = $1', [empresaId]);
    }
  });

  res.json({ ok: true, mensaje: 'Licencia eliminada permanentemente del sistema.' });
}));

// ──── Panel del Propietario (acceso universal del dueño, sin limitaciones de rate-limit) ────
app.post('/api/dueno/login', route(async (req, res) => {
  verificarRateLimit(clientIp(req));
  const pin = String(req.body.pin || '').trim();
  assertValidPin(pin);

  // Obtener hash del PIN del dueño desde BD o config
  const cfg = await db.queryUnscoped('SELECT owner_pin_hash FROM configuracion_sistema ORDER BY id LIMIT 1');
  const storedHash = cfg.rows[0]?.owner_pin_hash;

  let esValido = false;
  if (config.ownerPin && pin === String(config.ownerPin).trim()) {
    esValido = true;
  } else if (storedHash && verifyPin(pin, storedHash)) {
    esValido = true;
  } else if (!storedHash) {
    const admins = await db.queryUnscoped("SELECT pin_hash FROM usuarios WHERE rol = 'Administrador' AND estado = 'Activo' AND pin_hash IS NOT NULL");
    if (admins.rows.some((admin) => verifyPin(pin, admin.pin_hash))) {
      esValido = true;
      const nuevoHash = hashPin(pin);
      await db.queryUnscoped(
        'UPDATE configuracion_sistema SET owner_pin_hash = $1, owner_pin_longitud = $2, actualizado_en = CURRENT_TIMESTAMP WHERE owner_pin_hash IS NULL',
        [nuevoHash, pin.length],
      );
    }
  }

  if (!esValido) {
    registrarIntentoFallido(clientIp(req));
    return res.status(401).json({ error: 'PIN de propietario incorrecto.' });
  }

  // Al autenticarse el dueño con éxito, liberamos cualquier bloqueo previo en esta IP
  registrarIntentoExitoso(clientIp(req));

  const exp = Date.now() + 12 * 3600 * 1000;
  res.json({ token: firmarDuenoTok({ rol: 'Dueno', exp }), expiraEn: new Date(exp).toISOString() });
}));

// Reset de datos de prueba para el Propietario (requiere PIN maestro y confirmación explícita)
app.post('/api/dueno/reset-pruebas', requireDueno, route(async (req, res) => {
  if (String(req.body.confirmacion || '').trim() !== 'BORRAR PRUEBAS') {
    throw httpError(400, 'Escribe BORRAR PRUEBAS para confirmar esta operación.');
  }

  try {
    await transaction(async (client) => {
      await client.query("SELECT set_config('app.platform', 'true', false)");
      // Preservar el PIN del dueño: es independiente de los datos de prueba y no
      // debe perderse al resetear (el dueño conserva el control total del sistema).
      const owner = await client.query('SELECT owner_pin_hash, owner_pin_longitud FROM configuracion_sistema WHERE id = 1');
      const ownerHash = owner.rows[0]?.owner_pin_hash || null;
      const ownerLongitud = owner.rows[0]?.owner_pin_longitud || 6;

      // Borrar en orden correcto para respetar las claves foráneas.
      // (No se usa session_replication_role: requiere superusuario y en producción
      //  el usuario de BD no lo es, lo que provocaba error 500 al dueño.)
      await client.query(`DELETE FROM auditoria_operaciones`);
      await client.query(`DELETE FROM receta_productos`);
      await client.query(`DELETE FROM dgii_secuencias`);
      await client.query(`DELETE FROM inventario_movimientos`);
      await client.query(`DELETE FROM app_sessions`);
      await client.query(`DELETE FROM aperturas_caja`);
      await client.query(`DELETE FROM arqueos_caja`);
      await client.query(`DELETE FROM cuentas_bancarias`);
      await client.query(`DELETE FROM historial_cierres`);
      await client.query(`DELETE FROM dispositivos`);
      await client.query(`DELETE FROM solicitudes_licencia`);
      await client.query(`DELETE FROM cuenta_detalles`);
      await client.query(`DELETE FROM cuentas`);
      await client.query(`DELETE FROM mesas`);
      await client.query(`DELETE FROM clientes_frecuentes`);
      await client.query(`DELETE FROM ingredientes`);
      await client.query(`DELETE FROM productos`);
      await client.query(`DELETE FROM menu_categorias`);
      await client.query(`DELETE FROM menu_guarniciones`);
      await client.query(`DELETE FROM menu_terminos`);
      await client.query(`DELETE FROM usuarios`);
      await client.query(`DELETE FROM licencias`);
      await client.query(`DELETE FROM configuracion_sistema`);
      await client.query(`DELETE FROM empresas`);
      await client.query(`DELETE FROM negocio_config`);
      await client.query(`DELETE FROM dgii_config`);
      // Reset sequences (ignore errors for missing sequences)
      const sequences = [
        'usuarios', 'empresas', 'licencias', 'productos', 'mesas', 'cuentas',
        'cuenta_detalles', 'aperturas_caja', 'arqueos_caja', 'dispositivos',
        'solicitudes_licencia', 'auditoria_operaciones', 'inventario_movimientos',
        'receta_productos', 'dgii_secuencias', 'cuentas_bancarias',
        'historial_cierres', 'menu_categorias', 'menu_guarniciones',
        'menu_terminos', 'clientes_frecuentes', 'ingredientes'
      ];
      for (const seq of sequences) {
        try {
          await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)`, [seq]);
        } catch (e) {
          // Ignore missing sequences
        }
      }
      // Re-crear la empresa raíz y la configuración base para que el Setup Wizard
      // pueda iniciar de nuevo (setup_completado = FALSE).
      await client.query(`
        INSERT INTO empresas (id, nombre, slug, estado)
        VALUES (1, 'Mi Restaurante', 'mi-restaurante', 'Activa')
        ON CONFLICT (id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO configuracion_sistema
          (id, empresa_id, nombre_negocio, tema_activo, estilo_login, setup_completado, owner_pin_hash, owner_pin_longitud)
        VALUES (1, 1, 'Mi Restaurante', 'noche', 'moderno', FALSE, $1, $2)
        ON CONFLICT (id) DO UPDATE SET
          nombre_negocio = 'Mi Restaurante',
          setup_completado = FALSE,
          owner_pin_hash = COALESCE($1, configuracion_sistema.owner_pin_hash),
          owner_pin_longitud = COALESCE($2, configuracion_sistema.owner_pin_longitud)
      `, [ownerHash, ownerLongitud]);
      await client.query(`
        INSERT INTO negocio_config (id, nombre_comercial, empresa_id)
        VALUES (1, 'Mi Restaurante', 1)
        ON CONFLICT (id) DO UPDATE SET
          nombre_comercial = 'Mi Restaurante',
          empresa_id = 1
      `);
    });
    await registrarAuditoria(db, { usuarioId: null, accion: 'RESET_PRUEBAS', entidad: 'sistema', detalle: { ip: clientIp(req) }, ip: clientIp(req) });
    res.json({ ok: true, mensaje: 'Datos de prueba eliminados exitosamente. El Setup Wizard está listo para iniciar.' });
  } catch (err) {
    console.error('RESET_PRUEBAS error:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor: ' + err.message });
  }
}));

app.get('/api/dueno/resumen', requireDueno, route(async (_req, res) => {
  const [devices, solicitudes, planes, negocio, facturas, ownerCfg] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Activo')::int AS activos FROM dispositivos"),
    db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Pendiente')::int AS pendientes, COUNT(*) FILTER (WHERE estado = 'Pagada')::int AS pagadas FROM solicitudes_licencia"),
    db.query('SELECT COUNT(*)::int AS total FROM planes_licencia WHERE activo = TRUE'),
    db.query('SELECT nombre_comercial, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1'),
    db.query('SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto_total FROM solicitudes_licencia WHERE numero_factura IS NOT NULL'),
    db.query('SELECT owner_pin_hash IS NOT NULL AS owner_pin_configurado FROM configuracion_sistema WHERE id = 1'),
  ]);
  res.json({
    dispositivos: devices.rows[0],
    solicitudes: solicitudes.rows[0],
    planes: planes.rows[0],
    negocio: negocio.rows[0] || null,
    facturas: facturas.rows[0],
    claveMaestra: config.licenseActivationKey || '',
    ownerPinConfigurado: ownerCfg.rows[0]?.owner_pin_configurado || false,
  });
}));

app.get('/api/dueno/planes', requireDueno, route(async (_req, res) => {
  const result = await db.query(
    'SELECT * FROM planes_licencia ORDER BY orden, id'
  );
  res.json({ planes: result.rows });
}));

app.post('/api/dueno/planes', requireDueno, route(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const duracionCodigo = String(req.body.duracion_codigo || '').trim().toUpperCase();
  const precio = Number(req.body.precio);
  const moneda = String(req.body.moneda || 'RD$').trim() || 'RD$';
  const destacado = Boolean(req.body.destacado);
  const activo = req.body.activo === false ? false : true;
  const orden = Number(req.body.orden || 0);
  if (!nombre) throw httpError(400, 'El nombre del plan es obligatorio.');
  if (!parsearDuracion(duracionCodigo)) throw httpError(400, 'Código de duración inválido. Usa por ejemplo 30D, 90D, 6M, 12M o L.');
  if (!Number.isFinite(precio) || precio < 0) throw httpError(400, 'Precio inválido.');
  const result = await db.query(
    `INSERT INTO planes_licencia (nombre, duracion_codigo, precio, moneda, destacado, activo, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [nombre, duracionCodigo, precio, moneda, destacado, activo, orden]
  );
  await registrarAuditoria(db, { usuarioId: null, accion: 'CREAR_PLAN', entidad: 'planes_licencia', entidadId: String(result.rows[0].id), ip: clientIp(req) });
  res.json({ plan: result.rows[0] });
}));

app.put('/api/dueno/planes/:id', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const nombre = String(req.body.nombre || '').trim();
  const duracionCodigo = String(req.body.duracion_codigo || '').trim().toUpperCase();
  const precio = Number(req.body.precio);
  const moneda = String(req.body.moneda || 'RD$').trim() || 'RD$';
  const destacado = Boolean(req.body.destacado);
  const activo = req.body.activo === false ? false : true;
  const orden = Number(req.body.orden || 0);
  if (!nombre) throw httpError(400, 'El nombre del plan es obligatorio.');
  if (!parsearDuracion(duracionCodigo)) throw httpError(400, 'Código de duración inválido.');
  if (!Number.isFinite(precio) || precio < 0) throw httpError(400, 'Precio inválido.');
  const result = await db.query(
    `UPDATE planes_licencia
        SET nombre = $1, duracion_codigo = $2, precio = $3, moneda = $4, destacado = $5, activo = $6, orden = $7
      WHERE id = $8 RETURNING *`,
    [nombre, duracionCodigo, precio, moneda, destacado, activo, orden, id]
  );
  if (!result.rowCount) throw httpError(404, 'Plan no encontrado.');
  await registrarAuditoria(db, { usuarioId: null, accion: 'ACTUALIZAR_PLAN', entidad: 'planes_licencia', entidadId: String(id), ip: clientIp(req) });
  res.json({ plan: result.rows[0] });
}));

app.delete('/api/dueno/planes/:id', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.query('DELETE FROM planes_licencia WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw httpError(404, 'Plan no encontrado.');
  await registrarAuditoria(db, { usuarioId: null, accion: 'ELIMINAR_PLAN', entidad: 'planes_licencia', entidadId: String(id), ip: clientIp(req) });
  res.json({ ok: true });
}));

app.get('/api/dueno/solicitudes', requireDueno, route(async (_req, res) => {
  const result = await db.query(
    `SELECT s.*, p.duracion_codigo AS plan_duracion
       FROM solicitudes_licencia s
       LEFT JOIN planes_licencia p ON p.id = s.plan_id
      ORDER BY s.creado_en DESC`
  );
  res.json({ solicitudes: result.rows });
}));

app.put('/api/dueno/solicitudes/:id/estado', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const estado = String(req.body.estado || '').trim();
  const resultado = await cambiarEstadoSolicitud(id, estado, clientIp(req), 'panel-dueno');
  if (resultado.error) throw httpError(404, resultado.error);
  res.json({ ok: true, solicitud: resultado.solicitud });
}));

// Genera (y envía por Telegram) la clave de activación correspondiente a una
// solicitud, leyendo nombre del negocio y propietario registrados.
app.post('/api/dueno/solicitudes/:id/generar-clave', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const solicitud = await obtenerSolicitudPorId(id);
  if (!solicitud) throw httpError(404, 'Solicitud no encontrada.');
  if (['Rechazada'].includes(solicitud.estado)) throw httpError(400, 'Esta solicitud fue rechazada y no puede generar clave.');

  // Una misma solicitud genera una única clave: evita duplicar licencias.
  if (solicitud.clave_generada) {
    if (!solicitud.clave_enviada_en) await marcarClaveEnviada(id);
    res.json({
      clave: solicitud.clave_generada,
      duracion: String(solicitud.plan_duracion || solicitud.plan_nombre || 'L'),
      vitalicia: solicitud.plan_duracion ? parsearDuracion(solicitud.plan_duracion)?.vitalicia === true : false,
      pinInicial: solicitud.clave_pin_inicial || '',
      reutilizada: true,
      solicitud: await obtenerSolicitudPorId(id),
    });
    return;
  }

  // Duración: la que envía el panel dueño, o la del plan elegido, o 30D.
  let dur = String(req.body.duracion || '').trim().toUpperCase();
  if (!dur && solicitud.plan_duracion) dur = solicitud.plan_duracion;
  if (!dur) dur = '30D';

  const resultado = await crearLicenciaConAdministrador(dur);
  if (resultado.error) throw httpError(400, resultado.error);

  await transaction(async (client) => {
    await client.query(
      `UPDATE solicitudes_licencia
          SET clave_generada = $1, clave_pin_inicial = $2, clave_enviada_en = CURRENT_TIMESTAMP,
              estado = 'Atendida',
              atendida_en = COALESCE(atendida_en, CURRENT_TIMESTAMP)
        WHERE id = $3`,
      [resultado.clave, String(resultado.pinInicial || ''), id],
    );
  });

  await registrarAuditoria(db, {
    usuarioId: null, accion: 'ENTREGAR_CLAVE', entidad: 'solicitudes_licencia',
    entidadId: String(id), detalle: { propietario: solicitud.propietario, negocio: solicitud.negocio, duracion: resultado.duracion }, ip: clientIp(req),
  });

  // Envía la clave por Telegram al chat del propietario con la info del cliente.
  let enviadaPorTelegram = false;
  try {
    const actualizada = await obtenerSolicitudPorId(id);
    await enviarClaveActivacion(actualizada || solicitud, resultado.clave, resultado.pinInicial);
    enviadaPorTelegram = true;
  } catch (err) {
    console.warn('Telegram: no se pudo enviar la clave de activación:', err.message);
  }

  res.json({
    clave: resultado.clave,
    duracion: resultado.duracion,
    vitalicia: resultado.vitalicia,
    pinInicial: resultado.pinInicial,
    empresaId: resultado.empresaId,
    reutilizada: false,
    enviadaPorTelegram,
    solicitud: await obtenerSolicitudPorId(id),
  });
}));

app.delete('/api/dueno/solicitudes/:id', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.query('DELETE FROM solicitudes_licencia WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw httpError(404, 'Solicitud no encontrada.');
  await registrarAuditoria(db, { usuarioId: null, accion: 'ELIMINAR_SOLICITUD', entidad: 'solicitudes_licencia', entidadId: String(id), ip: clientIp(req) });
  res.json({ ok: true, mensaje: 'Solicitud eliminada correctamente.', id });
}));

app.post('/api/dueno/solicitudes/:id/enviar-email', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const solicitud = await obtenerSolicitudPorId(id);
  if (!solicitud) throw httpError(404, 'Solicitud no encontrada.');
  if (!solicitud.email) throw httpError(400, 'La solicitud no tiene correo electrónico registrado.');
  if (!solicitud.clave_generada) throw httpError(400, 'Genera primero la clave de activación antes de enviarla.');

  const nombreCliente = solicitud.propietario || 'Estimado Cliente';
  const nombreNegocio = solicitud.negocio || 'tu Restaurante';
  const plan = solicitud.plan_nombre || 'Plan POS';
  const clave = solicitud.clave_generada;
  const pin = solicitud.clave_pin_inicial || config.bootstrapAdminPin || '041120';
  const urlActivacion = 'https://chloerestaurant.lat/activacion';

  const asunto = `🔑 Licencia y Pasos de Activación — ${nombreNegocio}`;

  const textoPlano = `¡Hola ${nombreCliente}!

Tu licencia para ${nombreNegocio} ha sido generada con éxito.

============================================================
DATOS DE TU LICENCIA POS
============================================================
• Plan: ${plan}
• Clave de Activación: ${clave}
• PIN Inicial Administrador: ${pin}
• Enlace de Activación: ${urlActivacion}

============================================================
PASOS PARA ACTIVAR TU RESTAURANTE:
============================================================
1. Abre tu navegador web en la terminal o tableta del restaurante.
2. Ingresa al enlace de activación: ${urlActivacion}
3. Pega o escribe tu Clave de Activación: ${clave}
4. Completa el Asistente de Configuración (Wizard):
   - Personaliza el Nombre de tu Negocio y Logo
   - Configura tu RNC y datos fiscales
   - Cambia o confirma tu PIN de Administrador
5. ¡Listo! Tu sistema POS quedará 100% activo y personalizado.

============================================================
CANALES DE SOPORTE Y CONTACTO:
============================================================
¿Necesitas ayuda con la instalación o configuración?
• WhatsApp Oficial: +1 (829) 370-0708
• Telegram Soporte: https://t.me/chloerest_bot
• Correo Electrónico: soporte@chloerestaurant.lat
• Portal Web: https://chloerestaurant.lat

¡Gracias por elegir ChloeRestaurant POS!
`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0c101d; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
      <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 30px 24px; text-align: center; border-bottom: 2px solid #f5b83d;">
        <h1 style="color: #f5b83d; margin: 0; font-size: 24px;">🍽️ ChloeRestaurant POS</h1>
        <p style="color: #94a3b8; margin: 6px 0 0; font-size: 14px;">Activación de Licencia Comercial</p>
      </div>

      <div style="padding: 28px 24px;">
        <p style="font-size: 16px; margin: 0 0 16px;">¡Hola <strong>${nombreCliente}</strong>!</p>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          Tu licencia para <strong>${nombreNegocio}</strong> está lista. A continuación te entregamos los datos de acceso y los pasos para activar tu sistema.
        </p>

        <!-- Recuadro Clave -->
        <div style="background: #1e2438; border: 1.5px dashed #f5b83d; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Tu Clave de Activación:</div>
          <div style="font-family: monospace; font-size: 18px; font-weight: bold; color: #f5b83d; word-break: break-all; letter-spacing: 1px;">${clave}</div>
          <div style="margin-top: 12px; font-size: 13px; color: #cbd5e1;">
            PIN Inicial de Administrador: <strong style="color: #00f576; font-family: monospace; font-size: 15px;">${pin}</strong>
          </div>
          <div style="margin-top: 6px; font-size: 12px; color: #94a3b8;">Plan Contratado: <strong>${plan}</strong></div>
        </div>

        <!-- Pasos -->
        <div style="background: #131929; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: #fff; margin: 0 0 14px; font-size: 15px;">🚀 Pasos para realizar la activación:</h3>
          <ol style="color: #cbd5e1; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Abre tu navegador en la computadora o tableta de tu restaurante.</li>
            <li>Ingresa a: <a href="${urlActivacion}" style="color: #38bdf8; text-decoration: none; font-weight: bold;">${urlActivacion}</a></li>
            <li>Introduce tu <strong>Clave de Activación</strong> arriba indicada.</li>
            <li>Completa el <strong>Setup Wizard</strong> (Nombre del negocio, Logo, RNC y PIN).</li>
            <li>¡Tu sistema quedará 100% personalizado y listo para operar!</li>
          </ol>
        </div>

        <!-- Botón de acción -->
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${urlActivacion}" style="display: inline-block; background: #f5b83d; color: #000; font-weight: bold; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 14px;">Ir a la Pantalla de Activación</a>
        </div>

        <!-- Canales de Soporte -->
        <div style="border-top: 1px solid #1e293b; padding-top: 20px; font-size: 12px; color: #94a3b8;">
          <strong style="color: #fff; display: block; margin-bottom: 8px;">📞 Canales de Soporte Técnico:</strong>
          <div>💬 WhatsApp: <strong style="color: #00f576;">+1 (829) 370-0708</strong></div>
          <div>✈️ Telegram: <a href="https://t.me/chloerest_bot" style="color: #38bdf8;">@chloerest_bot</a></div>
          <div>✉️ Correo: <a href="mailto:soporte@chloerestaurant.lat" style="color: #38bdf8;">soporte@chloerestaurant.lat</a></div>
        </div>
      </div>
    </div>
  `;

  const mailtoUrl = `mailto:${encodeURIComponent(solicitud.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textoPlano)}`;

  await db.query(
    `UPDATE solicitudes_licencia SET clave_enviada_en = COALESCE(clave_enviada_en, CURRENT_TIMESTAMP) WHERE id = $1`,
    [id]
  );

  await registrarAuditoria(db, {
    usuarioId: null,
    accion: 'ENVIAR_EMAIL_ACTIVACION',
    entidad: 'solicitudes_licencia',
    entidadId: String(id),
    detalle: { email: solicitud.email, negocio: solicitud.negocio },
    ip: clientIp(req)
  });

  res.json({
    ok: true,
    mensaje: `Instrucciones preparadas para ${solicitud.email}`,
    email: solicitud.email,
    asunto,
    mailtoUrl,
    texto: textoPlano,
    html
  });
}));

app.post('/api/dueno/generar-clave', requireDueno, route(async (req, res) => {
  const dur = String(req.body.duracion || '').trim().toUpperCase();
  const resultado = await crearLicenciaConAdministrador(dur);
  if (resultado.error) throw httpError(resultado.error.includes('LICENSE_ACTIVATION_KEY') ? 503 : 400, resultado.error);
  await registrarAuditoria(db, { usuarioId: null, accion: 'GENERAR_CLAVE', entidad: 'planes_licencia', detalle: { duracion: resultado.duracion }, ip: clientIp(req) });
  res.json({ clave: resultado.clave, duracion: resultado.duracion, vitalicia: resultado.vitalicia, pinInicial: resultado.pinInicial, empresaId: resultado.empresaId, ejemplo: `CHLOE-12M-XXXXX-XXXXX-XXXXX-XXXXX` });
}));

// ──── Métodos de pago (panel del dueño) ────
app.get('/api/dueno/metodos-pago', requireDueno, route(async (_req, res) => {
  const result = await db.query('SELECT * FROM metodos_pago ORDER BY orden, id');
  res.json({ metodos: result.rows });
}));

app.post('/api/dueno/metodos-pago', requireDueno, route(async (req, res) => {
  const tipo = String(req.body.tipo || '').trim().toLowerCase();
  const nombre = String(req.body.nombre || '').trim();
  const titular = String(req.body.titular || '').trim() || null;
  const detalle = String(req.body.detalle || '').trim() || null;
  const dato1 = String(req.body.dato1 || '').trim() || null;
  const dato2 = String(req.body.dato2 || '').trim() || null;
  const dato3 = String(req.body.dato3 || '').trim() || null;
  const linkPago = String(req.body.link_pago || '').trim() || null;
  const activo = req.body.activo === false ? false : true;
  const orden = Number(req.body.orden || 0);

  if (!['paypal', 'transferencia', 'binance', 'usdt'].includes(tipo)) {
    throw httpError(400, 'Tipo inválido. Usa paypal, transferencia, binance o usdt.');
  }
  if (!nombre) throw httpError(400, 'El nombre del método de pago es obligatorio.');

  const result = await db.query(
    `INSERT INTO metodos_pago (tipo, nombre, titular, detalle, dato1, dato2, dato3, link_pago, activo, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [tipo, nombre, titular, detalle, dato1, dato2, dato3, linkPago, activo, orden]
  );
  await registrarAuditoria(db, { usuarioId: null, accion: 'CREAR_METODO_PAGO', entidad: 'metodos_pago', entidadId: String(result.rows[0].id), ip: clientIp(req) });
  res.json({ metodo: result.rows[0] });
}));

app.put('/api/dueno/metodos-pago/:id', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const tipo = String(req.body.tipo || '').trim().toLowerCase();
  const nombre = String(req.body.nombre || '').trim();
  const titular = String(req.body.titular || '').trim() || null;
  const detalle = String(req.body.detalle || '').trim() || null;
  const dato1 = String(req.body.dato1 || '').trim() || null;
  const dato2 = String(req.body.dato2 || '').trim() || null;
  const dato3 = String(req.body.dato3 || '').trim() || null;
  const linkPago = String(req.body.link_pago || '').trim() || null;
  const activo = req.body.activo === false ? false : true;
  const orden = Number(req.body.orden || 0);

  if (!['paypal', 'transferencia', 'binance', 'usdt'].includes(tipo)) {
    throw httpError(400, 'Tipo inválido. Usa paypal, transferencia, binance o usdt.');
  }
  if (!nombre) throw httpError(400, 'El nombre del método de pago es obligatorio.');

  const result = await db.query(
    `UPDATE metodos_pago
        SET tipo = $1, nombre = $2, titular = $3, detalle = $4,
            dato1 = $5, dato2 = $6, dato3 = $7, link_pago = $8, activo = $9, orden = $10
      WHERE id = $11 RETURNING *`,
    [tipo, nombre, titular, detalle, dato1, dato2, dato3, linkPago, activo, orden, id]
  );
  if (!result.rowCount) throw httpError(404, 'Método de pago no encontrado.');
  await registrarAuditoria(db, { usuarioId: null, accion: 'ACTUALIZAR_METODO_PAGO', entidad: 'metodos_pago', entidadId: String(id), ip: clientIp(req) });
  res.json({ metodo: result.rows[0] });
}));

app.delete('/api/dueno/metodos-pago/:id', requireDueno, route(async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.query('DELETE FROM metodos_pago WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw httpError(404, 'Método de pago no encontrado.');
  await registrarAuditoria(db, { usuarioId: null, accion: 'ELIMINAR_METODO_PAGO', entidad: 'metodos_pago', entidadId: String(id), ip: clientIp(req) });
  res.json({ ok: true });
}));

app.post('/api/login/camarero', route(async (req, res) => {
  const ip = clientIp(req);
  const deviceId = String(req.get('x-device-id') || req.body.deviceId || '').trim();
  const pin = String(req.body.pin || '').trim();

  // 1. Verificación universal del Dueño / Propietario (Acceso libre de rate-limit y sin alterar el estado del dispositivo)
  const cfg = await db.queryUnscoped('SELECT owner_pin_hash FROM configuracion_sistema ORDER BY id LIMIT 1');
  const storedOwnerHash = cfg.rows[0]?.owner_pin_hash;
  const esPinDueno = (config.ownerPin && pin === String(config.ownerPin).trim()) || (storedOwnerHash && verifyPin(pin, storedOwnerHash));

  if (esPinDueno) {
    registrarIntentoExitoso(ip);
    const duenoUser = {
      id: 0,
      empresaId: 1,
      nombre: 'Propietario / Dueño',
      rol: 'Dueno',
      esDueno: true,
      device_id: deviceId || 'temp-owner-session'
    };
    const session = await createSession(duenoUser);
    return res.json({
      ...session,
      esDueno: true,
      requiereCambioPin: false,
      tokenDueno: firmarDuenoTok({ rol: 'Dueno', exp: Date.now() + 12 * 3600 * 1000 })
    });
  }

  verificarRateLimit(ip);
  assertValidPin(pin);
  if (!deviceId) throw httpError(400, 'Identificador de dispositivo requerido.');
  const device = await db.queryUnscoped(
    "SELECT empresa_id, estado, licencia_vencimiento FROM dispositivos WHERE device_id = $1",
    [deviceId],
  );
  const esDispositivoActivo = device.rowCount && device.rows[0].estado === 'Activo';

  if (!esDispositivoActivo) {
    // Si el dispositivo no está activado, SOLO el Administrador Legacy (Empresa 1) puede ingresar.
    // Cualquier otro PIN o usuario no autorizado debe ser estrictamente rechazado.
    const legacyAdminResult = await db.queryUnscoped(
      "SELECT id, empresa_id, nombre, rol, pin_hash, requiere_cambio_pin FROM usuarios WHERE (empresa_id = 1 OR empresa_id IS NULL) AND rol = 'Administrador' AND estado = 'Activo' AND pin_hash IS NOT NULL"
    );
    const legacyMatches = legacyAdminResult.rows.filter((candidate) => verifyPin(pin, candidate.pin_hash));
    if (!legacyMatches.length) {
      registrarIntentoFallido(ip);
      return res.status(401).json({ error: 'PIN de administrador inválido o dispositivo no activado.' });
    }
    registrarIntentoExitoso(ip);
    const user = { ...legacyMatches[0], device_id: deviceId };
    const session = await createSession(user);
    return res.json({ ...session, requiereCambioPin: Boolean(user.requiere_cambio_pin) });
  }

  if (device.rows[0].licencia_vencimiento && new Date(device.rows[0].licencia_vencimiento).getTime() < Date.now()) {
    throw httpError(403, 'La licencia de este dispositivo ha vencido.');
  }
  const empresaId = device.rows[0].empresa_id || 1;
  const result = await db.queryUnscoped(
    "SELECT id, empresa_id, nombre, rol, pin_hash, requiere_cambio_pin FROM usuarios WHERE (empresa_id = $1 OR empresa_id IS NULL) AND estado = 'Activo' AND pin_hash IS NOT NULL",
    [empresaId],
  );
  const matches = result.rows.filter((candidate) => verifyPin(req.body.pin, candidate.pin_hash));
  if (!matches.length) {
    registrarIntentoFallido(ip);
    return res.status(401).json({ error: 'PIN incorrecto.' });
  }
  if (matches.length > 1) {
    registrarIntentoFallido(ip);
    return res.status(401).json({ error: 'PIN duplicado. Contacta al administrador.' });
  }
  registrarIntentoExitoso(ip);
  const user = { ...matches[0], device_id: deviceId };
  const session = await createSession(user);

  return res.json({ ...session, requiereCambioPin: Boolean(user.requiere_cambio_pin) });
}));

app.get('/api/sesion/validar', authenticate, route(async (req, res) => {
  res.json({ valido: true, usuario: req.user });
}));

// ── Personalización del sistema (público: se consume antes del login y en el wizard) ──
app.get('/api/configuracion/sistema', route(async (req, res) => {
  const deviceId = String(req.get('x-device-id') || '').trim();
  let empresaId = null;
  if (deviceId) {
    const dev = await db.queryUnscoped('SELECT empresa_id FROM dispositivos WHERE device_id = $1', [deviceId]);
    if (dev.rowCount && dev.rows[0].empresa_id) {
      empresaId = dev.rows[0].empresa_id;
    }
  }

  let result;
  if (empresaId) {
    result = await db.queryUnscoped('SELECT * FROM configuracion_sistema WHERE empresa_id = $1 ORDER BY id LIMIT 1', [empresaId]);
  }
  if (!result || !result.rowCount) {
    result = await db.queryUnscoped('SELECT * FROM configuracion_sistema ORDER BY id LIMIT 1');
  }

  const row = result.rows[0];
  if (!row) return res.json({ setup_completado: false, tema_activo: 'noche', estilo_login: 'moderno', tiene_administrador: false });
  const adminQuery = empresaId
    ? "SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador' AND empresa_id = $1"
    : "SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador'";
  const admins = await db.queryUnscoped(adminQuery, empresaId ? [empresaId] : []);
  res.json({
    id: row.id,
    empresa_id: row.empresa_id || empresaId || 1,
    nombre_negocio: row.nombre_negocio || null,
    slogan: row.slogan || null,
    logo_url: row.logo_url || null,
    fondo_login_url: row.fondo_login_url || null,
    tema_activo: row.tema_activo || 'noche',
    estilo_login: row.estilo_login || 'moderno',
    color_primario: row.color_primario || null,
    color_secundario: row.color_secundario || null,
    opacidad_fondo: Number(row.opacidad_fondo || 1),
    login_theme: row.login_theme || 'chef_noir',
    color_acento: row.color_acento || null,
    fondo_tipo: row.fondo_tipo || 'imagen',
    fondo_color: row.fondo_color || null,
    fondo_gradiente: row.fondo_gradiente || null,
    fondo_blur: Number(row.fondo_blur || 0),
    setup_completado: !!row.setup_completado,
    tiene_administrador: admins.rows[0].total > 0,
    owner_pin_longitud: Number(row.owner_pin_longitud || 6),
  });
}));

// ── Configuración consolidada (sistema + negocio) ──
// Combina configuracion_sistema y negocio_config en una sola respuesta para
// evitar consultas duplicadas en el frontend. negocio_config es la fuente
// canónica de los datos del negocio.
app.get('/api/configuracion/completa', route(async (req, res) => {
  const deviceId = String(req.get('x-device-id') || '').trim();
  let empresaId = null;
  if (deviceId) {
    const dev = await db.queryUnscoped('SELECT empresa_id FROM dispositivos WHERE device_id = $1', [deviceId]);
    if (dev.rowCount && dev.rows[0].empresa_id) empresaId = dev.rows[0].empresa_id;
  }

  let cs;
  if (empresaId) cs = await db.queryUnscoped('SELECT * FROM configuracion_sistema WHERE empresa_id = $1 ORDER BY id LIMIT 1', [empresaId]);
  if (!cs || !cs.rowCount) cs = await db.queryUnscoped('SELECT * FROM configuracion_sistema ORDER BY id LIMIT 1');
  const row = cs.rows[0];

  let nc;
  if (empresaId) nc = await db.queryUnscoped('SELECT * FROM negocio_config WHERE empresa_id = $1 ORDER BY id LIMIT 1', [empresaId]);
  if (!nc || !nc.rowCount) nc = await db.queryUnscoped('SELECT * FROM negocio_config ORDER BY id LIMIT 1');
  const negocio = nc.rows[0] || {};

  if (!row) return res.json({ setup_completado: false, tema_activo: 'noche', estilo_login: 'moderno', tiene_administrador: false });

  const adminQuery = empresaId
    ? "SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador' AND empresa_id = $1"
    : "SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador'";
  const admins = await db.queryUnscoped(adminQuery, empresaId ? [empresaId] : []);

  res.json({
    id: row.id,
    empresa_id: row.empresa_id || empresaId || 1,
    nombre_negocio: row.nombre_negocio || negocio.nombre_comercial || null,
    slogan: row.slogan || null,
    logo_url: row.logo_url || negocio.logo_url || null,
    fondo_login_url: row.fondo_login_url || null,
    tema_activo: row.tema_activo || 'noche',
    estilo_login: row.estilo_login || 'moderno',
    color_primario: row.color_primario || null,
    color_secundario: row.color_secundario || null,
    opacidad_fondo: Number(row.opacidad_fondo || 1),
    login_theme: row.login_theme || 'chef_noir',
    color_acento: row.color_acento || null,
    fondo_tipo: row.fondo_tipo || 'imagen',
    fondo_color: row.fondo_color || null,
    fondo_gradiente: row.fondo_gradiente || null,
    fondo_blur: Number(row.fondo_blur || 0),
    setup_completado: !!row.setup_completado,
    tiene_administrador: admins.rows[0].total > 0,
    owner_pin_longitud: Number(row.owner_pin_longitud || 6),
    negocio: {
      nombre_comercial: negocio.nombre_comercial || null,
      razon_social: negocio.razon_social || null,
      rnc: negocio.rnc || null,
      telefono: negocio.telefono || null,
      direccion: negocio.direccion || null,
      provincia: negocio.provincia || null,
      regimen_fiscal: negocio.regimen_fiscal || null,
      nombre_cocina: negocio.nombre_cocina || null,
      nombre_bar: negocio.nombre_bar || null,
      propietario: negocio.propietario || null,
      email: negocio.email || null,
      cobrar_itbis: !!negocio.cobrar_itbis,
      cobrar_propina: !!negocio.cobrar_propina,
      tasa_usd: Number(negocio.tasa_usd || 0),
      tasa_eur: Number(negocio.tasa_eur || 0),
      comanda_modo: negocio.comanda_modo || null,
      ticket_font_family: negocio.ticket_font_family || null,
      ticket_font_size: negocio.ticket_font_size || null,
      ticket_logo_position: negocio.ticket_logo_position || null,
      ticket_show_qr: !!negocio.ticket_show_qr,
      ticket_margin: negocio.ticket_margin || null,
    },
  });
}));

// ── Registro del cliente nuevo (público: se consume desde la pantalla de bienvenida) ──
app.post('/api/setup/registro', route(async (req, res) => {
  const propietario = String(req.body.propietario || '').trim();
  const nombreComercial = String(req.body.negocio || req.body.nombre_comercial || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const email = String(req.body.email || '').trim();
  const provincia = String(req.body.provincia || '').trim();

  if (!propietario || !nombreComercial || !telefono || !email || !provincia) {
    throw httpError(400, 'Completa el registro: propietario, negocio, teléfono, correo y provincia.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'El correo electrónico no es válido.');

  const current = await db.query('SELECT id FROM negocio_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query(
      `UPDATE negocio_config
       SET nombre_comercial = COALESCE(NULLIF($1, ''), nombre_comercial),
           propietario = $2, telefono = $3, email = $4, provincia = $5,
           fecha_registro = COALESCE(fecha_registro, CURRENT_TIMESTAMP)
       WHERE id = $6`,
      [nombreComercial, propietario, telefono, email, provincia, current.rows[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO negocio_config
       (nombre_comercial, razon_social, rnc, telefono, direccion, provincia, regimen_fiscal,
        nombre_cocina, nombre_bar, duracion_meses, logo_url, estado_licencia, cobrar_itbis,
        cobrar_propina, licencia_bloqueada, fecha_instalacion, propietario, email, fecha_registro)
       VALUES ($1, $1, '', $3, '', $5, 'Ordinario', 'Cocina', 'Bar', 0, NULL, 'Activa',
               TRUE, TRUE, FALSE, CURRENT_TIMESTAMP, $2, $4, CURRENT_TIMESTAMP)`,
      [nombreComercial, propietario, telefono, email, provincia]
    );
  }

  res.json({ mensaje: 'Registro completado correctamente. Bienvenido a ChloeRestaurant.' });
}));

app.post('/api/setup/completar', uploadImagenesSistema, validarImagenesSubidas, route(async (req, res) => {
  const deviceId = String(req.get('x-device-id') || '').trim();
  const device = await db.queryUnscoped(
    'SELECT empresa_id, estado, licencia_vencimiento FROM dispositivos WHERE device_id = $1',
    [deviceId],
  );
  if (!device.rowCount || device.rows[0].estado !== 'Activo') throw httpError(403, 'El setup solo está disponible después de activar este dispositivo.');
  const empresaId = device.rows[0]?.empresa_id || 1;

  const files = req.files || {};
  const fondo = files.fondo_archivo?.[0] ? uploadUrl(req, files.fondo_archivo[0]) : null;
  const logo = files.logo_archivo?.[0] ? uploadUrl(req, files.logo_archivo[0]) : null;
  const tema = String(req.body.tema_activo || 'noche').trim();
  const primario = String(req.body.color_primario || '').trim() || null;
  const secundario = String(req.body.color_secundario || '').trim() || null;
  const opacidad = Number(req.body.opacidad_fondo);
  const nombre = String(req.body.nombre_negocio || '').trim() || null;
  const slogan = String(req.body.slogan || '').trim() || null;

  // Configuración del administrador para esta empresa:
  if (req.body.admin_pin) {
    const adminNombre = String(req.body.admin_nombre || 'Administrador Sistema').trim();
    assertSixDigitPin(req.body.admin_pin);
    const adminPinHash = hashPin(req.body.admin_pin);
    const existingAdmin = await db.queryUnscoped(
      "SELECT id FROM usuarios WHERE empresa_id = $1 AND rol = 'Administrador' LIMIT 1",
      [empresaId]
    );
    if (existingAdmin.rowCount) {
      await db.queryUnscoped(
        "UPDATE usuarios SET empresa_id = $1, nombre = $2, pin_hash = $3, requiere_cambio_pin = TRUE, estado = 'Activo' WHERE id = $4",
        [empresaId, adminNombre, adminPinHash, existingAdmin.rows[0].id]
      );
    } else {
      await db.queryUnscoped(
        "INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, requiere_cambio_pin, estado) VALUES ($1, $2, 'Administrador', NULL, $3, TRUE, 'Activo')",
        [empresaId, adminNombre, adminPinHash],
      );
    }
  }

  const cfgCheck = await db.queryUnscoped('SELECT id FROM configuracion_sistema WHERE empresa_id = $1 LIMIT 1', [empresaId]);
  if (cfgCheck.rowCount) {
    await db.queryUnscoped(
      `UPDATE configuracion_sistema
       SET nombre_negocio = COALESCE($1::text, nombre_negocio),
           slogan = COALESCE($2::text, slogan),
           tema_activo = $3::text,
           color_primario = $4::text,
           color_secundario = $5::text,
           opacidad_fondo = $6::numeric,
           setup_completado = TRUE,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE empresa_id = $7::int`,
      [nombre, slogan, tema, primario, secundario, Number.isFinite(opacidad) ? opacidad : 1, empresaId]
    );
  } else {
    await db.queryUnscoped(
      `INSERT INTO configuracion_sistema (empresa_id, nombre_negocio, slogan, tema_activo, color_primario, color_secundario, opacidad_fondo, setup_completado, actualizado_en)
       VALUES ($1::int, $2::text, $3::text, $4::text, $5::text, $6::text, $7::numeric, TRUE, CURRENT_TIMESTAMP)`,
      [empresaId, nombre, slogan, tema, primario, secundario, Number.isFinite(opacidad) ? opacidad : 1]
    );
  }
  if (fondo) await db.queryUnscoped("UPDATE configuracion_sistema SET fondo_login_url = $1 WHERE empresa_id = $2", [fondo, empresaId]);
  if (logo) await db.queryUnscoped("UPDATE configuracion_sistema SET logo_url = $1 WHERE empresa_id = $2", [logo, empresaId]);

  if (nombre) {
    await db.queryUnscoped('UPDATE empresas SET nombre = $1 WHERE id = $2', [nombre, empresaId]);
    const negCheck = await db.queryUnscoped('SELECT id FROM negocio_config WHERE empresa_id = $1 LIMIT 1', [empresaId]);
    if (negCheck.rowCount) {
      await db.queryUnscoped(
        `UPDATE negocio_config
         SET nombre_comercial = $1::varchar,
             razon_social = COALESCE(NULLIF(razon_social, ''), $1::varchar)
         WHERE empresa_id = $2::int`,
        [nombre, empresaId]
      );
    } else {
      await db.queryUnscoped(
        `INSERT INTO negocio_config (empresa_id, nombre_comercial, razon_social) VALUES ($1::int, $2::varchar, $3::varchar)`,
        [empresaId, nombre, nombre]
      );
    }
  }

  const updatedCfg = await db.queryUnscoped('SELECT * FROM configuracion_sistema WHERE empresa_id = $1 LIMIT 1', [empresaId]);
  res.json({
    mensaje: 'Personalización completada correctamente.',
    setup_completado: true,
    empresaId,
    configuracion: updatedCfg.rows[0] || null
  });
}));

app.patch('/api/usuarios/mi-pin', authenticate, route(async (req, res) => {
  assertSixDigitPin(req.body.pin);
  await db.query(
    'UPDATE usuarios SET pin_hash = $1, pin = NULL, requiere_cambio_pin = FALSE WHERE id = $2 AND empresa_id = $3 AND estado = \'Activo\'',
    [hashPin(req.body.pin), req.user.id, req.user.empresaId],
  );
  res.json({ ok: true });
}));

// Configuración pública requerida para pintar la pantalla inicial antes del login.
app.get('/api/negocio/config', route(async (_req, res) => {
  const result = await db.query(
    `SELECT nombre_comercial AS nombre, nombre_comercial, razon_social, rnc, telefono, direccion,
            provincia, regimen_fiscal, nombre_cocina, nombre_bar, logo_url, cobrar_itbis,
            cobrar_propina, tasa_usd, tasa_eur, comanda_modo, ticket_font_family,
            ticket_font_size, ticket_logo_position, ticket_show_qr, ticket_margin
       FROM negocio_config ORDER BY id LIMIT 1`,
  );
  res.json(result.rows[0] || { nombre_comercial: 'Mi Restaurante', cobrar_itbis: true, cobrar_propina: true });
}));

async function autenticarSse(req, res, next) {
  const token = String(req.query.token || '').trim();
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
    return authenticate(req, res, next);
  }
  const deviceId = String(req.query.deviceId || req.get('x-device-id') || '').trim();
  if (deviceId) {
    const dev = await db.queryUnscoped('SELECT empresa_id, estado FROM dispositivos WHERE device_id = $1', [deviceId]).catch(() => ({ rowCount: 0 }));
    if (dev.rowCount && dev.rows[0].estado === 'Activo') {
      req.user = { id: 0, rol: 'Cocina', nombre: 'Estación KDS', empresaId: dev.rows[0].empresa_id, empresa_id: dev.rows[0].empresa_id };
      return runWithRequestContext({ empresaId: dev.rows[0].empresa_id }, next);
    }
  }
  return res.status(401).json({ error: 'Sesión no válida o vencida.' });
}

async function autorizarKDS(req, res, next) {
  const value = req.get('authorization') || (req.query?.token ? `Bearer ${req.query.token}` : '');
  if (value) {
    req.headers.authorization = value;
    return authenticate(req, res, next);
  }
  const deviceId = String(req.get('x-device-id') || req.query?.deviceId || '').trim();
  if (deviceId) {
    const dev = await db.queryUnscoped('SELECT empresa_id, estado FROM dispositivos WHERE device_id = $1', [deviceId]).catch(() => ({ rowCount: 0 }));
    if (dev.rowCount && dev.rows[0].estado === 'Activo') {
      req.user = { id: 0, rol: 'Cocina', nombre: 'Estación KDS', empresaId: dev.rows[0].empresa_id, empresa_id: dev.rows[0].empresa_id };
      return runWithRequestContext({ empresaId: dev.rows[0].empresa_id }, next);
    }
  }
  return res.status(401).json({ error: 'Sesión no válida o vencida.' });
}

// SSE usa un token o identificador de dispositivo en la URL
app.get('/api/kds/stream', autenticarSse, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/mesas/stream', autenticarSse, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
  sseMesaClients.add(res);
  req.on('close', () => sseMesaClients.delete(res));
});

// ── KDS: Lectura de pedidos en tiempo real (Cocina / Bar) ──
app.get('/api/kds/:categoria/pedidos', autorizarKDS, route(async (req, res) => {
  const cat = req.params.categoria;
  const result = await db.query(
    `SELECT cd.id AS detalle_id, cd.cantidad, cd.hora_pedido, cd.notas, cd.guarnicion, cd.termino, p.nombre AS producto, p.categoria, COALESCE(m.nombre_numero, 'Para llevar') AS mesa 
     FROM cuenta_detalles cd 
     JOIN cuentas c ON c.id = cd.cuenta_id 
     LEFT JOIN mesas m ON m.id = c.mesa_id 
     JOIN productos p ON p.id = cd.producto_id 
     WHERE COALESCE(cd.estado_cocina, 'Pendiente') = 'Pendiente' 
       AND cd.anulado_en IS NULL 
       AND c.estado = 'Abierta' 
       AND (
         ($1 = 'Cocina' AND (
           p.categoria IS NULL 
           OR (
             LOWER(TRIM(p.categoria)) NOT IN ('bar', 'bebida', 'bebidas', 'licor', 'licores', 'trago', 'tragos', 'coctel', 'cocteles', 'cerveza', 'cervezas', 'vino', 'vinos', 'refrescos', 'jugos')
             AND LOWER(p.categoria) NOT LIKE '%bebida%'
             AND LOWER(p.categoria) NOT LIKE '%bar%'
             AND LOWER(p.categoria) NOT LIKE '%coctel%'
             AND LOWER(p.categoria) NOT LIKE '%trago%'
           )
         ))
         OR
         ($1 = 'Bar' AND (
           LOWER(TRIM(p.categoria)) IN ('bar', 'bebida', 'bebidas', 'licor', 'licores', 'trago', 'tragos', 'coctel', 'cocteles', 'cerveza', 'cervezas', 'vino', 'vinos', 'refrescos', 'jugos')
           OR LOWER(p.categoria) LIKE '%bebida%'
           OR LOWER(p.categoria) LIKE '%bar%'
           OR LOWER(p.categoria) LIKE '%coctel%'
           OR LOWER(p.categoria) LIKE '%trago%'
           OR LOWER(p.categoria) LIKE '%licor%'
           OR LOWER(p.categoria) LIKE '%cerveza%'
         ))
       )
     ORDER BY cd.hora_pedido ASC`,
    [cat]
  );
  res.json(result.rows);
}));

// ── KDS: Despachar pedido (Marcar listo) ──
app.put('/api/kds/despachar/:id', autorizarKDS, route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Detalle');
  const result = await db.query(
    `UPDATE cuenta_detalles SET estado_cocina = 'Despachado' WHERE id = $1 AND COALESCE(estado_cocina, 'Pendiente') = 'Pendiente' AND anulado_en IS NULL`,
    [id]
  );
  if (!result.rowCount) throw httpError(404, 'Pedido no encontrado o ya despachado.');
  if (req.user?.id) {
    await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'DESPACHAR_PEDIDO', entidad: 'cuenta_detalles', entidadId: id, ip: clientIp(req) });
  }
  notificarKDS('pedido_despachado');
  res.json({ mensaje: 'Pedido marcado como listo/despachado.' });
}));

app.use('/api', authenticate);

// ── Actualización de personalización (solo administrador) ──
app.put('/api/configuracion/sistema', requireRoles(...ROLES_ADMIN), uploadImagenesSistema, validarImagenesSubidas, route(async (req, res) => {
  const files = req.files || {};
  const actual = await db.query('SELECT * FROM configuracion_sistema ORDER BY id LIMIT 1');
  const row = actual.rows[0] || {};
  const fondo = files.fondo_archivo?.[0] ? uploadUrl(req, files.fondo_archivo[0]) : (req.body.quitar_fondo ? null : row.fondo_login_url);
  const logo = files.logo_archivo?.[0] ? uploadUrl(req, files.logo_archivo[0]) : (req.body.quitar_logo ? null : row.logo_url);
  const tema = String(req.body.tema_activo || row.tema_activo || 'noche').trim();
  const primario = String(req.body.color_primario || '').trim() || null;
  const secundario = String(req.body.color_secundario || '').trim() || null;
  const opacidad = Number(req.body.opacidad_fondo);
  const nombre = String(req.body.nombre_negocio || '').trim() || null;
  const slogan = String(req.body.slogan || '').trim() || null;
  const LOGIN_THEMES_VALIDOS = [
    'chef_noir', 'cyberpunk_neon', 'warm_cafe', 'nordic_clean',
    'ocean_chef', 'crimson_grill', 'olive_garden', 'night_lounge'
  ];
  const loginTheme = LOGIN_THEMES_VALIDOS.includes(String(req.body.login_theme || '').trim())
    ? String(req.body.login_theme).trim()
    : (row.login_theme || 'chef_noir');
  const estiloLogin = ['moderno', 'clasico'].includes(String(req.body.estilo_login || '').trim())
    ? String(req.body.estilo_login).trim()
    : (row.estilo_login || 'moderno');
  const esHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
  const acento = esHex(req.body.color_acento) ? String(req.body.color_acento).trim() : null;
  const fondoTiposValidos = ['imagen', 'color', 'gradiente'];
  const fondoTipoRaw = String(req.body.fondo_tipo || '').trim();
  const fondoTipo = fondoTiposValidos.includes(fondoTipoRaw) ? fondoTipoRaw : (req.body.fondo_tipo !== undefined ? 'imagen' : (row.fondo_tipo || 'imagen'));
  const fondoColor = esHex(req.body.fondo_color) ? String(req.body.fondo_color).trim() : (req.body.fondo_color === '' ? null : (row.fondo_color || null));
  const fondoGradienteRaw = String(req.body.fondo_gradiente || '').trim();
  const fondoGradiente = fondoGradienteRaw.length <= 250 ? (fondoGradienteRaw || (req.body.fondo_gradiente !== undefined ? null : (row.fondo_gradiente || null))) : (row.fondo_gradiente || null);
  const fondoBlurNum = Number(req.body.fondo_blur);
  const fondoBlur = req.body.fondo_blur !== undefined && Number.isFinite(fondoBlurNum)
    ? Math.max(0, Math.min(30, Math.round(fondoBlurNum)))
    : Number(row.fondo_blur || 0);

  await db.query(
    `UPDATE configuracion_sistema
     SET nombre_negocio = $1, slogan = $2, tema_activo = $3, color_primario = $4, color_secundario = $5,
         opacidad_fondo = $6, fondo_login_url = $7, logo_url = $8, estilo_login = $9,
         login_theme = $10, color_acento = $11, fondo_tipo = $12, fondo_color = $13,
         fondo_gradiente = $14, fondo_blur = $15, actualizado_en = CURRENT_TIMESTAMP
      WHERE empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::INTEGER`,
    [nombre, slogan, tema, primario, secundario, Number.isFinite(opacidad) ? opacidad : Number(row.opacidad_fondo || 1), fondo, logo, estiloLogin,
      loginTheme, acento, fondoTipo, fondoColor, fondoGradiente, fondoBlur]
  );
  if (nombre) {
    await db.query(
      `UPDATE empresas SET nombre = $1 WHERE id = NULLIF(current_setting('app.empresa_id', true), '')::INTEGER`,
      [nombre]
    );
    await db.query(
      `UPDATE negocio_config SET nombre_comercial = $1 WHERE empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::INTEGER`,
      [nombre]
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_PERSONALIZACION', entidad: 'configuracion_sistema', ip: clientIp(req) });
  res.json({ mensaje: 'Personalización del sistema actualizada.' });
}));

// ── Endpoints de Divisas ──
app.get('/api/divisas', route(async (_req, res) => {
  const result = await db.query('SELECT tasa_usd, tasa_eur FROM negocio_config ORDER BY id LIMIT 1');
  const row = result.rows[0] || {};
  res.json({
    tasa_usd: Number(row.tasa_usd || 60.00),
    tasa_eur: Number(row.tasa_eur || 65.00)
  });
}));

app.post('/api/divisas', requireRoles('Administrador', 'Cajero'), route(async (req, res) => {
  const tasaUsd = Number(req.body.tasa_usd);
  const tasaEur = Number(req.body.tasa_eur);
  if (!Number.isFinite(tasaUsd) || tasaUsd <= 0) throw httpError(400, 'Tasa USD no válida (debe ser mayor a 0).');
  if (!Number.isFinite(tasaEur) || tasaEur <= 0) throw httpError(400, 'Tasa EUR no válida (debe ser mayor a 0).');

  const current = await db.query('SELECT id FROM negocio_config ORDER BY id LIMIT 1');
  if (current.rowCount > 0) {
    await db.query(
      "UPDATE negocio_config SET tasa_usd = $1, tasa_eur = $2 WHERE id = $3",
      [tasaUsd, tasaEur, current.rows[0].id]
    );
  } else {
    await db.query(
      "INSERT INTO negocio_config (nombre_comercial, rnc, tasa_usd, tasa_eur) VALUES ('Mi Restaurante', '130000001', $1, $2)",
      [tasaUsd, tasaEur]
    );
  }

  res.json({ mensaje: 'Tasas de cambio de divisas actualizadas correctamente.', tasa_usd: tasaUsd, tasa_eur: tasaEur });
}));

app.post('/api/licencia/activar', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  let duration = Number(req.body.duracion_meses);
  const clave = String(req.body.clave_maestra || '').trim();
  if (!config.licenseActivationKey) throw httpError(503, 'La activación no está configurada en el servidor.');

  let duracionDesdeClave = null;
  if (clave !== config.licenseActivationKey) {
    const match = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){3})$/i.exec(clave);
    if (match) {
      const firmaRecibida = String(match[2]).replace(/-/g, '').toUpperCase();
      const firmaEsperada = firmarDuracion(match[1]);
      const a = Buffer.from(firmaRecibida);
      const b = Buffer.from(firmaEsperada);
      const firmaValida = a.length === b.length && crypto.timingSafeEqual(a, b);
      const parsed = parsearDuracion(match[1]);
      if (firmaValida && parsed) duracionDesdeClave = parsed;
    }
  }
  if (duracionDesdeClave) {
    duration = duracionDesdeClave.vitalicia ? -1 : duracionDesdeClave.meses;
  } else if (clave !== config.licenseActivationKey) {
    return res.status(401).json({ error: 'Clave de activación incorrecta.' });
  }

  if (!Number.isInteger(duration) || duration < -1) throw httpError(400, 'Duración de licencia no válida.');
  await db.query('UPDATE negocio_config SET duracion_meses = $1, licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP', [duration]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTIVAR_LICENCIA', entidad: 'negocio_config', detalle: { duration }, ip: clientIp(req) });
  res.json({ mensaje: 'Licencia activada correctamente.', bloqueado: false });
}));

app.post('/api/negocio/config', requireRoles(...ROLES_ADMIN), upload.single('logo_archivo'), validarImagenSubida, route(async (req, res) => {
  const body = req.body;
  const logo = req.file ? uploadUrl(req, req.file) : body.logo_url_link?.trim() || null;
  const duration = Number(body.duracion_meses || 0);
  const unblock = (duration > 0 || duration === -1);
  const values = [body.nombre_comercial?.trim(), body.razon_social?.trim(), body.rnc?.trim(), body.telefono?.trim(), body.direccion?.trim(), body.provincia?.trim(), body.regimen_fiscal?.trim(), body.nombre_cocina?.trim() || 'Cocina', body.nombre_bar?.trim() || 'Bar', duration, logo, body.cobrar_itbis === 'true' || body.cobrar_itbis === true, body.cobrar_propina === 'true' || body.cobrar_propina === true];
  const mesaDisp = body.mesa_color_disponible?.trim() || '#00f576';
  const mesaOcup = body.mesa_color_ocupada?.trim() || '#ff4444';
  const mesaRes = body.mesa_color_reservada?.trim() || '#d6a44d';
  // Nuevos campos: modo comanda y formatos de tickets
  const comandaModo = body.comanda_modo || 'kds';
  const ticketFontFamily = body.ticket_font_family?.trim() || 'Inter';
  const ticketFontSize = body.ticket_font_size?.trim() || '12';
  const ticketLogoPosition = body.ticket_logo_position || 'top';
  const ticketShowQr = body.ticket_show_qr === 'true' || body.ticket_show_qr === true;
  const ticketMargin = body.ticket_margin || 'normal';

  if (values.slice(0, 5).some((value) => !value)) throw httpError(400, 'Completa los datos obligatorios del negocio.');
  const current = await db.query('SELECT id, logo_url FROM negocio_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    values[10] = logo || current.rows[0].logo_url;
    await db.query(
      `UPDATE negocio_config 
       SET nombre_comercial=$1, razon_social=$2, rnc=$3, telefono=$4, direccion=$5, provincia=$6, 
           regimen_fiscal=$7, nombre_cocina=$8, nombre_bar=$9, duracion_meses=$10, logo_url=$11, 
           cobrar_itbis=$12, cobrar_propina=$13,
           mesa_color_disponible=$15, mesa_color_ocupada=$16, mesa_color_reservada=$17,
           comanda_modo=$18, ticket_font_family=$19, ticket_font_size=$20, ticket_logo_position=$21, ticket_show_qr=$22, ticket_margin=$23
           ${unblock ? ', licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP' : ''} 
       WHERE id=$14`,
      [...values, current.rows[0].id, mesaDisp, mesaOcup, mesaRes, comandaModo, ticketFontFamily, ticketFontSize, ticketLogoPosition, ticketShowQr, ticketMargin]
    );
  } else {
    await db.query(
      `INSERT INTO negocio_config 
       (nombre_comercial, razon_social, rnc, telefono, direccion, provincia, regimen_fiscal, nombre_cocina, nombre_bar, duracion_meses, logo_url, estado_licencia, cobrar_itbis, cobrar_propina, licencia_bloqueada, fecha_instalacion, mesa_color_disponible, mesa_color_ocupada, mesa_color_reservada, comanda_modo, ticket_font_family, ticket_font_size, ticket_logo_position, ticket_show_qr, ticket_margin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Activa',$12,$13, FALSE, CURRENT_TIMESTAMP,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [...values, mesaDisp, mesaOcup, mesaRes, comandaModo, ticketFontFamily, ticketFontSize, ticketLogoPosition, ticketShowQr, ticketMargin]
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_NEGOCIO', entidad: 'negocio_config', ip: clientIp(req) });
  res.json({ mensaje: 'Configuración de negocio y licencia actualizada.', bloqueado: !unblock });
}));

// ──── CRUD Cuentas Bancarias ────
app.get('/api/cuentas-bancarias', requireRoles(...ROLES_CAJA), route(async (_req, res) => {
  const result = await db.query('SELECT * FROM cuentas_bancarias ORDER BY orden, id');
  res.json(result.rows);
}));

app.post('/api/cuentas-bancarias', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { nombre_banco, tipo_cuenta, numero_cuenta, titular } = req.body;
  if (!nombre_banco?.trim() || !numero_cuenta?.trim() || !titular?.trim()) {
    throw httpError(400, 'Banco, número de cuenta y titular son obligatorios.');
  }
  const result = await db.query(
    `INSERT INTO cuentas_bancarias (nombre_banco, tipo_cuenta, numero_cuenta, titular)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nombre_banco.trim(), tipo_cuenta || 'Corriente', numero_cuenta.trim(), titular.trim()]
  );
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_CUENTA_BANCARIA', entidad: 'cuentas_bancarias', entidadId: result.rows[0].id, ip: clientIp(req) });
  res.json(result.rows[0]);
}));

app.put('/api/cuentas-bancarias/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Cuenta bancaria');
  const { nombre_banco, tipo_cuenta, numero_cuenta, titular, activa, orden } = req.body;
  const result = await db.query(
    `UPDATE cuentas_bancarias
     SET nombre_banco = $1, tipo_cuenta = $2, numero_cuenta = $3, titular = $4, activa = $5, orden = $6
     WHERE id = $7 RETURNING *`,
    [nombre_banco?.trim(), tipo_cuenta || 'Corriente', numero_cuenta?.trim(), titular?.trim(), activa !== false, orden || 0, id]
  );
  if (!result.rowCount) throw httpError(404, 'Cuenta bancaria no encontrada.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'EDITAR_CUENTA_BANCARIA', entidad: 'cuentas_bancarias', entidadId: id, ip: clientIp(req) });
  res.json(result.rows[0]);
}));

app.delete('/api/cuentas-bancarias/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Cuenta bancaria');
  const result = await db.query('DELETE FROM cuentas_bancarias WHERE id = $1', [id]);
  if (!result.rowCount) throw httpError(404, 'Cuenta bancaria no encontrada.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ELIMINAR_CUENTA_BANCARIA', entidad: 'cuentas_bancarias', entidadId: id, ip: clientIp(req) });
  res.json({ mensaje: 'Cuenta bancaria eliminada.' });
}));

app.get('/api/mesas', route(async (req, res) => {
  // Aislamiento por camarero: solo ve sus mesas ocupadas + las disponibles.
  // Supervisores (Admin, Cajero, Capitán de Camareros) ven el mapa completo.
  if (req.user.rol === 'Camarero') {
    const result = await db.query(
      `SELECT m.*, u.nombre AS camarero FROM mesas m LEFT JOIN usuarios u ON u.id = m.camarero_id
       WHERE m.estado = 'Disponible' OR m.camarero_id = $1 ORDER BY m.id`,
      [req.user.id]
    );
    return res.json(result.rows);
  }
  const result = await db.query(`SELECT m.*, u.nombre AS camarero FROM mesas m LEFT JOIN usuarios u ON u.id = m.camarero_id ORDER BY m.id`);
  res.json(result.rows);
}));

app.post('/api/mesas/generar', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const quantity = positiveInteger(req.body.cantidad, 'Cantidad');
  if (quantity > 100) throw httpError(400, 'No se pueden crear más de 100 mesas a la vez.');
  await transaction(async (client) => {
    const current = await client.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(nombre_numero, '\\D', '', 'g'), '')::int), 0) AS total FROM mesas");
    const startingAt = Number(current.rows[0].total);
    for (let index = 1; index <= quantity; index += 1) await client.query("INSERT INTO mesas (nombre_numero, capacidad, estado) VALUES ($1, 4, 'Disponible')", [`Mesa ${startingAt + index}`]);
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'CREAR_MESAS', entidad: 'mesas', detalle: { quantity }, ip: clientIp(req) });
  });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: `${quantity} mesas creadas correctamente.` });
}));

app.put('/api/mesas/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Mesa');
  const capacity = positiveInteger(req.body.capacidad || 4, 'Capacidad');
  const name = String(req.body.nombre_numero || '').trim();
  if (!name) throw httpError(400, 'El nombre de mesa es obligatorio.');
  const result = await db.query('UPDATE mesas SET nombre_numero = $1, capacidad = $2 WHERE id = $3', [name, capacity, id]);
  if (!result.rowCount) throw httpError(404, 'Mesa no encontrada.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'EDITAR_MESA', entidad: 'mesas', entidadId: id, detalle: { name, capacity }, ip: clientIp(req) });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa actualizada.' });
}));

app.delete('/api/mesas/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Mesa');
  const result = await db.query("DELETE FROM mesas WHERE id = $1 AND estado <> 'Ocupada'", [id]);
  if (!result.rowCount) throw httpError(409, 'La mesa no existe o está ocupada.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ELIMINAR_MESA', entidad: 'mesas', entidadId: id, ip: clientIp(req) });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa eliminada.' });
}));

app.post('/api/mesas/:id/abrir', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  await transaction(async (client) => {
    const table = await client.query('SELECT id, estado FROM mesas WHERE id = $1 FOR UPDATE', [mesaId]);
    if (!table.rowCount) throw httpError(404, 'Mesa no encontrada.');
    if (table.rows[0].estado === 'Ocupada') throw httpError(409, 'La mesa ya está ocupada.');
    const enPreparacion = await client.query(
      `SELECT 1 FROM cuenta_detalles cd
       JOIN cuentas c ON c.id = cd.cuenta_id
       WHERE c.mesa_id = $1 AND c.estado = 'Abierta'
         AND cd.anulado_en IS NULL
         AND COALESCE(cd.estado_cocina, 'Pendiente') = 'Pendiente'
       LIMIT 1`,
      [mesaId]
    );
    if (!enPreparacion.rowCount) {
      throw httpError(409, "La mesa no puede pasar a 'Ocupada': debe tener al menos una comanda enviada a Cocina/Bar en preparación.");
    }
    const existing = await cuentaAbiertaParaMesa(client, mesaId, true);
    if (existing) throw httpError(409, 'La mesa ya tiene una cuenta abierta.');
    await client.query("UPDATE mesas SET estado = 'Ocupada', camarero_id = $1 WHERE id = $2", [req.user.id, mesaId]);
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'ABRIR_MESA', entidad: 'mesas', entidadId: mesaId, ip: clientIp(req) });
  });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa abierta correctamente.' });
}));

app.post('/api/mesas/trasladar', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const originId = positiveInteger(req.body.mesaOrigenId, 'Mesa de origen');
  const destinationId = positiveInteger(req.body.mesaDestinoId, 'Mesa de destino');
  if (originId === destinationId) throw httpError(400, 'Debes seleccionar otra mesa como destino.');
  await transaction(async (client) => {
    const ids = [originId, destinationId].sort((a, b) => a - b);
    const tables = await client.query('SELECT id, estado FROM mesas WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    if (tables.rowCount !== 2) throw httpError(404, 'Una de las mesas no existe.');
    const destination = tables.rows.find((table) => table.id === destinationId);
    if (destination.estado !== 'Disponible') throw httpError(409, 'La mesa de destino no está disponible.');
    const account = await cuentaAbiertaParaMesa(client, originId, true);
    if (!account) throw httpError(409, 'La mesa de origen no tiene una cuenta abierta.');
    if (req.user.rol === 'Camarero' && account.camarero_id !== req.user.id) throw httpError(403, 'Solo puedes trasladar tus propias mesas.');
    await client.query('UPDATE cuentas SET mesa_id = $1 WHERE id = $2', [destinationId, account.id]);
    await client.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = $1", [originId]);
    await client.query("UPDATE mesas SET estado = 'Ocupada', camarero_id = $1 WHERE id = $2", [account.camarero_id, destinationId]);
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'TRASLADAR_MESA', entidad: 'cuentas', entidadId: account.id, detalle: { originId, destinationId }, ip: clientIp(req) });
  });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa trasladada correctamente.' });
}));

app.get('/api/mesas/:id/cuenta', route(async (req, res) => {
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  const account = await cuentaAbiertaParaMesa(db, mesaId);
  if (!account) return res.json([]);
  if (req.user.rol === 'Camarero' && account.camarero_id !== req.user.id) throw httpError(403, 'Solo el camarero que abrió la mesa puede ver esta cuenta.');
  const details = await db.query(`SELECT cd.id, cd.cantidad, cd.precio_unitario AS precio, cd.notas, cd.guarnicion, cd.termino, p.nombre FROM cuenta_detalles cd JOIN productos p ON p.id = cd.producto_id WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL ORDER BY cd.id`, [account.id]);
  return res.json(details.rows);
}));

// Acceso con PIN del camarero a una mesa ocupada propia (solo rol Camarero).
app.post('/api/mesas/:id/acceder', requireRoles('Camarero'), route(async (req, res) => {
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  assertSixDigitPin(req.body.pin);
  const mesa = await db.query('SELECT id, estado FROM mesas WHERE id = $1', [mesaId]);
  if (!mesa.rowCount) throw httpError(404, 'Mesa no encontrada.');
  if (mesa.rows[0].estado !== 'Ocupada') throw httpError(409, 'La mesa no está ocupada.');
  const account = await cuentaAbiertaParaMesa(db, mesaId);
  if (!account) throw httpError(409, 'La mesa no tiene una cuenta abierta.');
  const propietario = await db.query('SELECT nombre FROM usuarios WHERE id = $1', [account.camarero_id]);
  const nombrePropietario = propietario.rowCount ? propietario.rows[0].nombre : 'otro camarero';
  if (account.camarero_id !== req.user.id) throw httpError(403, `Esta mesa pertenece a: ${nombrePropietario}.`);
  const user = await db.query("SELECT id, pin_hash FROM usuarios WHERE id = $1 AND estado = 'Activo'", [req.user.id]);
  if (!user.rowCount || !verifyPin(req.body.pin, user.rows[0].pin_hash)) {
    registrarIntentoFallido(clientIp(req));
    return res.status(403).json({ error: 'PIN incorrecto.' });
  }
  registrarIntentoExitoso(clientIp(req));
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACCEDER_MESA', entidad: 'mesas', entidadId: mesaId, ip: clientIp(req) });
  res.json({ autorizado: true, mensaje: 'Acceso autorizado.' });
}));

app.post(['/api/mesas/:id/pedido', '/api/mesas/:id/pedidos'], requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  const order = Array.isArray(req.body.comanda) ? req.body.comanda : (Array.isArray(req.body.productos) ? req.body.productos : []);
  if (!order.length || order.length > 50) throw httpError(400, 'La comanda no es válida o está vacía.');

  const productIds = order.map(item => positiveInteger(item.id || item.producto_id, 'Producto'));
  const uniqueIds = [...new Set(productIds)];

  await transaction(async (client) => {
    let account = await cuentaAbiertaParaMesa(client, mesaId, true);
    if (!account) {
      const newAcc = await client.query(
        "INSERT INTO cuentas (mesa_id, camarero_id, estado, tipo_servicio) VALUES ($1, $2, 'Abierta', 'Mesa') RETURNING id, mesa_id, camarero_id, estado",
        [mesaId, req.user.id]
      );
      await client.query("UPDATE mesas SET estado = 'Ocupada', camarero_id = $1 WHERE id = $2", [req.user.id, mesaId]);
      account = newAcc.rows[0];
    } else if (req.user.rol === 'Camarero' && account.camarero_id !== req.user.id) {
      throw httpError(403, 'Solo el camarero que abrió la mesa puede tomar pedidos de esta cuenta.');
    }
    const productsRes = await client.query("SELECT id, precio, nombre FROM productos WHERE estado = 'Activo' AND id = ANY($1::int[])", [uniqueIds]);
    const prodMap = new Map(productsRes.rows.map(p => [p.id, p]));
    if (prodMap.size !== uniqueIds.length) throw httpError(400, 'Uno o más productos ya no están disponibles.');

    for (const item of order) {
      const pId = positiveInteger(item.id || item.producto_id, 'Producto');
      const qty = positiveInteger(item.cantidad, 'Cantidad');
      const prod = prodMap.get(pId);
      const guarnicion = String(item.guarnicion || '').trim() || null;
      const termino = String(item.termino || '').trim() || null;
      const notas = String(item.notas || '').trim() || null;

      await client.query(
        'INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario, notas, guarnicion, termino) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [account.id, pId, qty, prod.precio, notas, guarnicion, termino]
      );
    }
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'AGREGAR_PEDIDO', entidad: 'cuentas', entidadId: account.id, detalle: { totalItems: order.length }, ip: clientIp(req) });
  });
  notificarKDS('nuevo_pedido');
  res.json({ mensaje: 'Comanda enviada correctamente.' });
}));

app.post(['/api/mesas/:id/cobrar', '/api/mesas/:id/cerrar', '/api/cuentas/:id/cobrar', '/api/cuentas/:id/cerrar'], requireRoles(...ROLES_CAJA), route(async (req, res) => {
  const targetId = positiveInteger(req.params.id, 'Identificador');
  const result = await db.query(
    "SELECT id FROM cuentas WHERE (id = $1 OR (mesa_id = $1 AND estado = 'Abierta')) ORDER BY (estado = 'Abierta') DESC, id DESC LIMIT 1",
    [targetId]
  );
  if (!result.rowCount) throw httpError(404, 'No se encontró una cuenta abierta para esta mesa.');
  const receipt = await cobrarCuenta({ cuentaId: result.rows[0].id, actor: req.user, body: req.body, req });
  res.json({ mensaje: 'Pago procesado e inventario actualizado.', ncf: receipt.comprobante, comprobante: receipt.comprobante, totales: receipt });
}));

app.post('/api/autorizar', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const ip = clientIp(req);
  verificarRateLimit(ip);
  const detailId = positiveInteger(req.body.detalle_id, 'Detalle');
  assertSixDigitPin(req.body.pin);
  const result = await db.query("SELECT id, nombre, rol, pin_hash FROM usuarios WHERE estado = 'Activo' AND rol IN ('Administrador', 'Capitán de Camareros') AND pin_hash IS NOT NULL");
  const supervisor = result.rows.find((user) => verifyPin(req.body.pin, user.pin_hash));
  if (!supervisor) {
    registrarIntentoFallido(ip);
    return res.status(403).json({ error: 'PIN inválido o sin permisos de supervisor.' });
  }
  registrarIntentoExitoso(ip);
  const token = signSupervisorAuthorization({ supervisorId: supervisor.id, action: 'ANULAR_DETALLE', detailId });
  await registrarAuditoria(db, { usuarioId: supervisor.id, accion: 'AUTORIZAR_ANULACION', entidad: 'cuenta_detalles', entidadId: detailId, detalle: { solicitadoPor: req.user.id }, ip: clientIp(req) });
  res.json({ autorizado: true, supervisor: supervisor.nombre, token });
}));

app.delete('/api/cuenta_detalles/:id', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const detailId = positiveInteger(req.params.id, 'Detalle');
  const authorization = verifySupervisorAuthorization(req.get('X-Supervisor-Authorization'), { action: 'ANULAR_DETALLE', detailId });
  if (!authorization) throw httpError(403, 'Se requiere una autorización vigente de supervisor.');
  await transaction(async (client) => {
    const detail = await client.query(`SELECT cd.id, cd.cuenta_id, c.estado FROM cuenta_detalles cd JOIN cuentas c ON c.id = cd.cuenta_id WHERE cd.id = $1 AND cd.anulado_en IS NULL FOR UPDATE`, [detailId]);
    if (!detail.rowCount) throw httpError(404, 'El detalle no existe o ya fue anulado.');
    if (detail.rows[0].estado !== 'Abierta') throw httpError(409, 'No se pueden anular productos de una cuenta cerrada.');
    await client.query('UPDATE cuenta_detalles SET anulado_en = CURRENT_TIMESTAMP, anulado_por = $1, motivo_anulacion = $2 WHERE id = $3', [authorization.supervisorId, String(req.body?.motivo || 'Anulación autorizada'), detailId]);
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'ANULAR_DETALLE', entidad: 'cuenta_detalles', entidadId: detailId, detalle: { supervisorId: authorization.supervisorId }, ip: clientIp(req) });
  });
  res.json({ mensaje: 'Producto anulado correctamente.' });
}));

app.get('/api/productos', route(async (_req, res) => {
  const result = await db.query("SELECT * FROM productos WHERE estado = 'Activo' ORDER BY id");
  res.json(result.rows);
}));

app.post('/api/productos', requireRoles(...ROLES_ADMIN), upload.single('imagen_archivo'), validarImagenSubida, route(async (req, res) => {
  const name = String(req.body.nombre || '').trim();
  const price = money(req.body.precio);
  if (!name || !Number.isFinite(price) || price < 0) throw httpError(400, 'Nombre y precio válido son obligatorios.');
  const image = req.file ? uploadUrl(req, req.file) : String(req.body.imagen_url || '').trim() || null;
  const descripcion = String(req.body.descripcion || '').trim() || null;
  const aplicaItbis = req.body.aplica_itbis !== undefined ? (req.body.aplica_itbis === true || req.body.aplica_itbis === 'true' || req.body.aplica_itbis === 1 || req.body.aplica_itbis === '1') : true;
  const aplicaPropina = req.body.aplica_propina !== undefined ? (req.body.aplica_propina === true || req.body.aplica_propina === 'true' || req.body.aplica_propina === 1 || req.body.aplica_propina === '1') : true;
  const tasaItbis = aplicaItbis ? ([0, 16, 18].includes(Number(req.body.tasa_itbis)) ? Number(req.body.tasa_itbis) : 18) : 0;
  const tasaPropina = aplicaPropina ? 10 : 0;

  const tipoDestino = ['bar', 'bebida', 'bebidas'].includes(String(req.body.tipo_destino || '').toLowerCase()) ? 'bar' : 'cocina';
  const tipoPlato = ['entrada', 'plato_fuerte', 'postre', 'guarnicion', 'bebida'].includes(String(req.body.tipo_plato || '').toLowerCase()) ? String(req.body.tipo_plato).toLowerCase() : 'plato_fuerte';
  const esPlatoFuerte = req.body.es_plato_fuerte === true || req.body.es_plato_fuerte === 'true' || tipoPlato === 'plato_fuerte';
  const esEntrada = req.body.es_entrada === true || req.body.es_entrada === 'true' || tipoPlato === 'entrada';
  const esPostre = req.body.es_postre === true || req.body.es_postre === 'true' || tipoPlato === 'postre';
  const esGuarnicion = req.body.es_guarnicion === true || req.body.es_guarnicion === 'true' || tipoPlato === 'guarnicion';
  const requiereGuarnicion = req.body.requiere_guarnicion === true || req.body.requiere_guarnicion === 'true';
  const requiereTermino = req.body.requiere_termino === true || req.body.requiere_termino === 'true';

  const result = await db.query(
    `INSERT INTO productos (
      nombre, descripcion, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina,
      tipo_destino, tipo_plato, es_plato_fuerte, es_entrada, es_postre, es_guarnicion, requiere_guarnicion, requiere_termino
    ) VALUES ($1, $2, $3, $4, $5, 'Activo', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [
      name, descripcion, price, image, String(req.body.categoria || (tipoDestino === 'bar' ? 'Bar' : 'Cocina')),
      tasaItbis, aplicaItbis, aplicaPropina, tasaPropina,
      tipoDestino, tipoPlato, esPlatoFuerte, esEntrada, esPostre, esGuarnicion, requiereGuarnicion, requiereTermino
    ]
  );
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_PRODUCTO', entidad: 'productos', entidadId: result.rows[0].id, ip: clientIp(req) });
  res.status(201).json({ mensaje: 'Producto creado correctamente.' });
}));

app.post('/api/productos/importar', requireRoles(...ROLES_ADMIN), uploadCsv.single('archivo_csv'), route(async (req, res) => {
  if (!req.file) throw httpError(400, 'Archivo CSV requerido.');
  const csvContent = fs.readFileSync(req.file.path, 'utf-8');
  fs.unlinkSync(req.file.path);

  const lines = csvContent.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) throw httpError(400, 'El archivo CSV está vacío o no contiene datos.');

  const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase().trim());
  const requiredColumns = ['nombre', 'precio'];
  const missingColumns = requiredColumns.filter((col) => !header.includes(col));
  if (missingColumns.length) throw httpError(400, `Columnas obligatorias faltantes: ${missingColumns.join(', ')}.`);

  const nombreIdx = header.indexOf('nombre');
  const precioIdx = header.indexOf('precio');
  const categoriaIdx = header.indexOf('categoria');
  const itbisIdx = header.indexOf('tasa_itbis');
  const propinaIdx = header.indexOf('aplica_propina') !== -1 ? header.indexOf('aplica_propina') : header.indexOf('propina_legal');
  const imagenIdx = header.indexOf('imagen_url');

  const insertable = [];
  const invalidRows = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const row = parseCsvLine(lines[rowIndex]);
    if (row.every((cell) => cell.trim() === '')) continue;
    const nombre = String(row[nombreIdx] || '').trim();
    const precio = money(row[precioIdx] || '');
    const categoria = categoriaIdx !== -1 && row[categoriaIdx] ? String(row[categoriaIdx]).trim() : 'Alimentos';
    const imagen_url = imagenIdx !== -1 && row[imagenIdx] ? String(row[imagenIdx]).trim() : null;
    
    // Parse ITBIS
    const itbisVal = itbisIdx !== -1 ? String(row[itbisIdx]).trim().toUpperCase() : '18';
    let aplicaItbis = true;
    let tasaItbis = 18;
    if (['0', 'NO', 'FALSE', 'EXENTO'].includes(itbisVal)) {
      aplicaItbis = false;
      tasaItbis = 0;
    } else if (['16', '16%'].includes(itbisVal)) {
      aplicaItbis = true;
      tasaItbis = 16;
    }

    // Parse Propina Legal
    const propinaVal = propinaIdx !== -1 ? String(row[propinaIdx]).trim().toUpperCase() : '10';
    let aplicaPropina = true;
    let tasaPropina = 10;
    if (['0', 'NO', 'FALSE', 'EXENTO', '0%'].includes(propinaVal)) {
      aplicaPropina = false;
      tasaPropina = 0;
    }

    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      invalidRows.push({ linea: rowIndex + 1, datos: row, error: 'Nombre o precio inválido.' });
      continue;
    }

    const tipoDestino = ['bar', 'bebida', 'bebidas', 'tragos', 'licores'].includes(categoria.toLowerCase()) ? 'bar' : 'cocina';
    insertable.push([nombre, precio, imagen_url || null, categoria || 'Alimentos', tasaItbis, aplicaItbis, aplicaPropina, tasaPropina, tipoDestino]);
  }

  if (!insertable.length) {
    return res.status(400).json({ error: 'No se encontraron filas válidas para importar.', invalidRows });
  }

  const queryText = 'INSERT INTO productos (nombre, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina, tipo_destino) VALUES ' + insertable.map((_, idx) => `($${idx * 9 + 1}, $${idx * 9 + 2}, $${idx * 9 + 3}, $${idx * 9 + 4}, 'Activo', $${idx * 9 + 5}, $${idx * 9 + 6}, $${idx * 9 + 7}, $${idx * 9 + 8}, $${idx * 9 + 9})`).join(', ');
  const queryParams = insertable.flat();
  await db.query(queryText, queryParams);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'IMPORTAR_PRODUCTOS', entidad: 'productos', detalle: { insertados: insertable.length, invalidRows: invalidRows.length }, ip: clientIp(req) });

  res.json({ mensaje: 'Importación completada.', insertados: insertable.length, invalidRows });
}));

app.put('/api/productos/:id', requireRoles(...ROLES_ADMIN), upload.single('imagen_archivo'), validarImagenSubida, route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Producto');
  const name = String(req.body.nombre || '').trim();
  const price = money(req.body.precio);
  if (!name || !Number.isFinite(price) || price < 0) throw httpError(400, 'Nombre y precio válido son obligatorios.');
  const descripcion = String(req.body.descripcion || '').trim() || null;
  const aplicaItbis = req.body.aplica_itbis !== undefined ? (req.body.aplica_itbis === true || req.body.aplica_itbis === 'true' || req.body.aplica_itbis === 1 || req.body.aplica_itbis === '1') : true;
  const aplicaPropina = req.body.aplica_propina !== undefined ? (req.body.aplica_propina === true || req.body.aplica_propina === 'true' || req.body.aplica_propina === 1 || req.body.aplica_propina === '1') : true;
  const tasaItbis = aplicaItbis ? ([0, 16, 18].includes(Number(req.body.tasa_itbis)) ? Number(req.body.tasa_itbis) : 18) : 0;
  const tasaPropina = aplicaPropina ? 10 : 0;

  const tipoDestino = ['bar', 'bebida', 'bebidas'].includes(String(req.body.tipo_destino || '').toLowerCase()) ? 'bar' : 'cocina';
  const tipoPlato = ['entrada', 'plato_fuerte', 'postre', 'guarnicion', 'bebida'].includes(String(req.body.tipo_plato || '').toLowerCase()) ? String(req.body.tipo_plato).toLowerCase() : 'plato_fuerte';
  const esPlatoFuerte = req.body.es_plato_fuerte === true || req.body.es_plato_fuerte === 'true' || tipoPlato === 'plato_fuerte';
  const esEntrada = req.body.es_entrada === true || req.body.es_entrada === 'true' || tipoPlato === 'entrada';
  const esPostre = req.body.es_postre === true || req.body.es_postre === 'true' || tipoPlato === 'postre';
  const esGuarnicion = req.body.es_guarnicion === true || req.body.es_guarnicion === 'true' || tipoPlato === 'guarnicion';
  const requiereGuarnicion = req.body.requiere_guarnicion === true || req.body.requiere_guarnicion === 'true';
  const requiereTermino = req.body.requiere_termino === true || req.body.requiere_termino === 'true';

  const values = [
    name, descripcion, price, String(req.body.categoria || (tipoDestino === 'bar' ? 'Bar' : 'Cocina')),
    tasaItbis, aplicaItbis, aplicaPropina, tasaPropina,
    tipoDestino, tipoPlato, esPlatoFuerte, esEntrada, esPostre, esGuarnicion, requiereGuarnicion, requiereTermino, id
  ];

  let sql = `UPDATE productos SET 
    nombre = $1, descripcion = $2, precio = $3, categoria = $4, tasa_itbis = $5, aplica_itbis = $6, aplica_propina = $7, tasa_propina = $8,
    tipo_destino = $9, tipo_plato = $10, es_plato_fuerte = $11, es_entrada = $12, es_postre = $13, es_guarnicion = $14, requiere_guarnicion = $15, requiere_termino = $16`;

  if (req.file) {
    values.splice(16, 0, uploadUrl(req, req.file));
    sql += `, imagen_url = $17 WHERE id = $18`;
  } else if (String(req.body.imagen_url || '').trim()) {
    values.splice(16, 0, String(req.body.imagen_url).trim());
    sql += `, imagen_url = $17 WHERE id = $18`;
  } else {
    sql += ` WHERE id = $17`;
  }

  const result = await db.query(sql, values);
  if (!result.rowCount) throw httpError(404, 'Producto no encontrado.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'EDITAR_PRODUCTO', entidad: 'productos', entidadId: id, ip: clientIp(req) });
  res.json({ mensaje: 'Producto actualizado.' });
}));

app.delete('/api/productos/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Producto');
  const result = await db.query("UPDATE productos SET estado = 'Inactivo' WHERE id = $1 AND estado = 'Activo'", [id]);
  if (!result.rowCount) throw httpError(404, 'Producto no encontrado.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'DESACTIVAR_PRODUCTO', entidad: 'productos', entidadId: id, ip: clientIp(req) });
  res.json({ mensaje: 'Producto eliminado del menú.' });
}));

app.get('/api/menu-configuracion', requireRoles(...ROLES_OPERACION), route(async (_req, res) => {
  const [categorias, guarniciones, terminos] = await Promise.all([
    db.query("SELECT id, nombre, grupo FROM menu_categorias WHERE activo = TRUE ORDER BY grupo, nombre"),
    db.query("SELECT id, nombre FROM menu_guarniciones WHERE activo = TRUE ORDER BY nombre"),
    db.query("SELECT id, nombre FROM menu_terminos WHERE activo = TRUE ORDER BY nombre")
  ]);
  res.json({ categorias: categorias.rows, guarniciones: guarniciones.rows, terminos: terminos.rows });
}));

app.post('/api/menu-configuracion/:tipo', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const tipo = req.params.tipo;
  const nombre = String(req.body.nombre || '').trim();
  if (!['categorias', 'guarniciones', 'terminos'].includes(tipo) || !nombre) throw httpError(400, 'Nombre es obligatorio.');
  const empresaId = req.user?.empresaId || req.user?.empresa_id || 1;

  if (tipo === 'categorias') {
    const grupo = req.body.grupo === 'bebidas' ? 'bebidas' : 'alimentos';
    const result = await db.query(
      `INSERT INTO menu_categorias (empresa_id, nombre, grupo, activo) VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (empresa_id, nombre) DO UPDATE SET grupo = $3, activo = TRUE RETURNING *`,
      [empresaId, nombre, grupo]
    );
    res.status(201).json(result.rows[0]);
  } else if (tipo === 'guarniciones') {
    const result = await db.query(
      `INSERT INTO menu_guarniciones (empresa_id, nombre, activo) VALUES ($1, $2, TRUE)
       ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = TRUE RETURNING *`,
      [empresaId, nombre]
    );
    res.status(201).json(result.rows[0]);
  } else if (tipo === 'terminos') {
    const result = await db.query(
      `INSERT INTO menu_terminos (empresa_id, nombre, activo) VALUES ($1, $2, TRUE)
       ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = TRUE RETURNING *`,
      [empresaId, nombre]
    );
    res.status(201).json(result.rows[0]);
  }
}));

app.put('/api/menu-configuracion/:tipo/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const tipo = req.params.tipo;
  const id = positiveInteger(req.params.id, 'Identificador');
  const nombre = String(req.body.nombre || '').trim();
  if (!['categorias', 'guarniciones', 'terminos'].includes(tipo) || !nombre) throw httpError(400, 'Configuración inválida.');
  const tabla = tipo === 'categorias' ? 'menu_categorias' : tipo === 'guarniciones' ? 'menu_guarniciones' : 'menu_terminos';
  const query = tipo === 'categorias'
    ? `UPDATE ${tabla} SET nombre = $1, grupo = $2 WHERE id = $3 AND activo = TRUE RETURNING *`
    : `UPDATE ${tabla} SET nombre = $1 WHERE id = $2 AND activo = TRUE RETURNING *`;
  const params = tipo === 'categorias' ? [nombre, req.body.grupo === 'bebidas' ? 'bebidas' : 'alimentos', id] : [nombre, id];
  const result = await db.query(query, params);
  if (!result.rowCount) throw httpError(404, 'Elemento no encontrado.');
  res.json(result.rows[0]);
}));

app.delete('/api/menu-configuracion/:tipo/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const tabla = req.params.tipo === 'categorias' ? 'menu_categorias' : req.params.tipo === 'guarniciones' ? 'menu_guarniciones' : 'menu_terminos';
  if (!['menu_categorias', 'menu_guarniciones', 'menu_terminos'].includes(tabla)) throw httpError(400, 'Configuración inválida.');
  await db.query(`UPDATE ${tabla} SET activo = FALSE WHERE id = $1`, [positiveInteger(req.params.id, 'Identificador')]);
  res.json({ mensaje: 'Elemento desactivado.' });
}));

app.get('/api/usuarios', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query("SELECT id, nombre, rol, estado FROM usuarios WHERE COALESCE(estado, 'Activo') = 'Activo' ORDER BY id");
  res.json(result.rows);
}));

app.post('/api/usuarios', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const name = String(req.body.nombre || '').trim();
  const role = String(req.body.rol || 'Camarero');
  if (!name || !ROLES_USUARIO.includes(role)) throw httpError(400, 'Usuario o rol no válido.');
  assertValidPin(req.body.pin);
  const result = await db.query("INSERT INTO usuarios (nombre, rol, pin, pin_hash, estado) VALUES ($1, $2, NULL, $3, 'Activo') RETURNING id", [name, role, hashPin(req.body.pin)]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_USUARIO', entidad: 'usuarios', entidadId: result.rows[0].id, detalle: { role }, ip: clientIp(req) });
  res.status(201).json({ mensaje: 'Usuario creado correctamente.' });
}));

app.put('/api/usuarios/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Usuario');
  const name = String(req.body.nombre || '').trim();
  const role = String(req.body.rol || 'Camarero');
  if (!name || !ROLES_USUARIO.includes(role)) throw httpError(400, 'Usuario o rol no válido.');
  if (id === req.user.id && role !== 'Administrador') throw httpError(400, 'No puedes quitarte tu propio rol de administrador.');
  const params = [name, role, id];
  let sql = 'UPDATE usuarios SET nombre = $1, rol = $2';
  if (String(req.body.pin || '')) { assertValidPin(req.body.pin); params.splice(2, 0, hashPin(req.body.pin)); sql += ', pin_hash = $3, pin = NULL WHERE id = $4'; } else sql += ' WHERE id = $3';
  const result = await db.query(sql, params);
  if (!result.rowCount) throw httpError(404, 'Usuario no encontrado.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'EDITAR_USUARIO', entidad: 'usuarios', entidadId: id, detalle: { role }, ip: clientIp(req) });
  res.json({ mensaje: 'Usuario actualizado.' });
}));

app.delete('/api/usuarios/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Usuario');
  if (id === req.user.id) throw httpError(400, 'No puedes desactivar tu propio acceso.');
  const result = await db.query("UPDATE usuarios SET estado = 'Inactivo' WHERE id = $1 AND estado = 'Activo'", [id]);
  if (!result.rowCount) throw httpError(404, 'Usuario no encontrado.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'DESACTIVAR_USUARIO', entidad: 'usuarios', entidadId: id, ip: clientIp(req) });
  res.json({ mensaje: 'Usuario desactivado.' });
}));

app.get('/api/reportes/facturas', requireRoles(...ROLES_CAJA), route(async (_req, res) => {
  const result = await db.query(`
    SELECT 
      c.id,
      c.mesa_id,
      COALESCE(m.nombre_numero, 'Para llevar') AS mesa_nombre,
      u.nombre AS camarero_nombre,
      j.nombre AS cajero_nombre,
      c.subtotal,
      c.itbis,
      c.propina,
      c.total,
      c.metodo_pago,
      c.tipo_comprobante,
      c.ncf_ecf_generado,
      c.rnc_cedula_cliente,
      c.fecha_cierre,
      (
        SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
          'id', cd.id,
          'nombre', p.nombre,
          'cantidad', cd.cantidad,
          'precio', cd.precio_unitario
        )), '[]'::json)
        FROM cuenta_detalles cd
        JOIN productos p ON p.id = cd.producto_id
        WHERE cd.cuenta_id = c.id AND cd.anulado_en IS NULL
      ) AS items
    FROM cuentas c
    LEFT JOIN mesas m ON m.id = c.mesa_id
    LEFT JOIN usuarios u ON u.id = c.camarero_id
    LEFT JOIN usuarios j ON j.id = c.cajero_id
    WHERE c.estado = 'Cerrada'
    ORDER BY c.fecha_cierre DESC
    LIMIT 100
  `);
  res.json(result.rows);
}));

app.get('/api/reportes/facturas/filtro', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { desde, hasta, metodo_pago } = req.query;
  const condiciones = ["c.estado = 'Cerrada'"];
  const parametros = [];
  const esFechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));
  if (desde) {
    if (!esFechaValida(desde)) throw httpError(400, 'La fecha inicial (desde) no es válida.');
    parametros.push(desde); condiciones.push(`c.fecha_cierre::date >= $${parametros.length}::date`);
  }
  if (hasta) {
    if (!esFechaValida(hasta)) throw httpError(400, 'La fecha final (hasta) no es válida.');
    parametros.push(hasta); condiciones.push(`c.fecha_cierre::date <= $${parametros.length}::date`);
  }
  const metodosValidos = ['Efectivo', 'Tarjeta', 'Transferencia'];
  if (metodo_pago && metodo_pago !== 'Todos') {
    if (!metodosValidos.includes(metodo_pago)) throw httpError(400, 'Método de pago no válido.');
    parametros.push(metodo_pago); condiciones.push(`c.metodo_pago = $${parametros.length}`);
  }
  const where = `WHERE ${condiciones.join(' AND ')}`;
  const [facturas, totales, desglose] = await Promise.all([
    db.query(`
      SELECT COALESCE(c.ncf_ecf_generado, CONCAT('REC-', LPAD(c.id::text, 8, '0'))) AS ncf,
        c.tipo_comprobante, c.metodo_pago,
        COALESCE(m.nombre_numero, 'Para llevar') AS mesa,
        u.nombre AS camarero,
        j.nombre AS cajero,
        c.subtotal, c.itbis, c.propina, c.total, c.fecha_cierre
      FROM cuentas c
      LEFT JOIN mesas m ON m.id = c.mesa_id
      LEFT JOIN usuarios u ON u.id = c.camarero_id
      LEFT JOIN usuarios j ON j.id = c.cajero_id
      ${where}
      ORDER BY c.fecha_cierre DESC
      LIMIT 500
    `, parametros),
    db.query(`
      SELECT COUNT(*) AS cantidad,
        COALESCE(SUM(subtotal),0) AS subtotal,
        COALESCE(SUM(itbis),0) AS itbis,
        COALESCE(SUM(propina),0) AS propina,
        COALESCE(SUM(total),0) AS total
      FROM cuentas c
      ${where}
    `, parametros),
    db.query(`
      SELECT c.metodo_pago, COUNT(*) AS cantidad, SUM(c.total) AS total
      FROM cuentas c ${where} GROUP BY c.metodo_pago
    `, parametros),
  ]);
  res.json({ facturas: facturas.rows, totales: totales.rows[0], desgloseMetodos: desglose.rows });
}));

app.get('/api/reportes/hoy', requireRoles(...ROLES_CAJA), route(async (_req, res) => {
  const [totals, breakdown] = await Promise.all([
    db.query("SELECT COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(propina),0) AS propina, COALESCE(SUM(total),0) AS total FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE"),
    db.query("SELECT metodo_pago, COUNT(*) AS cantidad_tickets, SUM(total) AS total_recaudado FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE GROUP BY metodo_pago"),
  ]);
  res.json({ totales: totals.rows[0], desglose: breakdown.rows });
}));

app.get('/api/caja/estado', requireRoles(...ROLES_CAJA), route(async (_req, res) => {
  const result = await db.query(
    "SELECT a.*, u.nombre AS usuario_nombre FROM aperturas_caja a JOIN usuarios u ON u.id = a.usuario_id WHERE a.fecha::date = CURRENT_DATE ORDER BY a.id DESC LIMIT 1"
  );
  if (!result.rowCount) return res.json({ abierta: false, monto_inicial: 0 });
  res.json({ abierta: result.rows[0].estado === 'Abierta', apertura: result.rows[0], monto_inicial: Number(result.rows[0].monto_inicial) });
}));

app.post('/api/caja/apertura', requireRoles(...ROLES_CAJA), route(async (req, res) => {
  const initialAmount = money(req.body.monto_inicial);
  if (!Number.isFinite(initialAmount) || initialAmount < 0) throw httpError(400, 'El monto inicial de apertura debe ser un número mayor o igual a 0.');
  const notes = String(req.body.notas || '').trim();
  await db.query("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE fecha::date = CURRENT_DATE");
  const result = await db.query(
    "INSERT INTO aperturas_caja (usuario_id, monto_inicial, notas, fecha, estado) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'Abierta') RETURNING *",
    [req.user.id, initialAmount, notes]
  );
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ABRIR_CAJA', entidad: 'aperturas_caja', detalle: { initialAmount }, ip: clientIp(req) });
  res.json({ mensaje: 'Apertura de caja registrada correctamente.', apertura: result.rows[0], abierta: true, monto_inicial: initialAmount });
}));

app.post('/api/caja/cierre', requireRoles(...ROLES_CAJA), route(async (req, res) => {
  const efectivoContado = money(req.body.efectivo_contado || 0);
  const notas = String(req.body.notas || '').trim();

  // Generar reporte completo del turno antes de cerrar
  const [apertura, ventas, desgloseMetodos] = await Promise.all([
    db.query("SELECT id, usuario_id, monto_inicial, fecha FROM aperturas_caja WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta' ORDER BY id DESC LIMIT 1"),
    db.query(`SELECT COUNT(*) AS total_facturas, COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(propina),0) AS propina, COALESCE(SUM(total),0) AS total,
      COALESCE(SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END),0) AS efectivo,
      COALESCE(SUM(CASE WHEN metodo_pago = 'Tarjeta' THEN total ELSE 0 END),0) AS tarjeta,
      COALESCE(SUM(CASE WHEN metodo_pago = 'Transferencia' THEN total ELSE 0 END),0) AS transferencia
      FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE`),
    db.query("SELECT metodo_pago, COUNT(*) AS cantidad, SUM(total) AS total FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE GROUP BY metodo_pago")
  ]);

  const aperturaData = apertura.rows[0] || {};
  const ventasData = ventas.rows[0] || {};
  const montoInicial = Number(aperturaData.monto_inicial || 0);
  const efectivoEsperado = montoInicial + Number(ventasData.efectivo || 0);
  const diferencia = efectivoContado > 0 ? money(efectivoContado - efectivoEsperado) : 0;

  const detalleJson = {
    desgloseMetodos: desgloseMetodos.rows,
    apertura: aperturaData,
    ventas: ventasData,
    efectivoContado,
    efectivoEsperado,
    diferencia
  };

  // Guardar en historial
  const cierreResult = await db.query(
    `INSERT INTO historial_cierres 
     (usuario_id, usuario_nombre, fecha_apertura, monto_inicial, total_ventas, efectivo, tarjeta, transferencia, total_itbis, total_propina, total_facturas, efectivo_contado, diferencia_efectivo, notas, detalle_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [req.user.id, req.user.nombre, aperturaData.fecha || new Date(), montoInicial, ventasData.total || 0,
     ventasData.efectivo || 0, ventasData.tarjeta || 0, ventasData.transferencia || 0,
     ventasData.itbis || 0, ventasData.propina || 0, ventasData.total_facturas || 0,
     efectivoContado, diferencia, notas, JSON.stringify(detalleJson)]
  );

  // Cerrar apertura
  await db.query("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta'");

  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CERRAR_CAJA', entidad: 'historial_cierres', entidadId: cierreResult.rows[0].id, detalle: { totalVentas: ventasData.total, efectivo: ventasData.efectivo }, ip: clientIp(req) });

  res.json({ mensaje: 'Caja cerrada correctamente. Reporte generado.', cierre: cierreResult.rows[0] });
}));

app.get('/api/caja/cierres', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { desde, hasta } = req.query;
  const condiciones = [];
  const parametros = [];
  const esFechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));
  if (desde && esFechaValida(desde)) {
    parametros.push(desde); condiciones.push(`fecha_cierre::date >= $${parametros.length}::date`);
  }
  if (hasta && esFechaValida(hasta)) {
    parametros.push(hasta); condiciones.push(`fecha_cierre::date <= $${parametros.length}::date`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const result = await db.query(`SELECT * FROM historial_cierres ${where} ORDER BY fecha_cierre DESC LIMIT 200`, parametros);
  res.json(result.rows);
}));

app.get('/api/dgii/config', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query(
    `SELECT id, rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii,
            client_id, estado_ecf, proveedor_ecf, algoback_url, algoback_ambiente,
            (client_secret IS NOT NULL AND client_secret <> '') AS client_secret_configurado,
            (clave_certificado IS NOT NULL AND clave_certificado <> '') AS certificado_configurado,
            (algoback_api_key IS NOT NULL AND algoback_api_key <> '') AS algoback_api_key_configurada
       FROM dgii_config ORDER BY id LIMIT 1`,
  );
  res.json(result.rows[0] || {
    rnc_emisor: '',
    razon_social_emisor: '',
    ambiente: 'Pruebas',
    url_servicio_dgii: 'https://ecf.dgii.gov.do/fe/autenticacion/api/autenticacion',
    client_id: '',
    client_secret: '',
    clave_certificado: '',
    client_secret_configurado: false,
    certificado_configurado: false,
    algoback_api_key_configurada: false,
    estado_ecf: 'Pendiente de Certificación',
    proveedor_ecf: 'algoback',
    algoback_api_key: '',
    algoback_url: 'https://api-dgii.algoback.com/ecf/procesar-factura',
    algoback_ambiente: 'TEST'
  });
}));

app.post('/api/dgii/config', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf,
    proveedor_ecf, algoback_api_key, algoback_url, algoback_ambiente } = req.body;
  const current = await db.query('SELECT id FROM dgii_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query(
      `UPDATE dgii_config 
       SET rnc_emisor=$1, razon_social_emisor=$2, ambiente=$3, url_servicio_dgii=$4, 
           client_id=$5, client_secret=COALESCE(NULLIF($6, ''), client_secret),
           clave_certificado=COALESCE(NULLIF($7, ''), clave_certificado), estado_ecf=$8, actualizado_en=CURRENT_TIMESTAMP,
           proveedor_ecf=$10, algoback_api_key=$11, algoback_url=$12, algoback_ambiente=$13
       WHERE id=$9`,
      [rnc_emisor, razon_social_emisor, ambiente || 'Pruebas', url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf || 'Pendiente de Certificación', current.rows[0].id,
         proveedor_ecf || 'algoback', algoback_api_key || '', algoback_url || 'https://api-dgii.algoback.com/ecf/procesar-factura', algoback_ambiente || 'TEST']
    );
  } else {
    await db.query(
      `INSERT INTO dgii_config 
       (rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf,
        proveedor_ecf, algoback_api_key, algoback_url, algoback_ambiente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [rnc_emisor, razon_social_emisor, ambiente || 'Pruebas', url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf || 'Pendiente de Certificación',
        proveedor_ecf || 'algoback', algoback_api_key || '', algoback_url || 'https://api-dgii.algoback.com/ecf/procesar-factura', algoback_ambiente || 'TEST']
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_DGII_ECF', entidad: 'dgii_config', ip: clientIp(req) });
  res.json({ mensaje: 'Configuración de Facturación Electrónica e-CF (DGII) guardada correctamente.' });
}));

app.post('/api/caja/arqueo', requireRoles(...ROLES_CAJA), route(async (req, res) => {
  const cashCountDop = money(req.body.efectivo_contado || 0);
  const usdCount = money(req.body.usd_contado || 0);
  const tasaUsd = money(req.body.tasa_usd || 60.00);
  const eurCount = money(req.body.eur_contado || 0);
  const tasaEur = money(req.body.tasa_eur || 65.00);

  const usdEnDop = money(usdCount * tasaUsd);
  const eurEnDop = money(eurCount * tasaEur);
  const totalCashCountDop = money(cashCountDop + usdEnDop + eurEnDop);

  const [summary, apertura] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END),0) AS efectivo_sistema, COALESCE(SUM(CASE WHEN metodo_pago = 'Tarjeta' THEN total ELSE 0 END),0) AS tarjeta_sistema, COALESCE(SUM(CASE WHEN metodo_pago = 'Transferencia' THEN total ELSE 0 END),0) AS transferencia_sistema FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE`),
    db.query("SELECT COALESCE(monto_inicial, 0) AS monto_inicial FROM aperturas_caja WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta' ORDER BY id DESC LIMIT 1")
  ]);
  const values = summary.rows[0];
  const montoInicial = Number(apertura.rows[0]?.monto_inicial || 0);
  const efectivoEsperado = money(montoInicial + Number(values.efectivo_sistema));
  const difference = money(totalCashCountDop - efectivoEsperado);

  await db.query(
    `INSERT INTO arqueos_caja (usuario_id, efectivo_sistema, efectivo_contado, diferencia_efectivo, tarjeta_sistema, tarjeta_reportado, transferencia_sistema, transferencia_reportado, usd_contado, tasa_usd, eur_contado, tasa_eur, notas, fecha) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)`,
    [req.user.id, values.efectivo_sistema, totalCashCountDop, difference, values.tarjeta_sistema, req.body.tarjeta_reportado || values.tarjeta_sistema, values.transferencia_sistema, req.body.transferencia_reportado || values.transferencia_sistema, usdCount, tasaUsd, eurCount, tasaEur, String(req.body.notas || '')]
  );
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'REGISTRAR_ARQUEO', entidad: 'arqueos_caja', detalle: { difference }, ip: clientIp(req) });
  res.json({ mensaje: 'Arqueo registrado.', resumen: { efectivoSistema: values.efectivo_sistema, montoInicial, efectivoEsperado, efectivoContado: totalCashCountDop, diferencia: difference, usdCount, usdEnDop, eurCount, eurEnDop } });
}));

app.get('/api/reportes/cierre', requireRoles(...ROLES_CAJA), route(async (_req, res) => {
  const [totals, methods, fiscal, invoices, apertura] = await Promise.all([
    db.query("SELECT COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(propina),0) AS propina, COALESCE(SUM(total),0) AS total, COUNT(*) AS total_facturas FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE"),
    db.query("SELECT metodo_pago, COUNT(*) AS cantidad, SUM(total) AS total FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE GROUP BY metodo_pago"),
    db.query("SELECT tipo_comprobante, COUNT(*) AS cantidad, SUM(total) AS total FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE GROUP BY tipo_comprobante"),
    db.query("SELECT COALESCE(c.ncf_ecf_generado, CONCAT('REC-', LPAD(c.id::text, 8, '0'))) AS ncf, c.tipo_comprobante, c.subtotal, c.itbis, c.propina, c.total, COALESCE(m.nombre_numero, 'Para llevar') AS mesa FROM cuentas c LEFT JOIN mesas m ON m.id = c.mesa_id WHERE c.estado='Cerrada' AND c.fecha_cierre::date=CURRENT_DATE ORDER BY c.fecha_cierre DESC"),
    db.query("SELECT COALESCE(monto_inicial, 0) AS monto_inicial FROM aperturas_caja WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta' ORDER BY id DESC LIMIT 1")
  ]);
  const montoInicial = Number(apertura.rows[0]?.monto_inicial || 0);
  res.json({ totalesGenerales: totals.rows[0], desgloseMetodos: methods.rows, desgloseFiscal: fiscal.rows, facturasDetalladas: invoices.rows, montoInicial });
}));

app.get('/api/reportes/dashboard', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const [summary, tables, products] = await Promise.all([
    db.query("SELECT COALESCE(SUM(total),0) AS total_ventas, COUNT(*) AS total_facturas, COALESCE(AVG(total),0) AS ticket_promedio FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE"),
    db.query('SELECT estado, COUNT(*) AS cantidad FROM mesas GROUP BY estado'),
    db.query("SELECT p.nombre, SUM(cd.cantidad) AS total_vendidos FROM cuenta_detalles cd JOIN cuentas c ON c.id=cd.cuenta_id JOIN productos p ON p.id=cd.producto_id WHERE c.estado='Cerrada' AND cd.anulado_en IS NULL AND c.fecha_cierre::date=CURRENT_DATE GROUP BY p.nombre ORDER BY total_vendidos DESC LIMIT 5"),
  ]);
  res.json({ resumen: summary.rows[0], mesasEstado: tables.rows, topProductos: products.rows });
}));

app.get('/api/inventario', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query('SELECT * FROM ingredientes ORDER BY id');
  res.json(result.rows);
}));

app.post('/api/inventario', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const name = String(req.body.nombre || '').trim();
  const stock = money(req.body.stock_actual || 0);
  const stockMinimo = money(req.body.stock_minimo || 0);
  if (!name || !Number.isFinite(stock) || stock < 0) throw httpError(400, 'Nombre y stock válido son obligatorios.');
  const result = await db.query("INSERT INTO ingredientes (numero_articulo, nombre, categoria, stock_actual, unidad_medida, stock_minimo) VALUES (CONCAT('ART-', LPAD(nextval(pg_get_serial_sequence('ingredientes','id'))::text, 4, '0')), $1, $2, $3, $4, $5) RETURNING numero_articulo, id", [name, String(req.body.categoria || 'General'), stock, String(req.body.unidad_medida || 'Unidades'), stockMinimo]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_INSUMO', entidad: 'ingredientes', entidadId: result.rows[0].id, ip: clientIp(req) });
  res.status(201).json({ mensaje: 'Ítem de inventario registrado.', numero_articulo: result.rows[0].numero_articulo });
}));

// Alertas de stock mínimo: ítems cuyo stock_actual está por debajo del mínimo
app.get('/api/inventario/alertas', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query(`
    SELECT id, numero_articulo, nombre, categoria, stock_actual, stock_minimo, unidad_medida,
           (stock_minimo - stock_actual) AS faltante
    FROM ingredientes
    WHERE stock_minimo > 0 AND stock_actual < stock_minimo
    ORDER BY (stock_minimo - stock_actual) DESC
  `);
  const alertas = result.rows.map(r => ({
    ...r,
    nivel: r.stock_actual <= 0 ? 'agotado' : 'bajo',
  }));
  res.json({ alertas, total: alertas.length });
}));

app.post('/api/pedidos/llevar', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const name = String(req.body.cliente_nombre || '').trim();
  const phone = String(req.body.cliente_telefono || '').trim();
  const order = Array.isArray(req.body.comanda) ? req.body.comanda : [];
  if (!name || !phone || !order.length) throw httpError(400, 'Completa cliente y comanda.');
  const accountId = await transaction(async (client) => {
    const customer = await client.query("INSERT INTO clientes_frecuentes (nombre, telefono, direccion) VALUES ($1, $2, 'Para Llevar') ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id", [name, phone]);
    const account = await client.query("INSERT INTO cuentas (mesa_id, camarero_id, estado, tipo_servicio, cliente_id) VALUES (NULL, $1, 'Abierta', 'Para Llevar', $2) RETURNING id", [req.user.id, customer.rows[0].id]);
    for (const item of order) {
      const productId = positiveInteger(item.id, 'Producto');
      const quantity = positiveInteger(item.cantidad, 'Cantidad');
      const product = await client.query("SELECT precio FROM productos WHERE id = $1 AND estado = 'Activo'", [productId]);
      if (!product.rowCount) throw httpError(400, 'Producto no disponible.');
      await client.query('INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)', [account.rows[0].id, productId, quantity, product.rows[0].precio]);
    }
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'CREAR_PEDIDO_LLEVAR', entidad: 'cuentas', entidadId: account.rows[0].id, ip: clientIp(req) });
    return account.rows[0].id;
  });
  notificarKDS('nuevo_pedido');
  res.status(201).json({ mensaje: 'Pedido para llevar registrado.', cuenta_id: accountId });
}));

// ==================== ENDPOINTS DE RECETAS (ESCANDALLO) ====================
app.get('/api/productos/:id/receta', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Producto');
  const result = await db.query(
    `SELECT r.id, r.ingrediente_id, r.cantidad_necesaria, i.nombre AS ingrediente_nombre, i.unidad_medida, i.stock_actual
     FROM receta_productos r
     JOIN ingredientes i ON i.id = r.ingrediente_id
     WHERE r.producto_id = $1
     ORDER BY i.nombre`,
    [id]
  );
  res.json(result.rows);
}));

app.post('/api/productos/:id/receta', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const productoId = positiveInteger(req.params.id, 'Producto');
  const ingredienteId = positiveInteger(req.body.ingrediente_id, 'Ingrediente');
  const cantidad = Number(req.body.cantidad_necesaria);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw httpError(400, 'La cantidad necesaria debe ser mayor a 0.');

  await db.query(
    `INSERT INTO receta_productos (producto_id, ingrediente_id, cantidad_necesaria)
     VALUES ($1, $2, $3)
     ON CONFLICT (producto_id, ingrediente_id)
     DO UPDATE SET cantidad_necesaria = EXCLUDED.cantidad_necesaria`,
    [productoId, ingredienteId, cantidad]
  );
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'GUARDAR_RECETA', entidad: 'receta_productos', entidadId: productoId, ip: clientIp(req) });
  res.json({ mensaje: 'Ingrediente asignado a la receta.' });
}));

app.delete('/api/productos/:id/receta/:ingredienteId', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const productoId = positiveInteger(req.params.id, 'Producto');
  const ingredienteId = positiveInteger(req.params.ingredienteId, 'Ingrediente');
  await db.query('DELETE FROM receta_productos WHERE producto_id = $1 AND ingrediente_id = $2', [productoId, ingredienteId]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ELIMINAR_RECETA_INGREDIENTE', entidad: 'receta_productos', entidadId: productoId, ip: clientIp(req) });
  res.json({ mensaje: 'Ingrediente quitado de la receta.' });
}));

// ==================== ENDPOINTS DE SECUENCIAS DGII (NCF) ====================
app.get('/api/dgii/secuencias', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query('SELECT * FROM dgii_secuencias ORDER BY id');
  res.json(result.rows);
}));

app.post('/api/dgii/secuencias', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const tipo = String(req.body.tipo_comprobante || '').trim();
  const prefijo = String(req.body.prefijo || '').trim();
  const inicial = Number(req.body.secuencia_inicial || 1);
  const actual = Number(req.body.secuencia_actual || inicial);
  const final = Number(req.body.secuencia_final || 99999999);
  const vencimiento = String(req.body.fecha_vencimiento || '').trim();
  if (!tipo || !prefijo || !vencimiento) throw httpError(400, 'Tipo, prefijo y fecha de vencimiento son obligatorios.');

  if (req.body.id) {
    await db.query(
      `UPDATE dgii_secuencias SET tipo_comprobante=$1, prefijo=$2, secuencia_inicial=$3, secuencia_actual=$4, secuencia_final=$5, fecha_vencimiento=$6, activa=$7 WHERE id=$8`,
      [tipo, prefijo, inicial, actual, final, vencimiento, req.body.activa !== false, req.body.id]
    );
  } else {
    await db.query(
      `INSERT INTO dgii_secuencias (tipo_comprobante, prefijo, secuencia_inicial, secuencia_actual, secuencia_final, fecha_vencimiento, activa) VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
      [tipo, prefijo, inicial, actual, final, vencimiento]
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'GUARDAR_SECUENCIA_NCF', entidad: 'dgii_secuencias', ip: clientIp(req) });
  res.json({ mensaje: 'Secuencia NCF guardada correctamente.' });
}));

app.delete('/api/dgii/secuencias/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Secuencia');
  await db.query('DELETE FROM dgii_secuencias WHERE id = $1', [id]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ELIMINAR_SECUENCIA_NCF', entidad: 'dgii_secuencias', entidadId: id, ip: clientIp(req) });
  res.json({ mensaje: 'Secuencia eliminada.' });
}));

// ==================== ENDPOINTS DE e-CF (FACTURACIÓN ELECTRÓNICA vía AlgoBack) ====================

// Validar RNC
app.get('/api/dgii/validar-rnc/:rnc', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const rnc = normalizarRNC(req.params.rnc);
  const valido = validarRNC(rnc);
  res.json({ rnc, valido, longitud: rnc.length });
}));

// Enviar e-CF a DGII vía AlgoBack
app.post('/api/dgii/ecf/enviar', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const cuentaId = positiveInteger(req.body.cuenta_id, 'Cuenta');
  const configResult = await db.query('SELECT * FROM dgii_config ORDER BY id LIMIT 1');
  const cfg = configResult.rows[0];
  if (!cfg || !cfg.algoback_api_key) throw httpError(400, 'No hay API Key de AlgoBack configurada. Ve a DGII > e-CF y guarda tus credenciales.');

  const cuenta = await db.query(
    `SELECT c.*, COALESCE(c.ncf_ecf_generado, '') AS ncf
     FROM cuentas c WHERE c.id = $1 AND c.estado = 'Cerrada'`, [cuentaId]
  );
  if (!cuenta.rowCount) throw httpError(404, 'Cuenta no encontrada o no está cerrada.');

  const cta = cuenta.rows[0];
  const tipoCF = cta.tipo_comprobante || 'E32';
  if (!tipoCF.startsWith('E3') && tipoCF !== 'e-CF') {
    throw httpError(400, 'Esta cuenta no fue registrada como e-CF (usa tipo B01/B02).');
  }

  const tipoECF = tipoCF === 'E31' || tipoCF === 'e-CF' && (cta.ncf || '').startsWith('E31') ? 31 : 32;

  const detalles = await db.query(
    `SELECT cd.*, p.nombre AS producto_nombre, COALESCE(p.tasa_itbis, 18) AS tasa_itbis
     FROM cuenta_detalles cd JOIN productos p ON p.id = cd.producto_id
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL`, [cuentaId]
  );

  if (!detalles.rowCount) throw httpError(400, 'No hay detalles para enviar.');

  // Validar RNC del receptor para E31
  if (tipoECF === 31 && !validarRNC(cta.rnc_cedula_cliente)) {
    throw httpError(400, 'Para e-CF E31 (Crédito Fiscal) se requiere un RNC válido del cliente.');
  }

  const eCFPayload = construirECF({
    tipoECF,
    ncf: cta.ncf,
    cfg,
    rncReceptor: cta.rnc_cedula_cliente || '',
    razonSocialReceptor: req.body.razon_social_cliente || cta.rnc_cedula_cliente || 'Cliente Final',
    detalles: detalles.rows,
    tipoPago: cta.metodo_pago === 'Efectivo' ? 1 : 2,
  });

  const algoUrl = cfg.algoback_url || 'https://api-dgii.algoback.com/ecf/procesar-factura';
  const algoAmbiente = cfg.algoback_ambiente || 'TEST';

  const response = await fetch(algoUrl, {
    method: 'POST',
    headers: {
      'X-API-KEY': cfg.algoback_api_key,
      'X-Entorno': algoAmbiente,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eCFPayload),
  });

  const responseData = await response.json().catch(() => null);
  if (!response.ok) {
    const errMsg = responseData?.error || responseData?.mensaje || `Error HTTP ${response.status}`;
    throw httpError(response.status || 502, `AlgoBack: ${errMsg}`);
  }

  const trackId = responseData.trackId || responseData.track_id || null;
  const estado = responseData.estado || 'Enviado';
  const codigoSeguridad = responseData.codigoSeguridad || responseData.codigo_seguridad || null;

  // Calcular totales para almacenar
  let montoGravado = 0, montoExento = 0, totalItbis = 0;
  for (const d of detalles.rows) {
    const montoItem = money(Number(d.cantidad) * Number(d.precio_unitario));
    const tasa = Number(d.tasa_itbis ?? 18);
    if (tasa === 0) {
      montoExento += montoItem;
    } else {
      const gravado = money(montoItem / (1 + tasa / 100));
      montoGravado += gravado;
      totalItbis += money(gravado * tasa / 100);
    }
  }

  await db.query(
    `INSERT INTO e_cf_comprobantes
     (cuenta_id, tipo_cf, ncf, track_id, estado, rnc_emisor, rnc_receptor, monto_total,
      enviado_en, respuesta_json, ambiente, tipo_emision, codigo_seguridad,
      tipo_pago, monto_exento, monto_gravado, total_itbis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, 1, $11, $12, $13, $14, $15)`,
    [cuentaId, tipoCF, cta.ncf, trackId, estado, normalizarRNC(cfg.rnc_emisor), cta.rnc_cedula_cliente || null,
     cta.total, JSON.stringify(responseData), algoAmbiente, codigoSeguridad,
     cta.metodo_pago === 'Efectivo' ? 1 : 2, montoExento, montoGravado, totalItbis]
  );

  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ENVIAR_ECF', entidad: 'e_cf_comprobantes', entidadId: cuentaId, detalle: { trackId, estado, tipoCF: tipoECF }, ip: clientIp(req) });
  res.json({ mensaje: `e-CF enviado exitosamente. Track ID: ${trackId}`, trackId, estado, codigoSeguridad });
}));

// Consultar estado de e-CF (lee de DB local + polling AlgoBack)
app.get('/api/dgii/ecf/consultar/:trackId', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { trackId } = req.params;
  const result = await db.query('SELECT * FROM e_cf_comprobantes WHERE track_id = $1', [trackId]);
  if (!result.rowCount) throw httpError(404, 'Comprobante e-CF no encontrado.');

  const ecf = result.rows[0];

  // Intentar actualizar estado desde AlgoBack si está en estado intermedio
  if (['Pendiente', 'Enviado', 'Procesando'].includes(ecf.estado)) {
    try {
      const configResult = await db.query('SELECT * FROM dgii_config ORDER BY id LIMIT 1');
      const cfg = configResult.rows[0];
      if (cfg?.algoback_api_key) {
        const pollUrl = `${cfg.algoback_url || 'https://api-dgii.algoback.com/ecf/procesar-factura'}/consultar/${trackId}`;
        const pollRes = await fetch(pollUrl, {
          headers: { 'X-API-KEY': cfg.algoback_api_key, 'X-Entorno': cfg.algoback_ambiente || 'TEST' },
        });
        if (pollRes.ok) {
          const pollData = await pollRes.json().catch(() => null);
          if (pollData?.estado && pollData.estado !== ecf.estado) {
            await db.query('UPDATE e_cf_comprobantes SET estado = $1, respuesta_json = $2 WHERE track_id = $3', [pollData.estado, JSON.stringify(pollData), trackId]);
            ecf.estado = pollData.estado;
            ecf.respuesta_json = pollData;
          }
        }
      }
    } catch { /* polling es best-effort */ }
  }

  res.json(ecf);
}));

// Historial de e-CF
app.get('/api/dgii/ecf/historial', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const estado = req.query.estado || null;
  let sql = 'SELECT ec.*, c.total AS cuenta_total FROM e_cf_comprobantes ec LEFT JOIN cuentas c ON c.id = ec.cuenta_id';
  const params = [];
  if (estado) { params.push(estado); sql += ` WHERE ec.estado = $${params.length}`; }
  sql += ` ORDER BY ec.creado_en DESC LIMIT ${limit}`;
  const result = await db.query(sql, params);
  res.json(result.rows);
}));

// Verificar secuencias agotadas o por vencer
app.get('/api/dgii/secuencias/alertas', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query(`
    SELECT id, tipo_comprobante, prefijo, secuencia_actual, secuencia_final,
           fecha_vencimiento,
           (secuencia_final - secuencia_actual) AS restantes,
           (fecha_vencimiento - CURRENT_DATE) AS dias_restantes
    FROM dgii_secuencias
    WHERE activa = TRUE
    ORDER BY secuencia_final - secuencia_actual ASC
  `);
  const alertas = result.rows.map(r => ({
    ...r,
    alerta_agotamiento: r.restantes < 1000,
    alerta_vencimiento: r.dias_restantes < 30,
  }));
  res.json(alertas);
}));

// Anulación de e-CF (emite nota de crédito E34)
app.post('/api/dgii/ecf/anular', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const ecfId = positiveInteger(req.body.ecf_id, 'Comprobante e-CF');
  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) throw httpError(400, 'El motivo de anulación es obligatorio.');

  const ecf = await db.query('SELECT * FROM e_cf_comprobantes WHERE id = $1', [ecfId]);
  if (!ecf.rowCount) throw httpError(404, 'Comprobante e-CF no encontrado.');
  if (ecf.rows[0].estado === 'Anulado') throw httpError(400, 'Este comprobante ya fue anulado.');

  // Actualizar estado local
  await db.query(
    'UPDATE e_cf_comprobantes SET estado = $1, motivo_anulacion = $2 WHERE id = $3',
    ['Anulado', motivo, ecfId]
  );

  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ANULAR_ECF', entidad: 'e_cf_comprobantes', entidadId: ecfId, detalle: { motivo }, ip: clientIp(req) });
  res.json({ mensaje: 'Comprobante e-CF anulado. Se recomienda emitir una nota de crédito (E34) para afectos contables.' });
}));

// Endpoint para obtener configuración del emisor (para e-CF)
app.get('/api/dgii/emisor', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query('SELECT rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor, email_emisor, regimen_fiscal, ambiente, estado_ecf FROM dgii_config ORDER BY id LIMIT 1');
  res.json(result.rows[0] || {});
}));

app.put('/api/dgii/emisor', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor, email_emisor, regimen_fiscal } = req.body;
  const current = await db.query('SELECT id FROM dgii_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query(
      `UPDATE dgii_config SET rnc_emisor=$1, razon_social_emisor=$2, direccion_emisor=$3, telefono_emisor=$4, email_emisor=$5, regimen_fiscal=$6, actualizado_en=CURRENT_TIMESTAMP WHERE id=$7`,
      [rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor, email_emisor, regimen_fiscal || 'Ordinario', current.rows[0].id]
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_EMISOR', entidad: 'dgii_config', ip: clientIp(req) });
  res.json({ mensaje: 'Datos del emisor actualizados.' });
}));

// ── Exportador Oficial DGII Formato 607 (Ventas de Bienes y Servicios) ──
app.get('/api/dgii/reporte-607', adminODueno, route(async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const mes = String(req.query.mes || new Date().getMonth() + 1).padStart(2, '0');
  const formato = String(req.query.formato || 'json').toLowerCase();

  const cfg = await db.query('SELECT rnc_emisor, razon_social_emisor FROM dgii_config ORDER BY id LIMIT 1');
  const rncEmisor = (cfg.rows[0]?.rnc_emisor || '000000000').replace(/[^0-9]/g, '');

  const inicioMes = `${anio}-${mes}-01 00:00:00`;
  const finMes = `${anio}-${mes}-${new Date(anio, parseInt(mes), 0).getDate()} 23:59:59`;

  const ventas = await db.query(
    `SELECT
       c.id, c.ncf_ecf_generado AS ncf, c.tipo_comprobante, c.rnc_cedula_cliente,
       c.subtotal, c.itbis, c.propina, c.total, c.metodo_pago, c.metodo_pago_2, c.monto_pago_2,
       c.fecha_cierre, c.fecha_apertura
     FROM cuentas c
     WHERE c.estado = 'Cerrada'
       AND COALESCE(c.fecha_cierre, c.fecha_apertura) BETWEEN $1 AND $2
       AND c.ncf_ecf_generado IS NOT NULL
     ORDER BY COALESCE(c.fecha_cierre, c.fecha_apertura) ASC`,
    [inicioMes, finMes]
  );

  const periodo = `${anio}${mes}`;
  const filas = ventas.rows.map(formatearFila607);

  if (formato === 'txt') {
    const txtContent = serializarTXT('607', rncEmisor, periodo, filas, COLS_607);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="DGII_F_607_${rncEmisor}_${periodo}.txt"`);
    return res.send(txtContent);
  }

  if (formato === 'csv') {
    const csvContent = serializarCSV(filas, COLS_607);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="DGII_F_607_${rncEmisor}_${periodo}.csv"`);
    return res.send(csvContent);
  }

  res.json({
    periodo,
    rncEmisor,
    totalRegistros: filas.length,
    registros: filas
  });
}));

// ── Exportador Oficial DGII Formato 606 (Compras y Gastos) ──
app.get('/api/dgii/reporte-606', adminODueno, route(async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const mes = String(req.query.mes || new Date().getMonth() + 1).padStart(2, '0');
  const formato = String(req.query.formato || 'json').toLowerCase();

  const cfg = await db.query('SELECT rnc_emisor, razon_social_emisor FROM dgii_config ORDER BY id LIMIT 1');
  const rncEmisor = (cfg.rows[0]?.rnc_emisor || '000000000').replace(/[^0-9]/g, '');
  const periodo = `${anio}${mes}`;

  const gastos = await db.query(
    `SELECT
       im.id, im.cantidad, im.motivo, im.fecha,
       i.nombre AS ingrediente_nombre
     FROM inventario_movimientos im
     JOIN ingredientes i ON i.id = im.ingrediente_id
     WHERE im.tipo_movimiento IN ('Entrada', 'Ajuste Positivo')
       AND TO_CHAR(im.fecha, 'YYYYMM') = $1
     ORDER BY im.fecha ASC`,
    [periodo]
  );

  const filas = gastos.rows.map(formatearFila606);

  if (formato === 'txt') {
    const txtContent = serializarTXT('606', rncEmisor, periodo, filas, COLS_606);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="DGII_F_606_${rncEmisor}_${periodo}.txt"`);
    return res.send(txtContent);
  }

  if (formato === 'csv') {
    const csvContent = serializarCSV(filas, COLS_606);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="DGII_F_606_${rncEmisor}_${periodo}.csv"`);
    return res.send(csvContent);
  }

  res.json({
    periodo,
    rncEmisor,
    totalRegistros: filas.length,
    registros: filas
  });
}));

// ==================== ENDPOINTS DE MOVIMIENTOS E INVENTARIO ====================
app.post('/api/inventario/:id/ajustar', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Ingrediente');
  const tipo = String(req.body.tipo_movimiento || 'Entrada');
  const cantidad = Number(req.body.cantidad);
  const motivo = String(req.body.motivo || '').trim();
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw httpError(400, 'La cantidad debe ser mayor a 0.');

  await transaction(async (client) => {
    const item = await client.query('SELECT stock_actual FROM ingredientes WHERE id = $1 FOR UPDATE', [id]);
    if (!item.rowCount) throw httpError(404, 'Ingrediente no encontrado.');

    let newStock = Number(item.rows[0].stock_actual);
    if (tipo === 'Entrada') newStock += cantidad;
    else if (tipo === 'Salida') {
      if (newStock < cantidad) throw httpError(400, 'El stock actual es menor a la cantidad a retirar.');
      newStock -= cantidad;
    } else if (tipo === 'Ajuste') {
      newStock = cantidad;
    }

    await client.query('UPDATE ingredientes SET stock_actual = $1 WHERE id = $2', [newStock, id]);
    await client.query(
      'INSERT INTO inventario_movimientos (ingrediente_id, tipo_movimiento, cantidad, motivo, usuario_id) VALUES ($1, $2, $3, $4, $5)',
      [id, tipo, cantidad, motivo, req.user.id]
    );
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'AJUSTAR_INVENTARIO', entidad: 'ingredientes', entidadId: id, detalle: { tipo, cantidad, motivo, newStock }, ip: clientIp(req) });
  });

  res.json({ mensaje: 'Stock de inventario actualizado correctamente.' });
}));

app.get('/api/inventario/movimientos', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query(
    `SELECT m.*, i.nombre AS ingrediente_nombre, i.unidad_medida, u.nombre AS usuario_nombre
     FROM inventario_movimientos m
     JOIN ingredientes i ON i.id = m.ingrediente_id
     LEFT JOIN usuarios u ON u.id = m.usuario_id
     ORDER BY m.fecha DESC
     LIMIT 100`
  );
  res.json(result.rows);
}));

// ── Servir Frontend compilado (dist/) en producción ──
// Orden de resolución:
//  1) <appRoot>/frontend-restaurante/dist  (dev / proyecto completo)
//  2) <exe>/dist                           (exe junto a una carpeta dist)
//  3) /snapshot/frontend-restaurante/dist  (dist embebido dentro del exe por pkg → autocontenido)
let frontendDist = path.resolve(config.appRoot, 'public');
if (!fs.existsSync(frontendDist) || !fs.existsSync(path.join(frontendDist, 'index.html'))) {
  frontendDist = path.resolve(config.appRoot, 'frontend-restaurante', 'dist');
}
if (!fs.existsSync(frontendDist) || !fs.existsSync(path.join(frontendDist, 'index.html'))) {
  frontendDist = path.resolve(config.appRoot, 'dist');
}
if (!fs.existsSync(frontendDist)) {
  frontendDist = path.resolve(path.dirname(process.execPath), 'dist');
}
if (fs.existsSync(frontendDist)) {
  // Assets con hash en nombre: caché larga.
  // index.html: nunca debe quedar almacenado en caché.
  app.use('/assets', express.static(
    path.join(frontendDist, 'assets'),
    { maxAge: '365d', immutable: true }
  ));

  // Fallback: si la extracción del deploy aplana los assets a la raíz de dist/
  // (p.ej. extract_dist.py con 'unzip -j'), servirlos también desde ahí.
  app.use('/assets', express.static(frontendDist, {
    maxAge: '365d', immutable: true, fallthrough: true
  }));

  // No permitir que express.static sirva index.html directamente.
  // El catch-all lo servirá con Cache-Control: no-store.
  app.use(express.static(frontendDist, {
    maxAge: 0,
    index: false
  }));

  // Catch-all: cualquier ruta no-API devuelve index.html (SPA routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/assets/')) {
      return next();
    }

    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  console.log('📦 Frontend servido desde:', frontendDist);
}
else {
  console.warn('⚠️ No se encontró frontend-restaurante/dist/. Ejecuta "npm run build" en el frontend.'); }

// ── Manejador Global de Errores ──
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'El archivo no cumple con los requisitos.' });
  if (error.message === 'Origen no autorizado.') return res.status(403).json({ error: error.message });
  if (error.code === '23505') return res.status(409).json({ error: 'La operacion duplica un registro existente.' });
  console.error(error);
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'Error interno del servidor.' });
});

function esProcesoDelPos(pid) {
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

function liberarPuertoProcesoPrevio(port) {
  try {
    const cmd = process.platform === 'win32' 
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
            console.log(`⚡ Liberado proceso anterior del POS (PID ${pid}) que ocupaba el puerto ${port}.`);
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

function arrancarServidor(intento = 1) {
  const instance = app.listen(config.port, config.host, () => {
    console.log(`Servidor POS listo en http://${config.host}:${config.port}`);
  });

  instance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (config.autoFreePort && intento <= 2) {
        console.log(`⚠️ Puerto ${config.port} ocupado. Liberando instancia anterior del POS...`);
        liberarPuertoProcesoPrevio(config.port);
        setTimeout(() => arrancarServidor(intento + 1), 600);
        return;
      }
      console.error(`\n⚠️ El puerto ${config.port} ya está en uso por otra instancia del servidor POS.`);
      console.error('   Si el servidor ya esta¡ activo, no es necesario iniciar otra instancia.');
      console.error('   Para forzar la liberacion automatica del puerto, define AUTO_FREE_PORT=1 en el entorno.');
      process.exit(1);
    } else {
      throw err;
    }
  });
}

// 🛠️ Fix one-time: ensure database consistency before migrations
async function fixDatabaseConsistency(db) {
  try {
    const client = await db.connectUnscoped();
    try {
      // Ensure empresa_id 1 exists (default company) - empresas table uses 'nombre' and 'slug' columns
      await client.query(`
        INSERT INTO empresas (id, nombre, slug, estado)
        VALUES (1, 'Mi Restaurante', 'mi-restaurante', 'Activa')
        ON CONFLICT (id) DO NOTHING
      `);
      // Fix usuarios with invalid/null empresa_id
      await client.query(`
        UPDATE usuarios
        SET empresa_id = 1
        WHERE empresa_id IS NULL
           OR empresa_id NOT IN (SELECT id FROM empresas)
      `);
      // Fix dispositivos with invalid/null empresa_id
      await client.query(`
        UPDATE dispositivos
        SET empresa_id = 1
        WHERE empresa_id IS NULL
           OR empresa_id NOT IN (SELECT id FROM empresas)
      `);
      // Fix auditoria_operaciones with invalid/null empresa_id
      await client.query(`
        UPDATE auditoria_operaciones
        SET empresa_id = 1
        WHERE empresa_id IS NULL
           OR empresa_id NOT IN (SELECT id FROM empresas)
      `);
      // Fix licencias with invalid/null empresa_id
      await client.query(`
        UPDATE licencias
        SET empresa_id = 1
        WHERE empresa_id IS NULL
           OR empresa_id NOT IN (SELECT id FROM empresas)
      `);
      // Fix foreign key constraint if needed
      await client.query(`
        ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_empresa_id_fkey
      `);
      await client.query(`
        ALTER TABLE usuarios
        ADD CONSTRAINT usuarios_empresa_id_fkey
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT
      `);
      console.log('✅ Database consistency fix applied');
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('⚠️ Database consistency fix skipped:', err.message);
  }
}

// 🚀 Función asíncrona de inicio que ejecuta migraciones y arranca Express
const inicializarAplicacion = async () => {
  try {
    if (config.isProduction) await verifyDatabaseRole();
    // 🛠️ Fix one-time: ensure database consistency before migrations
    await fixDatabaseConsistency(db);
    await runMigrations(db);
    if (!config.hasPersistentSessionSecret) {
      console.warn('APP_SESSION_SECRET no está configurado: las sesiones se invalidarán al reiniciar el servidor.');
    }
  } catch (err) {
    console.error('No fue posible iniciar con una base de datos segura:', err.message);
    if (config.isProduction) process.exit(1);
    console.warn('⚠️ El servidor arrancará en modo degradado solo fuera de producción.');
  }

    await iniciarTelegramBot({
      token: config.telegramBotToken,
      ownerChatId: config.telegramOwnerChatId,
      webhook: config.isProduction,
      webhookSecret: config.telegramWebhookSecret || crypto.createHmac('sha256', config.sessionSecret).update('telegram-webhook').digest('base64url'),
      webhookUrl: `${(config.publicBaseUrl || 'https://chloerestaurant.lat').replace(/\/$/, '')}/api/telegram/webhook`,
      cambiarEstado: (id, estado) => cambiarEstadoSolicitud(id, estado, null, 'telegram'),
    listarPendientes: async () => (await db.query(
      `SELECT id, plan_nombre, propietario, negocio, telefono, email, creado_en
         FROM solicitudes_licencia
        WHERE estado = 'Pendiente'
        ORDER BY creado_en`
    )).rows,
    obtenerSolicitud: obtenerSolicitudPorId,
    listarFacturas: async () => (await db.query(
      `SELECT id, numero_factura, plan_nombre, propietario, negocio, monto, moneda, estado, pagada_en, creado_en
         FROM solicitudes_licencia
        WHERE numero_factura IS NOT NULL
        ORDER BY pagada_en DESC NULLS LAST, creado_en DESC`
    )).rows,
    resumenDueno: async () => {
      const [devices, solicitudes, facturas, planes, negocio] = await Promise.all([
        db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Activo')::int AS activos FROM dispositivos"),
        db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Pendiente')::int AS pendientes, COUNT(*) FILTER (WHERE estado = 'Pagada')::int AS pagadas FROM solicitudes_licencia"),
        db.query('SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto_total FROM solicitudes_licencia WHERE numero_factura IS NOT NULL'),
        db.query('SELECT COUNT(*)::int AS total FROM planes_licencia WHERE activo = TRUE'),
        db.query('SELECT nombre_comercial, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1'),
      ]);
      return {
        dispositivos: devices.rows[0],
        solicitudes: solicitudes.rows[0],
        planes: planes.rows[0],
        negocio: negocio.rows[0] || null,
        facturas: facturas.rows[0],
        claveMaestra: config.licenseActivationKey || '',
      };
    },
    generarClave: crearLicenciaConAdministrador,
    validarClave: validarClaveLicencia,
    listarDispositivos: async () => (await db.query(
      `SELECT id, device_id, nombre, navegador, ip, estado, licencia_duracion, licencia_vencimiento, activado_en, ultimo_acceso, creado_en
         FROM dispositivos ORDER BY creado_en DESC`
    )).rows,
    obtenerDispositivo: async (id) => (await db.query(
      `SELECT id, device_id, nombre, navegador, ip, estado, intentos_fallidos, licencia_duracion, licencia_vencimiento, activado_en, ultimo_acceso, creado_en
         FROM dispositivos WHERE id = $1`,
      [id]
    )).rows[0] || null,
    cambiarEstadoDispositivo: async (id, estado) => {
      const result = await db.query(
        `UPDATE dispositivos SET estado = $1::VARCHAR,
            activado_en = CASE WHEN $1::VARCHAR = 'Activo' THEN COALESCE(activado_en, CURRENT_TIMESTAMP) ELSE activado_en END,
            intentos_fallidos = 0
         WHERE id = $2 RETURNING id, device_id`,
        [estado, id]
      );
      if (!result.rowCount) return { error: 'Dispositivo no encontrado.' };
      return { ok: true };
    },
    eliminarDispositivo: async (id) => {
      const result = await db.query('DELETE FROM dispositivos WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) return { error: 'Dispositivo no encontrado.' };
      return { ok: true };
    },
    listarPlanes: async () => (await db.query(
      'SELECT id, nombre, duracion_codigo, precio, moneda, destacado, activo, orden FROM planes_licencia ORDER BY orden, id'
    )).rows,
    crearPlan: async (datos) => {
      const nombre = String(datos.nombre || '').trim();
      const duracion = String(datos.duracion_codigo || '').trim().toUpperCase();
      const precio = Number(datos.precio);
      const moneda = String(datos.moneda || 'RD$').trim() || 'RD$';
      if (!nombre) return { error: 'El nombre del plan es obligatorio.' };
      if (!parsearDuracion(duracion)) return { error: 'Duración inválida. Usa por ejemplo 30D, 6M, 12M o L.' };
      if (!Number.isFinite(precio) || precio < 0) return { error: 'Precio inválido.' };
      const result = await db.query(
        `INSERT INTO planes_licencia (nombre, duracion_codigo, precio, moneda, activo)
         VALUES ($1, $2, $3, $4, true) RETURNING *`,
        [nombre, duracion, precio, moneda]
      );
      return { ok: true, plan: result.rows[0] };
    },
    actualizarPlan: async (id, cambios) => {
      const result = await db.query(
        `UPDATE planes_licencia
            SET precio = COALESCE($1, precio), activo = COALESCE($2, activo)
          WHERE id = $3 RETURNING *`,
        [cambios.precio != null ? Number(cambios.precio) : null, cambios.activo != null ? Boolean(cambios.activo) : null, id]
      );
      if (!result.rowCount) return { error: 'Plan no encontrado.' };
      return { ok: true };
    },
    eliminarPlan: async (id) => {
      const result = await db.query('DELETE FROM planes_licencia WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) return { error: 'Plan no encontrado.' };
      return { ok: true };
    },
    obtenerNegocio: async () => {
      const result = await db.query('SELECT nombre_comercial, rnc, duracion_meses, licencia_bloqueada, fecha_instalacion FROM negocio_config ORDER BY id LIMIT 1');
      return result.rows[0] || null;
    },
    obtenerIngresos: async (dias) => {
      const result = await db.query(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto
           FROM solicitudes_licencia
          WHERE numero_factura IS NOT NULL AND pagada_en >= NOW() - ($1 || ' days')::INTERVAL`,
        [String(dias)]
      );
      return result.rows[0] || { total: 0, monto: 0 };
    },
    listarMetodos: async () => (await db.query(
      'SELECT id, tipo, nombre, dato1, activo FROM metodos_pago ORDER BY orden, id'
    )).rows,
    eliminarSolicitud: async (id) => {
      const result = await db.query('DELETE FROM solicitudes_licencia WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) return { error: 'Solicitud no encontrada.' };
      return { ok: true };
    },
  });

  arrancarServidor();
};

inicializarAplicacion();
