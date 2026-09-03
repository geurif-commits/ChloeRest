/**
 * @file Router de Menú Configuración (elementos táctiles del POS): categorías
 * (menu_categorias con grupo alimentos/bebidas), guarniciones y términos de
 * cocción, con upsert por (empresa_id, nombre) y desactivación lógica.
 * Puerto directo de server.js (legacy, líneas ~2807-2867). Rutas con prefijo
 * /api completo; listo para app.use(menuConfiguracionRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { ROLES_ADMIN, ROLES_OPERACION } from '../lib/roles.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('menuConfiguracionRouter');

/** Fila de menu_categorias (GET/POST/PUT). */
interface ICategoriaMenuFila {
  id: number;
  nombre: string;
  grupo: string;
  activo: boolean;
}

/** Fila de menu_guarniciones / menu_terminos (GET/POST/PUT). */
interface IElementoMenuFila {
  id: number;
  nombre: string;
  activo: boolean;
}

/** Tipos de elemento aceptados por el menú de configuración (path :tipo). */
const TIPOS_VALIDOS = ['categorias', 'guarniciones', 'terminos'];

// GET /api/menu-configuracion (operación): lista los tres catálogos activos
// ordenados que consume la pantalla táctil.
router.get('/api/menu-configuracion', requireAuth, requireRoles(...ROLES_OPERACION), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const [categorias, guarniciones, terminos] = await Promise.all([
    db.query<ICategoriaMenuFila>('SELECT id, nombre, grupo FROM menu_categorias WHERE activo = TRUE ORDER BY grupo, nombre'),
    db.query<IElementoMenuFila>('SELECT id, nombre FROM menu_guarniciones WHERE activo = TRUE ORDER BY nombre'),
    db.query<IElementoMenuFila>('SELECT id, nombre FROM menu_terminos WHERE activo = TRUE ORDER BY nombre'),
  ]);
  res.json({ categorias: categorias.rows, guarniciones: guarniciones.rows, terminos: terminos.rows });
}));

// POST /api/menu-configuracion/:tipo (Administrador): crea (o reactiva vía
// ON CONFLICT por empresa+nombre) una categoría, guarnición o término.
router.post('/api/menu-configuracion/:tipo', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const tipo = String(req.params.tipo);
  const nombre = String(req.body.nombre || '').trim();
  if (!TIPOS_VALIDOS.includes(tipo) || !nombre) {throw httpError(400, 'Nombre es obligatorio.');}
  const empresaId = req.auth!.empresaId || 1;

  if (tipo === 'categorias') {
    const grupo = req.body.grupo === 'bebidas' ? 'bebidas' : 'alimentos';
    const result = await db.query<ICategoriaMenuFila>(
      `INSERT INTO menu_categorias (empresa_id, nombre, grupo, activo) VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (empresa_id, nombre) DO UPDATE SET grupo = $3, activo = TRUE RETURNING *`,
      [empresaId, nombre, grupo]
    );
    logger.info({ action: 'CREAR_CATEGORIA_MENU', userId: req.auth!.userId, nombre, grupo });
    res.status(201).json(result.rows[0]);
  } else if (tipo === 'guarniciones') {
    const result = await db.query<IElementoMenuFila>(
      `INSERT INTO menu_guarniciones (empresa_id, nombre, activo) VALUES ($1, $2, TRUE)
       ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = TRUE RETURNING *`,
      [empresaId, nombre]
    );
    logger.info({ action: 'CREAR_GUARNICION_MENU', userId: req.auth!.userId, nombre });
    res.status(201).json(result.rows[0]);
  } else {
    const result = await db.query<IElementoMenuFila>(
      `INSERT INTO menu_terminos (empresa_id, nombre, activo) VALUES ($1, $2, TRUE)
       ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = TRUE RETURNING *`,
      [empresaId, nombre]
    );
    logger.info({ action: 'CREAR_TERMINO_MENU', userId: req.auth!.userId, nombre });
    res.status(201).json(result.rows[0]);
  }
}));

// PUT /api/menu-configuracion/:tipo/:id (Administrador): renombra (y para
// categorías ajusta el grupo) solo sobre elementos activos.
router.put('/api/menu-configuracion/:tipo/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const tipo = String(req.params.tipo);
  const id = positiveInteger(req.params.id, 'Identificador');
  const nombre = String(req.body.nombre || '').trim();
  if (!TIPOS_VALIDOS.includes(tipo) || !nombre) {throw httpError(400, 'Configuración inválida.');}
  const tabla = tipo === 'categorias' ? 'menu_categorias' : tipo === 'guarniciones' ? 'menu_guarniciones' : 'menu_terminos';
  const query = tipo === 'categorias'
    ? `UPDATE ${tabla} SET nombre = $1, grupo = $2 WHERE id = $3 AND activo = TRUE RETURNING *`
    : `UPDATE ${tabla} SET nombre = $1 WHERE id = $2 AND activo = TRUE RETURNING *`;
  const params: unknown[] = tipo === 'categorias' ? [nombre, req.body.grupo === 'bebidas' ? 'bebidas' : 'alimentos', id] : [nombre, id];
  const result = await db.query(query, params);
  if (!result.rowCount) {throw httpError(404, 'Elemento no encontrado.');}
  logger.info({ action: 'EDITAR_MENU_CONFIGURACION', userId: req.auth!.userId, tipo, id });
  res.json(result.rows[0]);
}));

// DELETE /api/menu-configuracion/:tipo/:id (Administrador): desactiva el
// elemento (activo = FALSE) sin comprobar filas afectadas, como el legacy.
router.delete('/api/menu-configuracion/:tipo/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const tabla = req.params.tipo === 'categorias' ? 'menu_categorias' : req.params.tipo === 'guarniciones' ? 'menu_guarniciones' : 'menu_terminos';
  if (!['menu_categorias', 'menu_guarniciones', 'menu_terminos'].includes(tabla)) {throw httpError(400, 'Configuración inválida.');}
  await db.query(`UPDATE ${tabla} SET activo = FALSE WHERE id = $1`, [positiveInteger(req.params.id, 'Identificador')]);
  logger.info({ action: 'DESACTIVAR_MENU_CONFIGURACION', userId: req.auth!.userId, tipo: req.params.tipo, id: req.params.id });
  res.json({ mensaje: 'Elemento desactivado.' });
}));

export default router;
