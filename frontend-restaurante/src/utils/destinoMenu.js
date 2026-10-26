/**
 * Alimentos → Cocina, bebidas → Bar. La fuente de verdad es el GRUPO de la categoría
 * (menu_categorias.grupo: 'alimentos' | 'bebidas'); un nombre inequívoco de bebida
 * (Cervezas, Vinos, Cocteles…) siempre cuenta como bebida. Refleja src/services/destinoProducto.ts.
 */
const PALABRAS = [
  'bar', 'bebidas?', 'licor(es)?', 'tragos?', 'cocteles?', 'cocteleria', 'barra', 'cervezas?', 'vinos?', 'rones?', 'ron',
  'whisk(e)?y', 'whisky', 'vodkas?', 'tequilas?', 'refrescos?', 'jugos?', 'maltas?', 'sodas?', 'aguas?',
  'champagne', 'brandy', 'ginebras?', 'gin', 'mojitos?', 'margaritas?', 'sangrias?', 'ponches?',
  'batidas?', 'batidos?', 'frappes?', 'limonadas?', 'tamarindo', 'chinolas?', 'mabi', 'morir sonando',
];
// Un nombre mixto como "Ceviches y Cócteles" (cóctel de mariscos) es comida.
const COMIDA = [
  'ceviches?', 'sopas?', 'ensaladas?', 'entradas?', 'picaderas?', 'platos?', 'postres?', 'pastas?', 'mofongos?', 'sushi',
  'guarniciones?', 'acompanamientos?', 'principales?', 'carnes?', 'pollos?', 'pescados?', 'mariscos?', 'parrillas?',
  'criollos?', 'pizzas?', 'hamburguesas?', 'sandwich(es)?', 'desayunos?', 'almuerzos?', 'cenas?',
];
const REGEX_BEBIDA = new RegExp(`(^|[^a-z0-9])(${PALABRAS.join('|')})($|[^a-z0-9])`);
const REGEX_COMIDA = new RegExp(`(^|[^a-z0-9])(${COMIDA.join('|')})($|[^a-z0-9])`);

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const esNombreDeBebida = (nombre) => {
  const t = sinAcentos(nombre);
  return REGEX_BEBIDA.test(t) && !REGEX_COMIDA.test(t);
};

/** ¿La categoría es de bebidas? `categorias` = lista de /api/menu-configuracion (con `grupo`). */
export function esCategoriaBebida(nombre, categorias = []) {
  if (esNombreDeBebida(nombre)) return true;
  const c = categorias.find((x) => sinAcentos(x.nombre) === sinAcentos(nombre));
  if (c) {
    const g = sinAcentos(c.grupo);
    return g === 'bebidas' || g === 'bar';
  }
  return false;
}

/** Destino de un producto según su categoría: 'bar' | 'cocina'. */
export const destinoDeCategoria = (nombre, categorias = []) => (esCategoriaBebida(nombre, categorias) ? 'bar' : 'cocina');
