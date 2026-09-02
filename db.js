import pg from 'pg';
import { config } from './config.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const pool = new pg.Pool(config.database);
export const requestContext = new AsyncLocalStorage();

export function getRequestContext() {
  return requestContext.getStore() || { empresaId: null, platform: false };
}

export async function verifyDatabaseRole() {
  const result = await pool.query(
    `SELECT current_user, rolsuper, rolbypassrls
       FROM pg_roles
      WHERE rolname = current_user`,
  );
  const role = result.rows[0];
  if (!role) throw new Error('No se pudo verificar el usuario de PostgreSQL.');
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(`El usuario PostgreSQL ${role.current_user} no puede usarse con multiempresa: requiere rolsuper=false y rolbypassrls=false.`);
  }
  return role;
}

export function runWithRequestContext(context, callback) {
  return requestContext.run({ empresaId: context?.empresaId || null, platform: context?.platform === true }, callback);
}

export async function applyRequestContext(client) {
  const context = getRequestContext();
  await client.query(`SELECT set_config('app.empresa_id', $1, true)`, [context.empresaId ? String(context.empresaId) : '']);
  await client.query(`SELECT set_config('app.platform', $1, true)`, [context.platform ? 'true' : 'false']);
}

// Every normal query gets a transaction-local tenant context. This prevents a
// pooled connection from retaining the previous request's tenant.
async function query(text, values) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyRequestContext(client);
    const result = await client.query(text, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

const db = {
  query,
  connect: async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyRequestContext(client);
      return client;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      client.release();
      throw error;
    }
  },
  connectUnscoped: () => pool.connect(),
  // Identity/bootstrap/platform queries run with an explicit platform flag.
  queryUnscoped: async (text, values) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.empresa_id', '', true)");
      await client.query("SELECT set_config('app.platform', 'true', true)");
      const result = await client.query(text, values);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  },
};

pool.on('error', (error) => {
  console.error('Conexión inesperada de PostgreSQL perdida:', error.message);
});

export default db;
