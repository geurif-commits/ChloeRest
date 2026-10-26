/**
 * @file Lectura del CSV de importación masiva de productos (sin acceso a base de datos).
 *
 * La plantilla oficial trae los mismos campos que el formulario de creación de productos. Solo `nombre` y `precio`
 * son obligatorios: cualquier otra columna puede faltar o ir vacía, y entonces el producto toma el valor por
 * omisión del formulario (sin ITBIS ni propina, plato fuerte, sin guarnición ni término). Las plantillas de 6
 * columnas anteriores (nombre, precio, categoria, tasa_itbis, aplica_propina, imagen_url) siguen funcionando.
 */
import { httpError, money, parseCsvLine } from '../lib/core.js';

export interface IProductoImportable {
  /** Línea física (1-based) del archivo, para mensajes de error. */
  linea: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string;
  /** Destino pedido en el archivo; la categoría (su grupo) puede imponer otro. */
  tipoDestino: 'cocina' | 'bar';
  /** null = sin dato: se deduce del destino. */
  tipoPlato: 'entrada' | 'plato_fuerte' | 'postre' | 'guarnicion' | 'bebida' | null;
  tasaItbis: 0 | 16 | 18;
  aplicaPropina: boolean;
  requiereGuarnicion: boolean;
  requiereTermino: boolean;
  imagenUrl: string | null;
}

export interface IFilaInvalida {
  linea: number;
  datos: string[];
  error: string;
}

export interface IAnalisisCsvProductos {
  productos: IProductoImportable[];
  invalidRows: IFilaInvalida[];
}

/** Categoría que se usa cuando el archivo no trae la columna o la deja vacía (comportamiento histórico). */
export const CATEGORIA_POR_OMISION = 'Alimentos';

const TIPOS_PLATO = ['entrada', 'plato_fuerte', 'postre', 'guarnicion', 'bebida'] as const;
const AFIRMATIVOS = ['SI', 'SÍ', 'S', 'TRUE', 'VERDADERO', '1', 'X', 'YES'];

/** Nombre de columna sin acentos ni mayúsculas, para aceptar "Categoría", "descripción", etc. */
function normalizarColumna(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function indiceColumna(cabecera: string[], ...nombres: string[]): number {
  for (const nombre of nombres) {
    const idx = cabecera.indexOf(nombre);
    if (idx !== -1) {return idx;}
  }
  return -1;
}

function celda(fila: string[], idx: number): string {
  return idx === -1 ? '' : String(fila[idx] ?? '').trim();
}

function esAfirmativo(valor: string): boolean {
  return AFIRMATIVOS.includes(valor.toUpperCase());
}

/**
 * Analiza el contenido de un CSV de productos. Lanza `httpError` 400 si está vacío o le faltan `nombre`/`precio`;
 * las filas con problemas no detienen la carga: se devuelven en `invalidRows`.
 */
export function analizarCsvProductos(contenido: string): IAnalisisCsvProductos {
  // Excel guarda "CSV UTF-8" con una marca de orden de bytes al inicio: sin quitarla la primera columna no se reconoce.
  const texto = contenido.replace(/^\uFEFF/, '');
  const lineas = texto
    .split(/\r?\n/)
    .map((contenidoLinea, idx) => ({ numero: idx + 1, texto: contenidoLinea.trim() }))
    .filter((l) => l.texto.length > 0);
  if (lineas.length < 2) {throw httpError(400, 'El archivo CSV está vacío o no contiene datos.');}

  const cabecera = parseCsvLine(lineas[0].texto).map(normalizarColumna);
  const faltantes = ['nombre', 'precio'].filter((col) => !cabecera.includes(col));
  if (faltantes.length) {throw httpError(400, `Columnas obligatorias faltantes: ${faltantes.join(', ')}.`);}

  const nombreIdx = cabecera.indexOf('nombre');
  const precioIdx = cabecera.indexOf('precio');
  const categoriaIdx = indiceColumna(cabecera, 'categoria');
  const descripcionIdx = indiceColumna(cabecera, 'descripcion');
  const destinoIdx = indiceColumna(cabecera, 'tipo_destino', 'destino');
  const platoIdx = indiceColumna(cabecera, 'tipo_plato');
  const itbisIdx = indiceColumna(cabecera, 'tasa_itbis');
  const propinaIdx = indiceColumna(cabecera, 'aplica_propina', 'propina_legal');
  const guarnicionIdx = indiceColumna(cabecera, 'requiere_guarnicion');
  const terminoIdx = indiceColumna(cabecera, 'requiere_termino');
  const imagenIdx = indiceColumna(cabecera, 'imagen_url');

  const productos: IProductoImportable[] = [];
  const invalidRows: IFilaInvalida[] = [];

  for (const { numero, texto: lineaTexto } of lineas.slice(1)) {
    const fila = parseCsvLine(lineaTexto);
    if (fila.every((c) => c.trim() === '')) {continue;}

    const nombre = celda(fila, nombreIdx);
    // Un precio vacío no es 0: Number('') vale 0 y la fila entraría como "gratis"; se exige un número escrito.
    const precioTexto = celda(fila, precioIdx);
    const precio = precioTexto === '' ? Number.NaN : money(precioTexto);
    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      invalidRows.push({ linea: numero, datos: fila, error: 'Nombre o precio inválido.' });
      continue;
    }

    // ITBIS: sin columna o vacío = exento; solo 16 o 18 lo aplican.
    const itbis = celda(fila, itbisIdx).toUpperCase();
    const tasaItbis: 0 | 16 | 18 = ['16', '16%'].includes(itbis) ? 16 : ['18', '18%'].includes(itbis) ? 18 : 0;

    // Propina legal: sin columna o vacío = no aplica; solo un valor afirmativo (o 10 / 10%) la activa.
    const propina = celda(fila, propinaIdx).toUpperCase();
    const aplicaPropina = ['10', '10%'].includes(propina) || esAfirmativo(propina);

    const destino = normalizarColumna(celda(fila, destinoIdx));
    const plato = normalizarColumna(celda(fila, platoIdx)).replace(/\s+/g, '_');

    productos.push({
      linea: numero,
      nombre,
      descripcion: celda(fila, descripcionIdx) || null,
      precio,
      categoria: celda(fila, categoriaIdx) || CATEGORIA_POR_OMISION,
      tipoDestino: ['bar', 'bebida', 'bebidas'].includes(destino) ? 'bar' : 'cocina',
      tipoPlato: (TIPOS_PLATO as readonly string[]).includes(plato) ? (plato as IProductoImportable['tipoPlato']) : null,
      tasaItbis,
      aplicaPropina,
      requiereGuarnicion: esAfirmativo(celda(fila, guarnicionIdx)),
      requiereTermino: esAfirmativo(celda(fila, terminoIdx)),
      imagenUrl: celda(fila, imagenIdx) || null,
    });
  }

  return { productos, invalidRows };
}
