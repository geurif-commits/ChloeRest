/**
 * @file Servicio de e-CF vía MSeller ECF (https://docs.ecf.mseller.app) como
 * 2.º proveedor frente a AlgoBack y a la ruta directa `dgii-ecf`. MSeller
 * recibe el JSON DGII (salida de `construirECF`) y él mismo firma, envía y
 * almacena el XML; expone envío asíncrono, consulta individual/lote y
 * anulación de rangos de e-NCF (ANECF).
 *
 * PIEZAS PREPARADAS: todavía NO conectado a ningún router. El router que lo
 * consuma deberá leer `dgii_config` (email/password/API Key + ambiente del
 * tenant), llamar a `autenticarMseller` para obtener la sesión (idToken) y
 * luego `enviarDocumentoMseller` / `consultarEstadoMseller` /
 * `consultarEstadoLoteMseller` / `anularNCFMseller`.
 *
 * Nota de seguridad: email/password/API Key deben guardarse cifrados en BD;
 * esta capa solo los utiliza en memoria.
 */

/* global fetch, Response, RequestInit, AbortController, clearTimeout */

import { httpError, sleep } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('msellerEcf');

export const BASE_URL_MSELLER = 'https://ecf.api.mseller.app';
export const ENTORNOS_MSELLER = ['TesteCF', 'CerteCF', 'eCF'] as const;

export const LIMITE_LOTE_CONSULTA = 100;
export const TIMEOUT_DEFAULT_MS = 15000;
/** Entre envío y primera consulta MSeller procesa de forma asíncrona. */
export const INTERVALO_POLLING_MS = 2500;
export const MAX_INTENTOS_POLLING = 8;

/** Estados de DGII/MSeller considerados finales (detener el polling). */
export const ESTADOS_FINALES_MSELLER = new Set(['Aceptado', 'Rechazado', 'Error', 'Aceptado Condicional']);

export type IEntornoMseller = (typeof ENTORNOS_MSELLER)[number];

/** Cliente HTTP inyectable para pruebas offline (por defecto global fetch). */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Credenciales/ambiente que un router leerá de `dgii_config`. */
export interface IMsellerConfig {
  email?: string | null;
  password?: string | null;
  apiKey?: string | null;
  ambiente?: string | null;
  estadoEcf?: string | null;
}

/** Sesión autenticada: los tokens son cortos, el router debe refrescarla. */
export interface IMsellerSesion {
  environment: IEntornoMseller;
  baseUrl: string;
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
}

/** Resultado de `enviarDocumentoMseller` (respuesta inmediata, proceso asíncrono). */
export interface IMsellerEnvioResultado {
  rnc?: string;
  ecf?: string;
  internalTrackId?: string;
  codigoSeguridad?: string;
  qrUrl?: string;
  signedXml?: string;
  environment: IEntornoMseller;
  raw: unknown;
}

/** Resultado de `consultarEstadoMseller` (consulta individual). */
export interface IMsellerConsultaResultado {
  ecf?: string;
  estado?: string;
  internalTrackId?: string;
  securityCode?: string;
  qrUrl?: string;
  signedXml?: string;
  dgiiResponse: unknown[];
  environment: IEntornoMseller;
  raw: unknown;
}

/** Respuesta de DGII ya parseada (los strings JSON de `dgiiResponse`). */
export interface IDgiiRespuesta {
  trackId?: string;
  codigo?: string;
  estado?: string;
  rnc?: string;
  encf?: string;
  fechaRecepcion?: string;
  mensajes: { valor?: string; codigo?: number }[];
}

/** Rango de secuencias de e-NCF a anular (ANECF). */
export interface IMsellerRangoAnulacion {
  secuenciaDesde: number | string;
  secuenciaHasta: number | string;
}

