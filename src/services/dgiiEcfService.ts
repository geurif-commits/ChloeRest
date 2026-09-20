/**
 * @file Servicio de e-CF DIRECTO contra la DGII (sin AlgoBack) usando el
 * paquete `dgii-ecf`: lectura del certificado DigiFirma (.p12), autenticación
 * emisor, transformación JSON->XML, firma digital y envío al emisor DGII.
 *
 * PIEZAS PREPARADAS: todavía NO conectado a ningún router. El router que lo
 * consuma deberá leer `dgii_config` (client_secret, clave_certificado,
 * rnc_emisor, razon_social_emisor, direccion_emisor, ambiente) y llamar a
 * `emitirECFDirecto` / `crearClienteDGII` + consultas.
 *
 * Nota de seguridad: `client_secret` y la passphrase del .p12 deben guardarse
 * cifrados en BD; esta capa solo los utiliza en memoria.
 */

import { ECF, P12Reader, Signature, Transformer, ENVIRONMENT, convertECF32ToRFCE } from 'dgii-ecf';
import { httpError, money } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';
import { normalizarRNC } from '../lib/rnc.js';
import { construirECF, type IDetalleECF } from '../lib/ecf.js';

const logger = createLogger('dgiiEcfDirecto');
const LIMITE_RESUMEN_E32 = 250000;

/** Campos de dgii_config relevantes para la emisión directa. */
export interface IDgiiEcfConfig {
  rnc_emisor: string | null;
  razon_social_emisor?: string | null;
  direccion_emisor?: string | null;
  client_secret?: string | null;
  clave_certificado?: string | null;
  ambiente?: string | null;
}

/** Origen del certificado DigiFirma: archivo en disco o base64 de la BD. */
export interface ICertificadoP12 {
  passphrase: string;
  rutaArchivo?: string;
  base64?: string;
}

/** Parámetros de `emitirECFDirecto` (mirror de `construirECF` + credenciales). */
export interface IEmitirECFParams {
  config: IDgiiEcfConfig;
  tipoECF: number;
  ncf: string;
  rncReceptor?: string;
  razonSocialReceptor?: string;
  detalles: IDetalleECF[];
  tipoPago?: number;
  fechaVencimientoSecuencia?: string;
  certificado?: ICertificadoP12;
}

/** Resultado de una emisión directa: XML(s) firmados + respuesta DGII. */
export interface IResultadoEmisionECF {
  xmlFirmado: string;
  xmlRfceFirmado?: string;
  nombreArchivo: string;
  trackId?: string;
  codigoSeguridad?: string;
  respuesta: unknown;
}

/** Llave y certificado extraídos del .p12 (suficiente para Signature y ECF). */
export interface ICertificadoLeido {
  key: string;
  cert: string;
}

/** Cliente ECF ya autenticado + certificado en memoria (reutilizable en consultas). */
export interface IClienteDGII {
  cliente: ECF;
  cert: ICertificadoLeido;
  token?: string;
}

/**
 * Mapea el ambiente almacenado (AlgoBack/DGII) al ENVIRONMENT del paquete.
 * 'TEST'/'Pruebas' y vacíos -> TesteCF (DEV), 'CERT' -> CerteCF, 'PROD'/'eCF' -> eCF.
 */
export function mapearAmbiente(ambiente: string | null | undefined): ENVIRONMENT {
  const raw = String(ambiente ?? '').toUpperCase();
  if (raw.includes('CERT')) {
    return ENVIRONMENT.CERT;
  }
  if (raw === 'PROD' || raw === 'ECF' || raw === 'PRODUCCION') {
    return ENVIRONMENT.PROD;
  }
  return ENVIRONMENT.DEV;
}

/** Indica si hay credenciales mínimas para la ruta directa (sin certificado aún). */
export function tieneCredencialesDirectas(config: IDgiiEcfConfig | null | undefined): boolean {
  return Boolean(config?.client_secret) && Boolean(config?.clave_certificado);
}

