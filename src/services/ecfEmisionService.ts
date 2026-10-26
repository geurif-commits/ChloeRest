/**
 * @file Emisión del e-CF de una cuenta cobrada: arma el comprobante, lo envía al proveedor certificado (AlgoBack o
 * MSeller), guarda el código de seguridad, la fecha de firma y el estado de la DGII, y reintenta lo que quedó pendiente.
 *
 * El cobro nunca depende de la red: el e-NCF sale de la secuencia local y el comprobante queda «Pendiente» en
 * `e_cf_comprobantes`; este servicio lo envía enseguida (con una espera corta para poder imprimir el timbre) y, si el
 * proveedor no responde, un proceso en segundo plano lo reintenta hasta que la DGII lo acepte o lo rechace.
 */

/* global fetch, URL, RequestInit, AbortController, clearTimeout, clearInterval */

import { getDatabase, runWithRequestContext } from '../db/index.js';
import type { IQueryable } from './auditoriaService.js';
import { createLogger } from '../lib/logger.js';
import { normalizarRNC, validarRNC } from '../lib/rnc.js';
import {
  ambienteDeConfiguracion,
  construirUrlConsultaTimbre,
  esTipoElectronico,
  estadoCorteEcf,
  fechaDdMmYyyy,
  tituloComprobante,
  TIPOS_ECF_VENTA,
  type AmbienteEcf,
  type IEstadoCorteEcf,
} from '../lib/comprobantes.js';
import { lineasEcf, type ILineaEcf } from '../lib/ecfCuenta.js';
import {
  BASE_URL_ALGOBACK,
  construirCuerpoAlgoBack,
  interpretarRespuestaAlgoBack,
  type EstadoEcf,
  type IResultadoAlgoBack,
} from '../lib/ecfAlgoback.js';
import { construirECF } from '../lib/ecf.js';
import {
  autenticarMseller,
  consultarEstadoMseller,
  enviarDocumentoMseller,
  mapearEstadoMsellerAEstadoLocal,
  type IMsellerConfig,
} from './msellerEcfService.js';

const logger = createLogger('ecfEmisionService');

/** Fila de dgii_config con lo necesario para emitir. */
export interface IConfigEcfFila {
  id: number;
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
  direccion_emisor: string | null;
  telefono_emisor: string | null;
  proveedor_ecf: string | null;
  ambiente: string | null;
  estado_ecf: string | null;
  algoback_api_key: string | null;
  algoback_url: string | null;
  algoback_ambiente: string | null;
  email_mseller: string | null;
  password_mseller: string | null;
  api_key_mseller: string | null;
  ecf_corte: string | null;
}

interface INegocioEmisorFila {
  nombre_comercial: string | null;
  razon_social: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  cobrar_itbis: boolean | null;
}

export async function leerConfigEcf(client: IQueryable = getDatabase()): Promise<IConfigEcfFila | null> {
  const r = await client.query<IConfigEcfFila>(
    `SELECT id, rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor, proveedor_ecf, ambiente, estado_ecf,
            algoback_api_key, algoback_url, algoback_ambiente, email_mseller, password_mseller, api_key_mseller,
            to_char(ecf_obligatorio_desde, 'YYYY-MM-DD') AS ecf_corte
       FROM dgii_config ORDER BY id LIMIT 1`
  );
  return r.rows[0] ?? null;
}

async function leerNegocio(client: IQueryable): Promise<INegocioEmisorFila> {
  const r = await client.query<INegocioEmisorFila>(
    'SELECT nombre_comercial, razon_social, rnc, direccion, telefono, cobrar_itbis FROM negocio_config ORDER BY id LIMIT 1'
  );
  return r.rows[0] ?? { nombre_comercial: null, razon_social: null, rnc: null, direccion: null, telefono: null, cobrar_itbis: false };
}

/** Datos del emisor: los de DGII > e-CF y, si faltan, los del negocio. */
export function emisorDe(cfg: IConfigEcfFila | null, negocio: INegocioEmisorFila): { rnc: string; razonSocial: string; direccion: string; telefono: string } {
  return {
    rnc: normalizarRNC(cfg?.rnc_emisor || negocio.rnc),
    razonSocial: (cfg?.razon_social_emisor || negocio.razon_social || negocio.nombre_comercial || '').trim(),
    direccion: (cfg?.direccion_emisor || negocio.direccion || '').trim(),
    telefono: (cfg?.telefono_emisor || negocio.telefono || '').trim(),
  };
}

export type ProveedorEcf = 'algoback' | 'mseller';

export function proveedorDe(cfg: IConfigEcfFila | null): ProveedorEcf {
  return String(cfg?.proveedor_ecf || 'algoback').toLowerCase() === 'mseller' ? 'mseller' : 'algoback';
}

export function credencialesCompletas(cfg: IConfigEcfFila | null): boolean {
  if (!cfg) {return false;}
  return proveedorDe(cfg) === 'mseller'
    ? Boolean(cfg.email_mseller && cfg.password_mseller && cfg.api_key_mseller)
    : Boolean(cfg.algoback_api_key);
}

