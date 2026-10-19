/**
 * Aplica las migraciones pendientes y sale (paso de despliegue para producción).
 *
 * En producción el servidor NO migra al arrancar (RUN_MIGRATIONS=0, rol sin DDL), así que cada versión que agrega
 * tablas o columnas necesita este paso con un rol con permisos DDL. Vive en `src/` para que `tsc` lo compile a
 * `dist/migrar.js`: en el servidor solo existe el código compilado (sin `tsx`), y desde ahí se ejecuta con
 *
 *   node dist/migrar.js
 *
 * Toma la conexión de las variables DB_* (o del .env que encuentre hacia arriba desde la carpeta actual); para usar un
 * rol con permisos DDL distinto al de la aplicación, define DB_USER y DB_PASSWORD solo para esa ejecución.
 * En desarrollo (con tsx) el mismo paso es `npm run migrate`.
 *
 * Al terminar, concede al rol de la aplicación acceso a las tablas nuevas (`npm run provision:production-role`, o a mano):
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <rol_app>;
 *   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <rol_app>;
 * y verifica con GET /api/health: el campo "migracion" debe mostrar la última migración del código.
 */
import './lib/env.js';
import { createDatabase, getDatabase } from './db/index.js';
import { runMigrations } from './db/migrations.js';

createDatabase({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  port: Number(process.env.DB_PORT || 5432),
  max: 2,
});

try {
  await runMigrations(getDatabase());
  console.log('Migraciones al día.');
  process.exit(0);
} catch (error) {
  console.error('Error aplicando migraciones:', error instanceof Error ? error.message : error);
  process.exit(1);
}
