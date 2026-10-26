import { describe, it, expect } from 'vitest';
import {
  FECHA_CORTE_ECF_POR_DEFECTO,
  ambienteDeConfiguracion,
  construirUrlConsultaTimbre,
  esENcfValido,
  estadoCorteEcf,
  fechaDdMmYyyy,
  fechaHoraDdMmYyyy,
  formatearComprobante,
  hoyEnRepublicaDominicana,
  maximoSecuencial,
  resolverTipoComprobante,
  tituloComprobante,
  validarComprador,
} from '../../../src/lib/comprobantes.js';

describe('estadoCorteEcf', () => {
  it('el corte por defecto es el 15 de noviembre de 2026', () => {
    expect(FECHA_CORTE_ECF_POR_DEFECTO).toBe('2026-11-15');
  });
  it('antes del corte el NCF tradicional sigue valiendo y se cuentan los días', () => {
    const e = estadoCorteEcf('2026-11-15', '2026-10-25');
    expect(e).toMatchObject({ obligatorio: false, diasRestantes: 21, fechaCorte: '2026-11-15' });
  });
  it('el mismo día del corte ya es obligatorio, y después también', () => {
    expect(estadoCorteEcf('2026-11-15', '2026-11-15')).toMatchObject({ obligatorio: true, diasRestantes: 0 });
    expect(estadoCorteEcf('2026-11-15', '2026-12-01')).toMatchObject({ obligatorio: true, diasRestantes: -16 });
  });
  it('una fecha de corte inválida o vacía usa la de por defecto', () => {
    expect(estadoCorteEcf('mañana', '2026-10-25').fechaCorte).toBe('2026-11-15');
    expect(estadoCorteEcf(null, '2026-10-25').fechaCorte).toBe('2026-11-15');
    expect(estadoCorteEcf('2026-02-31', '2026-10-25').fechaCorte).toBe('2026-11-15');
  });
  it('hoy se calcula en hora de Santo Domingo, no en UTC', () => {
    // 02:00 UTC del 16 es todavía el 15 por la noche en Santo Domingo (UTC-4).
    expect(hoyEnRepublicaDominicana(new Date('2026-11-16T02:00:00Z'))).toBe('2026-11-15');
    expect(hoyEnRepublicaDominicana(new Date('2026-11-16T05:00:00Z'))).toBe('2026-11-16');
  });
});

describe('resolverTipoComprobante', () => {
  it('sin tipo: B02 antes del corte (como antes) y E32 desde el corte', () => {
    expect(resolverTipoComprobante('', false)).toBe('B02');
    expect(resolverTipoComprobante(undefined, true)).toBe('E32');
  });
  it('acepta los tipos electrónicos y el antiguo "e-CF" como consumo electrónico', () => {
    expect(resolverTipoComprobante('E31', true)).toBe('E31');
    expect(resolverTipoComprobante('e32', true)).toBe('E32');
    expect(resolverTipoComprobante('e-CF', false)).toBe('E32');
  });
  it('antes del corte permite el NCF tradicional', () => {
    expect(resolverTipoComprobante('B01', false)).toBe('B01');
  });
  it('desde el corte rechaza el NCF tradicional con el equivalente electrónico en el mensaje', () => {
    expect(() => resolverTipoComprobante('B02', true, '2026-11-15')).toThrow(/15\/11\/2026.*E32/);
    expect(() => resolverTipoComprobante('B01', true)).toThrow(/E31/);
    expect(() => resolverTipoComprobante('B15', true)).toThrow(/E45/);
    expect(() => resolverTipoComprobante('B14', true)).toThrow(/E44/);
  });
  it('un tipo desconocido ya no se cambia en silencio por B02', () => {
    expect(() => resolverTipoComprobante('X99', false)).toThrow(/no válido/);
    expect(() => resolverTipoComprobante('E34', true)).toThrow(/no válido/);
  });
});

describe('validarComprador', () => {
  it('crédito fiscal exige RNC válido y razón social', () => {
    expect(() => validarComprador('E31', 100, '', 'ACME SRL')).toThrow(/RNC o la cédula/);
    expect(() => validarComprador('E31', 100, '130000015', '')).toThrow(/razón social/);
    expect(() => validarComprador('E31', 100, '123456789', 'ACME')).toThrow(/no es válido/);
  });
  it('acepta un RNC válido con guiones y lo devuelve normalizado', () => {
    const ok = validarComprador('E31', 100, '1-31-00000-4', ' ACME SRL ');
    expect(ok.rnc).toBe('131000004');
    expect(ok.razonSocial).toBe('ACME SRL');
  });
  it('el consumo solo exige comprador desde RD$ 250,000', () => {
    expect(validarComprador('E32', 249_999.99, '', '')).toEqual({ rnc: '', razonSocial: '' });
    expect(() => validarComprador('E32', 250_000, '', '')).toThrow(/RNC o la cédula/);
  });
  it('si se escribe un documento en un consumo, debe ser válido', () => {
    expect(() => validarComprador('E32', 100, '123', 'Juan')).toThrow(/no es válido/);
  });
});