// ───────────── Estado fiscal del sistema (¿está listo para facturar solo con e-CF?) ─────────────

export interface IProblemaFiscal {
  nivel: 'error' | 'aviso';
  codigo: string;
  mensaje: string;
}

export interface ITipoDisponible {
  codigo: string;
  /** Hay una secuencia activa, vigente y con números disponibles. */
  disponible: boolean;
  restantes: number | null;
  vence: string | null;
}

export interface IEstadoFiscal {
  corte: IEstadoCorteEcf;
  ambiente: AmbienteEcf;
  proveedor: ProveedorEcf;
  tipos: ITipoDisponible[];
  /** true si no hay ningún error: se puede emitir e-CF con validez. */
  listo: boolean;
  problemas: IProblemaFiscal[];
  pendientes: number;
  rechazados: number;
}

interface ISecuenciaResumenFila {
  tipo_comprobante: string;
  restantes: string;
  vence: string;
}

export async function estadoFiscal(client: IQueryable = getDatabase(), hoy?: string): Promise<IEstadoFiscal> {
  const cfg = await leerConfigEcf(client);
  const negocio = await leerNegocio(client);
  const corte = estadoCorteEcf(cfg?.ecf_corte, hoy);
  const ambiente = ambienteDeConfiguracion(cfg ?? {});
  const emisor = emisorDe(cfg, negocio);
  const problemas: IProblemaFiscal[] = [];

  if (!validarRNC(emisor.rnc)) {
    problemas.push({ nivel: 'error', codigo: 'EMISOR_RNC', mensaje: 'El RNC del emisor no es válido. Corrígelo en DGII > e-CF > Datos del emisor.' });
  }
  if (!emisor.razonSocial) {
    problemas.push({ nivel: 'error', codigo: 'EMISOR_RAZON', mensaje: 'Falta la razón social del emisor (DGII > e-CF).' });
  }
  if (!emisor.direccion) {
    problemas.push({ nivel: 'error', codigo: 'EMISOR_DIRECCION', mensaje: 'Falta la dirección del emisor: es obligatoria en el e-CF.' });
  }
  if (!credencialesCompletas(cfg)) {
    problemas.push({ nivel: 'error', codigo: 'PROVEEDOR', mensaje: 'Faltan las credenciales del proveedor de facturación electrónica (DGII > e-CF > Configuración).' });
  }
  if (ambiente !== 'Produccion') {
    problemas.push({
      nivel: corte.obligatorio ? 'error' : 'aviso',
      codigo: 'AMBIENTE',
      mensaje: `El ambiente de e-CF es «${ambiente === 'Pruebas' ? 'Pruebas' : 'Certificación'}»: los comprobantes emitidos así no tienen validez fiscal. Cámbialo a Producción al terminar la certificación con la DGII.`,
    });
  }

  const secuencias = await client.query<ISecuenciaResumenFila>(
    `SELECT tipo_comprobante, (secuencia_final - secuencia_actual + 1)::text AS restantes, to_char(fecha_vencimiento, 'YYYY-MM-DD') AS vence
       FROM dgii_secuencias
      WHERE activa = TRUE AND fecha_vencimiento >= CURRENT_DATE AND secuencia_actual <= secuencia_final AND tipo_comprobante LIKE 'E%'
      ORDER BY tipo_comprobante, id`
  );
  const tipos: ITipoDisponible[] = TIPOS_ECF_VENTA.map((codigo) => {
    const fila = secuencias.rows.find((s) => s.tipo_comprobante === codigo);
    return { codigo, disponible: Boolean(fila), restantes: fila ? Number(fila.restantes) : null, vence: fila?.vence ?? null };
  });
  for (const t of tipos) {
    const obligatorioConfigurar = t.codigo === 'E32' || t.codigo === 'E31';
    if (!t.disponible) {
      problemas.push({
        nivel: obligatorioConfigurar ? 'error' : 'aviso',
        codigo: `SECUENCIA_${t.codigo}`,
        mensaje: `No hay una secuencia ${t.codigo} activa y vigente. Regístrala en DGII > Secuencias con el rango autorizado en la Oficina Virtual de la DGII.`,
      });
      continue;
    }
    if ((t.restantes ?? 0) < 1000) {
      problemas.push({ nivel: 'aviso', codigo: `SECUENCIA_${t.codigo}_POCOS`, mensaje: `Quedan ${t.restantes} e-NCF ${t.codigo}: solicita un nuevo rango a la DGII.` });
    }
    if (t.vence && Date.parse(`${t.vence}T00:00:00Z`) - Date.parse(`${corte.hoy}T00:00:00Z`) < 30 * 86_400_000) {
      problemas.push({ nivel: 'aviso', codigo: `SECUENCIA_${t.codigo}_VENCE`, mensaje: `La secuencia ${t.codigo} vence el ${t.vence}: solicita un nuevo rango antes de esa fecha.` });
    }
  }

  const cola = await client.query<{ pendientes: string; rechazados: string }>(
    `SELECT COUNT(*) FILTER (WHERE estado IN ('Pendiente','Procesando','Enviado'))::text AS pendientes,
            COUNT(*) FILTER (WHERE estado = 'Rechazado')::text AS rechazados
       FROM e_cf_comprobantes`
  );
  const pendientes = Number(cola.rows[0]?.pendientes ?? 0);
  const rechazados = Number(cola.rows[0]?.rechazados ?? 0);
  if (rechazados > 0) {
    problemas.push({ nivel: 'error', codigo: 'RECHAZADOS', mensaje: `${rechazados} comprobante(s) fueron rechazados por la DGII: revísalos en DGII > e-CF > Historial.` });
  }
  if (pendientes > 0) {
    problemas.push({ nivel: 'aviso', codigo: 'PENDIENTES', mensaje: `${pendientes} comprobante(s) esperan respuesta de la DGII; el sistema los reintenta solo.` });
  }

  return { corte, ambiente, proveedor: proveedorDe(cfg), tipos, listo: !problemas.some((p) => p.nivel === 'error'), problemas, pendientes, rechazados };
}

