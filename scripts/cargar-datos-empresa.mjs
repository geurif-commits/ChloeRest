/**
 * Carga datos iniciales en UN negocio (empresa) ya existente: catálogo de productos desde un CSV y personal (camareros y
 * cajeras) con PIN aleatorios. Pensado para el servidor, donde solo existe el código compilado (`dist/`):
 *
 *   node scripts/cargar-datos-empresa.mjs --empresa=3 --csv=menu.csv --camareros=5 --cajeras=3 [--dry-run] [--pines=salida.md]
 *
 * Se ejecuta desde la carpeta de la aplicación (la que tiene `dist/` y `.env`). Usa las mismas reglas que la importación
 * masiva de la pantalla (`POST /api/productos/importar`): crea las categorías que falten con su grupo, omite lo que ya está
 * cargado y aplica todo en una transacción. Con `--dry-run` hace todo y deshace al final (no deja nada).
 * Los PIN de los usuarios nuevos se muestran UNA vez (y se guardan en `--pines` si se indica): en la base solo queda su hash.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).slice(n.length + 3);
const EMPRESA = Number(arg('empresa', ''));
const CSV = arg('csv', '');
const CAMAREROS = Number(arg('camareros', 0));
const CAJERAS = Number(arg('cajeras', 0));
const SECO = process.argv.includes('--dry-run');
const PINES = arg('pines', '');
if (!Number.isInteger(EMPRESA) || EMPRESA < 1) { console.error('Indica --empresa=<id>.'); process.exit(2); }

const DIST = path.resolve(process.env.DIST_DIR || path.join(process.cwd(), 'dist'));
const cargar = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

await cargar('lib/env.js');
const { createDatabase, getDatabase, runWithRequestContext } = await cargar('db/index.js');
const { analizarCsvProductos } = await cargar('services/importacionProductos.js');
const { grupoParaCategoria, resolverTipoDestino } = await cargar('services/destinoProducto.js');
const { hashPin, verifyPin } = await cargar('services/authService.js');
const { registrarAuditoria } = await cargar('services/auditoriaService.js');

createDatabase({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  port: Number(process.env.DB_PORT || 5432),
  max: 2,
});

/** Mismos campos que calcula el formulario de creación de productos (ver routers/productos.ts · camposProducto). */
function camposProducto(p) {
  const aplicaItbis = p.aplica_itbis;
  const aplicaPropina = p.aplica_propina;
  const tasaItbis = aplicaItbis ? ([0, 16, 18].includes(Number(p.tasa_itbis)) ? Number(p.tasa_itbis) : 18) : 0;
  const tipoPlato = ['entrada', 'plato_fuerte', 'postre', 'guarnicion', 'bebida'].includes(p.tipo_plato) ? p.tipo_plato : 'plato_fuerte';
  return {
    aplicaItbis, aplicaPropina, tasaItbis, tasaPropina: aplicaPropina ? 10 : 0, tipoPlato,
    esPlatoFuerte: tipoPlato === 'plato_fuerte', esEntrada: tipoPlato === 'entrada', esPostre: tipoPlato === 'postre', esGuarnicion: tipoPlato === 'guarnicion',
    requiereGuarnicion: Boolean(p.requiere_guarnicion), requiereTermino: Boolean(p.requiere_termino),
  };
}

const clave = (t) => t.trim().toLowerCase();

