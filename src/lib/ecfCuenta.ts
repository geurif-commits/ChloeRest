/**
 * @file Líneas fiscales de una cuenta cobrada. Reparte el descuento entre las líneas con la misma regla con que se calcula
 * el total de la cuenta y deja cada línea lista para el e-CF: monto neto, ITBIS y precio unitario FINAL (con ITBIS).
 * Funciones puras (dinero en centavos enteros).
 */

const aCentavos = (valor: number | string): number => Math.round((Number(valor) + Number.EPSILON) * 100);

/**
 * Reparte un descuento (en centavos) proporcionalmente entre las líneas; los centavos que sobran van a las últimas líneas
 * con saldo. Es la regla de `calcularTotales`, que la usa de aquí: así el e-CF y el total cobrado nunca discrepan.
 */
export function repartirDescuento(centavosPorLinea: number[], descuentoC: number): number[] {
  const total = centavosPorLinea.reduce((suma, c) => suma + c, 0);
  const reparto = centavosPorLinea.map((c) => (total > 0 ? Math.floor((descuentoC * c) / total) : 0));
  let resto = descuentoC - reparto.reduce((suma, c) => suma + c, 0);
  for (let i = reparto.length - 1; i >= 0 && resto > 0; i -= 1) {
    const extra = Math.min(centavosPorLinea[i] - reparto[i], resto);
    reparto[i] += extra;
    resto -= extra;
  }
  return reparto;
}

export interface IDetalleFiscal {
  nombre: string;
  cantidad: number | string;
  precio_unitario: number | string;
  /** Tasa de ITBIS del producto en % (18, 16, 0…). */
  tasa_itbis: number | string;
}

export interface ILineaEcf {
  descripcion: string;
  cantidad: number;
  tasa: number;
  /** Importe de la línea tras el descuento, antes de ITBIS (centavos). */
  netoC: number;
  /** ITBIS que el cliente paga además del neto (centavos); 0 si el negocio no cobra ITBIS aparte. */
  itbisCobradoC: number;
  /** Lo que el cliente paga por la línea (neto + ITBIS cobrado), en centavos. */
  totalLineaC: number;
  /** Precio unitario final (con ITBIS y descuento), 4 decimales. */
  precioUnitarioFinal: number;
}

/**
 * Líneas del e-CF. Si el negocio cobra ITBIS aparte (`cobrarItbis`), el precio del menú es neto y el ITBIS se suma; si
 * no, el precio del menú ya lo lleva incluido. En ambos casos la suma de las líneas es lo que el cliente pagó sin
 * propina, que es el monto del comprobante.
 */
export function lineasEcf(detalles: IDetalleFiscal[], descuentoC: number, cobrarItbis: boolean): ILineaEcf[] {
  const brutos = detalles.map((d) => aCentavos(Number(d.cantidad) * Number(d.precio_unitario)));
  const descuentos = repartirDescuento(brutos, descuentoC);
  return detalles.map((d, i) => {
    const cantidad = Number(d.cantidad);
    const tasa = Number(d.tasa_itbis ?? 0);
    const netoC = brutos[i] - descuentos[i];
    const itbisCobradoC = cobrarItbis && tasa > 0 ? Math.round((netoC * tasa) / 100) : 0;
    const totalLineaC = netoC + itbisCobradoC;
    return {
      descripcion: String(d.nombre || '').trim() || 'Artículo',
      cantidad,
      tasa,
      netoC,
      itbisCobradoC,
      totalLineaC,
      precioUnitarioFinal: cantidad > 0 ? Math.round((totalLineaC / 100 / cantidad) * 10_000) / 10_000 : 0,
    };
  });
}
