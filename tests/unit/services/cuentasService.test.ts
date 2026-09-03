import { describe, it, expect } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  calcularTotales,
  cuentaAbiertaParaMesa,
  descontarInventario,
  siguienteComprobante,
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
  it('calcula subtotal, ITBIS 18% sobre gravado, propina 10% y total', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(1, '2', '100', '18')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: true }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.subtotal).toBe(200);
    expect(totales.totalGravado).toBe(169.49);
    expect(totales.totalItbis).toBe(30.51);
    expect(totales.totalExento).toBe(0);
    expect(totales.itbis).toBe(30.51);
    expect(totales.propina).toBe(20);
    expect(totales.total).toBe(250.51);
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
    expect(totales.totalItbis).toBe(30.51);
    expect(totales.total).toBe(220);
  });

  it('redondea a centavos ITBIS y propina', async () => {
    const { cliente } = crearCliente([
      { match: DETALLES_SQL, rows: [detalle(3, '1', '99.99', '18')] },
      { match: NEGOCIO_SQL, rows: [{ cobrar_itbis: true, cobrar_propina: true }] },
    ]);
    const totales = await calcularTotales(cliente, 10);
    expect(totales.subtotal).toBe(99.99);
    expect(totales.totalItbis).toBe(15.25);
    expect(totales.propina).toBe(10);
    expect(totales.total).toBe(125.24);
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
