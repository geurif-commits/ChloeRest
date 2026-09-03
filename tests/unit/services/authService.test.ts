import { describe, it, expect, beforeAll } from 'vitest';
import {
  hashPin,
  verifyPin,
  assertValidPin,
  assertSixDigitPin,
  firmarDuenoTok,
  verificarDuenoTok,
  signSupervisorAuthorization,
  verifySupervisorAuthorization,
} from '../../../src/services/authService.js';

beforeAll(() => {
  process.env.APP_SESSION_SECRET = 'test-secret-para-pruebas-unitarias';
});

describe('PIN hashing (scrypt)', () => {
  it('hashea y verifica un PIN correcto', () => {
    const hash = hashPin('123456');
    expect(verifyPin('123456', hash)).toBe(true);
  });

  it('rechaza un PIN incorrecto', () => {
    const hash = hashPin('123456');
    expect(verifyPin('654321', hash)).toBe(false);
  });

  it('rechaza PIN con formato inválido al hashear', () => {
    expect(() => hashPin('12')).toThrow();
  });

  it('assertValidPin acepta 4 a 12 dígitos', () => {
    expect(() => assertValidPin('1234')).not.toThrow();
    expect(() => assertValidPin('abc')).toThrow();
  });

  it('assertSixDigitPin exige exactamente 6 dígitos', () => {
    expect(() => assertSixDigitPin('123456')).not.toThrow();
    expect(() => assertSixDigitPin('12345')).toThrow();
  });
});

describe('Token de Dueño (HMAC)', () => {
  it('firma y verifica un token vigente', () => {
    const token = firmarDuenoTok({ rol: 'Dueno', exp: Date.now() + 60_000 });
    const payload = verificarDuenoTok(token);
    expect(payload?.rol).toBe('Dueno');
  });

  it('rechaza un token expirado', () => {
    const token = firmarDuenoTok({ rol: 'Dueno', exp: Date.now() - 1000 });
    expect(verificarDuenoTok(token)).toBeNull();
  });

  it('rechaza un token manipulado', () => {
    const token = firmarDuenoTok({ rol: 'Dueno', exp: Date.now() + 60_000 });
    const [encoded] = token.split('.');
    expect(verificarDuenoTok(`${encoded}.firma-falsa`)).toBeNull();
  });
});

describe('Autorización de supervisor', () => {
  it('firma y verifica una autorización vigente', () => {
    const token = signSupervisorAuthorization({ supervisorId: 1, action: 'ANULAR_ITEM', detailId: 10 });
    const payload = verifySupervisorAuthorization(token, { action: 'ANULAR_ITEM', detailId: 10 });
    expect(payload?.supervisorId).toBe(1);
  });

  it('rechaza si la acción no coincide', () => {
    const token = signSupervisorAuthorization({ supervisorId: 1, action: 'ANULAR_ITEM', detailId: 10 });
    expect(verifySupervisorAuthorization(token, { action: 'OTRA_ACCION', detailId: 10 })).toBeNull();
  });
});
