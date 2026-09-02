import crypto from 'node:crypto';

// Lógica pura de licencias (claves CHLOE-<DURACION>-<FIRMA>).
// No depende de la BD ni de Express; recibe el secret de activación como parámetro.

// Firma HMAC-SHA256 de la duración (para claves de activación con duración).
export function firmarDuracion(dur, secret) {
  const s = secret || '';
  return crypto.createHmac('sha256', s).update(`CHLOE:${String(dur).toUpperCase()}`).digest('hex').toUpperCase().slice(0, 20);
}

// Parsea un código de duración (7D, 30D, 6M, 12M, L) a meses.
export function parsearDuracion(codigo) {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') return { vitalicia: true, meses: -1 };
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0 || n > 120) return null;
  const meses = m[2] === 'M' ? n : Math.ceil(n / 30);
  return { vitalicia: false, meses };
}

// Fecha de vencimiento a partir de meses.
export function vencimientoDesdeMeses(meses) {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha;
}

// Genera una clave de licencia CHLOE-<DURACION>-<FIRMA>.
export function generarClaveLicencia(dur) {
  const duracion = String(dur || '').trim().toUpperCase();
  const parsed = parsearDuracion(duracion);
  if (!parsed) return { error: 'Duración inválida. Usa por ejemplo 7D, 15D, 30D, 90D, 6M, 12M, 24M o L.' };
  const firma = crypto.randomBytes(20).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
  return { clave: `CHLOE-${duracion}-${firma}`, duracion, vitalicia: parsed.vitalicia };
}

// Valida el formato de una clave de licencia.
export function validarClaveLicencia(clave, licenseActivationKey) {
  const c = String(clave || '').trim().toUpperCase();
  if (!c) return { error: 'Ingresa la clave a verificar.' };
  if (licenseActivationKey && c === licenseActivationKey) {
    return { valida: true, duracion: 'L', vitalicia: true };
  }
  const match = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){1,15})$/i.exec(c);
  if (!match) return { error: 'Formato inválido. Usa CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX.' };
  const parsed = parsearDuracion(match[1]);
  if (!parsed) return { error: 'Duración inválida.' };
  return { valida: true, registrada: false, duracion: match[1].toUpperCase(), vitalicia: parsed.vitalicia };
}
