/**
 * @file Reglas de los comprobantes fiscales de la DGII: tipos, formato del e-NCF, fecha en que la facturación
 * electrónica pasa a ser obligatoria (el NCF tradicional B01/B02/B14/B15 deja de ser válido), validación del comprador
 * y enlace del QR de la representación impresa. Solo funciones puras: nada aquí toca la base ni la red.
 */

import { httpError } from './core.js';
import { normalizarRNC, validarRNC } from './rnc.js';

/** Desde este día (inclusive, hora de Santo Domingo) solo valen los comprobantes electrónicos. Configurable en dgii_config. */
export const FECHA_CORTE_ECF_POR_DEFECTO = '2026-11-15';

/** Facturas de consumo menores a este monto se envían como resumen (RFCE) y usan el QR "fc" de la DGII. */
export const LIMITE_CONSUMO_RESUMEN = 250_000;

export type TipoEcf = 'E31' | 'E32' | 'E34' | 'E44' | 'E45';
export type TipoNcfTradicional = 'B01' | 'B02' | 'B14' | 'B15';

export interface ITipoComprobante {
  codigo: TipoEcf | TipoNcfTradicional;
  /** Nombre corto para listas y botones. */
  nombre: string;
  /** Encabezado de la representación impresa. */
  titulo: string;
  electronico: boolean;
  /** 'siempre': RNC/cédula y razón social obligatorios. 'segun-monto': solo desde RD$ 250,000. 'no': opcional. */
  comprador: 'siempre' | 'segun-monto' | 'no';
  /** Código del tipo de e-CF (31, 32…) o null en los NCF tradicionales. */
  numero: number | null;
  /** El tipo electrónico que sustituye a este NCF tradicional. */
  equivalenteElectronico?: TipoEcf;
}

export const TIPOS_COMPROBANTE: Record<string, ITipoComprobante> = {
  E32: { codigo: 'E32', nombre: 'Consumo', titulo: 'Factura de Consumo Electrónica', electronico: true, comprador: 'segun-monto', numero: 32 },
  E31: { codigo: 'E31', nombre: 'Crédito fiscal', titulo: 'Factura de Crédito Fiscal Electrónica', electronico: true, comprador: 'siempre', numero: 31 },
  E45: { codigo: 'E45', nombre: 'Gubernamental', titulo: 'Comprobante Electrónico Gubernamental', electronico: true, comprador: 'siempre', numero: 45 },
  E44: { codigo: 'E44', nombre: 'Regímenes especiales', titulo: 'Comprobante Electrónico para Regímenes Especiales', electronico: true, comprador: 'siempre', numero: 44 },
  E34: { codigo: 'E34', nombre: 'Nota de crédito', titulo: 'Nota de Crédito Electrónica', electronico: true, comprador: 'no', numero: 34 },
  B02: { codigo: 'B02', nombre: 'Consumo (NCF)', titulo: 'Factura de Consumo', electronico: false, comprador: 'no', numero: null, equivalenteElectronico: 'E32' },
  B01: { codigo: 'B01', nombre: 'Crédito fiscal (NCF)', titulo: 'Factura de Crédito Fiscal', electronico: false, comprador: 'siempre', numero: null, equivalenteElectronico: 'E31' },
  B15: { codigo: 'B15', nombre: 'Gubernamental (NCF)', titulo: 'Comprobante Gubernamental', electronico: false, comprador: 'siempre', numero: null, equivalenteElectronico: 'E45' },
  B14: { codigo: 'B14', nombre: 'Regímenes especiales (NCF)', titulo: 'Comprobante para Regímenes Especiales', electronico: false, comprador: 'siempre', numero: null, equivalenteElectronico: 'E44' },
};

/** Tipos que se pueden elegir al cobrar una venta (las notas de crédito se emiten aparte). */
export const TIPOS_ECF_VENTA: readonly TipoEcf[] = ['E32', 'E31', 'E45', 'E44'];
export const TIPOS_NCF_TRADICIONALES: readonly TipoNcfTradicional[] = ['B02', 'B01', 'B15', 'B14'];

export const esTipoElectronico = (tipo: string | null | undefined): boolean => Boolean(tipo && TIPOS_COMPROBANTE[tipo]?.electronico);
export const esTipoTradicional = (tipo: string | null | undefined): boolean => Boolean(tipo && TIPOS_COMPROBANTE[tipo] && !TIPOS_COMPROBANTE[tipo].electronico);

/** Título de la representación impresa; cualquier valor desconocido (p. ej. el antiguo 'e-CF') cae en el de consumo. */
export function tituloComprobante(tipo: string | null | undefined): string {
  return TIPOS_COMPROBANTE[String(tipo)]?.titulo ?? TIPOS_COMPROBANTE.E32.titulo;
}

