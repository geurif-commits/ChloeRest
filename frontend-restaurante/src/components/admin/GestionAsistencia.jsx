import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Users, Clock, AlarmClockOff, Download, RefreshCw, Plus, Pencil, X, Search, LogIn, LogOut, Save
} from 'lucide-react';
import { obtenerSesion } from '../../api.js';
import { toastAviso, toastError, toastExito } from '../Toast.jsx';
import './asistencia.css';

const TZ = 'America/Santo_Domingo';
const OFFSET_MS = 4 * 3600_000;

const hoyRD = () => new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - OFFSET_MS - n * 86400_000).toISOString().slice(0, 10);

const fmtHora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }) : '—');
const fmtFecha = (iso) => new Date(iso).toLocaleDateString('es-DO', { weekday: 'short', day: '2-digit', month: 'short', timeZone: TZ });
const fmtDur = (min) => {
  if (min === null || min === undefined) return '—';
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};
/** ISO → valor de <input type="datetime-local"> en hora de RD. */
const aInputLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(0, 16) : '');
/** Valor de <input type="datetime-local"> (hora RD) → ISO. */
const deInputLocal = (valor) => (valor ? new Date(`${valor}:00-04:00`).toISOString() : null);
const iniciales = (n = '') => {
  const p = String(n).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
};

