/**
 * @file Router de plataforma/licencias/dispositivos (endpoints públicos y de
 * gestión con sesión). Puerto directo de server.js (legacy). Rutas con prefijo
 * /api completo; listas para app.use(dispositivosRouter).
 */

import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { route, httpError, clientIp } from '../lib/core.js';
import { config } from '../lib/config.js';
import { ROLES_ADMIN, ROLES_CAJA } from '../lib/roles.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { requireAuth, requireRoles, requireAdminODueno } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import {
  verificarLicenciaPublica,
  registrarDispositivoPublico,
  activarDispositivo,
  listarDispositivos,
  cambiarEstadoDispositivo,
  eliminarDispositivo,
  activarLicenciaDesdeSesion,
  listarCuentasBancarias,
  crearCuentaBancaria,
  actualizarCuentaBancaria,
  eliminarCuentaBancaria,
} from '../services/plataformaService.js';
import {
  obtenerSolicitudPorId,
  generarFacturaSolicitud,
} from '../services/licenciasService.js';
import { notificarSolicitud, notificarPago } from '../services/telegramBotService.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('dispositivosRouter');

interface IPlanFila {
  id: number;
  nombre: string;
  duracion_codigo: string;
  precio: string;
  moneda: string;
  destacado: boolean;
  orden: number;
}

interface IMetodoPagoFila {
  id: number;
  tipo: string;
  nombre: string;
  activo: boolean;
}

function idDeParametro(value: string, mensaje: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {throw httpError(400, mensaje);}
  return id;
}

// GET /api/licencia/verificar (público, pantalla de login)
router.get('/api/licencia/verificar', route(async (_req: Request, res: Response) => {
  res.json(await verificarLicenciaPublica());
}));

// POST /api/dispositivo/registrar (público)
router.post('/api/dispositivo/registrar', route(async (req: Request, res: Response) => {
  const navegador = String(req.body.navegador || '').slice(0, 300);
  res.json(
    await registrarDispositivoPublico({
      deviceId: String(req.body.deviceId || '').trim(),
      headerDeviceId: String(req.get('x-device-id') || '').trim(),
      navegador,
      ip: clientIp(req),
    })
  );
}));

// POST /api/dispositivo/activar (público)
router.post('/api/dispositivo/activar', route(async (req: Request, res: Response) => {
  const cuerpo = await activarDispositivo({
    deviceId: String(req.body.deviceId || '').trim(),
    clave: String(req.body.clave || '').trim().toUpperCase(),
    ip: clientIp(req),
    navegador: String(req.get('user-agent') || '').slice(0, 300),
  });
  logger.info({ action: 'ACTIVAR_DISPOSITIVO', empresaId: cuerpo.empresaId });
  res.json(cuerpo);
}));

// GET /api/dispositivos (Administrador o Dueño)
router.get('/api/dispositivos', requireAdminODueno, route(async (req: Request, res: Response) => {
  const esDueno = req.auth!.isDueno;
  const filas = await listarDispositivos(esDueno, req.auth!.empresaId ?? 1);
  res.json({
    dispositivos: filas,
    limiteMaximo: 2,
    licenciaConfigurada: Boolean(config.licenseActivationKey),
    ...(esDueno ? { claveMaestra: config.licenseActivationKey || '' } : {}),
  });
}));

// POST /api/dispositivos/:id/estado (Administrador o Dueño)
router.post('/api/dispositivos/:id/estado', requireAdminODueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const estado = String(req.body.estado || '').trim();
  if (!['Activo', 'Inactivo'].includes(estado)) {throw httpError(400, 'Estado inválido.');}
  res.json({ ok: true, dispositivo: await cambiarEstadoDispositivo(id, estado) });
}));

