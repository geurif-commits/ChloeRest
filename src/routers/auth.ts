/**
 * @file Router de autenticación: login por PIN (camarero/administrador/Dueño),
 * validación de sesión, cambio de PIN propio y autorización de supervisor para
 * anular detalles. Puerto directo de server.js (legacy). Rutas con prefijo /api
 * completo; listas para app.use(authRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { config } from '../lib/config.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import {
  assertValidPin,
  assertSixDigitPin,
  createSession,
  firmarDuenoTok,
  hashPin,
  signSupervisorAuthorization,
  verifyPin,
} from '../services/authService.js';
import { ROLES_OPERACION } from '../lib/roles.js';
import { UserRole } from '../types/index.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('authRouter');

// ── Limitador de intentos de PIN (anti fuerza bruta) ──
// Puerto local del loginLimiter de server.js; mismo umbral por IP que el
// legacy: config.login.maxAttempts / windowMinutes / lockoutMinutes.
interface IIntentoRecord {
  count: number;
  primerIntento: number;
  bloqueadoHasta: number | null;
}

const loginLimiter = {
  intentos: new Map<string | null, IIntentoRecord>(),
  maxAttempts: config.login.maxAttempts,
  windowMs: config.login.windowMinutes * 60 * 1000,
  lockoutMs: config.login.lockoutMinutes * 60 * 1000,
  limpiarVencidos(): void {
    const now = Date.now();
    for (const [key, record] of this.intentos) {
      if (record.bloqueadoHasta && record.bloqueadoHasta <= now) {
        this.intentos.delete(key);
      } else if (!record.bloqueadoHasta && now - record.primerIntento > this.windowMs) {
        this.intentos.delete(key);
      }
    }
  },
};

function verificarRateLimit(ip: string | null): void {
  loginLimiter.limpiarVencidos();
  const record = loginLimiter.intentos.get(ip);
  if (!record || !record.bloqueadoHasta) {return;}
  const restanteMin = Math.ceil((record.bloqueadoHasta - Date.now()) / 60000);
  throw httpError(429, `Demasiados intentos fallidos. Reintenta en ${restanteMin} min.`);
}

function registrarIntentoFallido(ip: string | null): void {
  const now = Date.now();
  const record = loginLimiter.intentos.get(ip) || { count: 0, primerIntento: now, bloqueadoHasta: null };
  record.count += 1;
  if (record.count >= loginLimiter.maxAttempts) {
    record.bloqueadoHasta = now + loginLimiter.lockoutMs;
    record.count = 0;
    logger.warn({ action: 'IP_BLOQUEADA_LOGIN', ip: ip || 'unknown', intentos: loginLimiter.maxAttempts });
  }
  loginLimiter.intentos.set(ip, record);
}

function registrarIntentoExitoso(ip: string | null): void {
  loginLimiter.intentos.delete(ip);
}

interface IUsuarioLoginFila {
  id: number;
  empresa_id: number | null;
  nombre: string;
  rol: string;
  pin_hash: string | null;
  requiere_cambio_pin: boolean | null;
}

interface IDispositivoLoginFila {
  empresa_id: number | null;
  estado: string | null;
  licencia_vencimiento: Date | null;
}

interface ISupervisorFila {
  id: number;
  nombre: string;
  rol: string;
  pin_hash: string | null;
}

const SQL_USUARIOS_PIN =
  'SELECT id, empresa_id, nombre, rol, pin_hash, requiere_cambio_pin FROM usuarios WHERE (empresa_id = $1 OR empresa_id IS NULL) AND estado = \'Activo\' AND pin_hash IS NOT NULL';

// POST /api/login/camarero (público; pantalla de login por PIN)
router.post('/api/login/camarero', route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const ip = clientIp(req);
  const deviceId = String(req.get('x-device-id') || req.body.deviceId || '').trim();
  const pin = String(req.body.pin || '').trim();

  // 1. Verificación universal del Dueño / Propietario: sin rate-limit y sin
  // alterar el estado del dispositivo.
  const cfg = await db.queryUnscoped<{ owner_pin_hash: string | null }>(
    'SELECT owner_pin_hash FROM configuracion_sistema ORDER BY id LIMIT 1'
  );
  const storedOwnerHash = cfg.rows[0]?.owner_pin_hash || null;
  const esPinDueno = (config.ownerPin && pin === String(config.ownerPin).trim()) ||
    (storedOwnerHash && verifyPin(pin, storedOwnerHash));

  if (esPinDueno) {
    registrarIntentoExitoso(ip);
    const duenoUser = {
      id: 0,
      nombre: 'Propietario / Dueño',
      rol: 'Dueno' as UserRole,
      empresa_id: 1,
      device_id: deviceId || 'temp-owner-session',
    };
    const session = await createSession(duenoUser);
    res.json({
      ...session,
      esDueno: true,
      requiereCambioPin: false,
      tokenDueno: firmarDuenoTok({ rol: 'Dueno', exp: Date.now() + 12 * 3600 * 1000 }),
    });
    return;
  }

  verificarRateLimit(ip);
  assertValidPin(pin);
  if (!deviceId) {throw httpError(400, 'Identificador de dispositivo requerido.');}

  const device = await db.queryUnscoped<IDispositivoLoginFila>(
    'SELECT empresa_id, estado, licencia_vencimiento FROM dispositivos WHERE device_id = $1',
    [deviceId]
  );
  const esDispositivoActivo = Boolean(device.rowCount) && device.rows[0].estado === 'Activo';

  if (!esDispositivoActivo) {
    // Si el dispositivo no está activado, SOLO el Administrador Legacy
    // (Empresa 1 / empresa NULL) puede ingresar. Cualquier otro PIN o usuario
    // no autorizado debe ser estrictamente rechazado.
    const legacyAdminResult = await db.queryUnscoped<IUsuarioLoginFila>(
      "SELECT id, empresa_id, nombre, rol, pin_hash, requiere_cambio_pin FROM usuarios WHERE (empresa_id = 1 OR empresa_id IS NULL) AND rol = 'Administrador' AND estado = 'Activo' AND pin_hash IS NOT NULL"
    );
    const legacyMatches = legacyAdminResult.rows.filter((candidate) => verifyPin(pin, candidate.pin_hash));
    if (!legacyMatches.length) {
      registrarIntentoFallido(ip);
      res.status(401).json({ error: 'PIN de administrador inválido o dispositivo no activado.' });
      return;
    }
    registrarIntentoExitoso(ip);
    const admin = legacyMatches[0];
    const session = await createSession({
      id: admin.id,
      nombre: admin.nombre,
      rol: admin.rol as UserRole,
      empresa_id: admin.empresa_id,
      device_id: deviceId,
    });
    res.json({ ...session, requiereCambioPin: Boolean(admin.requiere_cambio_pin) });
    return;
  }

  const dispositivo = device.rows[0];
  if (dispositivo.licencia_vencimiento && new Date(dispositivo.licencia_vencimiento).getTime() < Date.now()) {
    throw httpError(403, 'La licencia de este dispositivo ha vencido.');
  }
  const empresaId = dispositivo.empresa_id || 1;
  const result = await db.queryUnscoped<IUsuarioLoginFila>(SQL_USUARIOS_PIN, [empresaId]);
  // Bug-for-bug con el legacy: aquí se compara el PIN crudo del body (sin trim).
  const matches = result.rows.filter((candidate) => verifyPin(req.body.pin, candidate.pin_hash));
  if (!matches.length) {
    registrarIntentoFallido(ip);
    res.status(401).json({ error: 'PIN incorrecto.' });
    return;
  }
  if (matches.length > 1) {
    registrarIntentoFallido(ip);
    res.status(401).json({ error: 'PIN duplicado. Contacta al administrador.' });
    return;
  }
  registrarIntentoExitoso(ip);
  const user = matches[0];
  const session = await createSession({
    id: user.id,
    nombre: user.nombre,
    rol: user.rol as UserRole,
    empresa_id: user.empresa_id,
    device_id: deviceId,
  });
  res.json({ ...session, requiereCambioPin: Boolean(user.requiere_cambio_pin) });
}));

// GET /api/sesion/validar (requiere sesión o token de Dueño)
router.get('/api/sesion/validar', requireAuth, route(async (req: Request, res: Response) => {
  const auth = req.auth!;
  res.json({
    valido: true,
    usuario: {
      ...auth,
      id: auth.userId,
      rol: auth.userRole,
      empresa_id: auth.empresaId,
    },
  });
}));

// PATCH /api/usuarios/mi-pin (cambio de PIN del usuario en sesión)
router.patch('/api/usuarios/mi-pin', requireAuth, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  assertSixDigitPin(req.body.pin);
  await db.query(
    'UPDATE usuarios SET pin_hash = $1, pin = NULL, requiere_cambio_pin = FALSE WHERE id = $2 AND empresa_id = $3 AND estado = \'Activo\'',
    [hashPin(req.body.pin), req.auth!.userId, req.auth!.empresaId]
  );
  res.json({ ok: true });
}));

// POST /api/autorizar (autorización de supervisor para anular un detalle)
router.post('/api/autorizar', requireAuth, requireRoles(...ROLES_OPERACION), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const ip = clientIp(req);
  verificarRateLimit(ip);
  const detailId = positiveInteger(req.body.detalle_id, 'Detalle');
  assertSixDigitPin(req.body.pin);

  const result = await db.query<ISupervisorFila>(
    "SELECT id, nombre, rol, pin_hash FROM usuarios WHERE estado = 'Activo' AND rol IN ('Administrador', 'Capitán de Camareros') AND pin_hash IS NOT NULL"
  );
  const supervisor = result.rows.find((candidate) => verifyPin(req.body.pin, candidate.pin_hash));
  if (!supervisor) {
    registrarIntentoFallido(ip);
    res.status(403).json({ error: 'PIN inválido o sin permisos de supervisor.' });
    return;
  }
  registrarIntentoExitoso(ip);
  const token = signSupervisorAuthorization({ supervisorId: supervisor.id, action: 'ANULAR_DETALLE', detailId });
  await registrarAuditoria(db, {
    usuarioId: supervisor.id,
    accion: 'AUTORIZAR_ANULACION',
    entidad: 'cuenta_detalles',
    entidadId: detailId,
    detalle: { solicitadoPor: req.auth!.userId },
    ip: clientIp(req),
  });
  logger.info({ action: 'AUTORIZAR_ANULACION', supervisorId: supervisor.id, detailId });
  res.json({ autorizado: true, supervisor: supervisor.nombre, token });
}));

export default router;
