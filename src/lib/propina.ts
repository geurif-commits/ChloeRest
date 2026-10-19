/**
 * @file Porcentaje de propina configurable por negocio.
 * Rango permitido: 2 % a 30 %. El valor histórico (Ley 16-92) es 10 %.
 */

export const PROPINA_MIN = 2;
export const PROPINA_MAX = 30;
export const PROPINA_DEFECTO = 10;

/**
 * Devuelve el porcentaje (con hasta 2 decimales) si está entre PROPINA_MIN y PROPINA_MAX,
 * o null si el valor no es un número válido o queda fuera del rango.
 */
export function propinaPorcentajeValido(valor: unknown): number | null {
  if (valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')) {return null;}
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {return null;}
  const redondeado = Math.round(numero * 100) / 100;
  return redondeado >= PROPINA_MIN && redondeado <= PROPINA_MAX ? redondeado : null;
}

/** Porcentaje válido o, si no lo hay, el valor por defecto (10 %). */
export function propinaPorcentajeOAlDefecto(valor: unknown): number {
  return propinaPorcentajeValido(valor) ?? PROPINA_DEFECTO;
}
