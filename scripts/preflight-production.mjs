import fs from 'node:fs';
import pg from 'pg';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
}

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'APP_SESSION_SECRET', 'BOOTSTRAP_ADMIN_PIN', 'CORS_ORIGINS'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());
if (process.env.NODE_ENV !== 'production') throw new Error(`NODE_ENV debe ser production (actual: ${process.env.NODE_ENV || 'no definido'})`);
if (!/^\d{6}$/.test(String(process.env.BOOTSTRAP_ADMIN_PIN))) throw new Error('BOOTSTRAP_ADMIN_PIN debe contener exactamente 6 dígitos');
if (String(process.env.APP_SESSION_SECRET).length < 32) throw new Error('APP_SESSION_SECRET debe tener al menos 32 caracteres');
if (String(process.env.DB_USER).toLowerCase() === 'postgres') throw new Error('DB_USER no puede ser postgres; usa un rol de aplicación sin privilegios elevados');
if (missing.length) throw new Error(`variables de producción faltantes: ${missing.join(', ')}`);

const corsOrigins = process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
const insecureCorsOrigins = corsOrigins.filter((origin) => {
  if (origin === 'null' || /localhost|127\.0\.0\.1/i.test(origin)) return true;
  try {
    return new URL(origin).protocol !== 'https:';
  } catch {
    return true;
  }
});
if (insecureCorsOrigins.length) {
  throw new Error(`CORS_ORIGINS inseguro para producciÃ³n: ${insecureCorsOrigins.join(', ')}`);
}

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
});

await client.connect();
try {
  const role = await client.query('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  if (!role.rowCount || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
    throw new Error(`rol PostgreSQL inseguro: ${role.rows[0]?.current_user || process.env.DB_USER}`);
  }
  const tenantTables = await client.query(`
    SELECT count(*)::int AS total
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND EXISTS (
         SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'empresa_id'
       )
  `);
  const protectedTables = await client.query(`
    SELECT count(*)::int AS total
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  `);
  if (protectedTables.rows[0].total < tenantTables.rows[0].total) {
    throw new Error(`RLS incompleto: ${protectedTables.rows[0].total}/${tenantTables.rows[0].total} tablas protegidas`);
  }
  console.log(`Production preflight OK: DB=${process.env.DB_NAME}, rol=${role.rows[0].current_user}, RLS=${tenantTables.rows[0].total}/${protectedTables.rows[0].total}`);
} finally {
  await client.end();
}
