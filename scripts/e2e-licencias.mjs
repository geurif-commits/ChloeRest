/**
 * Prueba de extremo a extremo de las LICENCIAS y la activación de equipos: cupo de equipos por licencia (más de 2
 * cuando el cliente lo necesita), reactivación sin saltarse el límite, historial con motivo, clave oculta al
 * Administrador, concurrencia y aislamiento entre empresas.
 *
 *   npm run test:licencias        (se ejecuta con tsx: compila antes el servidor de pruebas sin PIN de propietario incrustado)
 *
 * Levanta su propio servidor (puerto 3120, base chloerest_e2elic_licencias, rol de base sin privilegios como
 * producción) y borra todo al terminar.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { abrirBase, levantarEntorno, pausa } from './lib/entorno-prueba.mjs';
import { compilarBundleSinPin } from './lib/bundle-pin-prueba.ts';
import { SQL_UNIFICAR_CONFIGURACION_SISTEMA } from '../src/db/migrations.ts';

const resultados = [];
const ok = (nombre, cond, extra = '') => { resultados.push({ nombre, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${nombre}${extra ? '  → ' + extra : ''}`); };
const recortar = (v) => JSON.stringify(v).slice(0, 220);

async function principal() {
  const bundle = await compilarBundleSinPin('bundle-pruebas.cjs');
  const e = await levantarEntorno({
    bundle, puerto: 3120, baseDatos: 'chloerest_e2elic_licencias', dirLogs: path.join(os.tmpdir(), 'chloe-e2e-licencias'),
    avisar: (m) => console.log(`· ${m}`),
  });
  let bd = null;
  try {
    const { servidor: C, env, licencia: A } = e;
    bd = await abrirBase(env, e.baseDatos);
    const TD = e.tokenDueno; // propietario
    const dueno = (m, r, b) => C.api(m, r, { token: TD, body: b });
    const lista = async () => { const r = (await dueno('GET', '/api/dueno/licencias')).body; return Array.isArray(r) ? r : r.licencias || []; };
    const loginRaw = (pin, dispositivo) => C.api('POST', '/api/login/camarero', { body: { pin, deviceId: dispositivo } });
    const loginWeb = async (pin, dispositivo) => (await loginRaw(pin, dispositivo)).body.token;
    const web = (token, dispositivo) => (m, r, b) => C.api(m, r, { token, dispositivo, body: b });
    const nuevaLicencia = async () => {
      const c = (await dueno('POST', '/api/dueno/generar-clave', { duracion: '12M' })).body;
      const fila = (await lista()).find((l) => Number(l.empresa_id) === Number(c.empresaId));
      return { clave: c.clave, pin: c.pinInicial, empresaId: c.empresaId, id: fila.id, fila };
    };
    const activar = (lic, id) => C.api('POST', '/api/dispositivo/activar', { body: { deviceId: id, clave: lic.clave } });

    // ═════════════════════ 1 · CUPO POR DEFECTO Y EL RESCATE ═════════════════════
    console.log('\n== 1. Cupo por licencia y reactivación ==');
    const B = await nuevaLicencia();
    ok('una licencia nueva nace con cupo de 2 equipos', Number(B.fila.max_dispositivos) === 2, recortar({ cupo: B.fila.max_dispositivos }));

    const a1 = await activar(B, 'cupo-b-equipo-01');
    const a2 = await activar(B, 'cupo-b-equipo-02');
    ok('los 2 primeros equipos se activan con la clave', a1.status === 200 && a2.status === 200, `${a1.status}/${a2.status}`);
    const a3 = await activar(B, 'cupo-b-equipo-03');
    ok('el tercero se rechaza con 403 CUPO_DISPOSITIVOS', a3.status === 403 && a3.body.code === 'CUPO_DISPOSITIVOS', recortar(a3.body));
    ok('volver a activar un equipo que ya está activo no gasta otro lugar (200 con la licencia llena)', (await activar(B, 'cupo-b-equipo-01')).status === 200);

    const TB = await loginWeb(B.pin, 'cupo-b-equipo-01');
    ok('el Administrador de la licencia entra con su PIN inicial', !!TB);
    const webB = web(TB, 'cupo-b-equipo-01');
    const equipos = async (consulta = webB) => ((await consulta('GET', '/api/dispositivos')).body.dispositivos || []);
    const idDe = async (deviceId) => (await equipos()).find((d) => d.device_id === deviceId)?.id;
    const id2 = await idDe('cupo-b-equipo-02');

    // El rescate: desactivar uno, activar otro con la clave y reactivar el primero pasaba del límite.
    ok('el Administrador desactiva un equipo', (await webB('POST', `/api/dispositivos/${id2}/estado`, { estado: 'Inactivo' })).status === 200);
    ok('un equipo desactivado ya no puede iniciar sesión', (await loginRaw(B.pin, 'cupo-b-equipo-02')).status >= 400);
    const a3b = await activar(B, 'cupo-b-equipo-03');
    ok('con un espacio libre, un tercer equipo nuevo sí se activa', a3b.status === 200, `${a3b.status}`);
    const reactivar = await webB('POST', `/api/dispositivos/${id2}/estado`, { estado: 'Activo' });
    ok('reactivar el equipo desactivado respeta el cupo (403, ya no se salta el límite)', reactivar.status === 403 && reactivar.body.code === 'CUPO_DISPOSITIVOS', recortar(reactivar.body));
    const activosB = async () => (await equipos()).filter((d) => d.estado === 'Activo').length;
    ok('quedan exactamente 2 equipos activos', (await activosB()) === 2);

    const filasB = (await lista()).filter((l) => Number(l.empresa_id) === Number(B.empresaId));
    ok('una licencia con varios equipos aparece UNA sola vez en el panel del propietario', filasB.length === 1 && Number(filasB[0].dispositivos_activos) === 2, recortar({ filas: filasB.length, activos: filasB[0]?.dispositivos_activos }));
    ok('activar equipos no duplica la configuración de la empresa', (await bd.query('SELECT COUNT(*)::int AS n FROM configuracion_sistema WHERE empresa_id = $1', [B.empresaId])).rows[0].n === 1);

    // ═════════════════════ 2 · EL PROPIETARIO AMPLÍA EL CUPO ═════════════════════
    console.log('\n== 2. El propietario cambia el cupo de una licencia ya en uso ==');
    const sinMotivo = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 3 });
    ok('no se puede cambiar el cupo sin motivo (400)', sinMotivo.status === 400 && sinMotivo.body.code === 'CUPO_MOTIVO', recortar(sinMotivo.body));
    for (const malo of [0, 51, 2.5, 'tres', null]) {
      const r = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: malo, motivo: 'prueba' });
      ok(`cupo inválido (${malo}) → 400`, r.status === 400, `${r.status}`);
    }
    const admin403 = await webB('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 9, motivo: 'intento del administrador' });
    ok('un Administrador no puede cambiar el cupo (401/403)', [401, 403].includes(admin403.status), `${admin403.status}`);
    ok('sin sesión tampoco (401)', (await C.api('PUT', `/api/dueno/licencias/${B.id}/cupo`, { body: { max_dispositivos: 9, motivo: 'x' } })).status === 401);

    const ampliar = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 3, motivo: 'El cliente abrió una segunda caja' });
    ok('el propietario amplía el cupo a 3 con motivo, con la licencia YA en uso', ampliar.status === 200 && ampliar.body.maxDispositivos === 3, recortar(ampliar.body));
    ok('el equipo desactivado ya se puede reactivar (3 de 3)', (await webB('POST', `/api/dispositivos/${id2}/estado`, { estado: 'Activo' })).status === 200 && (await activosB()) === 3);
    ok('y puede volver a iniciar sesión', (await loginRaw(B.pin, 'cupo-b-equipo-02')).status === 200);
    ok('con 3 activos y cupo 3, el cuarto se rechaza', (await activar(B, 'cupo-b-equipo-04')).status === 403);

    const panelAdmin = (await webB('GET', '/api/dispositivos')).body;
    ok('el Administrador ve el cupo real de su licencia (limiteMaximo = 3)', panelAdmin.limiteMaximo === 3, `${panelAdmin.limiteMaximo}`);
    const claveAdmin = (panelAdmin.dispositivos || []).map((d) => d.clave_activacion).filter(Boolean);
    ok('al Administrador la clave se le muestra enmascarada, nunca completa', claveAdmin.length > 0 && claveAdmin.every((c) => c.includes('•') && !c.includes(B.clave.split('-')[2])), recortar(claveAdmin[0]));
    ok('el propietario sí ve la clave completa', ((await dueno('GET', '/api/dispositivos')).body.dispositivos || []).some((d) => d.clave_activacion === B.clave));

    // Reducir por debajo del uso exige elegir qué equipos desactivar (nunca a escondidas).
    const reducirSinElegir = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 1, motivo: 'Reducción de plan' });
    ok('bajar el cupo por debajo de lo activo sin elegir equipos → 409 CUPO_POR_DEBAJO_DE_USO', reducirSinElegir.status === 409 && reducirSinElegir.body.code === 'CUPO_POR_DEBAJO_DE_USO', recortar(reducirSinElegir.body));
    ok('y no se desactivó nada a escondidas', (await activosB()) === 3);
    const id3 = await idDe('cupo-b-equipo-03');
    const reducir = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 1, motivo: 'Reducción de plan', desactivar: [id2, id3] });
    ok('eligiendo qué equipos desactivar, el cupo baja a 1 en la misma operación', reducir.status === 200 && (await activosB()) === 1 && (reducir.body.desactivados || []).length === 2, recortar(reducir.body));
    const ajenos = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 1, motivo: 'otro intento', desactivar: [999999] });
    ok('no se puede "desactivar" un equipo que no es de esta licencia (400)', ajenos.status === 400, `${ajenos.status}`);
    const sinCambios = await dueno('PUT', `/api/dueno/licencias/${B.id}/cupo`, { max_dispositivos: 1, motivo: 'repetido' });
    ok('repetir el mismo valor se rechaza (400 CUPO_SIN_CAMBIOS)', sinCambios.status === 400 && sinCambios.body.code === 'CUPO_SIN_CAMBIOS', recortar(sinCambios.body));

    const historial = (await dueno('GET', `/api/dueno/licencias/${B.id}/historial`)).body.historial || [];
    const cupos = historial.filter((h) => h.campo === 'max_dispositivos');
    ok('el historial registra cada cambio con valor anterior, nuevo, motivo y actor', cupos.length === 2 && cupos.every((h) => h.motivo && h.actor && h.valor_anterior !== null && h.valor_nuevo !== null) && historial.filter((h) => h.campo === 'dispositivo_desactivado').length === 2, recortar(cupos.map((h) => `${h.valor_anterior}→${h.valor_nuevo}: ${h.motivo}`)));
    ok('cada cambio de cupo queda en la auditoría', (await bd.query("SELECT COUNT(*)::int AS n FROM auditoria_operaciones WHERE accion = 'LICENCIA_CAMBIO_CUPO'")).rows[0].n >= 2);

    // ═════════════════════ 3 · UN CLIENTE QUE NECESITA MÁS DE 2 EQUIPOS ═════════════════════
    console.log('\n== 3. Un cliente con más de 2 equipos en una misma licencia ==');
    const D = await nuevaLicencia();
    const nombres = ['caja-principal', 'caja-barra', 'tablet-salon', 'kds-cocina', 'kds-bar'];
    ok('con el cupo de fábrica (2) un cliente de 5 equipos no cabe', (await activar(D, `lic-d-${nombres[0]}`)).status === 200 && (await activar(D, `lic-d-${nombres[1]}`)).status === 200 && (await activar(D, `lic-d-${nombres[2]}`)).status === 403);
    const subir = await dueno('PUT', `/api/dueno/licencias/${D.id}/cupo`, { max_dispositivos: 5, motivo: 'Restaurante con 2 cajas, tablet de salón y 2 pantallas de cocina' });
    ok('el propietario sube ESA licencia a 5 equipos', subir.status === 200 && subir.body.maxDispositivos === 5);
    const resto = await Promise.all(nombres.slice(2).map((n) => activar(D, `lic-d-${n}`)));
    ok('se activan los 3 equipos restantes con la misma clave', resto.every((r) => r.status === 200), resto.map((r) => r.status).join(','));
    const sexto = await activar(D, 'lic-d-oficina');
    ok('el sexto se rechaza: el cupo manda (5 de 5)', sexto.status === 403 && sexto.body.code === 'CUPO_DISPOSITIVOS', `${sexto.status}`);
    const entradas = await Promise.all(nombres.map((n) => loginRaw(D.pin, `lic-d-${n}`)));
    ok('los 5 equipos pueden iniciar sesión (la activación es real, no solo un registro)', entradas.every((r) => r.status === 200), entradas.map((r) => r.status).join(','));
    ok('un equipo no activado (el sexto) no puede iniciar sesión', (await loginRaw(D.pin, 'lic-d-oficina')).status >= 400);

    const TDa = await loginWeb(D.pin, 'lic-d-caja-principal');
    const webD = web(TDa, 'lic-d-caja-principal');
    const panelD = (await webD('GET', '/api/dispositivos')).body;
    ok('el Administrador ve "5 de 5" y sus 5 equipos', panelD.limiteMaximo === 5 && (panelD.dispositivos || []).filter((d) => d.estado === 'Activo').length === 5, recortar({ limite: panelD.limiteMaximo, activos: (panelD.dispositivos || []).filter((d) => d.estado === 'Activo').length }));

    // El cupo es POR LICENCIA: la licencia B (1) y la A (2) no se ven afectadas por la D (5).
    const filaA = (await lista()).find((l) => Number(l.id) === Number(A.id));
    ok('el cupo es por licencia: la de prueba sigue en 2 mientras la otra tiene 5', Number(filaA.max_dispositivos) === 2 && (await lista()).find((l) => Number(l.id) === Number(D.id)).max_dispositivos === 5);
    const intruso = await activar(A, 'prueba-extra-0002');
    const intruso2 = await activar(A, 'prueba-extra-0003');
    ok('y en la licencia de 2, el tercer equipo sigue rechazado', intruso.status === 200 && intruso2.status === 403, `${intruso.status}/${intruso2.status}`);
    const mover = await activar(A, 'lic-d-caja-barra');
    const sigueEnD = (await bd.query("SELECT empresa_id, estado FROM dispositivos WHERE device_id = 'lic-d-caja-barra'")).rows[0];
    ok('un equipo de la licencia D no se "cuela" en la A cuando está llena (403) y sigue en la D', mover.status === 403 && Number(sigueEnD.empresa_id) === Number(D.empresaId) && sigueEnD.estado === 'Activo', recortar({ s: mover.status, e: sigueEnD }));

    // Eliminar un equipo libera su lugar.
    const idKdsBar = (await equiposDe(webD)).find((d) => d.device_id === 'lic-d-kds-bar')?.id;
    ok('eliminar un equipo libera su lugar', (await webD('DELETE', `/api/dispositivos/${idKdsBar}`)).status === 200 && (await activar(D, 'lic-d-oficina')).status === 200);

    // ═════════════════════ 4 · CARRERAS ═════════════════════
    console.log('\n== 4. Activaciones simultáneas ==');
    const carreraLic = await nuevaLicencia();
    await dueno('PUT', `/api/dueno/licencias/${carreraLic.id}/cupo`, { max_dispositivos: 4, motivo: 'Prueba de concurrencia' });
    await activar(carreraLic, 'carrera-previo-01');
    await activar(carreraLic, 'carrera-previo-02');
    await activar(carreraLic, 'carrera-previo-03');
    const carrera = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => activar(carreraLic, `carrera-${s}-01`)));
    ok('6 activaciones simultáneas con 1 espacio libre: exactamente 1 entra', carrera.filter((r) => r.status === 200).length === 1 && carrera.filter((r) => r.status === 403).length === 5, carrera.map((r) => r.status).join(','));
    ok('el conteo final nunca supera el cupo', (await bd.query("SELECT COUNT(*)::int AS n FROM dispositivos WHERE empresa_id = $1 AND estado = 'Activo'", [carreraLic.empresaId])).rows[0].n === 4);

    // ═════════════════════ 5 · RLS REAL ═════════════════════
    console.log('\n== 5. Aislamiento por RLS (rol sin privilegios) ==');
    ok('el servidor corre con un rol sin privilegios (RLS efectivo)', (await bd.query('SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND usename = $1', [e.rolApp.usuario])).rows[0].n > 0);
    const probe = new pg.Client({ host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), user: e.rolApp.usuario, password: e.rolApp.clave, database: e.baseDatos });
    await probe.connect();
    const como = async (empresaId, consulta, plataforma = false) => {
      await probe.query('BEGIN');
      try {
        await probe.query("SELECT set_config('app.platform', $1, true), set_config('app.empresa_id', $2, true)", [plataforma ? 'true' : 'false', String(empresaId)]);
        return (await probe.query(consulta)).rows;
      } finally { await probe.query('ROLLBACK'); }
    };
    try {
      ok('una empresa no ve los equipos de otra', (await como(B.empresaId, 'SELECT DISTINCT empresa_id FROM dispositivos')).every((f) => Number(f.empresa_id) === Number(B.empresaId)));
      ok('el historial de cupos (licencia_cambios) es invisible para una empresa y visible con contexto de plataforma', (await como(B.empresaId, 'SELECT 1 FROM licencia_cambios')).length === 0 && (await como(B.empresaId, 'SELECT 1 FROM licencia_cambios', true)).length > 0);
      let rechazado = false;
      await probe.query('BEGIN');
      try {
        await probe.query("SELECT set_config('app.platform', 'false', true), set_config('app.empresa_id', $1, true)", [String(B.empresaId)]);
        await probe.query("INSERT INTO licencia_cambios (licencia_id, empresa_id, campo, motivo) VALUES ($1, $2, 'max_dispositivos', 'intento')", [B.id, B.empresaId]);
      } catch { rechazado = true; } finally { await probe.query('ROLLBACK'); }
      ok('una empresa no puede escribir en el historial de cupos', rechazado);
    } finally { await probe.end(); }

    // ═════════════════════ 6 · LA LICENCIA SE VERIFICA EN CADA ACCESO ═════════════════════
    console.log('\n== 6. Una sesión abierta pierde el acceso si deja de haber licencia ==');
    const E = await nuevaLicencia();
    await activar(E, 'gate-equipo-01');
    await activar(E, 'gate-equipo-02');
    const entrarE = async (dispositivo) => (await loginRaw(E.pin, dispositivo)).body.token;
    const TE1 = await entrarE('gate-equipo-01');
    const TE2 = await entrarE('gate-equipo-02');
    const pedirE = (token, dispositivo, ruta = '/api/dispositivos') => C.api('GET', ruta, { token, dispositivo });
    ok('con la licencia vigente la sesión funciona', (await pedirE(TE1, 'gate-equipo-01')).status === 200);
    const verificar = async (dispositivo) => (await C.api('GET', '/api/licencia/verificar', { dispositivo })).body;
    const pantallaInicial = await verificar('gate-equipo-01');
    ok('la pantalla de licencia informa el vencimiento del equipo activo (no bloqueado)', pantallaInicial.bloqueado === false && pantallaInicial.diasRestantes > 300 && !!pantallaInicial.venceEn, recortar(pantallaInicial));
    ok('un equipo sin activar no figura como bloqueado: va a la activación', (await verificar('equipo-que-nunca-se-activo')).bloqueado === false && (await verificar('equipo-que-nunca-se-activo')).esNuevo === true);

    // La antigua cuenta "meses desde la instalación" (negocio_config) ya no manda: renovar con una clave nueva no la
    // reiniciaba y bloqueaba licencias en regla, y el servidor nunca la aplicó.
    await bd.query("UPDATE negocio_config SET duracion_meses = 1, fecha_instalacion = NOW() - interval '400 days' WHERE empresa_id = $1", [E.empresaId]);
    const conReglaVieja = await verificar('gate-equipo-01');
    ok('una licencia vigente no se bloquea por la cuenta antigua de antigüedad (que ya no se usa)', conReglaVieja.bloqueado === false && (await pedirE(TE1, 'gate-equipo-01')).status === 200, recortar(conReglaVieja));


    await bd.query("UPDATE licencias SET vencimiento = NOW() - interval '1 day' WHERE id = $1", [E.id]);
    await pausa(1400);
    const vencida = await pedirE(TE1, 'gate-equipo-01');
    ok('la licencia vence con la sesión abierta → 403 LICENCIA_VENCIDA en la siguiente petición', vencida.status === 403 && vencida.body.code === 'LICENCIA_VENCIDA', recortar(vencida.body));
    const pantallaVencida = await verificar('gate-equipo-01');
    ok('y la pantalla de licencia lo muestra igual que el servidor (bloqueado, LICENCIA_VENCIDA)', pantallaVencida.bloqueado === true && pantallaVencida.codigo === 'LICENCIA_VENCIDA' && /vencido/i.test(pantallaVencida.motivo), recortar(pantallaVencida));
    ok('el resto de los equipos de esa licencia también', (await pedirE(TE2, 'gate-equipo-02', '/api/productos')).status === 403);
    const loginVencida = await loginRaw(E.pin, 'gate-equipo-01');
    ok('y no se puede iniciar sesión nueva (403 LICENCIA_VENCIDA)', loginVencida.status === 403 && loginVencida.body.code === 'LICENCIA_VENCIDA', recortar(loginVencida.body));
    ok('cerrar la sesión sí se puede aunque no haya licencia', (await C.api('POST', '/api/logout', { token: TE2, dispositivo: 'gate-equipo-02' })).status === 200);
    await bd.query('UPDATE licencias SET vencimiento = NULL WHERE id = $1', [E.id]);
    await pausa(1400);
    ok('al renovar la licencia, la sesión vuelve a funcionar sola', (await pedirE(TE1, 'gate-equipo-01')).status === 200);
    const TE2b = await entrarE('gate-equipo-02');
    ok('y el otro equipo puede entrar de nuevo', !!TE2b);

    const idEq1 = ((await dueno('GET', '/api/dispositivos')).body.dispositivos || []).find((d) => d.device_id === 'gate-equipo-01')?.id;
    await dueno('POST', `/api/dispositivos/${idEq1}/estado`, { estado: 'Inactivo' });
    const desactivado = await pedirE(TE1, 'gate-equipo-01');
    ok('desactivar un equipo corta su sesión al instante (403 DISPOSITIVO_NO_ACTIVADO)', desactivado.status === 403 && desactivado.body.code === 'DISPOSITIVO_NO_ACTIVADO', recortar(desactivado.body));
    ok('sin afectar a los demás equipos de la licencia', (await pedirE(TE2b, 'gate-equipo-02')).status === 200);
    await dueno('POST', `/api/dispositivos/${idEq1}/estado`, { estado: 'Activo' });
    ok('al reactivarlo, su sesión sigue valiendo', (await pedirE(TE1, 'gate-equipo-01')).status === 200);

    await bd.query('DELETE FROM licencias WHERE id = $1', [E.id]);
    await pausa(1400);
    const borrada = await pedirE(TE1, 'gate-equipo-01');
    ok('si la licencia con la que se activó el equipo desaparece, el equipo "Activo" ya no basta (403 LICENCIA_REQUERIDA)', borrada.status === 403 && borrada.body.code === 'LICENCIA_REQUERIDA', recortar(borrada.body));
    ok('tampoco entra nadie nuevo', (await loginRaw(E.pin, 'gate-equipo-02')).status === 403);

    const F = await nuevaLicencia();
    await activar(F, 'gate-rev-01');
    const TF = (await loginRaw(F.pin, 'gate-rev-01')).body.token;
    await dueno('POST', `/api/dueno/licencias/${F.id}/revocar`, { motivo: 'prueba' });
    ok('revocar una licencia cierra sus sesiones y bloquea el acceso (401 / sin acceso)', (await pedirE(TF, 'gate-rev-01')).status === 401 && (await loginRaw(F.pin, 'gate-rev-01')).status !== 200);

    // Los flujos en tiempo real (cocina, mesas) se abren con un ticket y no vuelven a pasar por la verificación de cada
    // petición: el servidor los vigila y los cierra cuando el equipo pierde la licencia.
    const G = await nuevaLicencia();
    await activar(G, 'gate-sse-01');
    const TG = (await loginRaw(G.pin, 'gate-sse-01')).body.token;
    const pedirTicket = () => C.api('POST', '/api/sse/ticket', { token: TG, dispositivo: 'gate-sse-01' });
    const ticket = (await pedirTicket()).body.ticket;
    const flujo = abrirFlujo(C.puerto, `/api/kds/stream?ticket=${ticket}`);
    await pausa(900);
    ok('el flujo en tiempo real se abre con la licencia vigente y se mantiene abierto', flujo.texto().includes(': connected') && !flujo.cerrado());
    await pausa(2200);
    ok('y sigue abierto pasados varios ciclos de vigilancia', !flujo.cerrado());
    await bd.query("UPDATE licencias SET vencimiento = NOW() - interval '1 day' WHERE id = $1", [G.id]);
    let cierre = false;
    for (let i = 0; i < 40 && !cierre; i += 1) { await pausa(250); cierre = flujo.cerrado(); }
    ok('al perder la licencia con el flujo abierto, el servidor le avisa (evento "licencia") y lo cierra', cierre && flujo.texto().includes('event: licencia') && flujo.texto().includes('LICENCIA_VENCIDA'), recortar(flujo.texto().slice(-160)));
    const ticketNuevo = await pedirTicket();
    ok('y no se entregan tickets nuevos (403)', ticketNuevo.status === 403 && ticketNuevo.body.code === 'LICENCIA_VENCIDA', `${ticketNuevo.status}`);

    // ═════════════════════ 7 · UNA CONFIGURACIÓN POR EMPRESA ═════════════════════
    console.log('\n== 7. Filas repetidas de configuración (defecto de versiones anteriores) ==');
    ok('la base tiene el índice único de configuración por empresa', (await bd.query("SELECT 1 FROM pg_indexes WHERE indexname = 'uq_configuracion_sistema_empresa'")).rowCount === 1);
    let duplicado = false;
    try { await bd.query('INSERT INTO configuracion_sistema (empresa_id, setup_completado) VALUES (1, FALSE)'); } catch { duplicado = true; }
    ok('y ya no se puede crear una segunda fila para la misma empresa', duplicado);
    await bd.query('BEGIN');
    try {
      await bd.query('DROP INDEX IF EXISTS uq_configuracion_sistema_empresa');
      await bd.query("INSERT INTO configuracion_sistema (empresa_id, setup_completado, nombre_negocio, actualizado_en) VALUES (1, TRUE, 'duplicada de la raíz', NOW() + interval '1 minute')");
      await bd.query(
        "INSERT INTO configuracion_sistema (empresa_id, setup_completado, nombre_negocio, actualizado_en) VALUES ($1, FALSE, 'copia vieja', NOW() - interval '2 days'), ($1, TRUE, 'la configurada', NOW()), ($1, FALSE, 'copia en blanco', NOW() - interval '1 day')",
        [B.empresaId]
      );
      await bd.query(SQL_UNIFICAR_CONFIGURACION_SISTEMA);
      const filas4 = (await bd.query('SELECT nombre_negocio FROM configuracion_sistema WHERE empresa_id = $1', [B.empresaId])).rows;
      const filas1 = (await bd.query('SELECT id FROM configuracion_sistema WHERE empresa_id = 1')).rows;
      ok('la unificación deja UNA fila por empresa y conserva la configurada más recientemente', filas4.length === 1 && filas4[0].nombre_negocio === 'la configurada', recortar(filas4));
      ok('en la empresa raíz conserva SIEMPRE la fila 1 (guarda el PIN y las sesiones del propietario)', filas1.length === 1 && Number(filas1[0].id) === 1, recortar(filas1));
    } finally { await bd.query('ROLLBACK'); }

    // ═════════════════════ 8 · SISTEMA BORRADO: SIN LICENCIA NO ENTRA NADIE ═════════════════════
    console.log('\n== 8. Sistema borrado completamente ==');
    const hashPin = (pin) => { const sal = 'salgate'; return `scrypt$${sal}$${crypto.scryptSync(pin, sal, 64).toString('base64url')}`; };
    const PIN_RAIZ = '482913';
    const licenciasRaiz = (await bd.query('SELECT COUNT(*)::int AS n FROM licencias WHERE empresa_id = 1')).rows[0].n;
    if (licenciasRaiz === 0) {
      await bd.query("INSERT INTO licencias (empresa_id, clave_hash, duracion_codigo, activa) VALUES (1, $1, 'L', TRUE)", [crypto.createHash('sha256').update(e.claveMaestra).digest('hex')]);
    }
    await bd.query("UPDATE usuarios SET pin_hash = $1, requiere_cambio_pin = FALSE WHERE empresa_id = 1 AND rol = 'Administrador'", [hashPin(PIN_RAIZ)]);
    const raiz = await loginRaw(PIN_RAIZ, 'gate-raiz-sin-activar');
    ok('el Administrador de la empresa raíz entra desde un equipo sin activar SOLO porque la raíz tiene licencia vigente', raiz.status === 200, `${raiz.status}`);
    ok('y su sesión funciona', (await C.api('GET', '/api/productos', { token: raiz.body.token, dispositivo: 'gate-raiz-sin-activar' })).status === 200);

    await bd.query('DELETE FROM licencias WHERE empresa_id = 1');
    await pausa(1400);
    const sinLicenciaRaiz = await C.api('GET', '/api/productos', { token: raiz.body.token, dispositivo: 'gate-raiz-sin-activar' });
    ok('si desaparece la licencia de la raíz, esa sesión se queda sin acceso (403)', sinLicenciaRaiz.status === 403, `${sinLicenciaRaiz.status} ${sinLicenciaRaiz.body.code}`);
    const entrarSinLicencia = await loginRaw(PIN_RAIZ, 'gate-raiz-sin-activar');
    ok('y el Administrador raíz ya no puede iniciar sesión (403 DISPOSITIVO_NO_ACTIVADO)', entrarSinLicencia.status === 403 && entrarSinLicencia.body.code === 'DISPOSITIVO_NO_ACTIVADO', recortar(entrarSinLicencia.body));

    // El borrado completo (TRUNCATE … RESTART IDENTITY) exige ser dueño de las tablas y secuencias: el rol de producción
    // no puede hacerlo (a propósito) y la app de escritorio corre como superusuario. Para esta prueba se reinicia así.
    ok('el rol de producción NO puede borrar el sistema completo (500 por permisos)', (await dueno('POST', '/api/dueno/reset-pruebas', { confirmacion: 'BORRAR PRUEBAS' })).status === 500);
    C.detener();
    await pausa(900);
    C.extraEnv = { ...C.extraEnv, DB_USER: env.DB_USER || 'postgres', DB_PASSWORD: env.DB_PASSWORD };
    await C.iniciar(env);
    const tokenDuenoAntes = e.tokenDueno;
    const borrado = await dueno('POST', '/api/dueno/reset-pruebas', { confirmacion: 'BORRAR PRUEBAS' });
    ok('borrado completo del sistema', borrado.status === 200, `${borrado.status}`);
    ok('las sesiones de personal anteriores no sirven (401)', (await pedirE(TE1, 'gate-equipo-01')).status === 401);
    ok('el token del propietario anterior tampoco: el borrado cierra también esa sesión (401)', (await C.api('GET', '/api/dueno/resumen', { token: tokenDuenoAntes })).status === 401);

    await bd.query("INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, estado) VALUES (1, 'Administrador del asistente', 'Administrador', NULL, $1, 'Activo')", [hashPin(PIN_RAIZ)]);
    const trasBorrado = await loginRaw(PIN_RAIZ, 'gate-nuevo-01');
    ok('tras el borrado, el administrador creado por el asistente NO entra sin licencia (403)', trasBorrado.status === 403 && trasBorrado.body.code === 'DISPOSITIVO_NO_ACTIVADO', recortar(trasBorrado.body));

    const duenoNuevo = (await C.api('POST', '/api/dueno/login', { body: { pin: e.credenciales.pinPropietario } })).body.token;
    const nueva = (await C.api('POST', '/api/dueno/generar-clave', { token: duenoNuevo, body: { duracion: '12M' } })).body;
    ok('el propietario genera una licencia nueva', !!nueva.clave);
    const activacion = await C.api('POST', '/api/dispositivo/activar', { body: { deviceId: 'post-borrado-01', clave: nueva.clave } });
    ok('el equipo se activa con esa licencia', activacion.status === 200, `${activacion.status}`);
    const entradaNueva = await loginRaw(nueva.pinInicial, 'post-borrado-01');
    ok('y recién entonces se puede iniciar sesión y trabajar', entradaNueva.status === 200 && (await C.api('GET', '/api/productos', { token: entradaNueva.body.token, dispositivo: 'post-borrado-01' })).status === 200, `${entradaNueva.status}`);

    const conMaestra = await C.api('POST', '/api/dispositivo/activar', { body: { deviceId: 'post-borrado-maestra', clave: e.claveMaestra } });
    ok('la clave maestra del servidor también activa un equipo de la empresa raíz', conMaestra.status === 200, `${conMaestra.status}`);
    const entradaMaestra = await loginRaw(PIN_RAIZ, 'post-borrado-maestra');
    ok('y el Administrador raíz entra desde ese equipo', entradaMaestra.status === 200, `${entradaMaestra.status}`);

    function abrirFlujo(puerto, ruta) {
      let texto = '';
      let cerrado = false;
      const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: 'GET', headers: { Accept: 'text/event-stream' } }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (trozo) => { texto += trozo; });
        res.on('end', () => { cerrado = true; });
        res.on('close', () => { cerrado = true; });
      });
      req.on('error', () => { cerrado = true; });
      req.end();
      return { texto: () => texto, cerrado: () => cerrado, cerrar: () => req.destroy() };
    }

    async function equiposDe(consulta) { return (await consulta('GET', '/api/dispositivos')).body.dispositivos || []; }
  } finally {
    if (bd) await bd.end().catch(() => {});
    await e.limpiar();
  }
}

principal().then(() => {
  const falladas = resultados.filter((r) => !r.pass);
  console.log(`\nResultado: ${resultados.length - falladas.length}/${resultados.length} comprobaciones correctas.`);
  if (falladas.length) { console.log('Fallaron:\n - ' + falladas.map((r) => r.nombre).join('\n - ')); process.exit(1); }
  process.exit(0);
}).catch((error) => { console.error(`\nERROR: ${error.stack || error.message}`); process.exit(1); });
