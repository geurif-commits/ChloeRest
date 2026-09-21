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
import { propinaPorcentajeOAlDefecto } from '../lib/propina.js';

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
  /** Subtotal después del descuento (base del ITBIS y de la propina). */
  subtotal: number;
  /** Subtotal antes del descuento. */
  subtotalBruto: number;
  descuento: number;
  itbis: number;
  propina: number;
  total: number;
  totalExento: number;
  totalGravado: number;
  totalItbis: number;
}

/** Recibo devuelto por cobrarCuenta (comprobante + cajero + totales). */
export type IReciboCobro = { comprobante: string; cajero_nombre: string; cuenta_id: number; dividida: boolean } & ITotalesCuenta;

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
  /** Descuento sobre la cuenta: 'porcentaje' (0–100) o 'monto' (RD$), con motivo obligatorio. */
  descuento_tipo?: string | null;
  descuento_valor?: number | string | null;
  descuento_motivo?: string | null;
  /** Cobro parcial (dividir cuenta): líneas y cantidades que se cobran ahora; el resto queda abierto. */
  detalles_cobrar?: Array<{ id: number | string; cantidad: number | string }> | null;
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
  // pg devuelve BIGINT como string; comparar numérico, no lexicográfico.
  const actual = Number(row.secuencia_actual);
  const final = Number(row.secuencia_final);
  if (actual >= final) {
    throw httpError(
      400,
      `Secuencia de ${tipoComprobante} agotada (${actual}/${final}). Crea una nueva secuencia o amplía el rango.`
    );
  }

  await client.query('UPDATE dgii_secuencias SET secuencia_actual = secuencia_actual + 1 WHERE id = $1', [row.id]);
  const ncf = `${row.prefijo || tipoComprobante}${String(actual).padStart(8, '0')}`;

  // Alerta silenciosa si quedan menos de 1000 comprobantes (legacy: console.warn)
  const restantes = final - actual;
  if (restantes < 1000) {
    logger.warn({ action: 'SECUENCIA_NCF_AGOTANDOSE', tipoComprobante, restantes, ncf });
  }

  return ncf;
}

interface INegocioConfigFila {
  cobrar_itbis: boolean | null;
  cobrar_propina: boolean | null;
  propina_porcentaje?: string | number | null;
}

/** Dinero en centavos enteros: evita errores de coma flotante al sumar y redondear por línea. */
const aCentavos = (valor: number | string): number => Math.round((Number(valor) + Number.EPSILON) * 100);

/** Descuento aplicado a una cuenta antes de calcular ITBIS y propina. */
export interface IDescuento {
  tipo: 'porcentaje' | 'monto';
  valor: number;
}

/**
 * Valida el descuento pedido al cobrar. Devuelve null si no se pidió ninguno.
 * Exige un motivo (queda en la auditoría) y un valor válido: porcentaje hasta 100, monto positivo.
 */
export function validarDescuento(tipo: unknown, valor: unknown, motivo: unknown): IDescuento | null {
  const valorTexto = String(valor ?? '').trim();
  if (!tipo || valorTexto === '' || Number(valorTexto) === 0) {return null;}
  if (tipo !== 'porcentaje' && tipo !== 'monto') {throw httpError(400, 'El tipo de descuento debe ser porcentaje o monto.');}
  const numero = Number(valorTexto);
  if (!Number.isFinite(numero) || numero <= 0) {throw httpError(400, 'El descuento debe ser un número mayor a 0.');}
  if (tipo === 'porcentaje' && numero > 100) {throw httpError(400, 'El descuento no puede superar el 100 %.');}
  if (String(motivo ?? '').trim().length < 3) {throw httpError(400, 'Indica el motivo del descuento.');}
  return { tipo, valor: numero };
}

/**
 * Calcula subtotal, descuento, ITBIS (gravado/exento), propina y total de una cuenta
 * abierta, bloqueando sus detalles y la configuración del negocio. Sin
 * detalles activos no se puede cobrar.
 *
 * Los precios del menú NO incluyen ITBIS ni propina: el ITBIS se suma al subtotal
 * (por línea, según la tasa de cada producto) y la propina es un porcentaje del subtotal.
 * El descuento se reparte proporcionalmente entre las líneas y reduce la base del ITBIS y de la propina.
 * Es la misma fórmula que usa la pantalla (frontend utils/dinero.js).
 */
