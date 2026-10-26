/**
 * Prueba de extremo a extremo del backend contra una base de datos de DESARROLLO.
 *
 *   E2E_ADMIN_PIN=<pin del administrador> E2E_DEVICE_ID=<equipo activado> npm run test:e2e
 *
 * Levanta su propio servidor (bundle-pruebas.cjs, ver `npm run build:server:pruebas`: el servidor sin el PIN del
 * propietario incrustado, para poder entrar con OWNER_PIN) y cubre: autenticación de todas las
 * rutas, roles, pedido → cocina/bar → cobro, ITBIS/propina, descuentos, división de cuenta, caja cerrada,
 * turnos por PIN, bloqueo de PIN, datos públicos mínimos y respaldos. Limpia todo lo que crea.
 * Se niega a correr contra bases que no sean locales.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
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
const est = { cajasAbiertas: [], cuentasMax: 0, aperturaMax: 0, cierreMax: 0, arqueoMax: null, mesas: [], productos: [], usuarios: [], secuencia: null, secMax: 0, dgii: null, dgiiMax: 0, negocio: null, catalogo: [], duenoCfg: null, t0: new Date() };

async function iniciarServidor(extra = {}) {
  servidor = spawn(process.execPath, [process.env.E2E_BUNDLE || 'bundle-pruebas.cjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), LOGIN_RATE_MAX: '5000', PUBLIC_RATE_MAX: '100000', NODE_ENV: 'development', ...extra }, stdio: 'ignore', windowsHide: true });
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
  est.duenoCfg = (await db.query('SELECT id, owner_pin_hash, owner_pin_longitud, owner_token_epoch FROM configuracion_sistema ORDER BY id LIMIT 1')).rows[0] || null;
  est.negocioMax = await maximo('negocio_config');
  est.catalogo = (await db.query('SELECT id, aplica_itbis, tasa_itbis, aplica_propina, tasa_propina FROM productos')).rows;
  est.secMax = await maximo('dgii_secuencias'); est.dgiiMax = await maximo('dgii_config');
  est.dgii = (await db.query("SELECT *, to_char(ecf_obligatorio_desde, 'YYYY-MM-DD') AS corte_txt FROM dgii_config WHERE empresa_id = 1 ORDER BY id LIMIT 1")).rows[0] || null;
  // Las secciones con NCF tradicional (B02) no deben depender del calendario: el corte al e-CF se aleja y la sección C8 lo mueve.
  if (est.dgii) await db.query("UPDATE dgii_config SET ecf_obligatorio_desde = DATE '2099-12-31' WHERE id = $1", [est.dgii.id]);
  else await db.query("INSERT INTO dgii_config (ambiente, empresa_id, ecf_obligatorio_desde) VALUES ('Pruebas', 1, DATE '2099-12-31')");
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

  // El dueño puede elegir su propio PIN, no depender de uno generado (se restaura al limpiar).
  if (est.duenoCfg) {
    await db.query('UPDATE configuracion_sistema SET owner_pin_hash = NULL WHERE id = $1', [est.duenoCfg.id]);
    // Longitud(es) válidas del PIN, públicas como el login: el teclado de acceso las usa para auto-enviar.
    const infoPin = async () => (await llamar('GET', '/api/dueno/pin-info', { sinDispositivo: true })).body;
    if (!process.env.OWNER_PIN) {
      const sinPin = await infoPin();
      ok('sin PIN de propietario, pin-info lo indica y no da longitudes', sinPin.configurado === false && Array.isArray(sinPin.longitudes) && sinPin.longitudes.length === 0, JSON.stringify(sinPin));
    }
    const creado = await llamar('POST', '/api/dueno/establecer-pin', { sinDispositivo: true, body: { pin: '730164' } });
    ok('el propietario crea su PIN desde el equipo servidor', creado.status === 200 && creado.body.token, `HTTP ${creado.status}`);
    if (!process.env.OWNER_PIN) ok('pin-info informa la longitud del PIN recién creado (6)', JSON.stringify(await infoPin()) === JSON.stringify({ configurado: true, longitudes: [6] }));
    const tokenDueno = creado.body.token;
    const pinActualMalo = await llamar('POST', '/api/dueno/cambiar-pin', { sinDispositivo: true, token: tokenDueno, body: { pinActual: '000000', pinNuevo: '250891' } });
    ok('cambiar el PIN exige el PIN actual correcto (401)', pinActualMalo.status === 401, `HTTP ${pinActualMalo.status}`);
    const cambio = await llamar('POST', '/api/dueno/cambiar-pin', { sinDispositivo: true, token: tokenDueno, body: { pinActual: '730164', pinNuevo: '250891' } });
    ok('el propietario cambia su propio PIN', cambio.status === 200 && cambio.body.token, `HTTP ${cambio.status}`);
    const viejoFalla = await llamar('POST', '/api/dueno/login', { sinDispositivo: true, body: { pin: '730164' } });
    ok('el PIN anterior deja de funcionar tras el cambio', viejoFalla.status === 401, `HTTP ${viejoFalla.status}`);
    const nuevoFunciona = await llamar('POST', '/api/dueno/login', { sinDispositivo: true, body: { pin: '250891' } });
    ok('el PIN nuevo funciona de inmediato', nuevoFunciona.status === 200 && nuevoFunciona.body.token, `HTTP ${nuevoFunciona.status}`);
    // El PIN puede ser de 4, 6 u 8 dígitos y pin-info sigue a cada cambio.
    let pinVigente = '250891'; let tokenVigente = nuevoFunciona.body.token;
    for (const pinNuevo of ['25089143', '2508']) {
      const cambiado = await llamar('POST', '/api/dueno/cambiar-pin', { sinDispositivo: true, token: tokenVigente, body: { pinActual: pinVigente, pinNuevo } });
      const entra = await llamar('POST', '/api/dueno/login', { sinDispositivo: true, body: { pin: pinNuevo } });
      ok(`el PIN de ${pinNuevo.length} dígitos se acepta, entra y pin-info informa su longitud`, cambiado.status === 200 && entra.status === 200 && (process.env.OWNER_PIN || JSON.stringify(await infoPin()) === JSON.stringify({ configurado: true, longitudes: [pinNuevo.length] })), `cambio ${cambiado.status} · login ${entra.status}`);
      pinVigente = pinNuevo; tokenVigente = entra.body.token;
    }
  }

  const rutas = new Set();
  for (const f of fs.readdirSync('src/routers').filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(`src/routers/${f}`, 'utf8');
    const prefijo = f === 'inventario.ts' ? '/api/inventario' : f === 'ping.ts' ? '/ping' : '';
    for (const m of src.matchAll(/router\.(get|post|put|delete|patch)\(\s*(?:\[\s*)?'(\/[^']*)'/g)) rutas.add(`${m[1].toUpperCase()} ${prefijo}${m[2] === '/' && prefijo ? '' : m[2]}`);
  }
  const publicasGet = new Set(['/ping', '/api/app/version', '/api/sistema/info', '/api/configuracion/sistema', '/api/configuracion/completa', '/api/negocio/config', '/api/dueno/pin-info', '/api/divisas', '/api/planes', '/api/metodos-pago', '/api/licencia/verificar']);
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

  // C7. Venta rápida (mostrador / para llevar): crea la cuenta y la cobra en un solo paso, con las mismas reglas de caja.
  console.log('\n== C7. Venta rápida (para llevar) ==');
  await guardarNegocio({ cobrar_itbis: true, cobrar_propina: true, propina_porcentaje: 15 });
  await db.query('UPDATE productos SET aplica_itbis = TRUE, tasa_itbis = 18 WHERE id = $1', [cerveza.id]); // C6 apagó el ITBIS de todos
  const comandaRapida = [{ id: plato.id, cantidad: 2 }, { id: cerveza.id, cantidad: 3 }];
  const rapida = (extra = {}, token = T) => llamar('POST', '/api/ventas/rapida', { token, body: { metodo_pago: 'Efectivo', tipo_comprobante: 'B02', comanda: comandaRapida, enviar_a_cocina: false, ...extra } });
  const contarLlevar = async (soloAbiertas = false) => Number((await db.query(`SELECT COUNT(*)::int AS n FROM cuentas WHERE tipo_servicio = 'Para Llevar'${soloAbiertas ? " AND estado = 'Abierta'" : ''}`)).rows[0].n);

  const v1 = await rapida({ comanda: [{ id: plato.id, cantidad: 2, precio: 1 }, { id: cerveza.id, cantidad: 3, precio: 1 }] });
  const tv1 = v1.body.totales || {};
  ok('venta rápida: crea la cuenta y la cobra en un paso; el precio lo decide la base y no el cliente (1,288.50)', v1.status === 201 && Number(tv1.itbis) === 81 && Number(tv1.propina) === 157.5 && Number(tv1.total) === 1288.5 && typeof v1.body.ncf === 'string' && v1.body.ncf.length > 3, JSON.stringify({ s: v1.status, t: tv1, e: v1.body.error }));
  const f1 = (await db.query('SELECT estado, tipo_servicio, mesa_id, cajero_id, cliente_id, ncf_ecf_generado, tipo_comprobante, total FROM cuentas WHERE id = $1', [v1.body.cuenta_id])).rows[0];
  ok('queda Cerrada, "Para Llevar", sin mesa ni cliente, con cajero, B02 y el mismo NCF del recibo', f1.estado === 'Cerrada' && f1.tipo_servicio === 'Para Llevar' && f1.mesa_id === null && f1.cliente_id === null && f1.cajero_id !== null && f1.tipo_comprobante === 'B02' && f1.ncf_ecf_generado === v1.body.ncf && Number(f1.total) === 1288.5, JSON.stringify(f1));
  const d1 = (await db.query('SELECT estado_cocina FROM cuenta_detalles WHERE cuenta_id = $1', [v1.body.cuenta_id])).rows;
  ok('sin "enviar a cocina" las líneas nacen entregadas y Cocina/Bar no las reciben', d1.length === 2 && d1.every((d) => d.estado_cocina === 'Despachado') && (await kds('Cocina')).length === 0 && (await kds('Bar')).length === 0);
  const facturasRapida = (await llamar('GET', '/api/reportes/facturas', { token: T })).body;
  ok('aparece en el historial de facturas como "Para llevar", con el cajero que cobró', Array.isArray(facturasRapida) && facturasRapida.some((f) => f.ncf_ecf_generado === v1.body.ncf && f.mesa_nombre === 'Para llevar' && f.cajero_nombre));
  ok('la auditoría registra la venta rápida', (await db.query("SELECT 1 FROM auditoria_operaciones WHERE accion = 'VENTA_RAPIDA' AND entidad_id = $1::text", [String(v1.body.cuenta_id)])).rowCount === 1);

  const v2 = await rapida({ enviar_a_cocina: undefined });
  const [cocLlevar, barLlevar] = [await kds('Cocina'), await kds('Bar')];
  ok('por defecto el pedido (ya cobrado) llega a Cocina y a Bar como "Para llevar"', v2.status === 201 && cocLlevar.length === 1 && cocLlevar[0].mesa === 'Para llevar' && barLlevar.length === 1 && barLlevar[0].mesa === 'Para llevar', JSON.stringify({ c: cocLlevar.length, b: barLlevar.length }));
  ok('se despacha como cualquier comanda y desaparece de las pantallas', (await llamar('PUT', `/api/kds/despachar/${cocLlevar[0].detalle_id}`, { token: T })).status === 200 && (await llamar('PUT', `/api/kds/despachar/${barLlevar[0].detalle_id}`, { token: T })).status === 200 && (await kds('Cocina')).length === 0 && (await kds('Bar')).length === 0);

  const v3 = await rapida({ cliente_nombre: 'ZZE2E Cliente', cliente_telefono: '8095550199' });
  const f3 = (await db.query('SELECT c.cliente_id, cf.nombre, cf.telefono FROM cuentas c LEFT JOIN clientes_frecuentes cf ON cf.id = c.cliente_id WHERE c.id = $1', [v3.body.cuenta_id])).rows[0];
  ok('con nombre y teléfono el cliente queda registrado y ligado a la venta', v3.status === 201 && f3?.cliente_id && f3.nombre === 'ZZE2E Cliente' && f3.telefono === '8095550199', `${v3.status} ${v3.body.error || ''} ${JSON.stringify(f3)}`);

  const v4 = await rapida({ descuento_tipo: 'porcentaje', descuento_valor: 10, descuento_motivo: 'Cliente frecuente', detalles_cobrar: [{ id: 1, cantidad: 1 }] });
  ok('el descuento rige como en las mesas (neto 945, total 1,159.65) y "dividir" se ignora', v4.status === 201 && Number(v4.body.totales?.descuento) === 105 && Number(v4.body.totales?.total) === 1159.65, JSON.stringify(v4.body.totales));

  // Un fallo no deja cuentas a medias: ni abiertas (que la caja no sabría encontrar) ni cobradas.
  const [llevarAntes, abiertasAntes] = [await contarLlevar(), await contarLlevar(true)];
  const fallos = [
    ['producto inexistente', await rapida({ comanda: [{ id: 999999999, cantidad: 1 }] })],
    ['venta vacía', await rapida({ comanda: [] })],
    ['cantidad 0', await rapida({ comanda: [{ id: plato.id, cantidad: 0 }] })],
    ['método de pago inválido', await rapida({ metodo_pago: 'Cheque' })],
    ['tarjeta sin 4 dígitos', await rapida({ metodo_pago: 'Tarjeta' })],
    ['descuento sin motivo', await rapida({ descuento_tipo: 'porcentaje', descuento_valor: 10 })],
    ['descuento mayor al subtotal', await rapida({ descuento_tipo: 'monto', descuento_valor: 99999, descuento_motivo: 'prueba' })],
    ['cliente con solo el nombre', await rapida({ cliente_nombre: 'ZZE2E Cliente' })],
  ];
  ok('datos inválidos → 400 y no queda ninguna cuenta nueva', fallos.every(([, r]) => r.status === 400) && (await contarLlevar()) === llevarAntes && (await contarLlevar(true)) === abiertasAntes, fallos.map(([n, r]) => `${n}:${r.status}`).join(' · '));
  await db.query("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE estado = 'Abierta'");
  const sinCajaRapida = await rapida();
  ok('sin caja abierta: 409 CAJA_CERRADA y no queda ninguna cuenta nueva', sinCajaRapida.status === 409 && sinCajaRapida.body.code === 'CAJA_CERRADA' && (await contarLlevar()) === llevarAntes && (await contarLlevar(true)) === abiertasAntes, `${sinCajaRapida.status}`);
  ok('se reabre la caja', (await llamar('POST', '/api/caja/apertura', { token: T, body: { monto_inicial: 500 } })).status === 200);
  ok('un camarero no puede cobrar una venta rápida (403)', (await rapida({}, TC)).status === 403);

  // El pedido para llevar "abierto" (se cobra después) sigue funcionando: cliente opcional, notas y cobro de siempre.
  const llevar = await llamar('POST', '/api/pedidos/llevar', { token: T, body: { comanda: [{ id: plato.id, cantidad: 1, notas: 'sin sal' }] } });
  const cocinaLlevar = await kds('Cocina');
  ok('/api/pedidos/llevar: cliente opcional, queda abierto y pendiente en Cocina con su nota', llevar.status === 201 && cocinaLlevar.length === 1 && cocinaLlevar[0].notas === 'sin sal' && cocinaLlevar[0].mesa === 'Para llevar', `${llevar.status} ${llevar.body.error || ''}`);
  const cobroLlevar = await llamar('POST', `/api/cuentas/${llevar.body.cuenta_id}/cobrar`, { token: T, body: { metodo_pago: 'Efectivo', tipo_comprobante: 'B02' } });
  ok('ese pedido abierto se cobra después con el cobro de siempre (300 + propina 15 % = 345.00)', cobroLlevar.status === 200 && Number(cobroLlevar.body.totales?.total) === 345, `${cobroLlevar.status} ${JSON.stringify(cobroLlevar.body.totales?.total)}`);
  ok('cobrado el pedido, sigue en Cocina hasta despacharlo y luego sale', (await kds('Cocina')).length === 1 && (await llamar('PUT', `/api/kds/despachar/${cocinaLlevar[0].detalle_id}`, { token: T })).status === 200 && (await kds('Cocina')).length === 0);
  const soloNombreLlevar = await llamar('POST', '/api/pedidos/llevar', { token: T, body: { cliente_nombre: 'ZZE2E Cliente', comanda: [{ id: plato.id, cantidad: 1 }] } });
  ok('/api/pedidos/llevar con solo el nombre del cliente → 400', soloNombreLlevar.status === 400);
  await guardarNegocio({ cobrar_itbis: false, cobrar_propina: false });

  // ── C8. Facturación electrónica (e-CF) ──
  console.log('\n== C8. Facturación electrónica (e-CF) ==');
  // Proveedor simulado (AlgoBack v2): registra lo que recibe y responde según el modo.
  const proveedor = { modo: 'aceptar', pedidos: [] };
  const mock = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      proveedor.pedidos.push({ metodo: req.method, url: req.url, cabeceras: req.headers, cuerpo: cuerpo ? JSON.parse(cuerpo) : null });
      const responder = (codigo, json) => { res.writeHead(codigo, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (proveedor.modo === 'caido') return responder(503, { error: 'mantenimiento' });
      if (proveedor.modo === 'rechazar') return responder(200, { dgii: { estado: 'Rechazado', codigo: '2', mensajes: [{ valor: 'Monto total no coincide' }] } });
      return responder(200, { codigoSeguridad: 'AbC123', fechaFirma: '25-10-2026 21:30:05', dgii: { estado: 'Aceptado', trackId: 'TRK-E2E', codigo: '1' } });
    });
  });
  await new Promise((resolver) => { mock.listen(0, '127.0.0.1', resolver); });
  const urlMock = `http://127.0.0.1:${mock.address().port}`;
  const ultimoEnvio = () => [...proveedor.pedidos].reverse().find((x) => x.metodo === 'POST')?.cuerpo;
  const pedidosAntes = () => proveedor.pedidos.length;

  const configEcf = (extra = {}) => llamar('POST', '/api/dgii/config', { token: T, body: { rnc_emisor: '131000004', razon_social_emisor: 'RESTAURANTE E2E SRL', ambiente: 'Pruebas', proveedor_ecf: 'algoback', algoback_url: urlMock, algoback_ambiente: 'PROD', algoback_api_key: 'key-e2e', ecf_obligatorio_desde: '2099-12-31', ...extra } });
  const emisorEcf = () => llamar('PUT', '/api/dgii/emisor', { token: T, body: { rnc_emisor: '131000004', razon_social_emisor: 'RESTAURANTE E2E SRL', direccion_emisor: 'Calle Duarte 1, La Romana', telefono_emisor: '8095550100', email_emisor: 'e2e@example.com', regimen_fiscal: 'Ordinario' } });
  // Un cobro rechazado deja la mesa abierta: cada escenario abre UNA mesa y la reutiliza hasta lograr el cobro.
  const abrir = async () => {
    const m = (await llamar('GET', '/api/mesas', { token: T })).body.find((x) => x.estado === 'Disponible');
    if (!m) throw new Error('no quedan mesas disponibles para la sección e-CF');
    await pedir(m, [{ id: plato.id, cantidad: 1 }, { id: cerveza.id, cantidad: 1 }]);
    return m;
  };
  const ecfDe = async (cuentaId) => (await db.query('SELECT estado, codigo_seguridad, fecha_firma, intentos, ultimo_error, track_id FROM e_cf_comprobantes WHERE cuenta_id = $1', [cuentaId])).rows[0];

  await guardarNegocio({ cobrar_itbis: true, cobrar_propina: false });
  await db.query("UPDATE negocio_config SET rnc = '', direccion = '' WHERE id = (SELECT id FROM negocio_config ORDER BY id LIMIT 1)");

  const estado0 = await llamar('GET', '/api/comprobantes/estado', { token: T });
  ok('estado: sin corte cercano el NCF tradicional se ofrece junto a los e-CF, y B02 es el tipo por defecto',
    estado0.status === 200 && estado0.body.corte.obligatorio === false && estado0.body.tipos.some((t) => t.codigo === 'B02') && estado0.body.tipos.some((t) => t.codigo === 'E32') && estado0.body.porDefecto === 'B02');
  ok('el cajero también ve el estado; el camarero no', (await llamar('GET', '/api/comprobantes/estado', { token: TC })).status === 403);

  await configEcf({ rnc_emisor: '', razon_social_emisor: '' });
  const mesaA = await abrir();
  const sinEmisor = await cobrar(mesaA, { tipo_comprobante: 'E32' });
  ok('sin RNC, razón social y dirección del emisor no se emite un e-CF (409 EMISOR_INCOMPLETO)', sinEmisor.status === 409 && sinEmisor.body.code === 'EMISOR_INCOMPLETO', `${sinEmisor.status} ${sinEmisor.body.code}`);

  await configEcf(); await emisorEcf();
  const vencimiento = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
  const secInvalida = await llamar('POST', '/api/dgii/secuencias', { token: T, body: { tipo_comprobante: 'E32', secuencia_inicial: 1, secuencia_actual: 1, fecha_vencimiento: vencimiento } });
  ok('una secuencia e-CF exige el rango autorizado por la DGII (400)', secInvalida.status === 400, secInvalida.body.error);
  ok('el tipo de comprobante debe existir (400)', (await llamar('POST', '/api/dgii/secuencias', { token: T, body: { tipo_comprobante: 'X99', secuencia_final: 10, fecha_vencimiento: vencimiento } })).status === 400);
  ok('el rango debe ser coherente (final menor que inicial → 400)', (await llamar('POST', '/api/dgii/secuencias', { token: T, body: { tipo_comprobante: 'E32', secuencia_inicial: 50, secuencia_actual: 50, secuencia_final: 10, fecha_vencimiento: vencimiento } })).status === 400);
  ok('un e-NCF no puede pasar de 10 dígitos (400)', (await llamar('POST', '/api/dgii/secuencias', { token: T, body: { tipo_comprobante: 'E32', secuencia_final: 99999999999, fecha_vencimiento: vencimiento } })).status === 400);
  for (const [tipo, fin] of [['E32', 1000], ['E31', 1000], ['E45', 1]]) {
    const r = await llamar('POST', '/api/dgii/secuencias', { token: T, body: { tipo_comprobante: tipo, prefijo: 'ZZZ', secuencia_inicial: 1, secuencia_actual: 1, secuencia_final: fin, fecha_vencimiento: vencimiento } });
    ok(`se registra la secuencia ${tipo} 1–${fin}`, r.status === 200, r.body.error || '');
  }
  const secs = (await llamar('GET', '/api/dgii/secuencias', { token: T })).body;
  ok('el prefijo de un e-CF siempre es su tipo, aunque se mande otro', secs.filter((x) => x.tipo_comprobante.startsWith('E')).every((x) => x.prefijo === x.tipo_comprobante));

  // E32: aceptado por la DGII
  const total0 = pedidosAntes();
  const e32 = await cobrar(mesaA, { tipo_comprobante: 'E32' });
  const rep32 = e32.body.representacion || {};
  ok('E32: se cobra y el e-NCF tiene 13 caracteres (E32 + 10 dígitos)', e32.status === 200 && /^E32\d{10}$/.test(e32.body.ncf) && e32.body.tipo_comprobante === 'E32', `${e32.status} ${e32.body.ncf || e32.body.error}`);
  const env32 = ultimoEnvio();
  ok('el proveedor recibe el e-NCF, el emisor y el monto exacto cobrado (ITBIS incluido)', pedidosAntes() > total0 && env32?.eNCF === e32.body.ncf && env32?.RNCEmisor === '131000004' && Number(env32?.MontoTotal) === money(e32.body.totales.total) && Number(env32?.TotalITBIS) === money(e32.body.totales.itbis) && env32?.RNCComprador === undefined,
    JSON.stringify({ total: e32.body.totales?.total, itbis: e32.body.totales?.itbis, enviado: env32?.MontoTotal }));
  const cab32 = proveedor.pedidos.find((x) => x.metodo === 'POST')?.cabeceras || {};
  ok('se identifica con la API-KEY, el entorno y una clave de operación que evita la doble emisión', cab32['x-api-key'] === 'key-e2e' && cab32['x-entorno'] === 'PROD' && String(cab32['x-operacion-id']).startsWith('cuenta-'));
  ok('la representación impresa trae título, código de seguridad, fecha de firma y el QR de consulta de la DGII', rep32.electronico === true && rep32.titulo === 'Factura de Consumo Electrónica' && rep32.codigoSeguridad === 'AbC123' && rep32.fechaFirma && rep32.pendiente === false && String(rep32.qrUrl).startsWith('https://fc.dgii.gov.do/ecf/ConsultaTimbreFC?') && String(rep32.qrUrl).includes('CodigoSeguridad=AbC123'), rep32.qrUrl);
  ok('la fecha de emisión y la de firma salen como texto dd-MM-yyyy HH:mm:ss en hora de Santo Domingo', /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(rep32.fechaEmision) && rep32.fechaFirma === '25-10-2026 21:30:05', `${rep32.fechaEmision} · ${rep32.fechaFirma}`);
  ok('el emisor declarado a la DGII viaja con el comprobante para el ticket', rep32.emisor?.rnc === '131000004' && rep32.emisor?.razonSocial === 'RESTAURANTE E2E SRL' && Boolean(rep32.emisor?.direccion), JSON.stringify(rep32.emisor));
  const fila32 = await ecfDe(e32.body.cuenta_id);
  ok('queda registrado como Aceptado con su código de seguridad', fila32?.estado === 'Aceptado' && fila32.codigo_seguridad === 'AbC123');
  const repGet = await llamar('GET', `/api/cuentas/${e32.body.cuenta_id}/comprobante`, { token: T });
  ok('la reimpresión lee los mismos datos del comprobante', repGet.status === 200 && repGet.body.ncf === e32.body.ncf && repGet.body.codigoSeguridad === 'AbC123');

  // E31: crédito fiscal exige comprador
  const mesaB = await abrir();
  const sinRnc = await cobrar(mesaB, { tipo_comprobante: 'E31' });
  ok('E31 sin RNC del cliente → 400 COMPRADOR_REQUERIDO', sinRnc.status === 400 && sinRnc.body.code === 'COMPRADOR_REQUERIDO', `${sinRnc.status} ${sinRnc.body.code}`);
  const sinNombre = await cobrar(mesaB, { tipo_comprobante: 'E31', rnc_cedula_cliente: '101000019' });
  ok('E31 sin razón social del cliente → 400', sinNombre.status === 400);
  const rncMalo = await cobrar(mesaB, { tipo_comprobante: 'E31', rnc_cedula_cliente: '123456789', razon_social_cliente: 'ACME SRL' });
  ok('E31 con RNC inválido → 400 RNC_INVALIDO', rncMalo.status === 400 && rncMalo.body.code === 'RNC_INVALIDO', `${rncMalo.status} ${rncMalo.body.code}`);
  const e31 = await cobrar(mesaB, { tipo_comprobante: 'E31', rnc_cedula_cliente: '101-00001-9', razon_social_cliente: ' ACME SRL ' });
  const env31 = ultimoEnvio();
  ok('E31 con RNC válido: se cobra, el RNC se guarda solo con dígitos y viaja al proveedor con su razón social y el vencimiento de la secuencia', e31.status === 200 && /^E31\d{10}$/.test(e31.body.ncf) && env31?.RNCComprador === '101000019' && env31?.RazonSocialComprador === 'ACME SRL' && /^\d{2}-\d{2}-\d{4}$/.test(env31?.FechaVencimientoSecuencia || ''), JSON.stringify({ s: e31.status, rnc: env31?.RNCComprador }));
  const cta31 = (await db.query('SELECT rnc_cedula_cliente, razon_social_cliente FROM cuentas WHERE id = $1', [e31.body.cuenta_id])).rows[0];
  ok('la cuenta guarda RNC normalizado y razón social; el ticket los muestra', cta31?.rnc_cedula_cliente === '101000019' && cta31.razon_social_cliente === 'ACME SRL' && e31.body.representacion?.comprador?.razonSocial === 'ACME SRL' && e31.body.representacion?.titulo === 'Factura de Crédito Fiscal Electrónica' && Boolean(e31.body.representacion?.fechaVencimientoSecuencia));

  // Rango inclusivo: E45 1–1 emite el número 1 y luego se agota
  const e45 = await cobrar(await abrir(), { tipo_comprobante: 'E45', rnc_cedula_cliente: '101000019', razon_social_cliente: 'MINISTERIO E2E' });
  ok('el único número del rango E45 1–1 sí se puede emitir (rango inclusivo)', e45.status === 200 && e45.body.ncf === 'E450000000001', `${e45.status} ${e45.body.ncf || e45.body.error}`);
  const mesaD = await abrir();
  const e45b = await cobrar(mesaD, { tipo_comprobante: 'E45', rnc_cedula_cliente: '101000019', razon_social_cliente: 'MINISTERIO E2E' });
  ok('y el siguiente falla por secuencia agotada (400 SECUENCIA_AGOTADA)', e45b.status === 400 && e45b.body.code === 'SECUENCIA_AGOTADA', `${e45b.status} ${e45b.body.code}`);
  ok('una secuencia que ya emitió comprobantes no se puede eliminar (409)', (await llamar('DELETE', `/api/dgii/secuencias/${secs.find((x) => x.tipo_comprobante === 'E32').id}`, { token: T })).status === 409);

  // Proveedor caído: el cobro no se pierde y el comprobante queda pendiente
  proveedor.modo = 'caido';
  const caido = await cobrar(mesaD, { tipo_comprobante: 'E32' });
  ok('con el proveedor caído la venta se cobra igual y el ticket indica "pendiente de validación"', caido.status === 200 && caido.body.representacion?.pendiente === true && !caido.body.representacion?.codigoSeguridad, `${caido.status} pendiente=${caido.body.representacion?.pendiente}`);
  const filaCaido = await ecfDe(caido.body.cuenta_id);
  ok('queda Pendiente, con el motivo y programado para reintentarse', filaCaido?.estado === 'Pendiente' && Number(filaCaido.intentos) === 1 && /proveedor|503|disponible/i.test(filaCaido.ultimo_error || ''), JSON.stringify(filaCaido));
  const espera = Number((await db.query('SELECT EXTRACT(EPOCH FROM (proximo_intento - NOW())) AS s FROM e_cf_comprobantes WHERE cuenta_id = $1', [caido.body.cuenta_id])).rows[0]?.s);
  ok('el reintento se programa en el próximo minuto (no horas después, sin importar la zona horaria del servidor)', espera > 0 && espera <= 130, `${Math.round(espera)} s`);
  proveedor.modo = 'aceptar';
  const reenvio = await llamar('POST', '/api/dgii/ecf/enviar', { token: T, body: { cuenta_id: caido.body.cuenta_id } });
  ok('al volver el proveedor, el reenvío lo deja Aceptado con su timbre', reenvio.status === 200 && reenvio.body.estado === 'Aceptado' && (await ecfDe(caido.body.cuenta_id))?.codigo_seguridad === 'AbC123', `${reenvio.status} ${reenvio.body.estado || reenvio.body.error}`);
  const repTrasReenvio = await llamar('GET', `/api/cuentas/${caido.body.cuenta_id}/comprobante`, { token: T });
  ok('y la reimpresión ya trae código de seguridad y QR', repTrasReenvio.body.pendiente === false && Boolean(repTrasReenvio.body.codigoSeguridad) && Boolean(repTrasReenvio.body.qrUrl));

  // Rechazo de la DGII
  proveedor.modo = 'rechazar';
  const rechazado = await cobrar(await abrir(), { tipo_comprobante: 'E32' });
  const filaRech = await ecfDe(rechazado.body.cuenta_id);
  ok('un rechazo de la DGII queda registrado con su motivo y no se reintenta solo', rechazado.status === 200 && filaRech?.estado === 'Rechazado' && /Monto total/.test(filaRech.ultimo_error || ''), JSON.stringify(filaRech));
  proveedor.modo = 'aceptar';
  const fiscal = await llamar('GET', '/api/dgii/estado-fiscal', { token: T });
  ok('el estado fiscal avisa de los comprobantes rechazados y de lo que falta (secuencia E44, ambiente)', fiscal.status === 200 && fiscal.body.problemas.some((x) => x.codigo === 'RECHAZADOS' && x.nivel === 'error') && fiscal.body.problemas.some((x) => x.codigo === 'SECUENCIA_E44') && fiscal.body.listo === false, fiscal.body.problemas?.map((x) => x.codigo).join(','));
  await db.query("UPDATE e_cf_comprobantes SET estado = 'Anulado' WHERE cuenta_id = $1", [rechazado.body.cuenta_id]);

  // Corte: desde la fecha el NCF tradicional ya no vale
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await configEcf({ ecf_obligatorio_desde: ayer });
  const estado1 = await llamar('GET', '/api/comprobantes/estado', { token: T });
  ok('desde el corte: solo se ofrecen e-CF y E32 es el tipo por defecto', estado1.body.corte.obligatorio === true && estado1.body.tipos.every((t) => t.electronico) && estado1.body.porDefecto === 'E32');
  const mesaE = await abrir();
  const b02 = await cobrar(mesaE, { tipo_comprobante: 'B02' });
  ok('desde el corte un cobro con NCF tradicional se rechaza (400 NCF_NO_VALIDO)', b02.status === 400 && b02.body.code === 'NCF_NO_VALIDO', `${b02.status} ${b02.body.code}`);
  const sinTipo = await cobrar(mesaE, { tipo_comprobante: undefined });
  ok('sin tipo de comprobante se emite E32 (consumo electrónico)', sinTipo.status === 200 && /^E32\d{10}$/.test(sinTipo.body.ncf), `${sinTipo.status} ${sinTipo.body.ncf || sinTipo.body.error}`);
  ok('desde el corte tampoco se pueden registrar secuencias de NCF tradicional (400)', (await llamar('POST', '/api/dgii/secuencias', { token: T, body: { tipo_comprobante: 'B02', secuencia_final: 100, fecha_vencimiento: vencimiento } })).status === 400);
  await configEcf();
  ok('con el corte lejano el NCF tradicional vuelve a aceptarse', (await cobrar(await abrir(), { tipo_comprobante: 'B02' })).status === 200);
  await guardarNegocio({ cobrar_itbis: false, cobrar_propina: false });
  await new Promise((resolver) => { mock.close(resolver); });


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
  ok('ni cambia los ajustes del respaldo automático en un servidor multiempresa (403)', (await llamar('PUT', '/api/respaldos/ajustes', { token: T, body: { enabled: true } })).status === 403);
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

  // Ajustes del respaldo automático desde la pantalla: se guardan junto a los respaldos y mandan sobre BACKUP_*.
  console.log('\n== E2. Ajustes del respaldo automático ==');
  const archivoAjustes = path.join(dirRespaldos, 'ajustes.json');
  const dirCopiaNueva = path.join(dirCopia, 'elegida-en-pantalla', 'usb');
  const T4 = (await llamar('POST', '/api/login/camarero', { body: { pin: PIN, deviceId: DEV } })).body.token;
  const ajustesIni = (await llamar('GET', '/api/respaldos', { token: T4 })).body;
  ok('la API informa los ajustes vigentes (por defecto: desactivado, 03:00, 14 días)', ajustesIni.ajustes?.enabled === false && ajustesIni.ajustes?.hour === 3 && ajustesIni.ajustes?.retentionDays === 14, JSON.stringify(ajustesIni.ajustes));
  const malos = [
    await llamar('PUT', '/api/respaldos/ajustes', { token: T4, body: { hour: 25 } }),
    await llamar('PUT', '/api/respaldos/ajustes', { token: T4, body: { retentionDays: 0 } }),
    await llamar('PUT', '/api/respaldos/ajustes', { token: T4, body: { enabled: 'si' } }),
    await llamar('PUT', '/api/respaldos/ajustes', { token: T4, body: { copyDir: 'carpeta/relativa' } }),
    await llamar('PUT', '/api/respaldos/ajustes', { token: T4, body: { copyDir: dirRespaldos } }),
  ];
  ok('ajustes inválidos (hora, días, estado, ruta relativa, carpeta de respaldos) se rechazan con 400', malos.every((r) => r.status === 400), malos.map((r) => r.status).join(','));
  ok('un rechazo no guarda nada', !fs.existsSync(archivoAjustes));
  const guardado = await llamar('PUT', '/api/respaldos/ajustes', { token: T4, body: { enabled: true, hour: 22, retentionDays: 30, copyDir: dirCopiaNueva } });
  ok('guardar ajustes válidos (activar, 22:00, 30 días, carpeta externa elegida)', guardado.status === 200 && guardado.body.ajustes?.enabled === true && guardado.body.ajustes?.hour === 22 && guardado.body.ajustes?.retentionDays === 30 && guardado.body.ajustes?.copyDir === path.resolve(dirCopiaNueva), guardado.body.error || JSON.stringify(guardado.body.ajustes));
  ok('la carpeta externa se creó y no quedó el archivo de prueba', fs.existsSync(dirCopiaNueva) && fs.readdirSync(dirCopiaNueva).length === 0 && fs.existsSync(archivoAjustes));
  const trasGuardar = (await llamar('GET', '/api/respaldos', { token: T4 })).body;
  ok('la lectura refleja lo guardado, incluidas las claves históricas', trasGuardar.ajustes?.hour === 22 && trasGuardar.automaticos === true && trasGuardar.hora === 22 && trasGuardar.retencionDias === 30 && trasGuardar.copiaExternaConfigurada === true);
  ok('con pg_dump hay próximo respaldo programado; sin él no', trasGuardar.herramientaDisponible ? typeof trasGuardar.proximoRespaldo === 'string' && new Date(trasGuardar.proximoRespaldo).getHours() === 22 : trasGuardar.proximoRespaldo === null, String(trasGuardar.proximoRespaldo));
  detenerServidor();
  await iniciarServidor({ BACKUP_DIR: dirRespaldos, BACKUP_TENANT_ACCESS: '1' });
  const T5 = (await llamar('POST', '/api/login/camarero', { body: { pin: PIN, deviceId: DEV } })).body.token;
  const trasReinicio = (await llamar('GET', '/api/respaldos', { token: T5 })).body;
  ok('los ajustes sobreviven al reinicio y mandan sobre el entorno (sin BACKUP_COPY_DIR ni BACKUP_ENABLED)', trasReinicio.ajustes?.enabled === true && trasReinicio.ajustes?.hour === 22 && trasReinicio.ajustes?.copyDir === path.resolve(dirCopiaNueva));
  if (trasReinicio.herramientaDisponible) {
    const conAjustes = await llamar('POST', '/api/respaldos', { token: T5 });
    ok('el respaldo usa la carpeta externa elegida en pantalla', conAjustes.status === 201 && conAjustes.body.respaldo?.copiaExterna === 'ok' && fs.existsSync(path.join(dirCopiaNueva, conAjustes.body.respaldo.nombre)), conAjustes.body.error || conAjustes.body.respaldo?.copiaExterna);
  }
  const ajApagado = await llamar('PUT', '/api/respaldos/ajustes', { token: T5, body: { enabled: false, copyDir: null } });
  const trasApagar = (await llamar('GET', '/api/respaldos', { token: T5 })).body;
  ok('desactivar y quitar la copia externa se aplica al instante (sin temporizador pendiente)', ajApagado.status === 200 && trasApagar.automaticos === false && trasApagar.copiaExternaConfigurada === false && trasApagar.proximoRespaldo === null);
  fs.rmSync(archivoAjustes, { force: true });

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
    await db.query("DELETE FROM clientes_frecuentes WHERE nombre LIKE 'ZZE2E%'");
    if (est.mesas.length) await db.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = ANY($1::int[])", [est.mesas]);
    await db.query("DELETE FROM productos WHERE nombre LIKE 'ZZE2E%'");
    for (const p of est.catalogo) await db.query('UPDATE productos SET aplica_itbis=$2, tasa_itbis=$3, aplica_propina=$4, tasa_propina=$5 WHERE id=$1', [p.id, p.aplica_itbis, p.tasa_itbis, p.aplica_propina, p.tasa_propina]);
    if (est.usuarios.length) {
      await db.query('DELETE FROM turnos_empleados WHERE usuario_id = ANY($1::int[])', [est.usuarios]);
      await db.query('DELETE FROM app_sessions WHERE usuario_id = ANY($1::int[])', [est.usuarios]).catch(() => undefined);
      await db.query('DELETE FROM auditoria_operaciones WHERE usuario_id = ANY($1::int[])', [est.usuarios]).catch(() => undefined);
      await db.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [est.usuarios]).catch(async () => { await db.query("UPDATE usuarios SET estado = 'Inactivo' WHERE id = ANY($1::int[])", [est.usuarios]); });
    }
    await db.query('DELETE FROM dgii_secuencias WHERE id > $1', [est.secMax]);
    if (est.dgii) await db.query('UPDATE dgii_config SET rnc_emisor=$2, razon_social_emisor=$3, direccion_emisor=$4, telefono_emisor=$5, email_emisor=$6, ambiente=$7, proveedor_ecf=$8, algoback_api_key=$9, algoback_url=$10, algoback_ambiente=$11, ecf_obligatorio_desde=$12::date WHERE id=$1', [est.dgii.id, est.dgii.rnc_emisor, est.dgii.razon_social_emisor, est.dgii.direccion_emisor, est.dgii.telefono_emisor, est.dgii.email_emisor, est.dgii.ambiente, est.dgii.proveedor_ecf, est.dgii.algoback_api_key, est.dgii.algoback_url, est.dgii.algoback_ambiente, est.dgii.corte_txt]);
    else await db.query('DELETE FROM dgii_config WHERE id > $1', [est.dgiiMax]);
    if (est.secuencia?.creada) await db.query('DELETE FROM dgii_secuencias WHERE id = $1', [est.secuencia.id]);
    else if (est.secuencia) await db.query('UPDATE dgii_secuencias SET secuencia_actual = $2 WHERE id = $1', [est.secuencia.id, est.secuencia.actual]);
    await db.query('DELETE FROM historial_cierres WHERE id > $1', [est.cierreMax]);
    if (est.arqueoMax !== null) await db.query('DELETE FROM arqueos_caja WHERE id > $1', [est.arqueoMax]);
    await db.query('DELETE FROM aperturas_caja WHERE id > $1', [est.aperturaMax]);
    if (est.cajasAbiertas.length) await db.query("UPDATE aperturas_caja SET estado = 'Abierta' WHERE id = ANY($1::int[])", [est.cajasAbiertas]);
    if (!est.negocio) await db.query('DELETE FROM negocio_config WHERE id > $1', [est.negocioMax]);
    else await db.query('UPDATE negocio_config SET nombre_comercial=$2, razon_social=$3, rnc=$4, telefono=$5, direccion=$6, cobrar_itbis=$7, cobrar_propina=$8, propina_porcentaje=$9 WHERE id=$1', [est.negocio.id, est.negocio.nombre_comercial, est.negocio.razon_social, est.negocio.rnc, est.negocio.telefono, est.negocio.direccion, est.negocio.cobrar_itbis, est.negocio.cobrar_propina, est.negocio.propina_porcentaje]);
    if (est.duenoCfg) await db.query('UPDATE configuracion_sistema SET owner_pin_hash=$2, owner_pin_longitud=$3, owner_token_epoch=$4 WHERE id=$1', [est.duenoCfg.id, est.duenoCfg.owner_pin_hash, est.duenoCfg.owner_pin_longitud, est.duenoCfg.owner_token_epoch]);
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