/** Opciones comunes: cliente HTTP inyectable y timeout. */
export interface IMsellerOpciones {
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

/** Opciones de envío: `validar` = ?validate=true (no consume e-NCF). */
export interface IMsellerEnviarOpciones extends IMsellerOpciones {
  validar?: boolean;
}

/**
 * Mapea el ambiente almacenado (AlgoBack/DGII) al entorno MSeller.
 * 'TEST'/'Pruebas' y vacíos -> TesteCF, 'CERT' o estado en certificación ->
 * CerteCF, 'PROD'/'eCF' -> eCF.
 */
export function mapearEntornoMseller(ambiente: string | null | undefined, estadoEcf?: string | null): IEntornoMseller {
  const raw = String(ambiente ?? '').toUpperCase();
  const estado = String(estadoEcf ?? '').toUpperCase();
  if (raw.includes('CERT') || estado.includes('CERTIF')) {
    return 'CerteCF';
  }
  if (raw === 'PROD' || raw === 'ECF' || raw === 'PRODUCCION') {
    return 'eCF';
  }
  return 'TesteCF';
}

/** Valida que un entorno MSeller sea uno de los tres soportados. */
export function esEntornoMseller(valor: string | null | undefined): valor is IEntornoMseller {
  return ENTORNOS_MSELLER.includes(valor as IEntornoMseller);
}

/** Base URL de MSeller para un entorno (valida el entorno). */
export function baseUrlMseller(valor: string | null | undefined): string {
  if (!esEntornoMseller(valor)) {
    throw httpError(400, `Entorno MSeller inválido: ${valor}`, 'MSELLER_ENTORNO_INVALIDO');
  }
  return `${BASE_URL_MSELLER}/${valor as IEntornoMseller}`;
}

/** Indica si hay credenciales mínimas para autenticarse en MSeller. */
export function tieneCredencialesMseller(config: IMsellerConfig | null | undefined): boolean {
  return Boolean(config?.email) && Boolean(config?.password) && Boolean(config?.apiKey);
}

/** Encabezados requeridos por MSeller. El ANECF solo usa Bearer (sin API Key). */
export function construirHeadersMseller(idToken: string, apiKey?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['X-API-KEY'] = apiKey;
  }
  return headers;
}

/** Parsea el JSON de un body, tolerando respuestas vacías/HTML. */
export async function parsearBodyJson(respuesta: Response): Promise<unknown> {
  try {
    return (await respuesta.json()) as unknown;
  } catch {
    return null;
  }
}

/** Extrae el primer texto de error utilizable del body (mensaje/localizado). */
export function obtenerMensajeErrorMseller(body: Record<string, unknown> | null | undefined, fallback: string): string {
  if (body) {
    for (const campo of ['mensaje', 'error', 'message', 'detail']) {
      const valor = body[campo];
      if (typeof valor === 'string' && valor.trim()) {
        return valor.trim();
      }
    }
  }
  return fallback;
}

