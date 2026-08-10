import crypto from 'node:crypto';
import { config } from './config.js';

import db from './db.js';

const PIN_PATTERN = /^\d{4,12}$/;

function hmac(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

export function assertValidPin(pin) {
  if (!PIN_PATTERN.test(String(pin || ''))) {
    const error = new Error('El PIN debe contener entre 4 y 12 dígitos.');
    error.status = 400;
    throw error;
  }
}

export function hashPin(pin) {
  assertValidPin(pin);
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin, storedHash) {
  if (!storedHash || !PIN_PATTERN.test(String(pin || ''))) return false;
  const [algorithm, salt, expected] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(pin), salt, 64).toString('base64url');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionHours * 60 * 60 * 1000);
  const usuario = { id: user.id, nombre: user.nombre, rol: user.rol };
  try {
    await db.query(
      'INSERT INTO app_sessions (token, usuario_id, usuario_data, expira_en) VALUES ($1, $2, $3::jsonb, $4)',
      [token, user.id, JSON.stringify(usuario), expiresAt]
    );
    db.query('DELETE FROM app_sessions WHERE expira_en <= CURRENT_TIMESTAMP').catch(() => {});
  } catch (err) {
    console.error('Error al guardar sesión en BD:', err.message);
  }
  return { token, usuario, expiraEn: expiresAt.toISOString() };
}

export async function authenticate(req, res, next) {
  const value = req.get('authorization') || '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sesión no válida o vencida.' });

  try {
    const result = await db.query(
      'SELECT usuario_data FROM app_sessions WHERE token = $1 AND expira_en > CURRENT_TIMESTAMP',
      [token]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Sesión no válida o vencida.' });
    req.user = result.rows[0].usuario_data;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión no válida o vencida.' });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    return next();
  };
}

export function signSupervisorAuthorization({ supervisorId, action, detailId }) {
  const payload = { supervisorId, action, detailId: Number(detailId), expiresAt: Date.now() + config.supervisorAuthorizationMinutes * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${hmac(encoded)}`;
}

export function verifySupervisorAuthorization(token, { action, detailId }) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = Buffer.from(hmac(encoded));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.expiresAt > Date.now() && payload.action === action && payload.detailId === Number(detailId) ? payload : null;
  } catch {
    return null;
  }
}
