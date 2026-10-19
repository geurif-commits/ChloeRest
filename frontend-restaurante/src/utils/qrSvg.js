/**
 * Dibujo del código QR a partir de su matriz de módulos (sin dependencias, para poder probarlo aparte).
 * Devuelve un data URL SVG de una sola ruta: nítido a cualquier tamaño, también al imprimir.
 *
 * @param {number} lado       módulos por lado de la matriz
 * @param {(fila: number, col: number) => boolean} esOscuro  ¿el módulo (fila, col) es negro?
 * @param {{ margen?: number }} [opciones]  margen blanco, en módulos
 */
export function qrSvgDeModulos(lado, esOscuro, { margen = 2 } = {}) {
  let ruta = '';
  for (let fila = 0; fila < lado; fila += 1) {
    for (let col = 0; col < lado; col += 1) {
      if (esOscuro(fila, col)) ruta += `M${col + margen} ${fila + margen}h1v1h-1z`;
    }
  }
  const total = lado + margen * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${ruta}" fill="#000"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
