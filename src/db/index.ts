/**
 * @file Pool de PostgreSQL + aislamiento multi-tenant (RLS)
 * Puerto directo de db.js a TypeScript. Cada query normal corre en una
 * transacción que fija app.empresa_id/app.platform vía set_config, para que
 * una conexión del pool nunca retenga el tenant de la petición anterior.
 */

import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('db');

export interface IRequestContext {
  empresaId: number | null;
  platform: boolean;
}

export interface IDatabaseConfig {
  user: string;
  host: string;
  database: string;
  password?: string;
  port: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  allowExitOnIdle?: boolean;
}

export const requestContext = new AsyncLocalStorage<IRequestContext>();

export function getRequestContext(): IRequestContext {
  return requestContext.getStore() || { empresaId: null, platform: false };
}

export function runWithRequestContext<T>(context: Partial<IRequestContext> | undefined, callback: () => T): T {
  return requestContext.run(
    { empresaId: context?.empresaId ?? null, platform: context?.platform === true },
    callback
  );
}

export class Database {
  private pool: pg.Pool;

  constructor(config: IDatabaseConfig) {
    this.pool = new pg.Pool(config);
    this.pool.on('error', (error: Error) => {
      logger.error({
        action: 'DB_POOL_ERROR',
        error: { message: error.message, stack: error.stack },
      });
    });
  }

  private async applyRequestContext(client: pg.PoolClient): Promise<void> {
    const context = getRequestContext();
    await client.query(`SELECT set_config('app.empresa_id', $1, true)`, [
      context.empresaId ? String(context.empresaId) : '',
    ]);
    await client.query(`SELECT set_config('app.platform', $1, true)`, [context.platform ? 'true' : 'false']);
  }

  /** Query aislada por tenant (empresa_id/platform del contexto de la petición). */
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.applyRequestContext(client);
      const result = await client.query<T>(text, values);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Query sin aislamiento de tenant (identidad/bootstrap/plataforma). */
  async queryUnscoped<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.empresa_id', '', true)");
      await client.query("SELECT set_config('app.platform', 'true', true)");
      const result = await client.query<T>(text, values);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Cliente con BEGIN + contexto de tenant ya aplicado, para transacciones manuales. */
  async connect(): Promise<pg.PoolClient> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.applyRequestContext(client);
      return client;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      throw error;
    }
  }

  connectUnscoped(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }

  /** Ejecuta callback dentro de una transacción con contexto de tenant y COMMIT/ROLLBACK automático. */
  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.connect();
    try {
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyDatabaseRole(): Promise<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }> {
    const result = await this.pool.query(
      `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    );
    const role = result.rows[0];
    if (!role) {throw new Error('No se pudo verificar el usuario de PostgreSQL.');}
    if (role.rolsuper || role.rolbypassrls) {
      throw new Error(
        `El usuario PostgreSQL ${role.current_user} no puede usarse con multiempresa: requiere rolsuper=false y rolbypassrls=false.`
      );
    }
    return role;
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

let dbInstance: Database | null = null;

export function createDatabase(config: IDatabaseConfig): Database {
  dbInstance = new Database(config);
  return dbInstance;
}

export function getDatabase(): Database {
  if (!dbInstance) {throw new Error('Database no inicializada. Llama a createDatabase() primero.');}
  return dbInstance;
}
