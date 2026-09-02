import { useState, useEffect } from 'react';
import { URL_CENTRAL } from '../configApi.js';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  Utensils,
  Wallet,
  ChevronRight,
  Loader2,
  User,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import BotonSalirElectron from './BotonSalirElectron.jsx';
import './WelcomeScreen.css';

const PROVINCIAS = [
  'Distrito Nacional', 'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Duarte',
  'Elías Piña', 'El Seibo', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal',
  'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
  'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata',
  'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná', 'San Cristóbal',
  'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez',
  'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
];

const etiquetaDuracion = (codigo) => {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') return 'Pago único';
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) return '';
  const n = Number(m[1]);
  const plural = n > 1;
  return m[2] === 'M' ? n + ' mes' + (plural ? 'es' : '') : n + ' día' + (plural ? 's' : '');
};

const formatearPrecio = (plan) => {
  const valor = Number(plan?.precio || 0);
  const cifra = valor.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${plan?.moneda || 'RD$'} ${cifra}`;
};

function WelcomeScreen({ apiUrl, config, alContinuar, alVolver, planSeleccionado }) {
  const [form, setForm] = useState({ propietario: '', negocio: '', telefono: '', email: '', provincia: 'La Romana' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [planes, setPlanes] = useState([]);
  const [plan, setPlan] = useState(planSeleccionado || null);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [metodosPago, setMetodosPago] = useState([]);
  const [solicitudId, setSolicitudId] = useState(null);
  const [tokenPago, setTokenPago] = useState('');
  const [pagoConfirmado, setPagoConfirmado] = useState(false);
  const [confirmandoPago, setConfirmandoPago] = useState(false);
  const [metodoSeleccionado, setMetodoSeleccionado] = useState(null);
  const [camposVisitados, setCamposVisitados] = useState({});

  useEffect(() => {
    let cancelado = false;
    fetch(`${URL_CENTRAL}/api/planes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelado || !d || !Array.isArray(d.planes)) return;
        setPlanes(d.planes);
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch(`${URL_CENTRAL}/api/metodos-pago`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelado || !d || !Array.isArray(d.metodos)) return;
        setMetodosPago(d.metodos.filter((m) => m.activo !== false));
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const cambiar = (campo) => (e) => setForm((a) => ({ ...a, [campo]: e.target.value }));
  const visitar = (campo) => setCamposVisitados((a) => ({ ...a, [campo]: true }));
  const campoValido = (campo) =>
    campo === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
      : Boolean(String(form[campo] || '').trim());

  const registrar = async (e) => {
    e.preventDefault();
    setError('');
    if (!plan) {
      return setError('Favor seleccionar el plan que más se ajuste a sus necesidades.');
    }
    if (
      !form.propietario.trim() ||
      !form.negocio.trim() ||
      !form.telefono.trim() ||
      !form.email.trim() ||
      !form.provincia.trim()
    ) {
      return setError('Completa todos los campos obligatorios.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError('El correo electrónico no es válido.');
    }
    setGuardando(true);
    try {
      const r = await fetch(`${URL_CENTRAL}/api/solicitud-licencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan?.id || null,
          propietario: form.propietario.trim(),
          negocio: form.negocio.trim(),
          telefono: form.telefono.trim(),
          email: form.email.trim(),
          provincia: form.provincia.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) return setError(d.error || 'No se pudo enviar la solicitud.');
      setSolicitudId(d.id || null);
      setTokenPago(d.tokenPago || '');
      setSolicitudEnviada(true);
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirLink = (m) => {
    const u = String(m.link_pago || '').trim();
    if (!u) return;
    if (window.electronPOS?.abrirLinkPago) {
      window.electronPOS.abrirLinkPago(u).catch(() => window.open(u, '_blank', 'noopener,noreferrer'));
    } else {
      window.open(u, '_blank', 'noopener,noreferrer');
    }
  };

  const confirmarPago = async (m) => {
    if (!solicitudId || !tokenPago) return;
    setConfirmandoPago(true);
    setMetodoSeleccionado(m.id);
    setError('');
    try {
      const r = await fetch(`${URL_CENTRAL}/api/solicitud-licencia/${solicitudId}/confirmar-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenPago, metodo_id: m.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Error al confirmar');
        setMetodoSeleccionado(null);
      } else {
        setPagoConfirmado(true);
      }
    } catch {
      setError('Error al registrar confirmación');
      setMetodoSeleccionado(null);
    } finally {
      setConfirmandoPago(false);
    }
  };

  if (solicitudEnviada) {
    return (
      <div className="welcome-screen">
        <BotonSalirElectron />
        <div className="welcome-container">
          <div className="welcome-sent-card">
            <div className="welcome-success-icon">
              <CheckCircle2 size={36} />
            </div>
            <h2>¡Solicitud enviada con éxito!</h2>
            <p>
              {plan ? (
                <>Has seleccionado el plan <strong>{plan.nombre}</strong> ({formatearPrecio(plan)}). </>
              ) : null}
              Nos pondremos en contacto contigo para enviarte tu clave de activación.
            </p>

            {metodosPago.length > 0 && (
              <div className="welcome-license-panel" style={{ marginTop: '20px', textAlign: 'left' }}>
                <div className="welcome-panel-header">
                  <Wallet size={16} /> Métodos de Pago Disponibles
                </div>
                <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                  {metodosPago.map((m) => {
                    const tieneLink = String(m.link_pago || '').trim().length > 0;
                    const esperando = confirmandoPago && metodoSeleccionado === m.id;
                    return (
                      <div key={m.id} className="welcome-plan-card" style={{ textAlign: 'left', alignItems: 'flex-start', padding: '12px' }}>
                        <strong style={{ fontSize: '0.88rem' }}>{m.nombre}</strong>
                        {m.detalle && <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '4px 0' }}>{m.detalle}</p>}
                        {[m.dato1, m.dato2, m.dato3].filter(Boolean).map((d, i) => (
                          <span key={i} style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{d}</span>
                        ))}
                        {tieneLink ? (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', width: '100%' }}>
                            <button type="button" onClick={() => abrirLink(m)} className="welcome-btn-change" style={{ flex: 1 }}>Pagar Online</button>
                            <button type="button" disabled={confirmandoPago} onClick={() => confirmarPago(m)} className="welcome-btn-change" style={{ flex: 1, background: '#00f576', color: '#000' }}>
                              {esperando ? <Loader2 size={12} className="spinner" /> : 'Ya pagué'}
                            </button>
                          </div>
                        ) : (
                          <button type="button" disabled={confirmandoPago} onClick={() => confirmarPago(m)} className="welcome-btn-change" style={{ marginTop: '8px', width: '100%', background: '#00f576', color: '#000' }}>
                            {esperando ? <Loader2 size={12} className="spinner" /> : 'Confirmar que ya pagué'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <p className="welcome-form-error" style={{ marginTop: '14px' }}>⚠️ {error}</p>}
            {pagoConfirmado && (
              <div style={{ color: '#00f576', marginTop: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> ¡Pago registrado correctamente!
              </div>
            )}

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="welcome-btn-submit"
              style={{ marginTop: '20px' }}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-screen">
      <BotonSalirElectron />
      <div className="welcome-container">
        <div className="welcome-layout">
          {/* Columna izquierda: Presentación & Planes */}
          <section className="welcome-left">
            <div className="welcome-header">
              <div className="welcome-brand-badge">
                <img src="/icons.svg" alt="Chloe POS" />
              </div>
              <div>
                <p className="welcome-brand-tag">Chloe Restaurant POS</p>
                <h1>Bienvenido</h1>
              </div>
            </div>

            <h2 className="welcome-hero-title">
              El nuevo comienzo de tu restaurante empieza aquí.
            </h2>
            <p className="welcome-hero-subtitle">
              Registra tu negocio, personaliza tu sistema y empieza a facturar desde el primer día con aislamiento multiempresa garantizado.
            </p>

            <div className="welcome-license-panel">
              <div className="welcome-panel-header">
                <KeyRound size={18} />
                <span>¿Cómo adquirir tu licencia?</span>
              </div>
              <p className="welcome-panel-text">
                Favor seleccionar el plan que más se ajuste a sus necesidades. Todos los planes incluyen <strong>7 días de prueba completa</strong>.
              </p>

              <div className="welcome-plans-grid">
                {planes.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando planes disponibles...</p>
                ) : (
                  planes
                    .filter((p) => p.activo !== false)
                    .sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0))
                    .slice(0, 4)
                    .map((p) => {
                      const esSeleccionado = plan?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPlan(p)}
                          className={`welcome-plan-card ${p.destacado ? 'plan-highlight' : ''} ${esSeleccionado ? 'selected' : ''}`}
                        >
                          {esSeleccionado ? (
                            <span className="welcome-plan-badge selected" style={{ background: '#f5b842', color: '#000', fontWeight: 800 }}>✓ Seleccionado</span>
                          ) : p.destacado ? (
                            <span className="welcome-plan-badge">Popular</span>
                          ) : null}
                          <span className="welcome-plan-name">{p.nombre}</span>
                          <span className="welcome-plan-price">{formatearPrecio(p)}</span>
                          <span className="welcome-plan-duration">{etiquetaDuracion(p.duracion_codigo)}</span>
                        </button>
                      );
                    })
                )}
              </div>
            </div>
          </section>

          {/* Columna derecha: Formulario de Registro */}
          <section className="welcome-form-column">
            <div className="welcome-form-card">
              <button
                type="button"
                onClick={alVolver || (() => (window.location.href = '/'))}
                className="welcome-back-link"
              >
                <ArrowLeft size={14} /> Volver al inicio
              </button>

              <div className="welcome-progress-bar">
                <div className="welcome-progress-header">
                  <span>Paso 1 de 2</span>
                  <strong>Información de Contacto</strong>
                </div>
                <div className="welcome-progress-track">
                  <div className="welcome-progress-fill" />
                </div>
              </div>

              {plan ? (
                <div className="welcome-selected-plan">
                  <span>
                    Plan seleccionado: <strong>{plan.nombre}</strong> · {formatearPrecio(plan)}
                  </span>
                  <button type="button" onClick={() => setPlan(null)} className="welcome-btn-change">
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="welcome-no-plan-notice" style={{ background: 'rgba(245, 184, 61, 0.08)', border: '1px dashed rgba(245, 184, 61, 0.35)', padding: '10px 14px', borderRadius: '8px', color: '#f5b842', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <KeyRound size={15} style={{ flexShrink: 0 }} />
                  <span>Favor seleccionar el plan que más se ajuste a sus necesidades en la lista.</span>
                </div>
              )}

              <form onSubmit={registrar} className="welcome-form-grid" noValidate>
                <div className="welcome-field">
                  <label className="welcome-label">
                    <User size={15} /> Propietario *
                  </label>
                  <div className="welcome-input-wrapper">
                    <input
                      value={form.propietario}
                      onChange={cambiar('propietario')}
                      onBlur={() => visitar('propietario')}
                      placeholder="Ej: Juan Pérez"
                      className="welcome-input"
                      required
                    />
                  </div>
                  {camposVisitados.propietario && !campoValido('propietario') && (
                    <span className="welcome-field-error">El nombre del propietario es obligatorio</span>
                  )}
                </div>

                <div className="welcome-field">
                  <label className="welcome-label">
                    <Building2 size={15} /> Nombre del Negocio *
                  </label>
                  <div className="welcome-input-wrapper">
                    <input
                      value={form.negocio}
                      onChange={cambiar('negocio')}
                      onBlur={() => visitar('negocio')}
                      placeholder="Ej: Restaurante El Sabor"
                      className="welcome-input"
                      required
                    />
                  </div>
                  {camposVisitados.negocio && !campoValido('negocio') && (
                    <span className="welcome-field-error">El nombre del negocio es obligatorio</span>
                  )}
                </div>

                <div className="welcome-field">
                  <label className="welcome-label">
                    <Phone size={15} /> Teléfono de Contacto *
                  </label>
                  <div className="welcome-input-wrapper with-prefix">
                    <span className="welcome-phone-prefix">+1</span>
                    <input
                      value={form.telefono}
                      onChange={cambiar('telefono')}
                      onBlur={() => visitar('telefono')}
                      type="tel"
                      placeholder="809-555-1234"
                      className="welcome-input"
                      required
                    />
                  </div>
                </div>

                <div className="welcome-field">
                  <label className="welcome-label">
                    <Mail size={15} /> Correo Electrónico *
                  </label>
                  <div className="welcome-input-wrapper">
                    <input
                      value={form.email}
                      onChange={cambiar('email')}
                      onBlur={() => visitar('email')}
                      type="email"
                      placeholder="contacto@restaurante.com"
                      className="welcome-input"
                      required
                    />
                  </div>
                  {camposVisitados.email && !campoValido('email') && (
                    <span className="welcome-field-error">Introduce un correo electrónico válido</span>
                  )}
                </div>

                <div className="welcome-field">
                  <label className="welcome-label">
                    <MapPin size={15} /> Provincia *
                  </label>
                  <div className="welcome-select-wrapper">
                    <select
                      value={form.provincia}
                      onChange={cambiar('provincia')}
                      className="welcome-select"
                      required
                    >
                      {PROVINCIAS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {error && <div className="welcome-form-error">⚠️ {error}</div>}

                <button type="submit" disabled={guardando} className="welcome-btn-submit">
                  {guardando ? (
                    <>
                      <Loader2 size={18} className="spinner" /> Procesando solicitud...
                    </>
                  ) : (
                    <>
                      <span>Solicitar clave de activación</span>
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>

                <div className="welcome-trust-badges">
                  <span><ShieldCheck size={14} /> Servidor Seguro</span>
                  <span><ShieldCheck size={14} /> Soporte Local</span>
                  <span><ShieldCheck size={14} /> Facturación DGII</span>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default WelcomeScreen;
