/** Horarios de turno (Turno 1 y Turno 2). Se configuran en Administración → Turnos y Asistencia. */
export const HORARIOS_DEFECTO = {
  turno1: { inicio: '10:00', fin: '17:00' },
  turno2: { inicio: '17:00', fin: '24:00' },
  tolerancia_min: 10,
  anticipacion_min: 30,
};

const aMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

/** "17:00" → "5:00 p. m." (24:00 = medianoche). */
export function hora12(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const h24 = h % 24;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(m || 0).padStart(2, '0')} ${h24 < 12 ? 'a. m.' : 'p. m.'}`;
}

export const rango = (t) => `${hora12(t.inicio)} – ${hora12(t.fin)}`;

/** Configuración válida a partir de lo que devuelve el servidor (o los valores por defecto). */
export function horariosDe(cfg) {
  return cfg?.turno1?.inicio && cfg?.turno2?.inicio ? cfg : HORARIOS_DEFECTO;
}

/** Turno que se asignaría a una entrada marcada ahora (mismas ventanas que el servidor). */
export function turnoVigente(fecha, cfg) {
  const h = horariosDe(cfg);
  const min = fecha.getHours() * 60 + fecha.getMinutes();
  const ant = Number(h.anticipacion_min ?? 30);
  const corte = aMin(h.turno2.inicio) - ant;
  if (min >= aMin(h.turno1.inicio) - ant && min < corte) return { nombre: 'Turno 1', rango: rango(h.turno1) };
  if (min >= corte && min < aMin(h.turno2.fin)) return { nombre: 'Turno 2', rango: rango(h.turno2) };
  return { nombre: 'Fuera de horario', rango: `Turnos desde las ${hora12(h.turno1.inicio)}` };
}
