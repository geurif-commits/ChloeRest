import qrcode from 'qrcode-generator';

/**
 * Código QR generado en el equipo (sin internet y sin enviar datos de la factura a un servicio externo).
 * Devuelve un data URL SVG de una sola ruta: nítido a cualquier tamaño, también al imprimir.
 */
export function qrComoImagen(texto, { margen = 2 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(String(texto));
  qr.make();
  const n = qr.getModuleCount();
  let ruta = '';
  for (let fila = 0; fila < n; fila += 1) {
    for (let col = 0; col < n; col += 1) {
      if (qr.isDark(fila, col)) ruta += `M${col + margen} ${fila + margen}h1v1h-1z`;
    }
  }
  const lado = n + margen * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${ruta}" fill="#000"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
