/**
 * Prepara una base de datos VACÍA y ya migrada para la prueba e2e (CI): un equipo activado y 8 mesas libres.
 * El administrador lo crea la migración inicial con BOOTSTRAP_ADMIN_PIN.
 *
 *   DB_HOST=... DB_NAME=... BOOTSTRAP_ADMIN_PIN=123456 npm run migrate
 *   E2E_DEVICE_ID=ci-device-0001 node scripts/seed-e2e.mjs
 */
import pg from 'pg';

const dispositivo = process.env.E2E_DEVICE_ID || 'ci-device-0001';
const c = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME,
});
await c.connect();
try {
  await c.query("SELECT set_config('app.platform', 'true', false), set_config('app.empresa_id', '1', false)");
  await c.query(
    "INSERT INTO dispositivos (device_id, nombre, estado, empresa_id, activado_en) SELECT $1, 'CI', 'Activo', 1, NOW() WHERE NOT EXISTS (SELECT 1 FROM dispositivos WHERE device_id = $1)",
    [dispositivo]
  );
  const mesas = await c.query('SELECT count(*)::int AS n FROM mesas');
  for (let i = mesas.rows[0].n + 1; i <= 8; i += 1) {
    await c.query("INSERT INTO mesas (nombre_numero, capacidad, estado, empresa_id) VALUES ($1, 4, 'Disponible', 1)", [`Mesa ${i}`]);
  }
  console.log(`Equipo ${dispositivo} activado y mesas listas.`);
} finally {
  await c.end();
}
