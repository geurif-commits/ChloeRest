import { describe, it, expect } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  calcularTotales,
  cuentaAbiertaParaMesa,
  descontarInventario,
  siguienteComprobante,
  planificarDivision,
  validarDescuento,
  validarPagoMixto,
  type ITotalesDetalleFila,
} from '../../../src/services/cuentasService.js';
import type { IQueryable } from '../../../src/services/auditoriaService.js';

type RespuestaSimulada = { match: RegExp; rows: QueryResultRow[] };
type Llamada = { sql: string; values?: unknown[] };

function crearCliente(respuestas: RespuestaSimulada[]): { cliente: IQueryable; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const cliente: IQueryable = {
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[]
    ): Promise<QueryResult<T>> {
      llamadas.push({ sql: text, values });
      const coincidencia = respuestas.find((respuesta) => respuesta.match.test(text));
      const rows = (coincidencia?.rows ?? []) as T[];
      return { rows, rowCount: rows.length } as QueryResult<T>;
    },
  };
  return { cliente, llamadas };
}

const DETALLES_SQL = /FROM cuenta_detalles/;
const NEGOCIO_SQL = /FROM negocio_config/;
const SECUENCIA_SQL = /FROM dgii_secuencias/;
const CUENTA_SQL = /WHERE mesa_id = \$1 AND estado = 'Abierta'/;
const RECETA_SQL = /FROM receta_productos/;

function detalle(productoId: number, cantidad: string, precio: string, tasa: string | null): QueryResultRow {
  return { producto_id: productoId, cantidad, precio_unitario: precio, tasa_itbis: tasa };
}

describe('siguienteComprobante', () => {
  it('compone el NCF con prefijo y secuencia rellenada a 8 dígitos', async () => {
    const { cliente, llamadas } = crearCliente([
      {
        match: SECUENCIA_SQL,
        rows: [{ id: 7, prefijo: 'B02', secuencia_actual: 1234, secuencia_final: 99999999 }],
      },
    ]);
    const ncf = await siguienteComprobante(cliente, 'factura', 1);
    expect(ncf).toBe('B0200001234');
    const update = llamadas.find((llamada) => llamada.sql.includes('UPDATE dgii_secuencias'));
    expect(update).toBeDefined();
    expect(update?.values).toEqual([7]);
  });

  it('lanza 400 si no hay secuencia activa para el tipo', async () => {
    const { cliente } = crearCliente([{ match: SECUENCIA_SQL, rows: [] }]);
    await expect(siguienteComprobante(cliente, 'factura', 1)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('No hay secuencia activa'),
    });
  });

  it('lanza 400 si la secuencia está agotada', async () => {
    const { cliente } = crearCliente([
      { match: SECUENCIA_SQL, rows: [{ id: 3, prefijo: 'B02', secuencia_actual: 100, secuencia_final: 100 }] },
    ]);
    await expect(siguienteComprobante(cliente, 'factura', 1)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('agotada'),
    });
  });
});

