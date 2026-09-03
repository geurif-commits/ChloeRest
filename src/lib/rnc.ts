/**
 * @file Validación de RNC/Cédula (DGII, República Dominicana)
 * - RNC de 9 dígitos: módulo 11 (personas jurídicas)
 * - Cédula de 11 dígitos: módulo 10 (personas físicas)
 * Puerto directo de lib/rnc.js a TypeScript.
 */

export function validarRNCModulo10(rnc: string): boolean {
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) {sum += parseInt(rnc[i], 10) * weights[i];}
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(rnc[8], 10);
}

export function validarRNCModulo11(rnc: string): boolean {
  const weights = [7, 8, 9, 4, 5, 6, 7, 8];
  let sum = 0;
  for (let i = 0; i < 8; i++) {sum += parseInt(rnc[i], 10) * weights[i];}
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
  return checkDigit === parseInt(rnc[8], 10);
}

export function validarRNC(rnc: string | null | undefined): boolean {
  const clean = String(rnc || '').replace(/[^0-9]/g, '');
  if (clean.length === 9) {return validarRNCModulo11(clean);}
  if (clean.length === 11) {return validarRNCModulo10(clean);}
  return false;
}

export function normalizarRNC(rnc: string | null | undefined): string {
  return String(rnc || '')
    .replace(/[^0-9]/g, '')
    .substring(0, 11);
}
