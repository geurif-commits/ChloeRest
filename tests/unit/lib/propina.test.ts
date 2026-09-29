import { describe, it, expect } from 'vitest';
import {
  PROPINA_DEFECTO,
  PROPINA_MAX,
  PROPINA_MIN,
  propinaPorcentajeOAlDefecto,
  propinaPorcentajeValido,
} from '../../../src/lib/propina.js';

describe('propinaPorcentajeValido', () => {
  it('el rango permitido es de 2 % a 30 %', () => {
    expect(PROPINA_MIN).toBe(2);
    expect(PROPINA_MAX).toBe(30);
    expect(PROPINA_DEFECTO).toBe(10);
  });

  it('acepta los límites y valores intermedios (número o texto)', () => {
    expect(propinaPorcentajeValido(2)).toBe(2);
    expect(propinaPorcentajeValido('10')).toBe(10);
    expect(propinaPorcentajeValido('12.5')).toBe(12.5);
    expect(propinaPorcentajeValido(30)).toBe(30);
  });

  it('rechaza valores fuera de rango, vacíos o no numéricos', () => {
    for (const invalido of [1, 1.99, 30.01, 31, 0, -5, '', '  ', 'abc', NaN, Infinity, null, undefined]) {
      expect(propinaPorcentajeValido(invalido)).toBeNull();
    }
  });
});

describe('propinaPorcentajeOAlDefecto', () => {
  it('devuelve el valor válido o 10 si no lo hay', () => {
    expect(propinaPorcentajeOAlDefecto('15')).toBe(15);
    expect(propinaPorcentajeOAlDefecto(null)).toBe(10);
    expect(propinaPorcentajeOAlDefecto('99')).toBe(10);
  });
});
