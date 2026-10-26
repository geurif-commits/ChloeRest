import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Minus, History, Monitor } from 'lucide-react';
import { toastAviso } from '../Toast.jsx';
import './LicenciaCupoModal.css';

const LIMITE_EQUIPOS = 50;

const ETIQUETA_CAMPO = {
  max_dispositivos: 'Equipos permitidos',
  dispositivo_desactivado: 'Equipo desactivado',
};

const fechaHora = (valor) => {
  if (!valor) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '—' : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const valorLegible = (valor) => (valor === null || valor === undefined || valor === '' ? '—' : String(valor));

function Contador({ etiqueta, valor, minimo, maximo, onChange, ayuda }) {
  const cambiar = (siguiente) => onChange(Math.min(maximo, Math.max(minimo, siguiente)));
  return (
    <div className="lcm-campo">
      <span className="lcm-etiqueta">{etiqueta}</span>
      <div className="lcm-contador" role="group" aria-label={etiqueta}>
        <button type="button" className="lcm-paso" onClick={() => cambiar(valor - 1)} disabled={valor <= minimo} aria-label={`Menos: ${etiqueta}`}><Minus size={16} /></button>
        <input
          type="number" inputMode="numeric" min={minimo} max={maximo} value={valor}
          aria-label={etiqueta}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) cambiar(Math.trunc(n)); }}
        />
        <button type="button" className="lcm-paso" onClick={() => cambiar(valor + 1)} disabled={valor >= maximo} aria-label={`Más: ${etiqueta}`}><Plus size={16} /></button>
      </div>
      {ayuda && <span className="lcm-ayuda">{ayuda}</span>}
    </div>
  );
}

/**
 * Panel del propietario para UNA licencia ya en uso: cuántos equipos activos permite y el historial de cambios
 * (con motivo). Un cliente con más de una caja, una tablet o una pantalla de cocina necesita más de 2.
 */
