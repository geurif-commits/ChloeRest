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
      <rect x="25" y="25" width="50" height="50" rx="8" stroke={color} strokeWidth="3" fill="rgba(255,255,255,0.03)" />
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
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
        <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(245,184,61,0.3)', borderRadius: '20px', padding: '28px', width: 'min(380px, 92vw)', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245,184,61,0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Lock size={22} />
          </div>
          <h3 style={{ color: '#fff', margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800 }}>Mesa {mesaPin.nombre_numero}</h3>
          <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem', margin: '0 0 16px' }}>Mesa atendida por otro camarero. Ingresa PIN de autorización:</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', background: pinIngresado.length > i ? 'var(--gold, #f5b842)' : 'transparent', transition: 'all 0.15s ease' }} />
            ))}
          </div>
          {pinError && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '0 0 10px' }}>{pinError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxWidth: '240px', margin: '0 auto' }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} type="button" onClick={() => agregarDigitoPin(String(n))} style={{ height: '46px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '1.15rem', fontWeight: 700, cursor: 'pointer' }}>{n}</button>
            ))}
            <button type="button" onClick={cerrarModalPin} style={{ height: '46px', borderRadius: '10px', border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            <button type="button" onClick={() => agregarDigitoPin('0')} style={{ height: '46px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '1.15rem', fontWeight: 700, cursor: 'pointer' }}>0</button>
            <button type="button" onClick={() => setPinIngresado(p => p.slice(0, -1))} style={{ height: '46px', borderRadius: '10px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>⌫</button>
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
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '12px 18px', background: 'rgba(12,17,29,0.95)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {logoComercio ? (
            <img src={logoComercio} alt={nombreComercio} style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'contain', background: '#fff', padding: '2px' }} />
          ) : (
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(245,184,61,0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TableProperties size={20} />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{nombreComercio}</h1>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(245,184,61,0.15)', color: 'var(--gold, #f5b842)', border: '1px solid rgba(245,184,61,0.3)' }}>
                {kpis.porcentaje}% Ocupado ({kpis.ocupadas}/{kpis.total})
              </span>
            </div>
            <small style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>
              Salón • Camarero: <strong>{usuario?.nombre || 'Personal'}</strong> • {kpis.disponibles} libres
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '160px' }}>
            <input type="search" placeholder="Buscar mesa..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.78rem' }} />
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          </div>
          <button type="button" className={`admin-btn ${modoTraslado ? 'admin-btn-primary' : 'admin-btn-secondary'}`} onClick={() => { setModoTraslado(!modoTraslado); setMesaOrigen(null); }} style={{ fontSize: '0.78rem', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRightLeft size={14} /> <span>{modoTraslado ? '✓ Cancelar Traslado' : '⇄ Trasladar'}</span>
          </button>
          <button type="button" onClick={alCerrarSesion} className="admin-btn admin-btn-secondary" style={{ fontSize: '0.78rem', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={14} /> <span>Salir</span>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {['Todas', 'Disponible', 'Ocupada', 'Reservada'].map((estado) => {
          const esActivo = filtroEstado === estado;
          const conteo = estado === 'Todas' ? mesasVisibles.length : mesasVisibles.filter((m) => m.estado === estado).length;
          return (
            <button key={estado} type="button" onClick={() => setFiltroEstado(estado)} style={{ padding: '6px 14px', borderRadius: '8px', border: esActivo ? '1px solid var(--gold, #f5b842)' : '1px solid rgba(255,255,255,0.08)', background: esActivo ? 'rgba(245,184,61,0.15)' : 'rgba(255,255,255,0.03)', color: esActivo ? 'var(--gold, #f5b842)' : '#94a3b8', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <span>{estado}</span>
              <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(0,0,0,0.3)' }}>{conteo}</span>
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
                <button key={mesa.id} type="button" onClick={() => hacerClicMesa(mesa)} style={{ padding: '14px 10px', borderRadius: '14px', background: esOrigen ? 'rgba(245,184,61,0.2)' : 'rgba(255,255,255,0.03)', border: `1.5px solid ${esOrigen ? 'var(--gold, #f5b842)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.18s ease', boxShadow: mesa.estado === 'Ocupada' ? '0 4px 14px rgba(239,68,68,0.15)' : 'none' }}>
                  <MesaSvg estado={mesa.estado} />
                  <strong style={{ fontSize: '0.98rem', color: '#fff' }}>{mesa.nombre_numero}</strong>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: color }}>{mesa.estado}</span>
                  {mesa.camarero && <small style={{ fontSize: '0.66rem', color: 'var(--admin-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{mesa.camarero}</small>}
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

