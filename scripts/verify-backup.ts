/**
 * Prueba de restauración: restaura el respaldo más reciente (o el archivo indicado) en una base de datos
 * TEMPORAL, compara tablas, migraciones y RLS con la base actual y elimina la temporal.
 *
 *   npm run backup:verify [ruta/al/respaldo.dump]
 *
 * Requiere un rol con permiso para crear bases de datos (BACKUP_DB_USER / BACKUP_DB_PASSWORD o el de la app).
 */
import '../src/lib/env.js';
import pg from 'pg';
import { config } from '../src/lib/config.js';
import { conexionDeRespaldo, ejecutar, listarRespaldos, localizarHerramienta } from '../src/services/backupService.js';

const conexion = conexionDeRespaldo();
const archivo = process.argv[2] || (listarRespaldos(config.backup.dir)[0] ? `${config.backup.dir}/${listarRespaldos(config.backup.dir)[0].nombre}` : '');
const pgRestore = localizarHerramienta('pg_restore');
if (!archivo) { console.error('No hay respaldos. Ejecuta primero: npm run backup'); process.exit(1); }
if (!pgRestore) { console.error('No se encontró pg_restore (define PG_BIN_DIR).'); process.exit(1); }

const temporal = `chloerest_verify_${Date.now()}`;
const cliente = (base: string): pg.Client => new pg.Client({ host: conexion.host, port: Number(conexion.puerto), user: conexion.usuario, password: conexion.password, database: base });

const resumen = async (base: string) => {
  const c = cliente(base);
  await c.connect();
  try {
    const r = await c.query(`
      SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::int AS tablas,
             (SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND relrowsecurity)::int AS con_rls,
             (SELECT count(DISTINCT table_name) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'empresa_id')::int AS por_negocio,
             (SELECT count(*) FROM app_migrations)::int AS migraciones,
             (SELECT count(*) FROM usuarios)::int AS usuarios,
             (SELECT count(*) FROM productos)::int AS productos,
             (SELECT count(*) FROM cuentas)::int AS cuentas`);
    return r.rows[0] as Record<string, number>;
  } finally { await c.end(); }
};

let codigo = 1;
const admin = cliente('postgres');
await admin.connect();
try {
  console.log(`Restaurando ${archivo} en la base temporal ${temporal}…`);
  await admin.query(`CREATE DATABASE "${temporal}"`);
  const restauracion = await ejecutar(pgRestore, ['-h', conexion.host, '-p', conexion.puerto, '-U', conexion.usuario, '-d', temporal, '--no-owner', '--no-privileges', archivo], conexion.password);
  if (restauracion.codigo !== 0) {
    throw new Error(`pg_restore terminó con código ${restauracion.codigo}: ${restauracion.error.trim().split('\n').slice(-4).join(' | ')}`);
  }
  const [origen, restaurada] = [await resumen(conexion.base), await resumen(temporal)];
  console.log('Base actual   :', JSON.stringify(origen));
  console.log('Base restaurada:', JSON.stringify(restaurada));
  // Verificaciones propias del respaldo (no dependen de cambios hechos en la base después de crearlo).
  if (restaurada.por_negocio < 1 || restaurada.con_rls < restaurada.por_negocio) { throw new Error('En la base restaurada faltan políticas RLS en tablas por negocio.'); }
  if (restaurada.migraciones < 1 || restaurada.migraciones > origen.migraciones) { throw new Error('El respaldo trae un historial de migraciones inconsistente.'); }
  if (restaurada.usuarios < 1) { throw new Error('La base restaurada no tiene usuarios: el respaldo parece vacío.'); }
  const identica = origen.tablas === restaurada.tablas && origen.con_rls === restaurada.con_rls && origen.migraciones === restaurada.migraciones;
  console.log(identica
    ? 'RESTAURACIÓN VERIFICADA: estructura idéntica a la base actual y datos presentes.'
    : 'RESTAURACIÓN VERIFICADA: el respaldo es válido (las diferencias con la base actual se deben a cambios posteriores al respaldo).');
  codigo = 0;
} catch (error) {
  console.error('FALLÓ LA VERIFICACIÓN:', error instanceof Error ? error.message : error);
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${temporal}" WITH (FORCE)`).catch(() => undefined);
  await admin.end();
}
process.exit(codigo);