// ───────────── Registro del comprobante electrónico ─────────────

export interface IFilaEcf {
  id: number;
  cuenta_id: number;
  empresa_id?: number;
  tipo_cf: string;
  ncf: string;
  track_id: string | null;
  estado: string;
  codigo_seguridad: string | null;
  /** dd-MM-yyyy HH:mm:ss en hora de Santo Domingo (la base guarda la hora de pared; no se pasa por la zona del servidor). */
  fecha_firma: string | null;
  qr_url: string | null;
  ambiente: string | null;
  intentos: number;
  ultimo_error: string | null;
  fecha_vencimiento_secuencia: string | null;
  enviado_en: Date | null;
}

const COLUMNAS_ECF = `id, cuenta_id, empresa_id, tipo_cf, ncf, track_id, estado, codigo_seguridad,
  to_char(fecha_firma, 'DD-MM-YYYY HH24:MI:SS') AS fecha_firma, qr_url, ambiente, intentos,
  ultimo_error, to_char(fecha_vencimiento_secuencia, 'YYYY-MM-DD') AS fecha_vencimiento_secuencia, enviado_en`;

/**
 * Deja registrado el e-CF de la cuenta, «Pendiente», dentro de la transacción del cobro. El próximo intento se aplaza 90 s
 * para que el proceso de reintentos no lo tome mientras el propio cobro intenta enviarlo.
 */
export async function registrarEcfPendiente(
  client: IQueryable,
  p: { cuentaId: number; tipo: string; ncf: string; total: number; rncReceptor: string | null; vencimientoSecuencia: string | null; propina: number }
): Promise<void> {
  const cfg = await leerConfigEcf(client);
  const negocio = await leerNegocio(client);
  const emisor = emisorDe(cfg, negocio);
  await client.query(
    `INSERT INTO e_cf_comprobantes
       (cuenta_id, tipo_cf, ncf, estado, rnc_emisor, rnc_receptor, monto_total, total_propina, ambiente, proveedor_ecf,
        fecha_vencimiento_secuencia, proximo_intento)
     VALUES ($1, $2, $3, 'Pendiente', $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '90 seconds')
     ON CONFLICT (cuenta_id, ncf) DO NOTHING`,
    [p.cuentaId, p.tipo, p.ncf, emisor.rnc, p.rncReceptor, p.total, p.propina, ambienteDeConfiguracion(cfg ?? {}), proveedorDe(cfg), p.vencimientoSecuencia]
  );
}

interface ICuentaEcfFila {
  id: number;
  ncf: string | null;
  tipo_comprobante: string | null;
  rnc_cedula_cliente: string | null;
  razon_social_cliente: string | null;
  total: string;
  propina: string;
  descuento: string | null;
  /** dd-MM-yyyy en hora de Santo Domingo. */
  fecha_emision_txt: string;
  metodo_pago: string | null;
}

interface IDetalleEcfFila {
  cantidad: string;
  precio_unitario: string;
  nombre: string | null;
  tasa_itbis: string;
}

export interface IResultadoEmision {
  ok: boolean;
  estado: string;
  mensaje: string;
  ncf: string | null;
  trackId: string | null;
  codigoSeguridad: string | null;
  /** dd-MM-yyyy HH:mm:ss en hora de Santo Domingo. */
  fechaFirma: string | null;
  qrUrl: string | null;
  reintentable: boolean;
}

const baseAlgoBack = (cfg: IConfigEcfFila): string => {
  try {
    const u = new URL(cfg.algoback_url || BASE_URL_ALGOBACK);
    // Solo https; http se admite únicamente hacia este mismo equipo (proveedor simulado de las pruebas).
    if (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))) {return u.origin;}
  } catch { /* URL inválida: se usa la oficial */ }
  return BASE_URL_ALGOBACK;
};