export default function LicenciaCupoModal({ apiUrl, token, licencia, alCerrar, alCambiar }) {
  const [maxEquipos, setMaxEquipos] = useState(Number(licencia.max_dispositivos) || 2);
  const [motivo, setMotivo] = useState('');
  const [equipos, setEquipos] = useState([]);
  const [elegidos, setElegidos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const dialogo = useRef(null);

  const cabeceras = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const nombre = licencia.nombre_negocio || licencia.empresa_nombre || `Licencia #${licencia.id}`;
  const base = `${apiUrl}/api/dueno/licencias/${licencia.id}`;

  const llamar = useCallback(async (metodo, url, cuerpo) => {
    const res = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    let datos = {};
    try { datos = await res.json(); } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, datos };
  }, [cabeceras]);

  const cargar = useCallback(async () => {
    try {
      const [dispositivos, hist] = await Promise.all([
        llamar('GET', `${apiUrl}/api/dispositivos`),
        llamar('GET', `${base}/historial`),
      ]);
      if (dispositivos.ok) {
        setEquipos((dispositivos.datos.dispositivos || []).filter((d) => d.estado === 'Activo' && d.clave_activacion === licencia.clave));
      }
      if (hist.ok) setHistorial(hist.datos.historial || []);
    } catch {
      setError('No se pudo cargar el detalle de la licencia. Revisa la conexión.');
    }
  }, [apiUrl, base, llamar, licencia.clave]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    dialogo.current?.focus();
    const alTeclear = (e) => { if (e.key === 'Escape') alCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [alCerrar]);

  const activos = equipos.length;
  const sobran = Math.max(0, activos - maxEquipos);
  const cambio = maxEquipos !== Number(licencia.max_dispositivos);
  const motivoValido = motivo.trim().length >= 3;
  const faltanPorElegir = Math.max(0, sobran - elegidos.length);
  const puedeGuardar = cambio && motivoValido && elegidos.length >= sobran && !ocupado;

  // Si se sube el cupo ya no hace falta desactivar nada; si se recorta, la selección se ajusta.
  useEffect(() => { setElegidos((actual) => (actual.length > sobran ? actual.slice(0, sobran) : actual)); }, [sobran]);

  const alternar = (id) => setElegidos((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : (actual.length < sobran ? [...actual, id] : actual)));

  const guardar = async () => {
    setError('');
    setOcupado(true);
    try {
      const r = await llamar('PUT', `${base}/cupo`, { max_dispositivos: maxEquipos, motivo: motivo.trim(), desactivar: elegidos });
      if (!r.ok) { setError(r.datos.error || 'No se pudo cambiar el cupo.'); return; }
      const quitados = (r.datos.desactivados || []).length;
      toastAviso(quitados ? `✅ Cupo actualizado; se desactivaron ${quitados} equipo(s).` : '✅ Cupo de la licencia actualizado.');
      setMotivo('');
      setElegidos([]);
      await cargar();
      alCambiar?.();
    } catch {
      setError('No se pudo conectar para guardar el cambio.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="lcm-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="lcm-dialogo" role="dialog" aria-modal="true" aria-labelledby="lcm-titulo" tabIndex={-1} ref={dialogo}>
        <header className="lcm-cabecera">
          <div>
            <h3 id="lcm-titulo">Equipos de la licencia</h3>
            <p>{nombre} · <span className="lcm-clave">{licencia.clave}</span></p>
          </div>
          <button type="button" className="lcm-cerrar" onClick={alCerrar} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="lcm-cuerpo">
          {error && <div className="lcm-error" role="alert">{error}</div>}

          <section className="lcm-seccion" aria-labelledby="lcm-cupo">
            <h4 id="lcm-cupo"><Monitor size={16} /> Cupo de esta licencia</h4>
            <Contador
              etiqueta="Equipos activos permitidos" valor={maxEquipos} minimo={1} maximo={LIMITE_EQUIPOS} onChange={setMaxEquipos}
              ayuda={`Hoy: ${activos} en uso`}
            />

            {sobran > 0 && (
              <div className="lcm-aviso" role="group" aria-label="Equipos a desactivar">
                <strong>Con {maxEquipos} {maxEquipos === 1 ? 'equipo' : 'equipos'} sobran {sobran}.</strong> Elige cuál{sobran === 1 ? '' : 'es'} desactivar
                {faltanPorElegir > 0 ? ` (faltan ${faltanPorElegir})` : ' ✓'}:
                <ul className="lcm-lista-equipos">
                  {equipos.map((d) => {
                    const marcado = elegidos.includes(d.id);
                    return (
                      <li key={d.id}>
                        <label>
                          <input type="checkbox" checked={marcado} onChange={() => alternar(d.id)} disabled={!marcado && elegidos.length >= sobran} />
                          <span>{d.nombre || d.device_id}</span>
                          {d.nombre && d.nombre !== d.device_id && <small>{d.device_id}</small>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <label className="lcm-campo" htmlFor="lcm-motivo">
              <span className="lcm-etiqueta">Motivo del cambio (obligatorio, queda en el historial)</span>
              <textarea id="lcm-motivo" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente abrió una segunda caja; pago de ampliación recibido" />
            </label>
            <div className="lcm-acciones">
              <button type="button" className="lcm-boton primario" onClick={guardar} disabled={!puedeGuardar}>
                {ocupado ? 'Guardando…' : 'Guardar cambio de cupo'}
              </button>
              {!cambio && <small>Cambia el número para poder guardar.</small>}
              {cambio && !motivoValido && <small>Escribe el motivo (mínimo 3 letras).</small>}
            </div>
          </section>

          <section className="lcm-seccion" aria-labelledby="lcm-historial">
            <h4 id="lcm-historial"><History size={16} /> Historial de cambios</h4>
            {historial.length === 0 ? (
              <p className="lcm-texto">Esta licencia no tiene cambios registrados todavía.</p>
            ) : (
              <ul className="lcm-historial">
                {historial.map((h) => (
                  <li key={h.id}>
                    <div>
                      <strong>{ETIQUETA_CAMPO[h.campo] || h.campo}</strong>
                      {h.campo === 'dispositivo_desactivado'
                        ? <span className="lcm-cambio">{valorLegible(h.valor_nuevo)}</span>
                        : <span className="lcm-cambio">{valorLegible(h.valor_anterior)} → {valorLegible(h.valor_nuevo)}</span>}
                    </div>
                    <small>{fechaHora(h.creado_en)} · {h.actor}{h.motivo ? ` · ${h.motivo}` : ''}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
