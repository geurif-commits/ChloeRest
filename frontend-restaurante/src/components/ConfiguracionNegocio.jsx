import { useState, useEffect, useRef } from 'react';
import { toastAviso, toastError } from './Toast.jsx';
import {
  Store, Key, Building2, Receipt, Palette, Printer, FileText, Save,
  CreditCard, Pencil, Trash2, Plus, CheckCircle2, ShieldCheck, Sparkles,
  Layers, Sliders, Smartphone, QrCode, DollarSign, RefreshCw, ChevronRight
} from 'lucide-react';
import './admin/admin.css';

const SUBPESTANAS = [
  { id: 'identidad', label: 'Identidad & Perfil', icon: Building2, desc: 'Nombre, RNC, dirección y logo' },
  { id: 'licencia', label: 'Licencia & Plan', icon: Key, desc: 'Estado, vigencia y renovación' },
  { id: 'fiscal', label: 'Fiscal & Cuentas', icon: Receipt, desc: 'Impuestos y transferencias bancarias' },
  { id: 'estaciones', label: 'Estaciones & Despacho', icon: Printer, desc: 'Cocina, Bar e impresoras térmicas' },
  { id: 'tickets', label: 'Formato de Tickets', icon: FileText, desc: 'Tipografía, márgenes y QR' },
];

