import { describe, it, expect } from 'vitest';
import { Money, httpError, HttpError, isValidRNC, isValidEmail, isValidPIN, validateRequired } from '../../../src/lib/core.js';

describe('Money', () => {
  it('crea dinero desde un monto', () => {
    const m = Money.fromAmount(99.99);
    expect(m.centavos).toBe(9999);
  });

  it('suma dinero', () => {
    const a = Money.fromAmount(10.0);
    const b = Money.fromAmount(5.5);
    expect(a.add(b).toAmount()).toBe(15.5);
  });

  it('resta dinero', () => {
    const a = Money.fromAmount(10.0);
    const b = Money.fromAmount(3.25);
    expect(a.subtract(b).toAmount()).toBe(6.75);
  });

  it('multiplica dinero', () => {
    const a = Money.fromAmount(10.0);
    expect(a.multiply(3).toAmount()).toBe(30);
  });

  it('formatea con display()', () => {
    const a = Money.fromAmount(217.98);
    expect(a.display()).toBe('RD$ 217.98');
  });

  it('compara montos', () => {
    const a = Money.fromAmount(10);
    const b = Money.fromAmount(5);
    expect(a.isGreaterThan(b)).toBe(true);
    expect(b.isLessThan(a)).toBe(true);
    expect(a.equals(Money.fromAmount(10))).toBe(true);
  });
});

describe('httpError', () => {
  it('crea un HttpError con statusCode y code', () => {
    const err = httpError(404, 'No encontrado', 'NOT_FOUND');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('No encontrado');
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('Validators', () => {
  it('valida RNC dominicano de 9 dígitos', () => {
    expect(isValidRNC('131234567')).toBe(true);
    expect(isValidRNC('invalido')).toBe(false);
  });

  it('valida email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalido')).toBe(false);
  });

  it('valida PIN de 6 dígitos', () => {
    expect(isValidPIN('123456')).toBe(true);
    expect(isValidPIN('12345')).toBe(false);
  });

  it('valida campos requeridos', () => {
    expect(validateRequired({ nombre: 'Chloe' }, ['nombre'])).toBeNull();
    expect(validateRequired({ nombre: '' }, ['nombre'])).toBe('Campo requerido: nombre');
  });
});
