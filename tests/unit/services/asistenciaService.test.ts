import { describe, it, expect } from 'vitest';
import {
  partesLocales,
  instanteLocal,
  turnoParaEntrada,
  minutosTarde,
  minutosSalidaAnticipada,
  minutosTrabajados,
  turnoOlvidado,
  salidaProgramada,
  etiquetaTurno,
  validarConfigTurnos,
  configTurnosDesdeBd,
  configTurnosAJson,
  construirTurnos,
  formatoHora,
  CONFIG_TURNOS_DEFECTO,
} from '../../../src/services/asistenciaService.js';

/** Construye un instante a partir de hora local de RD (UTC-4). */
const rd = (iso: string) => new Date(`${iso}-04:00`);

describe('partesLocales', () => {
  it('convierte UTC a hora local RD', () => {
    const p = partesLocales(new Date('2026-09-20T14:30:00Z'));
    expect(p).toEqual({ anio: 2026, mes: 9, dia: 20, minutosDelDia: 10 * 60 + 30 });
  });

  it('respeta el cambio de día local (00:30 RD = 04:30 UTC)', () => {
    const p = partesLocales(new Date('2026-09-21T04:30:00Z'));
    expect(p.dia).toBe(21);
    expect(p.minutosDelDia).toBe(30);
  });
});

describe('turnoParaEntrada', () => {
  it('asigna Turno 1 entre 9:30 a. m. y 4:29 p. m.', () => {
    expect(turnoParaEntrada(rd('2026-09-20T09:45:00'))).toBe('Turno 1');
    expect(turnoParaEntrada(rd('2026-09-20T10:00:00'))).toBe('Turno 1');
    expect(turnoParaEntrada(rd('2026-09-20T16:29:00'))).toBe('Turno 1');
  });

  it('asigna Turno 2 desde 4:30 p. m. hasta medianoche', () => {
    expect(turnoParaEntrada(rd('2026-09-20T16:30:00'))).toBe('Turno 2');
    expect(turnoParaEntrada(rd('2026-09-20T17:05:00'))).toBe('Turno 2');
    expect(turnoParaEntrada(rd('2026-09-20T23:59:00'))).toBe('Turno 2');
  });

  it('marca fuera de turno antes de 9:30 a. m.', () => {
    expect(turnoParaEntrada(rd('2026-09-20T08:00:00'))).toBe('Fuera de turno');
    expect(turnoParaEntrada(rd('2026-09-20T00:15:00'))).toBe('Fuera de turno');
  });
});

describe('minutosTarde', () => {
  it('no marca tardanza dentro de la tolerancia de 10 min', () => {
    expect(minutosTarde('Turno 1', rd('2026-09-20T10:10:00'))).toBe(0);
    expect(minutosTarde('Turno 1', rd('2026-09-20T09:50:00'))).toBe(0);
  });

  it('marca los minutos de retraso cuando excede la tolerancia', () => {
    expect(minutosTarde('Turno 1', rd('2026-09-20T10:25:00'))).toBe(25);
    expect(minutosTarde('Turno 2', rd('2026-09-20T17:40:00'))).toBe(40);
  });

  it('ignora turnos desconocidos', () => {
    expect(minutosTarde('Fuera de turno', rd('2026-09-20T08:00:00'))).toBe(0);
  });
});

describe('minutosSalidaAnticipada', () => {
  it('es 0 si sale a la hora o después', () => {
    expect(minutosSalidaAnticipada('Turno 1', rd('2026-09-20T10:00:00'), rd('2026-09-20T17:02:00'))).toBe(0);
    expect(minutosSalidaAnticipada('Turno 1', rd('2026-09-20T10:00:00'), rd('2026-09-20T16:55:00'))).toBe(0);
  });

  it('calcula minutos faltantes al salir antes', () => {
    expect(minutosSalidaAnticipada('Turno 1', rd('2026-09-20T10:00:00'), rd('2026-09-20T16:00:00'))).toBe(60);
  });

  it('el Turno 2 termina a medianoche (incluso al cruzar de día)', () => {
    const entrada = rd('2026-09-20T17:00:00');
    expect(minutosSalidaAnticipada('Turno 2', entrada, rd('2026-09-20T23:30:00'))).toBe(30);
    expect(minutosSalidaAnticipada('Turno 2', entrada, rd('2026-09-21T00:20:00'))).toBe(0);
  });
});

