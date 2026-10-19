const CENTAVOS = 100;

export const PROPINA_MIN = 2;
export const PROPINA_MAX = 30;
export const PROPINA_DEFECTO = 10;

/** Porcentaje de propina del negocio (2 % a 30 %); 10 % si no hay un valor válido. */
export function porcentajePropina(config) {
  const n = Number(config?.propina_porcentaje);
  return Number.isFinite(n) && n >= PROPINA_MIN && n <= PROPINA_MAX ? n : PROPINA_DEFECTO;
}

export function aCentavos(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * CENTAVOS);
}

export function deCentavos(centavos) {
  return Math.round(Number(centavos || 0)) / CENTAVOS;
}

export function formatearRD(valor) {
  return Number(valor || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Totales de una cuenta. Los precios del menú NO incluyen ITBIS ni propina: el ITBIS se suma
 * por línea con la tasa de cada producto (item.tasa_itbis, en %; sin dato = exento) y la propina
 * es un porcentaje del subtotal. Es la misma fórmula que usa el servidor (cuentasService).
 * opciones: { cobrarItbis, cobrarPropina, porcentajePropina (2–30, 10 por defecto),
 *             descuento: { tipo: 'porcentaje' | 'monto', valor } }
 * El descuento se reparte entre las líneas y reduce la base del ITBIS y de la propina.
 * Devuelve subtotalBruto (antes del descuento), descuento, subtotal (después), itbis, propina y total.
 */
export function calcularTotales(items = [], opciones = {}) {
  const cobrarItbis = opciones.cobrarItbis !== false;
  const cobrarPropina = opciones.cobrarPropina !== false;
  const porcentaje = Number.isFinite(Number(opciones.porcentajePropina)) ? Number(opciones.porcentajePropina) : PROPINA_DEFECTO;

  const lineas = items.map((item) => {
    const tasa = Number(item.tasa_itbis);
    return {
      centavos: Math.round(aCentavos(item.precio) * Math.max(0, Number(item.cantidad || 0))),
      tasa: Number.isFinite(tasa) && tasa > 0 ? tasa : 0,
      descuento: 0,
    };
  });
  const subtotalBrutoCentavos = lineas.reduce((suma, linea) => suma + linea.centavos, 0);

  let descuentoCentavos = 0;
  const pedido = opciones.descuento;
  const valorDescuento = Number(pedido?.valor);
  if (pedido && Number.isFinite(valorDescuento) && valorDescuento > 0) {
    descuentoCentavos = pedido.tipo === 'porcentaje'
      ? Math.round((subtotalBrutoCentavos * Math.min(valorDescuento, 100)) / 100)
      : aCentavos(valorDescuento);
    descuentoCentavos = Math.min(descuentoCentavos, subtotalBrutoCentavos);
  }
  let repartido = 0;
  for (const linea of lineas) {
    linea.descuento = subtotalBrutoCentavos > 0 ? Math.floor((descuentoCentavos * linea.centavos) / subtotalBrutoCentavos) : 0;
    repartido += linea.descuento;
  }
  let resto = descuentoCentavos - repartido;
  for (let i = lineas.length - 1; i >= 0 && resto > 0; i -= 1) {
    const extra = Math.min(lineas[i].centavos - lineas[i].descuento, resto);
    lineas[i].descuento += extra;
    resto -= extra;
  }

  let itbisCentavos = 0;
  for (const linea of lineas) {
    if (linea.tasa > 0) itbisCentavos += Math.round(((linea.centavos - linea.descuento) * linea.tasa) / 100);
  }
  const subtotalCentavos = subtotalBrutoCentavos - descuentoCentavos;
  const itbisCobradoCentavos = cobrarItbis ? itbisCentavos : 0;
  const propinaCentavos = cobrarPropina ? Math.round((subtotalCentavos * porcentaje) / 100) : 0;

  return {
    subtotalBruto: deCentavos(subtotalBrutoCentavos),
    descuento: deCentavos(descuentoCentavos),
    subtotal: deCentavos(subtotalCentavos),
    itbis: deCentavos(itbisCobradoCentavos),
    propina: deCentavos(propinaCentavos),
    total: deCentavos(subtotalCentavos + itbisCobradoCentavos + propinaCentavos),
  };
}
