import { useState, useEffect, useMemo } from 'react';
import MenuPedido from '../components/MenuPedido';
import { toastAviso } from '../components/Toast.jsx';
import { obtenerSesion, obtenerTicketSse } from '../api.js';
import {
  TableProperties, Search, ArrowRightLeft, LogOut, RefreshCw, Lock, X, Delete, Check, Users, Clock, ChefHat, CalendarClock, Sun, Moon
} from 'lucide-react';
import { useTemaLocal } from '../utils/tema.js';
import './mapa-mesas.css';

const ESTADO_CLAVE = { Disponible: 'libre', Ocupada: 'ocupada', Reservada: 'reservada' };

function inicialesDe(nombre = '') {
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
}

const LIMITE_MESA_LARGA = 60; // minutos

function formatearMinutos(m = 0) {
  const t = Math.max(0, Math.round(Number(m) || 0));
  const h = Math.floor(t / 60);
  const r = t % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

function formatearMonto(n) {
  return `RD$ ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/* Mesa vista desde arriba: las sillas se rellenan según la ocupación */
function Glifo({ sillas = 4, ocupadas = 0 }) {
  return (
    <span className="mp-glyph" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <i key={i} className={i < ocupadas ? 'on' : ''} style={i >= sillas ? { visibility: 'hidden' } : undefined} />)}
    </span>
  );
}

function MapaMesas({ usuario, alCerrarSesion, apiUrl, configSistema }) {
  const urlBase = apiUrl;
  const logoComercio = configSistema?.logo_url
    ? (configSistema.logo_url.startsWith('http') ? configSistema.logo_url : `${urlBase}${configSistema.logo_url}`)
    : null;
  const nombreComercio = configSistema?.nombre_negocio || usuario?.empresa_nombre || 'Mi Negocio';

  const [mesas, setMesas] = useState([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modoTraslado, setModoTraslado] = useState(false);
  const [mesaOrigen, setMesaOrigen] = useState(null);
  const [mesaPin, setMesaPin] = useState(null);
  const [pinIngresado, setPinIngresado] = useState('');
  const [verificandoPin, setVerificandoPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todas');
  const [zonaActiva, setZonaActiva] = useState('Todas');
  const [soloMias, setSoloMias] = useState(false);
  const { esOscuro, alternar: alternarTema } = useTemaLocal();

  useEffect(() => {
    let sseMesas, sseKDS, intervaloFallback, reconectarTimeout, activo = true;

    const conectarSSE = async () => {
      try {
        const ticket = await obtenerTicketSse(urlBase);
        if (!ticket || !activo) return;
        const q = `ticket=${encodeURIComponent(ticket)}`;
        sseMesas = new EventSource(`${urlBase}/api/mesas/stream?${q}`);
        sseKDS = new EventSource(`${urlBase}/api/kds/stream?${q}`);
        const manejarEvento = () => { if (activo) cargarMesas(); };
        sseMesas.onmessage = manejarEvento;
        sseKDS.onmessage = manejarEvento;
        const manejarError = () => {
          if (sseMesas) sseMesas.close();
          if (sseKDS) sseKDS.close();
          if (activo) reconectarTimeout = setTimeout(() => { if (activo) conectarSSE(); }, 10000);
        };
        sseMesas.onerror = manejarError;
        sseKDS.onerror = manejarError;
      } catch (e) { console.warn('SSE no disponible, usando polling.'); }
    };

    cargarMesas();
    conectarSSE();
    intervaloFallback = setInterval(cargarMesas, 10000);
    return () => {
      activo = false;
      if (reconectarTimeout) clearTimeout(reconectarTimeout);
      if (intervaloFallback) clearInterval(intervaloFallback);
      if (sseMesas) sseMesas.close();
      if (sseKDS) sseKDS.close();
    };
  }, [urlBase]);

  const cargarMesas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/mesas`);
      if (!res.ok) throw new Error('Error de conexión');
      setMesas(await res.json());
    } catch (error) {
      console.error('Error cargando mesas:', error);
    } finally {
      setCargando(false);
    }
  };

  const hacerClicMesa = async (mesa) => {
    if (modoTraslado) {
      if (!mesaOrigen) {
        if (mesa.estado !== 'Ocupada') {
          toastAviso('Selecciona una mesa ocupada como origen del traslado.');
          return;
        }
        setMesaOrigen(mesa);
        toastAviso(`Mesa ${mesa.nombre_numero} seleccionada como origen. Ahora elige el destino.`);
        return;
      }
      if (mesa.id === mesaOrigen.id) {
        setMesaOrigen(null);
        toastAviso('Traslado cancelado.');
        return;
      }
      if (mesa.estado !== 'Disponible') {
        toastAviso('La mesa de destino debe estar disponible.');
        return;
      }
      try {
        const res = await fetch(`${urlBase}/api/mesas/${mesaOrigen.id}/trasladar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
          body: JSON.stringify({ mesaDestinoId: mesa.id })
        });
        const data = await res.json();
        if (res.ok) {
          toastAviso(`✅ Comanda trasladada a Mesa ${mesa.nombre_numero}`);
          setModoTraslado(false);
          setMesaOrigen(null);
          cargarMesas();
        } else {
          toastAviso(`❌ ${data.error || 'Error al trasladar.'}`);
        }
      } catch {
        toastAviso('⚠️ Error de conexión.');
      }
      return;
    }

    if (mesa.estado === 'Ocupada' && mesa.camarero_id && usuario && mesa.camarero_id !== usuario.id && usuario.rol !== 'Administrador') {
      setMesaPin(mesa);
      setPinIngresado('');
      setPinError('');
      return;
    }

    setMesaSeleccionada(mesa);
  };

  const agregarDigitoPin = (digito) => {
    if (pinIngresado.length < 6) {
      const nuevo = pinIngresado + digito;
      setPinIngresado(nuevo);
      if (nuevo.length === 6) verificarPin(nuevo);
    }
  };

  const verificarPin = async (pin) => {
    if (verificandoPin || !mesaPin) return;
    setVerificandoPin(true);
    setPinError('');
    try {
      const res = await fetch(`${urlBase}/api/mesas/${mesaPin.id}/acceder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok) { setMesaPin(null); setPinIngresado(''); setMesaSeleccionada(mesaPin); }
      else { setPinError(data.error || 'PIN incorrecto.'); setPinIngresado(''); }
    } catch { setPinError('Error de red.'); setPinIngresado(''); }
    finally { setVerificandoPin(false); }
  };

  const cerrarModalPin = () => {
    if (verificandoPin) return;
    setMesaPin(null); setPinIngresado(''); setPinError('');
  };

  useEffect(() => {
    if (!mesaPin) return;
    const manejarTecla = (e) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); agregarDigitoPin(e.key); return; }
      if (e.key === 'Backspace') { e.preventDefault(); setPinIngresado((p) => p.slice(0, -1)); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (pinIngresado.length === 6) verificarPin(pinIngresado); return; }
      if (e.key === 'Escape') { e.preventDefault(); cerrarModalPin(); }
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [mesaPin, pinIngresado, verificandoPin]);

  const esCamarero = usuario?.rol === 'Camarero';
  const mesasVisibles = esCamarero
    ? mesas.filter((mesa) => mesa.estado === 'Disponible' || mesa.camarero_id === usuario.id)
    : mesas;

  const zonasDisponibles = useMemo(() => {
    const setZ = new Set();
    mesas.forEach(m => { if (m.zona) setZ.add(m.zona); });
    return ['Todas', ...Array.from(setZ)];
  }, [mesas]);

  const mesasFiltradas = mesasVisibles.filter((mesa) => {
    const coincideBusqueda = mesa.nombre_numero?.toLowerCase().includes(busqueda.toLowerCase());
    const coincideEstado = filtroEstado === 'Todas' || mesa.estado === filtroEstado;
    const coincideZona = zonaActiva === 'Todas' || (mesa.zona === zonaActiva);
    const coincideMias = !soloMias || mesa.camarero_id === usuario?.id;
    return coincideBusqueda && coincideEstado && coincideZona && coincideMias;
  });

  const kpis = useMemo(() => {
    const total = mesasVisibles.length;
    const abiertas = mesasVisibles.filter(m => m.estado === 'Ocupada');
    const ocupadas = abiertas.length;
    const disponibles = mesasVisibles.filter(m => m.estado === 'Disponible').length;
    const reservadas = mesasVisibles.filter(m => m.estado === 'Reservada').length;
    const porcentaje = total > 0 ? Math.round((ocupadas / total) * 100) : 0;
    const porCobrar = abiertas.reduce((a, m) => a + Number(m.total_cuenta || 0), 0);
    const conTiempo = abiertas.filter(m => m.minutos_abierta != null);
    const promedio = conTiempo.length ? Math.round(conTiempo.reduce((a, m) => a + Number(m.minutos_abierta), 0) / conTiempo.length) : 0;
    return { total, ocupadas, disponibles, reservadas, porcentaje, porCobrar, promedio };
  }, [mesasVisibles]);

  /* Mesas que requieren atención: platos esperando en cocina o cuentas abiertas hace mucho */
  const atencion = useMemo(() => {
    const items = [];
    mesasVisibles.forEach((m) => {
      if (m.estado !== 'Ocupada') return;
      const pendientes = Number(m.platos_pendientes || 0);
      const minutos = Number(m.minutos_abierta || 0);
      if (pendientes > 0) {
        items.push({ mesa: m, tipo: 'cocina', prioridad: 2, titulo: m.nombre_numero, detalle: `${pendientes} ${pendientes === 1 ? 'plato' : 'platos'} en cocina · ${formatearMinutos(minutos)}`, accion: 'Ver' });
      } else if (minutos >= LIMITE_MESA_LARGA) {
        items.push({ mesa: m, tipo: 'larga', prioridad: 1, titulo: m.nombre_numero, detalle: `Abierta hace ${formatearMinutos(minutos)} · ${formatearMonto(m.total_cuenta)}`, accion: 'Abrir' });
      }
    });
    return items.sort((a, b) => b.prioridad - a.prioridad || Number(b.mesa.minutos_abierta || 0) - Number(a.mesa.minutos_abierta || 0)).slice(0, 8);
  }, [mesasVisibles]);

  if (mesaPin) {
    return (
      <div className="mp-pin" role="dialog" aria-modal="true" aria-label={`Autorizar acceso a ${mesaPin.nombre_numero}`}>
        <div className="mp-pin__card">
          <button type="button" className="mp-pin__close" onClick={cerrarModalPin} aria-label="Cerrar"><X size={18} /></button>
          <div className="mp-pin__badge"><Lock size={22} /></div>
          <span className="px-eyebrow">Acceso protegido</span>
          <h3 className="mp-pin__title">{mesaPin.nombre_numero}</h3>
          <p className="mp-pin__sub">Esta mesa la atiende otro camarero. Ingresa el PIN de autorización para continuar.</p>
          <div className={`mp-pin__dots ${pinError ? 'is-error' : ''}`} aria-label={`${pinIngresado.length} de 6 dígitos`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={`mp-pin__dot ${i < pinIngresado.length ? 'is-on' : ''}`} />
            ))}
          </div>
          <p className="mp-pin__error" role="alert">{pinError || ' '}</p>
          <div className="mp-pin__pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} type="button" className="mp-pin__key" onClick={() => agregarDigitoPin(String(n))}>{n}</button>
            ))}
            <button type="button" className="mp-pin__key mp-pin__key--ghost" onClick={cerrarModalPin} aria-label="Cancelar"><X size={20} /></button>
            <button type="button" className="mp-pin__key" onClick={() => agregarDigitoPin('0')}>0</button>
            <button type="button" className="mp-pin__key mp-pin__key--ghost" onClick={() => setPinIngresado((p) => p.slice(0, -1))} aria-label="Borrar"><Delete size={20} /></button>
          </div>
        </div>
      </div>
    );
  }

  if (mesaSeleccionada) {
    return <MenuPedido usuario={usuario} mesa={mesaSeleccionada} alVolver={() => { setMesaSeleccionada(null); cargarMesas(); }} apiUrl={urlBase} />;
  }

  const estados = [
    { id: 'Todas', etiqueta: 'Todas', clave: 'todas' },
    { id: 'Disponible', etiqueta: 'Libres', clave: 'libre' },
    { id: 'Ocupada', etiqueta: 'Ocupadas', clave: 'ocupada' },
    { id: 'Reservada', etiqueta: 'Reservadas', clave: 'reservada' },
  ];

  return (
    <div className="mp">
      <header className="mp-top">
        <div className="mp-brand">
          {logoComercio ? (
            <img src={logoComercio} alt={nombreComercio} className="mp-brand__logo" />
          ) : (
            <div className="mp-brand__icon">{nombreComercio.charAt(0).toUpperCase()}</div>
          )}
          <div className="mp-brand__text">
            <h1>{nombreComercio}</h1>
            <p>{usuario?.rol || 'Camarero'} · {kpis.disponibles} {kpis.disponibles === 1 ? 'mesa libre' : 'mesas libres'}</p>
          </div>
        </div>

        <label className="mp-search">
          <Search size={17} />
          <input type="search" placeholder="Buscar mesa" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar mesa" />
        </label>

        <div className="mp-actions">
          <button type="button" className={`mp-btn ${modoTraslado ? 'is-on' : ''}`} onClick={() => { setModoTraslado(!modoTraslado); setMesaOrigen(null); }}>
            {modoTraslado ? <Check size={17} /> : <ArrowRightLeft size={17} />}
            <span className="mp-btn__label">{modoTraslado ? 'Terminar traslado' : 'Trasladar'}</span>
          </button>
          <button type="button" className="mp-btn mp-btn--icon" onClick={alternarTema} aria-label={esOscuro ? 'Tema claro' : 'Tema oscuro'} title={esOscuro ? 'Tema claro' : 'Tema oscuro'}>
            {esOscuro ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div className="mp-user" title={usuario?.nombre || 'Personal'}>
            <span className="mp-user__avatar">{inicialesDe(usuario?.nombre)}</span>
            <span className="mp-user__text"><strong>{usuario?.nombre || 'Personal'}</strong><small>{usuario?.rol || 'Camarero'}</small></span>
          </div>
          <button type="button" className="mp-btn mp-btn--icon" onClick={alCerrarSesion} aria-label="Salir" title="Salir"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="mp-layout">
        <main className="mp-main">
          <section className="mp-strip" aria-label="Resumen del salón">
            <div className="mp-strip__item">
              <div className="mp-ring" style={{ '--p': kpis.porcentaje }} role="img" aria-label={`${kpis.porcentaje} % de ocupación`}><span>{kpis.porcentaje}%</span></div>
              <div><p className="mp-strip__label">Ocupación</p><p className="mp-strip__value">{kpis.ocupadas} de {kpis.total}</p><p className="mp-strip__note">{kpis.disponibles} {kpis.disponibles === 1 ? 'mesa libre' : 'mesas libres'}</p></div>
            </div>
            <div className="mp-strip__item">
              <div><p className="mp-strip__label">Por cobrar</p><p className="mp-strip__value">{formatearMonto(kpis.porCobrar)}</p><p className="mp-strip__note">{kpis.ocupadas} {kpis.ocupadas === 1 ? 'mesa abierta' : 'mesas abiertas'}</p></div>
            </div>
            <div className="mp-strip__item">
              <div><p className="mp-strip__label">Tiempo promedio</p><p className="mp-strip__value">{kpis.ocupadas ? formatearMinutos(kpis.promedio) : '—'}</p><p className="mp-strip__note">Por mesa ocupada</p></div>
            </div>
            <div className="mp-strip__item">
              <div><p className="mp-strip__label">Reservadas</p><p className="mp-strip__value">{kpis.reservadas}</p><p className="mp-strip__note">Por llegar</p></div>
            </div>
          </section>

          <div className="mp-toolbar">
            <div className="mp-toolbar__group">
              {zonasDisponibles.length > 1 && (
                <div className="mp-seg" role="tablist" aria-label="Zona">
                  {zonasDisponibles.map((zona) => (
                    <button key={zona} type="button" role="tab" aria-selected={zonaActiva === zona} aria-pressed={zonaActiva === zona} onClick={() => setZonaActiva(zona)}>{zona}</button>
                  ))}
                </div>
              )}
              <div className="mp-toolbar__group" role="group" aria-label="Filtrar por estado">
                {estados.map((e) => {
                  const conteo = e.id === 'Todas' ? mesasVisibles.length : mesasVisibles.filter((m) => m.estado === e.id).length;
                  return (
                    <button key={e.id} type="button" className="mp-chip" aria-pressed={filtroEstado === e.id} onClick={() => setFiltroEstado(e.id)}>
                      {e.clave !== 'todas' && <span className="mp-dot" data-tone={e.clave} />}
                      <span>{e.etiqueta}</span>
                      <small>{conteo}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            {!esCamarero && (
              <label className="mp-switch">
                <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} />
                <span className="mp-switch__track" />Mis mesas
              </label>
            )}
          </div>

          {modoTraslado && (
            <div className="mp-notice" role="status">
              <ArrowRightLeft size={16} />
              <span>{mesaOrigen ? <>Origen: <b>{mesaOrigen.nombre_numero}</b>. Toca la mesa libre de destino.</> : 'Toca la mesa ocupada que deseas trasladar.'}</span>
            </div>
          )}

          {cargando ? (
            <div className="mp-empty"><RefreshCw size={22} className="mp-spin" /><p>Cargando salón…</p></div>
          ) : mesasFiltradas.length === 0 ? (
            <div className="mp-empty"><TableProperties size={26} /><p>No hay mesas con estos filtros.</p></div>
          ) : (
            <div className="mp-grid">
              {mesasFiltradas.map((mesa, i) => {
                const clave = ESTADO_CLAVE[mesa.estado] || 'libre';
                const esOrigen = mesaOrigen?.id === mesa.id;
                const ajena = clave === 'ocupada' && mesa.camarero_id && usuario && mesa.camarero_id !== usuario.id && usuario.rol !== 'Administrador';
                const minutos = Number(mesa.minutos_abierta || 0);
                const pendientes = Number(mesa.platos_pendientes || 0);
                const sillas = Math.min(4, Math.max(2, Number(mesa.capacidad) || 4));
                return (
                  <button
                    key={mesa.id}
                    type="button"
                    onClick={() => hacerClicMesa(mesa)}
                    className={`mp-table ${esOrigen ? 'is-origin' : ''} ${ajena ? 'is-other' : ''}`}
                    data-estado={clave}
                    style={{ '--i': Math.min(i, 24) }}
                    aria-label={`${mesa.nombre_numero}, ${mesa.estado}`}
                  >
                    <span className="mp-table__head">
                      <span>
                        <strong className="mp-table__name">{mesa.nombre_numero}</strong>
                        <span className="mp-table__meta">
                          {ajena ? <Lock size={14} /> : <Users size={14} />}
                          {mesa.capacidad} {Number(mesa.capacidad) === 1 ? 'persona' : 'personas'}{mesa.camarero ? ` · ${mesa.camarero}` : ''}
                        </span>
                      </span>
                      <Glifo sillas={sillas} ocupadas={clave === 'ocupada' ? sillas : 0} />
                    </span>
                    <span className="mp-table__foot">
                      {clave === 'libre' && <><span className="mp-pill" data-tone="libre">Libre</span><span className="mp-table__hint">Toca para abrir</span></>}
                      {clave === 'reservada' && <><span className="mp-pill" data-tone="reservada"><CalendarClock size={13} />Reservada</span><span className="mp-table__hint">Reserva por confirmar</span></>}
                      {clave === 'ocupada' && (
                        <>
                          <span className="mp-table__tags">
                            <span className="mp-pill" data-tone="ocupada">Ocupada</span>
                            {pendientes > 0 && <span className="mp-table__alert"><i />{pendientes} en cocina</span>}
                          </span>
                          {mesa.minutos_abierta != null && (
                            <span className="mp-table__time"><span className="mp-bar"><i style={{ width: `${Math.min(100, Math.round((minutos / 90) * 100))}%` }} /></span>{formatearMinutos(minutos)}</span>
                          )}
                          <span className="mp-table__total">{formatearMonto(mesa.total_cuenta)}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="mp-attention" aria-label="Requiere atención">
          <h2 className="mp-attention__title">Requiere atención <span className="mp-attention__count" data-zero={atencion.length === 0}>{atencion.length}</span></h2>
          {atencion.length === 0 ? (
            <p className="mp-attention__empty"><Check size={18} />Todo en orden. No hay mesas esperando.</p>
          ) : atencion.map((it) => (
            <div key={`${it.tipo}-${it.mesa.id}`} className="mp-task" data-tone={it.tipo === 'cocina' ? 'ocupada' : 'reservada'}>
              <span className="mp-task__icon">{it.tipo === 'cocina' ? <ChefHat size={19} /> : <Clock size={19} />}</span>
              <div className="mp-task__text"><p className="mp-task__title">{it.titulo}</p><p className="mp-task__sub">{it.detalle}</p></div>
              <button type="button" className="mp-btn mp-btn--sm" onClick={() => hacerClicMesa(it.mesa)}>{it.accion}</button>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

export default MapaMesas;