async function fetchConLimite(url: string, init: RequestInit, ms: number): Promise<{ http: number; cuerpo: unknown }> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: control.signal });
    const cuerpo: unknown = await res.json().catch(() => null);
    return { http: res.status, cuerpo };
  } finally {
    clearTimeout(temporizador);
  }
}

const esperar = (ms: number): Promise<void> => new Promise((resolver) => { setTimeout(resolver, ms); });

/** Segundos hasta el próximo intento (null: no se reintenta). El instante lo calcula la base con NOW(), nunca el servidor. */
function segundosParaReintento(estado: string, intentos: number, reintentable: boolean): number | null {
  if (!reintentable) {return null;}
  return estado === 'Procesando' ? Math.min(20 * (intentos + 1), 300) : Math.min(60 * 2 ** Math.min(intentos, 5), 1800);
}

async function guardarResultado(
  id: number,
  intentosPrevios: number,
  r: { estado: string; mensaje: string; trackId?: string | null; codigoSeguridad?: string | null; fechaFirmaTexto?: string | null; qrUrl?: string | null; respuesta?: unknown; xmlFirmado?: string | null; reintentable: boolean }
): Promise<void> {
  const exito = r.estado === 'Aceptado' || r.estado === 'Aceptado Condicional';
  await getDatabase().query(
    `UPDATE e_cf_comprobantes
        SET estado = $2, track_id = COALESCE($3, track_id), codigo_seguridad = COALESCE($4, codigo_seguridad),
            fecha_firma = COALESCE(to_timestamp($5, 'DD-MM-YYYY HH24:MI:SS')::timestamp, fecha_firma), qr_url = COALESCE($6, qr_url),
            xml_firmado = COALESCE($7, xml_firmado), respuesta_json = COALESCE($8::jsonb, respuesta_json),
            enviado_en = COALESCE(enviado_en, NOW()), intentos = $9, ultimo_error = $10,
            proximo_intento = CASE WHEN $11::int IS NULL THEN NULL ELSE NOW() + make_interval(secs => $11::int) END
      WHERE id = $1`,
    [
      id, r.estado, r.trackId ?? null, r.codigoSeguridad ?? null, r.fechaFirmaTexto ?? null, r.qrUrl ?? null, r.xmlFirmado ?? null,
      r.respuesta === undefined ? null : JSON.stringify(r.respuesta), intentosPrevios + 1,
      exito ? null : r.mensaje.slice(0, 500), segundosParaReintento(r.estado, intentosPrevios, r.reintentable),
    ]
  );
}

const resultadoDe = (fila: IFilaEcf, extra: Partial<IResultadoEmision> & { estado: string; mensaje: string }): IResultadoEmision => ({
  ok: extra.estado === 'Aceptado' || extra.estado === 'Aceptado Condicional',
  ncf: fila.ncf,
  trackId: fila.track_id,
  codigoSeguridad: fila.codigo_seguridad,
  fechaFirma: fila.fecha_firma,
  qrUrl: fila.qr_url,
  reintentable: false,
  ...extra,
});

/** Lee la fila del e-CF de la cuenta, creándola si la cuenta se cobró antes de existir este control. */
async function filaEcf(client: IQueryable, cuenta: ICuentaEcfFila, cfg: IConfigEcfFila | null, emisorRnc: string): Promise<IFilaEcf | null> {
  if (!cuenta.ncf) {return null;}
  const existente = await client.query<IFilaEcf>(`SELECT ${COLUMNAS_ECF} FROM e_cf_comprobantes WHERE cuenta_id = $1 AND ncf = $2`, [cuenta.id, cuenta.ncf]);
  if (existente.rows[0]) {return existente.rows[0];}
  const sec = await client.query<{ vence: string }>(
    `SELECT to_char(fecha_vencimiento, 'YYYY-MM-DD') AS vence FROM dgii_secuencias WHERE tipo_comprobante = $1 ORDER BY activa DESC, id DESC LIMIT 1`,
    [cuenta.tipo_comprobante]
  );
  await client.query(
    `INSERT INTO e_cf_comprobantes (cuenta_id, tipo_cf, ncf, estado, rnc_emisor, rnc_receptor, monto_total, total_propina, ambiente, proveedor_ecf, fecha_vencimiento_secuencia)
     VALUES ($1, $2, $3, 'Pendiente', $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (cuenta_id, ncf) DO NOTHING`,
    [cuenta.id, cuenta.tipo_comprobante, cuenta.ncf, emisorRnc, cuenta.rnc_cedula_cliente, cuenta.total, cuenta.propina, ambienteDeConfiguracion(cfg ?? {}), proveedorDe(cfg), sec.rows[0]?.vence ?? null]
  );
  const creada = await client.query<IFilaEcf>(`SELECT ${COLUMNAS_ECF} FROM e_cf_comprobantes WHERE cuenta_id = $1 AND ncf = $2`, [cuenta.id, cuenta.ncf]);
  return creada.rows[0] ?? null;
}