describe('calcularTotales', () => {
  it('calcula subtotal, ITBIS 18% sumado al subtotal, propina 10% y total (precios sin ITBIS)', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '18')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: true }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.subtotal).toBe(200);
    expect(totales.totalGravado).toBe(200);
    expect(totales.totalItbis).toBe(36);
    expect(totales.totalExento).toBe(0);
    expect(totales.itbis).toBe(36);
    expect(totales.propina).toBe(20);
    expect(totales.total).toBe(256);
  });

  it('clasifica como exento el producto con tasa 0', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(2, '1', '50', '0')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: true }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.totalExento).toBe(50);
    expect(totales.totalGravado).toBe(0);
    expect(totales.totalItbis).toBe(0);
    expect(totales.itbis).toBe(0);
    expect(totales.total).toBe(55);
  });

  it('respeta negocio con ITBIS desactivado (totalItbis informativo)', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '18')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: false, cobrar_propina: true }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.itbis).toBe(0);
    expect(totales.totalItbis).toBe(36);
    expect(totales.total).toBe(220);
  });

  it('redondea a centavos ITBIS y propina', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(3, '1', '99.99', '18')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: true }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.subtotal).toBe(99.99);
    expect(totales.totalItbis).toBe(18);
    expect(totales.propina).toBe(10);
    expect(totales.total).toBe(127.99);
  });

  it('aplica el porcentaje de propina configurado por el negocio', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '0')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: false, cobrar_propina: true, propina_porcentaje: '15.00' }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.subtotal).toBe(200);
    expect(totales.propina).toBe(30);
    expect(totales.total).toBe(230);
  });

  it('acepta los límites del rango de propina (2 % y 30 %)', async () => {
    for (const [porcentaje, propina] of [['2', 4], ['30', 60]] as const) {
      const { cliente } = crearCliente([
        { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '0')] },
        { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: false, cobrar_propina: true, propina_porcentaje: porcentaje }] },
      ]);
      expect((await calcularTotales(cliente, 10)).propina).toBe(propina);
    }
  });

  it('usa 10 % si el porcentaje guardado es inválido o falta', async () => {
    for (const guardado of [null, undefined, '1', '31', 'abc']) {
      const { cliente } = crearCliente([
        { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '0')] },
        { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: false, cobrar_propina: true, propina_porcentaje: guardado }] },
      ]);
      expect((await calcularTotales(cliente, 10)).propina).toBe(20);
    }
  });

  it('no cobra ITBIS ni propina si el negocio no los activó o no hay configuración', async () => {
    for (const filas of [[{ cobrar_itbis: false, cobrar_propina: false, propina_porcentaje: '10' }], [{ cobrar_itbis: null, cobrar_propina: null }], []]) {
      const { cliente } = crearCliente([
        { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '18')] },
        { match: NEGOCIO_SQL, rows: filas },
      ]);
      const totales = await calcularTotales(cliente, 10);
      expect(totales.itbis).toBe(0);
      expect(totales.propina).toBe(0);
      expect(totales.total).toBe(200);
    }
  });

  it('rechaza cobrar una cuenta sin productos activos', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: true }] },
    ]);
    await expect(calcularTotales(cliente, 10)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('sin productos activos'),
    });
  });
});

describe('descontarInventario', () => {
  const detalles: ITotalesDetalleFila[] = [
    { producto_id: 5, cantidad: '2', precio_unitario: '1', tasa_itbis: '18' },
  ];

  it('descuenta ingredientes según la receta y la cantidad total vendida', async () => {
    const { cliente, llamadas } = crearCliente([
      {
        match: RECETA_SQL,
        rows: [{ id: 9, nombre: 'Harina', stock_actual: '20', cantidad_necesaria: '3' }],
      },
    ]);
    const doble: ITotalesDetalleFila[] = [detalles[0], { ...detalles[0], cantidad: '1' }];
    await descontarInventario(cliente, doble);
    const update = llamadas.find((llamada) => llamada.sql.includes('UPDATE ingredientes'));
    expect(update?.values).toEqual([9, 9]);
  });

  it('lanza 409 si el stock no alcanza para la receta', async () => {
    const { cliente } = crearCliente([
      {
        match: RECETA_SQL,
        rows: [{ id: 9, nombre: 'Harina', stock_actual: '5', cantidad_necesaria: '3' }],
      },
    ]);
    await expect(descontarInventario(cliente, detalles)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Inventario insuficiente para Harina'),
    });
  });

  it('no actualiza si el producto no tiene receta', async () => {
    const { cliente, llamadas } = crearCliente([{ match: RECETA_SQL, rows: [] }]);
    await descontarInventario(cliente, detalles);
    expect(llamadas.some((llamada) => llamada.sql.includes('UPDATE ingredientes'))).toBe(false);
  });
});

