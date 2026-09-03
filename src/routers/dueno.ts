/**
 * @file Router del panel del Propietario/Dueño (/api/dueno/*): facturas,
 * licencias, login, reset de pruebas, resumen, planes, solicitudes y métodos
 * de pago. Puerto directo de server.js (legacy). Rutas con prefijo /api
 * completo; listas para app.use(duenoRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, clientIp } from '../lib/core.js';
import { config } from '../lib/config.js';
import { getDatabase } from '../db/index.js';
import { requireDueno } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { assertValidPin, firmarDuenoTok, hashPin, verifyPin } from '../services/authService.js';
import {
  verificarRateLimit,
  registrarIntentoFallido,
  registrarIntentoExitoso,
  resetearDatosPruebas,
  revocarLicencia,
  reactivarLicencia,
  eliminarLicencia,
  listarLicenciasDueno,
  listarFacturasDueno,
  resumenDueno,
  listarPlanesDueno,
  crearPlanDueno,
  actualizarPlanDueno,
  eliminarPlanDueno,
  listarMetodosPagoDueno,
  crearMetodoPagoDueno,
  actualizarMetodoPagoDueno,
  eliminarMetodoPagoDueno,
} from '../services/plataformaService.js';
import {
  obtenerSolicitudPorId,
  cambiarEstadoSolicitud,
  generarClaveParaSolicitud,
  crearLicenciaConAdministrador,
  construirCorreoActivacion,
} from '../services/licenciasService.js';
import { parsearDuracion } from '../lib/licencias.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('duenoRouter');

interface IPlanBody {
  nombre: string;
  duracionCodigo: string;
  precio: number;
  moneda: string;
  destacado: boolean;
  activo: boolean;
  orden: number;
}

interface IMetodoBody {
  tipo: string;
  nombre: string;
  titular: string | null;
  detalle: string | null;
  dato1: string | null;
  dato2: string | null;
  dato3: string | null;
  linkPago: string | null;
  activo: boolean;
  orden: number;
}

/** Parsea y valida el body de un plan (POST/PUT /api/dueno/planes). */
function planDesdeBody(body: Record<string, unknown>, msgDuracion: string): IPlanBody {
  const nombre = String(body.nombre || '').trim();
  const duracionCodigo = String(body.duracion_codigo || '').trim().toUpperCase();
  const precio = Number(body.precio);
  const moneda = String(body.moneda || 'RD$').trim() || 'RD$';
  const destacado = Boolean(body.destacado);
  const activo = body.activo === false ? false : true;
  const orden = Number(body.orden || 0);
  if (!nombre) {throw httpError(400, 'El nombre del plan es obligatorio.');}
  if (!parsearDuracion(duracionCodigo)) {throw httpError(400, msgDuracion);}
  if (!Number.isFinite(precio) || precio < 0) {throw httpError(400, 'Precio inválido.');}
  return { nombre, duracionCodigo, precio, moneda, destacado, activo, orden };
}

/** Parsea y valida el body de un método de pago (POST/PUT /api/dueno/metodos-pago). */
function metodoDesdeBody(body: Record<string, unknown>): IMetodoBody {
  const tipo = String(body.tipo || '').trim().toLowerCase();
  const nombre = String(body.nombre || '').trim();
  const titular = String(body.titular || '').trim() || null;
  const detalle = String(body.detalle || '').trim() || null;
  const dato1 = String(body.dato1 || '').trim() || null;
  const dato2 = String(body.dato2 || '').trim() || null;
  const dato3 = String(body.dato3 || '').trim() || null;
  const linkPago = String(body.link_pago || '').trim() || null;
  const activo = body.activo === false ? false : true;
  const orden = Number(body.orden || 0);
  if (!['paypal', 'transferencia', 'binance', 'usdt'].includes(tipo)) {
    throw httpError(400, 'Tipo inválido. Usa paypal, transferencia, binance o usdt.');
  }
  if (!nombre) {throw httpError(400, 'El nombre del método de pago es obligatorio.');}
  return { tipo, nombre, titular, detalle, dato1, dato2, dato3, linkPago, activo, orden };
}