export default function ConfiguracionNegocio({ alVolver, apiUrl, alVerificarLicencia }) {
  const [subpestana, setSubpestana] = useState('identidad');
  const [formData, setFormData] = useState({
    nombre_comercial: '',
    razon_social: '',
    rnc: '',
    telefono: '',
    direccion: '',
    provincia: 'La Romana',
    regimen_fiscal: 'Ordinario',
    nombre_cocina: 'Cocina',
    nombre_bar: 'Bar',
    duracion_meses: 0,
    logo_url: '',
    cobrar_itbis: true,
    cobrar_propina: true,
    mesa_color_disponible: '#00f576',
    mesa_color_ocupada: '#ff4444',
    mesa_color_reservada: '#d6a44d',
    comanda_modo: 'kds',
    ticket_font_family: 'Inter',
    ticket_font_size: '12',
    ticket_logo_position: 'top',
    ticket_show_qr: true,
    ticket_margin: 'normal'
  });
  const [archivoLogo, setArchivoLogo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);
  const urlBase = apiUrl;

  const [claveMaestra, setClaveMaestra] = useState('');
  const [duracionActivar, setDuracionActivar] = useState('12');
  const [activando, setActivando] = useState(false);
  const [estadoLicencia, setEstadoLicencia] = useState(null);

  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [editandoCuenta, setEditandoCuenta] = useState(null);
  const [formCuenta, setFormCuenta] = useState({ nombre_banco: '', tipo_cuenta: 'Corriente', numero_cuenta: '', titular: '' });
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const [impresoras, setImpresoras] = useState([]);
  const [impresorasEstacion, setImpresorasEstacion] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chloe_impresoras') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    cargarConfiguracion();
    verificarLicencia();
    cargarCuentasBancarias();
    window.electronPOS?.listarImpresoras?.().then((lista) => setImpresoras(Array.isArray(lista) ? lista : [])).catch(() => {});
  }, []);

  const guardarImpresorasEstacion = (next) => {
    setImpresorasEstacion(next);
    localStorage.setItem('chloe_impresoras', JSON.stringify(next));
  };

  const verificarLicencia = async () => {
    try {
      const res = await fetch(`${urlBase}/api/licencia/verificar`);
      if (res.ok) {
        const data = await res.json();
        setEstadoLicencia(data);
      }
    } catch {}
  };

  const cargarCuentasBancarias = async () => {
    try {
      const res = await fetch(`${urlBase}/api/cuentas-bancarias`);
      if (res.ok) {
        const data = await res.json();
        setCuentasBancarias(data);
      }
    } catch {}
  };

  const guardarCuentaBancaria = async () => {
    if (!formCuenta.nombre_banco?.trim() || !formCuenta.numero_cuenta?.trim() || !formCuenta.titular?.trim()) {
      return toastAviso("Completa banco, número de cuenta y titular.");
    }
    setGuardandoCuenta(true);
    try {
      const url = editandoCuenta ? `${urlBase}/api/cuentas-bancarias/${editandoCuenta.id}` : `${urlBase}/api/cuentas-bancarias`;
      const res = await fetch(url, {
        method: editandoCuenta ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formCuenta)
      });
      if (res.ok) {
        toastAviso(editandoCuenta ? "✅ Cuenta bancaria actualizada." : "✨ Cuenta bancaria agregada.");
        setFormCuenta({ nombre_banco: '', tipo_cuenta: 'Corriente', numero_cuenta: '', titular: '' });
        setEditandoCuenta(null);
        cargarCuentasBancarias();
      } else {
        const data = await res.json();
        toastAviso(data.error || 'Error al guardar la cuenta.');
      }
    } catch {
      toastAviso("Error de conexión al guardar cuenta.");
    } finally {
      setGuardandoCuenta(false);
    }
  };

  const eliminarCuentaBancaria = async (id) => {
    if (!confirm("¿Deseas eliminar esta cuenta bancaria?")) return;
    try {
      const res = await fetch(`${urlBase}/api/cuentas-bancarias/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toastAviso("🗑️ Cuenta eliminada.");
        cargarCuentasBancarias();
      }
    } catch {
      toastAviso("Error de conexión.");
    }
  };

  const editarCuenta = (cuenta) => {
    setEditandoCuenta(cuenta);
    setFormCuenta({ nombre_banco: cuenta.nombre_banco, tipo_cuenta: cuenta.tipo_cuenta, numero_cuenta: cuenta.numero_cuenta, titular: cuenta.titular });
  };

  const licenciaActiva = estadoLicencia && !estadoLicencia.bloqueado && !estadoLicencia.esNuevo && estadoLicencia.tipo !== 'Vitalicia' && estadoLicencia.diasRestantes > 0;
  const licenciaVitalicia = estadoLicencia && !estadoLicencia.bloqueado && estadoLicencia.tipo === 'Vitalicia';
  const mostrarActivacion = !licenciaActiva && !licenciaVitalicia;

  const cargarConfiguracion = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${urlBase}/api/negocio/config`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          ...data,
          cobrar_itbis: data.cobrar_itbis ?? true,
          cobrar_propina: data.cobrar_propina ?? true
        });
      }
    } catch {
      console.log("Cargando datos por defecto.");
    } finally {
      setCargando(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
  };

  const handleArchivo = (e) => {
    setArchivoLogo(e.target.files[0]);
  };

  const activarLicencia = async (e) => {
    e.preventDefault();
    if (!claveMaestra) return toastAviso("Digita la clave maestra de activación.");
    setActivando(true);
    try {
      const res = await fetch(`${urlBase}/api/licencia/activar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duracion_meses: parseInt(duracionActivar, 10),
          clave_maestra: claveMaestra
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje || '✅ Licencia activada exitosamente.');
        setClaveMaestra('');
        cargarConfiguracion();
        verificarLicencia();
        if (alVerificarLicencia) alVerificarLicencia();
      } else {
        toastAviso(data.error || 'Error al activar la licencia.');
      }
    } catch {
      toastAviso("Error de conexión al activar la licencia.");
    } finally {
      setActivando(false);
    }
  };

  const guardarNegocio = async (e) => {
    if (e) e.preventDefault();
    setGuardando(true);
    const dataToSend = new FormData();
    dataToSend.append('nombre_comercial', formData.nombre_comercial);
    dataToSend.append('razon_social', formData.razon_social);
    dataToSend.append('rnc', formData.rnc);
    dataToSend.append('telefono', formData.telefono);
    dataToSend.append('direccion', formData.direccion);
    dataToSend.append('provincia', formData.provincia);
    dataToSend.append('regimen_fiscal', formData.regimen_fiscal);
    dataToSend.append('nombre_cocina', formData.nombre_cocina);
    dataToSend.append('nombre_bar', formData.nombre_bar);
    dataToSend.append('duracion_meses', formData.duracion_meses);
    dataToSend.append('cobrar_itbis', formData.cobrar_itbis);
    dataToSend.append('cobrar_propina', formData.cobrar_propina);
    dataToSend.append('mesa_color_disponible', formData.mesa_color_disponible);
    dataToSend.append('mesa_color_ocupada', formData.mesa_color_ocupada);
    dataToSend.append('mesa_color_reservada', formData.mesa_color_reservada);
    dataToSend.append('comanda_modo', formData.comanda_modo || 'kds');
    dataToSend.append('ticket_font_family', formData.ticket_font_family || 'Inter');
    dataToSend.append('ticket_font_size', formData.ticket_font_size || '12');
    dataToSend.append('ticket_logo_position', formData.ticket_logo_position || 'top');
    dataToSend.append('ticket_show_qr', formData.ticket_show_qr !== false);
    dataToSend.append('ticket_margin', formData.ticket_margin || 'normal');
    
    if (archivoLogo) {
      dataToSend.append('logo_archivo', archivoLogo);
    } else if (formData.logo_url) {
      dataToSend.append('logo_url_link', formData.logo_url);
    }

    try {
      const res = await fetch(`${urlBase}/api/negocio/config`, {
        method: 'POST',
        body: dataToSend
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso('💾 Configuración guardada correctamente.');
        if (alVerificarLicencia) alVerificarLicencia();
        if (alVolver) alVolver();
      } else {
        toastAviso(data.error || 'Error al guardar.');
      }
    } catch {
      toastError("Error de conexión al guardar configuración.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
        <p>Cargando perfil de la empresa...</p>
      </div>
    );
  }

  const logoVista = archivoLogo ? URL.createObjectURL(archivoLogo) : formData.logo_url;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      
      {/* ── Sub-navegación por Pestañas ── */}
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid var(--border-subtle)' }}>
        {SUBPESTANAS.map((pest) => {
          const Icono = pest.icon;
          const activa = subpestana === pest.id;
          return (
            <button
              key={pest.id}
              type="button"
              onClick={() => setSubpestana(pest.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: activa ? '1px solid var(--gold, #f5b842)' : '1px solid var(--border-subtle)',
                background: activa ? 'rgba(245, 184, 61, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                color: activa ? 'var(--gold, #f5b842)' : 'var(--admin-text-muted)',
                fontWeight: activa ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icono size={16} />
              <span>{pest.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── PESTAÑA 1: IDENTIDAD & PERFIL COMERCIAL ── */}
      {subpestana === 'identidad' && (
        <form onSubmit={guardarNegocio} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Identidad del Negocio</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Configura el nombre comercial, RNC y datos de contacto de tu establecimiento.
                </p>
              </div>
            </div>

            {/* Selector de Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '70px', height: '70px', borderRadius: '12px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                {logoVista ? (
                  <img src={logoVista} alt="Logo Negocio" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Store size={32} style={{ color: '#0f172a' }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <strong style={{ color: '#fff', fontSize: '0.88rem' }}>Logotipo del Establecimiento</strong>
                <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                  Aparece en tickets de impresión, facturas DGII y pantallas del sistema.
                </span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="admin-btn admin-btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    Subir nuevo logo
                  </button>
                  <input type="file" accept="image/*" onChange={handleArchivo} ref={fileRef} style={{ display: 'none' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Nombre Comercial *</label>
                <input
                  type="text"
                  name="nombre_comercial"
                  value={formData.nombre_comercial}
                  onChange={handleChange}
                  required
                  placeholder="Ej: Chloe Restaurant Gourmet"
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Razón Social *</label>
                <input
                  type="text"
                  name="razon_social"
                  value={formData.razon_social}
                  onChange={handleChange}
                  required
                  placeholder="Ej: Chloe Inversiones SRL"
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">RNC / Cédula *</label>
                <input
                  type="text"
                  name="rnc"
                  value={formData.rnc}
                  onChange={handleChange}
                  required
                  maxLength="11"
                  placeholder="Ej: 131234567"
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Teléfono de Contacto</label>
                <input
                  type="text"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  placeholder="Ej: 809-555-1234"
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">Dirección Física del Establecimiento</label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleChange}
                  placeholder="Ej: Av. Santa Rosa #45, La Romana, Rep. Dom."
                  className="admin-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={guardando}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Save size={16} />
              {guardando ? 'Guardando cambios...' : 'Guardar Identidad del Negocio'}
            </button>
          </div>

        </form>
      )}

      {/* ── PESTAÑA 2: LICENCIA & PLAN ── */}
      {subpestana === 'licencia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Tarjeta de Estado Actual */}
          <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Estado de Licencia del Restaurante</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Consulta la vigencia de tu plan multiempresa y renueva tu acceso.
                </p>
              </div>
            </div>

            {licenciaVitalicia ? (
              <div style={{ background: 'rgba(245, 184, 61, 0.1)', border: '1px solid rgba(245, 184, 61, 0.3)', padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Sparkles size={24} style={{ color: 'var(--gold, #f5b842)' }} />
                <div>
                  <strong style={{ color: 'var(--gold, #f5b842)', fontSize: '0.95rem' }}>Licencia Vitalicia Activa</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                    Tu sistema cuenta con acceso permanente sin fecha de expiración.
                  </p>
                </div>
              </div>
            ) : licenciaActiva ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CheckCircle2 size={24} style={{ color: '#10b981' }} />
                  <div>
                    <strong style={{ color: '#10b981', fontSize: '0.95rem' }}>
                      Licencia Activa · {estadoLicencia.diasRestantes} días restantes
                    </strong>
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                      Vence el {new Date(estadoLicencia.venceEn || Date.now()).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEstadoLicencia({ ...estadoLicencia, _mostrarRenovar: !estadoLicencia._mostrarRenovar })}
                  className="admin-btn admin-btn-secondary"
                  style={{ borderColor: 'var(--gold, #f5b842)', color: 'var(--gold, #f5b842)' }}
                >
                  {estadoLicencia._mostrarRenovar ? 'Cerrar Renovación' : 'Renovar / Extender'}
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '16px', borderRadius: '12px' }}>
                <strong style={{ color: '#ef4444', fontSize: '0.95rem' }}>Licencia Inactiva o Vencida</strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Ingresa tu clave de activación o renueva con la clave maestra provista por el administrador.
                </p>
              </div>
            )}
          </div>

          {/* Formulario de Activación / Renovación */}
          {(mostrarActivacion || estadoLicencia?._mostrarRenovar) && (
            <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--gold, #f5b842)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Key size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--gold, #f5b842)' }}>
                    {estadoLicencia?._mostrarRenovar ? 'Renovación de Licencia' : 'Activación de Nueva Licencia'}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                    Digita la clave maestra para emitir y registrar la nueva vigencia en tu terminal.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div className="admin-form-group">
                  <label className="admin-label">Duración del Plan</label>
                  <select
                    value={duracionActivar}
                    onChange={(e) => setDuracionActivar(e.target.value)}
                    className="admin-select"
                  >
                    <option value="1">Plan Mensual (1 Mes)</option>
                    <option value="3">Plan Trimestral (3 Meses)</option>
                    <option value="6">Plan Semestral (6 Meses)</option>
                    <option value="12">Plan Anual (12 Meses)</option>
                    <option value="24">Plan Bianual (24 Meses)</option>
                    <option value="-1">Activación Vitalicia (Permanente)</option>
                  </select>
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">Clave Maestra de Activación *</label>
                  <input
                    type="password"
                    placeholder="CHLOE-30D-XXXXX-XXXXX..."
                    value={claveMaestra}
                    onChange={(e) => setClaveMaestra(e.target.value)}
                    className="admin-input"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={activarLicencia}
                disabled={activando}
                className="admin-btn admin-btn-primary"
                style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Key size={16} />
                {activando ? 'Validando Clave...' : 'Activar y Aplicar Licencia'}
              </button>
            </div>
          )}

        </div>
      )}

      {/* ── PESTAÑA 3: FISCAL & CUENTAS BANCARIAS ── */}
      {subpestana === 'fiscal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Impuestos DGII */}
          <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Cargos e Impuestos de Ley</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Ajusta la aplicación automática de ITBIS y Propina de Ley en cuentas y facturas.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="cobrar_itbis"
                  checked={formData.cobrar_itbis}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--gold, #f5b842)' }}
                />
                <div>
                  <strong style={{ color: '#fff', fontSize: '0.88rem', display: 'block' }}>Cobrar ITBIS (18%)</strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>Aplica ITBIS fiscal a cada artículo del pedido</span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="cobrar_propina"
                  checked={formData.cobrar_propina}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--gold, #f5b842)' }}
                />
                <div>
                  <strong style={{ color: '#fff', fontSize: '0.88rem', display: 'block' }}>Propina Legal (10%)</strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>Añade el 10% legal de servicio al consumidor</span>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={() => guardarNegocio()}
              disabled={guardando}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Save size={16} />
              Guardar Configuración Fiscal
            </button>
          </div>

          {/* Cuentas Bancarias */}
          <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Cuentas Bancarias para Transferencias</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Aparecen en pantalla cuando los clientes seleccionan pago por transferencia bancaria.
                </p>
              </div>
            </div>

            {cuentasBancarias.length > 0 && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {cuentasBancarias.map((cuenta) => (
                  <div key={cuenta.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <strong style={{ color: 'var(--gold, #f5b842)', fontSize: '0.9rem' }}>{cuenta.nombre_banco}</strong>
                      <span style={{ color: '#fff', fontSize: '0.84rem', marginLeft: '10px', fontFamily: 'monospace' }}>{cuenta.numero_cuenta}</span>
                      <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.76rem', marginLeft: '8px' }}>({cuenta.titular} · {cuenta.tipo_cuenta})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => editarCuenta(cuenta)} className="admin-btn admin-btn-secondary" style={{ padding: '4px 8px' }}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => eliminarCuentaBancaria(cuenta.id)} className="admin-btn admin-btn-danger" style={{ padding: '4px 8px' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario Crear/Editar Cuenta */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Nombre del Banco (ej: Banreservas)"
                  value={formCuenta.nombre_banco}
                  onChange={(e) => setFormCuenta({ ...formCuenta, nombre_banco: e.target.value })}
                  className="admin-input"
                />
                <select
                  value={formCuenta.tipo_cuenta}
                  onChange={(e) => setFormCuenta({ ...formCuenta, tipo_cuenta: e.target.value })}
                  className="admin-select"
                >
                  <option value="Corriente">Cuenta Corriente</option>
                  <option value="Ahorro">Cuenta de Ahorros</option>
                  <option value="VIP">Cuenta Jurídica / VIP</option>
                </select>
                <input
                  type="text"
                  placeholder="Número de Cuenta"
                  value={formCuenta.numero_cuenta}
                  onChange={(e) => setFormCuenta({ ...formCuenta, numero_cuenta: e.target.value })}
                  className="admin-input"
                />
                <input
                  type="text"
                  placeholder="Titular de la Cuenta"
                  value={formCuenta.titular}
                  onChange={(e) => setFormCuenta({ ...formCuenta, titular: e.target.value })}
                  className="admin-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={guardarCuentaBancaria}
                  disabled={guardandoCuenta}
                  className="admin-btn admin-btn-primary"
                  style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {editandoCuenta ? <Pencil size={15} /> : <Plus size={15} />}
                  {guardandoCuenta ? 'Guardando...' : editandoCuenta ? 'Actualizar Cuenta' : 'Agregar Cuenta Bancaria'}
                </button>
                {editandoCuenta && (
                  <button
                    type="button"
                    onClick={() => { setEditandoCuenta(null); setFormCuenta({ nombre_banco: '', tipo_cuenta: 'Corriente', numero_cuenta: '', titular: '' }); }}
                    className="admin-btn admin-btn-secondary"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── PESTAÑA 4: ESTACIONES & DESPACHO ── */}
      {subpestana === 'estaciones' && (
        <form onSubmit={guardarNegocio} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Printer size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Áreas de Producción y Despacho</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Personaliza los nombres de tus estaciones y el método de envío de comandas.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Nombre de Estación Cocina</label>
                <input
                  type="text"
                  name="nombre_cocina"
                  value={formData.nombre_cocina}
                  onChange={handleChange}
                  placeholder="Ej: Cocina Principal"
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Nombre de Estación Bar</label>
                <input
                  type="text"
                  name="nombre_bar"
                  value={formData.nombre_bar}
                  onChange={handleChange}
                  placeholder="Ej: Barra de Cocteles"
                  className="admin-input"
                />
              </div>
            </div>

            {/* Modo de Comandas */}
            <div className="admin-form-group">
              <label className="admin-label">Modo de Envío de Comandas a Producción</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: formData.comanda_modo === 'kds' ? 'rgba(245, 184, 61, 0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '10px', border: formData.comanda_modo === 'kds' ? '1px solid var(--gold, #f5b842)' : '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="comanda_modo"
                    value="kds"
                    checked={formData.comanda_modo === 'kds'}
                    onChange={handleChange}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--gold, #f5b842)' }}
                  />
                  <div>
                    <strong style={{ color: '#fff', fontSize: '0.86rem', display: 'block' }}>Pantalla KDS Digital</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>Despacho en tiempo real en monitores táctiles</span>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: formData.comanda_modo === 'impresora' ? 'rgba(245, 184, 61, 0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '10px', border: formData.comanda_modo === 'impresora' ? '1px solid var(--gold, #f5b842)' : '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="comanda_modo"
                    value="impresora"
                    checked={formData.comanda_modo === 'impresora'}
                    onChange={handleChange}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--gold, #f5b842)' }}
                  />
                  <div>
                    <strong style={{ color: '#fff', fontSize: '0.86rem', display: 'block' }}>Impresión Térmica</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>Imprime tickets de pedido en Cocina y Bar</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Impresoras por Estación */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <strong style={{ color: '#fff', fontSize: '0.88rem' }}>Asignación de Impresoras Locales</strong>
              <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                Configura la impresora física predeterminada para cada estación en este equipo.
              </span>
              
              {['cocina', 'bar', 'caja'].map((estacion) => (
                <div key={estacion} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--gold, #f5b842)', width: '80px', textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem' }}>{estacion}:</span>
                  <select
                    value={impresorasEstacion[estacion] || ''}
                    onChange={(e) => guardarImpresorasEstacion({ ...impresorasEstacion, [estacion]: e.target.value })}
                    className="admin-select"
                    style={{ flex: 1, minWidth: '220px' }}
                  >
                    <option value="">Diálogo de impresión del sistema</option>
                    {impresoras.map((p) => (
                      <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={guardando}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Save size={16} />
              {guardando ? 'Guardando...' : 'Guardar Configuración de Estaciones'}
            </button>
          </div>

        </form>
      )}

      {/* ── PESTAÑA 5: FORMATO DE TICKETS & FACTURAS ── */}
      {subpestana === 'tickets' && (
        <form onSubmit={guardarNegocio} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Diseño y Formato de Tickets Térmicos</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                  Ajusta la tipografía, márgenes, posición de logo y código QR para tus facturas y comprobantes.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Tipografía (Font Family)</label>
                <select
                  name="ticket_font_family"
                  value={formData.ticket_font_family}
                  onChange={handleChange}
                  className="admin-select"
                >
                  <option value="Inter">Inter (Predeterminada)</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Courier New">Courier New (Monoespaciada)</option>
                  <option value="Source Code Pro">Source Code Pro</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Tamaño de Fuente Base</label>
                <select
                  name="ticket_font_size"
                  value={formData.ticket_font_size}
                  onChange={handleChange}
                  className="admin-select"
                >
                  <option value="10">10 px (Compacto)</option>
                  <option value="11">11 px</option>
                  <option value="12">12 px (Recomendado)</option>
                  <option value="13">13 px</option>
                  <option value="14">14 px (Legible)</option>
                  <option value="16">16 px (Grande)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Posición del Logotipo</label>
                <select
                  name="ticket_logo_position"
                  value={formData.ticket_logo_position}
                  onChange={handleChange}
                  className="admin-select"
                >
                  <option value="top">Arriba Centrado</option>
                  <option value="left">Izquierda</option>
                  <option value="none">Sin Logotipo en Ticket</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Márgenes de Papel</label>
                <select
                  name="ticket_margin"
                  value={formData.ticket_margin}
                  onChange={handleChange}
                  className="admin-select"
                >
                  <option value="compact">Compacto (Ahorra papel térmico)</option>
                  <option value="normal">Normal (Estándar 80mm)</option>
                  <option value="wide">Amplio</option>
                </select>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="ticket_show_qr"
                checked={formData.ticket_show_qr}
                onChange={handleChange}
                style={{ width: '18px', height: '18px', accentColor: 'var(--gold, #f5b842)' }}
              />
              <div>
                <strong style={{ color: '#fff', fontSize: '0.88rem', display: 'block' }}>Imprimir Código QR en Facturas</strong>
                <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                  Genera código QR de validación fiscal DGII / enlace de verificación digital
                </span>
              </div>
            </label>

            <button
              type="submit"
              disabled={guardando}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Save size={16} />
              {guardando ? 'Guardando...' : 'Guardar Formato de Impresión'}
            </button>
          </div>

        </form>
      )}

    </div>
  );
}

