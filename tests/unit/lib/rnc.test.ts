import { describe, it, expect } from 'vitest';
import { validarRNC, normalizarRNC } from '../../../src/lib/rnc.js';

describe('validarRNC', () => {
  it('acepta un RNC de 9 dígitos con dígito verificador correcto', () => {
    const base = '13100000';
    const weights = [7, 8, 9, 4, 5, 6, 7, 8];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(base[i], 10) * weights[i];
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
    expect(validarRNC(base + checkDigit)).toBe(true);
  });

  it('rechaza un RNC de 9 dígitos con dígito verificador incorrecto', () => {
    const base = '13100000';
    const weights = [7, 8, 9, 4, 5, 6, 7, 8];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(base[i], 10) * weights[i];
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
    const wrong = (checkDigit + 1) % 10;
    expect(validarRNC(base + wrong)).toBe(false);
  });

  it('rechaza cédula de 11 dígitos inválida', () => {
    expect(validarRNC('00100000000')).toBe(false);
  });

  it('rechaza valores inválidos o vacíos', () => {
    expect(validarRNC('')).toBe(false);
    expect(validarRNC(null)).toBe(false);
    expect(validarRNC('123')).toBe(false);
    expect(validarRNC('123456789012345')).toBe(false);
  });
});

describe('normalizarRNC', () => {
  it('elimina caracteres no numéricos y limita a 11 dígitos', () => {
    expect(normalizarRNC('131-000000-0')).toBe('1310000000');
    expect(normalizarRNC('abc123')).toBe('123');
    expect(normalizarRNC('')).toBe('');
  });
});
