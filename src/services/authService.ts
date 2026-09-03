/**
 * @file Servicio de autenticación: PIN hashing (scrypt), sesiones de usuario
 * y token HMAC del Dueño. Puerto directo de auth.js a TypeScript.
 */

import crypto from 'node:crypto';
import { httpError } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { UserRole } from '../types/index.js';

const PIN_PATTERN = /^\d{4,12}$/;

export interface IUsuarioSesion {
  id: number;
  nombre: string;
  rol: UserRole;
  empresa_id?: number | null;
  device_id?: string | null;
}

export interface ISesionCreada {
  token: string;
  usuario: { id: number; nombre: string; rol: UserRole };
  expiraEn: string;
}

export interface IDuenoTokenPayload {
  rol: 'Dueno';
  exp: number;
}

export interface ISupervisorAuthPayload {
  supervisorId: number;
  action: string;
  detailId: number;
  expiresAt: number;
}

function getSessionSecret(): string {
  return process.env.APP_SESSION_SECRET || '';
}

function getSessionHours(): number {
  return Number(process.env.SESSION_HOURS || 8);
}

function getSupervisorAuthorizationMinutes(): number {
  return Number(process.env.SUPERVISOR_AUTHORIZATION_MINUTES || process.env.SUPERVISOR_AUTH_MINUTES || 5);
}

function hmac(value: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

export function assertValidPin(pin: string | number | undefined): void {
  if (!PIN_PATTERN.test(String(pin || ''))) {
    throw httpError(400, 'El PIN debe contener entre 4 y 12 dígitos.', 'INVALID_PIN');
  }
}

export function assertSixDigitPin(pin: string | number | undefined): void {
  if (!/^\d{6}$/.test(String(pin || ''))) {
    throw httpError(400, 'El PIN debe contener exactamente 6 dígitos.', 'INVALID_PIN');
  }
}

export function hashPin(pin: string | number): string {
  assertValidPin(pin);
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string | number | undefined, storedHash: string | null | undefined): boolean {
  if (!storedHash || !PIN_PATTERN.test(String(pin || ''))) {return false;}
  const [algorithm, salt, expected] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) {return false;}
  const actual = crypto.scryptSync(String(pin), salt, 64).toString('base64url');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function createSession(user: IUsuarioSesion): Promise<ISesionCreada> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + getSessionHours() * 60 * 60 * 1000);
  const usuario = { id: user.id, nombre: user.nombre, rol: user.rol };
  const db = getDatabase();
  try {
    await db.queryUnscoped(
      'INSERT INTO app_sessions (token, usuario_id, usuario_data, expira_en, empresa_id, device_id) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
      [token, user.id, JSON.stringify(usuario), expiresAt, user.empresa_id || null, user.device_id || null]
    );
    db.queryUnscoped('DELETE FROM app_sessions WHERE expira_en <= CURRENT_TIMESTAMP').catch(() => undefined);
  } catch (err) {
     
    console.error('Error al guardar sesión en BD:', (err as Error).message);
  }
  return { token, usuario, expiraEn: expiresAt.toISOString() };
}

export function firmarDuenoTok(payload: IDuenoTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(`dueno:${encoded}`).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verificarDuenoTok(token: string | null | undefined): IDuenoTokenPayload | null {
  if (!token || !token.includes('.')) {return null;}
  const [encoded, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(`dueno:${encoded}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {return null;}
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as IDuenoTokenPayload;
    return payload.rol === 'Dueno' && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function signSupervisorAuthorization(params: {
  supervisorId: number;
  action: string;
  detailId: number | string;
}): string {
  const payload: ISupervisorAuthPayload = {
    supervisorId: params.supervisorId,
    action: params.action,
    detailId: Number(params.detailId),
    expiresAt: Date.now() + getSupervisorAuthorizationMinutes() * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${hmac(encoded)}`;
}

export function verifySupervisorAuthorization(
  token: string | null | undefined,
  params: { action: string; detailId: number | string }
): ISupervisorAuthPayload | null {
  if (!token || !token.includes('.')) {return null;}
  const [encoded, signature] = token.split('.');
  const expected = Buffer.from(hmac(encoded));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {return null;}
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ISupervisorAuthPayload;
    return payload.expiresAt > Date.now() && payload.action === params.action && payload.detailId === Number(params.detailId)
      ? payload
      : null;
  } catch {
    return null;
  }
}
