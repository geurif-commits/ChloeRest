/**
 * Decide qué hace el teclado del login cada vez que se teclea un dígito, para que el PIN del propietario (10 a 12 dígitos)
 * entre por la misma pantalla que el personal (4 a 8 dígitos) sin disparar intentos fallidos por el camino.
 *
 * Sin PIN de propietario más largo que el del personal todo funciona como siempre (se envía al completar `pinLength`).
 * Con él, al completar `pinLength` se espera un instante por si el siguiente dígito es del PIN largo; si llega, no se envía
 * nada hasta completar la longitud del propietario.
 */

/** Espera tras el último dígito del PIN del personal antes de enviarlo (cancelable si se sigue tecleando). */
export const DEMORA_POSIBLE_PROPIETARIO_MS = 650;
const DEMORA_ENVIO_MS = 80;

/** Longitudes válidas de PIN de propietario que devuelve `/api/dueno/pin-info` (solo enteros de 4 a 12). */
export function longitudesDuenoValidas(info) {
  if (!info || info.configurado !== true || !Array.isArray(info.longitudes)) return [];
  return [...new Set(info.longitudes.filter((n) => Number.isInteger(n) && n >= 4 && n <= 12))].sort((a, b) => a - b);
}

/**
 * ¿Puede lo que se teclea ser un PIN de propietario? Solo en el acceso normal (no al fichar turno ni al abrir un KDS) y
 * únicamente si hay un PIN de propietario MÁS LARGO que el del personal; uno de la misma longitud ya se atiende al enviar.
 */
export function puedeSerPropietario({ duenoLongitudes = [], pinLength, esTurno = false, kdsPendiente = null }) {
  if (esTurno || kdsPendiente) return false;
  return duenoLongitudes.some((n) => n > pinLength);
}

/** Cantidad máxima de dígitos que acepta el teclado en este momento. */
export function maxDigitos({ pinLength, duenoLongitudes = [], modoDueno = false, esTurno = false, kdsPendiente = null }) {
  const mayor = duenoLongitudes.length ? Math.max(...duenoLongitudes) : 0;
  if (modoDueno) return mayor || pinLength;
  return puedeSerPropietario({ duenoLongitudes, pinLength, esTurno, kdsPendiente }) ? mayor : pinLength;
}

/** Puntos que dibuja el teclado: los del personal hasta que se pasa de esa longitud; entonces los del propietario. */
export function puntosVisibles({ pin, pinLength, duenoLongitudes = [], modoDueno = false, esTurno = false, kdsPendiente = null }) {
  const tope = maxDigitos({ pinLength, duenoLongitudes, modoDueno, esTurno, kdsPendiente });
  if (modoDueno) return tope;
  return pin.length > pinLength ? tope : pinLength;
}

/**
 * Qué hacer con el PIN tecleado `nuevo` (ya incluye el último dígito):
 *  - `{ accion: 'esperar' }`: todavía no se envía nada.
 *  - `{ accion: 'enviar', destino, demoraMs }`: enviar al login general (`'general'`) o al del propietario (`'dueno'`).
 */
export function planificarEnvioPin({ nuevo, pinLength, duenoLongitudes = [], modoDueno = false, esTurno = false, kdsPendiente = null }) {
  if (modoDueno) {
    const largo = duenoLongitudes.length ? Math.max(...duenoLongitudes) : pinLength;
    return nuevo.length === largo ? { accion: 'enviar', destino: 'dueno', demoraMs: DEMORA_ENVIO_MS } : { accion: 'esperar' };
  }
  const posible = puedeSerPropietario({ duenoLongitudes, pinLength, esTurno, kdsPendiente });
  // PIN completo del propietario tecleado en el acceso normal: el login general lo reconoce y abre su panel.
  if (posible && nuevo.length !== pinLength && duenoLongitudes.includes(nuevo.length)) {
    return { accion: 'enviar', destino: 'general', demoraMs: DEMORA_ENVIO_MS };
  }
  if (nuevo.length === pinLength) {
    return { accion: 'enviar', destino: 'general', demoraMs: posible ? DEMORA_POSIBLE_PROPIETARIO_MS : DEMORA_ENVIO_MS };
  }
  return { accion: 'esperar' };
}