describe('cuentaAbiertaParaMesa', () => {
  it('devuelve null si la mesa no tiene cuenta abierta', async () => {
    const { cliente } = crearCliente([{ match: CUENTA_SQL, rows: [] }]);
    expect(await cuentaAbiertaParaMesa(cliente, 4)).toBeNull();
  });

  it('devuelve la fila y bloquea con FOR UPDATE si lock=true', async () => {
    const { cliente, llamadas } = crearCliente([
      {
        match: CUENTA_SQL,
        rows: [{ id: 88, mesa_id: 4, camarero_id: 2, estado: 'Abierta', tipo_servicio: 'local' }],
      },
    ]);
    const cuenta = await cuentaAbiertaParaMesa(cliente, 4, true);
    expect(cuenta?.id).toBe(88);
    expect(llamadas[0].sql).toContain('FOR UPDATE');
  });

  it('no bloquea si lock=false', async () => {
    const { cliente, llamadas } = crearCliente([{ match: CUENTA_SQL, rows: [] }]);
    await cuentaAbiertaParaMesa(cliente, 4);
    expect(llamadas[0].sql).not.toContain('FOR UPDATE');
  });
});

describe('validarPagoMixto', () => {
  it('no valida nada si el pago no es mixto', () => {
    expect(() => validarPagoMixto(null, -500, 100)).not.toThrow();
  });

  it('acepta un segundo monto entre 0 y el total', () => {
    expect(() => validarPagoMixto('Tarjeta', 40, 100)).not.toThrow();
    expect(() => validarPagoMixto('Tarjeta', 100, 100)).not.toThrow();
  });

  it('rechaza un monto negativo o no numérico', () => {
    expect(() => validarPagoMixto('Tarjeta', -500, 100)).toThrow(/no es válido/);
    expect(() => validarPagoMixto('Efectivo', Number.NaN, 100)).toThrow(/no es válido/);
  });

  it('rechaza un monto mayor al total de la cuenta', () => {
    expect(() => validarPagoMixto('Transferencia', 100.01, 100)).toThrow(/no puede superar/);
  });
});

describe('calcularTotales · mezcla de tasas y redondeo por línea', () => {
  it('cada línea usa la tasa de su producto (18 %, 16 % y exento)', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '1', '100', '18'), detalle(2, '2', '50', '16'), detalle(3, '1', '30', '0')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: false }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.subtotal).toBe(230);
    expect(totales.totalGravado).toBe(200);
    expect(totales.totalExento).toBe(30);
    expect(totales.itbis).toBe(34); // 18 + 16
    expect(totales.total).toBe(264);
  });

  it('redondea el ITBIS línea por línea en centavos (10.25 x 18 % = 1.845 → 1.85)', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '1', '10.25', '18')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: false }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.itbis).toBe(1.85);
    expect(totales.total).toBe(12.1);
  });

  it('un producto sin tasa cargada se trata como exento', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '1', '100', null)] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: false }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.itbis).toBe(0);
    expect(totales.totalExento).toBe(100);
  });
});

describe('validarDescuento', () => {
  it('devuelve null cuando no se pidió descuento', () => {
    expect(validarDescuento(null, null, null)).toBeNull();
    expect(validarDescuento('porcentaje', '', 'x')).toBeNull();
    expect(validarDescuento('monto', 0, 'x')).toBeNull();
  });

  it('acepta porcentaje (hasta 100) y monto con motivo', () => {
    expect(validarDescuento('porcentaje', '15', 'Cliente frecuente')).toEqual({ tipo: 'porcentaje', valor: 15 });
    expect(validarDescuento('monto', 250.5, 'Cortesía de la casa')).toEqual({ tipo: 'monto', valor: 250.5 });
    expect(validarDescuento('porcentaje', 100, 'Cortesía')).toEqual({ tipo: 'porcentaje', valor: 100 });
  });

  it('rechaza tipo inválido, valores negativos o > 100 %, y exige motivo', () => {
    expect(() => validarDescuento('regalo', 10, 'motivo')).toThrow(/porcentaje o monto/);
    expect(() => validarDescuento('monto', -5, 'motivo')).toThrow(/mayor a 0/);
    expect(() => validarDescuento('monto', 'abc', 'motivo')).toThrow(/mayor a 0/);
    expect(() => validarDescuento('porcentaje', 101, 'motivo')).toThrow(/100 %/);
    expect(() => validarDescuento('porcentaje', 10, '')).toThrow(/motivo/);
    expect(() => validarDescuento('porcentaje', 10, 'ab')).toThrow(/motivo/);
  });
});

