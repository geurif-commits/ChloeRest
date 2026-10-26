import { describe, it, expect } from 'vitest';
import {
  longitudesDuenoValidas,
  maxDigitos,
  planificarEnvioPin,
  puedeSerPropietario,
  puntosVisibles,
  DEMORA_POSIBLE_PROPIETARIO_MS,
} from '../../../frontend-restaurante/src/utils/pinLogin.js';

const conDueno = { pinLength: 6, duenoLongitudes: [10] };
const sinDueno = { pinLength: 6, duenoLongitudes: [] as number[] };

describe('longitudesDuenoValidas', () => {
  it('toma las longitudes de pin-info y descarta lo inválido', () => {
    expect(longitudesDuenoValidas({ configurado: true, longitudes: [12, 10, 10, 3, 40, 'x'] })).toEqual([10, 12]);
  });
  it('sin PIN configurado o con una respuesta rara no hay longitudes', () => {
    expect(longitudesDuenoValidas({ configurado: false, longitudes: [10] })).toEqual([]);
    expect(longitudesDuenoValidas(null)).toEqual([]);
    expect(longitudesDuenoValidas({ configurado: true })).toEqual([]);
  });
});

describe('puedeSerPropietario / maxDigitos', () => {
  it('con PIN de propietario más largo, el acceso normal admite hasta su longitud', () => {
    expect(puedeSerPropietario(conDueno)).toBe(true);
    expect(maxDigitos(conDueno)).toBe(10);
  });
  it('sin PIN de propietario el teclado se queda en la longitud del personal', () => {
    expect(puedeSerPropietario(sinDueno)).toBe(false);
    expect(maxDigitos(sinDueno)).toBe(6);
  });
  it('al fichar turno o abrir un KDS el teclado es solo del personal', () => {
    expect(maxDigitos({ ...conDueno, esTurno: true })).toBe(6);
    expect(maxDigitos({ ...conDueno, kdsPendiente: 'Cocina' })).toBe(6);
  });
  it('el modo propietario usa la longitud del PIN del propietario', () => {
    expect(maxDigitos({ ...conDueno, modoDueno: true })).toBe(10);
  });
});

describe('puntosVisibles', () => {
  it('muestra los puntos del personal y crece al pasar de esa longitud', () => {
    expect(puntosVisibles({ ...conDueno, pin: '123' })).toBe(6);
    expect(puntosVisibles({ ...conDueno, pin: '123456' })).toBe(6);
    expect(puntosVisibles({ ...conDueno, pin: '1234567' })).toBe(10);
  });
  it('en modo propietario siempre muestra los del propietario', () => {
    expect(puntosVisibles({ ...conDueno, pin: '', modoDueno: true })).toBe(10);
  });
});

describe('planificarEnvioPin', () => {
  it('sin PIN de propietario envía al completar la longitud del personal, sin demora larga', () => {
    expect(planificarEnvioPin({ ...sinDueno, nuevo: '12345' })).toEqual({ accion: 'esperar' });
    const plan = planificarEnvioPin({ ...sinDueno, nuevo: '123456' });
    expect(plan).toMatchObject({ accion: 'enviar', destino: 'general' });
    expect(plan.demoraMs).toBeLessThan(DEMORA_POSIBLE_PROPIETARIO_MS);
  });
  it('con PIN de propietario largo espera un instante tras el 6.º dígito por si sigue tecleando', () => {
    const plan = planificarEnvioPin({ ...conDueno, nuevo: '123456' });
    expect(plan).toMatchObject({ accion: 'enviar', destino: 'general', demoraMs: DEMORA_POSIBLE_PROPIETARIO_MS });
  });
  it('los dígitos intermedios no envían nada', () => {
    for (const parcial of ['1234567', '12345678', '123456789']) {
      expect(planificarEnvioPin({ ...conDueno, nuevo: parcial })).toEqual({ accion: 'esperar' });
    }
  });
  it('al completar el PIN del propietario en el acceso normal lo envía al login general (que abre su panel)', () => {
    expect(planificarEnvioPin({ ...conDueno, nuevo: '1234567890' })).toMatchObject({ accion: 'enviar', destino: 'general' });
  });
  it('en modo propietario envía a su ruta solo al completar su longitud', () => {
    expect(planificarEnvioPin({ ...conDueno, modoDueno: true, nuevo: '123456' })).toEqual({ accion: 'esperar' });
    expect(planificarEnvioPin({ ...conDueno, modoDueno: true, nuevo: '1234567890' })).toMatchObject({ accion: 'enviar', destino: 'dueno' });
  });
  it('al fichar turno nunca se interpreta como propietario', () => {
    const plan = planificarEnvioPin({ ...conDueno, esTurno: true, nuevo: '123456' });
    expect(plan.demoraMs).toBeLessThan(DEMORA_POSIBLE_PROPIETARIO_MS);
  });
});
