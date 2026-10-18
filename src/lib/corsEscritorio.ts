/**
 * @file CORS para la app de escritorio (Electron) hacia el servidor CENTRAL.
 *
 * La app de escritorio carga su interfaz desde su propio servidor local (`http://127.0.0.1:<puerto>`, o `file://` →
 * origen "null" si el local no arranca) y consulta al central, por `fetch`, los planes, los métodos de pago y la
 * solicitud de licencia. El navegador de Electron exige que el central responda con `Access-Control-Allow-Origin`;
 * en producción la lista de orígenes solo trae el dominio público, así que esas consultas fallaban con
 * "Error de conexión con el servidor" (la solicitud de registro, los planes y los métodos de pago).
 *
 * Solución acotada: SOLO esas rutas públicas, y SOLO para orígenes de este mismo equipo (loopback), responden con el
 * origen permitido y SIN credenciales. El resto de la API conserva la lista estricta de `CORS_ORIGINS`.
 */

import type { CorsOptions } from 'cors';

/** Rutas públicas (sin sesión) que la app de escritorio consulta en el central. */
const RUTAS_PUBLICAS_DE_REGISTRO: RegExp[] = [
  /^\/api\/planes\/?$/,
  /^\/api\/metodos-pago\/?$/,
  /^\/api\/solicitud-licencia\/?$/,
  /^\/api\/solicitud-licencia\/\d+\/confirmar-pago\/?$/,
];

const ORIGEN_DE_ESTE_EQUIPO = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;

/** Origen de la interfaz de escritorio: este mismo equipo, o "null" (pantalla cargada desde un archivo). */
export const esOrigenDeEscritorio = (origen: string | undefined): origen is string =>
  typeof origen === 'string' && (origen === 'null' || ORIGEN_DE_ESTE_EQUIPO.test(origen));

export const esRutaPublicaDeRegistro = (ruta: string): boolean => RUTAS_PUBLICAS_DE_REGISTRO.some((patron) => patron.test(ruta));

/**
 * Opciones de CORS para una petición: las acotadas para la app de escritorio en sus rutas públicas; para todo lo demás,
 * la lista de orígenes configurada (con credenciales, como siempre).
 */
export function opcionesCors(origen: string | undefined, ruta: string, origenesConfigurados: string[]): CorsOptions {
  if (esOrigenDeEscritorio(origen) && esRutaPublicaDeRegistro(ruta)) {
    return {
      origin: origen,
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 3600,
    };
  }
  return {
    origin: origenesConfigurados,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 3600,
  };
}
