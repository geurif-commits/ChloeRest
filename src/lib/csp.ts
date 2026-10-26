/**
 * @file Directivas de Content-Security-Policy de la aplicación.
 *
 * - connect-src: las instalaciones locales (Electron/LAN) consultan planes y métodos de pago al servidor central.
 * - img-src: solo recursos propios, data: (códigos QR e imágenes incrustadas) y blob: (vistas previas de la imagen que el
 *   usuario acaba de elegir: logotipo, fondo, foto de producto). No se permiten servidores de imágenes externos.
 */
import helmet from 'helmet';

export function directivasCsp() {
  return {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'connect-src': ["'self'", 'https://chloerestaurant.lat'],
    'img-src': ["'self'", 'data:', 'blob:'],
  };
}
