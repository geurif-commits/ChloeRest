import { describe, it, expect } from 'vitest';
import { construirECF } from '../../../src/lib/ecf.js';
import {
  formatearFila607,
  formatearFila606,
  serializarTXT,
  serializarCSV,
  COLS_607,
  COLS_606,
} from '../../../src/lib/dgii.js';

describe('construirECF', () => {
  it('genera E32 con totales correctos', () => {
    const cfg = { rnc_emisor: '131000001', razon_social_emisor: 'Restaurante Chloe', direccion_emisor: 'Av. Principal 123' };
    const eCF = construirECF({
      tipoECF: 32,
      ncf: 'E320000000001',
      cfg,
      rncReceptor: '40212345678',
      razonSocialReceptor: 'Juan Perez',
      detalles: [{ cantidad: 2, precio_unitario: 100, tasa_itbis: 18, producto_nombre: 'Filete Mignon' }],
      fechaEmision: '01-09-2026',
      tipoPago: 1,
    });

    const enc = eCF.ECF.Encabezado;
    expect(enc.IdDoc.TipoeCF).toBe(32);
    expect(enc.IdDoc.eNCF).toBe('E320000000001');
    expect(enc.Emisor.RNCEmisor).toBe('131000001');
    expect(enc.Comprador.RNCComprador).toBe('40212345678');
    expect(enc.Totales.MontoGravadoTotal).toBe(169.49);
    expect(enc.Totales.TotalITBIS).toBe(30.51);
    expect(enc.Totales.MontoTotal).toBe(200);
    expect(eCF.ECF.DetallesItems.Item.length).toBe(1);
  });

  it('marca exento cuando tasa_itbis es 0', () => {
    const cfg = { rnc_emisor: '131000001', razon_social_emisor: 'Restaurante' };
    const eCF = construirECF({
      tipoECF: 33,
      ncf: 'E330000000001',
      cfg,
      rncReceptor: '99999999999',
      detalles: [{ cantidad: 1, precio_unitario: 500, tasa_itbis: 0, descripcion: 'Plato del dia' }],
      tipoPago: 2,
    });
    const enc = eCF.ECF.Encabezado;
    expect(enc.IdDoc.TipoPago).toBe(2);
    expect(enc.Totales.MontoExento).toBe(500);
    expect(enc.Totales.MontoTotal).toBe(500);
    expect(enc.Totales.TotalITBIS).toBeUndefined();
  });
});

describe('formatearFila607', () => {
  it('calcula correctamente efectivo/tarjeta/transferencia', () => {
    const fila = formatearFila607({
      ncf: 'E320000000001',
      rnc_cedula_cliente: '40212345678',
      subtotal: 169.49,
      itbis: 30.51,
      propina: 10,
      total: 210,
      metodo_pago: 'Efectivo',
      fecha_apertura: '2026-09-01T10:00:00',
    });
    expect(fila.rnc_cedula).toBe('40212345678');
    expect(fila.tipo_id).toBe('2');
    expect(fila.monto_facturado).toBe('169.49');
    expect(fila.efectivo).toBe('210.00');
    expect(fila.tarjeta).toBe('0.00');
    expect(fila.ncf).toBe('E320000000001');
  });

  it('identifica RNC de 9 dígitos', () => {
    const fila = formatearFila607({
      ncf: 'E310000000001',
      rnc_cedula_cliente: '131000001',
      subtotal: 100,
      itbis: 18,
      propina: 0,
      total: 118,
      metodo_pago: 'Tarjeta',
      fecha_apertura: '2026-09-01T10:00:00',
    });
    expect(fila.tipo_id).toBe('1');
    expect(fila.tarjeta).toBe('118.00');
  });
});

describe('formatearFila606', () => {
  it('usa costo_unitario real cuando existe', () => {
    const fila = formatearFila606({ id: 5, cantidad: 3, costo_unitario: 120, fecha: '2026-09-01' });
    expect(fila.monto_facturado_bienes).toBe('360.00');
    expect(fila.total_monto_facturado).toBe('360.00');
    expect(fila.ncf).toBe('B0100000005');
  });

  it('cae a valor por defecto 50.00 sin costo', () => {
    const fila = formatearFila606({ id: 6, cantidad: 2, costo_unitario: 0, fecha: '2026-09-01' });
    expect(fila.monto_facturado_bienes).toBe('100.00');
  });
});

describe('serializarTXT / serializarCSV', () => {
  it('genera encabezado oficial DGII en TXT', () => {
    const filas = [
      formatearFila607({ ncf: 'E320000000001', subtotal: 100, itbis: 18, total: 118, metodo_pago: 'Efectivo', fecha_apertura: '2026-09-01' }),
    ];
    const txt = serializarTXT('607', '131000001', '202609', filas, COLS_607);
    const lineas = txt.split('\r\n');
    expect(lineas[0]).toBe('607|131000001|202609|1');
    expect(lineas.length).toBe(2);
    expect(lineas[1].split('|').length).toBe(23);
  });

  it('escapa comillas y genera columnas en CSV', () => {
    const filas = [formatearFila606({ id: 1, cantidad: 1, costo_unitario: 10, fecha: '2026-09-01' })];
    const csv = serializarCSV(filas, COLS_606);
    const lineas = csv.split('\r\n');
    expect(lineas[0].split(',').length).toBe(COLS_606.length);
    expect(lineas.length).toBe(2);
  });
});
