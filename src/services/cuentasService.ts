/**
 * @file Servicio transaccional de MESAS/CUENTAS: helpers de cobro y cierre de
 * cuenta (cuenta abierta de una mesa, secuencia NCF, totales con
 * ITBIS/propina, descuento de inventario por receta y cobro con cierre).
 * Puerto directo de las funciones helper de server.js (legacy, líneas ~431-600).
 * La transacción la provee db.transaction (commit/rollback/release automáticos);
 * los routers la invocan; aquí se recibe un cliente consultable (Database o
 * PoolClient dentro de db.transaction).
 */

import type { Request } from 'express';
import { httpError, money, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { registrarAuditoria, type IQueryable } from './auditoriaService.js';
import { notificarMesas } from '../lib/sse.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('cuentasService');

/** Cuenta abierta (fila de la tabla cuentas, columnas del helper legacy). */
export interface ICuentaAbiertaFila {
  id: number;
  mesa_id: number | null;
  camarero_id: number | null;
  estado: string;
  tipo_servicio: string | null;
}

/** Fila de detalle de cuenta con la tasa ITBIS del producto (para totales). */
export interface ITotalesDetalleFila {
  producto_id: number;
  cantidad: string;
  precio_unitario: string;
  tasa_itbis: string | null;
}

/** Resultado de calcularTotales: monto por rubro + detalles que lo componen. */
export interface ITotalesCuenta {
  detalles: ITotalesDetalleFila[];
  subtotal: number;
  itbis: number;
  propina: number;
  total: number;
  totalExento: number;
  totalGravado: number;
  totalItbis: number;
}

/** Recibo devuelto por cobrarCuenta (comprobante + cajero + totales). */
export type IReciboCobro = { comprobante: string; cajero_nombre: string } & ITotalesCuenta;

/** Cuerpo de cobro aceptado (puerto del body del legacy, campos opcionales). */
export interface ICobrarCuentaBody {
  metodo_pago?: string;
  metodo_pago_2?: string | null;
  monto_pago_2?: number | string | null;
  banco_pago_2?: string | null;
  tipo_comprobante?: string;
  rnc_cedula_cliente?: string | null;
  tarjeta_ultimos_4?: string;
  tarjeta_marca?: string | null;
  notas?: string | null;
  productos?: unknown;
  motivo?: string | null;
}

/** Actor que ejecuta el cobro (requiereAuth fija req.auth con id y nombre). */
export interface IActuanteCobro {
  id: number;
  nombre: string;
}

/**
 * Cuenta abierta de una mesa (null si no existe). lock=true bloquea la fila
 * (FOR UPDATE) para usarse dentro de db.transaction. Puerto de
 * cuentaAbiertaParaMesa del legacy; acepta Database o PoolClient.
 */
export async function cuentaAbiertaParaMesa(
  client: IQueryable,
  mesaId: number,
  lock = false
): Promise<ICuentaAbiertaFila | null> {
  const result = await client.query<ICuentaAbiertaFila>(
    `SELECT id, mesa_id, camarero_id, estado, tipo_servicio
     FROM cuentas
     WHERE mesa_id = $1 AND estado = 'Abierta'
     ${lock ? 'FOR UPDATE' : ''}`,
    [mesaId]
  );
  return result.rows[0] || null;
}

interface ISecuenciaFila {
  id: number;
  prefijo: string | null;
  secuencia_actual: number;
  secuencia_final: number;
}

/**
 * Toma y avanza la secuencia NCF activa del tipo de comprobante, devolviendo
 * el NCF formateado. El parámetro _cuentaId se conserva por paridad con el
 * legacy (su firma lo recibe aunque no lo use). Puerto de siguienteComprobante.
 */
export async function siguienteComprobante(
  client: IQueryable,
  tipoComprobante: string,
  _cuentaId: number
): Promise<string> {
  const sequence = await client.query<ISecuenciaFila>(
    `SELECT id, prefijo, secuencia_actual, secuencia_final
     FROM dgii_secuencias
     WHERE tipo_comprobante = $1 AND activa = TRUE AND fecha_vencimiento >= CURRENT_DATE
     ORDER BY id
     LIMIT 1
     FOR UPDATE`,
    [tipoComprobante]
  );

  if (!sequence.rowCount) {
    throw httpError(400, `No hay secuencia activa para ${tipoComprobante}. Configura una secuencia en DGII > Secuencias NCF.`);
  }

  const row = sequence.rows[0];
  if (row.secuencia_actual >= row.secuencia_final) {
    throw httpError(
      400,
      `Secuencia de ${tipoComprobante} agotada (${row.secuencia_actual}/${row.secuencia_final}). Crea una nueva secuencia o amplía el rango.`
    );
  }

  await client.query('UPDATE dgii_secuencias SET secuencia_actual = secuencia_actual + 1 WHERE id = $1', [row.id]);
  const ncf = `${row.prefijo || tipoComprobante}${String(row.secuencia_actual).padStart(8, '0')}`;

  // Alerta silenciosa si quedan menos de 1000 comprobantes (legacy: console.warn)
  const restantes = row.secuencia_final - row.secuencia_actual;
  if (restantes < 1000) {
    logger.warn({ action: 'SECUENCIA_NCF_AGOTANDOSE', tipoComprobante, restantes, ncf });
  }

  return ncf;
}

interface INegocioConfigFila {
  cobrar_itbis: boolean | null;
  cobrar_propina: boolean | null;
}

/**
 * Calcula subtotal, ITBIS (gravado/exento), propina y total de una cuenta
 * abierta, bloqueando sus detalles y la configuración del negocio. Sin
 * detalles activos no se puede cobrar. Puerto de calcularTotales del legacy.
 */
export async function calcularTotales(client: IQueryable, cuentaId: number): Promise<ITotalesCuenta> {
  const detailResult = await client.query<ITotalesDetalleFila>(
    `SELECT cd.producto_id, cd.cantidad, cd.precio_unitario, COALESCE(p.tasa_itbis, 18) AS tasa_itbis
     FROM cuenta_detalles cd
     JOIN productos p ON p.id = cd.producto_id
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL
     FOR UPDATE`,
    [cuentaId]
  );
  if (!detailResult.rowCount) {throw httpError(400, 'No se puede cobrar una cuenta sin productos activos.');}

  let subtotal = 0;
  let totalItbis = 0;
  let totalExento = 0;
  let totalGravado = 0;

  for (const item of detailResult.rows) {
    const montoItem = money(Number(item.cantidad) * Number(item.precio_unitario));
    subtotal += montoItem;
    const tasa = Number(item.tasa_itbis ?? 18);
    if (tasa === 0) {
      totalExento += montoItem;
    } else {
      const gravado = money(montoItem / (1 + tasa / 100));
      totalGravado += gravado;
      totalItbis += money((gravado * tasa) / 100);
    }
  }

  subtotal = money(subtotal);
  totalItbis = money(totalItbis);
  totalExento = money(totalExento);
  totalGravado = money(totalGravado);

  const businessResult = await client.query<INegocioConfigFila>(
    'SELECT cobrar_itbis, cobrar_propina FROM negocio_config ORDER BY id LIMIT 1 FOR UPDATE'
  );
  const business = businessResult.rows[0] || { cobrar_itbis: true, cobrar_propina: true };
  const itbis = business.cobrar_itbis === false ? 0 : totalItbis;
  const propina = business.cobrar_propina === false ? 0 : money(subtotal * 0.1);

  return {
    detalles: detailResult.rows,
    subtotal,
    itbis,
    propina,
    total: money(subtotal + itbis + propina),
    totalExento,
    totalGravado,
    totalItbis,
  };
}

interface IIngredienteRecetaFila {
  id: number;
  nombre: string;
  stock_actual: string;
  cantidad_necesaria: string;
}

/**
 * Descuenta del inventario la materia prima (receta) de cada producto vendido.
 * Bloquea las filas de ingredientes (FOR UPDATE OF i) y falla con 409 si algún
 * stock no alcanza. Puerto de descontarInventario del legacy.
 */
export async function descontarInventario(client: IQueryable, detalles: ITotalesDetalleFila[]): Promise<void> {
  const cantidades = new Map<number, number>();
  for (const detail of detalles) {
    cantidades.set(detail.producto_id, (cantidades.get(detail.producto_id) || 0) + Number(detail.cantidad));
  }

  for (const [productoId, cantidad] of cantidades) {
    const recipe = await client.query<IIngredienteRecetaFila>(
      `SELECT i.id, i.nombre, i.stock_actual, r.cantidad_necesaria
       FROM receta_productos r
       JOIN ingredientes i ON i.id = r.ingrediente_id
       WHERE r.producto_id = $1
       FOR UPDATE OF i`,
      [productoId]
    );
    for (const ingredient of recipe.rows) {
      const required = Number(ingredient.cantidad_necesaria) * cantidad;
      if (Number(ingredient.stock_actual) < required) {
        throw httpError(409, `Inventario insuficiente para ${ingredient.nombre}.`);
      }
      await client.query('UPDATE ingredientes SET stock_actual = stock_actual - $1 WHERE id = $2', [
        required,
        ingredient.id,
      ]);
    }
  }
}

interface ICuentaCobroFila {
  id: number;
  mesa_id: number | null;
}

export interface ICobrarCuentaParams {
  cuentaId: number;
  actor: IActuanteCobro;
  body: ICobrarCuentaBody;
  req: Request;
}

/**
 * Cobra (cierra) una cuenta abierta: valida el pago (Efectivo/Tarjeta/
 * Transferencia y mixto), calcula totales, descuenta inventario, toma el NCF,
 * actualiza la cuenta y libera su mesa. Puerto exacto de cobrarCuenta del
 * legacy (incluye el detalle de tarjeta solo para pago con tarjeta y banco
 * solo para pago 2 por transferencia).
 */
export async function cobrarCuenta(params: ICobrarCuentaParams): Promise<IReciboCobro> {
  const { cuentaId, actor, body, req } = params;
  const allowedMethods = ['Efectivo', 'Tarjeta', 'Transferencia'];
  const metodoPago = String(body.metodo_pago || '');
  const metodoPago2Raw = body.metodo_pago_2 || null;
  const metodoPago2 = metodoPago2Raw === null ? null : String(metodoPago2Raw);
  const montoPago2 = Number(body.monto_pago_2 || 0);
  const bancoPago2 = body.banco_pago_2 || null;
  const tipoComprobanteRaw = body.tipo_comprobante || '';
  const tipoComprobante = ['B01', 'B02', 'E31', 'E32', 'e-CF'].includes(tipoComprobanteRaw)
    ? tipoComprobanteRaw
    : 'B02';

  if (!allowedMethods.includes(metodoPago)) {throw httpError(400, 'Método de pago no válido.');}
  if (metodoPago === 'Tarjeta' && !/^\d{4}$/.test(String(body.tarjeta_ultimos_4 || ''))) {
    throw httpError(400, 'Debes indicar los últimos cuatro dígitos de la tarjeta.');
  }
  if (metodoPago2 && !allowedMethods.includes(metodoPago2)) {throw httpError(400, 'Método de pago 2 no válido.');}
  if (metodoPago2 === 'Transferencia' && montoPago2 <= 0) {throw httpError(400, 'Indica el monto de la transferencia.');}
  if (metodoPago2 === metodoPago) {throw httpError(400, 'No puedes repetir el mismo método de pago en pago mixto.');}

  const db = getDatabase();
  return db.transaction(async (client) => {
    const account = await client.query<ICuentaCobroFila>(
      'SELECT id, mesa_id FROM cuentas WHERE id = $1 AND estado = $2 FOR UPDATE',
      [cuentaId, 'Abierta']
    );
    if (!account.rowCount) {throw httpError(404, 'La cuenta no está abierta o no existe.');}

    const totals = await calcularTotales(client, cuentaId);
    await descontarInventario(client, totals.detalles);
    const comprobante = await siguienteComprobante(client, tipoComprobante, cuentaId);

    await client.query(
      `UPDATE cuentas
       SET estado = 'Cerrada', metodo_pago = $1, subtotal = $2, itbis = $3, propina = $4, total = $5,
           fecha_cierre = CURRENT_TIMESTAMP, tipo_comprobante = $6, rnc_cedula_cliente = $7,
           ncf_ecf_generado = $8, tarjeta_ultimos_4 = $9, tarjeta_marca = $10, cajero_id = $12,
           metodo_pago_2 = $13, monto_pago_2 = $14, banco_pago_2 = $15
       WHERE id = $11`,
      [
        metodoPago,
        totals.subtotal,
        totals.itbis,
        totals.propina,
        totals.total,
        tipoComprobante,
        body.rnc_cedula_cliente?.trim() || null,
        comprobante,
        metodoPago === 'Tarjeta' ? body.tarjeta_ultimos_4 || null : null,
        metodoPago === 'Tarjeta' ? String(body.tarjeta_marca || '').trim() || null : null,
        cuentaId,
        actor.id,
        metodoPago2,
        montoPago2 || null,
        metodoPago2 === 'Transferencia' ? String(bancoPago2 || '').trim() || null : null,
      ]
    );

    if (account.rows[0].mesa_id) {
      await client.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = $1", [
        account.rows[0].mesa_id,
      ]);
    }
    await registrarAuditoria(client, {
      usuarioId: actor.id,
      accion: 'COBRAR_CUENTA',
      entidad: 'cuentas',
      entidadId: cuentaId,
      detalle: { metodoPago, metodoPago2, montoPago2, comprobante, ...totals },
      ip: clientIp(req),
    });
    notificarMesas('mesa_actualizada');
    return { comprobante, cajero_nombre: actor.nombre, ...totals };
  });
}
