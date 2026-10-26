import { describe, it, expect } from 'vitest';
import { lineasEcf, repartirDescuento } from '../../../src/lib/ecfCuenta.js';
import {
  construirCuerpoAlgoBack,
  indicadorFacturacion,
  interpretarRespuestaAlgoBack,
  parsearFechaFirma,
  totalesAlgoBack,
} from '../../../src/lib/ecfAlgoback.js';

const emisor = { rnc: '131000004', razonSocial: 'Restaurante Chloe SRL', direccion: 'Av. Principal 1, La Romana' };

describe('repartirDescuento', () => {
  it('reparte en proporción y no pierde centavos', () => {
    const reparto = repartirDescuento([10_000, 20_000, 30_000], 1_000);
    expect(reparto.reduce((a, b) => a + b, 0)).toBe(1_000);
    expect(reparto).toEqual([166, 333, 501]);
  });
  it('sin descuento no toca nada', () => {
    expect(repartirDescuento([500, 700], 0)).toEqual([0, 0]);
  });
});

describe('lineasEcf', () => {
  it('con ITBIS aparte: el precio del menú es neto y el ITBIS se suma', () => {
    const [l] = lineasEcf([{ nombre: 'Filete', cantidad: 2, precio_unitario: 100, tasa_itbis: 18 }], 0, true);
    expect(l).toMatchObject({ netoC: 20_000, itbisCobradoC: 3_600, totalLineaC: 23_600, precioUnitarioFinal: 118 });
  });
  it('sin ITBIS aparte: el precio ya lo incluye y la línea cuesta lo mismo', () => {
    const [l] = lineasEcf([{ nombre: 'Filete', cantidad: 2, precio_unitario: 100, tasa_itbis: 18 }], 0, false);
    expect(l).toMatchObject({ netoC: 20_000, itbisCobradoC: 0, totalLineaC: 20_000, precioUnitarioFinal: 100 });
  });
  it('el descuento baja la base antes del ITBIS', () => {
    const lineas = lineasEcf(
      [{ nombre: 'A', cantidad: 1, precio_unitario: 100, tasa_itbis: 18 }, { nombre: 'B', cantidad: 1, precio_unitario: 100, tasa_itbis: 0 }],
      2_000,
      true
    );
    expect(lineas.map((x) => x.netoC)).toEqual([9_000, 9_000]);
    expect(lineas.map((x) => x.itbisCobradoC)).toEqual([1_620, 0]);
  });
});

describe('totalesAlgoBack', () => {
  it('recalcula ITBIS por grupo de tasa sobre importes con ITBIS incluido', () => {
    const lineas = lineasEcf([{ nombre: 'Filete', cantidad: 2, precio_unitario: 100, tasa_itbis: 18 }], 0, true);
    expect(totalesAlgoBack('E32', lineas)).toEqual({ itbis: 36, total: 236 });
  });
  it('lo exento no genera ITBIS', () => {
    const lineas = lineasEcf([{ nombre: 'Agua', cantidad: 1, precio_unitario: 50, tasa_itbis: 0 }], 0, true);
    expect(totalesAlgoBack('E32', lineas)).toEqual({ itbis: 0, total: 50 });
  });
  it('los regímenes especiales (E44) no llevan ITBIS', () => {
    const lineas = lineasEcf([{ nombre: 'Filete', cantidad: 1, precio_unitario: 100, tasa_itbis: 18 }], 0, false);
    expect(totalesAlgoBack('E44', lineas).itbis).toBe(0);
  });
  it('indicador de facturación', () => {
    expect(indicadorFacturacion(18)).toBe(1);
    expect(indicadorFacturacion(16)).toBe(2);
    expect(indicadorFacturacion(0)).toBe(4);
  });
});

