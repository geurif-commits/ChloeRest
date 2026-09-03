/**
 * @file Router de Inventario (ingredientes y movimientos)
 * Puerto directo de routes/inventario.js a TypeScript, montado directamente
 * sobre la Database/servicios reales (sin inyección genérica por parámetros).
 */

import { Router, Request, Response } from 'express';
import { route, httpError } from '../lib/core.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { getDatabase } from '../db/index.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('inventarioRouter');
const admin = [requireAuth, requireRoles('Administrador')];

function money(value: unknown): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function positiveInteger(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {throw httpError(400, `${field} no es válido.`);}
  return numeric;
}

function clientIp(req: Request): string | null {
  return req.ip || req.socket.remoteAddress || null;
}

router.get(
  '/',
  ...admin,
  route(async (_req: Request, res: Response) => {
    const db = getDatabase();
    const result = await db.query('SELECT * FROM ingredientes ORDER BY id');
    res.json(result.rows);
  })
);

router.post(
  '/',
  ...admin,
  route(async (req: Request, res: Response) => {
    const db = getDatabase();
    const name = String(req.body.nombre || '').trim();
    const stock = money(req.body.stock_actual || 0);
    const stockMinimo = money(req.body.stock_minimo || 0);
    const costoUnitario = money(req.body.costo_unitario || 0);
    if (!name || !Number.isFinite(stock) || stock < 0) {
      throw httpError(400, 'Nombre y stock válido son obligatorios.');
    }
    const result = await db.query<{ numero_articulo: string; id: number }>(
      `INSERT INTO ingredientes (numero_articulo, nombre, categoria, stock_actual, unidad_medida, stock_minimo, costo_unitario)
       VALUES (CONCAT('ART-', LPAD(nextval(pg_get_serial_sequence('ingredientes','id'))::text, 4, '0')), $1, $2, $3, $4, $5, $6)
       RETURNING numero_articulo, id`,
      [name, String(req.body.categoria || 'General'), stock, String(req.body.unidad_medida || 'Unidades'), stockMinimo, costoUnitario]
    );
    await registrarAuditoria(db, {
      usuarioId: req.auth!.userId,
      accion: 'CREAR_INSUMO',
      entidad: 'ingredientes',
      entidadId: result.rows[0].id,
      ip: clientIp(req),
    });
    logger.info({ action: 'CREAR_INSUMO', userId: req.auth!.userId, numeroArticulo: result.rows[0].numero_articulo });
    res.status(201).json({ mensaje: 'Ítem de inventario registrado.', numero_articulo: result.rows[0].numero_articulo });
  })
);

router.get(
  '/alertas',
  ...admin,
  route(async (_req: Request, res: Response) => {
    const db = getDatabase();
    const result = await db.query<{
      id: number;
      numero_articulo: string;
      nombre: string;
      categoria: string;
      stock_actual: number;
      stock_minimo: number;
      unidad_medida: string;
      faltante: number;
    }>(`
      SELECT id, numero_articulo, nombre, categoria, stock_actual, stock_minimo, unidad_medida,
             (stock_minimo - stock_actual) AS faltante
      FROM ingredientes
      WHERE stock_minimo > 0 AND stock_actual < stock_minimo
      ORDER BY (stock_minimo - stock_actual) DESC
    `);
    const alertas = result.rows.map((r) => ({ ...r, nivel: r.stock_actual <= 0 ? 'agotado' : 'bajo' }));
    res.json({ alertas, total: alertas.length });
  })
);

router.post(
  '/:id/ajustar',
  ...admin,
  route(async (req: Request, res: Response) => {
    const db = getDatabase();
    const id = positiveInteger(req.params.id, 'Ingrediente');
    const tipo = String(req.body.tipo_movimiento || 'Entrada');
    const cantidad = Number(req.body.cantidad);
    const motivo = String(req.body.motivo || '').trim();
    if (!Number.isFinite(cantidad) || cantidad <= 0) {throw httpError(400, 'La cantidad debe ser mayor a 0.');}

    await db.transaction(async (client) => {
      const item = await client.query<{ stock_actual: number }>(
        'SELECT stock_actual FROM ingredientes WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!item.rowCount) {throw httpError(404, 'Ingrediente no encontrado.');}

      let newStock = Number(item.rows[0].stock_actual);
      if (tipo === 'Entrada') {newStock += cantidad;}
      else if (tipo === 'Salida') {
        if (newStock < cantidad) {throw httpError(400, 'El stock actual es menor a la cantidad a retirar.');}
        newStock -= cantidad;
      } else if (tipo === 'Ajuste') {
        newStock = cantidad;
      }

      await client.query('UPDATE ingredientes SET stock_actual = $1 WHERE id = $2', [newStock, id]);
      await client.query(
        'INSERT INTO inventario_movimientos (ingrediente_id, tipo_movimiento, cantidad, motivo, usuario_id) VALUES ($1, $2, $3, $4, $5)',
        [id, tipo, cantidad, motivo, req.auth!.userId]
      );
      await registrarAuditoria(client, {
        usuarioId: req.auth!.userId,
        accion: 'AJUSTAR_INVENTARIO',
        entidad: 'ingredientes',
        entidadId: id,
        detalle: { tipo, cantidad, motivo, newStock },
        ip: clientIp(req),
      });
    });

    res.json({ mensaje: 'Stock de inventario actualizado correctamente.' });
  })
);

router.get(
  '/movimientos',
  ...admin,
  route(async (_req: Request, res: Response) => {
    const db = getDatabase();
    const result = await db.query(
      `SELECT m.*, i.nombre AS ingrediente_nombre, i.unidad_medida, u.nombre AS usuario_nombre
       FROM inventario_movimientos m
       JOIN ingredientes i ON i.id = m.ingrediente_id
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       ORDER BY m.fecha DESC
       LIMIT 100`
    );
    res.json(result.rows);
  })
);

export default router;
