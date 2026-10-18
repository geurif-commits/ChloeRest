/**
 * Entorno de prueba de licencias y equipos por licencia, para probar ANTES de aplicarlo a producción.
 * Usa una base de datos propia (chloerest_prueba_licencias); no toca la base real.
 *
 *   npm run entorno:prueba            levanta el servidor de prueba (:3100) con una licencia lista
 *   npm run entorno:prueba:estado     muestra si sigue arriba y cuántos equipos hay en la licencia
 *   npm run entorno:prueba:detener    lo apaga (añade --borrar para eliminar también la base de prueba)
 *
 * Opciones de "iniciar": --sin-build (no recompila bundle-pruebas.cjs), --puerto=N, --pin-incrustado (prueba el PIN fijo del
 * propietario con un PIN de PRUEBA incrustado en una copia del servidor; el código real no se toca).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  RAIZ, abrirBase, borrarBase, borrarRolDePrueba, dirEstadoPrueba, leerEnv, levantarEntorno, matarProceso, procesoVivo,
} from './lib/entorno-prueba.mjs';

const [, , comando = 'iniciar', ...resto] = process.argv;
const opcion = (nombre, porDefecto) => {
  const hallada = resto.find((a) => a.startsWith(`--${nombre}=`));
  return hallada ? hallada.split('=')[1] : porDefecto;
};
const dir = dirEstadoPrueba();
const archivoEstado = path.join(dir, 'estado.json');
const leerEstado = () => (fs.existsSync(archivoEstado) ? JSON.parse(fs.readFileSync(archivoEstado, 'utf8')) : null);

async function salud(url) {
  try { return (await fetch(`${url}/api/health`)).ok; } catch { return false; }
}

async function iniciar() {
  const previo = leerEstado();
  if (previo && procesoVivo(previo.servidor.pid)) {
    console.log('El entorno de prueba ya está en marcha. Usa "npm run entorno:prueba:estado" o deténlo primero.');
    process.exit(1);
  }
  if (!resto.includes('--sin-build')) {
    console.log('Compilando el servidor de pruebas (bundle-pruebas.cjs)…');
    const r = spawnSync('npm', ['run', 'build:server:pruebas'], { cwd: RAIZ, shell: true, stdio: 'inherit' });
    if (r.status !== 0) { console.error('No se pudo compilar el servidor.'); process.exit(1); }
  }
  fs.mkdirSync(dir, { recursive: true });
  const conPinFijo = resto.includes('--pin-incrustado');
  let bundle = 'bundle-pruebas.cjs';
  let pinFijoDePrueba = null;
  if (conPinFijo) {
    const { PIN_INCRUSTADO_DE_PRUEBA, compilarBundleConPinDePrueba } = await import('./lib/bundle-pin-prueba.ts');
    bundle = await compilarBundleConPinDePrueba('bundle-pin-prueba.cjs');
    pinFijoDePrueba = PIN_INCRUSTADO_DE_PRUEBA;
  }
  const entorno = await levantarEntorno({
    puerto: Number(opcion('puerto', 3100)), baseDatos: 'chloerest_prueba_licencias', dirLogs: dir, desacoplado: true, bundle,
    ...(conPinFijo ? { pinEntorno: '246810', pinLogin: pinFijoDePrueba } : {}),
    avisar: (m) => console.log(`· ${m}`),
  });
  fs.writeFileSync(archivoEstado, JSON.stringify({
    iniciadoEn: new Date().toISOString(),
    servidor: { pid: entorno.servidor.pid, url: entorno.servidor.url, baseDatos: entorno.baseDatos, bundle },
    licencia: entorno.licencia,
    credenciales: entorno.credenciales,
  }, null, 2));

  const dist = fs.existsSync(path.join(RAIZ, 'frontend-restaurante', 'dist', 'index.html'));
  console.log(`
════════════════ ENTORNO DE PRUEBA DE LICENCIAS LISTO ════════════════
 (todos son datos de prueba; la base real no se toca; solo escucha en este equipo)

 Servidor de prueba (hace de chloerestaurant.lat)  ${entorno.servidor.url}
   Propietario (/paneldueno) PIN ............ ${entorno.credenciales.pinPropietario}${conPinFijo ? '  (PIN de PRUEBA incrustado; el OWNER_PIN 246810 del entorno NO sirve)' : ''}
   Administrador del negocio de prueba ...... equipo ${entorno.credenciales.dispositivoWeb}, PIN ${entorno.licencia.pinInicial}
   Licencia de prueba (cupo de 2 equipos) ... ${entorno.licencia.clave}

 Cómo probar:
   1. Entra a /paneldueno → Licencias Usadas → botón "Equipos" de la licencia y sube el cupo (con motivo).
   2. Activa equipos nuevos con la clave:  POST /api/dispositivo/activar  { deviceId, clave }
      (o desde otro navegador/tablet con la clave en la pantalla de activación).
   3. Como Administrador (Sistema → Terminales POS) verás "usados / permitidos" y la clave enmascarada.
 Registros: ${dir}
 Apagar: npm run entorno:prueba:detener -- --borrar
${dist ? '' : '\n AVISO: no hay frontend compilado (frontend-restaurante/dist). Solo responderá la API.\n        Compílalo con:  cd frontend-restaurante && npm run build\n'}═══════════════════════════════════════════════════════════════════════
`);
}

async function estado() {
  const e = leerEstado();
  if (!e) { console.log('No hay un entorno de prueba iniciado.'); return; }
  const arriba = await salud(e.servidor.url);
  console.log(`Servidor de prueba ${e.servidor.url}: ${arriba ? 'arriba' : 'apagado'}`);
  if (arriba) {
    const bd = await abrirBase(leerEnv(), e.servidor.baseDatos);
    const r = await bd.query(
      "SELECT (SELECT max_dispositivos FROM licencias WHERE empresa_id = $1) AS cupo, (SELECT COUNT(*)::int FROM dispositivos WHERE empresa_id = $1 AND estado = 'Activo') AS activos, (SELECT COUNT(*)::int FROM licencia_cambios) AS cambios",
      [e.licencia.empresaId]
    );
    await bd.end();
    console.log(`Licencia de prueba: ${r.rows[0].activos} equipo(s) activo(s) de ${r.rows[0].cupo} permitidos; ${r.rows[0].cambios} cambio(s) de cupo en el historial.`);
  }
}

async function detener() {
  const e = leerEstado();
  if (!e) { console.log('No hay un entorno de prueba iniciado.'); return; }
  // Solo se mata un PID si su puerto sigue respondiendo como servidor del POS (evita tocar un PID reutilizado).
  if (procesoVivo(e.servidor.pid) && await salud(e.servidor.url)) matarProceso(e.servidor.pid);
  console.log('Servidor de prueba apagado.');
  if (resto.includes('--borrar')) {
    await new Promise((r) => setTimeout(r, 800));
    await borrarBase(leerEnv(), e.servidor.baseDatos);
    await borrarRolDePrueba(leerEnv());
    fs.rmSync(archivoEstado, { force: true });
    fs.rmSync(path.join(RAIZ, 'bundle-pin-prueba.cjs'), { force: true });
    fs.rmSync(path.join(RAIZ, 'bundle-pruebas.cjs'), { force: true });
    console.log('Base de datos de prueba eliminada.');
  } else {
    console.log('La base de prueba se conserva (añade --borrar para eliminarla).');
  }
}

const acciones = { iniciar, estado, detener };
if (!acciones[comando]) { console.error(`Comando desconocido: ${comando}. Usa: iniciar | estado | detener`); process.exit(2); }
acciones[comando]().then(() => process.exit(0)).catch((error) => { console.error(`ERROR: ${error.message}`); process.exit(1); });
