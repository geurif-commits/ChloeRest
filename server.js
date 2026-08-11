import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import db from './db.js';
import { config, isAllowedOrigin } from './config.js';
import { authenticate, assertValidPin, createSession, hashPin, requireRoles, signSupervisorAuthorization, verifyPin, verifySupervisorAuthorization } from './auth.js';
import { runMigrations } from './migrations.js';
import { registrarAuditoria } from './audit.js';

// â”€â”€ Exception handlers (PM2 reinicia en <2s si el proceso cae) â”€â”€
process.on('uncaughtException', (err) => {
  console.error('ðŸ’¥ uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('ðŸ’¥ unhandledRejection:', reason);
});

// Graceful shutdown para PM2
process.on('SIGTERM', () => {
  console.log('ðŸ›‘ SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('ðŸ›‘ SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

const ROLES_OPERACION = ['Administrador', 'Cajero', 'Camarero', 'CapitÃ¡n de Camareros'];
const ROLES_USUARIO = [...ROLES_OPERACION, 'Cocina', 'Bar'];
const ROLES_CAJA = ['Administrador', 'Cajero'];
const ROLES_ADMIN = ['Administrador'];
const ROLES_KDS = ['Administrador', 'Cocina', 'Bar'];

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

// â”€â”€ ValidaciÃ³n de firma real de archivos de imagen (magic bytes) â”€â”€
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
    const error = httpError(400, 'El archivo subido no es una imagen vÃ¡lida (JPG, PNG o WEBP).');
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
      const error = httpError(400, 'El archivo subido no es una imagen vÃ¡lida (JPG, PNG o WEBP).');
      return next(error);
    }
  }
  return next();
}

const uploadImagenesSistema = upload.fields([{ name: 'fondo_archivo', maxCount: 1 }, { name: 'logo_archivo', maxCount: 1 }]);

const app = express();
app.disable('x-powered-by');

app.use(cors({
  origin(origin, callback) {
    // Permitir solicitudes de Electron, peticiones directas (sin origin),
    // orÃ­genes autorizados o cualquier IP de red local (192.168.x.x, 10.x.x.x, 172.x.x.x, localhost)
    if (
      !origin || 
      isAllowedOrigin(origin) || 
      (() => { try { const h = new URL(origin).hostname; return h === 'localhost' || h === '127.0.0.1'; } catch { return false; } })() || 
      /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Origen no autorizado.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Supervisor-Authorization', 'X-Session-Token'],
  maxAge: 600,
}));

app.use(express.json({ limit: '256kb' }));
app.use('/uploads', express.static(config.uploadsDir, { fallthrough: false, maxAge: '7d' }));
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

// â”€â”€ Limitador de intentos de PIN (anti fuerza bruta) â”€â”€
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
    console.warn(`âš ï¸ IP ${ip} bloqueada temporalmente tras ${loginLimiter.maxAttempts} intentos fallidos.`);
  }
  loginLimiter.intentos.set(ip, record);
}

function registrarIntentoExitoso(ip) {
  loginLimiter.intentos.delete(ip);
}

function positiveInteger(value, field) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw httpError(400, `${field} no es vÃ¡lido.`);
  return numeric;
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || null;
}

function uploadUrl(req, file) {
  return `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(file.filename)}`;
}

async function transaction(work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
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
    `SELECT id, prefijo, secuencia_actual
     FROM dgii_secuencias
     WHERE tipo_comprobante = $1 AND activa = TRUE AND fecha_vencimiento >= CURRENT_DATE
     ORDER BY id
     LIMIT 1
     FOR UPDATE`,
    [tipoComprobante],
  );

  if (!sequence.rowCount) return `REC-${String(cuentaId).padStart(8, '0')}`;

  const row = sequence.rows[0];
  await client.query('UPDATE dgii_secuencias SET secuencia_actual = secuencia_actual + 1 WHERE id = $1', [row.id]);
  return `${row.prefijo || tipoComprobante}${String(row.secuencia_actual).padStart(8, '0')}`;
}

