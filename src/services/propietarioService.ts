/**
 * @file Acceso del propietario de la plataforma: UNA sola función decide si un PIN es el del propietario, para que
 * el panel del propietario (`/api/dueno/login`) y la pantalla de acceso general (`/api/login/camarero`) no puedan
 * discrepar.
 *
 * Dos modos:
 *  - **Fijo** (hay una credencial incrustada en `lib/propietario.ts`): PREVALECE. Es la única que vale; el `OWNER_PIN`
 *    del entorno y el PIN guardado en la base se ignoran, y no se puede crear ni cambiar un PIN de propietario desde
 *    la interfaz. Así ningún cliente puede quedarse con el panel de su instalación creando su propio PIN.
 *  - **Configurable** (sin credencial incrustada): el comportamiento de siempre (`OWNER_PIN` o PIN guardado).
 */

import crypto from 'node:crypto';
import { config } from '../lib/config.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { createLogger } from '../lib/logger.js';
import {
  longitudPinPropietarioIncrustado,
  pinPropietarioIncrustado,
  verificarPinPropietarioIncrustado,
} from '../lib/propietario.js';
import { registrarAuditoria } from './auditoriaService.js';
import { verifyPin } from './authService.js';
import { notificarPropietario } from './telegramBotService.js';

const logger = createLogger('propietario');

/** La sesión del propietario dura 4 horas (antes 12); el panel además se cierra solo tras 15 min sin uso. */
export const DURACION_SESION_DUENO_MS = 4 * 3600 * 1000;
export const pinPropietarioFijo = (): boolean => pinPropietarioIncrustado();

/**
 * El propietario se bloquea antes que el login normal (5 PIN incorrectos → 15 min sin intentar desde esa IP). Con un
 * PIN corto y configurable (modo sin PIN incrustado) el límite es aún más estricto: 3 intentos → 30 min. Con el PIN
 * incrustado (12 dígitos) adivinarlo en línea es inviable, así que se tolera algún error al teclearlo.
 */
export const limiteFallosPropietario = (): { maxIntentos: number; bloqueoMin: number } =>
  (pinPropietarioFijo() ? { maxIntentos: 5, bloqueoMin: 15 } : { maxIntentos: 3, bloqueoMin: 30 });

const igualesEnTiempoConstante = (a: string, b: string): boolean => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

async function pinGuardado(): Promise<{ hash: string | null; longitud: number }> {
  const cfg = await getDatabase().queryUnscoped<{ owner_pin_hash: string | null; owner_pin_longitud: number | null }>(
    'SELECT owner_pin_hash, owner_pin_longitud FROM configuracion_sistema ORDER BY id LIMIT 1'
  );
  return { hash: cfg.rows[0]?.owner_pin_hash || null, longitud: Number(cfg.rows[0]?.owner_pin_longitud) || 6 };
}

/** ¿Este PIN es el del propietario? */
export async function esPinDelPropietario(pin: string): Promise<boolean> {
  if (pinPropietarioFijo()) {return verificarPinPropietarioIncrustado(pin);}
  const delEntorno = config.ownerPin ? String(config.ownerPin).trim() : '';
  if (delEntorno && igualesEnTiempoConstante(pin, delEntorno)) {return true;}
  const guardado = await pinGuardado();
  return Boolean(guardado.hash) && verifyPin(pin, guardado.hash);
}

export interface IInfoPinPropietario {
  configurado: boolean;
  longitudes: number[];
  /** Solo se informa (true) cuando el PIN está incrustado en el sistema: no se puede crear ni cambiar desde la interfaz. */
  fijo?: true;
}

/** Qué le muestra el teclado de acceso al propietario (público, como el propio login). */
export async function infoPinPropietario(): Promise<IInfoPinPropietario> {
  const fija = longitudPinPropietarioIncrustado();
  if (fija !== null) {return { configurado: true, longitudes: [fija], fijo: true };}
  const longitudes = new Set<number>();
  if (config.ownerPin && String(config.ownerPin).trim()) {longitudes.add(String(config.ownerPin).trim().length);}
  const guardado = await pinGuardado();
  if (guardado.hash) {longitudes.add(guardado.longitud);}
  return { configurado: longitudes.size > 0, longitudes: [...longitudes].sort((a, b) => a - b) };
}

/** ¿Falta definir el PIN del propietario? (solo en modo configurable) */
export async function pinPropietarioSinConfigurar(): Promise<boolean> {
  if (pinPropietarioFijo()) {return false;}
  const guardado = await pinGuardado();
  return !config.ownerPin && !guardado.hash;
}

export type ResultadoAccesoPropietario = 'DUENO_LOGIN_OK' | 'DUENO_LOGIN_FALLIDO';

/**
 * Deja constancia de un intento de entrar como propietario (auditoría + registro + aviso por Telegram si el bot
 * está activo). Nunca falla hacia el llamador: un fallo al auditar no debe impedir ni revelar nada del login.
 */
export async function registrarAccesoPropietario(params: {
  resultado: ResultadoAccesoPropietario;
  ip: string | null;
  agente: string | null;
  via: 'panel' | 'login-general';
}): Promise<void> {
  const { resultado, ip, agente, via } = params;
  const agenteCorto = String(agente || 'desconocido').slice(0, 160);
  logger.info({ action: resultado, details: { ip, via } });
  try {
    await runWithRequestContext({ platform: true }, () =>
      registrarAuditoria(getDatabase(), { usuarioId: null, accion: resultado, entidad: 'propietario', detalle: { via, agente: agenteCorto }, ip })
    );
  } catch (error) {
    logger.warn({ action: 'DUENO_AUDITORIA_FALLIDA', error: { message: error instanceof Error ? error.message : String(error) } });
  }
  notificarPropietario(
    resultado === 'DUENO_LOGIN_OK'
      ? `🔐 Acceso al panel del propietario\nIP: ${ip ?? 'desconocida'}\nNavegador: ${agenteCorto}`
      : `⚠️ PIN de propietario INCORRECTO\nIP: ${ip ?? 'desconocida'}\nNavegador: ${agenteCorto}`
  );
}
