import { useState, useEffect, useRef } from 'react';
import { toastAviso } from '../Toast.jsx';
import GestionDispositivos from './GestionDispositivos.jsx';
import FacturaActivacion from './FacturaActivacion.jsx';
import BotonSalirElectron from '../BotonSalirElectron.jsx';
import './admin.css';

const TOKEN_KEY = 'POS_DUENO_TOKEN';

const DURACIONES = [
  { codigo: '7D', etiqueta: '7 días' },
  { codigo: '15D', etiqueta: '15 días' },
  { codigo: '30D', etiqueta: '30 días' },
  { codigo: '60D', etiqueta: '60 días' },
  { codigo: '90D', etiqueta: '90 días' },
  { codigo: '6M', etiqueta: '6 meses' },
  { codigo: '12M', etiqueta: '12 meses' },
  { codigo: '24M', etiqueta: '24 meses' },
  { codigo: 'L', etiqueta: 'Vitalicia' },
];

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'planes', label: 'Planes y precios' },
  { id: 'claves', label: 'Generar claves' },
  { id: 'solicitudes', label: 'Solicitudes' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'pagos', label: 'Métodos de pago' },
  { id: 'dispositivos', label: 'Dispositivos' },
];

const inputStyle = {
  width: '100%', padding: '10px 12px', background: 'var(--admin-surface-alt)',
  color: 'var(--admin-text)', border: '1px solid var(--admin-border)',
  borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box',
};

