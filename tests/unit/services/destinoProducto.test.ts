import { describe, it, expect } from 'vitest';
import { esNombreDeBebida, grupoParaCategoria, sqlProductoEsBar } from '../../../src/services/destinoProducto.js';
import { esNombreDeBebida as esNombreDeBebidaFront } from '../../../frontend-restaurante/src/utils/destinoMenu.js';

describe('clasificación alimentos / bebidas', () => {
  it('reconoce categorías de bebidas por nombre (con plurales y acentos)', () => {
    for (const n of ['Cervezas', 'cerveza', 'Vinos', 'Cócteles', 'Cocteles', 'Jugos Naturales', 'Refrescos', 'Bar', 'Licores', 'Tragos', 'Whisky', 'Ron', 'Bebidas Calientes', 'Mojitos', 'Sangría']) {
      expect(esNombreDeBebida(n), n).toBe(true);
    }
  });

  it('no confunde categorías de comida con bebidas', () => {
    for (const n of ['Principales', 'Entradas', 'Postres', 'Pastas', 'Sopas', 'Mofongos y criollos', 'Ensaladas', 'Pescados', 'Aguacate', 'Carnes a la parrilla', 'Barbacoa']) {
      expect(esNombreDeBebida(n), n).toBe(false);
    }
  });

  it('categorías reales del menú del negocio', () => {
    const bebidas = ['Bebidas Sin Alcohol', 'Botellas de vino', 'Cervezas', 'Cócteles y Bebidas Preparadas', 'Cocteles y Bebidas Preparadas', 'Licores y Botellas'];
    const comida = ['Acompañamientos y Extras', 'Cafetería', 'Ceviches y Cócteles', 'Ceviches y Cocteles', 'Entradas y Picaderas', 'Guarniciones', 'Mofongos y Platos Criollos', 'Pastas', 'Platos Principales', 'Postres', 'Servicios', 'Sopas y Ensaladas', 'Sushi y Asiático'];
    for (const n of bebidas) { expect(esNombreDeBebida(n), n).toBe(true); expect(esNombreDeBebidaFront(n), 'front ' + n).toBe(true); }
    for (const n of comida) { expect(esNombreDeBebida(n), n).toBe(false); expect(esNombreDeBebidaFront(n), 'front ' + n).toBe(false); }
  });

  it('el grupo de una categoría de bebidas siempre es bebidas, aunque se pida alimentos', () => {
    expect(grupoParaCategoria('Cervezas', 'alimentos')).toBe('bebidas');
    expect(grupoParaCategoria('Especiales de la casa', 'bebidas')).toBe('bebidas');
    expect(grupoParaCategoria('Principales', 'alimentos')).toBe('alimentos');
    expect(grupoParaCategoria('Principales', undefined)).toBe('alimentos');
  });

  it('el SQL del KDS decide por el grupo de la categoría y usa el tipo del producto solo sin categoría', () => {
    const sql = sqlProductoEsBar();
    expect(sql).toContain('mc.grupo IS NOT NULL');
    expect(sql).toContain("IN ('bebidas', 'bar')");
    expect(sql).toContain('p.tipo_destino');
  });
});