export interface IOpcionesEmision {
  /** Cuánto esperar (ms) a que el proveedor devuelva el timbre antes de dejarlo para el reintento. 0 = no esperar. */
  esperaMs?: number;
  /** Reenvía aunque ya esté aceptado o rechazado (reenvío manual del administrador). */
  forzar?: boolean;
}

/**
 * Emite (o consulta, si ya se envió) el e-CF de una cuenta cerrada. No lanza por fallos del proveedor: devuelve el estado y
 * el motivo, y deja el reintento programado. Hay que llamarlo dentro del contexto de la empresa (petición o worker).
 */
export async function emitirEcfDeCuenta(cuentaId: number, opciones: IOpcionesEmision = {}): Promise<IResultadoEmision> {
  const db = getDatabase();
  const cfg = await leerConfigEcf(db);
  const negocio = await leerNegocio(db);
  const emisor = emisorDe(cfg, negocio);

  const cuentaRes = await db.query<ICuentaEcfFila>(
    `SELECT id, ncf_ecf_generado AS ncf, tipo_comprobante, rnc_cedula_cliente, razon_social_cliente, total::text, propina::text,
            descuento::text, to_char(COALESCE(fecha_cierre, NOW()), 'DD-MM-YYYY') AS fecha_emision_txt, metodo_pago
       FROM cuentas WHERE id = $1 AND estado = 'Cerrada'`,
    [cuentaId]
  );
  const cuenta = cuentaRes.rows[0];
  if (!cuenta?.ncf) {
    return { ok: false, estado: 'Error', mensaje: 'La cuenta no existe, no está cerrada o no tiene comprobante.', ncf: null, trackId: null, codigoSeguridad: null, fechaFirma: null, qrUrl: null, reintentable: false };
  }
  if (!esTipoElectronico(cuenta.tipo_comprobante)) {
    return { ok: false, estado: 'Error', mensaje: `Esta cuenta tiene un NCF tradicional (${cuenta.tipo_comprobante}), no un e-CF.`, ncf: cuenta.ncf, trackId: null, codigoSeguridad: null, fechaFirma: null, qrUrl: null, reintentable: false };
  }
  const fila = await filaEcf(db, cuenta, cfg, emisor.rnc);
  if (!fila) {
    return { ok: false, estado: 'Error', mensaje: 'No se pudo registrar el comprobante electrónico.', ncf: cuenta.ncf, trackId: null, codigoSeguridad: null, fechaFirma: null, qrUrl: null, reintentable: false };
  }
  if (!opciones.forzar && ['Aceptado', 'Aceptado Condicional', 'Anulado', 'Rechazado'].includes(fila.estado)) {
    return resultadoDe(fila, { estado: fila.estado, mensaje: fila.ultimo_error ?? fila.estado });
  }
  if (!credencialesCompletas(cfg)) {
    const mensaje = proveedorDe(cfg) === 'mseller'
      ? 'Faltan las credenciales de MSeller ECF (DGII > e-CF > Configuración).'
      : 'Falta la API-KEY de AlgoBack (DGII > e-CF > Configuración).';
    await guardarResultado(fila.id, fila.intentos, { estado: 'Pendiente', mensaje, reintentable: true });
    return resultadoDe(fila, { estado: 'Pendiente', mensaje, reintentable: true });
  }

  try {
    const resultado = proveedorDe(cfg) === 'mseller'
      ? await enviarPorMseller(cfg as IConfigEcfFila, cuenta, fila, emisor, negocio, opciones)
      : await enviarPorAlgoBack(cfg as IConfigEcfFila, cuenta, fila, emisor, negocio, opciones);
    await guardarResultado(fila.id, fila.intentos, resultado);
    logger.info({ action: 'ECF_EMISION', details: { cuentaId, ncf: cuenta.ncf, estado: resultado.estado } });
    return resultadoDe(
      { ...fila, track_id: resultado.trackId ?? fila.track_id, codigo_seguridad: resultado.codigoSeguridad ?? fila.codigo_seguridad, fecha_firma: resultado.fechaFirmaTexto ?? fila.fecha_firma, qr_url: resultado.qrUrl ?? fila.qr_url },
      { estado: resultado.estado, mensaje: resultado.mensaje, reintentable: resultado.reintentable }
    );
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    const sinRed = error instanceof Error && (error.name === 'AbortError' || /fetch failed|ECONN|ENOTFOUND|network/i.test(mensaje));
    // Errores de datos (falta dirección, RNC inválido…) no se arreglan reintentando; los de red sí.
    await guardarResultado(fila.id, fila.intentos, { estado: 'Pendiente', mensaje: sinRed ? `Sin conexión con el proveedor: ${mensaje}` : mensaje, reintentable: sinRed });
    logger.warn({ action: 'ECF_EMISION_FALLIDA', details: { cuentaId, ncf: cuenta.ncf, mensaje } });
    return resultadoDe(fila, { estado: 'Pendiente', mensaje: sinRed ? 'Sin conexión con el proveedor de facturación electrónica. Se reintentará solo.' : mensaje, reintentable: sinRed });
  }
}

