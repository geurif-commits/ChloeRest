import { describe, it, expect } from 'vitest';
import { ENVIRONMENT } from 'dgii-ecf';
import {
  mapearAmbiente,
  tieneCredencialesDirectas,
  construirNombreArchivo,
  calcularMontoTotal,
  jsonAECFXML,
  emitirECFDirecto,
  crearClienteDGII,
  type IDgiiEcfConfig,
} from '../../../src/services/dgiiEcfService.js';
import { httpError } from '../../../src/lib/core.js';

describe('mapearAmbiente', () => {
  it('mapea TEST / Pruebas / vacío a TesteCF', () => {
    expect(mapearAmbiente('TEST')).toBe(ENVIRONMENT.DEV);
    expect(mapearAmbiente('Pruebas')).toBe(ENVIRONMENT.DEV);
    expect(mapearAmbiente(null)).toBe(ENVIRONMENT.DEV);
    expect(mapearAmbiente(undefined)).toBe(ENVIRONMENT.DEV);
  });

  it('mapea CERT y sus variantes a CerteCF', () => {
    expect(mapearAmbiente('CERT')).toBe(ENVIRONMENT.CERT);
    expect(mapearAmbiente('CerteCF')).toBe(ENVIRONMENT.CERT);
    expect(mapearAmbiente('Pre-certificacion')).toBe(ENVIRONMENT.CERT);
  });

  it('mapea PROD / eCF a producción', () => {
    expect(mapearAmbiente('PROD')).toBe(ENVIRONMENT.PROD);
    expect(mapearAmbiente('eCF')).toBe(ENVIRONMENT.PROD);
    expect(mapearAmbiente('Produccion')).toBe(ENVIRONMENT.PROD);
  });
});

describe('tieneCredencialesDirectas', () => {
  it('es false sin client_secret o sin passphrase', () => {
    expect(tieneCredencialesDirectas({ rnc_emisor: 'X', client_secret: 's', clave_certificado: null })).toBe(false);
    expect(tieneCredencialesDirectas({ rnc_emisor: 'X', client_secret: null, clave_certificado: 'p' })).toBe(false);
    expect(tieneCredencialesDirectas(null)).toBe(false);
    expect(tieneCredencialesDirectas(undefined)).toBe(false);
  });

  it('es true con client_secret y clave_certificado', () => {
    const cfg: IDgiiEcfConfig = { rnc_emisor: '130862346', client_secret: 'secret', clave_certificado: 'pass' };
    expect(tieneCredencialesDirectas(cfg)).toBe(true);
  });
});

describe('construirNombreArchivo', () => {
  it('normaliza el RNC y compone RNC + e-NCF + .xml', () => {
    expect(construirNombreArchivo('130-862346-0', 'E3100000001')).toBe('1308623460E3100000001.xml');
  });

  it('limpia espacios del e-NCF', () => {
    expect(construirNombreArchivo('130862346', ' E3200000002 ')).toBe('130862346E3200000002.xml');
  });
});

describe('calcularMontoTotal', () => {
  it('suma gravado + exento + ITBIS (item 18%, precio sin ITBIS)', () => {
    const total = calcularMontoTotal([{ cantidad: 1, precio_unitario: 100, tasa_itbis: 18 }]);
    expect(total).toBe(118);
  });

  it('trata tasa 0 como exento', () => {
    const total = calcularMontoTotal([{ cantidad: 2, precio_unitario: 50, tasa_itbis: 0 }]);
    expect(total).toBe(100);
  });
});

describe('jsonAECFXML', () => {
  it('produce XML con el e-NCF en el contenido', () => {
    const xml = jsonAECFXML({ ECF: { Encabezado: { IdDoc: { eNCF: 'E3100000001' } } } });
    expect(typeof xml).toBe('string');
    expect(xml.trim().startsWith('<')).toBe(true);
    expect(xml).toContain('E3100000001');
  });
});

describe('emitirECFDirecto (validación, sin red)', () => {
  it('rechaza cuando falta el certificado', async () => {
    const params = {
      config: { rnc_emisor: '130862346', client_secret: 's', clave_certificado: 'p' },
      tipoECF: 32,
      ncf: 'E3200000001',
      detalles: [{ cantidad: 1, precio_unitario: 100, tasa_itbis: 18 }],
    };
    const error = await emitirECFDirecto(params).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect((error as { message: string }).message).toContain('certificado');
  });

  it('rechaza credenciales incompletas por debajo de crearClienteDGII', async () => {
    const error = await crearClienteDGII(
      { rnc_emisor: '130862346', client_secret: null, clave_certificado: null },
      { passphrase: 'x' }
    ).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { message: string }).message).toContain('Credenciales directas DGII incompletas');
  });
});

describe('httpError shape', () => {
  it('expone código de error como statusCode', () => {
    const err = httpError(400, 'test');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('test');
  });
});