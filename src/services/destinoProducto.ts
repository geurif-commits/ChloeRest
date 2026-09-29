/**
 * @file Clasificación alimentos / bebidas (Cocina / Bar).
 *
 * Fuente de verdad: el GRUPO de la categoría del producto (menu_categorias.grupo):
 *   - 'alimentos' → Cocina (KDS Cocina, pestaña "Comida")
 *   - 'bebidas'   → Bar    (KDS Bar, pestaña "Bebidas")
 * Un producto hereda el destino de su categoría. Solo si su categoría no existe en el menú
 * se usa el tipo_destino del propio producto. Además, una categoría cuyo NOMBRE es
 * inequívocamente de bebidas (Cervezas, Vinos, Cocteles…) siempre es bebida, aunque
 * se haya creado por error como alimento.
 */

/** Palabras (sin acentos, minúsculas) que identifican una categoría de bebidas, con sus plurales. */
const PALABRAS_BEBIDA = [
  'bar', 'bebidas?', 'licor(es)?', 'tragos?', 'cocteles?', 'cocteleria', 'barra', 'cervezas?', 'vinos?', 'rones?', 'ron',
  'whisk(e)?y', 'whisky', 'vodkas?', 'tequilas?', 'refrescos?', 'jugos?', 'maltas?', 'sodas?', 'aguas?',
  'champagne', 'brandy', 'ginebras?', 'gin', 'mojitos?', 'margaritas?', 'sangrias?', 'ponches?',
  'batidas?', 'batidos?', 'frappes?', 'limonadas?', 'tamarindo', 'chinolas?', 'mabi', 'morir sonando',
];

/**
 * Palabras de comida: una categoría mixta como "Ceviches y Cócteles" (cóctel de mariscos) es comida,
 * así que un nombre con estas palabras nunca se trata como bebida solo por su nombre.
 */
const PALABRAS_COMIDA = [
  'ceviches?', 'sopas?', 'ensaladas?', 'entradas?', 'picaderas?', 'platos?', 'postres?', 'pastas?', 'mofongos?', 'sushi',
  'guarniciones?', 'acompanamientos?', 'principales?', 'carnes?', 'pollos?', 'pescados?', 'mariscos?', 'parrillas?',
  'criollos?', 'pizzas?', 'hamburguesas?', 'sandwich(es)?', 'desayunos?', 'almuerzos?', 'cenas?',
];

/** Patrones POSIX (PostgreSQL ~) con límites de palabra. Constantes seguras: se incrustan en SQL. */
export const PATRON_BEBIDA_SQL = `\\m(${PALABRAS_BEBIDA.join('|')})\\M`;
export const PATRON_COMIDA_SQL = `\\m(${PALABRAS_COMIDA.join('|')})\\M`;

const REGEX_BEBIDA = new RegExp(`(^|[^a-z0-9])(${PALABRAS_BEBIDA.join('|')})($|[^a-z0-9])`);
const REGEX_COMIDA = new RegExp(`(^|[^a-z0-9])(${PALABRAS_COMIDA.join('|')})($|[^a-z0-9])`);

const sinAcentos = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** ¿El nombre de la categoría es inequívocamente de bebidas? */
export function esNombreDeBebida(categoria: string | null | undefined): boolean {
  const t = sinAcentos(String(categoria ?? ''));
  return REGEX_BEBIDA.test(t) && !REGEX_COMIDA.test(t);
}

/** Grupo de una categoría al crearla/editarla: el nombre de bebida gana sobre un grupo mal elegido. */
export function grupoParaCategoria(nombre: string, solicitado: unknown): 'alimentos' | 'bebidas' {
  if (esNombreDeBebida(nombre)) {return 'bebidas';}
  return solicitado === 'bebidas' ? 'bebidas' : 'alimentos';
}

/** Fragmento SQL: TRUE si la categoría (expresión SQL) es de bebidas por su nombre (y no de comida). */
export function sqlNombreBebida(columnaCategoria: string): string {
  const normalizado = `translate(lower(trim(coalesce(${columnaCategoria}, ''))), 'áéíóúüñ', 'aeiouun')`;
  return `(${normalizado} ~ '${PATRON_BEBIDA_SQL}' AND ${normalizado} !~ '${PATRON_COMIDA_SQL}')`;
}

/**
 * Fragmento SQL: TRUE si el producto `p` va al Bar. Requiere el alias `mc` (LEFT JOIN LATERAL con la
 * categoría del producto: columna `grupo`, NULL si la categoría no existe en el menú).
 */
export function sqlProductoEsBar(): string {
  return `(CASE
      WHEN mc.grupo IS NOT NULL THEN (lower(trim(mc.grupo)) IN ('bebidas', 'bar') OR ${sqlNombreBebida('p.categoria')})
      ELSE (lower(trim(coalesce(p.tipo_destino, ''))) = 'bar' OR ${sqlNombreBebida('p.categoria')})
    END)`;
}

/** LEFT JOIN LATERAL que trae el grupo de la categoría del producto `p`. */
export const SQL_JOIN_CATEGORIA_PRODUCTO = `LEFT JOIN LATERAL (
      SELECT grupo FROM menu_categorias
       WHERE lower(trim(nombre)) = lower(trim(p.categoria))
       ORDER BY activo DESC, id
       LIMIT 1
    ) mc ON TRUE`;

interface IConsulta {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * Destino que se guarda en productos.tipo_destino: sigue a la categoría; sin categoría en el menú
 * respeta lo solicitado, salvo que el nombre sea de bebidas.
 */
export async function resolverTipoDestino(db: IConsulta, categoria: string, solicitado: string): Promise<'cocina' | 'bar'> {
  if (esNombreDeBebida(categoria)) {return 'bar';}
  const r = await db.query(
    'SELECT grupo FROM menu_categorias WHERE lower(trim(nombre)) = lower(trim($1)) ORDER BY activo DESC, id LIMIT 1',
    [categoria]
  );
  if (r.rows.length) {
    const grupo = String(r.rows[0].grupo || '').trim().toLowerCase();
    return grupo === 'bebidas' || grupo === 'bar' ? 'bar' : 'cocina';
  }
  return String(solicitado).toLowerCase() === 'bar' ? 'bar' : 'cocina';
}
