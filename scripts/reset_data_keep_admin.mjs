// Reset de datos operativos preservando empresa 1 y administrador.
// Versión TypeScript: usa el backend compilado en dist/ (migración desde db.js/config.js/auth.js legacy).
import { createDatabase, getDatabase } from '../dist/db/index.js';
import { config } from '../dist/lib/config.js';
import { hashPin } from '../dist/services/authService.js';

const preserve = new Set(['app_migrations', 'empresas', 'planes_licencia']);

createDatabase({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  port: Number(process.env.DB_PORT || 5432),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle: false,
});

const db = getDatabase();

try {
  const result = await db.queryUnscoped(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const tables = result.rows
    .map(({ tablename }) => tablename)
    .filter((table) => !preserve.has(table));

  if (tables.length) {
    const quoted = tables.map((table) => `"${table.replace(/"/g, '""')}"`).join(', ');
    await db.queryUnscoped(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  }

  await db.queryUnscoped('DELETE FROM empresas WHERE id <> 1');
  await db.queryUnscoped('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS requiere_cambio_pin BOOLEAN NOT NULL DEFAULT FALSE');
  await db.queryUnscoped('ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS owner_pin_hash VARCHAR(200)');
  await db.queryUnscoped(
    `INSERT INTO configuracion_sistema (id, empresa_id, setup_completado)
     VALUES (1, 1, FALSE) ON CONFLICT (id) DO NOTHING`,
  );
  const owner = await db.queryUnscoped('SELECT owner_pin_hash FROM configuracion_sistema WHERE id = 1');
  const ownerHash = owner.rows[0]?.owner_pin_hash || hashPin(config.ownerPin || config.bootstrapAdminPin || '012011');
  await db.queryUnscoped(
    'UPDATE configuracion_sistema SET owner_pin_hash = $1, owner_pin_longitud = $2 WHERE id = 1',
    [ownerHash, String(config.ownerPin || config.bootstrapAdminPin || '012011').length],
  );
  await db.queryUnscoped(
    `INSERT INTO empresas (id, nombre, slug, estado)
     VALUES (1, 'LEGACY', 'legacy', 'Activa')
     ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, slug = EXCLUDED.slug, estado = EXCLUDED.estado`,
  );
  await db.queryUnscoped(
    `INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, requiere_cambio_pin, estado)
     VALUES (1, 'Administrador Sistema', 'Administrador', NULL, $1, FALSE, 'Activo')`,
    [hashPin(config.bootstrapAdminPin || '012011')],
  );
  console.log('RESET_OK: datos operativos eliminados; empresa LEGACY y administrador preservados.');
} finally {
  await db.end?.();
}
