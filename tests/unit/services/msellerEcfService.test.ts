import { describe, it, expect } from 'vitest';
import {
  BASE_URL_MSELLER,
  ENTORNOS_MSELLER,
  LIMITE_LOTE_CONSULTA,
  mapearEntornoMseller,
  esEntornoMseller,
  baseUrlMseller,
  tieneCredencialesMseller,
  construirHeadersMseller,
  obtenerMensajeErrorMseller,
  parsearDgiiResponse,
  mapearEstadoMsellerAEstadoLocal,
  autenticarMseller,
  enviarDocumentoMseller,
  consultarEstadoMseller,
  consultarEstadoLoteMseller,
  anularNCFMseller,
} from '../../../src/services/msellerEcfService.js';
import type { IMsellerConfig, FetchFn, IMsellerSesion } from '../../../src/services/msellerEcfService.js';

function respuestaMock(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const configBase: IMsellerConfig = {
  email: 'emisor@chloe.test',
  password: 'secreto',
  apiKey: 'api-key-123',
  ambiente: 'Pruebas',
};

function fetchDe(body: unknown, status = 200): FetchFn {
  return async (url: string, init?: RequestInit) => {
    const urlObj = new URL(String(url));
    const llamado = { url: urlObj, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ?? null };
    (fetchDe as unknown as { ultimoLlamado?: unknown }).ultimoLlamado = llamado;
    return respuestaMock(body, status) as Response;
  };
}

describe('mapearEntornoMseller', () => {
  it('mapea TEST / Pruebas / vacío a TesteCF', () => {
    expect(mapearEntornoMseller('TEST')).toBe('TesteCF');
    expect(mapearEntornoMseller('Pruebas')).toBe('TesteCF');
    expect(mapearEntornoMseller(null)).toBe('TesteCF');
    expect(mapearEntornoMseller(undefined)).toBe('TesteCF');
  });

  it('mapea CERT o estado en certificación a CerteCF', () => {
    expect(mapearEntornoMseller('CERT')).toBe('CerteCF');
    expect(mapearEntornoMseller('PRUEBAS', 'En Certificación')).toBe('CerteCF');
  });

  it('mapea PROD / eCF a eCF', () => {
    expect(mapearEntornoMseller('PROD')).toBe('eCF');
    expect(mapearEntornoMseller('eCF')).toBe('eCF');
  });
});

describe('esEntornoMseller / baseUrlMseller', () => {
  it('acepta solo los tres entornos soportados', () => {
    expect(esEntornoMseller('TesteCF')).toBe(true);
    expect(esEntornoMseller('CerteCF')).toBe(true);
    expect(esEntornoMseller('eCF')).toBe(true);
    expect(esEntornoMseller('Pruebas')).toBe(false);
    expect(esEntornoMseller(null)).toBe(false);
  });

  it('compone la base URL por entorno', () => {
    expect(baseUrlMseller('TesteCF')).toBe(`${BASE_URL_MSELLER}/TesteCF`);
    expect(baseUrlMseller('eCF')).toBe(`${BASE_URL_MSELLER}/eCF`);
  });

  it('lanza 400 para un entorno desconocido', () => {
    expect(() => baseUrlMseller('NOPE')).toThrow();
    const err = (() => {
      try {
        baseUrlMseller('NOPE');
      } catch (e) {
        return e as { statusCode?: number };
      }
      return null;
    })();
    expect(err?.statusCode).toBe(400);
  });
});

describe('tieneCredencialesMseller', () => {
  it('es false si falta email, password o API Key', () => {
    expect(tieneCredencialesMseller({ email: 'a', password: 'b', apiKey: null })).toBe(false);
    expect(tieneCredencialesMseller({ email: 'a', password: null, apiKey: 'k' })).toBe(false);
    expect(tieneCredencialesMseller({ email: null, password: 'b', apiKey: 'k' })).toBe(false);
    expect(tieneCredencialesMseller(null)).toBe(false);
  });

  it('es true con email, password y API Key', () => {
    expect(tieneCredencialesMseller(configBase)).toBe(true);
  });
});

describe('construirHeadersMseller', () => {
  it('incluye Bearer y API Key cuando existe', () => {
    const h = construirHeadersMseller('token-1', 'key-1');
    expect(h.Authorization).toBe('Bearer token-1');
    expect(h['X-API-KEY']).toBe('key-1');
  });

  it('omite X-API-KEY cuando no hay API Key (ANECF)', () => {
    const h = construirHeadersMseller('token-1');
    expect(h['X-API-KEY']).toBeUndefined();
  });
});

describe('obtenerMensajeErrorMseller', () => {
  it('prioriza mensaje/error/detail del body', () => {
    expect(obtenerMensajeErrorMseller({ error: 'credenciales inválidas' }, 'fallback')).toBe('credenciales inválidas');
    expect(obtenerMensajeErrorMseller({ detail: 'x' }, 'fallback')).toBe('x');
    expect(obtenerMensajeErrorMseller({ otro: 1 }, 'fallback')).toBe('fallback');
    expect(obtenerMensajeErrorMseller(null, 'fallback')).toBe('fallback');
  });
});

describe('parsearDgiiResponse', () => {
  it('convierte los strings JSON del array en objetos', () => {
    const r = parsearDgiiResponse([
      '{"codigo":"2","estado":"Rechazado","encf":"E310000510916","mensajes":[{"valor":"MontoGravadoTotal inválido","codigo":1920}]}',
      'no-es-json',
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].estado).toBe('Rechazado');
    expect(r[0].mensajes[0].codigo).toBe(1920);
  });

  it('devuelve [] sin lista o con lista vacía', () => {
    expect(parsearDgiiResponse(undefined)).toEqual([]);
    expect(parsearDgiiResponse([])).toEqual([]);
  });
});

describe('mapearEstadoMsellerAEstadoLocal', () => {
  it('mapea estados MSeller al vocabulario local', () => {
    expect(mapearEstadoMsellerAEstadoLocal('RECIBIDO')).toBe('Pendiente');
    expect(mapearEstadoMsellerAEstadoLocal('PROCESANDO')).toBe('Procesando');
    expect(mapearEstadoMsellerAEstadoLocal('Aceptado')).toBe('Aceptado');
    expect(mapearEstadoMsellerAEstadoLocal('Rechazado')).toBe('Rechazado');
    expect(mapearEstadoMsellerAEstadoLocal('Error')).toBe('Error');
    expect(mapearEstadoMsellerAEstadoLocal('Aceptado Condicional')).toBe('Aceptado Condicional');
  });

  it('devuelve el texto tal cual para estados desconocidos', () => {
    expect(mapearEstadoMsellerAEstadoLocal('Anulado')).toBe('Anulado');
    expect(mapearEstadoMsellerAEstadoLocal(null)).toBe('');
  });
});

describe('autenticarMseller', () => {
  it('rechaza con 400 credenciales incompletas', async () => {
    const err = await autenticarMseller({ email: 'a' }).catch((e) => e);
    expect(err.statusCode).toBe(400);
  });

  it('POST /{entorno}/customer/authentication y devuelve la sesión', async () => {
    const fetchFn = fetchDe({ idToken: 'id-1', accessToken: 'acc-1', refreshToken: 'ref-1' });
    const sesion = await autenticarMseller(configBase, { fetchFn });
    expect(sesion.idToken).toBe('id-1');
    expect(sesion.environment).toBe('TesteCF');
    expect(sesion.baseUrl).toBe(`${BASE_URL_MSELLER}/TesteCF`);
    const llamado = (fetchDe as unknown as { ultimoLlamado: { url: URL; path?: string } }).ultimoLlamado;
    expect(llamado.url.pathname).toBe('/TesteCF/customer/authentication');
  });

  it('lanza 401 si la respuesta no trae idToken', async () => {
    const err = await autenticarMseller(configBase, { fetchFn: fetchDe({ ok: true }) }).catch((e) => e);
    expect(err.statusCode).toBe(401);
  });

  it('lanza el mensaje de error cuando MSeller responde 401/403', async () => {
    const err = await autenticarMseller(configBase, {
      fetchFn: fetchDe({ error: 'credenciales inválidas' }, 401) as FetchFn,
    }).catch((e) => e);
    expect(err.statusCode).toBe(401);
    expect(String(err.message)).toContain('credenciales inválidas');
  });
});

describe('enviarDocumentoMseller', () => {
  const sesion: IMsellerSesion = { environment: 'TesteCF', baseUrl: `${BASE_URL_MSELLER}/TesteCF`, idToken: 'id-1' };
  const comprobante = { ECF: { Encabezado: { IdDoc: { eNCF: 'E3200000001' } } } };

  it('requiere sesión y API Key', async () => {
    const sinSesion = await enviarDocumentoMseller(configBase, {} as IMsellerSesion, comprobante).catch((e) => e);
    expect(sinSesion.statusCode).toBe(401);
    const sinKey = await enviarDocumentoMseller({ ...configBase, apiKey: null }, sesion, comprobante).catch((e) => e);
    expect(sinKey.statusCode).toBe(400);
  });

  it('POST /documentos-ecf con las cabeceras y normaliza la respuesta', async () => {
    const fetchFn = fetchDe({ rnc: '130862346', ecf: 'E3200000001', internalTrackId: 't-1', securityCode: 'AB12CD', qr_url: 'https://qr' }, 201);
    const res = await enviarDocumentoMseller(configBase, sesion, comprobante, { fetchFn });
    expect(res.ecf).toBe('E3200000001');
    expect(res.internalTrackId).toBe('t-1');
    expect(res.codigoSeguridad).toBe('AB12CD');
    expect(res.qrUrl).toBe('https://qr');
    const llamado = (fetchDe as unknown as { ultimoLlamado: { url: URL; headers: Record<string, string> } }).ultimoLlamado;
    expect(llamado.url.pathname).toBe('/TesteCF/documentos-ecf');
    expect(llamado.headers['X-API-KEY']).toBe('api-key-123');
    expect(String(llamado.headers.Authorization)).toContain('Bearer id-1');
  });

  it('agrega ?validate=true cuando se pide validar', async () => {
    const fetchFn = fetchDe({ ecf: 'E3200000001', internalTrackId: 't-1' }, 201);
    await enviarDocumentoMseller(configBase, sesion, comprobante, { fetchFn, validar: true });
    const llamado = (fetchDe as unknown as { ultimoLlamado: { url: URL } }).ultimoLlamado;
    expect(llamado.url.searchParams.get('validate')).toBe('true');
  });
});

describe('consultarEstadoMseller', () => {
  const sesion: IMsellerSesion = { environment: 'TesteCF', baseUrl: `${BASE_URL_MSELLER}/TesteCF`, idToken: 'id-1' };

  it('GET /documentos-ecf?ecf=... y parsea dgiiResponse', async () => {
    const fetchFn = fetchDe({
      ncf: 'E3100000001',
      status: 'Aceptado',
      securityCode: 'hhABiM',
      signedXml: '130862346/documents/TesteCF/130862346E3100000001.xml',
      dgiiResponse: ['{"codigo":"1","estado":"Aceptado"}'],
    });
    const res = await consultarEstadoMseller(configBase, sesion, 'E3100000001', { fetchFn });
    expect(res.estado).toBe('Aceptado');
    expect(res.ecf).toBe('E3100000001');
    expect(res.dgiiResponse).toHaveLength(1);
    const llamado = (fetchDe as unknown as { ultimoLlamado: { url: URL } }).ultimoLlamado;
    expect(llamado.url.searchParams.get('ecf')).toBe('E3100000001');
  });

  it('rechaza sin sesión o sin API Key', async () => {
    const sinSesion = await consultarEstadoMseller(configBase, {} as IMsellerSesion, 'E3100000001').catch((e) => e);
    expect(sinSesion.statusCode).toBe(401);
    const sinKey = await consultarEstadoMseller({ ...configBase, apiKey: null }, sesion, 'E3100000001').catch((e) => e);
    expect(sinKey.statusCode).toBe(400);
  });
});

describe('consultarEstadoLoteMseller', () => {
  const sesion: IMsellerSesion = { environment: 'TesteCF', baseUrl: `${BASE_URL_MSELLER}/TesteCF`, idToken: 'id-1' };

  it('POST /status/batch con {ecfs} y devuelve total + results', async () => {
    const fetchFn = fetchDe({ total: 2, results: [{ ecf: 'E3100000001', status: 'Aceptado', found: true }] });
    const res = await consultarEstadoLoteMseller(configBase, sesion, ['E3100000001', 'E3100000002'], { fetchFn });
    expect(res.total).toBe(2);
    expect(res.results).toHaveLength(1);
    const llamado = (fetchDe as unknown as { ultimoLlamado: { url: URL; body: string } }).ultimoLlamado;
    expect(llamado.url.pathname).toBe('/TesteCF/documentos-ecf/status/batch');
    expect(JSON.parse(String(llamado.body)).ecfs).toEqual(['E3100000001', 'E3100000002']);
  });

  it('valida el límite máximo de 100 e-CF', async () => {
    const muchos = Array.from({ length: LIMITE_LOTE_CONSULTA + 1 }, (_, i) => `E3${String(i).padStart(9, '0')}`);
    const err = await consultarEstadoLoteMseller(configBase, sesion, muchos).catch((e) => e);
    expect(err.statusCode).toBe(400);
  });
});

describe('anularNCFMseller', () => {
  const sesion: IMsellerSesion = { environment: 'eCF', baseUrl: `${BASE_URL_MSELLER}/eCF`, idToken: 'id-1' };

  it('POST /customer/void-ncf (sin X-API-KEY) con los rangos', async () => {
    const fetchFn = fetchDe({ ok: true });
    await anularNCFMseller(sesion, [{ secuenciaDesde: '0000000001', secuenciaHasta: '0000000005' }], { fetchFn });
    const llamado = (fetchDe as unknown as { ultimoLlamado: { url: URL; headers: Record<string, string>; body: string } }).ultimoLlamado;
    expect(llamado.url.pathname).toBe('/eCF/customer/void-ncf');
    expect(llamado.headers['X-API-KEY']).toBeUndefined();
    expect(JSON.parse(String(llamado.body)).ranges).toHaveLength(1);
  });

  it('rechaza rangos inválidos o sin sesión', async () => {
    const sinonRango = await anularNCFMseller(sesion, [], {}).catch((e) => e);
    expect(sinonRango.statusCode).toBe(400);
    const rangoInvalido = await anularNCFMseller(sesion, [{ secuenciaDesde: 10, secuenciaHasta: 5 }]).catch((e) => e);
    expect(rangoInvalido.statusCode).toBe(400);
    const sinSesion = await anularNCFMseller({} as IMsellerSesion, [{ secuenciaDesde: 1, secuenciaHasta: 2 }]).catch((e) => e);
    expect(sinSesion.statusCode).toBe(401);
  });
});

describe('entornos exportados', () => {
  it('expone los tres entornos', () => {
    expect(ENTORNOS_MSELLER).toEqual(['TesteCF', 'CerteCF', 'eCF']);
  });
});