function auditar(accion: string, entidad: string, entidadId: number | string | null, req: Request, detalle?: Record<string, unknown>): Promise<void> {
  return registrarAuditoria(getDatabase(), {
    usuarioId: null,
    accion,
    entidad,
    entidadId: entidadId === null ? undefined : entidadId,
    detalle,
    ip: clientIp(req),
  });
}

// GET /api/dueno/facturas
router.get('/api/dueno/facturas', requireDueno, route(async (_req: Request, res: Response) => {
  res.json({ facturas: await listarFacturasDueno() });
}));

// GET /api/dueno/licencias
router.get('/api/dueno/licencias', requireDueno, route(async (_req: Request, res: Response) => {
  res.json({ licencias: await listarLicenciasDueno() });
}));

// POST /api/dueno/licencias/:id/revocar
router.post('/api/dueno/licencias/:id/revocar', requireDueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const motivo = String(req.body.motivo || 'Revocada por el propietario').trim();
  await revocarLicencia(id, motivo);
  res.json({ ok: true, mensaje: 'Licencia revocada y terminales bloqueadas.' });
}));

// POST /api/dueno/licencias/:id/reactivar
router.post('/api/dueno/licencias/:id/reactivar', requireDueno, route(async (req: Request, res: Response) => {
  await reactivarLicencia(Number(req.params.id));
  res.json({ ok: true, mensaje: 'Licencia reactivada correctamente.' });
}));

// DELETE /api/dueno/licencias/:id
router.delete('/api/dueno/licencias/:id', requireDueno, route(async (req: Request, res: Response) => {
  await eliminarLicencia(Number(req.params.id));
  res.json({ ok: true, mensaje: 'Licencia eliminada permanentemente del sistema.' });
}));

// POST /api/dueno/login (acceso universal del dueño, sin rate-limit de sesión)
router.post('/api/dueno/login', route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const ip = clientIp(req);
  verificarRateLimit(ip);
  const pin = String(req.body.pin || '').trim();
  assertValidPin(pin);

  // Obtener hash del PIN del dueño desde BD o config
  const cfg = await db.queryUnscoped<{ owner_pin_hash: string | null }>(
    'SELECT owner_pin_hash FROM configuracion_sistema ORDER BY id LIMIT 1'
  );
  const storedHash = cfg.rows[0]?.owner_pin_hash || null;

  let esValido = false;
  if (config.ownerPin && pin === String(config.ownerPin).trim()) {esValido = true;}
  else if (storedHash && verifyPin(pin, storedHash)) {esValido = true;}
  else if (!storedHash) {
    const admins = await db.queryUnscoped<{ pin_hash: string | null }>(
      "SELECT pin_hash FROM usuarios WHERE rol = 'Administrador' AND estado = 'Activo' AND pin_hash IS NOT NULL"
    );
    if (admins.rows.some((admin) => verifyPin(pin, admin.pin_hash))) {
      esValido = true;
      const nuevoHash = hashPin(pin);
      await db.queryUnscoped(
        'UPDATE configuracion_sistema SET owner_pin_hash = $1, owner_pin_longitud = $2, actualizado_en = CURRENT_TIMESTAMP WHERE owner_pin_hash IS NULL',
        [nuevoHash, pin.length]
      );
    }
  }

  if (!esValido) {
    registrarIntentoFallido(ip);
    res.status(401).json({ error: 'PIN de propietario incorrecto.' });
    return;
  }

  // Al autenticarse el dueño con éxito, liberamos cualquier bloqueo previo en esta IP
  registrarIntentoExitoso(ip);
  logger.info({ action: 'DUENO_LOGIN_OK' });
  const exp = Date.now() + 12 * 3600 * 1000;
  res.json({ token: firmarDuenoTok({ rol: 'Dueno', exp }), expiraEn: new Date(exp).toISOString() });
}));