describe('e-NCF', () => {
  it('lleva E + tipo + 10 dígitos (13 caracteres); el NCF tradicional, 8', () => {
    expect(formatearComprobante('E32', 1)).toBe('E320000000001');
    expect(formatearComprobante('E31', 1234567890)).toBe('E311234567890');
    expect(formatearComprobante('B02', 7)).toBe('B0200000007');
  });
  it('valida el formato del e-NCF', () => {
    expect(esENcfValido('E320000000001')).toBe(true);
    expect(esENcfValido('E32000001')).toBe(false);
    expect(esENcfValido('B0200000001')).toBe(false);
    expect(esENcfValido('E990000000001')).toBe(false);
  });
  it('el máximo del secuencial depende del formato', () => {
    expect(maximoSecuencial('E32')).toBe(9_999_999_999);
    expect(maximoSecuencial('B02')).toBe(99_999_999);
  });
  it('títulos de la representación impresa', () => {
    expect(tituloComprobante('E31')).toBe('Factura de Crédito Fiscal Electrónica');
    expect(tituloComprobante('E32')).toBe('Factura de Consumo Electrónica');
    expect(tituloComprobante('e-CF')).toBe('Factura de Consumo Electrónica');
  });
});

describe('construirUrlConsultaTimbre', () => {
  const base = { rncEmisor: '131000001', encf: 'E310000000001', fechaEmision: '25-10-2026', fechaFirma: '25-10-2026 21:30:05', codigoSeguridad: 'AbC123', montoTotal: 1180 };
  it('crédito fiscal: ConsultaTimbre con comprador, fecha de emisión y de firma', () => {
    const url = construirUrlConsultaTimbre({ ...base, ambiente: 'Produccion', tipo: 'E31', rncComprador: '101000013' });
    expect(url).toBe('https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=131000001&RncComprador=101000013&ENCF=E310000000001&FechaEmision=25-10-2026&MontoTotal=1180.00&FechaFirma=25-10-2026%2021%3A30%3A05&CodigoSeguridad=AbC123');
  });
  it('consumo menor a RD$ 250,000: consulta de resumen en fc.dgii.gov.do', () => {
    const url = construirUrlConsultaTimbre({ ...base, ambiente: 'Produccion', tipo: 'E32', encf: 'E320000000001' });
    expect(url).toBe('https://fc.dgii.gov.do/ecf/ConsultaTimbreFC?RncEmisor=131000001&ENCF=E320000000001&MontoTotal=1180.00&CodigoSeguridad=AbC123');
  });
  it('consumo de RD$ 250,000 o más usa la consulta completa', () => {
    expect(construirUrlConsultaTimbre({ ...base, ambiente: 'Produccion', tipo: 'E32', montoTotal: 250_000 })).toContain('ecf.dgii.gov.do/ecf/ConsultaTimbre?');
  });
  it('pruebas y certificación usan testecf y certecf', () => {
    expect(construirUrlConsultaTimbre({ ...base, ambiente: 'Pruebas', tipo: 'E31' })).toContain('/testecf/ConsultaTimbre');
    expect(construirUrlConsultaTimbre({ ...base, ambiente: 'Certificacion', tipo: 'E31' })).toContain('/certecf/ConsultaTimbre');
  });
});

describe('ambienteDeConfiguracion', () => {
  it('AlgoBack: PROD es producción; todo lo demás, pruebas', () => {
    expect(ambienteDeConfiguracion({ proveedor_ecf: 'algoback', algoback_ambiente: 'PROD' })).toBe('Produccion');
    expect(ambienteDeConfiguracion({ proveedor_ecf: 'algoback', algoback_ambiente: 'TEST' })).toBe('Pruebas');
    expect(ambienteDeConfiguracion({})).toBe('Pruebas');
  });
  it('MSeller: usa el ambiente de la DGII', () => {
    expect(ambienteDeConfiguracion({ proveedor_ecf: 'mseller', ambiente: 'Producción' })).toBe('Produccion');
    expect(ambienteDeConfiguracion({ proveedor_ecf: 'mseller', ambiente: 'Certificacion' })).toBe('Certificacion');
    expect(ambienteDeConfiguracion({ proveedor_ecf: 'mseller', ambiente: 'TesteCF' })).toBe('Pruebas');
  });
});

describe('fechas del comprobante', () => {
  it('dd-MM-yyyy y dd-MM-yyyy HH:mm:ss en hora de Santo Domingo', () => {
    expect(fechaDdMmYyyy(new Date('2026-10-26T02:30:00Z'))).toBe('25-10-2026');
    expect(fechaHoraDdMmYyyy(new Date('2026-10-26T02:30:05Z'))).toBe('25-10-2026 22:30:05');
  });
});