async function calcularTotales(client, cuentaId) {
  const detailResult = await client.query(
    `SELECT cd.producto_id, cd.cantidad, cd.precio_unitario
     FROM cuenta_detalles cd
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL
     FOR UPDATE`,
    [cuentaId],
  );
  if (!detailResult.rowCount) throw httpError(400, 'No se puede cobrar una cuenta sin productos activos.');

  const subtotal = money(detailResult.rows.reduce((total, item) => total + Number(item.cantidad) * Number(item.precio_unitario), 0));
  const businessResult = await client.query('SELECT cobrar_itbis, cobrar_propina FROM negocio_config ORDER BY id LIMIT 1 FOR UPDATE');
  const business = businessResult.rows[0] || { cobrar_itbis: true, cobrar_propina: true };
  const itbis = business.cobrar_itbis === false ? 0 : money(subtotal * 0.18);
  const propina = business.cobrar_propina === false ? 0 : money(subtotal * 0.1);
  return { detalles: detailResult.rows, subtotal, itbis, propina, total: money(subtotal + itbis + propina) };
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
  const tipoComprobante = ['B01', 'B02', 'e-CF'].includes(body.tipo_comprobante) ? body.tipo_comprobante : 'B02';
  if (!allowedMethods.includes(metodoPago)) throw httpError(400, 'MÃ©todo de pago no vÃ¡lido.');
  if (metodoPago === 'Tarjeta' && !/^\d{4}$/.test(String(body.tarjeta_ultimos_4 || ''))) {
    throw httpError(400, 'Debes indicar los Ãºltimos cuatro dÃ­gitos de la tarjeta.');
  }
  if (metodoPago2 && !allowedMethods.includes(metodoPago2)) throw httpError(400, 'MÃ©todo de pago 2 no vÃ¡lido.');
  if (metodoPago2 === 'Transferencia' && montoPago2 <= 0) throw httpError(400, 'Indica el monto de la transferencia.');
  if (metodoPago2 === metodoPago) throw httpError(400, 'No puedes repetir el mismo mÃ©todo de pago en pago mixto.');

  return transaction(async (client) => {
    const account = await client.query('SELECT * FROM cuentas WHERE id = $1 AND estado = $2 FOR UPDATE', [cuentaId, 'Abierta']);
    if (!account.rowCount) throw httpError(404, 'La cuenta no estÃ¡ abierta o no existe.');

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
  try {
    await db.query('SELECT 1');
    // Obtener Ãºltima migraciÃ³n aplicada
    const migRes = await db.query("SELECT id FROM app_migrations ORDER BY ejecutada_en DESC LIMIT 1");
    const ultimaMig = migRes.rowCount ? migRes.rows[0].id : 'ninguna';
    res.json({ estado: 'ok', version: '2.0.0', baseDeDatos: 'conectada', migracion: ultimaMig });
  } catch (error) {
    console.warn('âš ï¸ Health check con base de datos degradada:', error.message);
    res.json({ estado: 'ok', version: '2.0.0', baseDeDatos: 'degradada' });
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
      version: '2.0.0',
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
    res.json({ version: '2.0.0', caja: { abierta: false, monto: 0 }, sucursal: 'No disponible', provincia: null, cajera: null, error: true });
  }
});

app.get('/api/licencia/verificar', route(async (_req, res) => {
  const result = await db.query('SELECT fecha_instalacion, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1');
  if (!result.rowCount) return res.json({ bloqueado: false, esNuevo: true });
  const negocio = result.rows[0];
  if (negocio.licencia_bloqueada) return res.json({ bloqueado: true, motivo: 'La licencia se encuentra suspendida.', contacto: 'ComunÃ­cate con soporte tÃ©cnico.' });
  if (negocio.duracion_meses === -1) return res.json({ bloqueado: false, tipo: 'Vitalicia' });
  const daysAllowed = negocio.duracion_meses > 0 ? negocio.duracion_meses * 30 : 7;
  const elapsedDays = (Date.now() - new Date(negocio.fecha_instalacion).getTime()) / 86400000;
  if (elapsedDays > daysAllowed) {
    return res.json({ bloqueado: true, motivo: 'El perÃ­odo de licencia ha finalizado.', contacto: 'ComunÃ­cate con soporte tÃ©cnico.' });
  }
  return res.json({ bloqueado: false, diasRestantes: Math.ceil(daysAllowed - elapsedDays) });
}));

app.post('/api/login/camarero', route(async (req, res) => {
  const ip = clientIp(req);
  verificarRateLimit(ip);
  assertValidPin(req.body.pin);
  const result = await db.query(
    "SELECT id, nombre, rol, pin_hash FROM usuarios WHERE estado = 'Activo' AND pin_hash IS NOT NULL",
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
  const user = matches[0];
  const session = await createSession(user);
  return res.json(session);
}));

// â”€â”€ PersonalizaciÃ³n del sistema (pÃºblico: se consume antes del login y en el wizard) â”€â”€
app.get('/api/configuracion/sistema', route(async (_req, res) => {
  const result = await db.query('SELECT * FROM configuracion_sistema WHERE id = 1');
  const row = result.rows[0];
  if (!row) return res.json({ setup_completado: false, tema_activo: 'noche', estilo_login: 'moderno', tiene_administrador: true });
  const admins = await db.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador'");
  res.json({
    id: row.id,
    nombre_negocio: row.nombre_negocio || null,
    slogan: row.slogan || null,
    logo_url: row.logo_url || null,
    fondo_login_url: row.fondo_login_url || null,
    tema_activo: row.tema_activo || 'noche',
    estilo_login: row.estilo_login || 'moderno',
    color_primario: row.color_primario || null,
    color_secundario: row.color_secundario || null,
    opacidad_fondo: Number(row.opacidad_fondo || 1),
    setup_completado: !!row.setup_completado,
    tiene_administrador: admins.rows[0].total > 0,
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
  const current = await db.query('SELECT setup_completado FROM configuracion_sistema WHERE id = 1');
  if (current.rowCount && current.rows[0].setup_completado) throw httpError(409, 'El sistema ya fue configurado.');

  const files = req.files || {};
  const fondo = files.fondo_archivo?.[0] ? uploadUrl(req, files.fondo_archivo[0]) : null;
  const logo = files.logo_archivo?.[0] ? uploadUrl(req, files.logo_archivo[0]) : null;
  const tema = String(req.body.tema_activo || 'noche').trim();
  const primario = String(req.body.color_primario || '').trim() || null;
  const secundario = String(req.body.color_secundario || '').trim() || null;
  const opacidad = Number(req.body.opacidad_fondo);
  const nombre = String(req.body.nombre_negocio || '').trim() || null;
  const slogan = String(req.body.slogan || '').trim() || null;

  // Primera ejecuciÃ³n: si no existe ningÃºn usuario activo, crear el administrador del cliente
  const users = await db.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo'");
  if (users.rows[0].total === 0) {
    const adminNombre = String(req.body.admin_nombre || 'Administrador Sistema').trim();
    assertValidPin(req.body.admin_pin);
    await db.query("INSERT INTO usuarios (nombre, rol, pin, pin_hash, estado) VALUES ($1, 'Administrador', NULL, $2, 'Activo')", [adminNombre, hashPin(req.body.admin_pin)]);
  }

  await db.query(
    `UPDATE configuracion_sistema
     SET nombre_negocio = $1, slogan = $2, tema_activo = $3, color_primario = $4, color_secundario = $5,
         opacidad_fondo = $6, setup_completado = TRUE, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [nombre, slogan, tema, primario, secundario, Number.isFinite(opacidad) ? opacidad : 1]
  );
  if (fondo) await db.query('UPDATE configuracion_sistema SET fondo_login_url = $1 WHERE id = 1', [fondo]);
  if (logo) await db.query('UPDATE configuracion_sistema SET logo_url = $1 WHERE id = 1', [logo]);

  res.json({ mensaje: 'PersonalizaciÃ³n completada correctamente.', setup_completado: true });
}));

// ── SSE: Endpoints PÚBLICOS (antes de authenticate; EventSource no soporta headers) ──
app.get('/api/kds/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/mesas/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseMesaClients.add(res);
  req.on('close', () => sseMesaClients.delete(res));
});

// ── KDS: Lectura de pedidos PÚBLICA (pantalla cocina/bar accede desde login sin sesión) ──
app.get('/api/kds/:categoria/pedidos', route(async (req, res) => {
  const cat = req.params.categoria;
  const result = await db.query(
    `SELECT cd.id AS detalle_id, cd.cantidad, cd.hora_pedido, p.nombre AS producto, p.categoria, COALESCE(m.nombre_numero, 'Para llevar') AS mesa 
     FROM cuenta_detalles cd 
     JOIN cuentas c ON c.id = cd.cuenta_id 
     LEFT JOIN mesas m ON m.id = c.mesa_id 
     JOIN productos p ON p.id = cd.producto_id 
     WHERE COALESCE(cd.estado_cocina, 'Pendiente') = 'Pendiente' 
       AND cd.anulado_en IS NULL 
       AND c.estado = 'Abierta' 
       AND (
         ($1 = 'Cocina' AND (p.categoria IS NULL OR p.categoria NOT IN ('Bar', 'Bebidas')))
         OR
         ($1 = 'Bar' AND p.categoria IN ('Bar', 'Bebidas'))
       )
     ORDER BY cd.hora_pedido`,
    [cat]
  );
  res.json(result.rows);
}));

// ── KDS: Despachar pedido (público desde pantalla cocina/bar) ──
app.put('/api/kds/despachar/:id', route(async (req, res) => {
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
  const actual = await db.query('SELECT fondo_login_url, logo_url FROM configuracion_sistema WHERE id = 1');
  const row = actual.rows[0] || {};
  const fondo = files.fondo_archivo?.[0] ? uploadUrl(req, files.fondo_archivo[0]) : (req.body.quitar_fondo ? null : row.fondo_login_url);
  const logo = files.logo_archivo?.[0] ? uploadUrl(req, files.logo_archivo[0]) : (req.body.quitar_logo ? null : row.logo_url);
  const tema = String(req.body.tema_activo || row.tema_activo || 'noche').trim();
  const primario = String(req.body.color_primario || '').trim() || null;
  const secundario = String(req.body.color_secundario || '').trim() || null;
  const opacidad = Number(req.body.opacidad_fondo);
  const nombre = String(req.body.nombre_negocio || '').trim() || null;
  const slogan = String(req.body.slogan || '').trim() || null;
  const estiloLogin = String(req.body.estilo_login || row.estilo_login || 'moderno').trim();

  await db.query(
    `UPDATE configuracion_sistema
     SET nombre_negocio = $1, slogan = $2, tema_activo = $3, color_primario = $4, color_secundario = $5,
         opacidad_fondo = $6, fondo_login_url = $7, logo_url = $8, estilo_login = $9, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [nombre, slogan, tema, primario, secundario, Number.isFinite(opacidad) ? opacidad : Number(row.opacidad_fondo || 1), fondo, logo, estiloLogin]
  );
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_PERSONALIZACION', entidad: 'configuracion_sistema', ip: clientIp(req) });
  res.json({ mensaje: 'PersonalizaciÃ³n del sistema actualizada.' });
}));

// â”€â”€ Endpoints de Divisas â”€â”€
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
  if (!Number.isFinite(tasaUsd) || tasaUsd <= 0) throw httpError(400, 'Tasa USD no vÃ¡lida (debe ser mayor a 0).');
  if (!Number.isFinite(tasaEur) || tasaEur <= 0) throw httpError(400, 'Tasa EUR no vÃ¡lida (debe ser mayor a 0).');

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
  const duration = Number(req.body.duracion_meses);
  if (!Number.isInteger(duration) || duration < -1) throw httpError(400, 'DuraciÃ³n de licencia no vÃ¡lida.');
  if (!config.licenseActivationKey) throw httpError(503, 'La activaciÃ³n no estÃ¡ configurada en el servidor.');
  if (req.body.clave_maestra !== config.licenseActivationKey) return res.status(401).json({ error: 'Clave de activaciÃ³n incorrecta.' });
  await db.query('UPDATE negocio_config SET duracion_meses = $1, licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP', [duration]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTIVAR_LICENCIA', entidad: 'negocio_config', detalle: { duration }, ip: clientIp(req) });
  res.json({ mensaje: 'Licencia activada correctamente.', bloqueado: false });
}));

app.get('/api/negocio/config', route(async (_req, res) => {
  const result = await db.query('SELECT * FROM negocio_config ORDER BY id LIMIT 1');
  res.json(result.rows[0] || { nombre_comercial: 'Mi Restaurante', cobrar_itbis: true, cobrar_propina: true });
}));

app.post('/api/negocio/config', requireRoles(...ROLES_ADMIN), upload.single('logo_archivo'), validarImagenSubida, route(async (req, res) => {
  const body = req.body;
  const logo = req.file ? uploadUrl(req, req.file) : body.logo_url_link?.trim() || null;
  const duration = Number(body.duracion_meses || 0);
  const unblock = (duration > 0 || duration === -1);
  const values = [body.nombre_comercial?.trim(), body.razon_social?.trim(), body.rnc?.trim(), body.telefono?.trim(), body.direccion?.trim(), body.provincia?.trim(), body.regimen_fiscal?.trim(), body.nombre_cocina?.trim() || 'Cocina', body.nombre_bar?.trim() || 'Bar', duration, logo, body.cobrar_itbis === 'true' || body.cobrar_itbis === true, body.cobrar_propina === 'true' || body.cobrar_propina === true];
  if (values.slice(0, 5).some((value) => !value)) throw httpError(400, 'Completa los datos obligatorios del negocio.');
  const current = await db.query('SELECT id, logo_url FROM negocio_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    values[10] = logo || current.rows[0].logo_url;
    await db.query(
      `UPDATE negocio_config 
       SET nombre_comercial=$1, razon_social=$2, rnc=$3, telefono=$4, direccion=$5, provincia=$6, 
           regimen_fiscal=$7, nombre_cocina=$8, nombre_bar=$9, duracion_meses=$10, logo_url=$11, 
           cobrar_itbis=$12, cobrar_propina=$13
           ${unblock ? ', licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP' : ''} 
       WHERE id=$14`,
      [...values, current.rows[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO negocio_config 
       (nombre_comercial, razon_social, rnc, telefono, direccion, provincia, regimen_fiscal, nombre_cocina, nombre_bar, duracion_meses, logo_url, estado_licencia, cobrar_itbis, cobrar_propina, licencia_bloqueada, fecha_instalacion) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Activa',$12,$13, FALSE, CURRENT_TIMESTAMP)`,
      values
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_NEGOCIO', entidad: 'negocio_config', ip: clientIp(req) });
  res.json({ mensaje: 'ConfiguraciÃ³n de negocio y licencia actualizada.', bloqueado: !unblock });
}));

// ──── CRUD Cuentas Bancarias ────
app.get('/api/cuentas-bancarias', requireRoles(...ROLES_ADMIN), route(async (_req, res) => {
  const result = await db.query('SELECT * FROM cuentas_bancarias ORDER BY orden, id');
  res.json(result.rows);
}));

app.post('/api/cuentas-bancarias', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { nombre_banco, tipo_cuenta, numero_cuenta, titular } = req.body;
  if (!nombre_banco?.trim() || !numero_cuenta?.trim() || !titular?.trim()) {
    throw httpError(400, 'Banco, nÃºmero de cuenta y titular son obligatorios.');
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
  // Supervisores (Admin, Cajero, CapitÃ¡n de Camareros) ven el mapa completo.
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
  if (quantity > 100) throw httpError(400, 'No se pueden crear mÃ¡s de 100 mesas a la vez.');
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
  if (!result.rowCount) throw httpError(409, 'La mesa no existe o estÃ¡ ocupada.');
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ELIMINAR_MESA', entidad: 'mesas', entidadId: id, ip: clientIp(req) });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa eliminada.' });
}));

app.post('/api/mesas/:id/abrir', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  await transaction(async (client) => {
    const table = await client.query('SELECT id, estado FROM mesas WHERE id = $1 FOR UPDATE', [mesaId]);
    if (!table.rowCount) throw httpError(404, 'Mesa no encontrada.');
    if (table.rows[0].estado === 'Ocupada') throw httpError(409, 'La mesa ya estÃ¡ ocupada.');
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
      throw httpError(409, "La mesa no puede pasar a 'Ocupada': debe tener al menos una comanda enviada a Cocina/Bar en preparaciÃ³n.");
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
    if (destination.estado !== 'Disponible') throw httpError(409, 'La mesa de destino no estÃ¡ disponible.');
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
  if (req.user.rol === 'Camarero' && account.camarero_id !== req.user.id) throw httpError(403, 'Solo el camarero que abriÃ³ la mesa puede ver esta cuenta.');
  const details = await db.query(`SELECT cd.id, cd.cantidad, cd.precio_unitario AS precio, p.nombre FROM cuenta_detalles cd JOIN productos p ON p.id = cd.producto_id WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL ORDER BY cd.id`, [account.id]);
  return res.json(details.rows);
}));

// Acceso con PIN del camarero a una mesa ocupada propia (solo rol Camarero).
app.post('/api/mesas/:id/acceder', requireRoles('Camarero'), route(async (req, res) => {
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  assertValidPin(req.body.pin);
  const mesa = await db.query('SELECT id, estado FROM mesas WHERE id = $1', [mesaId]);
  if (!mesa.rowCount) throw httpError(404, 'Mesa no encontrada.');
  if (mesa.rows[0].estado !== 'Ocupada') throw httpError(409, 'La mesa no estÃ¡ ocupada.');
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
  if (!order.length || order.length > 50) throw httpError(400, 'La comanda no es vÃ¡lida o estÃ¡ vacÃ­a.');
  const requested = new Map();
  for (const item of order) {
    const productId = positiveInteger(item.id || item.producto_id, 'Producto');
    const quantity = positiveInteger(item.cantidad, 'Cantidad');
    if (quantity > 100) throw httpError(400, 'La cantidad mÃ¡xima por producto es 100.');
    requested.set(productId, (requested.get(productId) || 0) + quantity);
  }
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
      throw httpError(403, 'Solo el camarero que abriÃ³ la mesa puede tomar pedidos de esta cuenta.');
    }
    const products = await client.query("SELECT id, precio FROM productos WHERE estado = 'Activo' AND id = ANY($1::int[])", [[...requested.keys()]]);
    if (products.rowCount !== requested.size) throw httpError(400, 'Uno o mÃ¡s productos ya no estÃ¡n disponibles.');
    for (const product of products.rows) await client.query('INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)', [account.id, product.id, requested.get(product.id), product.precio]);
    await registrarAuditoria(client, { usuarioId: req.user.id, accion: 'AGREGAR_PEDIDO', entidad: 'cuentas', entidadId: account.id, detalle: { items: [...requested] }, ip: clientIp(req) });
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
  if (!result.rowCount) throw httpError(404, 'No se encontrÃ³ una cuenta abierta para esta mesa.');
  const receipt = await cobrarCuenta({ cuentaId: result.rows[0].id, actor: req.user, body: req.body, req });
  res.json({ mensaje: 'Pago procesado e inventario actualizado.', ncf: receipt.comprobante, comprobante: receipt.comprobante, totales: receipt });
}));

app.post('/api/autorizar', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const ip = clientIp(req);
  verificarRateLimit(ip);
  const detailId = positiveInteger(req.body.detalle_id, 'Detalle');
  assertValidPin(req.body.pin);
  const result = await db.query("SELECT id, nombre, rol, pin_hash FROM usuarios WHERE estado = 'Activo' AND rol IN ('Administrador', 'CapitÃ¡n de Camareros') AND pin_hash IS NOT NULL");
  const supervisor = result.rows.find((user) => verifyPin(req.body.pin, user.pin_hash));
  if (!supervisor) {
    registrarIntentoFallido(ip);
    return res.status(401).json({ error: 'PIN invÃ¡lido o sin permisos de supervisor.' });
  }
  registrarIntentoExitoso(ip);
  const token = signSupervisorAuthorization({ supervisorId: supervisor.id, action: 'ANULAR_DETALLE', detailId });
  await registrarAuditoria(db, { usuarioId: supervisor.id, accion: 'AUTORIZAR_ANULACION', entidad: 'cuenta_detalles', entidadId: detailId, detalle: { solicitadoPor: req.user.id }, ip: clientIp(req) });
  res.json({ autorizado: true, supervisor: supervisor.nombre, token });
}));

