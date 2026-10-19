/**
 * Prueba de extremo a extremo del PIN del propietario INCRUSTADO y del panel del propietario reforzado.
 *
 *   npm run test:propietario
 *
 * Compila una copia del servidor con un PIN de prueba incrustado (el código real sigue sin PIN hasta que el
 * propietario ejecute `npm run propietario:pin`), la levanta en el puerto 3130 con una base temporal y un rol de base
 * sin privilegios, y deja puesto un OWNER_PIN "señuelo" en el entorno para comprobar que el incrustado PREVALECE.
 * Se ejecuta con tsx (usa el compilador del servidor en TypeScript). Borra todo al terminar.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { abrirBase, levantarEntorno } from './lib/entorno-prueba.mjs';
import { PIN_INCRUSTADO_DE_PRUEBA, compilarBundleConPinDePrueba } from './lib/bundle-pin-prueba.ts';

const resultados = [];
const ok = (nombre, cond, extra = '') => { resultados.push({ nombre, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${nombre}${extra ? '  → ' + extra : ''}`); };
const recortar = (v) => JSON.stringify(v).slice(0, 200);
const PIN_SENUELO = '246810'; // OWNER_PIN del entorno: con PIN incrustado NO debe servir

async function principal() {
  const bundle = await compilarBundleConPinDePrueba('bundle-pin-prueba.cjs');
  const dirLogs = path.join(os.tmpdir(), 'chloe-e2e-propietario');
  fs.rmSync(path.join(dirLogs, 'licencias.log'), { force: true });
  const e = await levantarEntorno({
    puerto: 3130, baseDatos: 'chloerest_e2elic_propietario', dirLogs, bundle,
    pinEntorno: PIN_SENUELO, pinLogin: PIN_INCRUSTADO_DE_PRUEBA, avisar: (m) => console.log(`· ${m}`),
  });
  let bd = null;
  try {
    const { servidor: C, env } = e;
    bd = await abrirBase(env, e.baseDatos);
    const loginDueno = (pin) => C.api('POST', '/api/dueno/login', { body: { pin } });
    const decodificar = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));

    console.log('\n== 1. El PIN incrustado prevalece ==');
    const info = (await C.api('GET', '/api/dueno/pin-info')).body;
    ok('pin-info informa PIN fijo de 12 dígitos y no revela nada más', info.configurado === true && info.fijo === true && JSON.stringify(info.longitudes) === '[12]' && Object.keys(info).sort().join() === 'configurado,fijo,longitudes', recortar(info));
    const bueno = await loginDueno(PIN_INCRUSTADO_DE_PRUEBA);
    ok('el PIN incrustado abre el panel del propietario', bueno.status === 200 && !!bueno.body.token, `${bueno.status}`);
    const T = bueno.body.token;
    ok('y el token sirve en las rutas del propietario', (await C.api('GET', '/api/dueno/resumen', { token: T })).status === 200);

    const senuelo = await loginDueno(PIN_SENUELO);
    ok('el OWNER_PIN del entorno YA NO sirve (401)', senuelo.status === 401, `${senuelo.status}`);

    // PIN guardado en la base (como el que un cliente crearía en su instalación): también se ignora.
    const sal = 'saldeprueba';
    const hashLegacy = `scrypt$${sal}$${crypto.scryptSync('555555', sal, 64).toString('base64url')}`;
    await bd.query('UPDATE configuracion_sistema SET owner_pin_hash = $1, owner_pin_longitud = 6 WHERE id = 1', [hashLegacy]);
    ok('un PIN de propietario guardado en la base tampoco sirve (401)', (await loginDueno('555555')).status === 401);
    ok('ni siquiera cambia lo que anuncia pin-info (sigue fijo de 12)', JSON.stringify((await C.api('GET', '/api/dueno/pin-info')).body.longitudes) === '[12]');
    const reintento = await loginDueno(PIN_INCRUSTADO_DE_PRUEBA);
    ok('tras fallar, el PIN correcto entra y borra el contador de fallos', reintento.status === 200);
    ok('un PIN de otra longitud ni siquiera se evalúa (401)', (await loginDueno('123456')).status === 401);

    console.log('\n== 2. Nadie puede crear ni cambiar el PIN del propietario ==');
    const crear = await C.api('POST', '/api/dueno/establecer-pin', { body: { pin: '8472910356' } });
    ok('establecer-pin está cerrado (409 PIN_FIJO)', crear.status === 409 && crear.body.code === 'PIN_FIJO', recortar(crear.body));
    const cambiar = await C.api('POST', '/api/dueno/cambiar-pin', { token: T, body: { pinActual: PIN_INCRUSTADO_DE_PRUEBA, pinNuevo: '8472910356' } });
    ok('cambiar-pin está cerrado incluso con sesión de propietario (409 PIN_FIJO)', cambiar.status === 409 && cambiar.body.code === 'PIN_FIJO', recortar(cambiar.body));
    ok('el nuevo PIN intentado no sirve', (await loginDueno('8472910356')).status === 401);
    ok('y el incrustado sigue funcionando', (await loginDueno(PIN_INCRUSTADO_DE_PRUEBA)).status === 200);

    console.log('\n== 3. La pantalla de acceso general usa la MISMA regla ==');
    const general = await C.api('POST', '/api/login/camarero', { body: { pin: PIN_INCRUSTADO_DE_PRUEBA, deviceId: 'prueba-web-0001' } });
    ok('el PIN incrustado también entra como propietario por el login general', general.status === 200 && general.body.esDueno === true, `${general.status}`);
    ok('con un token válido del propietario', (await C.api('GET', '/api/dueno/resumen', { token: general.body.token })).status === 200);
    const generalSenuelo = await C.api('POST', '/api/login/camarero', { body: { pin: PIN_SENUELO, deviceId: 'prueba-web-0001' } });
    ok('el señuelo no entra como propietario por el login general', generalSenuelo.body.esDueno !== true && generalSenuelo.status >= 400, `${generalSenuelo.status}`);

    console.log('\n== 4. Sesión más corta y rastros ==');
    const horas = (decodificar(T).exp - Date.now()) / 3600000;
    ok('la sesión del propietario dura 4 horas como máximo (antes 12)', horas > 3.9 && horas <= 4.01, `${horas.toFixed(2)} h`);
    const cabeceras = await fetch(`${C.url}/api/dueno/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN_INCRUSTADO_DE_PRUEBA }) });
    ok('la respuesta del login no se guarda en cachés (no-store)', (cabeceras.headers.get('cache-control') || '').includes('no-store'));
    const t0 = Date.now();
    await loginDueno('999888777666');
    ok('un PIN incorrecto tarda al menos 0,4 s en responder (frena la fuerza bruta)', Date.now() - t0 >= 380, `${Date.now() - t0} ms`);
    const auditoria = (await bd.query("SELECT accion, COUNT(*)::int AS n FROM auditoria_operaciones WHERE entidad = 'propietario' GROUP BY accion")).rows;
    const cuenta = Object.fromEntries(auditoria.map((f) => [f.accion, f.n]));
    ok('cada acceso queda en la auditoría (correctos y fallidos) con su IP', cuenta.DUENO_LOGIN_OK >= 3 && cuenta.DUENO_LOGIN_FALLIDO >= 3, recortar(cuenta));
    const conIp = (await bd.query("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE entidad = 'propietario' AND ip IS NOT NULL")).rows[0].n;
    ok('con la IP anotada', conIp >= 6, `${conIp}`);
    const registro = fs.readFileSync(path.join(dirLogs, 'licencias.log'), 'utf8');
    ok('al arrancar, el servidor anuncia el PIN fijo y no lo escribe en ningún registro', registro.includes('PIN_PROPIETARIO_INCRUSTADO') && !registro.includes(PIN_INCRUSTADO_DE_PRUEBA) && !registro.includes(PIN_SENUELO));

    console.log('\n== 5. Fuerza bruta ==');
    // Cada éxito reinicia la cuenta de fallos: se parte de cero y se hacen 5 fallos seguidos.
    await loginDueno(PIN_INCRUSTADO_DE_PRUEBA);
    const intentos = [];
    for (let i = 0; i < 5; i += 1) intentos.push((await loginDueno(`10293847561${i}`)).status);
    const bloqueado = await loginDueno(PIN_INCRUSTADO_DE_PRUEBA);
    ok('a los 5 PIN incorrectos seguidos el acceso se bloquea, incluso con el PIN correcto (429)', intentos.every((s) => s === 401) && bloqueado.status === 429, `${intentos.join(',')} → ${bloqueado.status}`);
    ok('y el bloqueo dura 15 minutos', (await bd.query("SELECT bloqueado_hasta - CURRENT_TIMESTAMP BETWEEN interval '14 minutes' AND interval '15 minutes' AS justo FROM login_intentos WHERE clave LIKE 'dueno:ip:%'")).rows[0]?.justo === true);
    const personal = await C.api('POST', '/api/login/camarero', { body: { pin: e.licencia.pinInicial, deviceId: 'prueba-web-0001' } });
    ok('el bloqueo del propietario no afecta al personal del negocio (su login sigue funcionando)', personal.status === 200, `${personal.status}`);
    ok('la sesión del propietario ya abierta sigue válida', (await C.api('GET', '/api/dueno/resumen', { token: T })).status === 200);

    console.log('\n== 6. Rutas del propietario cerradas a los demás ==');
    const rutas = ['/api/dueno/licencias', '/api/dueno/resumen', '/api/dueno/facturas', '/api/dueno/planes', '/api/dueno/solicitudes', '/api/dueno/metodos-pago'];
    const sinSesion = await Promise.all(rutas.map((r) => C.api('GET', r)));
    ok('sin sesión, todas las rutas del propietario responden 401', sinSesion.every((r) => r.status === 401), sinSesion.map((r) => r.status).join(','));
    const tAdmin = personal.body.token;
    const conAdmin = await Promise.all(rutas.map((r) => C.api('GET', r, { token: tAdmin, dispositivo: 'prueba-web-0001' })));
    ok('un Administrador de un negocio tampoco entra (401)', conAdmin.every((r) => r.status === 401), conAdmin.map((r) => r.status).join(','));
    ok('ni puede crear licencias ni resetear datos', (await C.api('POST', '/api/dueno/generar-clave', { token: tAdmin, body: { duracion: '12M' } })).status === 401 && (await C.api('POST', '/api/dueno/reset-pruebas', { token: tAdmin, body: { confirmacion: 'BORRAR PRUEBAS' } })).status === 401);
    const falso = `${Buffer.from(JSON.stringify({ rol: 'Dueno', exp: Date.now() + 3600000, ep: 1 })).toString('base64url')}.firmafalsa`;
    ok('un token del propietario falsificado se rechaza', (await C.api('GET', '/api/dueno/resumen', { token: falso })).status === 401);
    ok('cerrar sesión revoca el token', (await C.api('POST', '/api/dueno/logout', { token: T })).status === 200 && (await C.api('GET', '/api/dueno/resumen', { token: T })).status === 401);
  } finally {
    if (bd) await bd.end().catch(() => {});
    await e.limpiar();
    fs.rmSync(bundle, { force: true });
  }
}

principal().then(() => {
  const falladas = resultados.filter((r) => !r.pass);
  console.log(`\nResultado: ${resultados.length - falladas.length}/${resultados.length} comprobaciones correctas.`);
  if (falladas.length) { console.log('Fallaron:\n - ' + falladas.map((r) => r.nombre).join('\n - ')); process.exit(1); }
  process.exit(0);
}).catch((error) => { console.error(`\nERROR: ${error.stack || error.message}`); fs.rmSync('bundle-pin-prueba.cjs', { force: true }); process.exit(1); });