type ResultadoEnvio = IResultadoAlgoBack & { respuesta?: unknown; xmlFirmado?: string | null };

async function lineasDeCuenta(cuenta: ICuentaEcfFila, negocio: INegocioEmisorFila): Promise<ILineaEcf[]> {
  const detalles = await getDatabase().query<IDetalleEcfFila>(
    `SELECT cd.cantidad::text, cd.precio_unitario::text, p.nombre, COALESCE(p.tasa_itbis, 0)::text AS tasa_itbis
       FROM cuenta_detalles cd JOIN productos p ON p.id = cd.producto_id
      WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL ORDER BY cd.id`,
    [cuenta.id]
  );
  if (!detalles.rowCount) {throw new Error('La cuenta no tiene productos para facturar.');}
  const descuentoC = Math.round((Number(cuenta.descuento ?? 0) + Number.EPSILON) * 100);
  return lineasEcf(
    detalles.rows.map((d) => ({ nombre: d.nombre ?? '', cantidad: d.cantidad, precio_unitario: d.precio_unitario, tasa_itbis: d.tasa_itbis })),
    descuentoC,
    negocio.cobrar_itbis === true
  );
}

async function enviarPorAlgoBack(
  cfg: IConfigEcfFila, cuenta: ICuentaEcfFila, fila: IFilaEcf,
  emisor: ReturnType<typeof emisorDe>, negocio: INegocioEmisorFila, opciones: IOpcionesEmision
): Promise<ResultadoEnvio> {
  const base = baseAlgoBack(cfg);
  const entorno = String(cfg.algoback_ambiente || '').toUpperCase() === 'PROD' ? 'PROD' : 'TEST';
  const cabeceras = { 'X-API-KEY': cfg.algoback_api_key ?? '', 'X-Entorno': entorno, Accept: 'application/json' };
  const limite = Math.max(opciones.esperaMs ?? 0, 15_000);
  const inicio = Date.now();

  let r: IResultadoAlgoBack;
  let cuerpoCrudo: unknown;
  if (fila.track_id && !opciones.forzar) {
    const { http, cuerpo } = await fetchConLimite(`${base}/ecf/consultar-factura/${encodeURIComponent(fila.track_id)}`, { headers: cabeceras }, limite);
    cuerpoCrudo = cuerpo;
    r = interpretarRespuestaAlgoBack(cuerpo, http);
  } else {
    const lineas = await lineasDeCuenta(cuenta, negocio);
    const cuerpoEnvio = construirCuerpoAlgoBack({
      encf: cuenta.ncf as string,
      tipo: cuenta.tipo_comprobante as string,
      fechaEmision: cuenta.fecha_emision_txt,
      vencimientoSecuencia: fila.fecha_vencimiento_secuencia,
      emisor: { rnc: emisor.rnc, razonSocial: emisor.razonSocial, direccion: emisor.direccion },
      comprador: cuenta.rnc_cedula_cliente ? { rnc: cuenta.rnc_cedula_cliente, razonSocial: cuenta.razon_social_cliente ?? '' } : null,
      lineas,
      numeroInterno: String(cuenta.id),
    });
    const { http, cuerpo } = await fetchConLimite(
      `${base}/ecf/v2/procesar-factura`,
      { method: 'POST', headers: { ...cabeceras, 'Content-Type': 'application/json', 'X-Operacion-Id': `cuenta-${cuenta.id}-${cuenta.ncf}` }, body: JSON.stringify(cuerpoEnvio) },
      limite
    );
    cuerpoCrudo = cuerpo;
    r = interpretarRespuestaAlgoBack(cuerpo, http);
  }

  // Si la DGII aún lo procesa, esperar un poco para poder imprimir el timbre en el mismo cobro.
  while (r.estado === 'Procesando' && r.trackId && Date.now() - inicio + 1800 < (opciones.esperaMs ?? 0)) {
    await esperar(1500);
    const { http, cuerpo } = await fetchConLimite(`${base}/ecf/consultar-factura/${encodeURIComponent(r.trackId)}`, { headers: cabeceras }, 8000);
    cuerpoCrudo = cuerpo;
    r = { ...interpretarRespuestaAlgoBack(cuerpo, http), trackId: r.trackId };
  }
  return { ...r, respuesta: cuerpoCrudo };
}