app.delete('/api/cuenta_detalles/:id', requireRoles(...ROLES_OPERACION), route(async (req, res) => {
  const detailId = positiveInteger(req.params.id, 'Detalle');
  const authorization = verifySupervisorAuthorization(req.get('X-Supervisor-Authorization'), { action: 'ANULAR_DETALLE', detailId });
  if (!authorization) throw httpError(403, 'Se requiere una autorizaciÃ³n vigente de supervisor.');
  await transaction(async (client) => {
    const detail = await client.query(`SELECT cd.id, cd.cuenta_id, c.estado FROM cuenta_detalles cd JOIN cuentas c ON c.id = cd.cuenta_id WHERE cd.id = $1 AND cd.anulado_en IS NULL FOR UPDATE`, [detailId]);
    if (!detail.rowCount) throw httpError(404, 'El detalle no existe o ya fue anulado.');
    if (detail.rows[0].estado !== 'Abierta') throw httpError(409, 'No se pueden anular productos de una cuenta cerrada.');
    await client.query('UPDATE cuenta_detalles SET anulado_en = CURRENT_TIMESTAMP, anulado_por = $1, motivo_anulacion = $2 WHERE id = $3', [authorization.supervisorId, String(req.body?.motivo || 'AnulaciÃ³n autorizada'), detailId]);
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
  if (!name || !Number.isFinite(price) || price < 0) throw httpError(400, 'Nombre y precio vÃ¡lido son obligatorios.');
  const image = req.file ? uploadUrl(req, req.file) : String(req.body.imagen_url || '').trim() || null;
  const result = await db.query("INSERT INTO productos (nombre, precio, imagen_url, categoria, estado) VALUES ($1, $2, $3, $4, 'Activo') RETURNING id", [name, price, image, String(req.body.categoria || 'Cocina')]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_PRODUCTO', entidad: 'productos', entidadId: result.rows[0].id, ip: clientIp(req) });
  res.status(201).json({ mensaje: 'Producto creado correctamente.' });
}));

app.post('/api/productos/importar', requireRoles(...ROLES_ADMIN), uploadCsv.single('archivo_csv'), route(async (req, res) => {
  if (!req.file) throw httpError(400, 'Archivo CSV requerido.');
  const csvContent = fs.readFileSync(req.file.path, 'utf-8');
  fs.unlinkSync(req.file.path);

  const lines = csvContent.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) throw httpError(400, 'El archivo CSV estÃ¡ vacÃ­o o no contiene datos.');

  const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const expected = ['nombre', 'precio', 'categoria', 'imagen_url'];
  const missingColumns = expected.filter((col) => !header.includes(col));
  if (missingColumns.length) throw httpError(400, `Columnas faltantes: ${missingColumns.join(', ')}.`);

  const indexes = expected.reduce((acc, col) => ({ ...acc, [col]: header.indexOf(col) }), {});
  const insertable = [];
  const invalidRows = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const row = parseCsvLine(lines[rowIndex]);
    if (row.every((cell) => cell.trim() === '')) continue;
    const nombre = String(row[indexes.nombre] || '').trim();
    const precio = money(row[indexes.precio] || '');
    const categoria = String(row[indexes.categoria] || 'Cocina').trim() || 'Cocina';
    const imagen_url = String(row[indexes.imagen_url] || '').trim() || null;
    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      invalidRows.push({ linea: rowIndex + 1, datos: row, error: 'Nombre o precio invÃ¡lido.' });
      continue;
    }
    insertable.push([nombre, precio, imagen_url, categoria]);
  }

  if (!insertable.length) {
    return res.status(400).json({ error: 'No se encontraron filas vÃ¡lidas para importar.', invalidRows });
  }

  const queryText = 'INSERT INTO productos (nombre, precio, imagen_url, categoria, estado) VALUES ' + insertable.map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, \'Activo\')`).join(', ');
  const queryParams = insertable.flat();
  await db.query(queryText, queryParams);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'IMPORTAR_PRODUCTOS', entidad: 'productos', detalle: { insertados: insertable.length, invalidRows: invalidRows.length }, ip: clientIp(req) });

  res.json({ mensaje: 'ImportaciÃ³n completada.', insertados: insertable.length, invalidRows });
}));

