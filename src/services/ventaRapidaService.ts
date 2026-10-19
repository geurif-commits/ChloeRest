/**
 * @file Venta rápida (mostrador / para llevar): crea la cuenta 'Para Llevar' con sus líneas y la cobra con
 * el mismo `cobrarCuenta` que usan las mesas (caja abierta, NCF, métodos de pago, descuento, inventario),
 * todo en un solo paso. Si el cobro falla se descarta la cuenta recién creada: nunca quedan cuentas
 * abiertas sin dueño que la caja no sabría encontrar.
 */

import type { Request } from 'express';
import { httpError, positiveInteger } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import type { IQueryable } from './auditoriaService.js';
import { cobrarCuenta, type ICobrarCuentaBody, type IActuanteCobro, type IReciboCobro } from './cuentasService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('ventaRapidaService');

const MAX_LINEAS = 50;

export interface ILineaVenta {
  productoId: number;
  cantidad: number;
  notas: string | null;
  guarnicion: string | null;
  termino: string | null;
}

export interface IClienteVenta {
  nombre: string;
  telefono: string;
}

const textoOpcional = (valor: unknown, maximo: number): string | null =>
  String(valor ?? '').trim().slice(0, maximo) || null;

/** Líneas de la venta (acepta `id` o `producto_id`); 1 a 50 líneas, cada una con producto y cantidad enteros positivos. */
export function parsearLineas(crudo: unknown): ILineaVenta[] {
  const lista = Array.isArray(crudo) ? crudo : [];
  if (!lista.length || lista.length > MAX_LINEAS) {throw httpError(400, 'La venta no es válida o está vacía.');}
  return lista.map((item) => {
    const linea = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      productoId: positiveInteger(linea.id ?? linea.producto_id, 'Producto'),
      cantidad: positiveInteger(linea.cantidad, 'Cantidad'),
      notas: textoOpcional(linea.notas, 200),
      guarnicion: textoOpcional(linea.guarnicion, 100),
      termino: textoOpcional(linea.termino, 100),
    };
  });
}

/** El cliente es opcional: sin nombre ni teléfono no se registra a nadie; con solo uno de los dos, se pide completar. */
export function parsearCliente(nombre: unknown, telefono: unknown): IClienteVenta | null {
  const n = String(nombre ?? '').trim();
  const t = String(telefono ?? '').trim();
  if (!n && !t) {return null;}
  if (!n || !t) {throw httpError(400, 'Para registrar al cliente indica nombre y teléfono, o deja ambos vacíos.');}
  return { nombre: n.slice(0, 200), telefono: t.slice(0, 30) };
}

export interface ICrearCuentaLlevarParams {
  camareroId: number;
  cliente: IClienteVenta | null;
  lineas: ILineaVenta[];
  /** true: las líneas quedan pendientes en Cocina/Bar; false: ya se entregan (bebida embotellada, etc.). */
  enviarACocina: boolean;
}

/**
 * Crea la cuenta 'Para Llevar' (sin mesa) con las líneas a precio vigente del catálogo. Debe ejecutarse dentro
 * de una transacción. Los precios SIEMPRE vienen de la base: el cliente nunca decide cuánto cuesta algo.
 */
export async function crearCuentaParaLlevar(client: IQueryable, params: ICrearCuentaLlevarParams): Promise<number> {
  const { camareroId, cliente, lineas, enviarACocina } = params;

  const ids = [...new Set(lineas.map((l) => l.productoId))];
  const productos = await client.query<{ id: number; precio: string }>(
    "SELECT id, precio FROM productos WHERE estado = 'Activo' AND id = ANY($1::int[])",
    [ids]
  );
  const precios = new Map(productos.rows.map((p) => [Number(p.id), p.precio]));
  if (precios.size !== ids.length) {throw httpError(400, 'Uno o más productos ya no están disponibles.');}

  let clienteId: number | null = null;
  if (cliente) {
    // Sin ON CONFLICT: la tabla no tiene índice único por teléfono (con él, registrar un cliente daba 500).
    const existente = await client.query<{ id: number }>(
      'SELECT id FROM clientes_frecuentes WHERE telefono = $1 ORDER BY id LIMIT 1',
      [cliente.telefono]
    );
    if (existente.rowCount) {
      clienteId = existente.rows[0].id;
      await client.query('UPDATE clientes_frecuentes SET nombre = $1 WHERE id = $2', [cliente.nombre, clienteId]);
    } else {
      const nuevo = await client.query<{ id: number }>(
        "INSERT INTO clientes_frecuentes (nombre, telefono, direccion) VALUES ($1, $2, 'Para Llevar') RETURNING id",
        [cliente.nombre, cliente.telefono]
      );
      clienteId = nuevo.rows[0].id;
    }
  }

  const cuenta = await client.query<{ id: number }>(
    `INSERT INTO cuentas (mesa_id, camarero_id, estado, tipo_servicio, cliente_id)
     VALUES (NULL, $1, 'Abierta', 'Para Llevar', $2)
     RETURNING id`,
    [camareroId, clienteId]
  );
  const cuentaId = cuenta.rows[0].id;

  for (const linea of lineas) {
    await client.query(
      `INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario, notas, guarnicion, termino, estado_cocina)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cuentaId, linea.productoId, linea.cantidad, precios.get(linea.productoId), linea.notas, linea.guarnicion, linea.termino, enviarACocina ? 'Pendiente' : 'Despachado']
    );
  }
  return cuentaId;
}

/** Borra una cuenta 'Para Llevar' abierta y sin mesa (sus líneas caen en cascada). Nunca toca cuentas cobradas ni de mesa. */
export async function descartarCuentaParaLlevar(cuentaId: number): Promise<void> {
  await getDatabase().query(
    "DELETE FROM cuentas WHERE id = $1 AND estado = 'Abierta' AND mesa_id IS NULL AND tipo_servicio = 'Para Llevar'",
    [cuentaId]
  );
}

export interface ICobrarVentaRapidaParams {
  actor: IActuanteCobro;
  body: Record<string, unknown>;
  req: Request;
}

export interface IResultadoVentaRapida {
  recibo: IReciboCobro;
  cuentaId: number;
  enviadaACocina: boolean;
}

/** Crea la cuenta 'Para Llevar' y la cobra. Cualquier fallo del cobro deja la base como estaba. */
export async function cobrarVentaRapida(params: ICobrarVentaRapidaParams): Promise<IResultadoVentaRapida> {
  const { actor, body, req } = params;
  const lineas = parsearLineas(body.comanda);
  const cliente = parsearCliente(body.cliente_nombre, body.cliente_telefono);
  const enviadaACocina = body.enviar_a_cocina !== false;

  const cuentaId = await getDatabase().transaction((client) =>
    crearCuentaParaLlevar(client, { camareroId: actor.id, cliente, lineas, enviarACocina: enviadaACocina })
  );

  try {
    // Dividir la cuenta no tiene sentido en una venta que acaba de nacer: se ignora si llega.
    const recibo = await cobrarCuenta({ cuentaId, actor, body: { ...body, detalles_cobrar: null } as ICobrarCuentaBody, req });
    return { recibo, cuentaId, enviadaACocina };
  } catch (error) {
    await descartarCuentaParaLlevar(cuentaId).catch((fallo: unknown) => {
      logger.error({ action: 'VENTA_RAPIDA_DESCARTE_FALLIDO', cuentaId, error: { message: fallo instanceof Error ? fallo.message : String(fallo) } });
    });
    throw error;
  }
}
