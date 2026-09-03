/**
 * @file Router de Productos (catálogo del menú): listar activos, crear con
 * imagen opcional, importación masiva por CSV, editar y eliminar (soft-delete
 * por estado). Puerto directo de server.js (legacy, líneas ~2640-2805).
 * Rutas con prefijo /api completo; listo para app.use(productosRouter).
 */

import fs from 'node:fs';
import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, money, clientIp, parseCsvLine } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { upload, uploadCsv, validarImagenSubida, uploadUrl } from '../lib/uploads.js';
import { ROLES_ADMIN } from '../lib/roles.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('productosRouter');

/** Fila de productos leída con SELECT * (valores crudos de pg). */
interface IFilaProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  imagen_url: string | null;
  categoria: string;
  estado: string;
  tasa_itbis: string;
  aplica_itbis: boolean;
  aplica_propina: boolean;
  tasa_propina: string;
  tipo_destino: string;
  tipo_plato: string;
  es_plato_fuerte: boolean;
  es_entrada: boolean;
  es_postre: boolean;
  es_guarnicion: boolean;
  requiere_guarnicion: boolean;
  requiere_termino: boolean;
}

/** Fila importable (orden de columnas del INSERT múltiple del legacy). */
type FilaImportable = [string, number, string | null, string, number, boolean, boolean, number, string];

/** Fila descartada de la importación CSV (línea física 1-based del archivo). */
interface IFilaInvalida {
  linea: number;
  datos: string[];
  error: string;
}

/** Campos fiscales/de menú calculados a partir del body (algoritmo del legacy). */
interface ICamposProducto {
  aplicaItbis: boolean;
  aplicaPropina: boolean;
  tasaItbis: number;
  tasaPropina: number;
  tipoDestino: string;
  tipoPlato: string;
  esPlatoFuerte: boolean;
  esEntrada: boolean;
  esPostre: boolean;
  esGuarnicion: boolean;
  requiereGuarnicion: boolean;
  requiereTermino: boolean;
}

/** True si el valor es true/'true'/1/'1' (parsing de aplica_itbis/aplica_propina). */
function esVerdaderoExtendido(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** True si el valor es true o 'true' (parsing de flags es_* y requiere_*). */
function esFlagActivado(value: unknown): boolean {
  return value === true || value === 'true';
}

function camposProducto(body: Request['body']): ICamposProducto {
  const aplicaItbis = body.aplica_itbis !== undefined ? esVerdaderoExtendido(body.aplica_itbis) : true;
  const aplicaPropina = body.aplica_propina !== undefined ? esVerdaderoExtendido(body.aplica_propina) : true;
  const tasaItbis = aplicaItbis ? ([0, 16, 18].includes(Number(body.tasa_itbis)) ? Number(body.tasa_itbis) : 18) : 0;
  const tasaPropina = aplicaPropina ? 10 : 0;
  const tipoDestino = ['bar', 'bebida', 'bebidas'].includes(String(body.tipo_destino || '').toLowerCase()) ? 'bar' : 'cocina';
  const tipoPlato = ['entrada', 'plato_fuerte', 'postre', 'guarnicion', 'bebida'].includes(String(body.tipo_plato || '').toLowerCase()) ? String(body.tipo_plato).toLowerCase() : 'plato_fuerte';
  return {
    aplicaItbis,
    aplicaPropina,
    tasaItbis,
    tasaPropina,
    tipoDestino,
    tipoPlato,
    esPlatoFuerte: esFlagActivado(body.es_plato_fuerte) || tipoPlato === 'plato_fuerte',
    esEntrada: esFlagActivado(body.es_entrada) || tipoPlato === 'entrada',
    esPostre: esFlagActivado(body.es_postre) || tipoPlato === 'postre',
    esGuarnicion: esFlagActivado(body.es_guarnicion) || tipoPlato === 'guarnicion',
    requiereGuarnicion: esFlagActivado(body.requiere_guarnicion),
    requiereTermino: esFlagActivado(body.requiere_termino),
  };
}

// GET /api/productos: catálogo activo ordenado por id (autenticado en legacy
// por el authenticate global de /api; aquí requireAuth explícito).
router.get('/api/productos', requireAuth, route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<IFilaProducto>("SELECT * FROM productos WHERE estado = 'Activo' ORDER BY id");
  res.json(result.rows);
}));

