/**
 * @file Proveedor AlgoBack (API e-CF v2, «JSON mínimo»): arma el cuerpo de la factura y lee la respuesta. AlgoBack genera el
 * XML oficial, lo firma con el certificado de la empresa y lo envía a la DGII; el sistema controla la secuencia de e-NCF.
 *   POST /ecf/v2/procesar-factura          emitir (encabezado X-Operacion-Id evita la doble emisión al reintentar)
 *   GET  /ecf/consultar-factura/{trackId}  estado por trackId
 *   GET  /ecf/consultar-encf/{eNCF}        estado por e-NCF
 * Es el mismo mapeo que usa la versión de escritorio. Los precios van CON ITBIS incluido (IndicadorMontoGravado = 1).
 * Funciones puras: no hacen ninguna llamada de red.
 */

import { normalizarRNC } from './rnc.js';
import { LIMITE_CONSUMO_RESUMEN, esFechaIso, fechaDdMmYyyy } from './comprobantes.js';
import type { ILineaEcf } from './ecfCuenta.js';

export const BASE_URL_ALGOBACK = 'https://api-dgii.algoback.com';

export interface IEmisorEcf {
  rnc: string;
  razonSocial: string;
  direccion: string;
}

export interface ICompradorEcf {
  rnc: string;
  razonSocial: string;
}

export interface IFacturaAlgoBack {
  encf: string;
  /** E31, E32, E44 o E45. */
  tipo: string;
  fechaEmision: Date | string;
  /** Vencimiento de la secuencia de e-NCF (YYYY-MM-DD); la DGII lo exige en crédito fiscal, gubernamental y regímenes especiales. */
  vencimientoSecuencia?: string | null;
  emisor: IEmisorEcf;
  comprador?: ICompradorEcf | null;
  lineas: ILineaEcf[];
  /** true si la venta queda a crédito (en un restaurante, siempre false). */
  aCredito?: boolean;
  numeroInterno: string;
}

const redondear = (valor: number, decimales: number): number => {
  const f = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * f) / f;
};
const dinero = (valor: number): string => redondear(valor, 2).toFixed(2);
/** Precio unitario con 2 a 4 decimales (como «0.00##»). */
const precio = (valor: number): string => {
  const [entero, decimales = ''] = redondear(valor, 4).toFixed(4).split('.');
  return `${entero}.${decimales.replace(/0+$/, '').padEnd(2, '0')}`;
};
const cortar = (texto: string, max: number): string => (texto.length <= max ? texto : texto.slice(0, max));

/** IndicadorFacturacion: 1 ITBIS 18 %, 2 ITBIS 16 %, 3 ITBIS 0 %, 4 exento. */
export function indicadorFacturacion(tasa: number): 1 | 2 | 3 | 4 {
  if (tasa >= 17) {return 1;}
  if (tasa >= 15) {return 2;}
  return 4;
}

const TASA_POR_INDICADOR: Record<number, number> = { 1: 0.18, 2: 0.16, 3: 0, 4: 0 };

/** Importe de una línea tal como lo recalcula la DGII: cantidad × precio unitario (4 decimales), a 2 decimales. */
const importeLinea = (l: ILineaEcf): number => redondear(l.cantidad * redondear(l.precioUnitarioFinal, 4), 2);

/**
 * ITBIS y total que la DGII recalcula a partir de los precios enviados: por grupo de tasa, sobre importes con ITBIS
 * incluido. Los regímenes especiales (E44) no llevan ITBIS.
 */
export function totalesAlgoBack(tipo: string, lineas: ILineaEcf[]): { itbis: number; total: number } {
  const grupos = new Map<number, number>();
  for (const l of lineas) {
    const ind = tipo === 'E44' ? 4 : indicadorFacturacion(l.tasa);
    grupos.set(ind, (grupos.get(ind) ?? 0) + importeLinea(l));
  }
  let total = 0;
  let itbis = 0;
  for (const [ind, importe] of grupos) {
    total += importe;
    const tasa = TASA_POR_INDICADOR[ind];
    if (tasa > 0) {
      const gravado = redondear(importe / (1 + tasa), 2);
      itbis += redondear(gravado * tasa, 2);
    }
  }
  return { itbis: redondear(itbis, 2), total: redondear(total, 2) };
}

