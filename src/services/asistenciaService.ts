/**
 * @file Reglas de turnos y asistencia del personal (funciones puras, sin BD).
 *
 * Los horarios son configurables por negocio (configuracion_sistema.turnos_config). Por defecto,
 * en hora de República Dominicana (UTC-4 sin horario de verano):
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

/** Configuración de turnos de un negocio. Todo en minutos desde las 00:00 locales. */
export interface IConfigTurnos {
  turno1: { inicioMin: number; finMin: number };
  turno2: { inicioMin: number; finMin: number };
  /** Minutos de gracia para no marcar tardanza / salida anticipada. */
  toleranciaMin: number;
  /** Minutos antes del inicio de cada turno desde los que ya se acepta la entrada. */
  anticipacionMin: number;
}

/** Offset fijo de la zona horaria (America/Santo_Domingo = UTC-4, sin DST). */
export const OFFSET_HORAS = 4;
/** Un turno abierto por más de estas horas se considera olvidado y se cierra solo. */
export const HORAS_MAX_TURNO_ABIERTO = 16;
/** Evita marcar salida por error justo después de la entrada. */
export const SEGUNDOS_MIN_ENTRE_MARCAS = 60;

export const CONFIG_TURNOS_DEFECTO: IConfigTurnos = {
  turno1: { inicioMin: 10 * 60, finMin: 17 * 60 },
  turno2: { inicioMin: 17 * 60, finMin: 24 * 60 },
  toleranciaMin: 10,
  anticipacionMin: 30,
};

