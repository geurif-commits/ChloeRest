import { useState, useEffect, useRef } from 'react';
import { toastAviso } from '../Toast.jsx';
import GestionDispositivos from './GestionDispositivos.jsx';
import FacturaActivacion from './FacturaActivacion.jsx';
import BotonSalirElectron from '../BotonSalirElectron.jsx';
import { Delete, LockKeyhole } from 'lucide-react';
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
  { id: 'licencias', label: '🔑 Licencias Usadas' },
  { id: 'solicitudes', label: 'Solicitudes' },
  { id: 'claves', label: 'Generar claves' },
  { id: 'planes', label: 'Planes y precios' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'pagos', label: 'Métodos de pago' },
  { id: 'dispositivos', label: 'Dispositivos' },
  { id: 'pruebas', label: 'Limpiar pruebas' },
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
  const [pinNoConfigurado, setPinNoConfigurado] = useState(false);

  const [tab, setTab] = useState('resumen');
  const [resumen, setResumen] = useState(null);
  const [planes, setPlanes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [busquedaLicencia, setBusquedaLicencia] = useState('');
  const [filtroEstadoLicencia, setFiltroEstadoLicencia] = useState('todas');
  const [accionLicenciaId, setAccionLicenciaId] = useState(null);
  const [facturas, setFacturas] = useState([]);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [metodosPago, setMetodosPago] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [confirmacionReset, setConfirmacionReset] = useState('');
  const [resetEstado, setResetEstado] = useState('');

  const headers = () => ({ 'Authorization': `Bearer ${token}` });

  const cerrarSesion = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setPin('');
    setResumen(null);
    if (alVolver) alVolver();
  };

  const revocarLicencia = async (lic) => {
    const motivo = window.prompt(`¿Deseas revocar la licencia de "${lic.nombre_negocio || lic.empresa_nombre}"? Ingresa el motivo del bloqueo:`, 'Incumplimiento o solicitud del propietario');
    if (motivo === null) return;
    setAccionLicenciaId(lic.id);
    try {
      const res = await fetch(`${apiUrl}/api/dueno/licencias/${lic.id}/revocar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ motivo: motivo.trim() || 'Revocada por el propietario' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error revocando la licencia.');
        return;
      }
      toastAviso('⛔ Licencia revocada y terminales bloqueadas.');
      cargarTodo();
    } catch {
      toastAviso('Error al revocar la licencia.');
    } finally {
      setAccionLicenciaId(null);
    }
  };

  const reactivarLicencia = async (lic) => {
    if (!window.confirm(`¿Reactivar la licencia de "${lic.nombre_negocio || lic.empresa_nombre}"? Las terminales podrán operar nuevamente.`)) return;
    setAccionLicenciaId(lic.id);
    try {
      const res = await fetch(`${apiUrl}/api/dueno/licencias/${lic.id}/reactivar`, {
        method: 'POST',
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error reactivando la licencia.');
        return;
      }
      toastAviso('✅ Licencia reactivada correctamente.');
      cargarTodo();
    } catch {
      toastAviso('Error al reactivar la licencia.');
    } finally {
      setAccionLicenciaId(null);
    }
  };

  const eliminarLicencia = async (lic) => {
    if (!window.confirm(`⚠️ ATENCIÓN: ¿Estás seguro de ELIMINAR PERMANENTEMENTE la licencia de "${lic.nombre_negocio || lic.empresa_nombre}"? Esta acción borrará el registro de la licencia del sistema.`)) return;
    setAccionLicenciaId(lic.id);
    try {
      const res = await fetch(`${apiUrl}/api/dueno/licencias/${lic.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error eliminando la licencia.');
        return;
      }
      toastAviso('🗑️ Licencia eliminada permanentemente.');
      cargarTodo();
    } catch {
      toastAviso('Error al eliminar la licencia.');
    } finally {
      setAccionLicenciaId(null);
    }
  };

  const limpiarDatosPrueba = async () => {
    if (confirmacionReset !== 'BORRAR PRUEBAS') return;
    setResetEstado('Borrando información…');
    try {
      const res = await fetch(`${apiUrl}/api/dueno/reset-pruebas`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacion: confirmacionReset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo limpiar el sistema.');
      setResetEstado(data.mensaje || 'Sistema limpiado.');
      setConfirmacionReset('');
    } catch (error) {
      setResetEstado(error.message);
    }
  };

  const cargarTodo = async (tok) => {
    const auth = tok || token;
    setCargandoDatos(true);
    try {
      const [resR, resP, resS, resF, resM, resL] = await Promise.all([
        fetch(`${apiUrl}/api/dueno/resumen`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/planes`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/solicitudes`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/facturas`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/metodos-pago`, { headers: { 'Authorization': `Bearer ${auth}` } }),
        fetch(`${apiUrl}/api/dueno/licencias`, { headers: { 'Authorization': `Bearer ${auth}` } }),
      ]);
      if (!resR.ok) {
        if (resR.status === 401) cerrarSesion();
        toastAviso('Error cargando el panel del propietario.');
        return;
      }
      const [dR, dP, dS, dF, dM, dL] = await Promise.all([resR.json(), resP.json(), resS.json(), resF.json(), resM.json(), resL.json()]);
      setResumen(dR);
      setPlanes(dP.planes || []);
      setSolicitudes(dS.solicitudes || []);
      setFacturas(dF.facturas || []);
      setMetodosPago(dM.metodos || []);
      setLicencias(dL.licencias || []);
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
        if (data.pinNoConfigurado) {
          setPinNoConfigurado(true);
          setErrorLogin('');
          setPin('');
        } else {
          setErrorLogin(data.error || 'PIN incorrecto.');
          setPin('');
        }
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

  const establecerPin = async (e) => {
    if (e) e.preventDefault();
    if (!pin || cargando) return;
    setCargando(true);
    setErrorLogin('');
    try {
      const res = await fetch(`${apiUrl}/api/dueno/establecer-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorLogin(data.error || 'Error al establecer el PIN.');
        setPin('');
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPinNoConfigurado(false);
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
    if (!token && !pinNoConfigurado && pinLongitud > 0 && pin.length === pinLongitud) login();
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
        if (pinNoConfigurado) {
          if (pin.length >= 4) establecerPin();
        } else {
          if (pinLongitud === 0 || pin.length === pinLongitud) login();
        }
      }
    };
    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pin, pinLongitud, pinNoConfigurado]);

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
  const [pinInicialGenerado, setPinInicialGenerado] = useState('');

  const generarClave = async () => {
    setClaveGenerada('');
    setPinInicialGenerado('');
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
      setPinInicialGenerado(data.pinInicial || '');
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
      toastAviso(data.eliminada ? '🗑️ Solicitud rechazada y eliminada automáticamente.' : `Solicitud marcada como "${estado}".`);
      cargarTodo();
    } catch {
      toastAviso('Error actualizando la solicitud.');
    }
  };

  const eliminarSolicitud = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente la solicitud de "${nombre}"?`)) return;
    try {
      const res = await fetch(`${apiUrl}/api/dueno/solicitudes/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error eliminando solicitud.');
        return;
      }
      toastAviso('🗑️ Solicitud eliminada correctamente.');
      cargarTodo();
    } catch {
      toastAviso('Error eliminando solicitud.');
    }
  };

  // Scaffold para la generación de claves desde las solicitudes
  const [durSolicitud, setDurSolicitud] = useState({});
  const [enviandoClave, setEnviandoClave] = useState(null);
  const [enviandoEmail, setEnviandoEmail] = useState(null);
  const [filtroSolicitud, setFiltroSolicitud] = useState('pendientes');
  const [modalEmail, setModalEmail] = useState(null);

  const duracionEtiqueta = (codigo) => {
    const match = DURACIONES.find((d) => d.codigo === codigo);
    return match ? match.etiqueta : codigo;
  };

  const generarClaveSolicitud = async (sol) => {
    const dur = durSolicitud[sol.id] || sol.plan_duracion || '30D';
    setEnviandoClave(sol.id);
    try {
      const res = await fetch(`${apiUrl}/api/dueno/solicitudes/${sol.id}/generar-clave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ duracion: dur }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error generando la clave.');
        return;
      }
      toastAviso(
        data.reutilizada
          ? 'La clave de esta solicitud ya había sido generada.'
          : (data.enviadaPorTelegram ? 'Clave generada y enviada por Telegram.' : 'Clave generada (no se pudo enviar por Telegram).')
      );
      cargarTodo();
    } catch {
      toastAviso('Error generando la clave.');
    } finally {
      setEnviandoClave(null);
    }
  };

  const enviarEmailActivacion = async (sol) => {
    setEnviandoEmail(sol.id);
    try {
      const res = await fetch(`${apiUrl}/api/dueno/solicitudes/${sol.id}/enviar-email`, {
        method: 'POST',
        headers: headers(),
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error al preparar el correo.');
        return;
      }
      toastAviso(`📧 Correo preparado para ${sol.email}`);
      setModalEmail(data);
      if (data.mailtoUrl) {
        window.open(data.mailtoUrl, '_blank');
      }
      cargarTodo();
    } catch {
      toastAviso('Error enviando el correo.');
    } finally {
      setEnviandoEmail(null);
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
    const pinInput = (
      <div className="owner-pin-display" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[...Array(pinLongitud > 0 ? pinLongitud : 6)].map((_, i) => (
          <span key={i} style={{
            width: '40px', height: '40px', borderRadius: '8px', border: '2px solid #d6a44d',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
            background: i < pin.length ? '#d6a44d' : 'transparent',
            color: i < pin.length ? '#000' : 'transparent'
          }}>
            •
          </span>
        ))}
      </div>
    );

    const numpad = (
      <div className="owner-pin-keypad" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px', maxWidth: '240px', margin: '0 auto 12px auto' }}>
        {['1','2','3','4','5','6','7','8','9'].map((n) => (
          <button className="owner-pin-key" key={n} type="button" onClick={() => agregarNumeroPin(n)}>{n}</button>
        ))}
        <button className="owner-pin-key owner-pin-delete" type="button" onClick={borrarNumeroPin} aria-label="Borrar último dígito"><Delete size={18} /></button>
        <button className="owner-pin-key" type="button" onClick={() => agregarNumeroPin('0')}>0</button>
        <button
          type="submit"
          disabled={cargando || pin.length < (pinNoConfigurado ? 4 : (pinLongitud > 0 ? pinLongitud : 4))}
          className="owner-pin-enter"
          aria-label="Confirmar PIN"
        >
          →
        </button>
      </div>
    );

    return (
      <div className="owner-pin-screen" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh', maxHeight: '100dvh', background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, fontFamily: 'sans-serif', padding: '16px', boxSizing: 'border-box', overflow: 'auto' }}>
        <BotonSalirElectron />
        <div className="owner-pin-card" style={{ background: '#181820', border: '2px solid #d6a44d', borderRadius: '16px', padding: '24px 20px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(214,164,77,0.2)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="owner-pin-badge"><LockKeyhole size={22} /></div>

          {pinNoConfigurado ? (
            <>
              <h2 style={{ color: '#d6a44d', fontSize: '1.2rem', margin: '0 0 8px 0' }}>Configurar PIN del Propietario</h2>
              <p style={{ color: '#9494ad', fontSize: '0.82rem', marginBottom: '16px', lineHeight: '1.4' }}>
                El PIN del propietario no ha sido configurado. Ingresa un PIN de 4 a 12 digitos para acceder al panel.
              </p>
              <form onSubmit={establecerPin}>
                {pinInput}
                {errorLogin && <p style={{ color: '#ff5252', fontSize: '0.8rem', margin: '0 0 8px 0' }}>{errorLogin}</p>}
                {numpad}
                <p style={{ color: '#88889d', fontSize: '0.68rem', margin: '0 0 10px 0' }}>
                  Minimo 4 digitos. Este PIN se usara para acceder al panel del propietario.
                </p>
                {cargando && <p style={{ color: '#d6a44d', fontSize: '0.8rem', margin: '0 0 8px 0' }}>Configurando...</p>}
              </form>
            </>
          ) : (
            <>
              <div className="owner-pin-kicker">OWNER ACCESS · CHLOERESTAURANT</div>
              <h2 style={{ color: '#d6a44d', fontSize: '1.3rem', margin: '0 0 8px 0' }}>Acceso del propietario</h2>
              <p style={{ color: '#9494ad', fontSize: '0.85rem', marginBottom: '16px', lineHeight: '1.4' }}>
                Acceso universal y exclusivo del dueño del sistema. Ingresa tu PIN para administrar planes, precios, claves, solicitudes y dispositivos.
              </p>
              <form onSubmit={login}>
                {pinInput}
                {errorLogin && <p style={{ color: '#ff5252', fontSize: '0.8rem', margin: '0 0 8px 0' }}>{errorLogin}</p>}
                {numpad}
                <p style={{ color: '#88889d', fontSize: '0.68rem', margin: '0 0 10px 0' }}>
                  Digita tu PIN y confirma para continuar.
                </p>
                {cargando && <p style={{ color: '#d6a44d', fontSize: '0.8rem', margin: '0 0 8px 0' }}>Verificando...</p>}
              </form>
            </>
          )}

          <button onClick={alVolver} style={{ marginTop: 'auto', background: 'transparent', color: '#d6a44d', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', fontWeight: 600 }}>
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
      <div style={{ flexShrink: 0, background: 'linear-gradient(135deg, var(--bg-primary), var(--bg-elevated))', borderBottom: '1px solid rgba(214,164,77,0.35)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(214,164,77,0.16)', border: '1px solid rgba(214,164,77,0.5)', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>👑</div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--kpi-gold)', fontWeight: 700 }}>Panel del Propietario</div>
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
                <h2 style={{ color: 'var(--kpi-green)' }}>{resumen?.solicitudes?.pagadas || 0}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Facturas emitidas</h4>
                <h2 style={{ color: 'var(--kpi-cyan)' }}>{resumen?.facturas?.total || 0}</h2>
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

        {tab === 'licencias' && (
          <div className="admin-panel-lista">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔑 Licencias Emitidas, Activas y Usadas
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                  Control de licencias y terminales. Puedes revocar el acceso a cualquier restaurante o eliminar licencias permanentemente.
                </span>
              </div>

              {/* Controles de filtro y búsqueda */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por negocio, clave, dueño..."
                  value={busquedaLicencia}
                  onChange={(e) => setBusquedaLicencia(e.target.value)}
                  style={{ ...inputStyle, width: '240px', padding: '6px 12px', fontSize: '0.82rem' }}
                />
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input, rgba(255,255,255,0.03))', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  {[
                    { id: 'todas', label: `Todas (${licencias.length})` },
                    { id: 'activas', label: `Activas (${licencias.filter(l => l.activa && !l.revocada).length})` },
                    { id: 'revocadas', label: `Revocadas (${licencias.filter(l => !l.activa || l.revocada).length})` },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltroEstadoLicencia(f.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: filtroEstadoLicencia === f.id ? 'var(--gold, #f5b842)' : 'transparent',
                        color: filtroEstadoLicencia === f.id ? '#000' : 'var(--admin-text-muted)',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tarjetas resumen de licencias */}
            <div className="tarjetas-grid" style={{ marginBottom: '18px' }}>
              <div className="tarjeta-resumen">
                <h4>Total Licencias</h4>
                <h2 style={{ color: 'var(--text-primary)' }}>{licencias.length}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Licencias Activas</h4>
                <h2 style={{ color: 'var(--kpi-green)' }}>{licencias.filter(l => l.activa && !l.revocada).length}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Licencias Revocadas</h4>
                <h2 style={{ color: 'var(--kpi-red)' }}>{licencias.filter(l => !l.activa || l.revocada).length}</h2>
              </div>
              <div className="tarjeta-resumen">
                <h4>Terminales POS Vinculadas</h4>
                <h2 style={{ color: 'var(--kpi-cyan)' }}>{licencias.reduce((acc, l) => acc + (l.total_dispositivos || 0), 0)}</h2>
              </div>
            </div>

            {(() => {
              const filtradas = licencias.filter(l => {
                if (filtroEstadoLicencia === 'activas' && (!l.activa || l.revocada)) return false;
                if (filtroEstadoLicencia === 'revocadas' && (l.activa && !l.revocada)) return false;
                if (!busquedaLicencia.trim()) return true;
                const q = busquedaLicencia.toLowerCase();
                return (
                  (l.clave && l.clave.toLowerCase().includes(q)) ||
                  (l.nombre_negocio && l.nombre_negocio.toLowerCase().includes(q)) ||
                  (l.empresa_nombre && l.empresa_nombre.toLowerCase().includes(q)) ||
                  (l.propietario && l.propietario.toLowerCase().includes(q)) ||
                  (l.email && l.email.toLowerCase().includes(q))
                );
              });

              if (filtradas.length === 0) {
                return (
                  <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--admin-border)' }}>
                    <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.9rem' }}>
                      No se encontraron licencias con los filtros seleccionados.
                    </p>
                  </div>
                );
              }

              return (
                <div className="tabla-contenedor">
                  <table className="admin-tabla">
                    <thead>
                      <tr>
                        <th># ID</th>
                        <th>Restaurante / Negocio</th>
                        <th>Clave de Licencia</th>
                        <th>Plan / Duración</th>
                        <th>Contacto</th>
                        <th>Terminales</th>
                        <th>Estado</th>
                        <th>Activada / Vencimiento</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map(lic => {
                        const estaActiva = lic.activa && !lic.revocada;
                        return (
                          <tr key={lic.id} style={{ opacity: estaActiva ? 1 : 0.75 }}>
                            <td style={{ fontWeight: 'bold' }}>#{lic.id}</td>
                            <td>
                              <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{lic.nombre_negocio || lic.empresa_nombre}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-dim)' }}>Empresa ID: {lic.empresa_id}</div>
                            </td>
                            <td>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: 'var(--kpi-gold)', wordBreak: 'break-all' }}>
                                {lic.clave}
                              </div>
                              <button
                                className="btn-solicitud atender"
                                style={{ padding: '2px 6px', fontSize: '0.7rem', marginTop: '4px' }}
                                onClick={() => copiarClave(lic.clave)}
                              >
                                📋 Copiar
                              </button>
                            </td>
                            <td>
                              <span className="badge-rol cajero" style={{ fontSize: '0.75rem' }}>
                                {duracionEtiqueta(lic.duracion_codigo)}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{lic.propietario || '—'}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{lic.email}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)' }}>{lic.telefono}</div>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: lic.dispositivos_activos > 0 ? 'var(--kpi-green)' : 'var(--admin-text-muted)' }}>
                                {lic.dispositivos_activos || 0} activos
                              </span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)' }}>
                                {lic.total_dispositivos || 0} total
                              </div>
                            </td>
                            <td>
                              {estaActiva ? (
                                <span className="badge-rol cajero" style={{ background: 'rgba(0,245,118,0.15)', color: 'var(--kpi-green)', border: '1px solid rgba(0,245,118,0.3)' }}>
                                  🟢 Activa
                                </span>
                              ) : (
                                <div>
                                  <span className="badge-rol default" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--kpi-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                    ⛔ Revocada
                                  </span>
                                  {lic.motivo_revocacion && (
                                    <div style={{ fontSize: '0.68rem', color: 'var(--kpi-red)', marginTop: '2px' }}>
                                      {lic.motivo_revocacion}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: '0.78rem' }}>
                                {formatearFecha(lic.activada_en || lic.creado_en)}
                              </div>
                              {lic.vencimiento && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)', marginTop: '2px' }}>
                                  Vence: {new Date(lic.vencimiento).toLocaleDateString()}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {estaActiva ? (
                                  <button
                                    className="btn-solicitud rechazar"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                    disabled={accionLicenciaId === lic.id}
                                    onClick={() => revocarLicencia(lic)}
                                    title="Bloquear terminales y revocar esta licencia"
                                  >
                                    ⛔ Revocar
                                  </button>
                                ) : (
                                  <button
                                    className="btn-solicitud pagada"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                    disabled={accionLicenciaId === lic.id}
                                    onClick={() => reactivarLicencia(lic)}
                                    title="Desbloquear y reactivar esta licencia"
                                  >
                                    ✅ Reactivar
                                  </button>
                                )}

                                <button
                                  className="btn-accion delete"
                                  style={{ fontSize: '0.72rem', padding: '3px 7px', alignSelf: 'flex-start' }}
                                  disabled={accionLicenciaId === lic.id}
                                  onClick={() => eliminarLicencia(lic)}
                                  title="Eliminar licencia permanentemente"
                                >
                                  🗑️ Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
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
                  <select className="form-input" style={{ ...inputStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' }} value={planForm.duracion_codigo} onChange={(e) => setPlanForm({ ...planForm, duracion_codigo: e.target.value })}>
                    {DURACIONES.map((d) => <option key={d.codigo} value={d.codigo} style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>{d.etiqueta}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Precio</label>
                    <input className="form-input money-input" style={inputStyle} type="number" min="0" step="0.1" value={planForm.precio} onChange={(e) => setPlanForm({ ...planForm, precio: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>Moneda</label>
                    <select className="form-input" style={{ ...inputStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' }} value={planForm.moneda} onChange={(e) => setPlanForm({ ...planForm, moneda: e.target.value })}>
                      <option style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>RD$</option>
                      <option style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>US$</option>
                      <option style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>€</option>
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
                {pinInicialGenerado && (
                  <p style={{ color: 'var(--kpi-gold)', margin: '10px 0 0', fontSize: '0.85rem' }}>
                    PIN inicial del Administrador: <code>{pinInicialGenerado}</code>. Entrégalo junto con la clave; se exigirá cambiarlo en el primer acceso.
                  </p>
                )}
              </div>
            )}

            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.8rem', marginTop: '12px' }}>
              La clave maestra antigua <code>{resumen?.claveMaestra || 'CHLOE-...'}</code> sigue funcionando como licencia Vitalicia.
            </p>
          </div>
        )}

        {tab === 'solicitudes' && (
          <div className="admin-panel-lista">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Gestión de Solicitudes y Licencias</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Administra las solicitudes entrantes, genera licencias y envía las instrucciones a los clientes.
                </span>
              </div>

              {/* Subtabs: Pendientes / Histórico / Todas */}
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-input, rgba(255,255,255,0.03))', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                {[
                  { id: 'pendientes', label: `📥 Pendientes (${solicitudes.filter(s => s.estado === 'Pendiente').length})` },
                  { id: 'historico', label: `📜 Histórico Atendidas (${solicitudes.filter(s => s.estado === 'Atendida' || s.estado === 'Pagada').length})` },
                  { id: 'todas', label: `📑 Todas (${solicitudes.length})` }
                ].map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setFiltroSolicitud(sub.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: filtroSolicitud === sub.id ? 'var(--gold, #f5b842)' : 'transparent',
                      color: filtroSolicitud === sub.id ? '#000' : 'var(--admin-text-muted)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const filtradas = solicitudes.filter((s) => {
                if (filtroSolicitud === 'pendientes') return s.estado === 'Pendiente';
                if (filtroSolicitud === 'historico') return s.estado === 'Atendida' || s.estado === 'Pagada';
                return true;
              });

              if (filtradas.length === 0) {
                return (
                  <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--admin-border)' }}>
                    <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.9rem' }}>
                      {filtroSolicitud === 'pendientes'
                        ? '✨ No hay solicitudes pendientes de atender. Las solicitudes nuevas aparecerán aquí.'
                        : 'No hay registros en esta sección.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="tabla-contenedor">
                  <table className="admin-tabla">
                    <thead>
                      <tr><th>#</th><th>Plan</th><th>Propietario / Negocio</th><th>Contacto</th><th>Estado</th><th>Clave Asignada</th><th>Recibida</th><th>Acciones</th></tr>
                    </thead>
                    <tbody>
                      {filtradas.map((s) => (
                        <tr key={s.id}>
                          <td>#{s.id}</td>
                          <td>
                            {s.plan_nombre || 'Sin plan'}
                            {s.plan_duracion && <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-dim)' }}>{duracionEtiqueta(s.plan_duracion)}</div>}
                          </td>
                          <td>
                            <div style={{ fontWeight: 'bold' }}>{s.propietario}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>{s.negocio}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.85rem' }}>{s.telefono}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>{s.email}</div>
                            {s.provincia && <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-dim)' }}>{s.provincia}</div>}
                            {s.metodo_pago && <div style={{ fontSize: '0.75rem', color: 'var(--kpi-green)', marginTop: '3px' }}>Pago: {s.metodo_pago}</div>}
                          </td>
                          <td>
                            <span className={`badge-rol ${s.estado === 'Pagada' ? 'cajero' : s.estado === 'Atendida' ? 'cajero' : s.estado === 'Rechazada' ? 'default' : 'capitan'}`}>{s.estado}</span>
                            {s.comprobante && <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-dim)', marginTop: '3px' }}>Comp.: {s.comprobante}</div>}
                          </td>
                          <td>
                            {s.clave_generada ? (
                              <div>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--kpi-gold)', wordBreak: 'break-all' }}>{s.clave_generada}</div>
                                {s.clave_pin_inicial && <div style={{ fontSize: '0.68rem', color: 'var(--kpi-gold)' }}>PIN: {s.clave_pin_inicial}</div>}
                                {s.clave_enviada_en ? (
                                  <div style={{ fontSize: '0.68rem', color: 'var(--kpi-green)' }}>Clave Entregada ✓</div>
                                ) : (
                                  <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-dim)' }}>Sin enviar aún</div>
                                )}
                                <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                                  <button className="btn-solicitud atender" style={{ padding: '3px 7px', fontSize: '0.72rem' }} onClick={() => copiarClave(s.clave_generada)}>📋 Copiar</button>
                                  {s.email && (
                                    <button
                                      className="btn-solicitud atender"
                                      style={{ padding: '3px 7px', fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.35)', color: 'var(--kpi-cyan)' }}
                                      onClick={() => enviarEmailActivacion(s)}
                                      disabled={enviandoEmail === s.id}
                                      title="Enviar correo con la clave, pasos de activación y soporte"
                                    >
                                      📧 {enviandoEmail === s.id ? 'Enviando…' : 'Enviar Email'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--admin-text-dim)' }}>—</span>
                            )}
                          </td>
                          <td>{formatearFecha(s.creado_en)}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {s.estado === 'Pendiente' ? (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <button className="btn-solicitud pagada" onClick={() => cambiarSolicitud(s.id, 'Pagada')}>✅ Pagada</button>
                                  <button className="btn-solicitud atender" onClick={() => cambiarSolicitud(s.id, 'Atendida')}>Atender</button>
                                  <button className="btn-solicitud rechazar" onClick={() => cambiarSolicitud(s.id, 'Rechazada')} title="Rechazar y eliminar automáticamente">❌ Rechazar</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <button className="btn-solicitud reabrir" onClick={() => cambiarSolicitud(s.id, 'Pendiente')}>Reabrir</button>
                                </div>
                              )}

                              {!s.clave_generada && (
                                <div style={{ marginTop: '4px', borderTop: '1px dashed var(--admin-border)', paddingTop: '6px' }}>
                                  <select
                                    className="form-input"
                                    style={{ ...inputStyle, width: '100%', marginBottom: '4px', padding: '4px 6px', fontSize: '0.74rem' }}
                                    value={durSolicitud[s.id] || s.plan_duracion || '30D'}
                                    onChange={(e) => setDurSolicitud((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                  >
                                    {DURACIONES.map((d) => <option key={d.codigo} value={d.codigo}>{d.etiqueta}</option>)}
                                  </select>
                                  <button
                                    className="btn-solicitud atender"
                                    style={{ width: '100%', fontSize: '0.74rem' }}
                                    disabled={enviandoClave === s.id}
                                    onClick={() => generarClaveSolicitud(s)}
                                  >
                                    {enviandoClave === s.id ? 'Generando…' : '🔑 Generar Clave'}
                                  </button>
                                </div>
                              )}

                              <button
                                className="btn-accion delete"
                                style={{ alignSelf: 'flex-start', marginTop: '2px', padding: '4px 8px', fontSize: '0.72rem' }}
                                onClick={() => eliminarSolicitud(s.id, s.negocio || s.propietario)}
                                title="Eliminar solicitud permanentemente"
                              >
                                🗑️ Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── Modal de Correo de Activación ── */}
            {modalEmail && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9999,
                  background: 'rgba(0,0,0,0.8)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px'
                }}
                onClick={() => setModalEmail(null)}
              >
                <div
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    maxWidth: '620px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: '24px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📧 Correo de Activación
                    </h3>
                    <button
                      onClick={() => setModalEmail(null)}
                      style={{ background: 'var(--bg-elevated)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    Destinatario: <strong style={{ color: 'var(--text-primary)' }}>{modalEmail.email}</strong> • Asunto: <strong style={{ color: 'var(--kpi-gold)' }}>{modalEmail.asunto}</strong>
                  </p>

                  <div style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '14px',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: 1.4
                  }}>
                    {modalEmail.texto}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="topbar-btn"
                      onClick={() => {
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(modalEmail.texto);
                          toastAviso('📋 Instrucciones y clave copiadas al portapapeles.');
                        }
                      }}
                      style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                    >
                      📋 Copiar Texto Completo
                    </button>
                    {modalEmail.mailtoUrl && (
                      <a
                        href={modalEmail.mailtoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-solicitud atender"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', padding: '8px 16px', fontSize: '0.82rem' }}
                      >
                        ✉️ Abrir en Mi Correo
                      </a>
                    )}
                  </div>
                </div>
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

        {tab === 'pruebas' && (
          <div className="admin-panel-formulario reset-pruebas-panel">
            <h3>Limpiar datos de pruebas</h3>
            <p>Elimina productos, usuarios, pedidos, mesas, inventario, configuración y licencias de prueba. El sistema quedará listo para ejecutar nuevamente el Setup Wizard.</p>
            <p className="reset-pruebas-advertencia">Esta operación es irreversible. Haz un respaldo antes de continuar.</p>
            <label style={labelStyle}>Escribe BORRAR PRUEBAS</label>
            <input className="form-input" style={inputStyle} value={confirmacionReset} onChange={(e) => setConfirmacionReset(e.target.value.toUpperCase())} placeholder="BORRAR PRUEBAS" />
            <button className="btn-solicitud rechazar" type="button" disabled={confirmacionReset !== 'BORRAR PRUEBAS'} onClick={limpiarDatosPrueba}>Eliminar datos de prueba</button>
            {resetEstado && <p>{resetEstado}</p>}
          </div>
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