/** Cuerpo de POST /ecf/v2/procesar-factura. Lanza Error con un mensaje accionable si falta algún dato obligatorio. */
export function construirCuerpoAlgoBack(f: IFacturaAlgoBack): Record<string, unknown> {
  const rncEmisor = normalizarRNC(f.emisor.rnc);
  if (rncEmisor.length !== 9 && rncEmisor.length !== 11) {
    throw new Error('El RNC del emisor no es válido. Corrígelo en DGII > e-CF > Datos del emisor.');
  }
  if (!f.emisor.direccion.trim()) {
    throw new Error('Falta la dirección del emisor: es obligatoria en el e-CF (DGII > e-CF > Datos del emisor).');
  }
  const cuerpo: Record<string, unknown> = { eNCF: f.encf };
  if (['E31', 'E44', 'E45'].includes(f.tipo)) {
    if (!esFechaIso(f.vencimientoSecuencia)) {
      throw new Error(`Registra la fecha de vencimiento de la secuencia ${f.tipo} (DGII > Secuencias).`);
    }
    cuerpo.FechaVencimientoSecuencia = fechaDdMmYyyy(new Date(`${f.vencimientoSecuencia}T12:00:00-04:00`));
  }
  cuerpo.RNCEmisor = rncEmisor;
  cuerpo.RazonSocialEmisor = cortar(f.emisor.razonSocial.trim(), 150);
  cuerpo.DireccionEmisor = cortar(f.emisor.direccion.trim(), 100);
  cuerpo.FechaEmision = fechaDdMmYyyy(f.fechaEmision);

  const { itbis, total } = totalesAlgoBack(f.tipo, f.lineas);
  const rncComprador = normalizarRNC(f.comprador?.rnc);
  const exigeComprador = ['E31', 'E44', 'E45'].includes(f.tipo) || (f.tipo === 'E32' && total >= LIMITE_CONSUMO_RESUMEN);
  if ((rncComprador.length === 9 || rncComprador.length === 11) && f.comprador) {
    cuerpo.RNCComprador = rncComprador;
    cuerpo.RazonSocialComprador = cortar(f.comprador.razonSocial.trim(), 150);
  } else if (exigeComprador) {
    throw new Error('Este comprobante exige el RNC o la cédula válidos del cliente.');
  }

  cuerpo.TipoPago = f.aCredito ? '2' : '1';
  cuerpo.TipoIngresos = '01';
  if (f.lineas.some((l) => (f.tipo === 'E44' ? 4 : indicadorFacturacion(l.tasa)) !== 4)) {
    cuerpo.IndicadorMontoGravado = '1'; // los precios enviados ya incluyen el ITBIS
  }
  cuerpo.NumeroFacturaInterna = cortar(f.numeroInterno, 20);
  cuerpo.TotalITBIS = dinero(f.tipo === 'E44' ? 0 : itbis);
  cuerpo.MontoTotal = dinero(total);
  cuerpo.Item = f.lineas.map((l) => ({
    IndicadorFacturacion: String(f.tipo === 'E44' ? 4 : indicadorFacturacion(l.tasa)),
    NombreItem: cortar(l.descripcion.replace(/\s+/g, ' ').trim() || 'Artículo', 80),
    IndicadorBienoServicio: '1',
    CantidadItem: String(redondear(l.cantidad, 2)),
    PrecioUnitarioItem: precio(l.precioUnitarioFinal),
  }));
  return cuerpo;
}

// ───────────── Respuesta ─────────────

export type EstadoEcf = 'Aceptado' | 'Aceptado Condicional' | 'Rechazado' | 'Procesando' | 'Pendiente';

