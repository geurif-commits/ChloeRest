import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirECF } from '../lib/ecf.js';
import { formatearFila607, formatearFila606, serializarTXT, serializarCSV, COLS_607, COLS_606 } from '../lib/dgii.js';

test('construirECF genera E32 con totales correctos', () => {
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
  assert.equal(enc.IdDoc.TipoeCF, 32);
  assert.equal(enc.IdDoc.eNCF, 'E320000000001');
  assert.equal(enc.Emisor.RNCEmisor, '131000001');
  assert.equal(enc.Comprador.RNCComprador, '40212345678');
  // 2 x 100 = 200 gravado (excluye ITBIS)
  assert.equal(enc.Totales.MontoGravadoTotal, 169.49);
  assert.equal(enc.Totales.TotalITBIS, 30.51);
  assert.equal(enc.Totales.MontoTotal, 200);
  assert.equal(eCF.ECF.DetallesItems.Item.length, 1);
});

test('construirECF marca exento cuando tasa_itbis es 0', () => {
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
  assert.equal(enc.IdDoc.TipoPago, 2);
  assert.equal(enc.Totales.MontoExento, 500);
  assert.equal(enc.Totales.MontoTotal, 500);
  assert.equal(enc.Totales.TotalITBIS, undefined);
});

test('formatearFila607 calcula correctamente efectivo/tarjeta/transferencia', () => {
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
  assert.equal(fila.rnc_cedula, '40212345678');
  assert.equal(fila.tipo_id, '2'); // 11 dígitos → cédula
  assert.equal(fila.monto_facturado, '169.49');
  assert.equal(fila.efectivo, '210.00');
  assert.equal(fila.tarjeta, '0.00');
  assert.equal(fila.ncf, 'E320000000001');
});

test('formatearFila607 identifica RNC de 9 digitos', () => {
  const fila = formatearFila607({
    ncf: 'E310000000001',
    rnc_cedula_cliente: '131000001',
    subtotal: 100, itbis: 18, propina: 0, total: 118,
    metodo_pago: 'Tarjeta', fecha_apertura: '2026-09-01T10:00:00',
  });
  assert.equal(fila.tipo_id, '1');
  assert.equal(fila.tarjeta, '118.00');
});

test('formatearFila606 usa costo_unitario real cuando existe', () => {
  const fila = formatearFila606({ id: 5, cantidad: 3, costo_unitario: 120, fecha: '2026-09-01' });
  assert.equal(fila.monto_facturado_bienes, '360.00');
  assert.equal(fila.total_monto_facturado, '360.00');
  assert.equal(fila.ncf, 'B0100000005');
});

test('formatearFila606 cae a valor por defecto 50.00 sin costo', () => {
  const fila = formatearFila606({ id: 6, cantidad: 2, costo_unitario: 0, fecha: '2026-09-01' });
  assert.equal(fila.monto_facturado_bienes, '100.00');
});

test('serializarTXT genera encabezado oficial DGII', () => {
  const filas = [formatearFila607({ ncf: 'E320000000001', subtotal: 100, itbis: 18, total: 118, metodo_pago: 'Efectivo', fecha_apertura: '2026-09-01' })];
  const txt = serializarTXT('607', '131000001', '202609', filas, COLS_607);
  const lineas = txt.split('\r\n');
  assert.equal(lineas[0], '607|131000001|202609|1');
  assert.equal(lineas.length, 2);
  assert.equal(lineas[1].split('|').length, 23);
});

test('serializarCSV escapa comillas y genera columnas', () => {
  const filas = [formatearFila606({ id: 1, cantidad: 1, costo_unitario: 10, fecha: '2026-09-01' })];
  const csv = serializarCSV(filas, COLS_606);
  const lineas = csv.split('\r\n');
  assert.equal(lineas[0].split(',').length, COLS_606.length);
  assert.equal(lineas.length, 2);
});