async function enviarPorMseller(
  cfg: IConfigEcfFila, cuenta: ICuentaEcfFila, fila: IFilaEcf,
  emisor: ReturnType<typeof emisorDe>, negocio: INegocioEmisorFila, opciones: IOpcionesEmision
): Promise<ResultadoEnvio> {
  const config: IMsellerConfig = { email: cfg.email_mseller, password: cfg.password_mseller, apiKey: cfg.api_key_mseller, ambiente: cfg.ambiente, estadoEcf: cfg.estado_ecf };
  const sesion = await autenticarMseller(config);

  if (fila.estado !== 'Pendiente' && !opciones.forzar) {
    const consulta = await consultarEstadoMseller(config, sesion, fila.ncf);
    const estado = (mapearEstadoMsellerAEstadoLocal(consulta.estado) || 'Procesando') as EstadoEcf;
    const final = estado === 'Aceptado' || estado === 'Aceptado Condicional' || estado === 'Rechazado';
    return {
      estado, trackId: consulta.internalTrackId ?? null, codigoSeguridad: consulta.securityCode ?? null, fechaFirma: null, fechaFirmaTexto: null,
      qrUrl: consulta.qrUrl ?? null, mensaje: consulta.estado ?? 'Procesando', reintentable: !final, respuesta: consulta.raw, xmlFirmado: consulta.signedXml ?? null,
    };
  }

  const lineas = await lineasDeCuenta(cuenta, negocio);
  const venc = fila.fecha_vencimiento_secuencia ? fechaDdMmYyyy(new Date(`${fila.fecha_vencimiento_secuencia}T12:00:00-04:00`)) : undefined;
  const payload = construirECF({
    tipoECF: Number((cuenta.tipo_comprobante as string).slice(1)),
    ncf: cuenta.ncf as string,
    cfg: { rnc_emisor: emisor.rnc, razon_social_emisor: emisor.razonSocial, direccion_emisor: emisor.direccion },
    rncReceptor: cuenta.rnc_cedula_cliente ?? '',
    razonSocialReceptor: cuenta.razon_social_cliente ?? '',
    // MSeller recibe el precio neto: si el menú ya trae el ITBIS incluido, se le quita.
    detalles: lineas.map((l) => ({
      cantidad: l.cantidad,
      precio_unitario: (negocio.cobrar_itbis === true ? l.netoC : Math.round(l.netoC / (1 + l.tasa / 100))) / 100 / l.cantidad,
      tasa_itbis: l.tasa,
      producto_nombre: l.descripcion,
    })),
    fechaEmision: cuenta.fecha_emision_txt,
    tipoPago: cuenta.metodo_pago === 'Efectivo' ? 1 : 2,
    fechaVencimientoSecuencia: venc,
  });
  const resultado = await enviarDocumentoMseller(config, sesion, payload);
  return {
    estado: 'Procesando', trackId: resultado.internalTrackId ?? resultado.ecf ?? null, codigoSeguridad: resultado.codigoSeguridad ?? null,
    fechaFirma: null, fechaFirmaTexto: null, qrUrl: resultado.qrUrl ?? null, mensaje: 'Enviado a la DGII, esperando respuesta.', reintentable: true,
    respuesta: resultado.raw, xmlFirmado: resultado.signedXml ?? null,
  };
}

// ───────────── Reintentos en segundo plano ─────────────

let ejecutandoCola = false;

/** Envía o consulta los e-CF que quedaron pendientes (todas las empresas). Devuelve cuántos procesó. */
export async function procesarColaEcf(limite = 10): Promise<number> {
  if (ejecutandoCola) {return 0;}
  ejecutandoCola = true;
  try {
    const db = getDatabase();
    const pendientes = await runWithRequestContext({ platform: true }, () =>
      db.query<{ id: number; cuenta_id: number; empresa_id: number }>(
        `UPDATE e_cf_comprobantes SET proximo_intento = NOW() + INTERVAL '2 minutes'
          WHERE id IN (SELECT id FROM e_cf_comprobantes
                        WHERE estado IN ('Pendiente','Procesando','Enviado') AND (proximo_intento IS NULL OR proximo_intento <= NOW())
                        ORDER BY id LIMIT $1)
        RETURNING id, cuenta_id, empresa_id`,
        [limite]
      )
    );
    for (const p of pendientes.rows) {
      try {
        await runWithRequestContext({ empresaId: p.empresa_id }, () => emitirEcfDeCuenta(p.cuenta_id, { esperaMs: 0 }));
      } catch (error) {
        logger.warn({ action: 'ECF_COLA_ERROR', details: { cuentaId: p.cuenta_id }, error: { message: error instanceof Error ? error.message : String(error) } });
      }
    }
    return pendientes.rowCount ?? 0;
  } finally {
    ejecutandoCola = false;
  }
}

let temporizadorCola: ReturnType<typeof setInterval> | null = null;

/** Arranca el proceso que reintenta los e-CF pendientes cada minuto. Idempotente. */
export function iniciarColaEcf(intervaloMs = 60_000): void {
  if (temporizadorCola) {return;}
  temporizadorCola = setInterval(() => {
    procesarColaEcf().catch((error: Error) => logger.warn({ action: 'ECF_COLA_FALLIDA', error: { message: error.message } }));
  }, intervaloMs);
  temporizadorCola.unref();
}