// DELETE /api/dispositivos/:id (Administrador o Dueño)
router.delete('/api/dispositivos/:id', requireAdminODueno, route(async (req: Request, res: Response) => {
  const id = idDeParametro(req.params.id, 'ID de dispositivo inválido.');
  await eliminarDispositivo(id, req.auth!.isDueno, req.auth!.empresaId ?? 1);
  res.json({ ok: true, mensaje: 'Dispositivo eliminado correctamente.', id });
}));

// GET /api/planes (público, web de venta)
router.get('/api/planes', route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.queryUnscoped<IPlanFila>(
    `SELECT id, nombre, duracion_codigo, precio, moneda, destacado, orden
     FROM planes_licencia WHERE activo = TRUE ORDER BY orden, id`
  );
  res.json({ planes: result.rows });
}));

// GET /api/metodos-pago (público, web de venta)
router.get('/api/metodos-pago', route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.queryUnscoped<IMetodoPagoFila>(
    `SELECT id, tipo, nombre, titular, detalle, dato1, dato2, dato3, link_pago, orden
     FROM metodos_pago WHERE activo = TRUE ORDER BY orden, id`
  );
  res.json({ metodos: result.rows });
}));

// POST /api/solicitud-licencia (público, formulario de registro)
router.post('/api/solicitud-licencia', route(async (req: Request, res: Response) => {
  const db = getDatabase();
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {throw httpError(400, 'El correo electrónico no es válido.');}

  const planRes = await db.queryUnscoped<{ id: number; nombre: string }>(
    'SELECT id, nombre FROM planes_licencia WHERE id = $1 AND activo = TRUE',
    [planId]
  );
  if (!planRes.rowCount) {
    throw httpError(400, 'El plan seleccionado no es válido o no está disponible.');
  }
  const planNombre = planRes.rows[0].nombre;

  const tokenPago = crypto.randomBytes(24).toString('hex');
  const result = await db.queryUnscoped<{ id: number; token_pago: string }>(
    `INSERT INTO solicitudes_licencia (plan_id, plan_nombre, propietario, negocio, telefono, email, provincia, notas, token_pago)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, token_pago`,
    [planId, planNombre, propietario, negocio, telefono, email, provincia || null, notas || null, tokenPago]
  );
  const nuevaId = result.rows[0].id;
  try {
    const nueva = await obtenerSolicitudPorId(nuevaId);
    if (nueva) {notificarSolicitud(nueva);}
  } catch (err) {
    logger.warn({ action: 'TELEGRAM_SOLICITUD_NO_NOTIFICADA', error: (err as Error).message });
  }
  logger.info({ action: 'SOLICITUD_LICENCIA_CREADA', solicitudId: nuevaId });
  res.json({
    mensaje: 'Tu solicitud fue enviada correctamente. Te contactaremos con tu clave de activación.',
    id: nuevaId,
    tokenPago: result.rows[0].token_pago,
  });
}));

