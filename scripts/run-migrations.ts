/**
 * Aplica las migraciones pendientes y sale (paso de despliegue para producción).
 *
 * En producción el servidor NO migra al arrancar (RUN_MIGRATIONS=0, rol sin DDL), así que cada
 * versión que agrega tablas o columnas necesita este paso con un rol con permisos DDL:
 *
 *   DB_USER=<rol_ddl> DB_PASSWORD=<...> DB_HOST=<...> DB_NAME=<...> npm run migrate
 *
 * Al terminar, concede al rol de la aplicación acceso a las tablas nuevas (si no tiene
 * ALTER DEFAULT PRIVILEGES): GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <rol_app>;
 *                              GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <rol_app>;
 * Verifica con GET /api/health: el campo "migracion" debe mostrar la última (048_turnos_config o posterior).
 */
import '../src/lib/env.js';
import { createDatabase, getDatabase } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrations.js';

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
