import qrcode from 'qrcode-generator';
import { qrSvgDeModulos } from './qrSvg.js';

/**
 * Código QR generado en el equipo (sin internet y sin enviar datos de la factura a un servicio externo).
 * Devuelve un data URL SVG (ver qrSvgDeModulos).
 */
export function qrComoImagen(texto, opciones) {
  const qr = qrcode(0, 'M');
  qr.addData(String(texto));
  qr.make();
  return qrSvgDeModulos(qr.getModuleCount(), (fila, col) => qr.isDark(fila, col), opciones);
}
