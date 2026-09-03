/**
 * @file Router de Recetas (escandallo): ingredientes asignados a cada producto
 * con su cantidad necesaria (tabla receta_productos). Puerto directo de
 * server.js (legacy, líneas ~3225-3261). Rutas con prefijo /api completo;
 * listo para app.use(recetasRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { ROLES_ADMIN } from '../lib/roles.js';

const router = Router();

/** Fila de GET /api/productos/:id/receta (join receta_productos + ingredientes). */
interface IIngredienteRecetaFila {
  id: number;
  ingrediente_id: number;
  cantidad_necesaria: string;
  ingrediente_nombre: string;
  unidad_medida: string | null;
  stock_actual: string;
}

// GET /api/productos/:id/receta (Administrador): ingredientes de la receta
// del producto, ordenados por nombre del ingrediente.
router.get('/api/productos/:id/receta', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Producto');
  const result = await db.query<IIngredienteRecetaFila>(
    `SELECT r.id, r.ingrediente_id, r.cantidad_necesaria, i.nombre AS ingrediente_nombre, i.unidad_medida, i.stock_actual
     FROM receta_productos r
     JOIN ingredientes i ON i.id = r.ingrediente_id
     WHERE r.producto_id = $1
     ORDER BY i.nombre`,
    [id]
  );
  res.json(result.rows);
}));

// POST /api/productos/:id/receta (Administrador): asigna (o actualiza por
// ON CONFLICT producto+ingrediente) la cantidad necesaria de un ingrediente.
router.post('/api/productos/:id/receta', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const productoId = positiveInteger(req.params.id, 'Producto');
  const ingredienteId = positiveInteger(req.body.ingrediente_id, 'Ingrediente');
  const cantidad = Number(req.body.cantidad_necesaria);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {throw httpError(400, 'La cantidad necesaria debe ser mayor a 0.');}

  await db.query(
    `INSERT INTO receta_productos (producto_id, ingrediente_id, cantidad_necesaria)
     VALUES ($1, $2, $3)
     ON CONFLICT (producto_id, ingrediente_id)
     DO UPDATE SET cantidad_necesaria = EXCLUDED.cantidad_necesaria`,
    [productoId, ingredienteId, cantidad]
  );
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'GUARDAR_RECETA', entidad: 'receta_productos', entidadId: productoId, ip: clientIp(req) });
  res.json({ mensaje: 'Ingrediente asignado a la receta.' });
}));

// DELETE /api/productos/:id/receta/:ingredienteId (Administrador): quita el
// ingrediente de la receta (sin 404 si no existía, igual que el legacy).
router.delete('/api/productos/:id/receta/:ingredienteId', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const productoId = positiveInteger(req.params.id, 'Producto');
  const ingredienteId = positiveInteger(req.params.ingredienteId, 'Ingrediente');
  await db.query('DELETE FROM receta_productos WHERE producto_id = $1 AND ingrediente_id = $2', [productoId, ingredienteId]);
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'ELIMINAR_RECETA_INGREDIENTE', entidad: 'receta_productos', entidadId: productoId, ip: clientIp(req) });
  res.json({ mensaje: 'Ingrediente quitado de la receta.' });
}));

export default router;
