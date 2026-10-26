/**
 * @file Zona horaria del negocio. Los hostings suelen correr en otra zona (p. ej. America/New_York, que en invierno
 * va a UTC-5 mientras República Dominicana sigue en UTC-4): sin esto, las fechas de los comprobantes y de los reportes se
 * correrían una hora. Debe importarse antes que cualquier otro módulo que use fechas.
 */

export const ZONA_HORARIA_NEGOCIO = 'America/Santo_Domingo';

if (process.env.TZ !== ZONA_HORARIA_NEGOCIO) {
  process.env.TZ = ZONA_HORARIA_NEGOCIO;
}