app.put('/api/productos/:id', requireRoles(...ROLES_ADMIN), upload.single('imagen_archivo'), validarImagenSubida, route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Producto');
  const name = String(req.body.nombre || '').trim();
  const price = money(req.body.precio);
  if (!name || !Number.isFinite(price) || price < 0) throw httpError(400, 'Nombre y precio vÃ¡lido son obligatorios.');
  const values = [name, price, String(req.body.categoria || 'Cocina'), id];
  let sql = 'UPDATE productos SET nombre = $1, precio = $2, categoria = $3';
  if (req.file) { values.splice(3, 0, uploadUrl(req, req.file)); sql += ', imagen_url = $4 WHERE id = $5'; } else if (String(req.body.imagen_url || '').trim()) { values.splice(3, 0, String(req.body.imagen_url).trim()); sql += ', imagen_url = $4 WHERE id = $5'; } else sql += ' WHERE id = $4';
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
  res.json({ mensaje: 'Producto eliminado del menÃº.' });
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
  if (!['categorias', 'guarniciones', 'terminos'].includes(tipo) || !nombre) throw httpError(400, 'Configuración inválida.');
  const tabla = tipo === 'categorias' ? 'menu_categorias' : tipo === 'guarniciones' ? 'menu_guarniciones' : 'menu_terminos';
  const query = tipo === 'categorias'
    ? `INSERT INTO ${tabla} (nombre, grupo) VALUES ($1, $2) ON CONFLICT (nombre) DO UPDATE SET activo = TRUE RETURNING *`
    : `INSERT INTO ${tabla} (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET activo = TRUE RETURNING *`;
  const params = tipo === 'categorias' ? [nombre, req.body.grupo === 'bebidas' ? 'bebidas' : 'alimentos'] : [nombre];
  const result = await db.query(query, params);
  res.status(201).json(result.rows[0]);
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
  if (!name || !ROLES_USUARIO.includes(role)) throw httpError(400, 'Usuario o rol no vÃ¡lido.');
  assertValidPin(req.body.pin);
  const result = await db.query("INSERT INTO usuarios (nombre, rol, pin, pin_hash, estado) VALUES ($1, $2, NULL, $3, 'Activo') RETURNING id", [name, role, hashPin(req.body.pin)]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_USUARIO', entidad: 'usuarios', entidadId: result.rows[0].id, detalle: { role }, ip: clientIp(req) });
  res.status(201).json({ mensaje: 'Usuario creado correctamente.' });
}));

