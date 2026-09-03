/**
 * @file Router de gestión de usuarios del restaurante (CRUD de administrador:
 * listar, crear, editar, desactivar). Puerto directo de server.js (legacy).
 * Rutas con prefijo /api completo; listas para app.use(usuariosRouter).
 * Nota: PATCH /api/usuarios/mi-pin vive en routers/auth.ts (cambio de PIN
 * propio, sin rol), igual que en el legacy.
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { assertValidPin, hashPin } from '../services/authService.js';
import { ROLES_USUARIO } from '../lib/roles.js';
import { UserRole } from '../types/index.js';

const router = Router();

function rolValido(role: string): boolean {
  return ROLES_USUARIO.includes(role as UserRole);
}

// GET /api/usuarios (Administrador)
router.get('/api/usuarios', requireAuth, requireRoles('Administrador'), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<{ id: number; nombre: string; rol: string; estado: string | null }>(
    "SELECT id, nombre, rol, estado FROM usuarios WHERE COALESCE(estado, 'Activo') = 'Activo' ORDER BY id"
  );
  res.json(result.rows);
}));

// POST /api/usuarios (Administrador)
router.post('/api/usuarios', requireAuth, requireRoles('Administrador'), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const name = String(req.body.nombre || '').trim();
  const role = String(req.body.rol || 'Camarero');
  if (!name || !rolValido(role)) {
    throw httpError(400, 'Usuario o rol no válido.');
  }
  assertValidPin(req.body.pin);
  const result = await db.query<{ id: number }>(
    "INSERT INTO usuarios (nombre, rol, pin, pin_hash, estado) VALUES ($1, $2, NULL, $3, 'Activo') RETURNING id",
    [name, role, hashPin(req.body.pin)]
  );
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'CREAR_USUARIO',
    entidad: 'usuarios',
    entidadId: result.rows[0].id,
    detalle: { role },
    ip: clientIp(req),
  });
  res.status(201).json({ mensaje: 'Usuario creado correctamente.' });
}));

// PUT /api/usuarios/:id (Administrador)
router.put('/api/usuarios/:id', requireAuth, requireRoles('Administrador'), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Usuario');
  const name = String(req.body.nombre || '').trim();
  const role = String(req.body.rol || 'Camarero');
  if (!name || !rolValido(role)) {
    throw httpError(400, 'Usuario o rol no válido.');
  }
  if (id === req.auth!.userId && role !== 'Administrador') {
    throw httpError(400, 'No puedes quitarte tu propio rol de administrador.');
  }
  const params: unknown[] = [name, role, id];
  let sql = 'UPDATE usuarios SET nombre = $1, rol = $2';
  if (String(req.body.pin || '')) {
    assertValidPin(req.body.pin);
    params.splice(2, 0, hashPin(req.body.pin));
    sql += ', pin_hash = $3, pin = NULL WHERE id = $4';
  } else {
    sql += ' WHERE id = $3';
  }
  const result = await db.query(sql, params);
  if (!result.rowCount) {throw httpError(404, 'Usuario no encontrado.');}
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'EDITAR_USUARIO',
    entidad: 'usuarios',
    entidadId: id,
    detalle: { role },
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Usuario actualizado.' });
}));

// DELETE /api/usuarios/:id (Administrador)
router.delete('/api/usuarios/:id', requireAuth, requireRoles('Administrador'), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Usuario');
  if (id === req.auth!.userId) {throw httpError(400, 'No puedes desactivar tu propio acceso.');}
  const result = await db.query("UPDATE usuarios SET estado = 'Inactivo' WHERE id = $1 AND estado = 'Activo'", [id]);
  if (!result.rowCount) {throw httpError(404, 'Usuario no encontrado.');}
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'DESACTIVAR_USUARIO',
    entidad: 'usuarios',
    entidadId: id,
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Usuario desactivado.' });
}));

export default router;