export async function calcularTotales(
  client: IQueryable,
  cuentaId: number,
  descuento: IDescuento | null = null
): Promise<ITotalesCuenta> {
  const detailResult = await client.query<ITotalesDetalleFila>(
    `SELECT cd.producto_id, cd.cantidad, cd.precio_unitario, COALESCE(p.tasa_itbis, 0) AS tasa_itbis
     FROM cuenta_detalles cd
     JOIN productos p ON p.id = cd.producto_id
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL
     FOR UPDATE`,
    [cuentaId]
  );
  if (!detailResult.rowCount) {throw httpError(400, 'No se puede cobrar una cuenta sin productos activos.');}

  const lineas = detailResult.rows.map((item) => ({
    centavos: aCentavos(Number(item.cantidad) * Number(item.precio_unitario)),
    tasa: Number(item.tasa_itbis ?? 0),
    descuento: 0,
  }));
  const subtotalBrutoC = lineas.reduce((suma, linea) => suma + linea.centavos, 0);

  let descuentoC = 0;
  if (descuento) {
    descuentoC = descuento.tipo === 'porcentaje'
      ? Math.round((subtotalBrutoC * descuento.valor) / 100)
      : aCentavos(descuento.valor);
    if (descuentoC > subtotalBrutoC) {throw httpError(400, 'El descuento no puede superar el subtotal de la cuenta.');}
  }
  // Reparto proporcional; los centavos que sobran van a las últimas líneas con saldo.
  let repartido = 0;
  for (const linea of lineas) {
    linea.descuento = subtotalBrutoC > 0 ? Math.floor((descuentoC * linea.centavos) / subtotalBrutoC) : 0;
    repartido += linea.descuento;
  }
  let resto = descuentoC - repartido;
  for (let i = lineas.length - 1; i >= 0 && resto > 0; i -= 1) {
    const extra = Math.min(lineas[i].centavos - lineas[i].descuento, resto);
    lineas[i].descuento += extra;
    resto -= extra;
  }

  let itbisC = 0;
  let exentoC = 0;
  let gravadoC = 0;
  for (const linea of lineas) {
    const netaC = linea.centavos - linea.descuento;
    if (linea.tasa === 0) {
      exentoC += netaC;
    } else {
      gravadoC += netaC;
      itbisC += Math.round((netaC * linea.tasa) / 100);
    }
  }
  const subtotalC = subtotalBrutoC - descuentoC;

  const businessResult = await client.query<INegocioConfigFila>(
    'SELECT cobrar_itbis, cobrar_propina, propina_porcentaje FROM negocio_config ORDER BY id LIMIT 1 FOR UPDATE'
  );
  // ITBIS y propina solo se cobran si el negocio los activó (por defecto están desactivados).
  const business = businessResult.rows[0] || { cobrar_itbis: false, cobrar_propina: false };
  const itbisCobradoC = business.cobrar_itbis === true ? itbisC : 0;
  const propinaC = business.cobrar_propina === true
    ? Math.round((subtotalC * propinaPorcentajeOAlDefecto(business.propina_porcentaje)) / 100)
    : 0;

  return {
    detalles: detailResult.rows,
    subtotal: money(subtotalC / 100),
    subtotalBruto: money(subtotalBrutoC / 100),
    descuento: money(descuentoC / 100),
    itbis: money(itbisCobradoC / 100),
    propina: money(propinaC / 100),
    total: money((subtotalC + itbisCobradoC + propinaC) / 100),
    totalExento: money(exentoC / 100),
    totalGravado: money(gravadoC / 100),
    totalItbis: money(itbisC / 100),
  };
}

/** Línea que se separa de la cuenta al dividirla. */
export interface IMovimientoDivision {
  id: string;
  cantidad: number;
  /** true si se mueve la línea completa; false si solo una parte de su cantidad. */
  completo: boolean;
}