/** Solicitud HTTP base con timeout; convierte errores HTTP a httpError. */
async function solicitarMseller(
  url: string,
  init: RequestInit,
  opts: IMsellerOpciones
): Promise<unknown> {
  const fetchFn: FetchFn = opts.fetchFn ?? ((u: string, i?: RequestInit) => fetch(u, i as RequestInit));
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_DEFAULT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const respuesta = await fetchFn(url, { ...init, signal: controller.signal });
    const body = (await parsearBodyJson(respuesta)) as Record<string, unknown> | null;
    if (!respuesta.ok) {
      throw httpError(
        respuesta.status || 502,
        `MSeller: ${obtenerMensajeErrorMseller(body, `HTTP ${respuesta.status}`)}`,
        'MSELLER_HTTP_ERROR'
      );
    }
    return body;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw httpError(504, `MSeller: tiempo de espera agotado (${timeoutMs} ms).`, 'MSELLER_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Parsea el array `dgiiResponse` de MSeller (strings JSON uno a uno). */
export function parsearDgiiResponse(lista: unknown | undefined): IDgiiRespuesta[] {
  if (!Array.isArray(lista)) {
    return [];
  }
  const resultado: IDgiiRespuesta[] = [];
  for (const entrada of lista) {
    if (typeof entrada === 'string') {
      try {
        const obj = JSON.parse(entrada) as Record<string, unknown>;
        resultado.push({
          trackId: obj.trackId ? String(obj.trackId) : undefined,
          codigo: obj.codigo !== null && obj.codigo !== undefined ? String(obj.codigo) : undefined,
          estado: obj.estado ? String(obj.estado) : undefined,
          rnc: obj.rnc ? String(obj.rnc) : undefined,
          encf: obj.encf ? String(obj.encf) : undefined,
          fechaRecepcion: obj.fechaRecepcion ? String(obj.fechaRecepcion) : undefined,
          mensajes: Array.isArray(obj.mensajes)
            ? obj.mensajes.map((m) => ({
                valor: (m as { valor?: unknown })?.valor ? String((m as { valor?: unknown })?.valor) : undefined,
                codigo: typeof (m as { codigo?: unknown })?.codigo === 'number' ? ((m as { codigo?: number }).codigo as number) : undefined,
              }))
            : [],
        });
      } catch {
        /* entrada no-JSON: descartar */
      }
    }
  }
  return resultado;
}

/** Mapea un estado MSeller/DGII al vocabulario local de `e_cf_comprobantes`. */
export function mapearEstadoMsellerAEstadoLocal(estado: string | null | undefined): string {
  const norm = String(estado ?? '').trim().toUpperCase();
  const tabla: Record<string, string> = {
    RECIBIDO: 'Pendiente',
    PROCESANDO: 'Procesando',
    PROCESSING: 'Procesando',
    ACEPTADO: 'Aceptado',
    RECHAZADO: 'Rechazado',
    ERROR: 'Error',
    'ACEPTADO CONDICIONAL': 'Aceptado Condicional',
  };
  if (norm in tabla) {
    return tabla[norm];
  }
  return String(estado ?? '').trim();
}

/**
 * Autentica contra MSeller ECF y devuelve la sesión con el `idToken` que
 * usarán las llamadas posteriores.
 */
export async function autenticarMseller(config: IMsellerConfig, opts: IMsellerOpciones = {}): Promise<IMsellerSesion> {
  if (!tieneCredencialesMseller(config)) {
    throw httpError(
      400,
      'Credenciales MSeller incompletas (email/password/API Key). Configura dgii_config.',
      'MSELLER_SIN_CREDENCIALES'
    );
  }
  const environment = mapearEntornoMseller(config.ambiente, config.estadoEcf);
  const baseUrl = `${BASE_URL_MSELLER}/${environment}`;
  const body = (await solicitarMseller(
    `${baseUrl}/customer/authentication`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password }),
    },
    opts
  )) as Record<string, unknown> | null;

  if (!body?.idToken) {
    throw httpError(401, 'MSeller: la autenticación no devolvió idToken.', 'MSELLER_AUTH_FALLIDA');
  }
  const sesion: IMsellerSesion = {
    environment,
    baseUrl,
    idToken: String(body.idToken),
    accessToken: body.accessToken ? String(body.accessToken) : undefined,
    refreshToken: body.refreshToken ? String(body.refreshToken) : undefined,
  };
  logger.info({ action: 'MSELLER_AUTH_OK', environment });
  return sesion;
}

/**
 * Envía un e-CF a MSeller (JSON DGII completo; MSeller firma y procesa).
 * `validar=true` valida sin consumir el e-NCF. El estado final es asíncrono:
 * usar `consultarEstadoMseller` después.
 */
