/**
 * Reglas de los comprobantes fiscales en pantalla (el servidor las vuelve a validar): tipos, RNC/cédula, qué exige cada
 * tipo del comprador y cómo se arma lo que imprime el ticket. Espejo de `src/lib/comprobantes.ts`.
 */

/** Facturas de consumo menores a este monto usan el resumen de la DGII; desde aquí exigen identificar al comprador. */
export const LIMITE_CONSUMO_RESUMEN = 250000;

/** Tipos conocidos (para etiquetas cuando todavía no llegó el estado del servidor). */
export const TIPOS = {
  E32: { codigo: 'E32', nombre: 'Consumo', titulo: 'Factura de Consumo Electrónica', electronico: true, comprador: 'segun-monto' },
  E31: { codigo: 'E31', nombre: 'Crédito fiscal', titulo: 'Factura de Crédito Fiscal Electrónica', electronico: true, comprador: 'siempre' },
  E45: { codigo: 'E45', nombre: 'Gubernamental', titulo: 'Comprobante Electrónico Gubernamental', electronico: true, comprador: 'siempre' },
  E44: { codigo: 'E44', nombre: 'Regímenes especiales', titulo: 'Comprobante Electrónico para Regímenes Especiales', electronico: true, comprador: 'siempre' },
  E34: { codigo: 'E34', nombre: 'Nota de crédito', titulo: 'Nota de Crédito Electrónica', electronico: true, comprador: 'no' },
  B02: { codigo: 'B02', nombre: 'Consumo (NCF)', titulo: 'Factura de Consumo', electronico: false, comprador: 'no' },
  B01: { codigo: 'B01', nombre: 'Crédito fiscal (NCF)', titulo: 'Factura de Crédito Fiscal', electronico: false, comprador: 'siempre' },
  B15: { codigo: 'B15', nombre: 'Gubernamental (NCF)', titulo: 'Comprobante Gubernamental', electronico: false, comprador: 'siempre' },
  B14: { codigo: 'B14', nombre: 'Regímenes especiales (NCF)', titulo: 'Comprobante para Regímenes Especiales', electronico: false, comprador: 'siempre' },
};

export const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

export const esTipoElectronico = (tipo) => Boolean(TIPOS[tipo]?.electronico) || tipo === 'e-CF';

/** Título de la representación impresa; el antiguo valor 'e-CF' se toma como consumo electrónico. */
export const tituloComprobante = (tipo) => TIPOS[tipo]?.titulo || TIPOS.E32.titulo;

/** RNC (9 dígitos, módulo 11) o cédula (11 dígitos, módulo 10), igual que el servidor. */
export function validarRnc(valor) {
  const d = soloDigitos(valor);
  if (d.length === 9) {
    const pesos = [7, 8, 9, 4, 5, 6, 7, 8];
    const suma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const resto = suma % 11;
    const digito = resto === 0 ? 0 : resto === 1 ? 1 : 11 - resto;
    return digito === Number(d[8]);
  }
  if (d.length === 11) {
    const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
    const suma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    return (10 - (suma % 10)) % 10 === Number(d[8]);
  }
  return false;
}

/** 131000004 → 1-31-00000-4 · 40200000001 → 402-0000000-1 (solo para mostrar). */
export function formatearDocumento(valor) {
  const d = soloDigitos(valor);
  if (d.length === 9) return `${d[0]}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d[8]}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d[10]}`;
  return String(valor ?? '');
}

/** ¿Este tipo exige identificar al comprador para este total? */
export function exigeComprador(tipo, total) {
  const regla = TIPOS[tipo]?.comprador || 'no';
  return regla === 'siempre' || (regla === 'segun-monto' && Number(total) >= LIMITE_CONSUMO_RESUMEN);
}

/** Mensaje de lo que falta o está mal del comprador; cadena vacía si todo está bien. */
export function errorComprador({ tipo, total, rnc, nombre }) {
  const doc = soloDigitos(rnc);
  const electronico = TIPOS[tipo]?.electronico;
  if (exigeComprador(tipo, total)) {
    if (!doc) return 'Este comprobante exige el RNC o la cédula del cliente.';
    if (!String(nombre ?? '').trim() && electronico) return 'Este comprobante exige el nombre o razón social del cliente.';
  }
  if (doc && !validarRnc(doc)) return 'El RNC o la cédula no es válido (9 dígitos para RNC, 11 para cédula).';
  return '';
}

/** 2026-11-15 → 15/11/2026 */
export function fechaLegible(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(iso ?? '');
}

/** 25-10-2026 · 21:30:05 en hora de Santo Domingo (la fecha de firma y de emisión del comprobante). */
export function fechaHoraRd(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  const partes = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t) => partes.find((p) => p.type === t)?.value ?? '';
  return `${g('day')}-${g('month')}-${g('year')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}:${g('second')}`;
}

/** Solo la fecha (dd-MM-yyyy) en hora de Santo Domingo. */
export const fechaRd = (valor) => fechaHoraRd(valor).slice(0, 10);

/**
 * Datos que imprime el ticket de una venta cobrada. `representacion` es lo que devuelve el servidor al cobrar
 * (`/api/cuentas/:id/cerrar`) o al reimprimir (`/api/cuentas/:id/comprobante`): tipo, e-NCF, timbre y comprador.
 */
export function datosTicketFiscal(representacion, respaldo = {}) {
  const r = representacion || {};
  return {
    tipoComprobante: r.tipo || respaldo.tipoComprobante || 'B02',
    ncfGenerado: r.ncf || respaldo.ncfGenerado || '',
    tituloComprobante: r.titulo || tituloComprobante(r.tipo || respaldo.tipoComprobante),
    electronico: r.electronico ?? esTipoElectronico(r.tipo || respaldo.tipoComprobante),
    estadoEcf: r.estado || null,
    pendienteEcf: Boolean(r.pendiente),
    codigoSeguridad: r.codigoSeguridad || null,
    fechaFirma: r.fechaFirma || null,
    qrUrl: r.qrUrl || null,
    fechaEmision: r.fechaEmision || null,
    fechaVencimientoSecuencia: r.fechaVencimientoSecuencia || null,
    rncCliente: r.comprador?.rnc || respaldo.rncCliente || '',
    razonSocialCliente: r.comprador?.razonSocial || respaldo.razonSocialCliente || '',
    // El emisor declarado a la DGII manda sobre lo que tenga la pantalla (nunca se imprime un RNC inventado).
    ...(r.emisor
      ? {
        nombreNegocio: r.emisor.razonSocial || r.emisor.nombreComercial || undefined,
        nombreComercial: r.emisor.nombreComercial || undefined,
        rncNegocio: r.emisor.rnc || '',
        direccionNegocio: r.emisor.direccion || '',
        telefonoNegocio: r.emisor.telefono || '',
      }
      : {}),
  };
}