/**
 * Valida la selección de líneas para dividir una cuenta y decide qué se mueve.
 * cubreTodo = true si la selección abarca toda la cuenta (entonces se cobra la cuenta original).
 */
export function planificarDivision(
  detalles: Array<{ id: number | string; cantidad: number | string }>,
  seleccion: Array<{ id: number | string; cantidad: number | string }>
): { movimientos: IMovimientoDivision[]; cubreTodo: boolean } {
  if (!seleccion.length) {throw httpError(400, 'Selecciona al menos un producto para cobrar.');}
  const porId = new Map(detalles.map((d) => [String(d.id), aCentavos(d.cantidad)]));
  const vistos = new Set<string>();
  const movimientos: IMovimientoDivision[] = [];
  for (const item of seleccion) {
    const id = String(item.id);
    const disponibleC = porId.get(id);
    if (disponibleC === undefined) {throw httpError(400, 'Uno de los productos seleccionados no pertenece a esta cuenta.');}
    if (vistos.has(id)) {throw httpError(400, 'Un producto está repetido en la selección.');}
    vistos.add(id);
    const cantidadC = aCentavos(item.cantidad);
    if (!Number.isFinite(cantidadC) || cantidadC <= 0) {throw httpError(400, 'La cantidad a cobrar debe ser mayor a 0.');}
    if (cantidadC > disponibleC) {throw httpError(400, 'La cantidad a cobrar supera lo consumido.');}
    movimientos.push({ id, cantidad: cantidadC / 100, completo: cantidadC === disponibleC });
  }
  const cubreTodo = movimientos.length === detalles.length && movimientos.every((m) => m.completo);
  return { movimientos, cubreTodo };
}

/**
 * Separa de la cuenta abierta las líneas elegidas en una cuenta nueva (mismo mesero y mesa) que se cobra
 * enseguida; lo demás sigue abierto en la cuenta original. Todo ocurre dentro de la transacción del cobro.
 * La cuenta nueva nace 'Cerrada' porque solo puede haber una cuenta 'Abierta' por mesa.
 */