describe('construirCuerpoAlgoBack', () => {
  const lineas = lineasEcf([{ nombre: 'Filete Mignon', cantidad: 2, precio_unitario: 100, tasa_itbis: 18 }], 0, true);
  const base = { encf: 'E320000000001', tipo: 'E32', fechaEmision: new Date('2026-10-26T02:30:00Z'), emisor, lineas, numeroInterno: '000123' };

  it('E32 de consumo: sin comprador, precios con ITBIS incluido y totales al céntimo', () => {
    const c = construirCuerpoAlgoBack(base);
    expect(c).toMatchObject({
      eNCF: 'E320000000001',
      RNCEmisor: '131000004',
      FechaEmision: '25-10-2026',
      TipoPago: '1',
      IndicadorMontoGravado: '1',
      TotalITBIS: '36.00',
      MontoTotal: '236.00',
    });
    expect(c.RNCComprador).toBeUndefined();
    expect(c.FechaVencimientoSecuencia).toBeUndefined();
    expect(c.Item).toEqual([{ IndicadorFacturacion: '1', NombreItem: 'Filete Mignon', IndicadorBienoServicio: '1', CantidadItem: '2', PrecioUnitarioItem: '118.00' }]);
  });
  it('E31: lleva comprador y el vencimiento de la secuencia', () => {
    const c = construirCuerpoAlgoBack({ ...base, tipo: 'E31', encf: 'E310000000001', vencimientoSecuencia: '2027-12-31', comprador: { rnc: '101-00001-9', razonSocial: 'ACME SRL' } });
    expect(c).toMatchObject({ RNCComprador: '101000019', RazonSocialComprador: 'ACME SRL', FechaVencimientoSecuencia: '31-12-2027' });
  });
  it('E31 sin comprador o sin vencimiento de secuencia falla con un mensaje claro', () => {
    expect(() => construirCuerpoAlgoBack({ ...base, tipo: 'E31', vencimientoSecuencia: '2027-12-31' })).toThrow(/cliente/);
    expect(() => construirCuerpoAlgoBack({ ...base, tipo: 'E31', comprador: { rnc: '101000019', razonSocial: 'ACME' } })).toThrow(/vencimiento/);
  });
  it('falla si falta la dirección o el RNC del emisor', () => {
    expect(() => construirCuerpoAlgoBack({ ...base, emisor: { ...emisor, direccion: ' ' } })).toThrow(/dirección/);
    expect(() => construirCuerpoAlgoBack({ ...base, emisor: { ...emisor, rnc: '12' } })).toThrow(/RNC del emisor/);
  });
  it('consumo de RD$ 250,000 o más exige comprador', () => {
    const grandes = lineasEcf([{ nombre: 'Evento', cantidad: 1, precio_unitario: 250_000, tasa_itbis: 0 }], 0, true);
    expect(() => construirCuerpoAlgoBack({ ...base, lineas: grandes })).toThrow(/cliente/);
  });
});

describe('interpretarRespuestaAlgoBack', () => {
  it('aceptado: trae código de seguridad, fecha de firma y trackId', () => {
    const r = interpretarRespuestaAlgoBack({ codigoSeguridad: 'AbC123', fechaFirma: '25-10-2026 21:30:05', dgii: { estado: 'Aceptado', trackId: 'T-1', codigo: '1' } }, 200);
    expect(r).toMatchObject({ estado: 'Aceptado', trackId: 'T-1', codigoSeguridad: 'AbC123', reintentable: false });
    expect(r.fechaFirma?.toISOString()).toBe('2026-10-26T01:30:05.000Z');
    expect(r.fechaFirmaTexto).toBe('25-10-2026 21:30:05');
  });
  it('rechazado por la DGII no se reintenta y conserva los mensajes', () => {
    const r = interpretarRespuestaAlgoBack({ dgii: { estado: 'Rechazado', codigo: '2', mensajes: [{ valor: 'RNC comprador inválido' }] } }, 200);
    expect(r).toMatchObject({ estado: 'Rechazado', reintentable: false });
    expect(r.mensaje).toContain('RNC comprador inválido');
  });
  it('en proceso se vuelve a consultar', () => {
    expect(interpretarRespuestaAlgoBack({ dgii: { estado: 'En Proceso', trackId: 'T-2' } }, 200)).toMatchObject({ estado: 'Procesando', reintentable: true });
  });
  it('aceptado condicional', () => {
    expect(interpretarRespuestaAlgoBack({ dgii: { estado: 'Aceptado Condicional', codigo: '4' } }, 200).estado).toBe('Aceptado Condicional');
  });
  it('401 no se reintenta; 429 y 5xx sí', () => {
    expect(interpretarRespuestaAlgoBack({}, 401)).toMatchObject({ estado: 'Pendiente', reintentable: false });
    expect(interpretarRespuestaAlgoBack({}, 429)).toMatchObject({ estado: 'Pendiente', reintentable: true });
    expect(interpretarRespuestaAlgoBack({}, 503)).toMatchObject({ estado: 'Pendiente', reintentable: true });
    expect(interpretarRespuestaAlgoBack(null, 502)).toMatchObject({ estado: 'Pendiente', reintentable: true });
  });
  it('error de validación (400) queda rechazado con el mensaje del proveedor', () => {
    const r = interpretarRespuestaAlgoBack({ error: true, mensajes: ['Falta RNCComprador'] }, 400);
    expect(r).toMatchObject({ estado: 'Rechazado', reintentable: false });
    expect(r.mensaje).toContain('Falta RNCComprador');
  });
  it('parsea la fecha de firma como hora de Santo Domingo', () => {
    expect(parsearFechaFirma('25-10-2026 21:30:05')?.toISOString()).toBe('2026-10-26T01:30:05.000Z');
    expect(parsearFechaFirma('ayer')).toBeNull();
  });
});