// POST /api/dueno/reset-pruebas
router.post('/api/dueno/reset-pruebas', requireDueno, route(async (req: Request, res: Response) => {
  if (String(req.body.confirmacion || '').trim() !== 'BORRAR PRUEBAS') {
    throw httpError(400, 'Escribe BORRAR PRUEBAS para confirmar esta operación.');
  }
  try {
    await resetearDatosPruebas();
    await registrarAuditoria(getDatabase(), {
      usuarioId: null,
      accion: 'RESET_PRUEBAS',
      entidad: 'sistema',
      detalle: { ip: clientIp(req) },
      ip: clientIp(req),
    });
    res.json({ ok: true, mensaje: 'Datos de prueba eliminados exitosamente. El Setup Wizard está listo para iniciar.' });
  } catch (err) {
    logger.error({ action: 'RESET_PRUEBAS_ERROR', error: (err as Error).message });
    res.status(500).json({ ok: false, error: 'Error interno del servidor: ' + (err as Error).message });
  }
}));

// GET /api/dueno/resumen
router.get('/api/dueno/resumen', requireDueno, route(async (_req: Request, res: Response) => {
  const resumen = await resumenDueno();
  res.json({ ...resumen, claveMaestra: config.licenseActivationKey || '' });
}));

// ──── Planes de licencia (panel del dueño) ────

// GET /api/dueno/planes
router.get('/api/dueno/planes', requireDueno, route(async (_req: Request, res: Response) => {
  res.json({ planes: await listarPlanesDueno() });
}));

// POST /api/dueno/planes
router.post('/api/dueno/planes', requireDueno, route(async (req: Request, res: Response) => {
  const p = planDesdeBody(req.body, 'Código de duración inválido. Usa por ejemplo 30D, 90D, 6M, 12M o L.');
  const plan = await crearPlanDueno(p);
  await auditar('CREAR_PLAN', 'planes_licencia', Number(plan.id), req);
  res.json({ plan });
}));

// PUT /api/dueno/planes/:id
router.put('/api/dueno/planes/:id', requireDueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const p = planDesdeBody(req.body, 'Código de duración inválido.');
  const plan = await actualizarPlanDueno(id, p);
  await auditar('ACTUALIZAR_PLAN', 'planes_licencia', id, req);
  res.json({ plan });
}));

// DELETE /api/dueno/planes/:id
router.delete('/api/dueno/planes/:id', requireDueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await eliminarPlanDueno(id);
  await auditar('ELIMINAR_PLAN', 'planes_licencia', id, req);
  res.json({ ok: true });
}));

// ──── Solicitudes de licencia (panel del dueño) ────

// GET /api/dueno/solicitudes
router.get('/api/dueno/solicitudes', requireDueno, route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query(
    `SELECT s.*, p.duracion_codigo AS plan_duracion
       FROM solicitudes_licencia s
       LEFT JOIN planes_licencia p ON p.id = s.plan_id
      ORDER BY s.creado_en DESC`
  );
  res.json({ solicitudes: result.rows });
}));

// PUT /api/dueno/solicitudes/:id/estado
router.put('/api/dueno/solicitudes/:id/estado', requireDueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const estado = String(req.body.estado || '').trim();
  const resultado = await cambiarEstadoSolicitud(id, estado, clientIp(req), 'panel-dueno');
  if (resultado.error) {throw httpError(404, resultado.error);}
  res.json({ ok: true, solicitud: resultado.solicitud });
}));

// POST /api/dueno/solicitudes/:id/generar-clave (genera y envía por Telegram)
router.post('/api/dueno/solicitudes/:id/generar-clave', requireDueno, route(async (req: Request, res: Response) => {
  const cuerpo = await generarClaveParaSolicitud(
    Number(req.params.id),
    String(req.body.duracion || '').trim().toUpperCase(),
    clientIp(req)
  );
  res.json(cuerpo);
}));

