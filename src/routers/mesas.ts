/**
 * @file Router de MESAS/CUENTAS/PEDIDOS (flujo transaccional central del POS):
 * mapa de mesas, generar/editar/eliminar, abrir, trasladar, ver cuenta,
 * acceso con PIN, comandas, cobro/cierre (4 alias), anulación de detalle con
 * autorización de supervisor y pedido para llevar. Puerto directo de server.js
 * (legacy, líneas ~2426-2640 y ~3202). Rutas con prefijo /api completo; listas
 * para app.use(mesasRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { assertSixDigitPin, verifyPin, verifySupervisorAuthorization } from '../services/authService.js';
import { registrarIntentoFallido, registrarIntentoExitoso } from '../services/plataformaService.js';
import { cuentaAbiertaParaMesa, cobrarCuenta, type ICuentaAbiertaFila } from '../services/cuentasService.js';
import { notificarMesas, notificarKDS } from '../lib/sse.js';
import { ROLES_ADMIN, ROLES_CAJA, ROLES_OPERACION } from '../lib/roles.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('mesasRouter');

/** Fila de GET /api/mesas: columnas de mesas + nombre del camarero asignado. */
interface IMesaListaFila {
  id: number;
  nombre_numero: string;
  capacidad: number;
  estado: string;
  camarero_id: number | null;
  camarero: string | null;
}

/** Fila de cuenta recién creada por comanda (RETURNING sin tipo_servicio). */
interface ICuentaNuevaFila {
  id: number;
  mesa_id: number | null;
  camarero_id: number | null;
  estado: string;
}

/** Ítem de comanda enviado por el cliente (acepta id o producto_id). */
interface IItemComanda {
  id?: unknown;
  producto_id?: unknown;
  cantidad?: unknown;
  notas?: unknown;
  guarnicion?: unknown;
  termino?: unknown;
}

/** Fila de detalle visible de una cuenta abierta (GET /api/mesas/:id/cuenta). */
interface IDetalleCuentaFila {
  id: number;
  cantidad: string;
  precio: string;
  notas: string | null;
  guarnicion: string | null;
  termino: string | null;
  nombre: string;
}

/** Fila de producto activo consultado al tomar una comanda. */
interface IProductoPedidoFila {
  id: number;
  precio: string;
  nombre: string;
}

function comandaDelBody(req: Request): IItemComanda[] {
  if (Array.isArray(req.body.comanda)) {return req.body.comanda;}
  return Array.isArray(req.body.productos) ? req.body.productos : [];
}

// GET /api/mesas — Aislamiento por camarero: solo ve sus mesas ocupadas + las
// disponibles. Supervisores (Admin, Cajero, Capitán de Camareros) ven todo.
router.get('/api/mesas', requireAuth, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  if (req.auth!.userRole === 'Camarero') {
    const result = await db.query<IMesaListaFila>(
      `SELECT m.*, u.nombre AS camarero FROM mesas m
       LEFT JOIN usuarios u ON u.id = m.camarero_id
       WHERE m.estado = 'Disponible' OR m.camarero_id = $1
       ORDER BY m.id`,
      [req.auth!.userId]
    );
    res.json(result.rows);
    return;
  }
  const result = await db.query<IMesaListaFila>(
    `SELECT m.*, u.nombre AS camarero FROM mesas m
     LEFT JOIN usuarios u ON u.id = m.camarero_id
     ORDER BY m.id`
  );
  res.json(result.rows);
}));

