import { describe, it, expect } from 'vitest';
import {
  parsearDuracion,
  generarClaveLicencia,
  validarClaveLicencia,
  vencimientoDesdeMeses,
} from '../../../src/lib/licencias.js';

describe('parsearDuracion', () => {
  it('parsea duraciones vitalicias', () => {
    expect(parsearDuracion('L')).toEqual({ vitalicia: true, meses: -1 });
  });

  it('parsea días a meses redondeando hacia arriba', () => {
    expect(parsearDuracion('30D')).toEqual({ vitalicia: false, meses: 1 });
    expect(parsearDuracion('45D')).toEqual({ vitalicia: false, meses: 2 });
  });

  it('parsea meses directamente', () => {
    expect(parsearDuracion('12M')).toEqual({ vitalicia: false, meses: 12 });
  });

  it('rechaza formatos inválidos', () => {
    expect(parsearDuracion('abc')).toBeNull();
    expect(parsearDuracion('200D')).toBeNull();
    expect(parsearDuracion('')).toBeNull();
  });
});

describe('generarClaveLicencia', () => {
  it('genera una clave con el formato CHLOE-<DUR>-<FIRMA>', () => {
    const result = generarClaveLicencia('30D');
    expect(result.error).toBeUndefined();
    expect(result.clave).toMatch(/^CHLOE-30D-([A-F0-9]{5}-){7}[A-F0-9]{5}$/);
    expect(result.vitalicia).toBe(false);
  });

  it('rechaza duración inválida', () => {
    const result = generarClaveLicencia('abc');
    expect(result.error).toBeDefined();
  });
});

describe('validarClaveLicencia', () => {
  it('valida la clave maestra de activación', () => {
    const result = validarClaveLicencia('MASTER-KEY', 'MASTER-KEY');
    expect(result.valida).toBe(true);
    expect(result.vitalicia).toBe(true);
  });

  it('valida el formato de una clave generada', () => {
    const generada = generarClaveLicencia('7D');
    const result = validarClaveLicencia(generada.clave!, null);
    expect(result.valida).toBe(true);
    expect(result.duracion).toBe('7D');
  });

  it('rechaza formato inválido', () => {
    const result = validarClaveLicencia('CLAVE-INVALIDA', null);
    expect(result.error).toBeDefined();
  });

  it('rechaza clave vacía', () => {
    const result = validarClaveLicencia('', null);
    expect(result.error).toBeDefined();
  });
});

describe('vencimientoDesdeMeses', () => {
  it('suma meses a la fecha actual', () => {
    const ahora = new Date();
    const vencimiento = vencimientoDesdeMeses(1);
    expect(vencimiento.getMonth()).toBe((ahora.getMonth() + 1) % 12);
  });
});