app.put('/api/usuarios/:id', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const id = positiveInteger(req.params.id, 'Usuario');
  const name = String(req.body.nombre || '').trim();
  const role = String(req.body.rol || 'Camarero');
  if (!name || !ROLES_USUARIO.includes(role)) throw httpError(400, 'Usuario o rol no vÃ¡lido.');
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
    if (!esFechaValida(desde)) throw httpError(400, 'La fecha inicial (desde) no es vÃ¡lida.');
    parametros.push(desde); condiciones.push(`c.fecha_cierre::date >= $${parametros.length}::date`);
  }
  if (hasta) {
    if (!esFechaValida(hasta)) throw httpError(400, 'La fecha final (hasta) no es vÃ¡lida.');
    parametros.push(hasta); condiciones.push(`c.fecha_cierre::date <= $${parametros.length}::date`);
  }
  const metodosValidos = ['Efectivo', 'Tarjeta', 'Transferencia'];
  if (metodo_pago && metodo_pago !== 'Todos') {
    if (!metodosValidos.includes(metodo_pago)) throw httpError(400, 'MÃ©todo de pago no vÃ¡lido.');
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
  if (!Number.isFinite(initialAmount) || initialAmount < 0) throw httpError(400, 'El monto inicial de apertura debe ser un nÃºmero mayor o igual a 0.');
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
  const result = await db.query('SELECT * FROM dgii_config ORDER BY id LIMIT 1');
  res.json(result.rows[0] || {
    rnc_emisor: '',
    razon_social_emisor: '',
    ambiente: 'Pruebas',
    url_servicio_dgii: 'https://ecf.dgii.gov.do/fe/autenticacion/api/autenticacion',
    client_id: '',
    client_secret: '',
    clave_certificado: '',
    estado_ecf: 'Pendiente de CertificaciÃ³n'
  });
}));

