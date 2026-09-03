/**
 * @file Lógica pura de licencias (claves CHLOE-<DURACION>-<FIRMA>)
 * No depende de la BD ni de Express; recibe el secret de activación como parámetro.
 * Puerto directo de lib/licencias.js a TypeScript.
 */

import crypto from 'node:crypto';

export interface IDuracionParseada {
  vitalicia: boolean;
  meses: number;
}

export function firmarDuracion(dur: string, secret: string | null | undefined): string {
  const s = secret || '';
  return crypto
    .createHmac('sha256', s)
    .update(`CHLOE:${String(dur).toUpperCase()}`)
    .digest('hex')
    .toUpperCase()
    .slice(0, 20);
}

export function parsearDuracion(codigo: string | null | undefined): IDuracionParseada | null {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') {return { vitalicia: true, meses: -1 };}
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) {return null;}
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0 || n > 120) {return null;}
  const meses = m[2] === 'M' ? n : Math.ceil(n / 30);
  return { vitalicia: false, meses };
}

export function vencimientoDesdeMeses(meses: number): Date {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha;
}

export interface IClaveGenerada {
  clave?: string;
  duracion?: string;
  vitalicia?: boolean;
  error?: string;
}

export function generarClaveLicencia(dur: string): IClaveGenerada {
  const duracion = String(dur || '').trim().toUpperCase();
  const parsed = parsearDuracion(duracion);
  if (!parsed) {return { error: 'Duración inválida. Usa por ejemplo 7D, 15D, 30D, 90D, 6M, 12M, 24M o L.' };}
  const firma = crypto
    .randomBytes(20)
    .toString('hex')
    .toUpperCase()
    .match(/.{1,5}/g)!
    .join('-');
  return { clave: `CHLOE-${duracion}-${firma}`, duracion, vitalicia: parsed.vitalicia };
}

export interface IClaveValidada {
  valida?: boolean;
  registrada?: boolean;
  duracion?: string;
  vitalicia?: boolean;
  error?: string;
}

export function validarClaveLicencia(
  clave: string,
  licenseActivationKey: string | null | undefined
): IClaveValidada {
  const c = String(clave || '').trim().toUpperCase();
  if (!c) {return { error: 'Ingresa la clave a verificar.' };}
  if (licenseActivationKey && c === licenseActivationKey) {
    return { valida: true, duracion: 'L', vitalicia: true };
  }
  const match = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){1,15})$/i.exec(c);
  if (!match) {return { error: 'Formato inválido. Usa CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX.' };}
  const parsed = parsearDuracion(match[1]);
  if (!parsed) {return { error: 'Duración inválida.' };}
  return { valida: true, registrada: false, duracion: match[1].toUpperCase(), vitalicia: parsed.vitalicia };
}