/** "10:00 a. m." a partir de minutos del día (1440 = medianoche de cierre). */
export function formatoHora(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const sufijo = h24 < 12 ? 'a. m.' : 'p. m.';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${sufijo}`;
}

/** "HH:MM" → minutos; acepta "24:00" como fin del día. */
export function horaAMinutos(valor: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor ?? '').trim());
  if (!m) {return null;}
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) {return null;}
  return h * 60 + min;
}

export function minutosAHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/**
 * Valida y normaliza la configuración recibida ({ turno1: { inicio, fin }, turno2: {...}, tolerancia_min,
 * anticipacion_min }). Devuelve el mensaje de error si no es válida.
 * Reglas: los dos turnos ocurren dentro del mismo día; el Turno 1 empieza antes que el Turno 2.
 */
export function validarConfigTurnos(raw: unknown): { config: IConfigTurnos } | { error: string } {
  const r = (raw ?? {}) as Record<string, Record<string, unknown> | unknown>;
  const t1 = (r.turno1 ?? {}) as Record<string, unknown>;
  const t2 = (r.turno2 ?? {}) as Record<string, unknown>;
  const i1 = horaAMinutos(t1.inicio);
  const f1 = horaAMinutos(t1.fin);
  const i2 = horaAMinutos(t2.inicio);
  const f2 = horaAMinutos(t2.fin);
  if (i1 === null || f1 === null || i2 === null || f2 === null) {
    return { error: 'Las horas deben tener el formato HH:MM (por ejemplo 10:00).' };
  }
  if (f1 <= i1) {return { error: 'El Turno 1 debe terminar después de su hora de inicio.' };}
  if (f2 <= i2) {return { error: 'El Turno 2 debe terminar después de su hora de inicio (usa 24:00 para medianoche).' };}
  if (i2 <= i1) {return { error: 'El Turno 2 debe empezar después del inicio del Turno 1.' };}
  if (f2 < f1) {return { error: 'El Turno 2 no puede terminar antes que el Turno 1.' };}
  const tolerancia = Number(r.tolerancia_min ?? CONFIG_TURNOS_DEFECTO.toleranciaMin);
  const anticipacion = Number(r.anticipacion_min ?? CONFIG_TURNOS_DEFECTO.anticipacionMin);
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 60) {
    return { error: 'La tolerancia debe ser un número entero de 0 a 60 minutos.' };
  }
  if (!Number.isInteger(anticipacion) || anticipacion < 0 || anticipacion > 120) {
    return { error: 'La anticipación debe ser un número entero de 0 a 120 minutos.' };
  }
  if (i1 - anticipacion < 0) {return { error: 'La anticipación no puede llevar la entrada del Turno 1 antes de las 00:00.' };}
  return {
    config: {
      turno1: { inicioMin: i1, finMin: f1 },
      turno2: { inicioMin: i2, finMin: f2 },
      toleranciaMin: tolerancia,
      anticipacionMin: anticipacion,
    },
  };
}

/** Lee lo guardado en BD (JSON con horas "HH:MM"); si falta o es inválido usa los horarios por defecto. */
export function configTurnosDesdeBd(guardado: unknown): IConfigTurnos {
  const res = validarConfigTurnos(guardado);
  return 'config' in res ? res.config : CONFIG_TURNOS_DEFECTO;
}

/** Formato de almacenamiento / API. */
export function configTurnosAJson(cfg: IConfigTurnos): Record<string, unknown> {
  return {
    turno1: { inicio: minutosAHora(cfg.turno1.inicioMin), fin: minutosAHora(cfg.turno1.finMin) },
    turno2: { inicio: minutosAHora(cfg.turno2.inicioMin), fin: minutosAHora(cfg.turno2.finMin) },
    tolerancia_min: cfg.toleranciaMin,
    anticipacion_min: cfg.anticipacionMin,
  };
}

/** Definiciones de turno (con ventanas de entrada) para una configuración. */
export function construirTurnos(cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): readonly ITurnoDef[] {
  const { turno1, turno2, anticipacionMin } = cfg;
  const corte = turno2.inicioMin - anticipacionMin;
  return [
    {
      id: 'Turno 1',
      etiqueta: `${formatoHora(turno1.inicioMin)} – ${formatoHora(turno1.finMin)}`,
      inicioMin: turno1.inicioMin,
      finMin: turno1.finMin,
      ventanaDesdeMin: turno1.inicioMin - anticipacionMin,
      ventanaHastaMin: corte,
    },
    {
      id: 'Turno 2',
      etiqueta: `${formatoHora(turno2.inicioMin)} – ${formatoHora(turno2.finMin)}`,
      inicioMin: turno2.inicioMin,
      finMin: turno2.finMin,
      ventanaDesdeMin: corte,
      ventanaHastaMin: turno2.finMin,
    },
  ];
}

/** Turnos con los horarios por defecto (compatibilidad). */
export const TURNOS: readonly ITurnoDef[] = construirTurnos(CONFIG_TURNOS_DEFECTO);

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

export function definicionTurno(nombre: string, cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): ITurnoDef | undefined {
  return construirTurnos(cfg).find((t) => t.id === nombre);
}

/** Turno al que pertenece una entrada según la hora local. */
export function turnoParaEntrada(fecha: Date, cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): NombreTurno {
  const { minutosDelDia } = partesLocales(fecha);
  const turno = construirTurnos(cfg).find((t) => minutosDelDia >= t.ventanaDesdeMin && minutosDelDia < t.ventanaHastaMin);
  return turno ? turno.id : 'Fuera de turno';
}

/** Minutos de tardanza (0 si llegó dentro de la tolerancia o el turno no aplica). */
export function minutosTarde(turno: string, entrada: Date, cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): number {
  const def = definicionTurno(turno, cfg);
  if (!def) {return 0;}
  const retraso = Math.round((entrada.getTime() - instanteLocal(entrada, def.inicioMin).getTime()) / 60_000);
  return retraso > cfg.toleranciaMin ? retraso : 0;
}

/** Minutos que faltaban para el fin del turno al marcar salida (0 si salió a tiempo). */
export function minutosSalidaAnticipada(turno: string, entrada: Date, salida: Date, cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): number {
  const def = definicionTurno(turno, cfg);
  if (!def) {return 0;}
  const fin = instanteLocal(entrada, def.finMin);
  const faltante = Math.round((fin.getTime() - salida.getTime()) / 60_000);
  return faltante > cfg.toleranciaMin ? faltante : 0;
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
export function salidaProgramada(turno: string, entrada: Date, cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): Date {
  const def = definicionTurno(turno, cfg);
  return def ? instanteLocal(entrada, def.finMin) : new Date(entrada.getTime() + 8 * 3600_000);
}

export function etiquetaTurno(turno: string, cfg: IConfigTurnos = CONFIG_TURNOS_DEFECTO): string {
  return definicionTurno(turno, cfg)?.etiqueta ?? 'Fuera del horario regular';
}