async function importarProductos(client) {
  const texto = fs.readFileSync(CSV, 'utf8');
  const { productos, invalidRows } = analizarCsvProductos(texto);
  if (!productos.length) throw new Error('El CSV no tiene filas válidas.');

  const existentes = await client.query('SELECT nombre, activo FROM menu_categorias ORDER BY activo DESC, id');
  const categorias = new Map();
  for (const c of existentes.rows) if (!categorias.has(clave(c.nombre))) categorias.set(clave(c.nombre), c);
  const creadas = [];
  for (const p of productos) {
    const conocida = categorias.get(clave(p.categoria));
    if (conocida) {
      p.categoria = conocida.nombre;
      if (!conocida.activo) { await client.query('UPDATE menu_categorias SET activo = TRUE WHERE nombre = $1', [conocida.nombre]); conocida.activo = true; }
      continue;
    }
    const grupo = grupoParaCategoria(p.categoria, p.tipoDestino === 'bar' ? 'bebidas' : 'alimentos');
    await client.query(
      `INSERT INTO menu_categorias (empresa_id, nombre, grupo, activo) VALUES ($1, $2, $3, TRUE) ON CONFLICT (empresa_id, nombre) DO UPDATE SET activo = TRUE`,
      [EMPRESA, p.categoria, grupo]
    );
    categorias.set(clave(p.categoria), { nombre: p.categoria, activo: true });
    creadas.push(p.categoria);
  }

  const yaCargados = await client.query("SELECT nombre, categoria FROM productos WHERE estado = 'Activo'");
  const vistos = new Set(yaCargados.rows.map((r) => `${clave(r.nombre)}|${clave(r.categoria)}`));
  const destinoPorCategoria = new Map();
  const nuevos = [];
  const omitidos = [];
  for (const p of productos) {
    const llave = `${clave(p.nombre)}|${clave(p.categoria)}`;
    if (vistos.has(llave)) { omitidos.push(p.nombre); continue; }
    vistos.add(llave);
    let destino = destinoPorCategoria.get(clave(p.categoria));
    if (!destino) { destino = await resolverTipoDestino(client, p.categoria, p.tipoDestino); destinoPorCategoria.set(clave(p.categoria), destino); }
    const tipoPlato = destino === 'bar' ? 'bebida' : (p.tipoPlato && p.tipoPlato !== 'bebida' ? p.tipoPlato : 'plato_fuerte');
    const campos = camposProducto({
      aplica_itbis: p.tasaItbis > 0, tasa_itbis: p.tasaItbis, aplica_propina: p.aplicaPropina, tipo_plato: tipoPlato,
      requiere_guarnicion: p.requiereGuarnicion, requiere_termino: p.requiereTermino,
    });
    nuevos.push([
      p.nombre, p.descripcion, p.precio, p.imagenUrl, p.categoria, campos.tasaItbis, campos.aplicaItbis, campos.aplicaPropina, campos.tasaPropina,
      destino, campos.tipoPlato, campos.esPlatoFuerte, campos.esEntrada, campos.esPostre, campos.esGuarnicion, campos.requiereGuarnicion, campos.requiereTermino,
    ]);
  }
  const POR_TANDA = 200;
  for (let desde = 0; desde < nuevos.length; desde += POR_TANDA) {
    const tanda = nuevos.slice(desde, desde + POR_TANDA);
    await client.query(
      `INSERT INTO productos (nombre, descripcion, precio, imagen_url, categoria, estado, tasa_itbis, aplica_itbis, aplica_propina, tasa_propina,
        tipo_destino, tipo_plato, es_plato_fuerte, es_entrada, es_postre, es_guarnicion, requiere_guarnicion, requiere_termino) VALUES `
      + tanda.map((_, i) => { const b = i * 17; return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, 'Activo', ${Array.from({ length: 12 }, (__, k) => `$${b + 6 + k}`).join(', ')})`; }).join(', '),
      tanda.flat()
    );
  }
  await registrarAuditoria(client, { usuarioId: null, accion: 'IMPORTAR_PRODUCTOS', entidad: 'productos', detalle: { via: 'script', insertados: nuevos.length, categoriasCreadas: creadas.length }, ip: null });
  return { insertados: nuevos.length, categoriasCreadas: creadas, omitidos, invalidas: invalidRows };
}

/** PIN de 6 dígitos que nadie adivina por costumbre: sin escaleras, sin dígitos repetidos en bloque y sin repetir ninguno ya usado. */
function pinAleatorio(usados) {
  for (;;) {
    const pin = String(crypto.randomInt(100000, 1000000));
    const ds = [...pin].map(Number);
    const escalera = ds.slice(1).every((d, i) => d === ds[i] + 1) || ds.slice(1).every((d, i) => d === ds[i] - 1);
    if (escalera || new Set(ds).size < 4 || /(\d)\1\1/.test(pin) || usados.has(pin)) continue;
    usados.add(pin);
    return pin;
  }
}

async function crearPersonal(client) {
  const pedidos = [
    ...Array.from({ length: CAMAREROS }, (_, i) => ({ nombre: `Camarero ${i + 1}`, rol: 'Camarero' })),
    ...Array.from({ length: CAJERAS }, (_, i) => ({ nombre: `Cajera ${i + 1}`, rol: 'Cajero' })),
  ];
  if (!pedidos.length) return [];
  const actuales = await client.query("SELECT nombre, pin_hash FROM usuarios WHERE estado = 'Activo'");
  const nombres = new Set(actuales.rows.map((u) => clave(u.nombre)));
  const usados = new Set();
  // un PIN no puede coincidir con el de otro usuario del negocio: se descartan los que ya existen
  const choca = (pin) => actuales.rows.some((u) => u.pin_hash && verifyPin(pin, u.pin_hash));
  const creados = [];
  for (const p of pedidos) {
    if (nombres.has(clave(p.nombre))) { console.log(`  ya existe «${p.nombre}»: se omite`); continue; }
    let pin;
    do { pin = pinAleatorio(usados); } while (choca(pin));
    const r = await client.query("INSERT INTO usuarios (nombre, rol, pin, pin_hash, estado) VALUES ($1, $2, NULL, $3, 'Activo') RETURNING id", [p.nombre, p.rol, hashPin(pin)]);
    await registrarAuditoria(client, { usuarioId: null, accion: 'CREAR_USUARIO', entidad: 'usuarios', entidadId: r.rows[0].id, detalle: { via: 'script', rol: p.rol }, ip: null });
    creados.push({ ...p, pin });
  }
  return creados;
}

const db = getDatabase();
class Deshacer extends Error {}
let resultado;
try {
  await runWithRequestContext({ empresaId: EMPRESA }, () => db.transaction(async (client) => {
    const e = await client.query('SELECT nombre_comercial AS nombre FROM negocio_config LIMIT 1');
    const emp = await db.queryUnscoped('SELECT id, nombre FROM empresas WHERE id = $1', [EMPRESA]);
    if (!emp.rowCount) throw new Error(`La empresa ${EMPRESA} no existe.`);
    console.log(`Empresa ${EMPRESA}: ${emp.rows[0].nombre} (negocio_config: ${e.rows[0]?.nombre ?? '—'})${SECO ? '  [PRUEBA: se deshace al final]' : ''}`);
    const productos = CSV ? await importarProductos(client) : null;
    const personal = await crearPersonal(client);
    resultado = { productos, personal };
    if (SECO) throw new Deshacer();
  }));
} catch (error) {
  if (!(error instanceof Deshacer)) { console.error('ERROR:', error instanceof Error ? error.message : error); process.exit(1); }
}

if (resultado.productos) {
  const r = resultado.productos;
  console.log(`Productos: ${r.insertados} insertados · ${r.categoriasCreadas.length} categorías nuevas · ${r.omitidos.length} omitidos (ya existían) · ${r.invalidas.length} filas inválidas`);
  if (r.invalidas.length) console.log('  inválidas:', JSON.stringify(r.invalidas.slice(0, 5)));
}
if (resultado.personal.length) {
  console.log('Personal creado (el PIN solo se muestra ahora):');
  for (const u of resultado.personal) console.log(`  ${u.nombre.padEnd(12)} ${u.rol.padEnd(9)} PIN ${u.pin}`);
  if (PINES && !SECO) {
    fs.writeFileSync(PINES, ['# PIN del personal creado', '', '| Nombre | Rol | PIN |', '|---|---|---|', ...resultado.personal.map((u) => `| ${u.nombre} | ${u.rol} | ${u.pin} |`), ''].join('\n'));
    console.log(`PIN guardados en ${PINES}`);
  }
}
console.log(SECO ? 'PRUEBA terminada: no se guardó nada.' : 'Listo.');
process.exit(0);