describe('calcularTotales con descuento', () => {
  const conNegocio = (itbis: boolean, propina: boolean) => ({ match: NEGOCIO_SQL, rows: [{ cobrar_itbis: itbis, cobrar_propina: propina, propina_porcentaje: '10' }] });

  it('un porcentaje reduce el subtotal', async () => {
    const { cliente } = crearCliente([{ match: DETALLES_SQL, rows: [detalle(1, '2', '100', '0')] }, conNegocio(false, false)]);
    const totales = await calcularTotales(cliente, 10, { tipo: 'porcentaje', valor: 10 });
    expect(totales.subtotalBruto).toBe(200);
    expect(totales.descuento).toBe(20);
    expect(totales.subtotal).toBe(180);
    expect(totales.total).toBe(180);
  });

  it('el descuento baja la base del ITBIS y de la propina', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '1', '100', '18'), detalle(2, '1', '100', '0')] },
      conNegocio(true, true),
    ]);
    const totales = await calcularTotales(cliente, 10, { tipo: 'monto', valor: 20 });
    expect(totales.subtotalBruto).toBe(200);
    expect(totales.subtotal).toBe(180);
    expect(totales.totalGravado).toBe(90);
    expect(totales.totalExento).toBe(90);
    expect(totales.itbis).toBe(16.2); // 18 % de 90
    expect(totales.propina).toBe(18); // 10 % de 180
    expect(totales.total).toBe(214.2);
  });

  it('reparte los centavos sobrantes sin perder ni inventar dinero', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '1', '10', '0'), detalle(2, '1', '10', '0'), detalle(3, '1', '10', '0')] },
      conNegocio(false, false),
    ]);
    const totales = await calcularTotales(cliente, 10, { tipo: 'monto', valor: 0.01 });
    expect(totales.descuento).toBe(0.01);
    expect(totales.subtotal).toBe(29.99);
    expect(totales.total).toBe(29.99);
  });

  it('100 % deja la cuenta en cero (cortesía) y un monto mayor al subtotal se rechaza', async () => {
    const dos = () => crearCliente([{ match: DETALLES_SQL, rows: [detalle(1, '1', '50', '18')] }, conNegocio(true, true)]).cliente;
    const cero = await calcularTotales(dos(), 10, { tipo: 'porcentaje', valor: 100 });
    expect(cero.total).toBe(0);
    expect(cero.itbis).toBe(0);
    await expect(calcularTotales(dos(), 10, { tipo: 'monto', valor: 50.01 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('planificarDivision', () => {
  const detalles = [{ id: '1', cantidad: '2.00' }, { id: '2', cantidad: '1.00' }];

  it('separa una parte de la cantidad de una línea', () => {
    const plan = planificarDivision(detalles, [{ id: 1, cantidad: 1 }]);
    expect(plan.cubreTodo).toBe(false);
    expect(plan.movimientos).toEqual([{ id: '1', cantidad: 1, completo: false }]);
  });

  it('mueve líneas completas y detecta cuando la selección cubre toda la cuenta', () => {
    const parcial = planificarDivision(detalles, [{ id: 2, cantidad: 1 }]);
    expect(parcial.cubreTodo).toBe(false);
    expect(parcial.movimientos[0].completo).toBe(true);
    const todo = planificarDivision(detalles, [{ id: 1, cantidad: 2 }, { id: 2, cantidad: 1 }]);
    expect(todo.cubreTodo).toBe(true);
  });

  it('rechaza selecciones vacías, ajenas, repetidas o que exceden lo consumido', () => {
    expect(() => planificarDivision(detalles, [])).toThrow(/al menos un producto/);
    expect(() => planificarDivision(detalles, [{ id: 99, cantidad: 1 }])).toThrow(/no pertenece/);
    expect(() => planificarDivision(detalles, [{ id: 1, cantidad: 1 }, { id: 1, cantidad: 1 }])).toThrow(/repetido/);
    expect(() => planificarDivision(detalles, [{ id: 1, cantidad: 3 }])).toThrow(/supera/);
    expect(() => planificarDivision(detalles, [{ id: 1, cantidad: 0 }])).toThrow(/mayor a 0/);
  });
});
