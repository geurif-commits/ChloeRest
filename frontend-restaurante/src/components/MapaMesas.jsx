import { useState, useEffect } from 'react';
import MenuPedido from '../components/MenuPedido';
import { toastAviso } from '../components/Toast.jsx';

// ════════════════════════════════════════════════════════════════════════
// Mapa de Mesas v3.0 — Luxury Dark Design
// Preserva toda la lógica de negocio del componente original
// ════════════════════════════════════════════════════════════════════════

function MapaMesas({ usuario, alCerrarSesion, apiUrl }) {
  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

  // SSE + polling fallback para actualizaciones en tiempo real
  useEffect(() => {
    let sseMesas, sseKDS, intervaloFallback, reconectarTimeout, activo = true;

    const conectarSSE = () => {
      try {
        sseMesas = new EventSource(`${urlBase}/api/mesas/stream`);
        sseKDS = new EventSource(`${urlBase}/api/kds/stream`);
        const manejarEvento = () => { if (activo) cargarMesas(); };
        sseMesas.onmessage = manejarEvento;
        sseKDS.onmessage = manejarEvento;
        const manejarError = (nombre) => () => {
          console.warn(`${nombre} SSE error. Usando polling.`);
          if (sseMesas) sseMesas.close();
          if (sseKDS) sseKDS.close();
          if (activo) reconectarTimeout = setTimeout(() => { if (activo) conectarSSE(); }, 10000);
        };
        sseMesas.onerror = manejarError('mesas');
        sseKDS.onerror = manejarError('kds');
      } catch (e) { console.warn('SSE no disponible, usando polling.', e); }
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
        if (mesa.estado === 'Disponible') return toastAviso('Selecciona una mesa ocupada para trasladar.');
        setMesaOrigen(mesa);
        return;
      }
      if (mesa.id === mesaOrigen.id) return toastAviso('No puedes trasladar a la misma mesa.');
      try {
        const res = await fetch(`${urlBase}/api/mesas/trasladar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesaOrigenId: mesaOrigen.id, mesaDestinoId: mesa.id })
        });
        const data = await res.json();
        if (res.ok) { toastAviso(`✅ ${data.mensaje}`); setModoTraslado(false); setMesaOrigen(null); cargarMesas(); }
        else toastAviso(`❌ ${data.error}`);
      } catch { toastAviso('Error de red al trasladar.'); }
      return;
    }

    if (mesa.estado === 'Disponible') {
      setMesaSeleccionada({ ...mesa, estado: 'Disponible' });
    } else if (usuario.rol === 'Camarero') {
      setPinError(''); setPinIngresado(''); setMesaPin(mesa);
    } else {
      setMesaSeleccionada(mesa);
    }
  };

  const agregarDigitoPin = (digito) => {
    setPinError('');
    if (pinIngresado.length >= 12) return;
    const nuevo = pinIngresado + digito;
    setPinIngresado(nuevo);
    if (nuevo.length >= 4) verificarPin(nuevo);
  };

  const verificarPin = async (pin) => {
    if (!/^\d{4,12}$/.test(pin)) return;
    setVerificandoPin(true);
    try {
      const res = await fetch(`${urlBase}/api/mesas/${mesaPin.id}/acceder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok) { setMesaPin(null); setPinIngresado(''); setMesaSeleccionada(mesaPin); }
      else { setPinError(data.error || 'No se pudo acceder.'); setPinIngresado(''); }
    } catch { setPinError('Error de red.'); setPinIngresado(''); }
    finally { setVerificandoPin(false); }
  };

  const cerrarModalPin = () => {
    if (verificandoPin) return;
    setMesaPin(null); setPinIngresado(''); setPinError('');
  };

  const obtenerColorEstado = (estado) => {
    switch (estado) {
      case 'Disponible': return 'var(--green)';
      case 'Ocupada': return 'var(--red)';
      case 'Reservada': return 'var(--gold)';
      default: return 'var(--muted)';
    }
  };

  const mesasFiltradas = mesas.filter((mesa) => {
    const coincideBusqueda = mesa.nombre_numero?.toLowerCase().includes(busqueda.toLowerCase());
    const coincideEstado = filtroEstado === 'Todas' || mesa.estado === filtroEstado;
    return coincideBusqueda && coincideEstado;
  });

  // PIN Modal
  if (mesaPin) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-2xl)', width: 'min(380px, 90vw)', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <h3 style={{ color: 'var(--gold)', marginBottom: 'var(--space-md)' }}>🔒 Mesa {mesaPin.nombre_numero}</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 'var(--space-lg)' }}>Ingresa tu PIN para acceder</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: 'var(--space-md)' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--white)', background: pinIngresado.length > i ? 'var(--gold)' : 'transparent', transition: 'all 200ms' }} />
            ))}
          </div>
          {pinError && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 'var(--space-sm)' }}>{pinError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', maxWidth: '260px', margin: '0 auto' }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => agregarDigitoPin(String(n))} style={{ height: '52px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-panel)', color: 'var(--white)', fontSize: '1.2rem', fontWeight: 600, cursor: 'pointer' }}>{n}</button>
            ))}
            <button onClick={cerrarModalPin} style={{ height: '52px', borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            <button onClick={() => agregarDigitoPin('0')} style={{ height: '52px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-panel)', color: 'var(--white)', fontSize: '1.2rem', fontWeight: 600, cursor: 'pointer' }}>0</button>
            <button onClick={() => setPinIngresado(p => p.slice(0, -1))} style={{ height: '52px', borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>⌫</button>
          </div>
        </div>
      </div>
    );
  }

  // Menu de pedidos
  if (mesaSeleccionada) {
    return <MenuPedido usuario={usuario} mesa={mesaSeleccionada} alVolver={() => { setMesaSeleccionada(null); cargarMesas(); }} apiUrl={urlBase} />;
  }

  return (
    <div className="mesa-workspace">
      <header className="mesa-workspace__header">
        <div><p className="mesa-workspace__eyebrow">Operación de salón</p><h1>Mapa de mesas</h1><p className="mesa-workspace__summary">{mesas.length} mesas · {mesas.filter((m) => m.estado === 'Ocupada').length} ocupadas</p></div>
        <div className="mesa-workspace__actions">
          <input type="search" placeholder="Buscar mesa" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input-field mesa-workspace__search" />
          <button className={`mesa-workspace__transfer ${modoTraslado ? 'is-active' : ''}`} onClick={() => { setModoTraslado(!modoTraslado); setMesaOrigen(null); }}>{modoTraslado ? '✓ Traslado activo' : '⇄ Trasladar'}</button>
          <button className="mesa-workspace__exit" onClick={alCerrarSesion}>← Salir</button>
        </div>
      </header>
      <section className="mesa-workspace__filters" aria-label="Filtrar mesas">
        {['Todas', 'Disponible', 'Ocupada', 'Reservada'].map((estado) => <button key={estado} className={filtroEstado === estado ? 'is-active' : ''} onClick={() => setFiltroEstado(estado)}>{estado}<strong>{estado === 'Todas' ? mesas.length : mesas.filter((mesa) => mesa.estado === estado).length}</strong></button>)}
      </section>
      {modoTraslado && <div className="mesa-workspace__notice">Selecciona primero una mesa ocupada y después la mesa de destino disponible.</div>}
      <section className="mesa-workspace__body">
        {cargando ? <div className="mesa-workspace__empty">Cargando mesas…</div> : mesasFiltradas.length === 0 ? <div className="mesa-workspace__empty">No hay mesas que coincidan con este filtro.</div> : (
          <div className="mesa-workspace__grid">
            {mesasFiltradas.map((mesa) => <button key={mesa.id} className={`mesa-card mesa-card--${mesa.estado.toLowerCase()} ${mesaOrigen?.id === mesa.id ? 'is-origin' : ''}`} onClick={() => hacerClicMesa(mesa)}>
              <span className="mesa-card__status" style={{ background: obtenerColorEstado(mesa.estado), boxShadow: `0 0 10px ${obtenerColorEstado(mesa.estado)}` }} />
              <span className="mesa-card__icon">▦</span><strong>{mesa.nombre_numero}</strong><span>{mesa.estado}</span>{mesa.camarero && <small>Atiende: {mesa.camarero}</small>}
            </button>)}
          </div>
        )}
      </section>
    </div>
  );
}

export default MapaMesas;