// POST /api/mesas/generar (Administrador): crea N mesas numeradas 'Mesa K'.
router.post('/api/mesas/generar', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const quantity = positiveInteger(req.body.cantidad, 'Cantidad');
  if (quantity > 100) {throw httpError(400, 'No se pueden crear más de 100 mesas a la vez.');}
  await db.transaction(async (client) => {
    const current = await client.query<{ total: number }>(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(nombre_numero, '\\D', '', 'g'), '')::int), 0) AS total FROM mesas`
    );
    const startingAt = Number(current.rows[0].total);
    for (let index = 1; index <= quantity; index += 1) {
      await client.query("INSERT INTO mesas (nombre_numero, capacidad, estado) VALUES ($1, 4, 'Disponible')", [
        `Mesa ${startingAt + index}`,
      ]);
    }
    await registrarAuditoria(client, { usuarioId: req.auth!.userId, accion: 'CREAR_MESAS', entidad: 'mesas', detalle: { quantity }, ip: clientIp(req) });
  });
  logger.info({ action: 'CREAR_MESAS', userId: req.auth!.userId, quantity });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: `${quantity} mesas creadas correctamente.` });
}));

// PUT /api/mesas/:id (Administrador): renombra y ajusta capacidad.
router.put('/api/mesas/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Mesa');
  const capacity = positiveInteger(req.body.capacidad || 4, 'Capacidad');
  const name = String(req.body.nombre_numero || '').trim();
  if (!name) {throw httpError(400, 'El nombre de mesa es obligatorio.');}
  const result = await db.query('UPDATE mesas SET nombre_numero = $1, capacidad = $2 WHERE id = $3', [name, capacity, id]);
  if (!result.rowCount) {throw httpError(404, 'Mesa no encontrada.');}
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'EDITAR_MESA', entidad: 'mesas', entidadId: id, detalle: { name, capacity }, ip: clientIp(req) });
  logger.info({ action: 'EDITAR_MESA', userId: req.auth!.userId, mesaId: id });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa actualizada.' });
}));

// DELETE /api/mesas/:id (Administrador): solo mesas no ocupadas.
router.delete('/api/mesas/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Mesa');
  const result = await db.query("DELETE FROM mesas WHERE id = $1 AND estado <> 'Ocupada'", [id]);
  if (!result.rowCount) {throw httpError(409, 'La mesa no existe o está ocupada.');}
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'ELIMINAR_MESA', entidad: 'mesas', entidadId: id, ip: clientIp(req) });
  logger.info({ action: 'ELIMINAR_MESA', userId: req.auth!.userId, mesaId: id });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa eliminada.' });
}));

// POST /api/mesas/:id/abrir (operación): valida comanda pendiente y cuenta
// abierta, y ocupa la mesa asignando al camarero de la sesión.
router.post('/api/mesas/:id/abrir', requireAuth, requireRoles(...ROLES_OPERACION), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  await db.transaction(async (client) => {
    const table = await client.query<{ id: number; estado: string }>('SELECT id, estado FROM mesas WHERE id = $1 FOR UPDATE', [mesaId]);
    if (!table.rowCount) {throw httpError(404, 'Mesa no encontrada.');}
    if (table.rows[0].estado === 'Ocupada') {throw httpError(409, 'La mesa ya está ocupada.');}
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
    if (existing) {throw httpError(409, 'La mesa ya tiene una cuenta abierta.');}
    await client.query("UPDATE mesas SET estado = 'Ocupada', camarero_id = $1 WHERE id = $2", [req.auth!.userId, mesaId]);
    await registrarAuditoria(client, { usuarioId: req.auth!.userId, accion: 'ABRIR_MESA', entidad: 'mesas', entidadId: mesaId, ip: clientIp(req) });
  });
  logger.info({ action: 'MESA_ABIERTA', userId: req.auth!.userId, mesaId });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa abierta correctamente.' });
}));

// POST /api/mesas/trasladar (operación): mueve la cuenta abierta de una mesa
// a otra disponible (el camarero solo puede trasladar sus propias mesas).
router.post('/api/mesas/trasladar', requireAuth, requireRoles(...ROLES_OPERACION), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const originId = positiveInteger(req.body.mesaOrigenId, 'Mesa de origen');
  const destinationId = positiveInteger(req.body.mesaDestinoId, 'Mesa de destino');
  if (originId === destinationId) {throw httpError(400, 'Debes seleccionar otra mesa como destino.');}
  await db.transaction(async (client) => {
    const ids = [originId, destinationId].sort((a, b) => a - b);
    const tables = await client.query<{ id: number; estado: string }>(
      'SELECT id, estado FROM mesas WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
      [ids]
    );
    if (tables.rowCount !== 2) {throw httpError(404, 'Una de las mesas no existe.');}
    const destination = tables.rows.find((row) => row.id === destinationId);
    if (!destination) {throw httpError(404, 'Una de las mesas no existe.');}
    if (destination.estado !== 'Disponible') {throw httpError(409, 'La mesa de destino no está disponible.');}
    const account = await cuentaAbiertaParaMesa(client, originId, true);
    if (!account) {throw httpError(409, 'La mesa de origen no tiene una cuenta abierta.');}
    if (req.auth!.userRole === 'Camarero' && account.camarero_id !== req.auth!.userId) {
      throw httpError(403, 'Solo puedes trasladar tus propias mesas.');
    }
    await client.query('UPDATE cuentas SET mesa_id = $1 WHERE id = $2', [destinationId, account.id]);
    await client.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = $1", [originId]);
    await client.query("UPDATE mesas SET estado = 'Ocupada', camarero_id = $1 WHERE id = $2", [
      account.camarero_id,
      destinationId,
    ]);
    await registrarAuditoria(client, { usuarioId: req.auth!.userId, accion: 'TRASLADAR_MESA', entidad: 'cuentas', entidadId: account.id, detalle: { originId, destinationId }, ip: clientIp(req) });
  });
  logger.info({ action: 'MESA_TRASLADADA', userId: req.auth!.userId, originId, destinationId });
  notificarMesas('mesa_actualizada');
  res.json({ mensaje: 'Mesa trasladada correctamente.' });
}));

// GET /api/mesas/:id/cuenta: detalles activos de la cuenta abierta de la mesa
// (el camarero solo ve las cuentas que abrió).
router.get('/api/mesas/:id/cuenta', requireAuth, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  const account = await cuentaAbiertaParaMesa(db, mesaId);
  if (!account) {res.json([]); return;}
  if (req.auth!.userRole === 'Camarero' && account.camarero_id !== req.auth!.userId) {
    throw httpError(403, 'Solo el camarero que abrió la mesa puede ver esta cuenta.');
  }
  const details = await db.query<IDetalleCuentaFila>(
    `SELECT cd.id, cd.cantidad, cd.precio_unitario AS precio, cd.notas, cd.guarnicion, cd.termino, p.nombre
     FROM cuenta_detalles cd
     JOIN productos p ON p.id = cd.producto_id
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL
     ORDER BY cd.id`,
    [account.id]
  );
  res.json(details.rows);
}));

// POST /api/mesas/:id/acceder — Acceso con PIN del camarero a una mesa ocupada
// propia (solo rol Camarero).
router.post('/api/mesas/:id/acceder', requireAuth, requireRoles('Camarero'), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  assertSixDigitPin(req.body.pin);
  const mesa = await db.query<{ id: number; estado: string }>('SELECT id, estado FROM mesas WHERE id = $1', [mesaId]);
  if (!mesa.rowCount) {throw httpError(404, 'Mesa no encontrada.');}
  if (mesa.rows[0].estado !== 'Ocupada') {throw httpError(409, 'La mesa no está ocupada.');}
  const account = await cuentaAbiertaParaMesa(db, mesaId);
  if (!account) {throw httpError(409, 'La mesa no tiene una cuenta abierta.');}
  const propietario = await db.query<{ nombre: string }>('SELECT nombre FROM usuarios WHERE id = $1', [account.camarero_id]);
  const nombrePropietario = propietario.rowCount ? propietario.rows[0].nombre : 'otro camarero';
  if (account.camarero_id !== req.auth!.userId) {throw httpError(403, `Esta mesa pertenece a: ${nombrePropietario}.`);}
  const user = await db.query<{ id: number; pin_hash: string | null }>(
    "SELECT id, pin_hash FROM usuarios WHERE id = $1 AND estado = 'Activo'",
    [req.auth!.userId]
  );
  if (!user.rowCount || !verifyPin(req.body.pin, user.rows[0].pin_hash)) {
    registrarIntentoFallido(clientIp(req));
    res.status(403).json({ error: 'PIN incorrecto.' });
    return;
  }
  registrarIntentoExitoso(clientIp(req));
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ACCEDER_MESA',
    entidad: 'mesas',
    entidadId: mesaId,
    ip: clientIp(req),
  });
  res.json({ autorizado: true, mensaje: 'Acceso autorizado.' });
}));

// POST /api/mesas/:id/pedido (y /pedidos): agrega productos a la cuenta abierta
// de la mesa; si no existe cuenta, la crea (tipo 'Mesa') y ocupa la mesa.
router.post(['/api/mesas/:id/pedido', '/api/mesas/:id/pedidos'], requireAuth, requireRoles(...ROLES_OPERACION), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const mesaId = positiveInteger(req.params.id, 'Mesa');
  const order = comandaDelBody(req);
  if (!order.length || order.length > 50) {throw httpError(400, 'La comanda no es válida o está vacía.');}

  const productIds = order.map((item) => positiveInteger(item.id || item.producto_id, 'Producto'));
  const uniqueIds = [...new Set(productIds)];

  await db.transaction(async (client) => {
    let account: ICuentaAbiertaFila | ICuentaNuevaFila | null = await cuentaAbiertaParaMesa(client, mesaId, true);
    if (!account) {
      const newAcc = await client.query<ICuentaNuevaFila>(
        `INSERT INTO cuentas (mesa_id, camarero_id, estado, tipo_servicio) VALUES ($1, $2, 'Abierta', 'Mesa')
         RETURNING id, mesa_id, camarero_id, estado`,
        [mesaId, req.auth!.userId]
      );
      await client.query("UPDATE mesas SET estado = 'Ocupada', camarero_id = $1 WHERE id = $2", [req.auth!.userId, mesaId]);
      account = newAcc.rows[0];
    } else if (req.auth!.userRole === 'Camarero' && account.camarero_id !== req.auth!.userId) {
      throw httpError(403, 'Solo el camarero que abrió la mesa puede tomar pedidos de esta cuenta.');
    }

    const productsRes = await client.query<IProductoPedidoFila>(
      "SELECT id, precio, nombre FROM productos WHERE estado = 'Activo' AND id = ANY($1::int[])",
      [uniqueIds]
    );
    const prodMap = new Map<number, IProductoPedidoFila>(productsRes.rows.map((p) => [p.id, p]));
    if (prodMap.size !== uniqueIds.length) {throw httpError(400, 'Uno o más productos ya no están disponibles.');}

    for (const item of order) {
      const pId = positiveInteger(item.id || item.producto_id, 'Producto');
      const qty = positiveInteger(item.cantidad, 'Cantidad');
      const prod = prodMap.get(pId);
      if (!prod) {throw httpError(400, 'Uno o más productos ya no están disponibles.');}
      const guarnicion = String(item.guarnicion || '').trim() || null;
      const termino = String(item.termino || '').trim() || null;
      const notas = String(item.notas || '').trim() || null;
      await client.query(
        'INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario, notas, guarnicion, termino) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [account.id, pId, qty, prod.precio, notas, guarnicion, termino]
      );
    }
    await registrarAuditoria(client, {
      usuarioId: req.auth!.userId,
      accion: 'AGREGAR_PEDIDO',
      entidad: 'cuentas',
      entidadId: account.id,
      detalle: { totalItems: order.length },
      ip: clientIp(req),
    });
  });
  logger.info({ action: 'PEDIDO_AGREGADO', userId: req.auth!.userId, mesaId, totalItems: order.length });
  notificarKDS('nuevo_pedido');
  res.json({ mensaje: 'Comanda enviada correctamente.' });
}));

// POST cobro/cierre (4 alias por mesa o cuenta): cierra la cuenta abierta,
// descuenta inventario y libera la mesa (roles de caja).
router.post(['/api/mesas/:id/cobrar', '/api/mesas/:id/cerrar', '/api/cuentas/:id/cobrar', '/api/cuentas/:id/cerrar'], requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const targetId = positiveInteger(req.params.id, 'Identificador');
  const result = await db.query<{ id: number }>(
    `SELECT id FROM cuentas
     WHERE (id = $1 OR (mesa_id = $1 AND estado = 'Abierta'))
     ORDER BY (estado = 'Abierta') DESC, id DESC
     LIMIT 1`,
    [targetId]
  );
  if (!result.rowCount) {throw httpError(404, 'No se encontró una cuenta abierta para esta mesa.');}
  const receipt = await cobrarCuenta({
    cuentaId: result.rows[0].id,
    actor: { id: req.auth!.userId, nombre: req.auth!.nombre },
    body: req.body,
    req,
  });
  logger.info({ action: 'CUENTA_COBRADA', userId: req.auth!.userId, cuentaId: result.rows[0].id, ncf: receipt.comprobante });
  res.json({ mensaje: 'Pago procesado e inventario actualizado.', ncf: receipt.comprobante, comprobante: receipt.comprobante, totales: receipt });
}));

// DELETE /api/cuenta_detalles/:id (operación): anula un producto de una cuenta
// abierta solo con autorización vigente de supervisor (X-Supervisor-Authorization).
router.delete('/api/cuenta_detalles/:id', requireAuth, requireRoles(...ROLES_OPERACION), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const detailId = positiveInteger(req.params.id, 'Detalle');
  const authorization = verifySupervisorAuthorization(req.get('X-Supervisor-Authorization'), { action: 'ANULAR_DETALLE', detailId });
  if (!authorization) {throw httpError(403, 'Se requiere una autorización vigente de supervisor.');}
  await db.transaction(async (client) => {
    const detail = await client.query<{ id: number; cuenta_id: number; estado: string }>(
      `SELECT cd.id, cd.cuenta_id, c.estado
       FROM cuenta_detalles cd
       JOIN cuentas c ON c.id = cd.cuenta_id
       WHERE cd.id = $1 AND cd.anulado_en IS NULL
       FOR UPDATE`,
      [detailId]
    );
    if (!detail.rowCount) {throw httpError(404, 'El detalle no existe o ya fue anulado.');}
    if (detail.rows[0].estado !== 'Abierta') {throw httpError(409, 'No se pueden anular productos de una cuenta cerrada.');}
    await client.query(
      'UPDATE cuenta_detalles SET anulado_en = CURRENT_TIMESTAMP, anulado_por = $1, motivo_anulacion = $2 WHERE id = $3',
      [authorization.supervisorId, String(req.body?.motivo || 'Anulación autorizada'), detailId]
    );
    await registrarAuditoria(client, {
      usuarioId: req.auth!.userId,
      accion: 'ANULAR_DETALLE',
      entidad: 'cuenta_detalles',
      entidadId: detailId,
      detalle: { supervisorId: authorization.supervisorId },
      ip: clientIp(req),
    });
  });
  logger.info({ action: 'DETALLE_ANULADO', userId: req.auth!.userId, detailId, supervisorId: authorization.supervisorId });
  res.json({ mensaje: 'Producto anulado correctamente.' });
}));

// POST /api/pedidos/llevar (operación): pedido para llevar SIN mesa: registra
// o actualiza el cliente frecuente, crea la cuenta (tipo 'Para Llevar') con
// sus detalles y notifica a Cocina/Bar.
router.post('/api/pedidos/llevar', requireAuth, requireRoles(...ROLES_OPERACION), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const name = String(req.body.cliente_nombre || '').trim();
  const phone = String(req.body.cliente_telefono || '').trim();
  const order: IItemComanda[] = Array.isArray(req.body.comanda) ? req.body.comanda : [];
  if (!name || !phone || !order.length) {throw httpError(400, 'Completa cliente y comanda.');}
  const accountId = await db.transaction(async (client) => {
    const customer = await client.query<{ id: number }>(
      `INSERT INTO clientes_frecuentes (nombre, telefono, direccion) VALUES ($1, $2, 'Para Llevar')
       ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [name, phone]
    );
    const account = await client.query<{ id: number }>(
      `INSERT INTO cuentas (mesa_id, camarero_id, estado, tipo_servicio, cliente_id)
       VALUES (NULL, $1, 'Abierta', 'Para Llevar', $2)
       RETURNING id`,
      [req.auth!.userId, customer.rows[0].id]
    );
    for (const item of order) {
      const productId = positiveInteger(item.id, 'Producto');
      const quantity = positiveInteger(item.cantidad, 'Cantidad');
      const product = await client.query<{ precio: string }>(
        "SELECT precio FROM productos WHERE id = $1 AND estado = 'Activo'",
        [productId]
      );
      if (!product.rowCount) {throw httpError(400, 'Producto no disponible.');}
      await client.query(
        'INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)',
        [account.rows[0].id, productId, quantity, product.rows[0].precio]
      );
    }
    await registrarAuditoria(client, {
      usuarioId: req.auth!.userId,
      accion: 'CREAR_PEDIDO_LLEVAR',
      entidad: 'cuentas',
      entidadId: account.rows[0].id,
      ip: clientIp(req),
    });
    return account.rows[0].id;
  });
  logger.info({ action: 'PEDIDO_LLEVAR', userId: req.auth!.userId, cuentaId: accountId });
  notificarKDS('nuevo_pedido');
  res.status(201).json({ mensaje: 'Pedido para llevar registrado.', cuenta_id: accountId });
}));

export default router;
