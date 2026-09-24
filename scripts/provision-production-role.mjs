import pg from 'pg';

const env = process.env;
const role = env.APP_DB_ROLE || 'chloerest_app';
const password = env.APP_DB_PASSWORD;
const database = env.DB_NAME;
const adminUser = env.DB_ADMIN_USER || env.DB_USER;
const adminPassword = env.DB_ADMIN_PASSWORD || env.DB_PASSWORD;
const host = env.DB_HOST || 'localhost';
const port = Number(env.DB_PORT || 5432);

function identifier(value, name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(value || ''))) throw new Error(`${name} inválido`);
  return `"${value}"`;
}
function literal(value, name) {
  if (!value || /[\r\n]/.test(String(value))) throw new Error(`${name} es obligatorio`);
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (!database || !password || !adminUser || !adminPassword) throw new Error('Configura DB_NAME, APP_DB_PASSWORD, DB_ADMIN_USER y DB_ADMIN_PASSWORD');
if (role.toLowerCase() === 'postgres') throw new Error('APP_DB_ROLE no puede ser postgres');
if (String(password).length < 32) throw new Error('APP_DB_PASSWORD debe tener al menos 32 caracteres');

const admin = new pg.Client({ user: adminUser, password: adminPassword, host, port, database, connectionTimeoutMillis: 8000 });
await admin.connect();
try {
  const roleId = identifier(role, 'APP_DB_ROLE');
  const dbId = identifier(database, 'DB_NAME');
  const passwordSql = literal(password, 'APP_DB_PASSWORD');
  const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  if (exists.rowCount) {
    await admin.query(`ALTER ROLE ${roleId} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD ${passwordSql}`);
  } else {
    await admin.query(`CREATE ROLE ${roleId} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD ${passwordSql}`);
  }
  await admin.query(`GRANT CONNECT ON DATABASE ${dbId} TO ${roleId}`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${roleId}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleId}`);
  await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${roleId}`);
  await admin.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roleId}`);
  await admin.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${roleId}`);
  const result = await admin.query('SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1', [role]);
  const flags = result.rows[0];
  if (flags.rolsuper || flags.rolbypassrls || flags.rolcreatedb || flags.rolcreaterole) throw new Error(`Rol inseguro después de provisionar: ${JSON.stringify(flags)}`);
  console.log(`Production DB role OK: ${flags.rolname}`);
} finally {
  await admin.end();
}
