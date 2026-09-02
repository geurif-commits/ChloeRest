import { Router } from 'express';
import { route, httpError, money, positiveInteger, clientIp } from '../lib/core.js';

// Router de inventario (ingredientes y movimientos).
// Recibe las dependencias por inyección para no acoplarse al monolito.
export default function crearRouterInventario({ db, transaction, registrarAuditoria, requireRoles, ROLES_ADMIN }) {
  const router = Router();
  const admin = requireRoles(...ROLES_ADMIN);

  router.get('/api/inventario', admin, route(async (_req, res) => {
    const result = await db.query('SELECT * FROM ingredientes ORDER BY id');
    res.json(result.rows);
  }));

  router.post('/api/inventario', admin, route(async (req, res) => {
    const name = String(req.body.nombre || '').trim();
    const stock = money(req.body.stock_actual || 0);
    const stockMinimo = money(req.body.stock_minimo || 0);
    const costoUnitario = money(req.body.costo_unitario || 0);
    if (!name || !Number.isFinite(stock) || stock < 0) throw httpError(400, 'Nombre y stock válido son obligatorios.');
    const result = await db.query("INSERT INTO ingredientes (numero_articulo, nombre, categoria, stock_actual, unidad_medida, stock_minimo, costo_unitario) VALUES (CONCAT('ART-', LPAD(nextval(pg_get_serial_sequence('ingredientes','id'))::text, 4, '0')), $1, $2, $3, $4, $5, $6) RETURNING numero_articulo, id", [name, String(req.body.categoria || 'General'), stock, String(req.body.unidad_medida || 'Unidades'), stockMinimo, costoUnitario]);
    await registrarAuditoria(db, { usuarioId: req.user.id, accion: 'CREAR_INSUMO', entidad: 'ingredientes', entidadId: result.rows[0].id, ip: clientIp(req) });
    res.status(201).json({ mensaje: 'Ítem de inventario registrado.', numero_articulo: result.rows[0].numero_articulo });
  }));

  // Alertas de stock mínimo: ítems cuyo stock_actual está por debajo del mínimo
  router.get('/api/inventario/alertas', admin, route(async (_req, res) => {
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

  router.post('/api/inventario/:id/ajustar', admin, route(async (req, res) => {
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

  router.get('/api/inventario/movimientos', admin, route(async (_req, res) => {
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

  return router;
}