// POST /api/productos (Administrador): crea producto con su imagen opcional.
router.post('/api/productos', requireAuth, requireRoles(...ROLES_ADMIN), upload.single('imagen_archivo'), validarImagenSubida, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const name = String(req.body.nombre || '').trim();
  const price = money(req.body.precio);
  if (!name || !Number.isFinite(price) || price < 0) {throw httpError(400, 'Nombre y precio válido son obligatorios.');}
  const image = req.file ? uploadUrl(req, req.file) : String(req.body.imagen_url || '').trim() || null;
  const descripcion = String(req.body.descripcion || '').trim() || null;
  const campos = camposProducto(req.body);
  const result = await db.query<{ id: number }>(
    `INSERT INTO productos (
      nombre, descripcion, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina,
      tipo_destino, tipo_plato, es_plato_fuerte, es_entrada, es_postre, es_guarnicion, requiere_guarnicion, requiere_termino
    ) VALUES ($1, $2, $3, $4, $5, 'Activo', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [
      name, descripcion, price, image, String(req.body.categoria || (campos.tipoDestino === 'bar' ? 'Bar' : 'Cocina')),
      campos.tasaItbis, campos.aplicaItbis, campos.aplicaPropina, campos.tasaPropina,
      campos.tipoDestino, campos.tipoPlato, campos.esPlatoFuerte, campos.esEntrada, campos.esPostre, campos.esGuarnicion, campos.requiereGuarnicion, campos.requiereTermino,
    ]
  );
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'CREAR_PRODUCTO', entidad: 'productos', entidadId: result.rows[0].id, ip: clientIp(req) });
  logger.info({ action: 'CREAR_PRODUCTO', userId: req.auth!.userId, productoId: result.rows[0].id, nombre: name });
  res.status(201).json({ mensaje: 'Producto creado correctamente.' });
}));

// POST /api/productos/importar (Administrador): importa CSV con cabecera
// (nombre, precio, categoria, tasa_itbis, propina_legal, imagen_url) y
// respeta el archivo temporal: lo borra tras leerlo, igual que el legacy.
router.post('/api/productos/importar', requireAuth, requireRoles(...ROLES_ADMIN), uploadCsv.single('archivo_csv'), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  if (!req.file) {throw httpError(400, 'Archivo CSV requerido.');}
  const csvContent = fs.readFileSync(req.file.path, 'utf-8');
  fs.unlinkSync(req.file.path);

  const lines = csvContent.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) {throw httpError(400, 'El archivo CSV está vacío o no contiene datos.');}

  const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase().trim());
  const missingColumns = ['nombre', 'precio'].filter((col) => !header.includes(col));
  if (missingColumns.length) {throw httpError(400, `Columnas obligatorias faltantes: ${missingColumns.join(', ')}.`);}

  const nombreIdx = header.indexOf('nombre');
  const precioIdx = header.indexOf('precio');
  const categoriaIdx = header.indexOf('categoria');
  const itbisIdx = header.indexOf('tasa_itbis');
  const propinaIdx = header.indexOf('aplica_propina') !== -1 ? header.indexOf('aplica_propina') : header.indexOf('propina_legal');
  const imagenIdx = header.indexOf('imagen_url');

  const insertable: FilaImportable[] = [];
  const invalidRows: IFilaInvalida[] = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const row = parseCsvLine(lines[rowIndex]);
    if (row.every((cell) => cell.trim() === '')) {continue;}
    const nombre = String(row[nombreIdx] || '').trim();
    const precio = money(row[precioIdx] || '');
    const categoria = categoriaIdx !== -1 && row[categoriaIdx] ? String(row[categoriaIdx]).trim() : 'Alimentos';
    const imagen_url = imagenIdx !== -1 && row[imagenIdx] ? String(row[imagenIdx]).trim() : null;

    // Parse ITBIS
    const itbisVal = itbisIdx !== -1 ? String(row[itbisIdx]).trim().toUpperCase() : '18';
    let aplicaItbis = true;
    let tasaItbis = 18;
    if (['0', 'NO', 'FALSE', 'EXENTO'].includes(itbisVal)) {
      aplicaItbis = false;
      tasaItbis = 0;
    } else if (['16', '16%'].includes(itbisVal)) {
      aplicaItbis = true;
      tasaItbis = 16;
    }

    // Parse Propina Legal
    const propinaVal = propinaIdx !== -1 ? String(row[propinaIdx]).trim().toUpperCase() : '10';
    let aplicaPropina = true;
    let tasaPropina = 10;
    if (['0', 'NO', 'FALSE', 'EXENTO', '0%'].includes(propinaVal)) {
      aplicaPropina = false;
      tasaPropina = 0;
    }

    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      invalidRows.push({ linea: rowIndex + 1, datos: row, error: 'Nombre o precio inválido.' });
      continue;
    }

    const tipoDestino = ['bar', 'bebida', 'bebidas', 'tragos', 'licores'].includes(categoria.toLowerCase()) ? 'bar' : 'cocina';
    insertable.push([nombre, precio, imagen_url, categoria, tasaItbis, aplicaItbis, aplicaPropina, tasaPropina, tipoDestino]);
  }

  if (!insertable.length) {
    res.status(400).json({ error: 'No se encontraron filas válidas para importar.', invalidRows });
    return;
  }

  const queryText = 'INSERT INTO productos (nombre, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina, tipo_destino) VALUES ' +
    insertable.map((_, idx) => `($${idx * 9 + 1}, $${idx * 9 + 2}, $${idx * 9 + 3}, $${idx * 9 + 4}, 'Activo', $${idx * 9 + 5}, $${idx * 9 + 6}, $${idx * 9 + 7}, $${idx * 9 + 8}, $${idx * 9 + 9})`).join(', ');
  await db.query(queryText, insertable.flat());
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'IMPORTAR_PRODUCTOS',
    entidad: 'productos',
    detalle: { insertados: insertable.length, invalidRows: invalidRows.length },
    ip: clientIp(req),
  });
  logger.info({ action: 'IMPORTAR_PRODUCTOS', userId: req.auth!.userId, insertados: insertable.length, invalidRows: invalidRows.length });
  res.json({ mensaje: 'Importación completada.', insertados: insertable.length, invalidRows });
}));

// PUT /api/productos/:id (Administrador): actualiza el producto; si llega
// imagen nueva (archivo o URL) la reemplaza sin borrar el archivo anterior.
router.put('/api/productos/:id', requireAuth, requireRoles(...ROLES_ADMIN), upload.single('imagen_archivo'), validarImagenSubida, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Producto');
  const name = String(req.body.nombre || '').trim();
  const price = money(req.body.precio);
  if (!name || !Number.isFinite(price) || price < 0) {throw httpError(400, 'Nombre y precio válido son obligatorios.');}
  const descripcion = String(req.body.descripcion || '').trim() || null;
  const campos = camposProducto(req.body);

  const values: unknown[] = [
    name, descripcion, price, String(req.body.categoria || (campos.tipoDestino === 'bar' ? 'Bar' : 'Cocina')),
    campos.tasaItbis, campos.aplicaItbis, campos.aplicaPropina, campos.tasaPropina,
    campos.tipoDestino, campos.tipoPlato, campos.esPlatoFuerte, campos.esEntrada, campos.esPostre, campos.esGuarnicion, campos.requiereGuarnicion, campos.requiereTermino, id,
  ];

  let sql = `UPDATE productos SET
    nombre = $1, descripcion = $2, precio = $3, categoria = $4, tasa_itbis = $5, aplica_itbis = $6, aplica_propina = $7, tasa_propina = $8,
    tipo_destino = $9, tipo_plato = $10, es_plato_fuerte = $11, es_entrada = $12, es_postre = $13, es_guarnicion = $14, requiere_guarnicion = $15, requiere_termino = $16`;

  if (req.file) {
    values.splice(16, 0, uploadUrl(req, req.file));
    sql += ', imagen_url = $17 WHERE id = $18';
  } else if (String(req.body.imagen_url || '').trim()) {
    values.splice(16, 0, String(req.body.imagen_url).trim());
    sql += ', imagen_url = $17 WHERE id = $18';
  } else {
    sql += ' WHERE id = $17';
  }

  const result = await db.query(sql, values);
  if (!result.rowCount) {throw httpError(404, 'Producto no encontrado.');}
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'EDITAR_PRODUCTO', entidad: 'productos', entidadId: id, ip: clientIp(req) });
  logger.info({ action: 'EDITAR_PRODUCTO', userId: req.auth!.userId, productoId: id });
  res.json({ mensaje: 'Producto actualizado.' });
}));

// DELETE /api/productos/:id (Administrador): soft-delete (estado 'Inactivo'),
// sin comprobar referencias en cuentas abiertas (igual que el legacy).
router.delete('/api/productos/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Producto');
  const result = await db.query("UPDATE productos SET estado = 'Inactivo' WHERE id = $1 AND estado = 'Activo'", [id]);
  if (!result.rowCount) {throw httpError(404, 'Producto no encontrado.');}
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'DESACTIVAR_PRODUCTO', entidad: 'productos', entidadId: id, ip: clientIp(req) });
  logger.info({ action: 'DESACTIVAR_PRODUCTO', userId: req.auth!.userId, productoId: id });
  res.json({ mensaje: 'Producto eliminado del menú.' });
}));

export default router;
