// Validación de RNC/Cédula según la DGII (República Dominicana).
// - RNC de 9 dígitos: módulo 11 (personas jurídicas).
// - Cédula de 11 dígitos: módulo 10 (personas físicas).

export function validarRNC(rnc) {
  const clean = String(rnc || '').replace(/[^0-9]/g, '');
  if (clean.length === 9) return validarRNCModulo11(clean);
  if (clean.length === 11) return validarRNCModulo10(clean);
  return false;
}

export function validarRNCModulo10(rnc) {
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(rnc[i]) * weights[i];
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(rnc[8]);
}

export function validarRNCModulo11(rnc) {
  // RNC de 9 dígitos (personas jurídicas): se toman los primeros 8 dígitos,
  // se multiplican por los pesos [7,8,9,4,5,6,7,8] y el 9º es el dígito verificador.
  const weights = [7, 8, 9, 4, 5, 6, 7, 8];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(rnc[i]) * weights[i];
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
  return checkDigit === parseInt(rnc[8]);
}

export function normalizarRNC(rnc) {
  return String(rnc || '').replace(/[^0-9]/g, '').substring(0, 11);
}