export async function enviarDocumentoMseller(
  config: IMsellerConfig,
  sesion: IMsellerSesion,
  comprobante: Record<string, unknown>,
  opts: IMsellerEnviarOpciones = {}
): Promise<IMsellerEnvioResultado> {
  if (!sesion?.idToken) {
    throw httpError(401, 'MSeller: falta sesión autenticada. Llama a autenticarMseller.', 'MSELLER_SIN_SESION');
  }
  if (!config?.apiKey) {
    throw httpError(400, 'MSeller: falta la API Key para enviar documentos.', 'MSELLER_SIN_API_KEY');
  }
  const query = opts.validar ? '?validate=true' : '';
  const body = (await solicitarMseller(
    `${sesion.baseUrl}/documentos-ecf${query}`,
    {
      method: 'POST',
      headers: construirHeadersMseller(sesion.idToken, config.apiKey),
      body: JSON.stringify(comprobante),
    },
    opts
  )) as Record<string, unknown> | null;

  const pick = (aliases: string[]): string | undefined => {
    for (const a of aliases) {
      const v = body?.[a];
      if (v !== undefined && v !== null && String(v) !== '') {
        return String(v);
      }
    }
    return undefined;
  };

  const resultado: IMsellerEnvioResultado = {
    rnc: pick(['rnc', 'customerId']),
    ecf: pick(['ecf', 'ncf', 'eNCF']),
    internalTrackId: pick(['internalTrackId', 'internal_track_id', 'trackId']),
    codigoSeguridad: pick(['securityCode', 'codigo_seguridad', 'codigoSeguridad']),
    qrUrl: pick(['qr_url', 'qrUrl']),
    signedXml: pick(['signedXml']),
    environment: sesion.environment,
    raw: body,
  };
  logger.info({
    action: 'MSELLER_ECF_ENVIADO',
    environment: sesion.environment,
    ecf: resultado.ecf,
    internalTrackId: resultado.internalTrackId,
    validar: Boolean(opts.validar),
  });
  return resultado;
}

/** Consulta el estado de un e-CF individual ante MSeller. */
export async function consultarEstadoMseller(
  config: IMsellerConfig,
  sesion: IMsellerSesion,
  ncf: string,
  opts: IMsellerOpciones = {}
): Promise<IMsellerConsultaResultado> {
  if (!sesion?.idToken) {
    throw httpError(401, 'MSeller: falta sesión autenticada. Llama a autenticarMseller.', 'MSELLER_SIN_SESION');
  }
  if (!config?.apiKey) {
    throw httpError(400, 'MSeller: falta la API Key para consultar documentos.', 'MSELLER_SIN_API_KEY');
  }
  if (!String(ncf).trim()) {
    throw httpError(400, 'MSeller: el e-NCF a consultar es obligatorio.', 'MSELLER_SIN_NCF');
  }
  const body = (await solicitarMseller(
    `${sesion.baseUrl}/documentos-ecf?ecf=${encodeURIComponent(ncf)}`,
    {
      method: 'GET',
      headers: construirHeadersMseller(sesion.idToken, config.apiKey),
    },
    opts
  )) as Record<string, unknown> | null;

  const pick = (aliases: string[]): string | undefined => {
    for (const a of aliases) {
      const v = body?.[a];
      if (v !== undefined && v !== null && String(v) !== '') {
        return String(v);
      }
    }
    return undefined;
  };

  const resultado: IMsellerConsultaResultado = {
    ecf: pick(['ncf', 'ecf', 'eNCF']),
    estado: pick(['status']),
    internalTrackId: pick(['internalTrackId', 'internal_track_id', 'trackId']),
    securityCode: pick(['securityCode']),
    qrUrl: pick(['qr_url', 'qrUrl']),
    signedXml: pick(['signedXml']),
    dgiiResponse: parsearDgiiResponse(body?.dgiiResponse),
    environment: sesion.environment,
    raw: body,
  };
  logger.info({ action: 'MSELLER_ECF_CONSULTA', ecf: resultado.ecf, estado: resultado.estado });
  return resultado;
}

/**
 * Consulta el estado de hasta `LIMITE_LOTE_CONSULTA` e-CF en una sola llamada.
 * Devuelve el cuerpo normalizado: { total, results }.
 */