describe('minutosTrabajados / turnoOlvidado / salidaProgramada', () => {
  it('calcula la duración y nunca es negativa', () => {
    expect(minutosTrabajados(rd('2026-09-20T10:00:00'), rd('2026-09-20T17:00:00'))).toBe(420);
    expect(minutosTrabajados(rd('2026-09-20T17:00:00'), rd('2026-09-20T10:00:00'))).toBe(0);
  });

  it('detecta un turno abierto por más de 16 horas', () => {
    const entrada = rd('2026-09-20T10:00:00');
    expect(turnoOlvidado(entrada, rd('2026-09-20T20:00:00'))).toBe(false);
    expect(turnoOlvidado(entrada, rd('2026-09-21T03:00:00'))).toBe(true);
  });

  it('la salida programada coincide con el fin del turno', () => {
    expect(salidaProgramada('Turno 1', rd('2026-09-20T10:05:00')).toISOString()).toBe(instanteLocal(rd('2026-09-20T12:00:00'), 17 * 60).toISOString());
    expect(salidaProgramada('Turno 2', rd('2026-09-20T17:05:00')).toISOString()).toBe(new Date('2026-09-21T04:00:00Z').toISOString());
    expect(salidaProgramada('Fuera de turno', rd('2026-09-20T08:00:00')).getTime()).toBe(rd('2026-09-20T16:00:00').getTime());
  });

  it('etiqueta legible por turno', () => {
    expect(etiquetaTurno('Turno 1')).toContain('10:00');
    expect(etiquetaTurno('Turno 2')).toContain('12:00');
    expect(etiquetaTurno('Fuera de turno')).toContain('Fuera');
  });
});

describe('horarios de turno configurables', () => {
  const custom = validarConfigTurnos({
    turno1: { inicio: '08:00', fin: '15:00' },
    turno2: { inicio: '15:00', fin: '23:00' },
    tolerancia_min: 5,
    anticipacion_min: 15,
  });
  if (!('config' in custom)) {throw new Error('la configuración de prueba debe ser válida');}
  const cfg = custom.config;

  it('acepta horarios válidos y los serializa en formato HH:MM', () => {
    expect(configTurnosAJson(cfg)).toEqual({
      turno1: { inicio: '08:00', fin: '15:00' },
      turno2: { inicio: '15:00', fin: '23:00' },
      tolerancia_min: 5,
      anticipacion_min: 15,
    });
  });

  it('asigna la entrada al turno según los horarios propios', () => {
    expect(turnoParaEntrada(rd('2026-09-20T07:50:00'), cfg)).toBe('Turno 1');
    expect(turnoParaEntrada(rd('2026-09-20T14:50:00'), cfg)).toBe('Turno 2');
    expect(turnoParaEntrada(rd('2026-09-20T07:30:00'), cfg)).toBe('Fuera de turno');
    expect(turnoParaEntrada(rd('2026-09-20T23:30:00'), cfg)).toBe('Fuera de turno');
  });

  it('usa la tolerancia configurada para tardanza y salida anticipada', () => {
    expect(minutosTarde('Turno 1', rd('2026-09-20T08:06:00'), cfg)).toBe(6);
    expect(minutosTarde('Turno 1', rd('2026-09-20T08:05:00'), cfg)).toBe(0);
    expect(minutosSalidaAnticipada('Turno 1', rd('2026-09-20T08:00:00'), rd('2026-09-20T14:50:00'), cfg)).toBe(10);
  });

  it('etiqueta y salida programada siguen el horario configurado', () => {
    expect(etiquetaTurno('Turno 2', cfg)).toBe('3:00 p. m. – 11:00 p. m.');
    expect(salidaProgramada('Turno 1', rd('2026-09-20T08:00:00'), cfg).toISOString()).toBe(rd('2026-09-20T15:00:00').toISOString());
  });

  it('sin configuración usa los horarios por defecto', () => {
    expect(configTurnosDesdeBd(null)).toEqual(CONFIG_TURNOS_DEFECTO);
    expect(configTurnosDesdeBd({ turno1: { inicio: 'x' } })).toEqual(CONFIG_TURNOS_DEFECTO);
    expect(construirTurnos()[0].etiqueta).toBe('10:00 a. m. – 5:00 p. m.');
    expect(formatoHora(1440)).toBe('12:00 a. m.');
  });

  it('rechaza horarios inválidos', () => {
    const base = { turno1: { inicio: '10:00', fin: '17:00' }, turno2: { inicio: '17:00', fin: '24:00' } };
    expect('error' in validarConfigTurnos({ ...base, turno1: { inicio: '17:00', fin: '10:00' } })).toBe(true);
    expect('error' in validarConfigTurnos({ ...base, turno2: { inicio: '09:00', fin: '20:00' } })).toBe(true);
    expect('error' in validarConfigTurnos({ ...base, turno1: { inicio: '10:00', fin: '25:00' } })).toBe(true);
    expect('error' in validarConfigTurnos({ ...base, tolerancia_min: 90 })).toBe(true);
    expect('error' in validarConfigTurnos({ ...base, anticipacion_min: 700 })).toBe(true);
    expect('config' in validarConfigTurnos(base)).toBe(true);
  });
});