app.post('/api/dgii/config', requireRoles(...ROLES_ADMIN), route(async (req, res) => {
  const { rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf } = req.body;
  const current = await db.query('SELECT id FROM dgii_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query(
      `UPDATE dgii_config 
       SET rnc_emisor=$1, razon_social_emisor=$2, ambiente=$3, url_servicio_dgii=$4, 
           client_id=$5, client_secret=$6, clave_certificado=$7, estado_ecf=$8, actualizado_en=CURRENT_TIMESTAMP 
       WHERE id=$9`,
      [rnc_emisor, razon_social_emisor, ambiente || 'Pruebas', url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf || 'Pendiente de CertificaciÃ³n', current.rows[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO dgii_config 
       (rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [rnc_emisor, razon_social_emisor, ambiente || 'Pruebas', url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf || 'Pendiente de CertificaciÃ³n']
    );
  }
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'ACTUALIZAR_DGII_ECF', entidad: 'dgii_config', ip: clientIp(req) });
  res.json({ mensaje: 'ConfiguraciÃ³n de FacturaciÃ³n ElectrÃ³nica e-CF (DGII) guardada correctamente.' });
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
  if (!name || !Number.isFinite(stock) || stock < 0) throw httpError(400, 'Nombre y stock vÃ¡lido son obligatorios.');
  const result = await db.query("INSERT INTO ingredientes (numero_articulo, nombre, categoria, stock_actual, unidad_medida) VALUES (CONCAT('ART-', LPAD(nextval(pg_get_serial_sequence('ingredientes','id'))::text, 4, '0')), $1, $2, $3, $4) RETURNING numero_articulo, id", [name, String(req.body.categoria || 'General'), stock, String(req.body.unidad_medida || 'Unidades')]);
  await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_INSUMO', entidad: 'ingredientes', entidadId: result.rows[0].id, ip: clientIp(req) });
  res.status(201).json({ mensaje: 'Ãtem de inventario registrado.', numero_articulo: result.rows[0].numero_articulo });
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

// â”€â”€ Servir Frontend compilado (dist/) en producciÃ³n â”€â”€
// Orden de resoluciÃ³n:
//  1) <appRoot>/frontend-restaurante/dist  (dev / proyecto completo)
//  2) <exe>/dist                           (exe junto a una carpeta dist)
//  3) /snapshot/frontend-restaurante/dist  (dist embebido dentro del exe por pkg â†’ autocontenido)
let frontendDist = path.resolve(config.appRoot, 'frontend-restaurante', 'dist');
if (!fs.existsSync(frontendDist)) {
  frontendDist = path.resolve(path.dirname(process.execPath), 'dist');
}
if (!fs.existsSync(frontendDist) && process.pkg) {
  frontendDist = path.join('/snapshot', 'frontend-restaurante', 'dist');
}
if (fs.existsSync(frontendDist)) {
  // Assets con hash en nombre: cachÃ© larga. index.html y resto: siempre revalidar
  // (evita que una actualizaciÃ³n quede servida desde cachÃ© por 7 dÃ­as).
  app.use('/assets', express.static(path.join(frontendDist, 'assets'), { maxAge: '365d', immutable: true }));
  app.use(express.static(frontendDist, { maxAge: 0 }));
  // Catch-all: cualquier ruta no-API devuelve index.html (SPA routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log('ðŸ“¦ Frontend servido desde:', frontendDist);
} else {
  console.warn('âš ï¸ No se encontrÃ³ frontend-restaurante/dist/. Ejecuta "npm run build" en el frontend.');
}

// â”€â”€ Manejador Global de Errores â”€â”€
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'El archivo no cumple con los requisitos.' });
  if (error.message === 'Origen no autorizado.') return res.status(403).json({ error: error.message });
  if (error.code === '23505') return res.status(409).json({ error: 'La operaciÃ³n duplica un registro existente.' });
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
            console.log(`âš¡ Liberado proceso anterior del POS (PID ${pid}) que ocupaba el puerto ${port}.`);
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
        console.log(`âš ï¸ Puerto ${config.port} ocupado. Liberando instancia anterior del POS...`);
        liberarPuertoProcesoPrevio(config.port);
        setTimeout(() => arrancarServidor(intento + 1), 600);
        return;
      }
      console.error(`\nâš ï¸ El puerto ${config.port} ya estÃ¡ en uso por otra instancia del servidor POS.`);
      console.error('   Si el servidor ya estÃ¡ activo, no es necesario iniciar otra instancia.');
      console.error('   Para forzar la liberaciÃ³n automÃ¡tica del puerto, define AUTO_FREE_PORT=1 en el entorno.');
      process.exit(1);
    } else {
      throw err;
    }
  });
}

// ðŸš€ FunciÃ³n asÃ­ncrona de inicio que ejecuta migraciones y arranca Express
const inicializarAplicacion = async () => {
  try {
    await runMigrations(db);
    if (!config.hasPersistentSessionSecret) {
      console.warn('APP_SESSION_SECRET no estÃ¡ configurado: las sesiones se invalidarÃ¡n al reiniciar el servidor.');
    }
  } catch (err) {
    console.warn('âš ï¸ No fue posible completar migraciones iniciales. El servidor arrancarÃ¡ en modo degradado:', err.message);
  }

  arrancarServidor();
};

inicializarAplicacion();
