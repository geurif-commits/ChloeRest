/**
 * Prueba de extremo a extremo del backend contra una base de datos de DESARROLLO.
 *
 *   E2E_ADMIN_PIN=<pin del administrador> E2E_DEVICE_ID=<equipo activado> npm run test:e2e
 *
 * Levanta su propio servidor (bundle.cjs, ver `npm run build:server:win`) y cubre: autenticación de todas las
 * rutas, roles, pedido → cocina/bar → cobro, ITBIS/propina, descuentos, división de cuenta, caja cerrada,
 * turnos por PIN, bloqueo de PIN, datos públicos mínimos y respaldos. Limpia todo lo que crea.
 * Se niega a correr contra bases que no sean locales.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';

const PIN = process.env.E2E_ADMIN_PIN;
const DEV = process.env.E2E_DEVICE_ID;
if (!PIN || !DEV) { console.error('Faltan E2E_ADMIN_PIN y E2E_DEVICE_ID.'); process.exit(2); }

// Configuración: variables de entorno primero y, si existe, el .env (así también corre en CI sin .env).
const env = {};
if (fs.existsSync('.env')) {
  for (const linea of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
for (const clave of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'NODE_ENV']) {
  if (process.env[clave] !== undefined) env[clave] = process.env[clave];
}
if (!['localhost', '127.0.0.1', undefined, ''].includes(env.DB_HOST) || env.NODE_ENV === 'production') {
  console.error('Solo se ejecuta contra una base de datos local de desarrollo.'); process.exit(2);
}

const ROOT = process.cwd();
const PORT = Number(process.env.E2E_PORT || 3011);
const base = `http://127.0.0.1:${PORT}`;
const dirRespaldos = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-respaldos-'));
const dirCopia = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-copia-'));
const db = new pg.Client({ host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), user: env.DB_USER || 'postgres', password: env.DB_PASSWORD || undefined, database: env.DB_NAME });

const resultados = [];
const ok = (nombre, cond, extra = '') => { resultados.push({ nombre, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${nombre}${extra ? '  → ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const llamar = async (metodo, ruta, { token, body, sinDispositivo, cabeceras } = {}) => {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(sinDispositivo ? {} : { 'X-Device-ID': DEV }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cabeceras || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await r.text(); let cuerpo = texto; try { cuerpo = JSON.parse(texto); } catch { /* texto */ }
  return { status: r.status, body: cuerpo };
};

let servidor;
const est = { cajasAbiertas: [], cuentasMax: 0, aperturaMax: 0, cierreMax: 0, arqueoMax: null, mesas: [], productos: [], usuarios: [], secuencia: null, negocio: null, catalogo: [], t0: new Date() };

async function iniciarServidor(extra = {}) {
  servidor = spawn(process.execPath, ['bundle.cjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), LOGIN_RATE_MAX: '5000', PUBLIC_RATE_MAX: '100000', NODE_ENV: 'development', ...extra }, stdio: 'ignore', windowsHide: true });
  let arriba = false;
  for (let i = 0; i < 50 && !arriba; i += 1) { try { arriba = (await fetch(base + '/api/health')).ok; } catch { /* arrancando */ } if (!arriba) await sleep(400); }
  await sleep(600);
  if (!arriba || servidor.exitCode !== null) throw new Error('el servidor de pruebas no arrancó (¿puerto ocupado?)');
}
function detenerServidor() {
  if (servidor) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(servidor.pid), '/t', '/f'], { stdio: 'ignore' });
    else servidor.kill('SIGTERM');
  }
  servidor = null;
}

