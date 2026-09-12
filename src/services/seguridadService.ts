/**
 * @file Servicio de seguridad de sesión (items 7 y 8 del hardening):
 *  - Revocación server-side de tokens del Dueño mediante epoch persistente.
 *  - Lockout anti fuerza bruta persistente por IP y por dispositivo, que
 *    sobrevive reinicios y funciona en cualquier worker (tabla login_intentos).
 */

import { httpError } from '../lib/core.js';
import { config } from '../lib/config.js';
import { getDatabase } from '../db/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('seguridadService');

// ──── Revocación de tokens del Dueño (epoch) ────

export async function getDuenoEpoch(): Promise<number> {
  const db = getDatabase();
  const res = await db.queryUnscoped<{ owner_token_epoch: number | null }>(
    'SELECT owner_token_epoch FROM configuracion_sistema ORDER BY id LIMIT 1'
  );
  return res.rows[0]?.owner_token_epoch ?? 1;
}

/** Incrementa el epoch: invalida al instante todos los tokens Dueño anteriores. */
export async function bumpDuenoEpoch(): Promise<void> {
  const db = getDatabase();
  await db.queryUnscoped(
    'UPDATE configuracion_sistema SET owner_token_epoch = owner_token_epoch + 1 WHERE id = (SELECT id FROM configuracion_sistema ORDER BY id LIMIT 1)'
  );
  logger.info({ action: 'DUENO_EPOCH_INCREMENTADO' });
}

export async function verificarDuenoEpoch(ep: number | undefined): Promise<boolean> {
  if (typeof ep !== 'number') {return false;}
  return ep === (await getDuenoEpoch());
}

// ──── Lockout persistente por clave (ip / device) ────

const MAX_INTENTOS = config.login.maxAttempts;
const LOCKOUT_MIN = config.login.lockoutMinutes;

export async function verificarBloqueo(claves: Array<string | null | undefined>): Promise<void> {
  const db = getDatabase();
  const keys = claves.filter((k): k is string => Boolean(k));
  if (!keys.length) {return;}
  const res = await db.queryUnscoped<{ clave: string; bloqueado_hasta: Date | null }>(
    'SELECT clave, bloqueado_hasta FROM login_intentos WHERE clave = ANY($1::text[]) AND bloqueado_hasta > CURRENT_TIMESTAMP',
    [keys]
  );
  if (res.rowCount) {
    const hasta = res.rows[0].bloqueado_hasta as Date;
    const restanteMin = Math.max(1, Math.ceil((new Date(hasta).getTime() - Date.now()) / 60000));
    throw httpError(429, `Demasiados intentos fallidos. Reintenta en ${restanteMin} min.`);
  }
}

export async function registrarFallo(claves: Array<string | null | undefined>): Promise<void> {
  const db = getDatabase();
  const keys = claves.filter((k): k is string => Boolean(k));
  for (const clave of keys) {
    await db.queryUnscoped(
      `INSERT INTO login_intentos (clave, intentos, actualizado_en)
       VALUES ($1, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (clave) DO UPDATE SET intentos = login_intentos.intentos + 1, actualizado_en = CURRENT_TIMESTAMP`,
      [clave]
    );
    await db.queryUnscoped(
      `UPDATE login_intentos
          SET intentos = 0,
              bloqueado_hasta = CURRENT_TIMESTAMP + ($1 || ' minutes')::interval
        WHERE clave = $2 AND intentos >= $3 AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= CURRENT_TIMESTAMP)`,
      [String(LOCKOUT_MIN), clave, MAX_INTENTOS]
    );
  }
  logger.warn({ action: 'LOGIN_INTENTO_FALLIDO', claves: keys });
}

export async function registrarExito(claves: Array<string | null | undefined>): Promise<void> {
  const db = getDatabase();
  const keys = claves.filter((k): k is string => Boolean(k));
  if (!keys.length) {return;}
  await db.queryUnscoped('DELETE FROM login_intentos WHERE clave = ANY($1::text[])', [keys]);
}
