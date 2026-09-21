import fs from 'node:fs';
import pg from 'pg';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const database = process.env.TEST_DATABASE_NAME || env.DB_NAME || 'chlooggp_chloerest';
const client = new pg.Client({
  host: env.DB_HOST || 'localhost',
  port: Number(env.DB_PORT || 5432),
  database,
  user: env.DB_USER || 'postgres',
  password: env.DB_PASSWORD || undefined,
  connectionTimeoutMillis: 5000,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await client.connect();
try {
  const schema = await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
           EXISTS (SELECT 1 FROM information_schema.columns col
                   WHERE col.table_schema = 'public' AND col.table_name = c.relname
                     AND col.column_name = 'empresa_id') AS tenant_table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const tenantTables = schema.rows.filter((row) => row.tenant_table);
  const missingRls = tenantTables.filter((row) => !row.rls_enabled).map((row) => row.table_name);
  assert(missingRls.length === 0, `tablas multiempresa sin RLS: ${missingRls.join(', ')}`);

  const policies = await client.query(`
    SELECT count(*)::int AS total
      FROM pg_policies
     WHERE schemaname = 'public'
  `);
  assert(policies.rows[0].total > 0, 'no existen políticas RLS en el esquema público');

  const role = await client.query(`
    SELECT current_user, rolsuper, rolbypassrls
      FROM pg_roles
     WHERE rolname = current_user
  `);
  assert(role.rowCount === 1, 'no se pudo identificar el rol de PostgreSQL');
  if (role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
    console.warn(`ADVERTENCIA: el rol ${role.rows[0].current_user} puede saltar RLS; producción debe usar rolsuper=false y rolbypassrls=false.`);
  }

  const context = await client.query(`
    SELECT set_config('app.platform', 'false', true),
           set_config('app.empresa_id', '1', true),
           current_setting('app.empresa_id', true) AS empresa_id,
           current_setting('app.platform', true) AS platform
  `);
  assert(context.rows[0].empresa_id === '1' && context.rows[0].platform === 'false', 'el contexto RLS no se pudo fijar');

  console.log(`DB security OK (${database}): ${tenantTables.length} tablas tenant, ${policies.rows[0].total} políticas RLS, rol=${role.rows[0].current_user}`);
} finally {
  await client.end();
}