const labelStyle = { color: 'var(--admin-text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '4px' };

function FilaPlan({ plan, onGuardar, onEliminar }) {
  const [nombre, setNombre] = useState(plan.nombre);
  const [precio, setPrecio] = useState(plan.precio != null ? String(plan.precio) : '');
  const [duracion, setDuracion] = useState(plan.duracion_codigo);
  const [moneda, setMoneda] = useState(plan.moneda);
  const [guardando, setGuardando] = useState(false);
  const enfocado = useRef(false);

  useEffect(() => {
    if (enfocado.current) return;
    setNombre(plan.nombre);
    setPrecio(plan.precio != null ? String(plan.precio) : '');
    setDuracion(plan.duracion_codigo);
    setMoneda(plan.moneda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const guardarCampo = (campo, valor) => {
    let cambio;
    if (campo === 'precio') {
      cambio = Number(valor) !== Number(plan.precio);
    } else {
      cambio = String(valor ?? '') !== String(plan[campo] ?? '');
    }
    if (!cambio) return;
    setGuardando(true);
    Promise.resolve(onGuardar(plan, { [campo]: valor })).finally(() => setGuardando(false));
  };

  const terminarPrecio = () => {
    if (precio.trim() === '') {
      setPrecio(plan.precio != null ? String(plan.precio) : '');
      return;
    }
    const n = Number(precio);
    if (!Number.isFinite(n)) {
      setPrecio(plan.precio != null ? String(plan.precio) : '');
      return;
    }
    guardarCampo('precio', n);
  };

  const terminarNombre = () => {
    if (nombre.trim() === '') {
      setNombre(plan.nombre);
      return;
    }
    guardarCampo('nombre', nombre.trim());
  };

  const manejarTecla = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setNombre(plan.nombre);
      setPrecio(plan.precio != null ? String(plan.precio) : '');
    }
  };

  return (
    <tr>
      <td>
        <input
          className="form-input"
          style={inputStyle}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onFocus={() => { enfocado.current = true; }}
          onBlur={() => { enfocado.current = false; terminarNombre(); }}
          onKeyDown={manejarTecla}
          placeholder="Nombre"
        />
      </td>
      <td>
        <select
          className="form-input"
          style={inputStyle}
          value={duracion}
          onChange={(e) => { setDuracion(e.target.value); guardarCampo('duracion_codigo', e.target.value); }}
        >
          {DURACIONES.map((d) => <option key={d.codigo} value={d.codigo}>{d.etiqueta}</option>)}
        </select>
      </td>
      <td>
        <input
          className="form-input"
          style={{ ...inputStyle, width: '90px' }}
          type="number"
          min="0"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          onFocus={() => { enfocado.current = true; }}
          onBlur={() => { enfocado.current = false; terminarPrecio(); }}
          onKeyDown={manejarTecla}
          placeholder="0"
        />
      </td>
      <td>
        <select
          className="form-input"
          style={{ ...inputStyle, width: '90px' }}
          value={moneda}
          onChange={(e) => { setMoneda(e.target.value); guardarCampo('moneda', e.target.value); }}
        >
          <option>RD$</option><option>US$</option><option>€</option>
        </select>
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={Boolean(plan.destacado)} onChange={(e) => onGuardar(plan, { destacado: e.target.checked })} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={Boolean(plan.activo)} onChange={(e) => onGuardar(plan, { activo: e.target.checked })} />
      </td>
      <td>
        {guardando && <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', marginRight: '6px' }}>Guardando…</span>}
        <button className="btn-accion delete" onClick={() => onEliminar(plan)} title="Eliminar plan">🗑️</button>
      </td>
    </tr>
  );
}

function PanelDueno({ apiUrl, config, alVolver }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [pin, setPin] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [pinLongitud, setPinLongitud] = useState(0);

  const [tab, setTab] = useState('resumen');
  const [resumen, setResumen] = useState(null);
  const [planes, setPlanes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [metodosPago, setMetodosPago] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  const headers = () => ({ 'Authorization': `Bearer ${token}` });

  const cerrarSesion = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setPin('');
    setResumen(null);
  };

  const cargarTodo = async (tok) => {
    const auth = tok || token;
    setCargandoDatos(true);
    try {
      const [resR, resP, resS, resF, resM] = await Promise.all([
        fetch(`${apiUrl}/api/dueno/resumen`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/planes`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/solicitudes`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/facturas`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/metodos-pago`, { headers: { 'Authorization': `Bearer ${auth}` } }),
      ]);
      if (!resR.ok) {
        if (resR.status === 401) cerrarSesion();
        toastAviso('Error cargando el panel del propietario.');
        return;
      }
      const [dR, dP, dS, dF, dM] = await Promise.all([resR.json(), resP.json(), resS.json(), resF.json(), resM.json()]);
      setResumen(dR);
      setPlanes(dP.planes || []);
      setSolicitudes(dS.solicitudes || []);
      setFacturas(dF.facturas || []);
      setMetodosPago(dM.metodos || []);
    } catch {
      toastAviso('Error cargando el panel del propietario.');
    } finally {
      setCargandoDatos(false);
    }
  };

  useEffect(() => {
    if (token) cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) return;
    let activo = true;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/configuracion/sistema`);
        const data = await res.json();
        if (activo && data && data.owner_pin_longitud > 0) {
          setPinLongitud(data.owner_pin_longitud);
        }
      } catch {
        // Si falla, queda en 0 y solo se puede enviar con Enter/botón.
      }
    })();
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = async (e) => {
    if (e) e.preventDefault();
    if (!pin || cargando) return;
    setCargando(true);
    setErrorLogin('');
    try {
      const res = await fetch(`${apiUrl}/api/dueno/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorLogin(data.error || 'PIN incorrecto.');
        setPin('');
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      cargarTodo(data.token);
    } catch {
      setErrorLogin('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  const agregarNumeroPin = (num) => {
    setPin((prev) => {
      if (prev.length < 12) {
        setErrorLogin('');
        return prev + num;
      }
      return prev;
    });
  };

  const borrarNumeroPin = () => setPin((prev) => prev.slice(0, -1));

  useEffect(() => {
    if (!token && pinLongitud > 0 && pin.length === pinLongitud) login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, pinLongitud]);

  useEffect(() => {
    if (token) return;
    const manejarTeclado = (evento) => {
      if (evento.key >= '0' && evento.key <= '9') {
        agregarNumeroPin(evento.key);
      } else if (evento.key === 'Backspace' || evento.key === 'Delete') {
        borrarNumeroPin();
      } else if (evento.key === 'Enter') {
        if (pinLongitud === 0 || pin.length === pinLongitud) login();
      }
    };
    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pin, pinLongitud]);

  const [planForm, setPlanForm] = useState({ nombre: '', duracion_codigo: '30D', precio: '', moneda: 'RD$', destacado: false, activo: true, orden: 0 });

  const guardarPlan = async (e) => {
    e.preventDefault();
    if (!planForm.nombre.trim() || planForm.precio === '') {
      toastAviso('Nombre y precio del plan son obligatorios.');
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/api/dueno/planes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ ...planForm, precio: Number(planForm.precio), orden: Number(planForm.orden || 0) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error creando el plan.');
        return;
      }
      toastAviso('Plan creado correctamente.');
      setPlanForm({ nombre: '', duracion_codigo: '30D', precio: '', moneda: 'RD$', destacado: false, activo: true, orden: 0 });
      cargarTodo();
    } catch {
      toastAviso('Error creando el plan.');
    }
  };

  const editarPlan = async (plan, cambios) => {
    try {
      const res = await fetch(`${apiUrl}/api/dueno/planes/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ ...plan, ...cambios }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error actualizando el plan.');
        return;
      }
      toastAviso('Plan actualizado.');
      cargarTodo();
    } catch {
      toastAviso('Error actualizando el plan.');
    }
  };

  const eliminarPlan = async (plan) => {
    if (!window.confirm(`Eliminar el plan "${plan.nombre}"?`)) return;
    try {
      const res = await fetch(`${apiUrl}/api/dueno/planes/${plan.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error eliminando el plan.');
        return;
      }
      toastAviso('Plan eliminado.');
      cargarTodo();
    } catch {
      toastAviso('Error eliminando el plan.');
    }
  };

  const [durSeleccionada, setDurSeleccionada] = useState('30D');
  const [claveGenerada, setClaveGenerada] = useState('');

  const generarClave = async () => {
    setClaveGenerada('');
    try {
      const res = await fetch(`${apiUrl}/api/dueno/generar-clave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ duracion: durSeleccionada }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error generando la clave.');
        return;
      }
      setClaveGenerada(data.clave);
    } catch {
      toastAviso('Error generando la clave.');
    }
  };

  const copiarClave = async (clave) => {
    try {
      await navigator.clipboard.writeText(clave);
      toastAviso('Clave copiada al portapapeles.');
    } catch {
      toastAviso('No se pudo copiar la clave.');
    }
  };

  const cambiarSolicitud = async (id, estado) => {
    try {
      const res = await fetch(`${apiUrl}/api/dueno/solicitudes/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error actualizando la solicitud.');
        return;
      }
      toastAviso(`Solicitud marcada como "${estado}".`);
      cargarTodo();
    } catch {
      toastAviso('Error actualizando la solicitud.');
    }
  };

  const formatearFecha = (fecha) => (fecha ? new Date(fecha).toLocaleString() : '—');

  const TIPOS_PAGO = [
    { id: 'paypal', label: 'PayPal' },
    { id: 'transferencia', label: 'Transferencia bancaria' },
    { id: 'binance', label: 'Binance ID' },
    { id: 'usdt', label: 'Cripto USDT' },
  ];

  const metodoVacio = { tipo: 'paypal', nombre: '', titular: '', detalle: '', dato1: '', dato2: '', dato3: '', link_pago: '', activo: true, orden: 0 };
  const [metodoForm, setMetodoForm] = useState(metodoVacio);
  const [editandoMetodo, setEditandoMetodo] = useState(null);

  const guardarMetodo = async (e) => {
    e.preventDefault();
    if (!metodoForm.nombre.trim()) {
      toastAviso('El nombre del método de pago es obligatorio.');
      return;
    }
    try {
      const url = editandoMetodo
        ? `${apiUrl}/api/dueno/metodos-pago/${editandoMetodo.id}`
        : `${apiUrl}/api/dueno/metodos-pago`;
      const res = await fetch(url, {
        method: editandoMetodo ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ ...metodoForm, orden: Number(metodoForm.orden || 0) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error guardando el método de pago.');
        return;
      }
      toastAviso(editandoMetodo ? 'Método de pago actualizado.' : 'Método de pago creado.');
      setMetodoForm(metodoVacio);
      setEditandoMetodo(null);
      cargarTodo();
    } catch {
      toastAviso('Error guardando el método de pago.');
    }
  };

  const editarMetodo = (m) => {
    setEditandoMetodo(m);
    setMetodoForm({
      tipo: m.tipo || 'paypal',
      nombre: m.nombre || '',
      titular: m.titular || '',
      detalle: m.detalle || '',
      dato1: m.dato1 || '',
      dato2: m.dato2 || '',
      dato3: m.dato3 || '',
      link_pago: m.link_pago || '',
      activo: m.activo !== false,
      orden: m.orden || 0,
    });
  };

  const eliminarMetodo = async (m) => {
    if (!window.confirm(`Eliminar el método de pago "${m.nombre}"?`)) return;
    try {
      const res = await fetch(`${apiUrl}/api/dueno/metodos-pago/${m.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error eliminando el método de pago.');
        return;
      }
      toastAviso('Método de pago eliminado.');
      cargarTodo();
    } catch {
      toastAviso('Error eliminando el método de pago.');
    }
  };

  const guardarMetodoCambioActivo = async (m) => {
    try {
      const res = await fetch(`${apiUrl}/api/dueno/metodos-pago/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(m),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error actualizando el método de pago.');
      }
      cargarTodo();
    } catch {
      toastAviso('Error actualizando el método de pago.');
      cargarTodo();
    }
  };

  const cambiarMetodoCampo = (campo) => (e) => setMetodoForm((actual) => ({ ...actual, [campo]: e.target.value }));

  const etiquetaCampoMetodo = (m) => {
    switch (m.tipo) {
      case 'paypal': return { l1: 'Correo PayPal', l2: '', l3: '' };
      case 'transferencia': return { l1: 'Banco', l2: 'Número de cuenta', l3: 'Titular de la cuenta' };
      case 'binance': return { l1: 'ID de Binance', l2: '', l3: '' };
      case 'usdt': return { l1: 'Dirección de la billetera (wallet)', l2: 'Red 1 (ej: BEP20)', l3: 'Red 2 (ej: TRC20)' };
      default: return { l1: '', l2: '', l3: '' };
    }
  };

  if (!token) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box' }}>
        <BotonSalirElectron />
        <div style={{ background: '#181820', border: '2px solid #d6a44d', borderRadius: '16px', padding: '35px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(214,164,77,0.2)' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>👑</div>
          <h2 style={{ color: '#d6a44d', fontSize: '1.6rem', margin: '0 0 8px 0' }}>Panel del Propietario</h2>
          <p style={{ color: '#9494ad', fontSize: '0.92rem', marginBottom: '20px', lineHeight: '1.5' }}>
            Acceso universal y exclusivo del dueño del sistema. Ingresa tu PIN para administrar planes, precios, claves, solicitudes y dispositivos.
          </p>
          <form onSubmit={login}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
              {[...Array(pinLongitud > 0 ? pinLongitud : 6)].map((_, i) => (
                <span key={i} style={{
                  width: '46px', height: '46px', borderRadius: '10px', border: '2px solid #d6a44d',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                  background: i < pin.length ? '#d6a44d' : 'transparent',
                  color: i < pin.length ? '#000' : 'transparent'
                }}>
                  •
                </span>
              ))}
            </div>
            {errorLogin && <p style={{ color: '#ff5252', fontSize: '0.85rem', margin: '0 0 10px 0' }}>{errorLogin}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px', maxWidth: '260px', margin: '0 auto 16px auto' }}>
              {['1','2','3','4','5','6','7','8','9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => agregarNumeroPin(n)}
                  style={{ background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '14px', borderRadius: '10px', fontSize: '1.25rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {n}
                </button>
              ))}
              <button type="button" onClick={borrarNumeroPin} style={{ background: '#2a2a38', color: '#ff5252', border: '1px solid #2a2a38', padding: '14px', borderRadius: '10px', fontSize: '1.1rem', cursor: 'pointer' }}>⌫</button>
              <button type="button" onClick={() => agregarNumeroPin('0')} style={{ background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '14px', borderRadius: '10px', fontSize: '1.25rem', fontWeight: 'bold', cursor: 'pointer' }}>0</button>
              <button
                type="submit"
                disabled={cargando || pin.length < (pinLongitud > 0 ? pinLongitud : 4)}
                style={{ background: pin.length >= (pinLongitud > 0 ? pinLongitud : 4) && !cargando ? '#d6a44d' : '#2a2a38', color: pin.length >= (pinLongitud > 0 ? pinLongitud : 4) && !cargando ? '#000' : '#888', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1.1rem', cursor: pin.length >= (pinLongitud > 0 ? pinLongitud : 4) && !cargando ? 'pointer' : 'not-allowed' }}
              >
                ➜
              </button>
            </div>

            <p style={{ color: '#88889d', fontSize: '0.72rem', margin: '0 0 14px 0' }}>
              Digita el PIN completo del propietario y pulsa ➜ o Enter.
            </p>

            {cargando && <p style={{ color: '#d6a44d', fontSize: '0.85rem', margin: '0 0 10px 0' }}>Verificando...</p>}
          </form>
          <button onClick={alVolver} style={{ marginTop: '4px', background: 'transparent', color: '#9494ad', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (!resumen && cargandoDatos) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, fontFamily: 'sans-serif', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '2.5rem' }}>👑</div>
        <p style={{ color: '#9494ad' }}>Cargando panel del propietario...</p>
      </div>
    );
  }

  const nombreNegocio = config?.nombre_negocio || resumen?.negocio?.nombre_comercial || 'ChloeRestaurant';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--admin-bg)', color: 'var(--admin-text)', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, background: 'linear-gradient(135deg, #14141b, #1c1a14)', borderBottom: '1px solid rgba(214,164,77,0.35)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(214,164,77,0.16)', border: '1px solid rgba(214,164,77,0.5)', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>👑</div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#d6a44d', fontWeight: 700 }}>Panel del Propietario</div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{nombreNegocio}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Acceso universal · Solo dueño</span>
          <button onClick={cerrarSesion} style={{ background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--admin-text-muted)', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>Cerrar sesión</button>
          <button onClick={alVolver} style={{ background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--admin-text)', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>Salir</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? 'linear-gradient(135deg, #d6a44d, #b3862f)' : 'var(--admin-surface)',
                color: tab === t.id ? '#000' : 'var(--admin-text)',
                border: tab === t.id ? 'none' : '1px solid var(--admin-border)',
                padding: '10px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <>
            <div className="tarjetas-grid" style={{ marginBottom: '20px' }}>
              <div className="tarjeta-resumen destacada">
                <h4>Dispositivos activos</h4>
                <h2>{resumen?.dispositivos?.activos || 0} <small style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>/ {resumen?.dispositivos?.total || 0}</small></h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Solicitudes pendientes</h4>
                <h2>{resumen?.solicitudes?.pendientes || 0}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Solicitudes pagadas</h4>
                <h2 style={{ color: '#00f576' }}>{resumen?.solicitudes?.pagadas || 0}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Facturas emitidas</h4>
                <h2 style={{ color: '#8ab4f8' }}>{resumen?.facturas?.total || 0}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Planes activos</h4>
                <h2>{resumen?.planes?.total || 0}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Licencia del negocio</h4>
                <h2 style={{ fontSize: '1.1rem' }}>
                  {resumen?.negocio?.duracion_meses === -1 ? 'Vitalicia' : `${resumen?.negocio?.duracion_meses || 0} meses`}
                </h2>
              </div>
            </div>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Panel universal del sistema: planes y precios de suscripción, generación de claves con duración
              (30D = 30 días, 12M = 1 año, L = vitalicia), solicitudes de licencia y gestión de dispositivos.
            </p>
          </>
        )}

        {tab === 'planes' && (
          <div className="admin-grid-layout">
            <div className="admin-panel-lista">
              <h3 style={{ margin: '0 0 12px' }}>Planes de suscripción</h3>
              <div className="tabla-contenedor">
                <table className="admin-tabla">
                  <thead>
                    <tr><th>Nombre</th><th>Duración</th><th>Precio</th><th>Moneda</th><th>Destacado</th><th>Activo</th><th></th></tr>
                  </thead>
                  <tbody>
                    {planes.map((p) => (
                      <FilaPlan key={p.id} plan={p} onGuardar={editarPlan} onEliminar={eliminarPlan} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-panel-formulario">
              <h3>Nuevo plan</h3>
              <form onSubmit={guardarPlan} style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input className="form-input" style={inputStyle} value={planForm.nombre} onChange={(e) => setPlanForm({ ...planForm, nombre: e.target.value })} placeholder="Ej: Anual" />
                </div>
                <div>
                  <label style={labelStyle}>Duración</label>
                  <select className="form-input" style={inputStyle} value={planForm.duracion_codigo} onChange={(e) => setPlanForm({ ...planForm, duracion_codigo: e.target.value })}>
                    {DURACIONES.map((d) => <option key={d.codigo} value={d.codigo}>{d.etiqueta}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Precio</label>
                    <input className="form-input" style={inputStyle} type="number" min="0" value={planForm.precio} onChange={(e) => setPlanForm({ ...planForm, precio: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>Moneda</label>
                    <select className="form-input" style={inputStyle} value={planForm.moneda} onChange={(e) => setPlanForm({ ...planForm, moneda: e.target.value })}>
                      <option>RD$</option><option>US$</option><option>€</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={planForm.destacado} onChange={(e) => setPlanForm({ ...planForm, destacado: e.target.checked })} /> Destacado</label>
                  <label style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={planForm.activo} onChange={(e) => setPlanForm({ ...planForm, activo: e.target.checked })} /> Activo</label>
                </div>
                <button className="btn-guardar-admin" type="submit">Crear plan</button>
              </form>
            </div>
          </div>
        )}

        {tab === 'claves' && (
          <div className="admin-panel-formulario" style={{ maxWidth: '560px' }}>
            <h3>Generador de claves de activación</h3>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.9rem', marginBottom: '14px' }}>
              Elige la duración y genera la clave para entregar al cliente. Formato: <code>CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX</code>.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginBottom: '14px' }}>
              {DURACIONES.map((d) => (
                <button
                  key={d.codigo}
                  type="button"
                  onClick={() => setDurSeleccionada(d.codigo)}
                  style={{
                    padding: '10px', borderRadius: '8px', border: durSeleccionada === d.codigo ? '2px solid var(--admin-accent)' : '1px solid var(--admin-border)',
                    background: durSeleccionada === d.codigo ? 'rgba(0,245,118,0.1)' : 'var(--admin-surface)',
                    color: 'var(--admin-text)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                  }}
                >
                  {d.etiqueta}
                </button>
              ))}
            </div>
            <button className="btn-guardar-admin" type="button" onClick={generarClave}>Generar clave</button>

            {claveGenerada && (
              <div style={{ marginTop: '16px' }}>
                <label style={labelStyle}>Clave generada</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input readOnly value={claveGenerada} style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '1px', flex: 1 }} />
                  <button className="btn-guardar-admin" type="button" onClick={() => copiarClave(claveGenerada)}>📋</button>
                </div>
              </div>
            )}

            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.8rem', marginTop: '12px' }}>
              La clave maestra antigua <code>{resumen?.claveMaestra || 'CHLOE-...'}</code> sigue funcionando como licencia Vitalicia.
            </p>
          </div>
        )}

        {tab === 'solicitudes' && (
          <div className="admin-panel-lista">
            <h3 style={{ margin: '0 0 12px' }}>Solicitudes de licencia</h3>
            {solicitudes.length === 0 ? (
              <p style={{ color: 'var(--admin-text-muted)' }}>No hay solicitudes aún. Cuando un cliente elija un plan en el formulario de registro, aparecerá aquí.</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="admin-tabla">
                  <thead>
                    <tr><th>#</th><th>Plan</th><th>Propietario / Negocio</th><th>Contacto</th><th>Estado</th><th>Recibida</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {solicitudes.map((s) => (
                      <tr key={s.id}>
                        <td>#{s.id}</td>
                        <td>{s.plan_nombre || 'Sin plan'}</td>
                        <td>
                          <div style={{ fontWeight: 'bold' }}>{s.propietario}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>{s.negocio}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>{s.telefono}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>{s.email}</div>
                          {s.provincia && <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-dim)' }}>{s.provincia}</div>}
                          {s.metodo_pago && <div style={{ fontSize: '0.75rem', color: '#00f576', marginTop: '3px' }}>Pago: {s.metodo_pago}</div>}
                        </td>
                        <td>
                          <span className={`badge-rol ${s.estado === 'Pagada' ? 'cajero' : s.estado === 'Atendida' ? 'cajero' : s.estado === 'Rechazada' ? 'default' : 'capitan'}`}>{s.estado}</span>
                          {s.comprobante && <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-dim)', marginTop: '3px' }}>Comp.: {s.comprobante}</div>}
                        </td>
                        <td>{formatearFecha(s.creado_en)}</td>
                        <td>
                          {s.estado === 'Pendiente' ? (
                            <>
                              <button className="btn-solicitud pagada" onClick={() => cambiarSolicitud(s.id, 'Pagada')}>✅ Pagada</button>
                              <button className="btn-solicitud atender" onClick={() => cambiarSolicitud(s.id, 'Atendida')}>Atender</button>
                              <button className="btn-solicitud rechazar" onClick={() => cambiarSolicitud(s.id, 'Rechazada')}>Rechazar</button>
                            </>
                          ) : (
                            <button className="btn-solicitud reabrir" onClick={() => cambiarSolicitud(s.id, 'Pendiente')}>Reabrir</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'facturas' && (
          <div className="admin-panel-lista">
            <h3 style={{ margin: '0 0 12px' }}>Facturas de activación</h3>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.9rem', marginBottom: '14px' }}>
              Facturas generadas al confirmar el pago de una licencia. Son de control interno del propietario y no están relacionadas con el sistema de facturación del restaurante.
            </p>
            {facturas.length === 0 ? (
              <p style={{ color: 'var(--admin-text-muted)' }}>Aún no hay facturas. Se generan automáticamente cuando una solicitud pasa a estado "Pagada".</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="admin-tabla">
                  <thead>
                    <tr><th>N° Factura</th><th>Fecha de pago</th><th>Cliente</th><th>Plan</th><th>Monto</th><th>Método</th><th></th></tr>
                  </thead>
                  <tbody>
                    {facturas.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{f.numero_factura}</td>
                        <td>{formatearFecha(f.pagada_en)}</td>
                        <td>
                          <div style={{ fontWeight: 'bold' }}>{f.propietario}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>{f.negocio}</div>
                        </td>
                        <td>{f.plan_nombre || 'Sin plan'}</td>
                        <td style={{ fontWeight: 'bold' }}>{f.moneda || 'RD$'} {Number(f.monto || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>
                          <span style={{ fontSize: '0.8rem' }}>{f.metodo_pago || '—'}</span>
                          {f.comprobante && <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-dim)' }}>Comp.: {f.comprobante}</div>}
                        </td>
                        <td>
                          <button className="btn-solicitud atender" onClick={() => setFacturaSeleccionada(f)}>🖨️ Ver factura</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'pagos' && (
          <div className="admin-grid-layout">
            <div className="admin-panel-lista">
              <h3 style={{ margin: '0 0 12px' }}>Métodos de pago para la web de venta</h3>
              {metodosPago.length === 0 ? (
                <p style={{ color: 'var(--admin-text-muted)' }}>Aún no hay métodos de pago. Agrega PayPal, transferencia bancaria, Binance o cripto USDT para que tus clientes sepan cómo pagar.</p>
              ) : (
                <div className="tabla-contenedor">
                  <table className="admin-tabla">
                    <thead>
                      <tr><th>Tipo</th><th>Nombre</th><th>Datos</th><th>Activo</th><th></th></tr>
                    </thead>
                    <tbody>
                      {metodosPago.map((m) => {
                        const etiquetas = etiquetaCampoMetodo(m);
                        return (
                          <tr key={m.id}>
                            <td>
                              <span className={`badge-rol ${m.tipo === 'usdt' ? 'cajero' : m.tipo === 'paypal' ? 'capitan' : 'default'}`}>
                                {TIPOS_PAGO.find((t) => t.id === m.tipo)?.label || m.tipo}
                              </span>
                            </td>
                            <td style={{ fontWeight: 'bold' }}>{m.nombre}</td>
                            <td>
                              <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                                {etiquetas.l1 && m.dato1 ? <div>{etiquetas.l1}: <strong style={{ color: 'var(--admin-text)' }}>{m.dato1}</strong></div> : null}
                                {etiquetas.l2 && m.dato2 ? <div>{etiquetas.l2}: <strong style={{ color: 'var(--admin-text)' }}>{m.dato2}</strong></div> : null}
                                {etiquetas.l3 && m.dato3 ? <div>{etiquetas.l3}: <strong style={{ color: 'var(--admin-text)' }}>{m.dato3}</strong></div> : null}
                                {!etiquetas.l1 && m.titular ? <div>Titular: {m.titular}</div> : null}
                                {m.detalle ? <div style={{ color: 'var(--admin-text-dim)' }}>{m.detalle}</div> : null}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={Boolean(m.activo)} onChange={() => guardarMetodoCambioActivo({ ...m, activo: !m.activo })} />
                            </td>
                            <td>
                              <button className="btn-accion" onClick={() => editarMetodo(m)} title="Editar">✏️</button>
                              <button className="btn-accion delete" onClick={() => eliminarMetodo(m)} title="Eliminar">🗑️</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-panel-formulario">
              <h3>{editandoMetodo ? 'Editar método de pago' : 'Nuevo método de pago'}</h3>
              <form onSubmit={guardarMetodo} style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select className="form-input" style={inputStyle} value={metodoForm.tipo} onChange={cambiarMetodoCampo('tipo')}>
                    {TIPOS_PAGO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Nombre visible</label>
                  <input className="form-input" style={inputStyle} value={metodoForm.nombre} onChange={cambiarMetodoCampo('nombre')} placeholder="Ej: PayPal, Banco Popular, Binance ID, USDT (BEP20)" />
                </div>
                {(() => {
                  const etiquetas = etiquetaCampoMetodo(metodoForm);
                  return (
                    <>
                      {etiquetas.l1 && (
                        <div>
                          <label style={labelStyle}>{etiquetas.l1}</label>
                          <input className="form-input" style={inputStyle} value={metodoForm.dato1} onChange={cambiarMetodoCampo('dato1')} placeholder={etiquetas.l1} />
                        </div>
                      )}
                      {etiquetas.l2 && (
                        <div>
                          <label style={labelStyle}>{etiquetas.l2}</label>
                          <input className="form-input" style={inputStyle} value={metodoForm.dato2} onChange={cambiarMetodoCampo('dato2')} placeholder={etiquetas.l2} />
                        </div>
                      )}
                      {etiquetas.l3 && (
                        <div>
                          <label style={labelStyle}>{etiquetas.l3}</label>
                          <input className="form-input" style={inputStyle} value={metodoForm.dato3} onChange={cambiarMetodoCampo('dato3')} placeholder={etiquetas.l3} />
                        </div>
                      )}
                      {!etiquetas.l1 && (
                        <div>
                          <label style={labelStyle}>Titular</label>
                          <input className="form-input" style={inputStyle} value={metodoForm.titular} onChange={cambiarMetodoCampo('titular')} placeholder="Nombre del titular" />
                        </div>
                      )}
                    </>
                  );
                })()}
                <div>
                  <label style={labelStyle}>Detalle / instrucciones (opcional)</label>
                  <textarea className="form-input" style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }} value={metodoForm.detalle} onChange={cambiarMetodoCampo('detalle')} placeholder="Ej: Confirma el pago enviando el comprobante por WhatsApp." />
                </div>
                <div>
                  <label style={labelStyle}>Link de pago (pasarela) — opcional</label>
                  <input className="form-input" style={inputStyle} value={metodoForm.link_pago} onChange={cambiarMetodoCampo('link_pago')} placeholder="Ej: https://paypal.me/chloerestaurant" />
                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                    Si agregas un link, el cliente podrá hacer clic en "Pagar" para abrir la pasarela. Si lo dejas vacío, se mostrará la información de pago (banco, wallet, etc.) para completar el pago.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={metodoForm.activo} onChange={(e) => setMetodoForm({ ...metodoForm, activo: e.target.checked })} /> Activo (visible en la web)</label>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-guardar-admin" type="submit">{editandoMetodo ? 'Actualizar' : 'Guardar método'}</button>
                  {editandoMetodo && (
                    <button type="button" className="btn-accion" onClick={() => { setEditandoMetodo(null); setMetodoForm(metodoVacio); }}>Cancelar</button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === 'dispositivos' && (
          <GestionDispositivos apiUrl={apiUrl} token={token} />
        )}
      </div>

      {facturaSeleccionada && (
        <FacturaActivacion
          factura={facturaSeleccionada}
          nombreNegocio={nombreNegocio}
          alCerrar={() => setFacturaSeleccionada(null)}
        />
      )}
    </div>
  );
}

export default PanelDueno;
