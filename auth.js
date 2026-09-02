import crypto from 'node:crypto';
import { config } from './config.js';

import db, { runWithRequestContext } from './db.js';

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

export function assertSixDigitPin(pin) {
  if (!/^\d{6}$/.test(String(pin || ''))) {
    const error = new Error('El PIN debe contener exactamente 6 dígitos.');
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
      'INSERT INTO app_sessions (token, usuario_id, usuario_data, expira_en, empresa_id, device_id) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
      [token, user.id, JSON.stringify(usuario), expiresAt, user.empresa_id || null, user.device_id || null]
    );
    db.query('DELETE FROM app_sessions WHERE expira_en <= CURRENT_TIMESTAMP').catch(() => {});
  } catch (err) {
    console.error('Error al guardar sesión en BD:', err.message);
  }
  return { token, usuario, expiraEn: expiresAt.toISOString() };
}

export function firmarDuenoTok(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(`dueno:${encoded}`).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verificarDuenoTok(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(`dueno:${encoded}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.rol === 'Dueno' && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export async function authenticate(req, res, next) {
  const value = req.get('authorization') || (req.query?.token ? `Bearer ${req.query.token}` : '');
  const token = value.startsWith('Bearer ') ? value.slice(7) : (value || req.query?.token || '');
  const deviceId = String(req.get('x-device-id') || '').trim();
  if (!token) return res.status(401).json({ error: 'Sesión no válida o vencida.' });

  const dueno = verificarDuenoTok(token);
  if (dueno) {
    req.dueno = true;
    req.user = { id: 0, rol: 'Dueno', empresaId: 1, empresa_id: 1, nombre: 'Propietario Sistema' };
    return runWithRequestContext({ platform: true, empresaId: 1 }, next);
  }

  try {
    const result = await db.queryUnscoped(
      `SELECT s.usuario_data, s.empresa_id, s.device_id, u.estado, u.rol, u.nombre
         FROM app_sessions s
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = $1 AND s.expira_en > CURRENT_TIMESTAMP`,
      [token]
    );
    if (!result.rowCount || result.rows[0].estado !== 'Activo') {
      return res.status(401).json({ error: 'Sesión no válida o vencida.' });
    }
    if (result.rows[0].device_id && result.rows[0].device_id !== deviceId) {
      return res.status(401).json({ error: 'La sesión pertenece a otro dispositivo.' });
    }
    req.user = {
      ...result.rows[0].usuario_data,
      empresaId: result.rows[0].empresa_id,
      empresa_id: result.rows[0].empresa_id,
      rol: result.rows[0].rol,
      nombre: result.rows[0].nombre,
    };
    return runWithRequestContext({ empresaId: result.rows[0].empresa_id }, next);
  } catch (error) {
    return res.status(401).json({ error: 'Sesión no válida o vencida.' });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (req.user?.rol === 'Dueno') return next();
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