/** Nombre de archivo obligatorio para la DGII: RNCEmisor + e-NCF + .xml */
export function construirNombreArchivo(rncEmisor: string, ncf: string): string {
  return `${normalizarRNC(rncEmisor)}${String(ncf).trim()}.xml`;
}

/** Total del e-CF a partir de los detalles (mismo criterio que `construirECF`). */
export function calcularMontoTotal(detalles: IDetalleECF[]): number {
  let gravado = 0;
  let exento = 0;
  let itbis = 0;
  for (const d of detalles) {
    const montoItem = money(Number(d.cantidad) * Number(d.precio_unitario));
    const tasa = Number(d.tasa_itbis ?? 18);
    if (tasa === 0) {
      exento += montoItem;
    } else {
      const g = money(montoItem / (1 + tasa / 100));
      gravado += g;
      itbis += money((g * tasa) / 100);
    }
  }
  return money(gravado + exento + itbis);
}

/** Convierte el JSON del comprobante (salida de `construirECF`) a XML DGII. */
export function jsonAECFXML(comprobante: Record<string, unknown>): string {
  const transformer = new Transformer();
  return transformer.json2xml(comprobante);
}

/** Extrae llave y certificado del .p12 (archivo o base64). */
export async function leerCertificado(input: ICertificadoP12): Promise<ICertificadoLeido> {
  if (!input.passphrase) {
    throw httpError(400, 'Falta la passphrase del certificado DigiFirma (.p12).', 'CERT_PASSPHRASE_REQUERIDA');
  }
  const reader = new P12Reader(input.passphrase);
  let data: { key?: string; cert?: string } | undefined;
  try {
    data = input.base64 ? reader.getKeyFromStringBase64(input.base64) : reader.getKeyFromFile(input.rutaArchivo || '');
  } catch (err) {
    logger.error({ action: 'P12_LECTURA_FALLIDA', error: (err as Error).message });
    throw httpError(400, 'No se pudo leer el certificado .p12. Revisa la ruta o el base64.', 'P12_INVALIDO');
  }
  if (!data?.key || !data?.cert) {
    throw httpError(400, 'El certificado .p12 no contiene llave/certificado. Revisa la passphrase.', 'P12_SIN_LLAVE');
  }
  return { key: data.key, cert: data.cert };
}

/** Valida credenciales y devuelve un cliente ECF autenticado (listo para enviar/consultar). */
export async function crearClienteDGII(
  config: IDgiiEcfConfig,
  certificado: ICertificadoP12
): Promise<IClienteDGII> {
  if (!tieneCredencialesDirectas(config)) {
    throw httpError(400, 'Credenciales directas DGII incompletas (client_secret/clave_certificado).', 'DGII_DIRECTO_SIN_CREDENCIALES');
  }
  if (!config.rnc_emisor) {
    throw httpError(400, 'Falta el RNC emisor en la configuración DGII.', 'DGII_SIN_RNC_EMISOR');
  }
  const cert = await leerCertificado(certificado);
  const cliente = new ECF(cert, mapearAmbiente(config.ambiente));
  await cliente.authenticate();
  return { cliente, cert };
}

/**
 * Emite un e-CF directo contra la DGII.
 * - Tipo 32 con total < 250K: firma el ECF, genera RFCE y envía el resumen
 *   (devuelve xmlFirmado + xmlRfceFirmado + codigoSeguridad).
 * - Resto (31/33/34 y 32 >= 250K): envía el documento firmado completo.
 */