// POST /api/solicitud-licencia/:id/confirmar-pago (público)
router.post('/api/solicitud-licencia/:id/confirmar-pago', route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = Number(req.params.id);
  const token = String(req.body.token || '').trim();
  const metodoId = Number(req.body.metodo_id);
  const comprobante = String(req.body.comprobante || '').trim() || null;
  if (!token || !Number.isInteger(metodoId) || metodoId <= 0) {
    throw httpError(400, 'Faltan datos para confirmar el pago.');
  }
  const sol = await db.queryUnscoped<{ id: number; token_pago: string | null; estado: string }>(
    'SELECT id, token_pago, estado FROM solicitudes_licencia WHERE id = $1',
    [id]
  );
  if (!sol.rowCount) {throw httpError(404, 'Solicitud no encontrada.');}
  if (!sol.rows[0].token_pago || sol.rows[0].token_pago !== token) {
    throw httpError(403, 'Token de pago inválido.');
  }
  const met = await db.queryUnscoped<{ nombre: string }>(
    'SELECT nombre FROM metodos_pago WHERE id = $1 AND activo = TRUE',
    [metodoId]
  );
  if (!met.rowCount) {throw httpError(400, 'Método de pago no disponible.');}
  const estadoActual = sol.rows[0].estado;
  const result = await db.queryUnscoped<{ id: number; estado: string; metodo_pago: string | null; pagada_en: Date | null }>(
    `UPDATE solicitudes_licencia
        SET estado = 'Pagada',
            metodo_pago = COALESCE(metodo_pago, $1),
            comprobante = COALESCE($2, comprobante),
            pagada_en = COALESCE(pagada_en, CURRENT_TIMESTAMP)
      WHERE id = $3 RETURNING id, estado, metodo_pago, pagada_en`,
    [met.rows[0].nombre, comprobante, id]
  );
  await generarFacturaSolicitud(id);
  await runWithRequestContext({ empresaId: 1 }, () =>
    registrarAuditoria(db, {
      usuarioId: null,
      accion: 'CONFIRMAR_PAGO',
      entidad: 'solicitudes_licencia',
      entidadId: String(id),
      detalle: { metodo: met.rows[0].nombre, estadoAnterior: estadoActual },
      ip: clientIp(req),
    })
  );
  try {
    const pagada = await obtenerSolicitudPorId(id);
    if (pagada) {notificarPago(pagada);}
  } catch (err) {
    logger.warn({ action: 'TELEGRAM_PAGO_NO_NOTIFICADO', error: (err as Error).message });
  }
  logger.info({ action: 'CONFIRMAR_PAGO', solicitudId: id, metodo: met.rows[0].nombre });
  res.json({ ok: true, solicitud: result.rows[0] });
}));

// POST /api/licencia/activar (Administrador en sesión; replica el flujo legacy)
router.post('/api/licencia/activar', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const resultado = await activarLicenciaDesdeSesion({
    duracionMeses: req.body.duracion_meses,
    claveMaestra: String(req.body.clave_maestra || '').trim(),
    ip: clientIp(req),
    usuarioId: req.auth!.userId,
  });
  if (!resultado.ok) {
    res.status(401).json({ error: resultado.error401 });
    return;
  }
  res.json({ mensaje: 'Licencia activada correctamente.', bloqueado: false });
}));

// ──── CRUD Cuentas Bancarias (por empresa) ────

// GET /api/cuentas-bancarias (Cajero/Administrador)
router.get('/api/cuentas-bancarias', requireAuth, requireRoles(...ROLES_CAJA), route(async (_req: Request, res: Response) => {
  res.json(await listarCuentasBancarias());
}));

// POST /api/cuentas-bancarias (Administrador)
router.post('/api/cuentas-bancarias', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const fila = await crearCuentaBancaria(req.body);
  await registrarAuditoria(getDatabase(), {
    usuarioId: req.auth!.userId,
    accion: 'CREAR_CUENTA_BANCARIA',
    entidad: 'cuentas_bancarias',
    entidadId: Number(fila.id),
    ip: clientIp(req),
  });
  res.json(fila);
}));

// PUT /api/cuentas-bancarias/:id (Administrador)
router.put('/api/cuentas-bancarias/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const id = idDeParametro(req.params.id, 'Cuenta bancaria no es válido.');
  const fila = await actualizarCuentaBancaria(id, req.body);
  await registrarAuditoria(getDatabase(), {
    usuarioId: req.auth!.userId,
    accion: 'EDITAR_CUENTA_BANCARIA',
    entidad: 'cuentas_bancarias',
    entidadId: id,
    ip: clientIp(req),
  });
  res.json(fila);
}));

// DELETE /api/cuentas-bancarias/:id (Administrador)
router.delete('/api/cuentas-bancarias/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const id = idDeParametro(req.params.id, 'Cuenta bancaria no es válido.');
  await eliminarCuentaBancaria(id);
  await registrarAuditoria(getDatabase(), {
    usuarioId: req.auth!.userId,
    accion: 'ELIMINAR_CUENTA_BANCARIA',
    entidad: 'cuentas_bancarias',
    entidadId: id,
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Cuenta bancaria eliminada.' });
}));

export default router;
