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

export function calcularTotales(items = [], opciones = {}) {
  const tasaItbis = Number(opciones.tasaItbis ?? 0.18);
  const tasaPropina = Number(opciones.tasaPropina ?? 0.10);
  const cobrarItbis = opciones.cobrarItbis !== false;
  const cobrarPropina = opciones.cobrarPropina !== false;

  const subtotalCentavos = items.reduce((total, item) => (
    total + aCentavos(item.precio) * Math.max(0, Number(item.cantidad || 0))
  ), 0);
  const itbisCentavos = cobrarItbis ? Math.round(subtotalCentavos * tasaItbis) : 0;
  const propinaCentavos = cobrarPropina ? Math.round(subtotalCentavos * tasaPropina) : 0;

  return {
    subtotal: deCentavos(subtotalCentavos),
    itbis: deCentavos(itbisCentavos),
    propina: deCentavos(propinaCentavos),
    total: deCentavos(subtotalCentavos + itbisCentavos + propinaCentavos),
  };
}