export async function emitirECFDirecto(params: IEmitirECFParams): Promise<IResultadoEmisionECF> {
  const { config, tipoECF, ncf, detalles, certificado } = params;
  if (!certificado) {
    throw httpError(400, 'Falta el certificado DigiFirma (.p12) para emitir directo.', 'DGII_DIRECTO_SIN_CERTIFICADO');
  }
  if (!detalles?.length) {
    throw httpError(400, 'No hay detalles para emitir el e-CF.', 'ECF_SIN_DETALLES');
  }

  const { cliente, cert } = await crearClienteDGII(config, certificado);
  const firma = new Signature(cert.key, cert.cert);

  const comprobante = construirECF({
    tipoECF,
    ncf,
    cfg: {
      rnc_emisor: config.rnc_emisor || '',
      razon_social_emisor: config.razon_social_emisor ?? undefined,
      direccion_emisor: config.direccion_emisor ?? undefined,
    },
    rncReceptor: params.rncReceptor,
    razonSocialReceptor: params.razonSocialReceptor,
    detalles,
    tipoPago: params.tipoPago,
    fechaVencimientoSecuencia: params.fechaVencimientoSecuencia,
  });

  const xmlFirmado = firma.signXml(jsonAECFXML(comprobante), 'ECF');
  const nombreArchivo = construirNombreArchivo(config.rnc_emisor || '', ncf);

  if (tipoECF === 32 && calcularMontoTotal(detalles) < LIMITE_RESUMEN_E32) {
    const rfce = convertECF32ToRFCE(xmlFirmado);
    const xmlRfceFirmado = firma.signXml(rfce.xml, 'RFCE');
    const respuesta = await cliente.sendSummary(xmlRfceFirmado, nombreArchivo);
    logger.info({
      action: 'ECF_DIRECTO_RESUMEN_ENVIADO',
      tipoECF,
      ncf,
      codigoSeguridad: rfce.securityCode,
    });
    return {
      xmlFirmado,
      xmlRfceFirmado,
      nombreArchivo,
      codigoSeguridad: rfce.securityCode,
      respuesta,
    };
  }

  const respuesta = await cliente.sendElectronicDocument(xmlFirmado, nombreArchivo);
  const trackId = (respuesta as { trackId?: unknown } | undefined)?.trackId;
  logger.info({ action: 'ECF_DIRECTO_ENVIADO', tipoECF, ncf, trackId: String(trackId ?? '') });
  return { xmlFirmado, nombreArchivo, trackId: trackId ? String(trackId) : undefined, respuesta };
}

/** Consulta de estado por track ID (respuesta de envío). */
export async function consultarEstadoECF(
  config: IDgiiEcfConfig,
  certificado: ICertificadoP12,
  trackId: string
): Promise<unknown> {
  const { cliente } = await crearClienteDGII(config, certificado);
  const estado = await cliente.statusTrackId(trackId);
  logger.info({ action: 'ECF_DIRECTO_ESTADO', trackId, estado: String((estado as { estado?: unknown } | undefined)?.estado ?? '') });
  return estado;
}

/** Validez de un comprobante por RNC emisor, e-NCF, RNC comprador y código de seguridad. */
export async function consultarValidezECF(
  config: IDgiiEcfConfig,
  certificado: ICertificadoP12,
  params: { rncEmisor: string; encf: string; rncComprador?: string; codigoSeguridad?: string }
): Promise<unknown> {
  const { cliente } = await crearClienteDGII(config, certificado);
  const validez = await cliente.inquiryStatus(
    params.rncEmisor,
    params.encf,
    params.rncComprador || '',
    params.codigoSeguridad || ''
  );
  logger.info({ action: 'ECF_DIRECTO_VALIDEZ', encf: params.encf });
  return validez;
}

/** Información básica del certificado (.p12), incluida la fecha de expiración. */
export async function infoCertificado(input: ICertificadoP12) {
  if (!input.passphrase) {
    throw httpError(400, 'Falta la passphrase del certificado DigiFirma (.p12).', 'CERT_PASSPHRASE_REQUERIDA');
  }
  const reader = new P12Reader(input.passphrase);
  return input.base64 ? reader.getCertificateInfoFromBase64(input.base64) : reader.getCertificateInfo(input.rutaArchivo || '');
}