/**
 * @file Rate limiting middleware (express-rate-limit).
 * Aplica a endpoints públicos para evitar abuso de brute-force y DDoS ligero.
 * Configurable vía variables de entorno.
 */

import rateLimit from 'express-rate-limit';

/** Rate limiter para endpoints de login y autenticación (más restrictivo). */
export const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000), // 15 min
  max: Number(process.env.LOGIN_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Intenta de nuevo en unos minutos.', code: 'RATE_LIMITED' },
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const deviceId = String(req.headers['x-device-id'] || '');
    return deviceId ? `${ip}:${deviceId}` : ip;
  },
});

/**
 * Registro de dispositivos: cada equipo lo llama al abrir la app, así que varios equipos de un mismo
 * negocio (misma IP pública) no deben agotar el límite. Sigue acotado para frenar el registro masivo.
 */
export const registroDispositivoLimiter = rateLimit({
  windowMs: Number(process.env.DEVICE_REGISTER_RATE_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.DEVICE_REGISTER_RATE_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intenta más tarde.', code: 'RATE_LIMITED' },
});

/** Rate limiter para endpoints públicos generales (formularios, licencias). */
export const publicLimiter = rateLimit({
  windowMs: Number(process.env.PUBLIC_RATE_WINDOW_MS || 10 * 60 * 1000), // 10 min
  max: Number(process.env.PUBLIC_RATE_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intenta más tarde.', code: 'RATE_LIMITED' },
});