export default function GestionAsistencia({ apiUrl }) {
  const [desde, setDesde] = useState(() => haceDias(13));
  const [hasta, setHasta] = useState(hoyRD);
  const [empleadoId, setEmpleadoId] = useState('');
  const [turnoFiltro, setTurnoFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [registros, setRegistros] = useState([]);
  const [enTurno, setEnTurno] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const [edicion, setEdicion] = useState(null); // { id?, usuario_id, entrada, salida, notas }
  const [guardando, setGuardando] = useState(false);

  const headers = useCallback(() => ({ Authorization: `Bearer ${obtenerSesion()}`, 'Content-Type': 'application/json' }), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (empleadoId) params.set('usuario_id', empleadoId);
      const [rReg, rTurno] = await Promise.all([
        fetch(`${apiUrl}/api/asistencia?${params}`, { headers: headers() }),
        fetch(`${apiUrl}/api/asistencia/en-turno`, { headers: headers() }),
      ]);
      if (!rReg.ok) throw new Error('No se pudo cargar la asistencia.');
      const dReg = await rReg.json();
      setRegistros(dReg.registros || []);
      setEnTurno(rTurno.ok ? await rTurno.json() : []);
    } catch (e) {
      toastError(e.message || 'Error de conexión.');
    } finally {
      setCargando(false);
    }
  }, [apiUrl, desde, hasta, empleadoId, headers]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    fetch(`${apiUrl}/api/usuarios`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEmpleados(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [apiUrl, headers]);

  // Reloj para la duración en vivo de quienes siguen en turno.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return registros.filter((r) => (turnoFiltro === 'todos' || r.turno === turnoFiltro) && (!q || r.usuario_nombre.toLowerCase().includes(q)));
  }, [registros, turnoFiltro, busqueda]);

  const resumenEmpleados = useMemo(() => {
    const mapa = new Map();
    filtrados.forEach((r) => {
      const x = mapa.get(r.usuario_id) || { id: r.usuario_id, nombre: r.usuario_nombre, rol: r.usuario_rol, minutos: 0, turnos: 0, tardes: 0 };
      x.turnos += 1;
      x.minutos += r.minutos_trabajados ?? Math.max(0, Math.round((ahora - new Date(r.entrada).getTime()) / 60000));
      if (r.minutos_tarde > 0) x.tardes += 1;
      mapa.set(r.usuario_id, x);
    });
    return [...mapa.values()].sort((a, b) => b.minutos - a.minutos);
  }, [filtrados, ahora]);

  const kpis = useMemo(() => ({
    enTurno: enTurno.length,
    registros: filtrados.length,
    minutos: resumenEmpleados.reduce((s, e) => s + e.minutos, 0),
    tardes: filtrados.filter((r) => r.minutos_tarde > 0).length,
  }), [enTurno, filtrados, resumenEmpleados]);

  const exportarCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [['Empleado', 'Rol', 'Fecha', 'Turno', 'Entrada', 'Salida', 'Minutos trabajados', 'Minutos tarde', 'Salida anticipada (min)', 'Autocerrado', 'Editado', 'Notas']];
    filtrados.forEach((r) => filas.push([
      r.usuario_nombre, r.usuario_rol, new Date(r.entrada).toLocaleDateString('es-DO', { timeZone: TZ }), r.turno,
      fmtHora(r.entrada), r.salida ? fmtHora(r.salida) : 'En turno', r.minutos_trabajados ?? '', r.minutos_tarde || 0,
      r.minutos_salida_anticipada || 0, r.cerrado_auto ? 'Sí' : 'No', r.editado ? 'Sí' : 'No', r.notas || '',
    ]));
    const blob = new Blob(['﻿' + filas.map((f) => f.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asistencia_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const abrirNuevo = () => setEdicion({ usuario_id: empleados[0]?.id || '', entrada: '', salida: '', notas: '' });
  const abrirEdicion = (r) => setEdicion({ id: r.id, usuario_id: r.usuario_id, nombre: r.usuario_nombre, entrada: aInputLocal(r.entrada), salida: aInputLocal(r.salida), notas: '' });

  const guardar = async (e) => {
    e.preventDefault();
    if (guardando) return;
    if (!edicion.entrada) return toastAviso('Indica la hora de entrada.');
    if (!edicion.notas.trim()) return toastAviso('Escribe el motivo del cambio.');
    setGuardando(true);
    try {
      const cuerpo = { usuario_id: Number(edicion.usuario_id), entrada: deInputLocal(edicion.entrada), salida: deInputLocal(edicion.salida), notas: edicion.notas.trim() };
      const res = await fetch(edicion.id ? `${apiUrl}/api/asistencia/${edicion.id}` : `${apiUrl}/api/asistencia/manual`, {
        method: edicion.id ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(cuerpo),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      toastExito(data.mensaje || 'Guardado.');
      setEdicion(null);
      cargar();
    } catch (err) {
      toastError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="as">
      {/* ── KPIs ── */}
      <section className="as-kpis">
        <div className="as-kpi as-kpi--live"><span className="as-kpi__ico"><Users size={18} /></span><div><small>En turno ahora</small><strong>{kpis.enTurno}</strong></div></div>
        <div className="as-kpi"><span className="as-kpi__ico"><CalendarClock size={18} /></span><div><small>Turnos del período</small><strong>{kpis.registros}</strong></div></div>
        <div className="as-kpi"><span className="as-kpi__ico"><Clock size={18} /></span><div><small>Horas trabajadas</small><strong>{(kpis.minutos / 60).toFixed(1)}</strong></div></div>
        <div className="as-kpi"><span className="as-kpi__ico as-kpi__ico--warn"><AlarmClockOff size={18} /></span><div><small>Tardanzas</small><strong>{kpis.tardes}</strong></div></div>
      </section>

      {/* ── En turno ahora ── */}
      <section className="as-card">
        <div className="as-card__head">
          <div><span className="px-eyebrow">Tiempo real</span><h3>En turno ahora</h3></div>
          <span className="as-legend">Turno 1 · 10:00 a. m. – 5:00 p. m. &nbsp;|&nbsp; Turno 2 · 5:00 p. m. – 12:00 a. m.</span>
        </div>
        {enTurno.length === 0 ? (
          <p className="as-empty">Nadie ha marcado entrada todavía. Los empleados registran su turno desde la pantalla de ingreso, en “Marcar turno”.</p>
        ) : (
          <div className="as-live">
            {enTurno.map((r) => (
              <div key={r.id} className="as-person">
                <span className="as-avatar">{iniciales(r.usuario_nombre)}<i /></span>
                <div>
                  <strong>{r.usuario_nombre}</strong>
                  <small>{r.usuario_rol} · {r.turno}</small>
                  <em>Desde {fmtHora(r.entrada)} · {fmtDur((ahora - new Date(r.entrada).getTime()) / 60000)}</em>
                </div>
                {r.minutos_tarde > 0 && <span className="as-chip as-chip--warn">Tarde {fmtDur(r.minutos_tarde)}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Filtros ── */}
      <section className="as-card">
        <div className="as-filters">
          <label><span>Desde</span><input className="po-input" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label><span>Hasta</span><input className="po-input" type="date" value={hasta} min={desde} max={hoyRD()} onChange={(e) => setHasta(e.target.value)} /></label>
          <label><span>Empleado</span>
            <select className="po-input" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
              <option value="">Todos</option>
              {empleados.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label><span>Turno</span>
            <select className="po-input" value={turnoFiltro} onChange={(e) => setTurnoFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="Turno 1">Turno 1 (10–5)</option>
              <option value="Turno 2">Turno 2 (5–12)</option>
              <option value="Fuera de turno">Fuera de turno</option>
            </select>
          </label>
          <label className="as-search"><span>Buscar</span>
            <div><Search size={16} /><input className="po-input" placeholder="Nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>
          </label>
        </div>
        <div className="as-actions">
          <button type="button" className="px-btn" onClick={cargar} disabled={cargando}><RefreshCw size={16} className={cargando ? 'px-spin' : ''} /> Actualizar</button>
          <button type="button" className="px-btn" onClick={exportarCsv} disabled={!filtrados.length}><Download size={16} /> Exportar CSV</button>
          <button type="button" className="px-btn px-btn--gold" onClick={abrirNuevo}><Plus size={16} /> Registro manual</button>
        </div>
      </section>

      {/* ── Resumen por empleado ── */}
      {resumenEmpleados.length > 0 && (
        <section className="as-card">
          <div className="as-card__head"><div><span className="px-eyebrow">Período</span><h3>Horas por empleado</h3></div></div>
          <div className="as-summary">
            {resumenEmpleados.map((e) => (
              <div key={e.id} className="as-sum">
                <span className="as-avatar">{iniciales(e.nombre)}</span>
                <div><strong>{e.nombre}</strong><small>{e.rol}</small></div>
                <div className="as-sum__nums"><b>{fmtDur(e.minutos)}</b><small>{e.turnos} turno{e.turnos === 1 ? '' : 's'}{e.tardes ? ` · ${e.tardes} tarde${e.tardes === 1 ? '' : 's'}` : ''}</small></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Historial ── */}
      <section className="as-card as-card--flush">
        <div className="as-card__head as-card__head--pad"><div><span className="px-eyebrow">Detalle</span><h3>Registro de turnos</h3></div></div>
        <div className="as-table-wrap">
          <table className="as-table">
            <thead>
              <tr><th>Empleado</th><th>Fecha</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Trabajado</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={8} className="as-empty">{cargando ? 'Cargando…' : 'No hay turnos registrados en este período.'}</td></tr>
              )}
              {filtrados.map((r) => (
                <tr key={r.id}>
                  <td><div className="as-cell-user"><span className="as-avatar as-avatar--sm">{iniciales(r.usuario_nombre)}</span><div><strong>{r.usuario_nombre}</strong><small>{r.usuario_rol}</small></div></div></td>
                  <td>{fmtFecha(r.entrada)}</td>
                  <td><span className={`as-turno as-turno--${r.turno === 'Turno 1' ? '1' : r.turno === 'Turno 2' ? '2' : 'x'}`}>{r.turno}</span></td>
                  <td><span className="as-io"><LogIn size={13} />{fmtHora(r.entrada)}</span></td>
                  <td>{r.salida ? <span className="as-io"><LogOut size={13} />{fmtHora(r.salida)}</span> : <span className="as-chip as-chip--ok">En turno</span>}</td>
                  <td className="as-num">{r.salida ? fmtDur(r.minutos_trabajados) : fmtDur((ahora - new Date(r.entrada).getTime()) / 60000)}</td>
                  <td>
                    <div className="as-flags">
                      {r.minutos_tarde > 0 && <span className="as-chip as-chip--warn">Tarde {fmtDur(r.minutos_tarde)}</span>}
                      {r.minutos_salida_anticipada > 0 && <span className="as-chip as-chip--warn">Salió {fmtDur(r.minutos_salida_anticipada)} antes</span>}
                      {r.cerrado_auto && <span className="as-chip as-chip--bad" title="No marcó salida; el sistema cerró el turno">Sin salida</span>}
                      {r.editado && <span className="as-chip" title={r.notas || ''}>Editado</span>}
                    </div>
                  </td>
                  <td><button type="button" className="as-icon-btn" onClick={() => abrirEdicion(r)} aria-label="Corregir registro" title="Corregir"><Pencil size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Modal de corrección / registro manual ── */}
      {edicion && (
        <div className="po-modal" role="dialog" aria-modal="true" onClick={() => !guardando && setEdicion(null)}>
          <form className="po-modal__card" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
            <div className="po-modal__head">
              <div><span className="px-eyebrow">{edicion.id ? 'Corrección auditada' : 'Registro manual'}</span><h3>{edicion.id ? edicion.nombre : 'Nuevo turno'}</h3></div>
              <button type="button" className="px-btn px-btn--icon px-btn--sm" onClick={() => setEdicion(null)} aria-label="Cerrar"><X size={16} /></button>
            </div>
            {!edicion.id && (
              <div className="po-field"><label htmlFor="as-emp">Empleado</label>
                <select id="as-emp" className="po-input" value={edicion.usuario_id} onChange={(e) => setEdicion({ ...edicion, usuario_id: e.target.value })}>
                  {empleados.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}
                </select>
              </div>
            )}
            <div className="as-two">
              <div className="po-field"><label htmlFor="as-ent">Entrada</label><input id="as-ent" className="po-input" type="datetime-local" value={edicion.entrada} onChange={(e) => setEdicion({ ...edicion, entrada: e.target.value })} required /></div>
              <div className="po-field"><label htmlFor="as-sal">Salida</label><input id="as-sal" className="po-input" type="datetime-local" value={edicion.salida} onChange={(e) => setEdicion({ ...edicion, salida: e.target.value })} /></div>
            </div>
            <div className="po-field"><label htmlFor="as-nota">Motivo del cambio</label><input id="as-nota" className="po-input" value={edicion.notas} onChange={(e) => setEdicion({ ...edicion, notas: e.target.value })} placeholder="Ej: olvidó marcar la salida" maxLength={300} required /></div>
            <div className="po-modal__actions">
              <button type="button" className="px-btn px-btn--lg" onClick={() => setEdicion(null)} disabled={guardando}>Cancelar</button>
              <button type="submit" className="px-btn px-btn--gold px-btn--lg" disabled={guardando}><Save size={17} />{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