export interface IResultadoAlgoBack {
  estado: EstadoEcf;
  trackId: string | null;
  codigoSeguridad: string | null;
  /** Instante de la firma digital (el proveedor lo informa como dd-MM-yyyy HH:mm:ss, hora de Santo Domingo). */
  fechaFirma: Date | null;
  qrUrl: string | null;
  mensaje: string;
  /** true si vale la pena reintentar (caída del proveedor, cuota, respuesta ilegible). */
  reintentable: boolean;
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function texto(o: Record<string, unknown> | null, nombre: string): string | null {
  if (!o) {return null;}
  const clave = Object.keys(o).find((k) => k.toLowerCase() === nombre.toLowerCase());
  const valor = clave === undefined ? undefined : o[clave];
  if (valor === undefined || valor === null || typeof valor === 'object') {return null;}
  return String(valor);
}

function mensajes(nodo: unknown): string {
  if (!Array.isArray(nodo)) {return '';}
  const partes = nodo
    .map((m) => (typeof m === 'string' ? m : (texto(objeto(m), 'valor') ?? texto(objeto(m), 'mensaje') ?? texto(objeto(m), 'descripcion') ?? '')))
    .filter(Boolean);
  return partes.join(' · ').slice(0, 500);
}

/** dd-MM-yyyy HH:mm:ss (hora de Santo Domingo, UTC−4 todo el año) → Date. */
export function parsearFechaFirma(valor: string | null): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(valor ?? '');
  if (!m) {return null;}
  const fecha = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function mapearEstado(estado: string, codigo: string | null): EstadoEcf {
  const t = estado.toLowerCase().replace(/\s+/g, '');
  if (t.includes('condicional') || codigo === '4') {return 'Aceptado Condicional';}
  if (t.startsWith('aceptado') || codigo === '1') {return 'Aceptado';}
  if (t.startsWith('rechazado') || codigo === '2') {return 'Rechazado';}
  return 'Procesando';
}

/** Interpreta la respuesta HTTP de AlgoBack (emisión o consulta). `cuerpo` es el JSON ya leído (o null si no lo era). */
export function interpretarRespuestaAlgoBack(cuerpo: unknown, http: number): IResultadoAlgoBack {
  const vacio = { trackId: null, codigoSeguridad: null, fechaFirma: null, qrUrl: null };
  const raiz = objeto(cuerpo);
  if (!raiz) {
    return { ...vacio, estado: http >= 200 && http < 300 ? 'Procesando' : 'Pendiente', mensaje: http >= 500 ? `AlgoBack no está disponible (${http}). Se reintentará.` : `Respuesta inesperada de AlgoBack (${http}).`, reintentable: true };
  }
  if (http === 401) {return { ...vacio, estado: 'Pendiente', mensaje: 'AlgoBack rechazó la API-KEY (401). Revisa las credenciales en DGII > e-CF.', reintentable: false };}
  if (http === 429) {return { ...vacio, estado: 'Pendiente', mensaje: 'AlgoBack: límite de peticiones o cuota agotada (429). Se reintentará.', reintentable: true };}
  if (http >= 500) {return { ...vacio, estado: 'Pendiente', mensaje: `AlgoBack no está disponible (${http}). Se reintentará.`, reintentable: true };}

  const dgii = objeto(raiz.dgii);
  const estadoTexto = texto(dgii, 'estado') ?? texto(raiz, 'estado');
  if (estadoTexto === null) {
    // Error de validación o de la cuenta: no llegó a la DGII.
    const lista = mensajes(raiz.mensajes);
    const msg = lista || texto(raiz, 'message') || texto(raiz, 'mensaje') || texto(raiz, 'error') || `Error ${http} de AlgoBack.`;
    return { ...vacio, estado: http === 400 || http === 403 || http === 409 ? 'Rechazado' : 'Pendiente', mensaje: msg, reintentable: !(http === 400 || http === 403 || http === 409) };
  }
  const estado = mapearEstado(estadoTexto, texto(dgii, 'codigo'));
  const lista = mensajes(dgii?.mensajes ?? raiz.mensajes);
  return {
    estado,
    trackId: texto(dgii, 'trackId') ?? texto(raiz, 'trackId'),
    codigoSeguridad: texto(raiz, 'codigoSeguridad') ?? texto(dgii, 'codigoSeguridad'),
    fechaFirma: parsearFechaFirma(texto(raiz, 'fechaFirma')),
    qrUrl: texto(raiz, 'url') ?? texto(dgii, 'url'),
    mensaje: lista || (estado === 'Aceptado' ? `Aceptado por la DGII (${texto(raiz, 'tipoEnviado') ?? 'ECF'}).` : estadoTexto),
    reintentable: estado === 'Procesando',
  };
}
