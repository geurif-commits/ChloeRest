/**
 * @file Router de Productos (catálogo del menú): listar activos, crear con
 * imagen opcional, importación masiva por CSV, editar y eliminar (soft-delete
 * por estado). Puerto directo de server.js (legacy, líneas ~2640-2805).
 * Rutas con prefijo /api completo; listo para app.use(productosRouter).
 */

import fs from 'node:fs';
import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, money, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { upload, uploadCsv, validarImagenSubida, uploadUrl } from '../lib/uploads.js';
import { ROLES_ADMIN } from '../lib/roles.js';
import { createLogger } from '../lib/logger.js';
import { resolverTipoDestino, grupoParaCategoria } from '../services/destinoProducto.js';
import { analizarCsvProductos } from '../services/importacionProductos.js';

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
  // Por defecto los productos no llevan ITBIS ni propina (se activan explícitamente).
  const aplicaItbis = body.aplica_itbis !== undefined ? esVerdaderoExtendido(body.aplica_itbis) : false;
  const aplicaPropina = body.aplica_propina !== undefined ? esVerdaderoExtendido(body.aplica_propina) : false;
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
  const categoriaFinal = String(req.body.categoria || (campos.tipoDestino === 'bar' ? 'Bar' : 'Cocina'));
  campos.tipoDestino = await resolverTipoDestino(db, categoriaFinal, campos.tipoDestino);
  const result = await db.query<{ id: number }>(
    `INSERT INTO productos (
      nombre, descripcion, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina,
      tipo_destino, tipo_plato, es_plato_fuerte, es_entrada, es_postre, es_guarnicion, requiere_guarnicion, requiere_termino
    ) VALUES ($1, $2, $3, $4, $5, 'Activo', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [
      name, descripcion, price, image, categoriaFinal,
      campos.tasaItbis, campos.aplicaItbis, campos.aplicaPropina, campos.tasaPropina,
      campos.tipoDestino, campos.tipoPlato, campos.esPlatoFuerte, campos.esEntrada, campos.esPostre, campos.esGuarnicion, campos.requiereGuarnicion, campos.requiereTermino,
    ]
  );
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'CREAR_PRODUCTO', entidad: 'productos', entidadId: result.rows[0].id, ip: clientIp(req) });
  logger.info({ action: 'CREAR_PRODUCTO', userId: req.auth!.userId, productoId: result.rows[0].id, nombre: name });
  res.status(201).json({ mensaje: 'Producto creado correctamente.' });
}));

// POST /api/productos/importar (Administrador): importa un CSV con los mismos campos que el formulario de creación
// (nombre y precio obligatorios; ver services/importacionProductos.ts). Crea las categorías que falten con su grupo
// (alimentos/bebidas), reutiliza las existentes sin tocarlas, omite lo que ya está cargado (mismo nombre y categoría)
// y aplica todo en una transacción. Borra el archivo temporal tras leerlo.
router.post('/api/productos/importar', requireAuth, requireRoles(...ROLES_ADMIN), uploadCsv.single('archivo_csv'), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  if (!req.file) {throw httpError(400, 'Archivo CSV requerido.');}
  const csvContent = fs.readFileSync(req.file.path, 'utf-8');
  fs.unlinkSync(req.file.path);

  const { productos, invalidRows } = analizarCsvProductos(csvContent);
  if (!productos.length) {
    res.status(400).json({ error: 'No se encontraron filas válidas para importar.', invalidRows });
    return;
  }

  const empresaId = req.auth!.empresaId || 1;
  const clave = (texto: string): string => texto.trim().toLowerCase();

  const { insertables, categoriasCreadas } = await db.transaction(async (client) => {
    // 1) Categorías: se usa el nombre de la existente (aunque difiera en mayúsculas) y se crean las que falten.
    const existentes = await client.query<{ nombre: string; activo: boolean }>('SELECT nombre, activo FROM menu_categorias ORDER BY activo DESC, id');
    const categorias = new Map<string, { nombre: string; activo: boolean }>();
    for (const c of existentes.rows) {
      if (!categorias.has(clave(c.nombre))) {categorias.set(clave(c.nombre), c);}
    }
    const creadas: string[] = [];
    for (const p of productos) {
      const conocida = categorias.get(clave(p.categoria));
      if (conocida) {
        p.categoria = conocida.nombre;
        if (!conocida.activo) {
          await client.query('UPDATE menu_categorias SET activo = TRUE WHERE nombre = $1', [conocida.nombre]);
          conocida.activo = true;
        }
        continue;
      }
      const grupo = grupoParaCategoria(p.categoria, p.tipoDestino === 'bar' ? 'bebidas' : 'alimentos');
      await client.query(
        `INSERT INTO menu_categorias (empresa_id, nombre, grupo, activo) VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = TRUE`,
        [empresaId, p.categoria, grupo]
      );
      categorias.set(clave(p.categoria), { nombre: p.categoria, activo: true });
      creadas.push(p.categoria);
    }

    // 2) Productos que ya existen (o repetidos dentro del archivo): se omiten y se informan.
    const yaCargados = await client.query<{ nombre: string; categoria: string }>("SELECT nombre, categoria FROM productos WHERE estado = 'Activo'");
    const vistos = new Set(yaCargados.rows.map((r) => `${clave(r.nombre)}|${clave(r.categoria)}`));
    const destinoPorCategoria = new Map<string, 'cocina' | 'bar'>();
    const nuevos: unknown[][] = [];
    for (const p of productos) {
      const llave = `${clave(p.nombre)}|${clave(p.categoria)}`;
      if (vistos.has(llave)) {
        invalidRows.push({ linea: p.linea, datos: [p.nombre, String(p.precio), p.categoria], error: 'Ya existe un producto con ese nombre en la categoría.' });
        continue;
      }
      vistos.add(llave);

      // 3) El destino lo manda la categoría (su grupo); el tipo de plato sigue al destino si no se indicó.
      let destino = destinoPorCategoria.get(clave(p.categoria));
      if (!destino) {
        destino = await resolverTipoDestino(client, p.categoria, p.tipoDestino);
        destinoPorCategoria.set(clave(p.categoria), destino);
      }
      const tipoPlato = destino === 'bar' ? 'bebida' : (p.tipoPlato && p.tipoPlato !== 'bebida' ? p.tipoPlato : 'plato_fuerte');
      const campos = camposProducto({
        aplica_itbis: p.tasaItbis > 0, tasa_itbis: p.tasaItbis, aplica_propina: p.aplicaPropina,
        tipo_destino: destino, tipo_plato: tipoPlato, requiere_guarnicion: p.requiereGuarnicion, requiere_termino: p.requiereTermino,
      });
      nuevos.push([
        p.nombre, p.descripcion, p.precio, p.imagenUrl, p.categoria,
        campos.tasaItbis, campos.aplicaItbis, campos.aplicaPropina, campos.tasaPropina,
        destino, campos.tipoPlato, campos.esPlatoFuerte, campos.esEntrada, campos.esPostre, campos.esGuarnicion,
        campos.requiereGuarnicion, campos.requiereTermino,
      ]);
    }

    // 4) Inserción por tandas (17 parámetros por producto).
    const POR_TANDA = 200;
    for (let desde = 0; desde < nuevos.length; desde += POR_TANDA) {
      const tanda = nuevos.slice(desde, desde + POR_TANDA);
      await client.query(
        `INSERT INTO productos (
          nombre, descripcion, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina,
          tipo_destino, tipo_plato, es_plato_fuerte, es_entrada, es_postre, es_guarnicion, requiere_guarnicion, requiere_termino
        ) VALUES ` + tanda.map((_, i) => {
          const b = i * 17;
          return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, 'Activo', ${Array.from({ length: 12 }, (__, k) => `$${b + 6 + k}`).join(', ')})`;
        }).join(', '),
        tanda.flat()
      );
    }
    return { insertables: nuevos.length, categoriasCreadas: creadas };
  });

  if (!insertables) {
    res.status(400).json({ error: 'No se encontraron filas nuevas para importar: todos los productos ya existen.', invalidRows });
    return;
  }
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'IMPORTAR_PRODUCTOS',
    entidad: 'productos',
    detalle: { insertados: insertables, categoriasCreadas: categoriasCreadas.length, invalidRows: invalidRows.length },
    ip: clientIp(req),
  });
  logger.info({ action: 'IMPORTAR_PRODUCTOS', userId: req.auth!.userId, insertados: insertables, categoriasCreadas: categoriasCreadas.length, invalidRows: invalidRows.length });
  res.json({ mensaje: 'Importación completada.', insertados: insertables, categoriasCreadas, invalidRows });
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
  const categoriaFinal = String(req.body.categoria || (campos.tipoDestino === 'bar' ? 'Bar' : 'Cocina'));
  campos.tipoDestino = await resolverTipoDestino(db, categoriaFinal, campos.tipoDestino);

  const values: unknown[] = [
    name, descripcion, price, categoriaFinal,
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

// POST /api/productos/itbis (Administrador): aplica o quita el ITBIS a TODOS los productos activos.
// Sirve para activar el ITBIS de una sola vez cuando el negocio decide cobrarlo. Body: { aplica: boolean, tasa?: 16 | 18 }.
router.post('/api/productos/itbis', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const aplica = esVerdaderoExtendido(req.body?.aplica);
  const tasaSolicitada = Number(req.body?.tasa ?? 18);
  if (aplica && ![16, 18].includes(tasaSolicitada)) {throw httpError(400, 'La tasa de ITBIS debe ser 16 o 18.');}
  const tasa = aplica ? tasaSolicitada : 0;
  const result = await db.query("UPDATE productos SET aplica_itbis = $1, tasa_itbis = $2 WHERE estado = 'Activo'", [aplica, tasa]);
  await registrarAuditoria(db, { usuarioId: req.auth!.userId, accion: 'ITBIS_MASIVO_PRODUCTOS', entidad: 'productos', detalle: { aplica, tasa, productos: result.rowCount }, ip: clientIp(req) });
  logger.info({ action: 'ITBIS_MASIVO_PRODUCTOS', userId: req.auth!.userId, aplica, tasa, productos: result.rowCount });
  res.json({ mensaje: aplica ? `ITBIS ${tasa} % aplicado a ${result.rowCount} productos.` : `ITBIS quitado a ${result.rowCount} productos.`, productos: result.rowCount, aplica, tasa });
}));

export default router;