export function detenerColaEcf(): void {
  if (temporizadorCola) {clearInterval(temporizadorCola); temporizadorCola = null;}
}

// ───────────── Datos para la representación impresa (ticket) ─────────────

export interface IRepresentacionEcf {
  tipo: string;
  titulo: string;
  ncf: string;
  electronico: boolean;
  estado: string | null;
  /** dd-MM-yyyy HH:mm:ss en hora de Santo Domingo (se imprime tal cual, sin pasar por ninguna zona horaria). */
  fechaEmision: string;
  fechaVencimientoSecuencia: string | null;
  /** dd-MM-yyyy HH:mm:ss en hora de Santo Domingo. */
  fechaFirma: string | null;
  codigoSeguridad: string | null;
  qrUrl: string | null;
  comprador: { rnc: string | null; razonSocial: string | null };
  /** Emisor tal como se declara a la DGII (el ticket imprime exactamente estos datos). */
  emisor: { rnc: string; razonSocial: string; nombreComercial: string; direccion: string; telefono: string };
  /** Falta el timbre (código de seguridad / firma): el comprobante aún no fue validado por la DGII. */
  pendiente: boolean;
}

interface IFilaRepresentacion {
  id: number;
  ncf: string | null;
  tipo_comprobante: string | null;
  rnc_cedula_cliente: string | null;
  razon_social_cliente: string | null;
  total: string;
  fecha_emision_txt: string;
  estado_ecf: string | null;
  codigo_seguridad: string | null;
  fecha_firma_txt: string | null;
  qr_url: string | null;
  fecha_vencimiento_secuencia: string | null;
}

/** Datos de la cuenta cobrada para imprimir su comprobante (NCF o e-CF). */
export async function datosRepresentacion(cuentaId: number, client: IQueryable = getDatabase()): Promise<IRepresentacionEcf | null> {
  const r = await client.query<IFilaRepresentacion>(
    `SELECT c.id, c.ncf_ecf_generado AS ncf, c.tipo_comprobante, c.rnc_cedula_cliente, c.razon_social_cliente, c.total::text,
            to_char(COALESCE(c.fecha_cierre, NOW()), 'DD-MM-YYYY HH24:MI:SS') AS fecha_emision_txt,
            e.estado AS estado_ecf, e.codigo_seguridad, to_char(e.fecha_firma, 'DD-MM-YYYY HH24:MI:SS') AS fecha_firma_txt, e.qr_url, to_char(e.fecha_vencimiento_secuencia, 'YYYY-MM-DD') AS fecha_vencimiento_secuencia
       FROM cuentas c LEFT JOIN e_cf_comprobantes e ON e.cuenta_id = c.id AND e.ncf = c.ncf_ecf_generado
      WHERE c.id = $1 AND c.estado = 'Cerrada'`,
    [cuentaId]
  );
  const f = r.rows[0];
  if (!f?.ncf) {return null;}
  const cfg = await leerConfigEcf(client);
  const negocio = await leerNegocio(client);
  const emisor = emisorDe(cfg, negocio);
  return representacionDeFila(f, cfg, { ...emisor, nombreComercial: (negocio.nombre_comercial || '').trim() });
}

export function representacionDeFila(f: IFilaRepresentacion, cfg: IConfigEcfFila | null, emisor: IRepresentacionEcf['emisor']): IRepresentacionEcf {
  const tipo = f.tipo_comprobante ?? 'B02';
  const electronico = esTipoElectronico(tipo);
  const aceptado = f.estado_ecf === 'Aceptado' || f.estado_ecf === 'Aceptado Condicional';
  const pendiente = electronico && !(aceptado || (f.codigo_seguridad && f.fecha_firma_txt));
  const rncEmisor = normalizarRNC(emisor.rnc || cfg?.rnc_emisor);
  const qrUrl = electronico
    ? (f.qr_url
      || (f.codigo_seguridad
        ? construirUrlConsultaTimbre({
          ambiente: ambienteDeConfiguracion(cfg ?? {}), rncEmisor, rncComprador: f.rnc_cedula_cliente, encf: f.ncf as string, fechaEmision: f.fecha_emision_txt.slice(0, 10),
          montoTotal: Number(f.total), fechaFirma: f.fecha_firma_txt, codigoSeguridad: f.codigo_seguridad, tipo,
        })
        : null))
    : null;
  return {
    tipo,
    titulo: tituloComprobante(tipo),
    ncf: f.ncf as string,
    electronico,
    estado: f.estado_ecf,
    fechaEmision: f.fecha_emision_txt,
    fechaVencimientoSecuencia: f.fecha_vencimiento_secuencia,
    fechaFirma: f.fecha_firma_txt,
    codigoSeguridad: f.codigo_seguridad,
    qrUrl,
    comprador: { rnc: f.rnc_cedula_cliente, razonSocial: f.razon_social_cliente },
    emisor,
    pendiente,
  };
}