// DELETE /api/dueno/solicitudes/:id
router.delete('/api/dueno/solicitudes/:id', requireDueno, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = Number(req.params.id);
  const result = await db.query('DELETE FROM solicitudes_licencia WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {throw httpError(404, 'Solicitud no encontrada.');}
  await auditar('ELIMINAR_SOLICITUD', 'solicitudes_licencia', id, req);
  res.json({ ok: true, mensaje: 'Solicitud eliminada correctamente.', id });
}));

// POST /api/dueno/solicitudes/:id/enviar-email (prepara instrucciones mailto)
router.post('/api/dueno/solicitudes/:id/enviar-email', requireDueno, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = Number(req.params.id);
  const solicitud = await obtenerSolicitudPorId(id);
  if (!solicitud) {throw httpError(404, 'Solicitud no encontrada.');}
  if (!solicitud.email) {throw httpError(400, 'La solicitud no tiene correo electrónico registrado.');}
  if (!solicitud.clave_generada) {throw httpError(400, 'Genera primero la clave de activación antes de enviarla.');}

  const correo = construirCorreoActivacion(solicitud);
  await db.queryUnscoped(
    'UPDATE solicitudes_licencia SET clave_enviada_en = COALESCE(clave_enviada_en, CURRENT_TIMESTAMP) WHERE id = $1',
    [id]
  );
  await auditar('ENVIAR_EMAIL_ACTIVACION', 'solicitudes_licencia', id, req, {
    email: solicitud.email,
    negocio: solicitud.negocio,
  });

  res.json({
    ok: true,
    mensaje: `Instrucciones preparadas para ${solicitud.email}`,
    email: solicitud.email,
    asunto: correo.asunto,
    mailtoUrl: correo.mailtoUrl,
    texto: correo.textoPlano,
    html: correo.html,
  });
}));

// POST /api/dueno/generar-clave (clave libre, sin solicitud)
router.post('/api/dueno/generar-clave', requireDueno, route(async (req: Request, res: Response) => {
  const dur = String(req.body.duracion || '').trim().toUpperCase();
  const resultado = await crearLicenciaConAdministrador(dur);
  if (resultado.error) {
    throw httpError(resultado.error.includes('LICENSE_ACTIVATION_KEY') ? 503 : 400, resultado.error);
  }
  await auditar('GENERAR_CLAVE', 'planes_licencia', null, req, { duracion: resultado.duracion });
  res.json({
    clave: resultado.clave,
    duracion: resultado.duracion,
    vitalicia: resultado.vitalicia,
    pinInicial: resultado.pinInicial,
    empresaId: resultado.empresaId,
    ejemplo: 'CHLOE-12M-XXXXX-XXXXX-XXXXX-XXXXX',
  });
}));

// ──── Métodos de pago (panel del dueño) ────

// GET /api/dueno/metodos-pago
router.get('/api/dueno/metodos-pago', requireDueno, route(async (_req: Request, res: Response) => {
  res.json({ metodos: await listarMetodosPagoDueno() });
}));

// POST /api/dueno/metodos-pago
router.post('/api/dueno/metodos-pago', requireDueno, route(async (req: Request, res: Response) => {
  const m = metodoDesdeBody(req.body);
  const metodo = await crearMetodoPagoDueno(m);
  await auditar('CREAR_METODO_PAGO', 'metodos_pago', Number(metodo.id), req);
  res.json({ metodo });
}));

// PUT /api/dueno/metodos-pago/:id
router.put('/api/dueno/metodos-pago/:id', requireDueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const m = metodoDesdeBody(req.body);
  const metodo = await actualizarMetodoPagoDueno(id, m);
  await auditar('ACTUALIZAR_METODO_PAGO', 'metodos_pago', id, req);
  res.json({ metodo });
}));

// DELETE /api/dueno/metodos-pago/:id
router.delete('/api/dueno/metodos-pago/:id', requireDueno, route(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await eliminarMetodoPagoDueno(id);
  await auditar('ELIMINAR_METODO_PAGO', 'metodos_pago', id, req);
  res.json({ ok: true });
}));

export default router;