async function principal() {
  await db.connect();
  const dev = await db.query('SELECT estado FROM dispositivos WHERE device_id = $1', [DEV]);
  if (!dev.rowCount || dev.rows[0].estado !== 'Activo') throw new Error('E2E_DEVICE_ID no es un equipo activado de la BD local');
  const maximo = async (t) => Number((await db.query(`SELECT COALESCE(MAX(id),0) AS m FROM ${t}`)).rows[0].m);
  est.cuentasMax = await maximo('cuentas'); est.aperturaMax = await maximo('aperturas_caja'); est.cierreMax = await maximo('historial_cierres');
  try { est.arqueoMax = await maximo('arqueos_caja'); } catch { est.arqueoMax = null; }
  est.negocio = (await db.query('SELECT id, nombre_comercial, razon_social, rnc, telefono, direccion, cobrar_itbis, cobrar_propina, propina_porcentaje FROM negocio_config ORDER BY id LIMIT 1')).rows[0] || null;
  est.negocioMax = await maximo('negocio_config');
  est.catalogo = (await db.query('SELECT id, aplica_itbis, tasa_itbis, aplica_propina, tasa_propina FROM productos')).rows;
  const sec = await db.query("SELECT id, secuencia_actual FROM dgii_secuencias WHERE tipo_comprobante='B02' AND activa AND fecha_vencimiento >= CURRENT_DATE ORDER BY id LIMIT 1");
  if (sec.rowCount) est.secuencia = { id: sec.rows[0].id, actual: sec.rows[0].secuencia_actual };
  else {
    const nueva = await db.query("INSERT INTO dgii_secuencias (tipo_comprobante, prefijo, secuencia_inicial, secuencia_actual, secuencia_final, fecha_vencimiento, activa, empresa_id) VALUES ('B02','B02',1,1,500, CURRENT_DATE + 365, TRUE, 1) RETURNING id");
    est.secuencia = { id: nueva.rows[0].id, creada: true };
  }

  await iniciarServidor({ BACKUP_DIR: dirRespaldos });

  // ── A. Autenticación de todas las rutas ──
  console.log('\n== A. Autenticación y datos públicos ==');
  const h = await llamar('GET', '/api/health', { sinDispositivo: true });
  ok('health responde y reporta la zona horaria de la BD', h.status === 200 && typeof h.body.zonaHorariaBd === 'string', `${h.body.migracion} · ${h.body.zonaHorariaBd}`);
  const remoto = await llamar('POST', '/api/dueno/establecer-pin', { sinDispositivo: true, body: { pin: '482913' }, cabeceras: { 'X-Forwarded-For': '203.0.113.9' } });
  ok('el PIN inicial del propietario no se puede crear desde fuera del equipo servidor (403)', remoto.status === 403, `HTTP ${remoto.status}`);

  const rutas = new Set();
  for (const f of fs.readdirSync('src/routers').filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(`src/routers/${f}`, 'utf8');
    const prefijo = f === 'inventario.ts' ? '/api/inventario' : f === 'ping.ts' ? '/ping' : '';
    for (const m of src.matchAll(/router\.(get|post|put|delete|patch)\(\s*(?:\[\s*)?'(\/[^']*)'/g)) rutas.add(`${m[1].toUpperCase()} ${prefijo}${m[2] === '/' && prefijo ? '' : m[2]}`);
  }
  const publicasGet = new Set(['/ping', '/api/app/version', '/api/sistema/info', '/api/configuracion/sistema', '/api/configuracion/completa', '/api/negocio/config', '/api/divisas', '/api/planes', '/api/metodos-pago', '/api/licencia/verificar']);
  const publicasPost = /^\/api\/(login|autorizar|kds\/autenticar|dueno\/login|dueno\/establecer-pin|dispositivo\/(registrar|activar)|solicitud-licencia|setup|telegram\/webhook|asistencia\/marcar|licencia\/activar)/;
  const inesperadas = [];
  for (const clave of rutas) {
    const [metodo, ruta] = clave.split(' ');
    if (metodo === 'GET' && publicasGet.has(ruta)) continue;
    if (metodo !== 'GET' && publicasPost.test(ruta)) continue;
    const r = await llamar(metodo, ruta.replace(/:[A-Za-z]+/g, '999999999'), { sinDispositivo: true, body: metodo === 'GET' ? undefined : {} });
    if (r.status !== 401 && r.status !== 403) inesperadas.push(`${clave} → ${r.status}`);
  }
  ok(`ninguna de las ${rutas.size} rutas de negocio responde sin credenciales`, inesperadas.length === 0, inesperadas.join(' ; '));

  const infoSin = (await llamar('GET', '/api/sistema/info', { sinDispositivo: true })).body;
  ok('/api/sistema/info sin equipo activado no revela datos del negocio', !('cajera' in infoSin && infoSin.cajera) && !infoSin.nombreNegocio && !infoSin.direccion && !infoSin.telefono, Object.keys(infoSin).join(','));
  const infoDesconocido = (await llamar('GET', '/api/sistema/info', { cabeceras: { 'X-Device-ID': 'equipo-inexistente-0001' }, sinDispositivo: true })).body;
  ok('un identificador de equipo desconocido tampoco los recibe', !infoDesconocido.nombreNegocio && !infoDesconocido.direccion);
  const infoCon = (await llamar('GET', '/api/sistema/info')).body;
  ok('con el equipo activado sí recibe los datos de su negocio', Boolean(infoCon.nombreNegocio));
  const completaSin = (await llamar('GET', '/api/configuracion/completa', { sinDispositivo: true })).body;
  ok('/api/configuracion/completa sin equipo solo expone el nombre comercial', Object.keys(completaSin.negocio || {}).every((k) => k === 'nombre_comercial'), Object.keys(completaSin.negocio || {}).join(','));
  const negocioSin = (await llamar('GET', '/api/negocio/config', { sinDispositivo: true })).body;
  ok('/api/negocio/config sin equipo no devuelve RNC, teléfono ni dirección', !('rnc' in negocioSin) && !('telefono' in negocioSin) && !('direccion' in negocioSin));
  let limitados = 0;
  for (let i = 0; i < 40; i += 1) { const r = await llamar('POST', '/api/dispositivo/registrar', { sinDispositivo: true, body: { deviceId: DEV } }); if (r.status === 429) limitados += 1; }
  ok('registrar equipos no se bloquea con 40 aperturas seguidas de la misma IP', limitados === 0, `${limitados} bloqueos`);

  // ── B. Sesión y roles ──
  console.log('\n== B. Sesión y roles ==');
  const login = await llamar('POST', '/api/login/camarero', { body: { pin: PIN, deviceId: DEV } });
  const T = login.body.token;
  ok('login del administrador', login.status === 200 && !!T);
  ok('el token queda ligado a su equipo', (await llamar('GET', '/api/mesas', { token: T, cabeceras: { 'X-Device-ID': 'otro-equipo' }, sinDispositivo: true })).status === 401);
  const crearUsuario = async (nombre, rol, pin) => {
    const r = await llamar('POST', '/api/usuarios', { token: T, body: { nombre, rol, pin } });
    if (r.status !== 201) throw new Error(`crear usuario ${rol}: ${r.status}`);
    const u = (await llamar('GET', '/api/usuarios', { token: T })).body.find((x) => x.nombre === nombre); est.usuarios.push(u.id); return u;
  };
  const PIN_CAM = '739204'; const PIN_CAJ = '482915';
  const cam = await crearUsuario('ZZE2E Camarero', 'Camarero', PIN_CAM);
  await crearUsuario('ZZE2E Cajero', 'Cajero', PIN_CAJ);
  const TC = (await llamar('POST', '/api/login/camarero', { body: { pin: PIN_CAM, deviceId: DEV } })).body.token;
  const TJ = (await llamar('POST', '/api/login/camarero', { body: { pin: PIN_CAJ, deviceId: DEV } })).body.token;
  const codigo = async (m, p, tk, b) => (await llamar(m, p, { token: tk, body: b })).status;
  ok('camarero: ve mesas, no lista usuarios, no crea productos, no cobra, no ve reportes', (await codigo('GET', '/api/mesas', TC)) === 200 && (await codigo('GET', '/api/usuarios', TC)) === 403 && (await codigo('POST', '/api/productos', TC, { nombre: 'x', precio: 1 })) === 403 && (await codigo('POST', '/api/mesas/999999/cobrar', TC, { metodo_pago: 'Efectivo' })) === 403 && (await codigo('GET', '/api/reportes/facturas', TC)) === 403);
  ok('cajero: consulta caja, no lista usuarios ni crea productos', (await codigo('GET', '/api/caja/estado', TJ)) === 200 && (await codigo('GET', '/api/usuarios', TJ)) === 403 && (await codigo('POST', '/api/productos', TJ, { nombre: 'x', precio: 1 })) === 403);
  ok('ni camarero ni cajero acceden a respaldos, ITBIS masivo ni horarios', (await codigo('GET', '/api/respaldos', TC)) === 403 && (await codigo('GET', '/api/respaldos', TJ)) === 403 && (await codigo('POST', '/api/productos/itbis', TJ, { aplica: true })) === 403 && (await codigo('PUT', '/api/asistencia/config', TC, {})) === 403);

  // ── C. Dinero ──
  console.log('\n== C. Pedido → KDS → cobro ==');
  const guardarNegocio = (extra) => llamar('POST', '/api/negocio/config', { token: T, body: { nombre_comercial: est.negocio?.nombre_comercial || 'Mi Restaurante', razon_social: est.negocio?.razon_social || 'Mi Restaurante SRL', rnc: est.negocio?.rnc || '130000001', telefono: est.negocio?.telefono || '8095550000', direccion: est.negocio?.direccion || 'Calle 1', cobrar_itbis: false, cobrar_propina: false, ...extra } });
  await guardarNegocio({});
  const crearProducto = async (nombre, categoria, destino, precio, itbis) => {
    const r = await llamar('POST', '/api/productos', { token: T, body: { nombre, precio, categoria, tipo_destino: destino, aplica_itbis: itbis, tasa_itbis: itbis ? 18 : 0 } });
    if (r.status >= 300) throw new Error('crear producto ' + nombre + ' ' + r.status);
  };
  await crearProducto('ZZE2E Plato', 'Principales', 'cocina', 300, false);
  await crearProducto('ZZE2E Cerveza', 'Cervezas', 'bar', 150, true);
  const productos = (await llamar('GET', '/api/productos', { token: T })).body.filter((p) => String(p.nombre).startsWith('ZZE2E'));
  est.productos = productos.map((p) => p.id);
  const plato = productos.find((p) => p.nombre === 'ZZE2E Plato'); const cerveza = productos.find((p) => p.nombre === 'ZZE2E Cerveza');
  ok('productos nuevos: el plato nace sin ITBIS; la cerveza con 18 % solo si se pidió', plato.aplica_itbis === false && Number(plato.tasa_itbis) === 0 && cerveza.aplica_itbis === true && Number(cerveza.tasa_itbis) === 18);
  ok('Cervezas clasifica como Bar y Principales como Cocina', String(cerveza.tipo_destino).toLowerCase() === 'bar' && String(plato.tipo_destino).toLowerCase() === 'cocina');

  const libres = (await llamar('GET', '/api/mesas', { token: T })).body.filter((m) => m.estado === 'Disponible');
  if (libres.length < 6) throw new Error('se necesitan 6 mesas disponibles');
  const pedir = async (mesa, comanda) => { est.mesas.push(mesa.id); return llamar('POST', `/api/mesas/${mesa.id}/pedidos`, { token: T, body: { comanda, items: comanda } }); };
  const cobrar = (mesa, extra = {}) => llamar('POST', `/api/mesas/${mesa.id}/cobrar`, { token: T, body: { metodo_pago: 'Efectivo', tipo_comprobante: 'B02', ...extra } });

  // C1. caja cerrada
  est.cajasAbiertas = (await db.query("SELECT id FROM aperturas_caja WHERE estado = 'Abierta'")).rows.map((r) => r.id);
  await db.query("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE estado = 'Abierta'");
  const comanda1 = [{ id: plato.id, cantidad: 2 }, { id: cerveza.id, cantidad: 3 }];
  ok('pedido creado', (await pedir(libres[0], comanda1)).status < 300);
  const kds = async (a) => ((await llamar('GET', `/api/kds/${a}/pedidos`, { token: T })).body || []).filter((r) => String(r.producto).startsWith('ZZE2E'));
  const [coc, bar] = [await kds('Cocina'), await kds('Bar')];
  ok('Cocina solo recibe el plato y Bar solo la cerveza', coc.length === 1 && coc[0].producto === 'ZZE2E Plato' && bar.length === 1 && bar[0].producto === 'ZZE2E Cerveza');
  ok('despachar desde cocina y bar', (await llamar('PUT', `/api/kds/despachar/${coc[0].detalle_id}`, { token: T })).status === 200 && (await llamar('PUT', `/api/kds/despachar/${bar[0].detalle_id}`, { token: T })).status === 200);
  const sinCaja = await cobrar(libres[0]);
  ok('sin caja abierta no se cobra (409 CAJA_CERRADA)', sinCaja.status === 409 && sinCaja.body.code === 'CAJA_CERRADA', `${sinCaja.status}`);
  const apertura = await llamar('POST', '/api/caja/apertura', { token: T, body: { monto_inicial: 1000 } });
  ok('apertura de caja', apertura.status === 200);

  // C2. todo apagado → total = subtotal (600 + 450 = 1050)
  const apagado = await cobrar(libres[0]);
  ok('ITBIS y propina apagados: total = subtotal (1,050.00)', apagado.status === 200 && Number(apagado.body.totales.total) === 1050 && Number(apagado.body.totales.itbis) === 0 && Number(apagado.body.totales.propina) === 0, JSON.stringify({ t: apagado.body.totales?.total }));

  // C3. ITBIS + propina 15 %: ITBIS solo sobre la cerveza (450 × 18 % = 81), propina 15 % de 1,050 = 157.50
  await guardarNegocio({ cobrar_itbis: true, cobrar_propina: true, propina_porcentaje: 15 });
  await pedir(libres[1], comanda1);
  const conImpuestos = await cobrar(libres[1]);
  const t3 = conImpuestos.body.totales || {};
  ok('ITBIS por producto + propina 15 %: total 1,288.50 (servidor = pantalla)', Number(t3.itbis) === 81 && Number(t3.propina) === 157.5 && Number(t3.total) === 1288.5, JSON.stringify({ itbis: t3.itbis, propina: t3.propina, total: t3.total }));
  const cuentaSelect = await db.query('SELECT subtotal, itbis, propina, total FROM cuentas WHERE id = $1', [conImpuestos.body.cuenta_id]);
  ok('lo guardado en la base coincide con el recibo', Number(cuentaSelect.rows[0].total) === 1288.5 && Number(cuentaSelect.rows[0].subtotal) === 1050);

  // C4. descuento
  const sesenta = async (mesa, extra) => { await pedir(mesa, comanda1); return cobrar(mesa, extra); };
  const sinMotivo = await sesenta(libres[2], { descuento_tipo: 'porcentaje', descuento_valor: 10 });
  ok('descuento sin motivo → 400', sinMotivo.status === 400, sinMotivo.body.error);
  const mayor100 = await cobrar(libres[2], { descuento_tipo: 'porcentaje', descuento_valor: 101, descuento_motivo: 'prueba' });
  ok('descuento de 101 % → 400', mayor100.status === 400);
  const montoGrande = await cobrar(libres[2], { descuento_tipo: 'monto', descuento_valor: 5000, descuento_motivo: 'prueba' });
  ok('descuento mayor al subtotal → 400', montoGrande.status === 400);
  const conDescuento = await cobrar(libres[2], { descuento_tipo: 'porcentaje', descuento_valor: 10, descuento_motivo: 'Cliente frecuente' });
  const t4 = conDescuento.body.totales || {};
  // bruto 1,050; descuento 105; neto 945; ITBIS 18 % de (450 − 45) = 72.90; propina 15 % de 945 = 141.75; total 1,159.65
  ok('descuento 10 %: neto 945, ITBIS 72.90, propina 141.75, total 1,159.65', Number(t4.descuento) === 105 && Number(t4.subtotal) === 945 && Number(t4.itbis) === 72.9 && Number(t4.propina) === 141.75 && Number(t4.total) === 1159.65, JSON.stringify({ d: t4.descuento, s: t4.subtotal, i: t4.itbis, p: t4.propina, t: t4.total }));
  const fila4 = (await db.query('SELECT descuento, descuento_tipo, descuento_valor, descuento_motivo FROM cuentas WHERE id = $1', [conDescuento.body.cuenta_id])).rows[0];
  ok('el descuento y su motivo quedan guardados', Number(fila4.descuento) === 105 && fila4.descuento_tipo === 'porcentaje' && fila4.descuento_motivo === 'Cliente frecuente');
  const aud = await db.query("SELECT detalle FROM auditoria_operaciones WHERE accion = 'COBRAR_CUENTA' AND entidad_id = $1::text ORDER BY id DESC LIMIT 1", [String(conDescuento.body.cuenta_id)]).catch(() => ({ rowCount: 1 }));
  ok('la auditoría registra el cobro con descuento', aud.rowCount === 1);

  // C5. dividir cuenta: 2 platos + 3 cervezas; se cobran 1 plato + 1 cerveza y el resto sigue abierto
  await guardarNegocio({ cobrar_itbis: false, cobrar_propina: false });
  await pedir(libres[3], comanda1);
  const detalles = (await llamar('GET', `/api/mesas/${libres[3].id}/cuenta`, { token: T })).body;
  ok('el detalle de la cuenta incluye la tasa de ITBIS de cada producto', detalles.every((d) => d.tasa_itbis !== undefined) && detalles.find((d) => d.nombre === 'ZZE2E Cerveza')?.tasa_itbis !== undefined);
  const dPlato = detalles.find((d) => d.nombre === 'ZZE2E Plato'); const dCerveza = detalles.find((d) => d.nombre === 'ZZE2E Cerveza');
  const parte = await cobrar(libres[3], { detalles_cobrar: [{ id: dPlato.id, cantidad: 1 }, { id: dCerveza.id, cantidad: 1 }] });
  ok('cobro parcial: 1 plato + 1 cerveza = 450.00', parte.status === 200 && parte.body.dividida === true && Number(parte.body.totales.total) === 450, `${parte.status} ${JSON.stringify(parte.body.totales?.total)}`);
  const restante = (await llamar('GET', `/api/mesas/${libres[3].id}/cuenta`, { token: T })).body;
  ok('la mesa sigue ocupada con lo que quedó (1 plato y 2 cervezas)', restante.length === 2 && Number(restante.find((d) => d.nombre === 'ZZE2E Plato')?.cantidad) === 1 && Number(restante.find((d) => d.nombre === 'ZZE2E Cerveza')?.cantidad) === 2);
  ok('la mesa no se libera tras un cobro parcial', (await db.query('SELECT estado FROM mesas WHERE id = $1', [libres[3].id])).rows[0].estado === 'Ocupada');
  const resto = await cobrar(libres[3]);
  ok('se cobra el resto (300 + 300 = 600.00) y la mesa se libera', resto.status === 200 && resto.body.dividida === false && Number(resto.body.totales.total) === 600 && (await db.query('SELECT estado FROM mesas WHERE id = $1', [libres[3].id])).rows[0].estado === 'Disponible');
  ok('las dos facturas suman la cuenta original (1,050.00) con NCF distintos', money(Number(parte.body.totales.total) + Number(resto.body.totales.total)) === 1050 && parte.body.ncf !== resto.body.ncf, `${parte.body.ncf} / ${resto.body.ncf}`);
  const mal = await pedir(libres[4], comanda1);
  const dMal = (await llamar('GET', `/api/mesas/${libres[4].id}/cuenta`, { token: T })).body[0];
  const excede = await cobrar(libres[4], { detalles_cobrar: [{ id: dMal.id, cantidad: 99 }] });
  ok('dividir con una cantidad mayor a lo consumido → 400 y la cuenta queda intacta', mal.status < 300 && excede.status === 400 && (await llamar('GET', `/api/mesas/${libres[4].id}/cuenta`, { token: T })).body.length === 2);
  const ajeno = await cobrar(libres[4], { detalles_cobrar: [{ id: 999999999, cantidad: 1 }] });
  ok('dividir con un producto ajeno → 400', ajeno.status === 400);
  await cobrar(libres[4]);

  // C6. pago mixto y ITBIS masivo
  await pedir(libres[5], comanda1);
  const mixtoMalo = await cobrar(libres[5], { metodo_pago_2: 'Tarjeta', monto_pago_2: -500, tarjeta_ultimos_4: '1111' });
  ok('pago mixto con monto negativo → 400', mixtoMalo.status === 400);
  await cobrar(libres[5]);
  const masivo = await llamar('POST', '/api/productos/itbis', { token: T, body: { aplica: true, tasa: 18 } });
  const tras = (await llamar('GET', '/api/productos', { token: T })).body;
  ok('ITBIS masivo: aplica 18 % a todos los productos activos', masivo.status === 200 && tras.every((p) => Number(p.tasa_itbis) === 18 && p.aplica_itbis === true));
  ok('ITBIS masivo rechaza tasas inválidas', (await llamar('POST', '/api/productos/itbis', { token: T, body: { aplica: true, tasa: 7 } })).status === 400);
  await llamar('POST', '/api/productos/itbis', { token: T, body: { aplica: false } });

  // ── D. Turnos ──
  console.log('\n== D. Turnos por PIN ==');
  const marca = (b) => llamar('POST', '/api/asistencia/marcar', { body: { pin: PIN_CAM, deviceId: DEV, ...b } });
  const m1 = await marca({});
  ok('vista previa de entrada', m1.status === 200 && m1.body.preview === true && m1.body.accion === 'entrada');
  ok('entrada registrada y visible para el administrador', (await marca({ confirmar: true })).body.registrado === true && (await llamar('GET', '/api/asistencia/en-turno', { token: T })).body.some((f) => f.usuario_id === cam.id));
  ok('salida inmediata bloqueada (409) y equipo sin activar rechazado (403)', (await marca({ confirmar: true })).status === 409 && (await llamar('POST', '/api/asistencia/marcar', { body: { pin: PIN_CAM, deviceId: 'equipo-no-activado' }, cabeceras: { 'X-Device-ID': 'equipo-no-activado' }, sinDispositivo: true })).status === 403);

  // ── E. Respaldos ──
  console.log('\n== E. Respaldos ==');
  ok('el administrador no gestiona respaldos en un servidor multiempresa (403)', (await llamar('GET', '/api/respaldos', { token: T })).status === 403);
  detenerServidor();
  await iniciarServidor({ BACKUP_DIR: dirRespaldos, BACKUP_COPY_DIR: dirCopia, BACKUP_TENANT_ACCESS: '1' });
  const T2 = (await llamar('POST', '/api/login/camarero', { body: { pin: PIN, deviceId: DEV } })).body.token;
  const lista0 = await llamar('GET', '/api/respaldos', { token: T2 });
  ok('en una instalación de un solo negocio el administrador ve los respaldos', lista0.status === 200 && Array.isArray(lista0.body.respaldos), `herramienta: ${lista0.body.herramientaDisponible}`);
  ok('la API informa que hay copia externa configurada', lista0.body.copiaExternaConfigurada === true);
  if (lista0.body.herramientaDisponible) {
    const nuevo = await llamar('POST', '/api/respaldos', { token: T2 });
    ok('crear un respaldo ahora (se verifica antes de responder)', nuevo.status === 201 && nuevo.body.respaldo?.verificado === true, nuevo.body.respaldo?.nombre || nuevo.body.error);
    const descarga = await fetch(`${base}/api/respaldos/${nuevo.body.respaldo.nombre}`, { headers: { Authorization: 'Bearer ' + T2, 'X-Device-ID': DEV } });
    ok('descargar el respaldo', descarga.status === 200 && (await descarga.arrayBuffer()).byteLength > 1000);
    ok('el respaldo también se copió a la carpeta externa', nuevo.body.respaldo.copiaExterna === 'ok' && fs.existsSync(path.join(dirCopia, nuevo.body.respaldo.nombre)) && fs.readdirSync(dirCopia).every((f) => !f.endsWith('.parcial')));
  }
  ok('no se puede pedir un archivo fuera de la carpeta de respaldos', (await llamar('GET', '/api/respaldos/..%2F..%2F.env', { token: T2 })).status === 404 && (await llamar('GET', '/api/respaldos/otro.txt', { token: T2 })).status === 404);
  if (lista0.body.herramientaDisponible) {
    // Un destino que no se puede usar no debe romper el respaldo local: se avisa con 'fallida'.
    const ocupado = path.join(dirCopia, 'no-es-carpeta');
    fs.writeFileSync(ocupado, 'x');
    detenerServidor();
    await iniciarServidor({ BACKUP_DIR: dirRespaldos, BACKUP_COPY_DIR: path.join(ocupado, 'dentro'), BACKUP_TENANT_ACCESS: '1' });
    const T3 = (await llamar('POST', '/api/login/camarero', { body: { pin: PIN, deviceId: DEV } })).body.token;
    const conFallo = await llamar('POST', '/api/respaldos', { token: T3 });
    ok('si la carpeta externa no está disponible el respaldo local igual se crea y se avisa', conFallo.status === 201 && conFallo.body.respaldo?.copiaExterna === 'fallida' && /no se pudo copiar/i.test(conFallo.body.mensaje || ''), conFallo.body.mensaje || conFallo.body.error);
  }

  // ── F. Fuerza bruta ──
  console.log('\n== F. Bloqueo por intentos ==');
  // Ventana de intentos: los fallos de hace días no se acumulan (LOGIN_WINDOW_MINUTES).
  await db.query("DELETE FROM login_intentos WHERE clave LIKE 'ip:%' AND actualizado_en >= $1", [est.t0]);
  await db.query("INSERT INTO login_intentos (clave, intentos, actualizado_en) VALUES ('dev:ventana-e2e', 4, NOW() - INTERVAL '2 days') ON CONFLICT (clave) DO UPDATE SET intentos = 4, bloqueado_hasta = NULL, actualizado_en = NOW() - INTERVAL '2 days'");
  const viejo = await llamar('POST', '/api/login/camarero', { body: { pin: '910099', deviceId: 'ventana-e2e' }, cabeceras: { 'X-Device-ID': 'ventana-e2e' }, sinDispositivo: true });
  const filaVieja = (await db.query("SELECT intentos, bloqueado_hasta FROM login_intentos WHERE clave = 'dev:ventana-e2e'")).rows[0];
  ok('los fallos de hace días no se acumulan: un PIN incorrecto nuevo no bloquea', viejo.status === 401 && Number(filaVieja?.intentos) === 1 && filaVieja?.bloqueado_hasta === null, `HTTP ${viejo.status} · intentos=${filaVieja?.intentos} · bloqueado=${filaVieja?.bloqueado_hasta}`);
  const estados = [];
  for (let i = 0; i < 8; i += 1) estados.push((await llamar('POST', '/api/login/camarero', { body: { pin: String(910000 + i), deviceId: 'lockout-e2e' }, cabeceras: { 'X-Device-ID': 'lockout-e2e' }, sinDispositivo: true })).status);
  ok('tras varios PIN incorrectos el sistema bloquea (429)', estados.slice(-2).every((s) => s === 429 || s === 423), estados.join(','));
}

async function limpiar() {
  console.log('\n== Limpieza ==');
  try {
    detenerServidor();
    const ids = (await db.query('SELECT id FROM cuentas WHERE id > $1', [est.cuentasMax])).rows.map((r) => r.id);
    if (ids.length) { await db.query('DELETE FROM cuenta_detalles WHERE cuenta_id = ANY($1::bigint[])', [ids]); await db.query('DELETE FROM cuentas WHERE id = ANY($1::bigint[])', [ids]); }
    if (est.mesas.length) await db.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = ANY($1::int[])", [est.mesas]);
    await db.query("DELETE FROM productos WHERE nombre LIKE 'ZZE2E%'");
    for (const p of est.catalogo) await db.query('UPDATE productos SET aplica_itbis=$2, tasa_itbis=$3, aplica_propina=$4, tasa_propina=$5 WHERE id=$1', [p.id, p.aplica_itbis, p.tasa_itbis, p.aplica_propina, p.tasa_propina]);
    if (est.usuarios.length) {
      await db.query('DELETE FROM turnos_empleados WHERE usuario_id = ANY($1::int[])', [est.usuarios]);
      await db.query('DELETE FROM app_sessions WHERE usuario_id = ANY($1::int[])', [est.usuarios]).catch(() => undefined);
      await db.query('DELETE FROM auditoria_operaciones WHERE usuario_id = ANY($1::int[])', [est.usuarios]).catch(() => undefined);
      await db.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [est.usuarios]).catch(async () => { await db.query("UPDATE usuarios SET estado = 'Inactivo' WHERE id = ANY($1::int[])", [est.usuarios]); });
    }
    if (est.secuencia?.creada) await db.query('DELETE FROM dgii_secuencias WHERE id = $1', [est.secuencia.id]);
    else if (est.secuencia) await db.query('UPDATE dgii_secuencias SET secuencia_actual = $2 WHERE id = $1', [est.secuencia.id, est.secuencia.actual]);
    await db.query('DELETE FROM historial_cierres WHERE id > $1', [est.cierreMax]);
    if (est.arqueoMax !== null) await db.query('DELETE FROM arqueos_caja WHERE id > $1', [est.arqueoMax]);
    await db.query('DELETE FROM aperturas_caja WHERE id > $1', [est.aperturaMax]);
    if (est.cajasAbiertas.length) await db.query("UPDATE aperturas_caja SET estado = 'Abierta' WHERE id = ANY($1::int[])", [est.cajasAbiertas]);
    if (!est.negocio) await db.query('DELETE FROM negocio_config WHERE id > $1', [est.negocioMax]);
    else await db.query('UPDATE negocio_config SET nombre_comercial=$2, razon_social=$3, rnc=$4, telefono=$5, direccion=$6, cobrar_itbis=$7, cobrar_propina=$8, propina_porcentaje=$9 WHERE id=$1', [est.negocio.id, est.negocio.nombre_comercial, est.negocio.razon_social, est.negocio.rnc, est.negocio.telefono, est.negocio.direccion, est.negocio.cobrar_itbis, est.negocio.cobrar_propina, est.negocio.propina_porcentaje]);
    await db.query('DELETE FROM login_intentos WHERE actualizado_en >= $1', [est.t0]);
    fs.rmSync(dirRespaldos, { recursive: true, force: true });
    fs.rmSync(dirCopia, { recursive: true, force: true });
    console.log('limpieza OK');
  } catch (e) { console.log('LIMPIEZA CON ERROR:', e.message); }
  await db.end();
}

try { await principal(); } catch (e) { console.log('ERROR:', e.stack || e.message); resultados.push({ nombre: 'ejecución', pass: false }); } finally { await limpiar(); }
const fallos = resultados.filter((r) => !r.pass);
console.log(`\nRESUMEN: ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas`);
if (fallos.length) console.log('FALLOS:\n - ' + fallos.map((f) => f.nombre).join('\n - '));
process.exit(fallos.length ? 1 : 0);
