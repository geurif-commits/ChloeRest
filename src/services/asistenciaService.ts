/**
 * @file Reglas de turnos y asistencia del personal (funciones puras, sin BD).
 *
 * Turnos del restaurante (hora de República Dominicana, UTC-4 sin horario de verano):
 *   - Turno 1: 10:00 a. m. – 5:00 p. m.
 *   - Turno 2: 5:00 p. m. – 12:00 a. m.
 */

export type NombreTurno = 'Turno 1' | 'Turno 2' | 'Fuera de turno';

export interface ITurnoDef {
  id: Exclude<NombreTurno, 'Fuera de turno'>;
  etiqueta: string;
  /** Minutos desde las 00:00 locales. */
  inicioMin: number;
  finMin: number;
  /** Ventana (minutos del día) en la que una entrada se asigna a este turno. */
  ventanaDesdeMin: number;
  ventanaHastaMin: number;
}

/** Offset fijo de la zona horaria (America/Santo_Domingo = UTC-4, sin DST). */
export const OFFSET_HORAS = 4;
/** Minutos de gracia para no marcar tardanza. */
export const TOLERANCIA_TARDE_MIN = 10;
/** Minutos de gracia para no marcar salida anticipada. */
export const TOLERANCIA_SALIDA_MIN = 10;
/** Un turno abierto por más de estas horas se considera olvidado y se cierra solo. */
export const HORAS_MAX_TURNO_ABIERTO = 16;
/** Evita marcar salida por error justo después de la entrada. */
export const SEGUNDOS_MIN_ENTRE_MARCAS = 60;

export const TURNOS: readonly ITurnoDef[] = [
  { id: 'Turno 1', etiqueta: '10:00 a. m. – 5:00 p. m.', inicioMin: 10 * 60, finMin: 17 * 60, ventanaDesdeMin: 9 * 60 + 30, ventanaHastaMin: 16 * 60 + 30 },
  { id: 'Turno 2', etiqueta: '5:00 p. m. – 12:00 a. m.', inicioMin: 17 * 60, finMin: 24 * 60, ventanaDesdeMin: 16 * 60 + 30, ventanaHastaMin: 24 * 60 },
];

export interface IPartesLocales {
  anio: number;
  mes: number;
  dia: number;
  minutosDelDia: number;
}

/** Fecha/hora local (RD) de un instante UTC. */
export function partesLocales(fecha: Date): IPartesLocales {
  const local = new Date(fecha.getTime() - OFFSET_HORAS * 3600_000);
  return {
    anio: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
    minutosDelDia: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** Instante UTC correspondiente a `minutos` desde las 00:00 locales del día de `fecha`. */
export function instanteLocal(fecha: Date, minutos: number): Date {
  const p = partesLocales(fecha);
  return new Date(Date.UTC(p.anio, p.mes - 1, p.dia, 0, 0) + OFFSET_HORAS * 3600_000 + minutos * 60_000);
}

export function definicionTurno(nombre: string): ITurnoDef | undefined {
  return TURNOS.find((t) => t.id === nombre);
}

/** Turno al que pertenece una entrada según la hora local. */
export function turnoParaEntrada(fecha: Date): NombreTurno {
  const { minutosDelDia } = partesLocales(fecha);
  const turno = TURNOS.find((t) => minutosDelDia >= t.ventanaDesdeMin && minutosDelDia < t.ventanaHastaMin);
  return turno ? turno.id : 'Fuera de turno';
}

/** Minutos de tardanza (0 si llegó dentro de la tolerancia o el turno no aplica). */
export function minutosTarde(turno: string, entrada: Date): number {
  const def = definicionTurno(turno);
  if (!def) {return 0;}
  const retraso = Math.round((entrada.getTime() - instanteLocal(entrada, def.inicioMin).getTime()) / 60_000);
  return retraso > TOLERANCIA_TARDE_MIN ? retraso : 0;
}

/** Minutos que faltaban para el fin del turno al marcar salida (0 si salió a tiempo). */
export function minutosSalidaAnticipada(turno: string, entrada: Date, salida: Date): number {
  const def = definicionTurno(turno);
  if (!def) {return 0;}
  const fin = instanteLocal(entrada, def.finMin);
  const faltante = Math.round((fin.getTime() - salida.getTime()) / 60_000);
  return faltante > TOLERANCIA_SALIDA_MIN ? faltante : 0;
}

/** Duración trabajada en minutos (nunca negativa). */
export function minutosTrabajados(entrada: Date, salida: Date): number {
  return Math.max(0, Math.round((salida.getTime() - entrada.getTime()) / 60_000));
}

/** ¿Quedó abierto de más? (turno olvidado) */
export function turnoOlvidado(entrada: Date, ahora: Date): boolean {
  return ahora.getTime() - entrada.getTime() > HORAS_MAX_TURNO_ABIERTO * 3600_000;
}

/** Salida programada de un turno abierto (para autocierre). Sin turno: entrada + 8 h. */
export function salidaProgramada(turno: string, entrada: Date): Date {
  const def = definicionTurno(turno);
  return def ? instanteLocal(entrada, def.finMin) : new Date(entrada.getTime() + 8 * 3600_000);
}

export function etiquetaTurno(turno: string): string {
  return definicionTurno(turno)?.etiqueta ?? 'Fuera del horario regular';
}
