import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const database = process.env.TEST_DATABASE_NAME || 'chlooggp_chloerest';
const roleName = 'chloerest_rls_probe';
const password = crypto.randomBytes(18).toString('base64url');
const quoteIdent = (value) => `"${value.replaceAll('"', '""')}"`;
const adminConfig = {
  host: env.DB_HOST || 'localhost',
  port: Number(env.DB_PORT || 5432),
  database,
  user: env.DB_USER || 'postgres',
  password: env.DB_PASSWORD || undefined,
};

const admin = new pg.Client(adminConfig);
let companyId;
let productId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await admin.connect();
try {
  await admin.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${quoteIdent(roleName)}`).catch(() => undefined);
  await admin.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${quoteIdent(roleName)}`).catch(() => undefined);
  await admin.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${quoteIdent(roleName)}`).catch(() => undefined);
  await admin.query(`REVOKE CONNECT ON DATABASE ${quoteIdent(database)} FROM ${quoteIdent(roleName)}`).catch(() => undefined);
  await admin.query(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`);
  await admin.query(`CREATE ROLE ${quoteIdent(roleName)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
  await admin.query(`GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(roleName)}`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(roleName)}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(roleName)}`);
  await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdent(roleName)}`);

  const company = await admin.query(
    "INSERT INTO empresas (nombre, slug, estado) VALUES ($1, $2, 'Activa') RETURNING id",
    ['RLS Probe', `rls-probe-${Date.now()}`]
  );
  companyId = company.rows[0].id;
  const product = await admin.query(
    'INSERT INTO productos (nombre, precio, estado, empresa_id) VALUES ($1, 1, \'Activo\', $2) RETURNING id',
    ['RLS Probe Product', companyId]
  );
  productId = product.rows[0].id;

  const probe = new pg.Client({ ...adminConfig, user: roleName, password });
  await probe.connect();
  try {
    await probe.query('BEGIN');
    await probe.query("SELECT set_config('app.platform', 'false', true), set_config('app.empresa_id', '1', true)");
    const hidden = await probe.query('SELECT id FROM productos WHERE id = $1', [productId]);
    assert(hidden.rowCount === 0, 'RLS permitió ver datos de otra empresa');
    let rejected = false;
    try {
      await probe.query(
        'INSERT INTO productos (nombre, precio, estado, empresa_id) VALUES ($1, 1, \'Activo\', $2)',
        ['RLS Cross Tenant Insert', companyId]
      );
    } catch {
      rejected = true;
    }
    assert(rejected, 'RLS permitió insertar datos en otra empresa');
    await probe.query('ROLLBACK');

    await probe.query('BEGIN');
    await probe.query("SELECT set_config('app.platform', 'false', true), set_config('app.empresa_id', $1, true)", [String(companyId)]);
    const visible = await probe.query('SELECT id FROM productos WHERE id = $1', [productId]);
    assert(visible.rowCount === 1, 'RLS ocultó datos de la empresa autorizada');
    await probe.query('ROLLBACK');
  } finally {
    await probe.end();
  }
  console.log(`RLS runtime OK (${database}): aislamiento de lectura y escritura verificado con rol sin privilegios elevados`);
} finally {
  if (productId) await admin.query('DELETE FROM productos WHERE id = $1', [productId]);
  if (companyId) await admin.query('DELETE FROM empresas WHERE id = $1', [companyId]);
  await admin.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${quoteIdent(roleName)}`);
  await admin.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${quoteIdent(roleName)}`);
  await admin.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${quoteIdent(roleName)}`);
  await admin.query(`REVOKE CONNECT ON DATABASE ${quoteIdent(database)} FROM ${quoteIdent(roleName)}`);
  await admin.query(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`);
  await admin.end();
}
