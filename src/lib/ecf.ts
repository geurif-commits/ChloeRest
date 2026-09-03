/**
 * @file Construcción de e-CF según especificación DGII (e-CF 31/32/33/34)
 * Puerto directo de lib/ecf.js a TypeScript.
 */

import { normalizarRNC } from './rnc.js';

function money(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export interface IDetalleECF {
  cantidad: number;
  precio_unitario: number;
  tasa_itbis?: number;
  producto_nombre?: string;
  descripcion?: string;
}

export interface IConfigEmisorECF {
  rnc_emisor: string;
  razon_social_emisor?: string;
  direccion_emisor?: string;
}

export interface IConstruirECFParams {
  tipoECF: number;
  ncf: string;
  cfg: IConfigEmisorECF;
  rncReceptor?: string;
  razonSocialReceptor?: string;
  detalles: IDetalleECF[];
  fechaEmision?: string;
  tipoPago?: number;
  fechaVencimientoSecuencia?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function construirECF(params: IConstruirECFParams): any {
  const { tipoECF, ncf, cfg, rncReceptor, razonSocialReceptor, detalles, fechaEmision, tipoPago, fechaVencimientoSecuencia } = params;
  const rncEmisor = normalizarRNC(cfg.rnc_emisor);
  const razonSocial = cfg.razon_social_emisor || cfg.rnc_emisor || '';
  const direccion = cfg.direccion_emisor || '';
  const fecha =
    fechaEmision ||
    new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const fechaVenc = fechaVencimientoSecuencia || '31-12-2028';

  let montoGravado = 0;
  let montoExento = 0;
  let totalItbis = 0;
  const items = detalles.map((d, idx) => {
    const cantidad = Number(d.cantidad);
    const precio = Number(d.precio_unitario);
    const tasaItbis = Number(d.tasa_itbis ?? 18);
    const montoItem = money(cantidad * precio);
    const esExento = tasaItbis === 0;

    let montoGravadoItem = 0;
    let montoItbisItem = 0;
    if (!esExento) {
      montoGravadoItem = money(montoItem / (1 + tasaItbis / 100));
      montoItbisItem = money((montoGravadoItem * tasaItbis) / 100);
      montoGravado += montoGravadoItem;
      totalItbis += montoItbisItem;
    } else {
      montoExento += montoItem;
    }

    return {
      NumeroLinea: idx + 1,
      IndicadorFacturacion: esExento ? 4 : 1,
      NombreItem: d.producto_nombre || d.descripcion || 'Item',
      IndicadorBienoServicio: 1,
      CantidadItem: cantidad,
      PrecioUnitarioItem: precio,
      MontoItem: montoItem,
      ...(esExento
        ? {}
        : {
            ITBIS: { TasaItbis: tasaItbis, MontoItbis: montoItbisItem },
            MontoGravado: montoGravadoItem,
          }),
    };
  });

  const montoTotal = money(montoGravado + montoExento + totalItbis);

  const encabezado: Record<string, unknown> = {
    Version: '1.0',
    IdDoc: {
      TipoeCF: tipoECF,
      eNCF: ncf,
      FechaVencimientoSecuencia: fechaVenc,
      IndicadorEnvioDiferido: 1,
      TipoIngresos: '01',
      TipoPago: tipoPago || 1,
    },
    Emisor: {
      RNCEmisor: rncEmisor,
      RazonSocialEmisor: razonSocial,
      DireccionEmisor: direccion,
      FechaEmision: fecha,
    },
    Totales: {
      MontoTotal: montoTotal,
      ...(montoExento > 0 ? { MontoExento: montoExento } : {}),
      ...(montoGravado > 0
        ? {
            MontoGravadoTotal: montoGravado,
            MontoGravadoI1: montoGravado,
            ITBIS1: 18,
            TotalITBIS: totalItbis,
            TotalITBIS1: totalItbis,
          }
        : {}),
    },
  };

  if (tipoECF === 31) {
    encabezado.Comprador = {
      RNCComprador: normalizarRNC(rncReceptor),
      RazonSocialComprador: razonSocialReceptor || 'Cliente',
    };
  }

  if (tipoECF === 32) {
    if (montoTotal >= 250000) {
      encabezado.Comprador = {
        RNCComprador: normalizarRNC(rncReceptor),
        RazonSocialComprador: razonSocialReceptor || 'Cliente',
      };
    } else {
      encabezado.Comprador = {
        RNCComprador: normalizarRNC(rncReceptor) || '',
        RazonSocialComprador: razonSocialReceptor || 'Cliente Final',
      };
    }
  }

  return {
    ECF: {
      Encabezado: encabezado,
      DetallesItems: { Item: items },
    },
  };
}