async function separarDetalles(
  client: IQueryable,
  cuentaId: number,
  seleccion: Array<{ id: number | string; cantidad: number | string }>
): Promise<{ cuentaId: number; dividida: boolean }> {
  const detalles = await client.query<{ id: string; cantidad: string }>(
    'SELECT id, cantidad FROM cuenta_detalles WHERE cuenta_id = $1 AND anulado_en IS NULL ORDER BY id FOR UPDATE',
    [cuentaId]
  );
  const plan = planificarDivision(detalles.rows, seleccion);
  if (plan.cubreTodo) {return { cuentaId, dividida: false };}

  const nueva = await client.query<{ id: string }>(
    `INSERT INTO cuentas (mesa_id, camarero_id, cliente_id, estado, tipo_servicio, fecha_apertura, cuenta_origen_id)
     SELECT mesa_id, camarero_id, cliente_id, 'Cerrada', tipo_servicio, fecha_apertura, id FROM cuentas WHERE id = $1
     RETURNING id`,
    [cuentaId]
  );
  const nuevaId = Number(nueva.rows[0].id);
  for (const movimiento of plan.movimientos) {
    if (movimiento.completo) {
      await client.query('UPDATE cuenta_detalles SET cuenta_id = $1 WHERE id = $2', [nuevaId, movimiento.id]);
    } else {
      await client.query('UPDATE cuenta_detalles SET cantidad = cantidad - $1 WHERE id = $2', [movimiento.cantidad, movimiento.id]);
      await client.query(
        `INSERT INTO cuenta_detalles (cuenta_id, producto_id, cantidad, precio_unitario, estado_cocina, hora_pedido, notas, guarnicion, termino)
         SELECT $1, producto_id, $2, precio_unitario, estado_cocina, hora_pedido, notas, guarnicion, termino
           FROM cuenta_detalles WHERE id = $3`,
        [nuevaId, movimiento.cantidad, movimiento.id]
      );
    }
  }
  return { cuentaId: nuevaId, dividida: true };
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
 * El monto del segundo método de un pago mixto no puede ser negativo ni superar el total de la
 * cuenta: de lo contrario descuadra el cierre de caja y los reportes 607.
 */
export function validarPagoMixto(metodoPago2: string | null, montoPago2: number, total: number): void {
  if (!metodoPago2) {return;}
  if (!Number.isFinite(montoPago2) || montoPago2 < 0) {
    throw httpError(400, 'El monto del segundo método de pago no es válido.');
  }
  if (money(montoPago2) > money(total)) {
    throw httpError(400, 'El monto del segundo método de pago no puede superar el total de la cuenta.');
  }
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

    // Sin caja abierta no se cobra (la apertura vigente puede cruzar la medianoche: se aceptan las últimas 24 h).
    const cajaAbierta = await client.query(
      "SELECT 1 FROM aperturas_caja WHERE estado = 'Abierta' AND fecha >= NOW() - INTERVAL '24 hours' LIMIT 1"
    );
    if (!cajaAbierta.rowCount) {
      throw httpError(409, 'La caja está cerrada. Abre la caja antes de cobrar.', 'CAJA_CERRADA');
    }

    // Dividir cuenta: solo se cobran las líneas elegidas y el resto sigue abierto.
    const seleccion = Array.isArray(body.detalles_cobrar) ? body.detalles_cobrar : [];
    const { cuentaId: cuentaACobrar, dividida } = seleccion.length
      ? await separarDetalles(client, cuentaId, seleccion)
      : { cuentaId, dividida: false };

    const descuento = validarDescuento(body.descuento_tipo, body.descuento_valor, body.descuento_motivo);
    const totals = await calcularTotales(client, cuentaACobrar, descuento);
    validarPagoMixto(metodoPago2, montoPago2, totals.total);
    await descontarInventario(client, totals.detalles);
    const comprobante = await siguienteComprobante(client, tipoComprobante, cuentaACobrar);

    await client.query(
      `UPDATE cuentas
       SET estado = 'Cerrada', metodo_pago = $1, subtotal = $2, itbis = $3, propina = $4, total = $5,
           fecha_cierre = CURRENT_TIMESTAMP, tipo_comprobante = $6, rnc_cedula_cliente = $7,
           ncf_ecf_generado = $8, tarjeta_ultimos_4 = $9, tarjeta_marca = $10, cajero_id = $12,
           metodo_pago_2 = $13, monto_pago_2 = $14, banco_pago_2 = $15,
           descuento = $16, descuento_tipo = $17, descuento_valor = $18, descuento_motivo = $19
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
        cuentaACobrar,
        actor.id,
        metodoPago2,
        montoPago2 || null,
        metodoPago2 === 'Transferencia' ? String(bancoPago2 || '').trim() || null : null,
        totals.descuento,
        descuento?.tipo ?? null,
        descuento?.valor ?? null,
        descuento ? String(body.descuento_motivo).trim() : null,
      ]
    );

    // Si solo se cobró una parte, la mesa sigue ocupada con lo que quedó abierto.
    if (!dividida && account.rows[0].mesa_id) {
      await client.query("UPDATE mesas SET estado = 'Disponible', camarero_id = NULL WHERE id = $1", [
        account.rows[0].mesa_id,
      ]);
    }
    await registrarAuditoria(client, {
      usuarioId: actor.id,
      accion: 'COBRAR_CUENTA',
      entidad: 'cuentas',
      entidadId: cuentaACobrar,
      detalle: {
        metodoPago, metodoPago2, montoPago2, comprobante, ...totals, detalles: undefined,
        ...(dividida ? { dividida: true, cuentaOrigen: cuentaId } : {}),
        ...(descuento ? { descuentoTipo: descuento.tipo, descuentoValor: descuento.valor, descuentoMotivo: String(body.descuento_motivo).trim() } : {}),
      },
      ip: clientIp(req),
    });
    notificarMesas('mesa_actualizada');
    return { comprobante, cajero_nombre: actor.nombre, cuenta_id: cuentaACobrar, dividida, ...totals };
  });
}
