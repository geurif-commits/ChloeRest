/**
 * @file Exportadores oficiales DGII (formatos 606 y 607)
 * Funciones puras de formateo: reciben filas de BD y devuelven filas DGII
 * o contenido serializado (txt/csv). No dependen de req/res.
 * Puerto directo de lib/dgii.js a TypeScript.
 */

export const COLS_607 = [
  'rnc_cedula', 'tipo_id', 'ncf', 'ncf_modificado', 'tipo_ingreso', 'fecha_comprobante',
  'fecha_retencion', 'monto_facturado', 'itbis_facturado', 'itbis_retenido', 'itbis_percibido',
  'retencion_renta', 'isr_percibido', 'isc', 'otros_impuestos', 'propina_legal', 'efectivo',
  'cheque_transferencia', 'tarjeta', 'venta_credito', 'bonos', 'permuta', 'otras_formas',
] as const;

export const COLS_606 = [
  'rnc_cedula', 'tipo_id', 'tipo_bienes_servicios', 'ncf', 'ncf_modificado', 'fecha_comprobante',
  'fecha_pago', 'monto_facturado_servicios', 'monto_facturado_bienes', 'total_monto_facturado',
  'itbis_facturado', 'itbis_retenido', 'itbis_sujeto_proporcionalidad', 'itbis_llevado_al_costo',
  'itbis_por_adelantar', 'itbis_percibido_compras', 'tipo_retencion_isr', 'monto_retencion_renta',
  'isr_percibido_compras', 'isc', 'otros_impuestos', 'propina_legal', 'forma_pago',
] as const;

export interface IVenta607 {
  ncf?: string;
  rnc_cedula_cliente?: string;
  subtotal?: number;
  itbis?: number;
  propina?: number;
  total?: number;
  metodo_pago?: string;
  fecha_cierre?: string;
  fecha_apertura?: string;
}

export interface IGasto606 {
  id: number;
  cantidad?: number;
  costo_unitario?: number;
  fecha?: string;
}

export type FilaDGII = Record<string, string>;

function fechaDGII(fecha?: string | number | Date): string {
  const f = new Date(fecha || Date.now());
  return `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
}

/** Formato 607: Ventas de Bienes y Servicios. */
export function formatearFila607(v: IVenta607): FilaDGII {
  const docCliente = String(v.rnc_cedula_cliente || '').replace(/[^0-9]/g, '');
  let tipoId = '3';
  if (docCliente.length === 9) {tipoId = '1';}
  else if (docCliente.length === 11) {tipoId = '2';}

  const subtotal = Number(v.subtotal || 0).toFixed(2);
  const itbis = Number(v.itbis || 0).toFixed(2);
  const propina = Number(v.propina || 0).toFixed(2);
  const total = Number(v.total || 0).toFixed(2);

  let efectivo = '0.00';
  let tarjeta = '0.00';
  let transferencia = '0.00';
  if (v.metodo_pago === 'Efectivo') {efectivo = total;}
  else if (v.metodo_pago === 'Tarjeta') {tarjeta = total;}
  else if (v.metodo_pago === 'Transferencia') {transferencia = total;}
  else {efectivo = Number(v.subtotal || 0).toFixed(2);}

  return {
    rnc_cedula: docCliente || (v.ncf?.startsWith('B02') || v.ncf?.startsWith('E32') ? '' : '000000000'),
    tipo_id: docCliente ? tipoId : '',
    ncf: v.ncf || '',
    ncf_modificado: '',
    tipo_ingreso: '01',
    fecha_comprobante: fechaDGII(v.fecha_cierre || v.fecha_apertura),
    fecha_retencion: '',
    monto_facturado: subtotal,
    itbis_facturado: itbis,
    itbis_retenido: '0.00',
    itbis_percibido: '0.00',
    retencion_renta: '0.00',
    isr_percibido: '0.00',
    isc: '0.00',
    otros_impuestos: propina,
    propina_legal: propina,
    efectivo,
    cheque_transferencia: transferencia,
    tarjeta,
    venta_credito: '0.00',
    bonos: '0.00',
    permuta: '0.00',
    otras_formas: '0.00',
  };
}

/**
 * Formato 606: Compras y Gastos.
 * Usa el costo unitario real del insumo (ingredientes.costo_unitario). Si el
 * insumo no tiene costo cargado, cae a 50.00 (valor por defecto documentado
 * en el runbook de certificación DGII) para no subreportar movimientos.
 */
export function formatearFila606(g: IGasto606): FilaDGII {
  const fechaComp = fechaDGII(g.fecha);
  const costo = Number(g.costo_unitario) > 0 ? Number(g.costo_unitario) : 50.0;
  const monto = (costo * Number(g.cantidad || 1)).toFixed(2);
  return {
    rnc_cedula: '000000000',
    tipo_id: '1',
    tipo_bienes_servicios: '02',
    ncf: `B010000000${g.id}`,
    ncf_modificado: '',
    fecha_comprobante: fechaComp,
    fecha_pago: fechaComp,
    monto_facturado_servicios: '0.00',
    monto_facturado_bienes: monto,
    total_monto_facturado: monto,
    itbis_facturado: '0.00',
    itbis_retenido: '0.00',
    itbis_sujeto_proporcionalidad: '0.00',
    itbis_llevado_al_costo: '0.00',
    itbis_por_adelantar: '0.00',
    itbis_percibido_compras: '0.00',
    tipo_retencion_isr: '',
    monto_retencion_renta: '0.00',
    isr_percibido_compras: '0.00',
    isc: '0.00',
    otros_impuestos: '0.00',
    propina_legal: '0.00',
    forma_pago: '01',
  };
}

function esc(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/** Serializa filas DGII a TXT (formato oficial de la DGII). */
export function serializarTXT(
  tipo: string,
  rncEmisor: string,
  periodo: string,
  filas: FilaDGII[],
  cols: readonly string[]
): string {
  const header = `${tipo}|${rncEmisor}|${periodo}|${filas.length}`;
  const bodyLines = filas.map((r) => cols.map((c) => r[c]).join('|'));
  return [header, ...bodyLines].join('\r\n');
}

/** Serializa filas DGII a CSV. */
export function serializarCSV(filas: FilaDGII[], cols: readonly string[]): string {
  const csvLines = [cols.join(','), ...filas.map((r) => cols.map((c) => esc(r[c])).join(','))];
  return csvLines.join('\r\n');
}
