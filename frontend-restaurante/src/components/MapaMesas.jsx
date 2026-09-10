import { useState, useEffect, useMemo } from 'react';
import MenuPedido from '../components/MenuPedido';
import { toastAviso } from '../components/Toast.jsx';
import { obtenerSesion } from '../api.js';
import {
  TableProperties, Search, ArrowRightLeft, LogOut,
  Users, Layers, Sparkles, RefreshCw, Lock
} from 'lucide-react';

function colorEstadoMesa(estado) {
  switch (estado) {
    case 'Disponible': return 'var(--mesa-disponible, #00f576)';
    case 'Ocupada': return 'var(--mesa-ocupada, #ff4444)';
    case 'Reservada': return 'var(--mesa-reservada, #d6a44d)';
    default: return 'var(--muted)';
  }
}

function MesaSvg({ estado }) {
  const color = colorEstadoMesa(estado);
  return (
    <svg width="68" height="68" viewBox="0 0 100 100" fill="none" aria-hidden="true" className="mesa-table__svg">
      <rect x="35" y="8" width="30" height="10" rx="4" stroke={color} strokeWidth="2.5" fill="none" />
      <rect x="35" y="82" width="30" height="10" rx="4" stroke={color} strokeWidth="2.5" fill="none" />
      <rect x="8" y="35" width="10" height="30" rx="4" stroke={color} strokeWidth="2.5" fill="none" />
      <rect x="82" y="35" width="10" height="30" rx="4" stroke={color} strokeWidth="2.5" fill="none" />
      <rect x="25" y="25" width="50" height="50" rx="8" stroke={color} strokeWidth="3" fill="var(--bg-card-hover, rgba(255,255,255,0.03))" />
      <circle cx="50" cy="50" r="3.5" fill={color} opacity="0.7" />
    </svg>
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

  useEffect(() => {
    let sseMesas, sseKDS, intervaloFallback, reconectarTimeout, activo = true;

    const conectarSSE = () => {
      try {
        const token = encodeURIComponent(obtenerSesion() || '');
        sseMesas = new EventSource(`${urlBase}/api/mesas/stream?token=${token}`);
        sseKDS = new EventSource(`${urlBase}/api/kds/stream?token=${token}`);
        const manejarEvento = () => { if (activo) cargarMesas(); };
        sseMesas.onmessage = manejarEvento;
        sseKDS.onmessage = manejarEvento;
        const manejarError = (nombre) => () => {
          if (sseMesas) sseMesas.close();
          if (sseKDS) sseKDS.close();
          if (activo) reconectarTimeout = setTimeout(() => { if (activo) conectarSSE(); }, 10000);
        };
        sseMesas.onerror = manejarError('mesas');
        sseKDS.onerror = manejarError('kds');
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
    return coincideBusqueda && coincideEstado && coincideZona;
  });

  const kpis = useMemo(() => {
    const total = mesasVisibles.length;
    const ocupadas = mesasVisibles.filter(m => m.estado === 'Ocupada').length;
    const disponibles = mesasVisibles.filter(m => m.estado === 'Disponible').length;
    const porcentaje = total > 0 ? Math.round((ocupadas / total) * 100) : 0;
    return { total, ocupadas, disponibles, porcentaje };
  }, [mesasVisibles]);

  if (mesaPin) {
    return (
      <div className="mesa-pin-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
        <div className="mesa-pin-modal">
          <div className="mesa-pin-icon">
            <Lock size={22} />
          </div>
          <h3 className="mesa-pin-title">Mesa {mesaPin.nombre_numero}</h3>
          <p className="mesa-pin-subtitle">Mesa atendida por otro camarero. Ingresa PIN de autorización:</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`mesa-pin-dot ${pinIngresado.length > i ? 'mesa-pin-dot--active' : ''}`} />
            ))}
          </div>
          {pinError && <p className="mesa-pin-error">{pinError}</p>}
          <div className="mesa-pin-grid">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} type="button" className="mesa-pin-btn" onClick={() => agregarDigitoPin(String(n))}>{n}</button>
            ))}
            <button type="button" className="mesa-pin-btn mesa-pin-btn--cancel" onClick={cerrarModalPin}>✕</button>
            <button type="button" className="mesa-pin-btn" onClick={() => agregarDigitoPin('0')}>0</button>
            <button type="button" className="mesa-pin-btn mesa-pin-btn--del" onClick={() => setPinIngresado(p => p.slice(0, -1))}>⌫</button>
          </div>
        </div>
      </div>
    );
  }

  if (mesaSeleccionada) {
    return <MenuPedido usuario={usuario} mesa={mesaSeleccionada} alVolver={() => { setMesaSeleccionada(null); cargarMesas(); }} apiUrl={urlBase} />;
  }

  return (
    <div className="mesa-workspace" style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', height: '100%', overflow: 'hidden' }}>
      <header className="mesa-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {logoComercio ? (
            <img src={logoComercio} alt={nombreComercio} className="mesa-header__logo" />
          ) : (
            <div className="mesa-header__icon">
              <TableProperties size={20} />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="mesa-header__name">{nombreComercio}</h1>
              <span className="mesa-header__badge">
                {kpis.porcentaje}% Ocupado ({kpis.ocupadas}/{kpis.total})
              </span>
            </div>
            <small className="mesa-header__sub">
              Salón • Camarero: <strong>{usuario?.nombre || 'Personal'}</strong> • {kpis.disponibles} libres
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div className="mesa-search">
            <input type="search" placeholder="Buscar mesa..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="mesa-search__input" />
            <Search size={13} className="mesa-search__icon" />
          </div>
          <button type="button" className={`admin-btn ${modoTraslado ? 'admin-btn-primary' : 'admin-btn-secondary'}`} onClick={() => { setModoTraslado(!modoTraslado); setMesaOrigen(null); }} style={{ fontSize: '0.78rem', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRightLeft size={14} /> <span>{modoTraslado ? '✓ Cancelar Traslado' : '⇄ Trasladar'}</span>
          </button>
          <button type="button" onClick={alCerrarSesion} className="admin-btn admin-btn-secondary" style={{ fontSize: '0.78rem', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={14} /> <span>Salir</span>
          </button>
        </div>
      </header>

      <div className="mesa-filtros">
        {['Todas', 'Disponible', 'Ocupada', 'Reservada'].map((estado) => {
          const esActivo = filtroEstado === estado;
          const conteo = estado === 'Todas' ? mesasVisibles.length : mesasVisibles.filter((m) => m.estado === estado).length;
          return (
            <button key={estado} type="button" onClick={() => setFiltroEstado(estado)} className={`mesa-filtro-btn ${esActivo ? 'mesa-filtro-btn--active' : ''}`}>
              <span>{estado}</span>
              <span className="mesa-filtro-btn__count">{conteo}</span>
            </button>
          );
        })}
      </div>

      {modoTraslado && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,184,61,0.15)', border: '1px solid rgba(245,184,61,0.3)', color: 'var(--gold, #f5b842)', fontSize: '0.8rem', fontWeight: 600 }}>
          {mesaOrigen ? `Mesa origen: #${mesaOrigen.nombre_numero}. Ahora toca la mesa disponible de destino.` : 'Toca la mesa ocupada que deseas trasladar.'}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 2px' }}>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--admin-text-muted)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
            <p>Cargando salón de mesas...</p>
          </div>
        ) : mesasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--admin-text-muted)' }}>No hay mesas en este filtro o zona.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
            {mesasFiltradas.map((mesa) => {
              const esOrigen = mesaOrigen?.id === mesa.id;
              const color = colorEstadoMesa(mesa.estado);
              return (
              <button key={mesa.id} type="button" onClick={() => hacerClicMesa(mesa)} className={`mesa-table-btn ${esOrigen ? 'mesa-table-btn--origin' : ''}`}>
                  <MesaSvg estado={mesa.estado} />
                  <strong className="mesa-table-btn__name">{mesa.nombre_numero}</strong>
                  <span className="mesa-table-btn__status" style={{ color }}>{mesa.estado}</span>
                  {mesa.camarero && <small className="mesa-table-btn__camarero">{mesa.camarero}</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default MapaMesas;

