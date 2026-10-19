import { describe, it, expect } from 'vitest';
import { parsearCliente, parsearLineas } from '../../../src/services/ventaRapidaService.js';

const mensaje = (fn: () => unknown): string => {
  try { fn(); } catch (error) { return error instanceof Error ? error.message : String(error); }
  return '';
};

describe('parsearLineas', () => {
  it('acepta id o producto_id y normaliza notas, guarnición y término', () => {
    expect(parsearLineas([
      { id: 3, cantidad: 2, notas: '  sin sal ', guarnicion: 'Tostones', termino: '' },
      { producto_id: '7', cantidad: '1' },
    ])).toEqual([
      { productoId: 3, cantidad: 2, notas: 'sin sal', guarnicion: 'Tostones', termino: null },
      { productoId: 7, cantidad: 1, notas: null, guarnicion: null, termino: null },
    ]);
  });

  it('rechaza una venta vacía, que no sea lista o con más de 50 líneas', () => {
    for (const mala of [undefined, null, 'x', {}, []]) {
      expect(mensaje(() => parsearLineas(mala))).toMatch(/vacía/);
    }
    const demasiadas = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, cantidad: 1 }));
    expect(mensaje(() => parsearLineas(demasiadas))).toMatch(/vacía/);
    expect(parsearLineas(demasiadas.slice(0, 50))).toHaveLength(50);
  });

  it('exige producto y cantidad enteros positivos (nada de 0, negativos, decimales ni texto)', () => {
    for (const mala of [{ cantidad: 1 }, { id: 0, cantidad: 1 }, { id: -2, cantidad: 1 }, { id: 'a', cantidad: 1 }, { id: 1.5, cantidad: 1 }]) {
      expect(mensaje(() => parsearLineas([mala]))).toMatch(/Producto no es válido/);
    }
    for (const mala of [{ id: 1 }, { id: 1, cantidad: 0 }, { id: 1, cantidad: -1 }, { id: 1, cantidad: 2.5 }, { id: 1, cantidad: 'dos' }]) {
      expect(mensaje(() => parsearLineas([mala]))).toMatch(/Cantidad no es válido/);
    }
  });

  it('no deja pasar elementos que no son objetos', () => {
    expect(mensaje(() => parsearLineas([null]))).toMatch(/Producto no es válido/);
    expect(mensaje(() => parsearLineas([5]))).toMatch(/Producto no es válido/);
  });

  it('recorta textos largos para que no desborden las columnas', () => {
    const [linea] = parsearLineas([{ id: 1, cantidad: 1, notas: 'n'.repeat(500), guarnicion: 'g'.repeat(500), termino: 't'.repeat(500) }]);
    expect(linea.notas).toHaveLength(200);
    expect(linea.guarnicion).toHaveLength(100);
    expect(linea.termino).toHaveLength(100);
  });
});

describe('parsearCliente', () => {
  it('sin nombre ni teléfono no se registra a nadie', () => {
    expect(parsearCliente(undefined, undefined)).toBeNull();
    expect(parsearCliente('', '   ')).toBeNull();
    expect(parsearCliente(null, null)).toBeNull();
  });

  it('con nombre y teléfono devuelve ambos recortados', () => {
    expect(parsearCliente('  Ana Pérez ', ' 8095551234 ')).toEqual({ nombre: 'Ana Pérez', telefono: '8095551234' });
  });

  it('con solo uno de los dos pide completar (el teléfono es la llave del cliente)', () => {
    expect(mensaje(() => parsearCliente('Ana', ''))).toMatch(/nombre y teléfono/);
    expect(mensaje(() => parsearCliente('', '8095551234'))).toMatch(/nombre y teléfono/);
  });

  it('recorta a las longitudes de las columnas', () => {
    const cliente = parsearCliente('n'.repeat(300), '9'.repeat(50));
    expect(cliente?.nombre).toHaveLength(200);
    expect(cliente?.telefono).toHaveLength(30);
  });
});
