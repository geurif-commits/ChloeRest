/**
 * Diagnóstico de LICENCIAS (solo lectura): aplica a cada equipo activo y a cada sesión abierta la misma regla que
 * ahora exige el servidor en cada petición, y dice quién se quedaría sin acceso. Córrelo ANTES de desplegar sobre la
 * base de datos de producción para no dejar fuera a un negocio con la licencia en regla pero con datos incompletos.
 *
 *   npm run licencias:diagnostico            (desarrollo, con tsx)
 *   node dist/diagnosticoLicencias.js        (servidor de producción: solo existe el código compilado)
 *
 * Usa la base del .env / de las variables DB_* (en producción puede ser el rol de la aplicación: solo lee).
 *
 * Termina con código 1 si algún equipo activo o sesión vigente quedaría bloqueado.
 */
import './lib/env.js';
import { createDatabase, getDatabase } from './db/index.js';
import { evaluarLicenciaDeAcceso } from './services/licenciaAccesoService.js';

createDatabase({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  port: Number(process.env.DB_PORT || 5432),
  max: 2,
});

interface IEquipo { device_id: string; empresa_id: number | null; nombre: string | null; clave_activacion: string | null }
interface ISesion { device_id: string | null; empresa_id: number | null; total: number }
interface IResumenLicencia { empresa_id: number; total: number; vigentes: number }

async function principal(): Promise<void> {
  const db = getDatabase();
  const equipos = await db.queryUnscoped<IEquipo>("SELECT device_id, empresa_id, nombre, clave_activacion FROM dispositivos WHERE estado = 'Activo' ORDER BY empresa_id, id");
  const sesiones = await db.queryUnscoped<ISesion>(
    'SELECT device_id, empresa_id, COUNT(*)::int AS total FROM app_sessions WHERE expira_en > CURRENT_TIMESTAMP GROUP BY device_id, empresa_id ORDER BY empresa_id'
  );
  const licencias = await db.queryUnscoped<IResumenLicencia>(
    'SELECT empresa_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE activa AND NOT revocada AND (vencimiento IS NULL OR vencimiento > CURRENT_TIMESTAMP))::int AS vigentes FROM licencias GROUP BY empresa_id ORDER BY empresa_id'
  );

  console.log('Licencias por empresa:');
  if (!licencias.rowCount) {console.log('  (ninguna: nadie podrá iniciar sesión hasta activar una licencia)');}
  for (const l of licencias.rows) {console.log(`  empresa ${l.empresa_id}: ${l.vigentes} vigente(s) de ${l.total}`);}

  let bloqueados = 0;
  console.log(`\nEquipos activos (${equipos.rowCount}):`);
  for (const e of equipos.rows) {
    const estado = await evaluarLicenciaDeAcceso({ deviceId: e.device_id, empresaId: e.empresa_id });
    if (!estado.vigente) {bloqueados += 1;}
    console.log(`  ${estado.vigente ? '✔' : '✘'} ${e.device_id}${e.nombre ? ` (${e.nombre})` : ''} · empresa ${e.empresa_id ?? 1} · ${e.clave_activacion ? 'con clave' : 'sin clave'}${estado.vigente ? '' : ` → ${estado.codigo}`}`);
  }

  let sesionesBloqueadas = 0;
  console.log(`\nSesiones abiertas (${sesiones.rows.reduce((suma, s) => suma + s.total, 0)}):`);
  for (const s of sesiones.rows) {
    const estado = await evaluarLicenciaDeAcceso({ deviceId: s.device_id, empresaId: s.empresa_id });
    if (!estado.vigente) {sesionesBloqueadas += s.total;}
    console.log(`  ${estado.vigente ? '✔' : '✘'} ${s.total} sesión(es) · equipo ${s.device_id ?? '(sin equipo)'} · empresa ${s.empresa_id ?? 1}${estado.vigente ? '' : ` → ${estado.codigo}`}`);
  }

  // Informativo: el Administrador de la empresa raíz puede entrar desde un equipo sin activar solo si esa empresa tiene licencia.
  const raiz = await evaluarLicenciaDeAcceso({ deviceId: 'equipo-nuevo-sin-activar', empresaId: 1 });
  console.log(`\nAdministrador de la empresa raíz desde un equipo sin activar: ${raiz.vigente ? '✔ permitido (la empresa raíz tiene una licencia vigente)' : `✘ bloqueado (${raiz.codigo}): primero hay que activar una licencia`}`);

  console.log(`\nResultado: ${bloqueados} equipo(s) y ${sesionesBloqueadas} sesión(es) quedarían SIN acceso.`);
  if (bloqueados || sesionesBloqueadas) {
    console.log('Si alguno es un negocio con licencia en regla, revisa que su equipo tenga la clave con la que se activó y que su licencia esté activa y sin vencer.');
    process.exitCode = 1;
  }
  await db.end();
}

principal().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