// ───────────── Fecha de corte ─────────────

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !FECHA_ISO.test(valor)) {return false;}
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

/** Fecha de hoy (YYYY-MM-DD) en Santo Domingo, sin depender de la zona horaria del servidor. */
export function hoyEnRepublicaDominicana(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export interface IEstadoCorteEcf {
  fechaCorte: string;
  hoy: string;
  /** true: desde hoy el NCF tradicional ya no es válido. */
  obligatorio: boolean;
  /** Días que faltan para el corte (0 el mismo día del corte; negativo si ya pasó). */
  diasRestantes: number;
}

export function estadoCorteEcf(fechaCorte: string | null | undefined, hoy: string = hoyEnRepublicaDominicana()): IEstadoCorteEcf {
  const corte = esFechaIso(fechaCorte) ? fechaCorte : FECHA_CORTE_ECF_POR_DEFECTO;
  const dias = Math.round((Date.parse(`${corte}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  return { fechaCorte: corte, hoy, obligatorio: dias <= 0, diasRestantes: dias };
}

/** 2026-11-15 → 15/11/2026 */
export const fechaLegible = (iso: string): string => (esFechaIso(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

// ───────────── Tipo de comprobante pedido al cobrar ─────────────

/**
 * Convierte lo que llega del cliente en el tipo de comprobante a emitir.
 *  - Vacío: E32 si el e-CF ya es obligatorio; si no, B02 (así se comportaban las versiones anteriores).
 *  - Desconocido: error (antes se sustituía en silencio por B02).
 *  - El antiguo valor 'e-CF' se toma como consumo electrónico (E32).
 *  - NCF tradicional con el e-CF obligatorio: error, porque ese comprobante ya no tiene validez fiscal.
 */
export function resolverTipoComprobante(crudo: unknown, obligatorio: boolean, fechaCorte: string = FECHA_CORTE_ECF_POR_DEFECTO): string {
  const texto = String(crudo ?? '').trim();
  if (!texto) {return obligatorio ? 'E32' : 'B02';}
  const tipo = texto.toLowerCase() === 'e-cf' ? 'E32' : texto.toUpperCase();
  if (!TIPOS_COMPROBANTE[tipo] || tipo === 'E34') {
    throw httpError(400, `Tipo de comprobante no válido: ${texto}. Usa E32, E31, E45 o E44.`, 'COMPROBANTE_INVALIDO');
  }
  if (obligatorio && !TIPOS_COMPROBANTE[tipo].electronico) {
    const sustituto = TIPOS_COMPROBANTE[tipo].equivalenteElectronico;
    throw httpError(
      400,
      `Desde el ${fechaLegible(fechaCorte)} el NCF tradicional (${tipo}) ya no es válido: emite el comprobante electrónico ${sustituto}. Si ves este aviso desde la caja, actualiza el sistema a la última versión.`,
      'NCF_NO_VALIDO'
    );
  }
  return tipo;
}

export interface ICompradorComprobante {
  rnc: string;
  razonSocial: string;
}

/**
 * Valida el comprador según el tipo y el total. Crédito fiscal, gubernamental y regímenes especiales exigen RNC/cédula
 * válidos y razón social; el consumo los exige desde RD$ 250,000; en los demás casos son opcionales, pero si se
 * escribe un documento debe ser válido. Devuelve el documento normalizado (solo dígitos) y la razón social recortada.
 */
export function validarComprador(tipo: string, total: number, rncCrudo: unknown, razonSocialCruda: unknown): ICompradorComprobante {
  const rnc = normalizarRNC(String(rncCrudo ?? ''));
  const razonSocial = String(razonSocialCruda ?? '').trim().slice(0, 150);
  const regla = TIPOS_COMPROBANTE[tipo]?.comprador ?? 'no';
  const exige = regla === 'siempre' || (regla === 'segun-monto' && total >= LIMITE_CONSUMO_RESUMEN);
  if (exige) {
    if (!rnc) {throw httpError(400, 'Este comprobante exige el RNC o la cédula del cliente.', 'COMPRADOR_REQUERIDO');}
    if (!razonSocial && TIPOS_COMPROBANTE[tipo]?.electronico) {throw httpError(400, 'Este comprobante exige el nombre o razón social del cliente.', 'COMPRADOR_REQUERIDO');}
  }
  if (rnc && !validarRNC(rnc)) {
    throw httpError(400, 'El RNC o la cédula del cliente no es válido (9 dígitos para RNC, 11 para cédula).', 'RNC_INVALIDO');
  }
  return { rnc, razonSocial };
}

// ───────────── e-NCF ─────────────

/** Formato oficial: E + tipo de 2 dígitos + secuencial de 10 dígitos (13 caracteres). El NCF tradicional lleva 8 dígitos. */
export function formatearComprobante(prefijo: string, numero: number): string {
  const largo = /^E\d{2}$/.test(prefijo) ? 10 : 8;
  return `${prefijo}${String(numero).padStart(largo, '0')}`;
}

export const esENcfValido = (encf: string | null | undefined): boolean => /^E(31|32|33|34|41|43|44|45|46|47)\d{10}$/.test(String(encf ?? ''));

/** Máximo secuencial que admite cada formato (8 dígitos en NCF, 10 en e-NCF). */
export const maximoSecuencial = (tipo: string): number => (esTipoElectronico(tipo) ? 9_999_999_999 : 99_999_999);

// ───────────── QR de la representación impresa ─────────────

export type AmbienteEcf = 'Pruebas' | 'Certificacion' | 'Produccion';

/** Normaliza lo que guardan los proveedores (TEST/PROD, TesteCF, CerteCF, eCF, «Producción»…) a un ambiente de la DGII. */
export function ambienteDeConfiguracion(config: {
  proveedor_ecf?: string | null;
  ambiente?: string | null;
  algoback_ambiente?: string | null;
}): AmbienteEcf {
  const proveedor = String(config.proveedor_ecf || 'algoback').toLowerCase();
  if (proveedor === 'mseller') {
    const a = String(config.ambiente || '').toLowerCase();
    if (a.startsWith('prod') || a === 'ecf') {return 'Produccion';}
    if (a.startsWith('cert')) {return 'Certificacion';}
    return 'Pruebas';
  }
  return String(config.algoback_ambiente || '').toUpperCase() === 'PROD' ? 'Produccion' : 'Pruebas';
}

const RUTA_AMBIENTE: Record<AmbienteEcf, string> = { Pruebas: 'testecf', Certificacion: 'certecf', Produccion: 'ecf' };

export const esConsumoResumen = (tipo: string, total: number): boolean => tipo === 'E32' && total < LIMITE_CONSUMO_RESUMEN;

export interface IParametrosQr {
  ambiente: AmbienteEcf;
  rncEmisor: string;
  rncComprador?: string | null;
  encf: string;
  /** dd-MM-yyyy */
  fechaEmision: string;
  montoTotal: number;
  /** dd-MM-yyyy HH:mm:ss */
  fechaFirma?: string | null;
  codigoSeguridad?: string | null;
  tipo: string;
}

/**
 * Enlace de consulta del timbre fiscal que lleva el QR (norma de representación impresa de la DGII). Los consumos
 * menores a RD$ 250,000 usan la consulta de resumen (`fc.dgii.gov.do/.../ConsultaTimbreFC`); el resto, `ConsultaTimbre`.
 */
export function construirUrlConsultaTimbre(p: IParametrosQr): string {
  const e = (v: string | null | undefined): string => encodeURIComponent(v ?? '');
  const monto = p.montoTotal.toFixed(2);
  const ruta = RUTA_AMBIENTE[p.ambiente];
  if (esConsumoResumen(p.tipo, p.montoTotal)) {
    return `https://fc.dgii.gov.do/${ruta}/ConsultaTimbreFC?RncEmisor=${e(p.rncEmisor)}&ENCF=${e(p.encf)}&MontoTotal=${monto}&CodigoSeguridad=${e(p.codigoSeguridad)}`;
  }
  return `https://ecf.dgii.gov.do/${ruta}/ConsultaTimbre?RncEmisor=${e(p.rncEmisor)}&RncComprador=${e(p.rncComprador)}`
    + `&ENCF=${e(p.encf)}&FechaEmision=${e(p.fechaEmision)}&MontoTotal=${monto}&FechaFirma=${e(p.fechaFirma)}&CodigoSeguridad=${e(p.codigoSeguridad)}`;
}

/** dd-MM-yyyy (como lo exige el XML y el QR) a partir de una fecha ISO o Date, en hora de Santo Domingo. */
export function fechaDdMmYyyy(valor: Date | string): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string): string => partes.find((x) => x.type === t)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

/** dd-MM-yyyy HH:mm:ss en hora de Santo Domingo (formato de FechaFirma). */
export function fechaHoraDdMmYyyy(valor: Date | string): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string): string => partes.find((x) => x.type === t)?.value ?? '';
  const hora = get('hour') === '24' ? '00' : get('hour');
  return `${get('day')}-${get('month')}-${get('year')} ${hora}:${get('minute')}:${get('second')}`;
}