export async function consultarEstadoLoteMseller(
  config: IMsellerConfig,
  sesion: IMsellerSesion,
  ncfs: string[],
  opts: IMsellerOpciones = {}
): Promise<{ total: number; results: unknown[]; raw: unknown }> {
  if (!sesion?.idToken) {
    throw httpError(401, 'MSeller: falta sesión autenticada. Llama a autenticarMseller.', 'MSELLER_SIN_SESION');
  }
  if (!config?.apiKey) {
    throw httpError(400, 'MSeller: falta la API Key para consultar documentos.', 'MSELLER_SIN_API_KEY');
  }
  const limpias = ncfs.map((n) => String(n).trim()).filter(Boolean);
  if (!limpias.length) {
    throw httpError(400, 'MSeller: la lista de e-NCF a consultar está vacía.', 'MSELLER_SIN_NCF');
  }
  if (limpias.length > LIMITE_LOTE_CONSULTA) {
    throw httpError(400, `MSeller: máximo ${LIMITE_LOTE_CONSULTA} e-CF por consulta en lote.`, 'MSELLER_LOTE_EXCEDIDO');
  }
  const body = (await solicitarMseller(
    `${sesion.baseUrl}/documentos-ecf/status/batch`,
    {
      method: 'POST',
      headers: construirHeadersMseller(sesion.idToken, config.apiKey),
      body: JSON.stringify({ ecfs: limpias }),
    },
    opts
  )) as Record<string, unknown> | null;
  return {
    total: typeof body?.total === 'number' ? body.total : limpias.length,
    results: Array.isArray(body?.results) ? body.results : [],
    raw: body,
  };
}

/**
 * Anula rangos de secuencias de e-NCF NO utilizados ante la DGII (ANECF).
 * Solo requiere el Bearer idToken (sin API Key). Es irreversible.
 */
export async function anularNCFMseller(
  sesion: IMsellerSesion,
  ranges: IMsellerRangoAnulacion[],
  opts: IMsellerOpciones = {}
): Promise<unknown> {
  if (!sesion?.idToken) {
    throw httpError(401, 'MSeller: falta sesión autenticada. Llama a autenticarMseller.', 'MSELLER_SIN_SESION');
  }
  if (!Array.isArray(ranges) || !ranges.length) {
    throw httpError(400, 'MSeller: los rangos de e-NCF a anular son obligatorios.', 'MSELLER_SIN_RANGOS');
  }
  for (const r of ranges) {
    const desde = Number(r.secuenciaDesde);
    const hasta = Number(r.secuenciaHasta);
    if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde <= 0 || hasta < desde) {
      throw httpError(400, 'Rango de anulación inválido (secuenciaDesde <= secuenciaHasta).', 'MSELLER_RANGO_INVALIDO');
    }
  }
  const body = await solicitarMseller(
    `${sesion.baseUrl}/customer/void-ncf`,
    {
      method: 'POST',
      headers: construirHeadersMseller(sesion.idToken),
      body: JSON.stringify({ ranges }),
    },
    opts
  );
  logger.info({ action: 'MSELLER_ANECF_ENVIADO', ranges });
  return body;
}

/** Lista las anulaciones de e-NCF (ANECF) enviadas previamente. */
export async function listarAnulacionesMseller(
  sesion: IMsellerSesion,
  opts: IMsellerOpciones = {}
): Promise<unknown> {
  if (!sesion?.idToken) {
    throw httpError(401, 'MSeller: falta sesión autenticada. Llama a autenticarMseller.', 'MSELLER_SIN_SESION');
  }
  const body = await solicitarMseller(`${sesion.baseUrl}/customer/void-ncf`, { method: 'GET', headers: construirHeadersMseller(sesion.idToken) }, opts);
  return body;
}

/**
 * Polling best-effort del estado hasta alcanzar un estado final o agotar
 * `MAX_INTENTOS_POLLING`. Devuelve la última consulta.
 */
export async function consultarEstadoConPoliticaMseller(
  config: IMsellerConfig,
  sesion: IMsellerSesion,
  ncf: string,
  opts: IMsellerOpciones = {}
): Promise<IMsellerConsultaResultado> {
  let ultima = await consultarEstadoMseller(config, sesion, ncf, opts);
  for (let intento = 1; intento < MAX_INTENTOS_POLLING && !ESTADOS_FINALES_MSELLER.has(String(ultima.estado ?? '')); intento += 1) {
    await sleep(INTERVALO_POLLING_MS * intento);
    ultima = await consultarEstadoMseller(config, sesion, ncf, opts);
  }
  logger.info({ action: 'MSELLER_POLLING_FIN', ecf: ncf, estado: ultima.estado });
  return ultima;
}