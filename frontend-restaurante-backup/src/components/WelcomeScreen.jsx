import { useState, useEffect } from 'react';
import { URL_CENTRAL } from '../configApi.js';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Landmark,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  Utensils,
  Wallet,
} from 'lucide-react';
import BotonSalirElectron from './BotonSalirElectron.jsx';

const PROVINCIAS = [
  'Distrito Nacional', 'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Duarte',
  'Elías Piña', 'El Seibo', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal',
  'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
  'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata',
  'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná', 'San Cristóbal',
  'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez',
  'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
];

const CARACTERISTICAS = [
  { icono: LayoutGrid, titulo: 'Mapa de mesas', desc: 'Controla el salón en tiempo real con mesas, traslados y reservas.' },
  { icono: Receipt, titulo: 'Facturación DGII', desc: 'Emite facturas con RNC, ITBIS y NCF conforme a las normas fiscales.' },
  { icono: Utensils, titulo: 'Cocina y bar', desc: 'Pantallas KDS para enviar pedidos directo a producción.' },
  { icono: ShieldCheck, titulo: 'Reportes y seguridad', desc: 'Cierres de caja, arqueos, auditoría y control por PIN por rol.' },
];

const INPUT = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: '12px',
  fontSize: '0.92rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const etiquetaDuracion = (codigo) => {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') return 'Pago único';
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) return '';
  const n = Number(m[1]);
  return m[2] === 'M' ? `${n} mes${n > 1 ? 'es' : ''}` : `${n} día${n > 1 ? 's' : ''}`;
};

const formatearPrecio = (plan) => {
  const valor = Number(plan?.precio || 0);
  const cifra = valor.toLocaleString('es-DO', { maximumFractionDigits: 0 });
  return `${plan?.moneda || 'RD$'} ${cifra}`;
};

function WelcomeScreen({ apiUrl, config, alContinuar, alVolver, planSeleccionado }) {
  const urlBase = apiUrl;
  const [form, setForm] = useState({
    propietario: '',
    negocio: '',
    telefono: '',
    email: '',
    provincia: 'La Romana',
  });
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

  useEffect(() => {
    let cancelado = false;
    fetch(`${URL_CENTRAL}/api/planes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelado || !data || !Array.isArray(data.planes)) return;
        setPlanes(data.planes);
        if (!plan && data.planes.length > 0 && !config?.setup_completado) {
          setPlan(data.planes.find((p) => p.destacado) || data.planes[0]);
        }
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch(`${URL_CENTRAL}/api/metodos-pago`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelado || !data || !Array.isArray(data.metodos)) return;
        setMetodosPago(data.metodos.filter((m) => m.activo !== false));
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const cambiar = (campo) => (e) => setForm((actual) => ({ ...actual, [campo]: e.target.value }));

  const registrar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.propietario.trim() || !form.negocio.trim() || !form.telefono.trim() || !form.email.trim() || !form.provincia.trim()) {
      return setError('Completa todos los campos del registro.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError('El correo electrónico no es válido.');
    }
    setGuardando(true);
    try {
      if (!config?.setup_completado) {
        const res = await fetch(`${urlBase}/api/setup/registro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) return setError(data.error || 'No se pudo completar el registro.');
      }

      const solRes = await fetch(`${URL_CENTRAL}/api/solicitud-licencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan?.id || plan?.plan_id || null,
          propietario: form.propietario.trim(),
          negocio: form.negocio.trim(),
          telefono: form.telefono.trim(),
          email: form.email.trim(),
          provincia: form.provincia.trim(),
        }),
      });
      const solData = await solRes.json();
      if (!solRes.ok) return setError(solData.error || 'No se pudo enviar la solicitud.');

      setSolicitudId(solData.id || null);
      setTokenPago(solData.tokenPago || '');

      if (config?.setup_completado) {
        setSolicitudEnviada(true);
      } else if (alContinuar) {
        alContinuar(form);
      }
    } catch {
      setError('No se pudo conectar con el servidor. Verifica la red e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirLink = (m) => {
    const url = String(m.link_pago || '').trim();
    if (!url) return;
    if (window.electronPOS?.abrirLinkPago) {
      window.electronPOS.abrirLinkPago(url).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const confirmarPago = async (m) => {
    if (!solicitudId || !tokenPago) return;
    setConfirmandoPago(true);
    setMetodoSeleccionado(m.id);
    setError('');
    try {
      const res = await fetch(`${URL_CENTRAL}/api/solicitud-licencia/${solicitudId}/confirmar-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenPago, metodo_id: m.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo confirmar el pago.');
        setMetodoSeleccionado(null);
      } else {
        setPagoConfirmado(true);
      }
    } catch {
      setError('No se pudo conectar con el servidor para confirmar el pago.');
      setMetodoSeleccionado(null);
    } finally {
      setConfirmandoPago(false);
    }
  };

  const logoVista = config?.logo_url;

  if (solicitudEnviada) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'auto', background: 'radial-gradient(circle at 15% 15%, rgba(70,90,146,0.25), transparent 40%), radial-gradient(circle at 90% 85%, rgba(214,164,77,0.12), transparent 40%), linear-gradient(135deg, #07090f 0%, #0c1220 55%, #070a11 100%)' }}>
        <BotonSalirElectron />
        <div style={{ background: 'linear-gradient(145deg, rgba(27,35,57,0.96), rgba(8,12,22,0.98))', border: '1px solid rgba(0,245,118,0.4)', borderRadius: '24px', padding: '46px 40px', maxWidth: '520px', width: '94vw', textAlign: 'center', boxShadow: '0 28px 80px rgba(0,0,0,0.46)' }}>
          <div style={{ width: '76px', height: '76px', margin: '0 auto 18px', borderRadius: '50%', background: 'rgba(0,245,118,0.14)', display: 'grid', placeItems: 'center', border: '1px solid rgba(0,245,118,0.5)' }}>
            <CheckCircle2 size={40} color="#00f576" />
          </div>
          <h2 style={{ color: '#fff', margin: '0 0 10px', fontSize: '1.5rem' }}>¡Solicitud enviada!</h2>
          <p style={{ color: '#aeb7cc', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 8px' }}>
            {plan ? (
              <>Elegiste el plan <strong style={{ color: '#00f576' }}>{plan.nombre}</strong> ({formatearPrecio(plan)}). </>
            ) : null}
            Nuestro equipo te contactará para entregarte tu clave de activación.
          </p>

          {metodosPago.length > 0 && (
            <div style={{ textAlign: 'left', margin: '18px 0 20px', padding: '18px', borderRadius: '16px', border: '1px solid rgba(214,164,77,0.35)', background: 'linear-gradient(145deg, rgba(214,164,77,0.1), rgba(214,164,77,0.02))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
                <Wallet size={19} style={{ color: '#d6a44d' }} />
                <strong style={{ color: '#fff', fontSize: '0.95rem' }}>Métodos de pago disponibles</strong>
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                {metodosPago.map((m) => {
                  const tieneLink = String(m.link_pago || '').trim().length > 0;
                  const esperando = confirmandoPago && metodoSeleccionado === m.id;
                  return (
                    <div key={m.id} style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        {m.tipo === 'usdt' ? (
                          <Send size={16} style={{ color: '#26a17b', flexShrink: 0 }} />
                        ) : m.tipo === 'paypal' ? (
                          <CreditCard size={16} style={{ color: '#0070ba', flexShrink: 0 }} />
                        ) : m.tipo === 'transferencia' ? (
                          <Landmark size={16} style={{ color: '#d6a44d', flexShrink: 0 }} />
                        ) : (
                          <Wallet size={16} style={{ color: '#f0b90b', flexShrink: 0 }} />
                        )}
                        <strong style={{ color: '#fff', fontSize: '0.85rem' }}>{m.nombre}</strong>
                      </div>
                      {m.detalle && <p style={{ margin: 0, color: '#aeb7cc', fontSize: '0.78rem', lineHeight: 1.5 }}>{m.detalle}</p>}
                      {tieneLink ? (
                        <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => abrirLink(m)}
                            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,245,118,0.5)', background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}
                          >
                            Pagar con {m.nombre}
                          </button>
                          <button
                            type="button"
                            disabled={confirmandoPago}
                            onClick={() => confirmarPago(m)}
                            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(214,164,77,0.5)', background: 'rgba(214,164,77,0.12)', color: '#ead18b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                          >
                            {esperando ? 'Confirmando...' : 'Ya realicé el pago'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}>
                          {m.titular && <p style={{ margin: '0 0 4px', color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>{m.titular}</p>}
                          {[m.dato1, m.dato2, m.dato3].filter(Boolean).map((d, i) => (
                            <p key={i} style={{ margin: '2px 0', color: '#aeb7cc', fontSize: '0.75rem', wordBreak: 'break-all' }}>{d}</p>
                          ))}
                          <button
                            type="button"
                            disabled={confirmandoPago}
                            onClick={() => confirmarPago(m)}
                            style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(0,245,118,0.5)', background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', width: '100%' }}
                          >
                            {esperando ? 'Confirmando...' : 'Ya realicé el pago'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p style={{ color: '#ff6b6b', margin: '0 0 14px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>⚠️ {error}</p>}

          {pagoConfirmado && (
            <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(0,245,118,0.5)', background: 'rgba(0,245,118,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} style={{ color: '#00f576', flexShrink: 0 }} />
              <strong style={{ color: '#00f576', fontSize: '0.88rem' }}>¡Pago confirmado! Tu solicitud está registrada como pagada.</strong>
            </div>
          )}

          <p style={{ color: '#78849a', fontSize: '0.85rem', margin: '0 0 24px' }}>
            Contacto: (829) 969-8604 · geurig@yahoo.com
          </p>
          <button
            type="button"
            onClick={() => { if (alVolver) alVolver(); else window.location.reload(); }}
            style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', color: '#000', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', background: 'linear-gradient(135deg, #00f576, #00b852)' }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'auto', background: 'radial-gradient(circle at 15% 15%, rgba(70,90,146,0.25), transparent 40%), radial-gradient(circle at 90% 85%, rgba(214,164,77,0.12), transparent 40%), linear-gradient(135deg, #07090f 0%, #0c1220 55%, #070a11 100%)' }}>
      <BotonSalirElectron />
      <div style={{ width: 'min(1200px, 94vw)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '34px', padding: '40px 0' }}>

        {/* ═══════════════ COLUMNA IZQUIERDA: BIENVENIDA ═══════════════ */}
        <section style={{ color: '#fff' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '26px' }}>
            <div style={{ width: '64px', height: '64px', display: 'grid', placeItems: 'center', borderRadius: '18px', border: '1px solid rgba(214,164,77,0.5)', background: 'linear-gradient(145deg, rgba(214,164,77,0.16), rgba(214,164,77,0.04))', overflow: 'hidden' }}>
              {logoVista ? (
                <img src={logoVista} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }} />
              ) : (
                <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 700, color: '#ead18b' }}>CR</span>
              )}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#d6a44d' }}>ChloeRestaurant</p>
              <h1 style={{ margin: '3px 0 0', fontSize: '1.55rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Bienvenido a tu sistema</h1>
            </div>
          </div>

          <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            El nuevo comienzo de tu restaurante empieza aquí.
          </h2>
          <p style={{ margin: 0, color: '#aeb6c8', lineHeight: 1.6, fontSize: '0.94rem' }}>
            Cada cliente es un comienzo nuevo. Registra tu negocio, personaliza tu sistema y empieza a
            facturar, controlar tus mesas y administrar tu operación desde el primer día.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', margin: '26px 0' }}>
            {CARACTERISTICAS.map((c) => (
              <div key={c.titulo} style={{ padding: '14px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', background: 'rgba(255,255,255,0.025)' }}>
                <c.icono size={20} style={{ color: '#d6a44d', marginBottom: '8px' }} />
                <strong style={{ display: 'block', fontSize: '0.86rem', marginBottom: '4px' }}>{c.titulo}</strong>
                <p style={{ margin: 0, color: '#8e98ab', fontSize: '0.76rem', lineHeight: 1.5 }}>{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Licencia */}
          <div style={{ padding: '18px', borderRadius: '16px', border: '1px solid rgba(214,164,77,0.3)', background: 'linear-gradient(145deg, rgba(214,164,77,0.1), rgba(214,164,77,0.02))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
              <KeyRound size={19} style={{ color: '#d6a44d' }} />
              <strong style={{ fontSize: '0.95rem' }}>¿Cómo adquirir tu licencia de uso?</strong>
            </div>
            <p style={{ margin: '0 0 12px', color: '#aeb6c8', fontSize: '0.82rem', lineHeight: 1.55 }}>
              El sistema incluye <strong style={{ color: '#ead18b' }}>7 días de prueba</strong>. Elige el plan que se ajuste a tu negocio,
              completa el formulario y recibirás tu{' '}
              <strong style={{ color: '#ead18b' }}>clave maestra de activación</strong>.
            </p>
            {planes.length === 0 ? (
              <p style={{ margin: 0, color: '#8e98ab', fontSize: '0.8rem' }}>Cargando planes disponibles...</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                {planes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlan(p)}
                    style={{
                      position: 'relative', padding: '11px 12px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                      border: p.destacado ? '1px solid rgba(214,164,77,0.7)' : '1px solid rgba(255,255,255,0.1)',
                      background: plan?.id === p.id ? 'rgba(214,164,77,0.28)' : (p.destacado ? 'rgba(214,164,77,0.14)' : 'rgba(255,255,255,0.04)'),
                      color: '#fff',
                    }}
                  >
                    {p.destacado && <span style={{ position: 'absolute', top: '-8px', right: '10px', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px', color: '#000', background: '#d6a44d' }}>Popular</span>}
                    <strong style={{ display: 'block', fontSize: '0.82rem' }}>{p.nombre}</strong>
                    <span style={{ display: 'block', color: '#00f576', fontSize: '0.9rem', fontWeight: 700, margin: '2px 0 3px' }}>{formatearPrecio(p)}</span>
                    <span style={{ display: 'block', color: '#8e98ab', fontSize: '0.68rem' }}>{etiquetaDuracion(p.duracion_codigo)}</span>
                  </button>
                ))}
              </div>
            )}
            <p style={{ margin: '12px 0 0', color: '#8e98ab', fontSize: '0.74rem', lineHeight: 1.5 }}>
              La activación se realiza desde el panel de administración con la clave que te entregará tu proveedor.
            </p>
          </div>
        </section>

        {/* ═══════════════ COLUMNA DERECHA: REGISTRO ═══════════════ */}
        <section style={{ alignSelf: 'center' }}>
          <form onSubmit={registrar} style={{ padding: '30px 32px', borderRadius: '24px', border: '1px solid rgba(126,148,220,0.35)', background: 'linear-gradient(145deg, rgba(27,35,57,0.94), rgba(8,12,22,0.97))', boxShadow: '0 28px 80px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <Sparkles size={22} style={{ color: '#d6a44d' }} />
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 750 }}>Registro del cliente</h3>
            </div>
            <p style={{ margin: '0 0 22px', color: '#aeb7cc', fontSize: '0.84rem' }}>
              Cuéntanos quién eres para preparar tu configuración inicial.
            </p>

            {plan && (
              <div style={{ marginBottom: '18px', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(0,245,118,0.45)', background: 'rgba(0,245,118,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#00f576', fontWeight: 700 }}>Plan seleccionado</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{plan.nombre} · {formatearPrecio(plan)}</div>
                </div>
                <button type="button" onClick={() => setPlan(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#aeb7cc', borderRadius: '8px', padding: '6px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>Quitar</button>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', fontWeight: 600 }}>
                <Building2 size={14} style={{ color: '#d6a44d' }} /> Nombre del propietario *
              </label>
              <input style={INPUT} value={form.propietario} onChange={cambiar('propietario')} placeholder="Ej: Juan Pérez" required />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', fontWeight: 600 }}>
                <Utensils size={14} style={{ color: '#d6a44d' }} /> Nombre del negocio *
              </label>
              <input style={INPUT} value={form.negocio} onChange={cambiar('negocio')} placeholder="Ej: Restaurante El Sabor" required />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', fontWeight: 600 }}>
                <Phone size={14} style={{ color: '#d6a44d' }} /> Teléfono / WhatsApp *
              </label>
              <input style={INPUT} value={form.telefono} onChange={cambiar('telefono')} placeholder="Ej: 809-555-1234" required />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', fontWeight: 600 }}>
                <Mail size={14} style={{ color: '#d6a44d' }} /> Correo electrónico *
              </label>
              <input type="email" style={INPUT} value={form.email} onChange={cambiar('email')} placeholder="Ej: contacto@misabor.com" required />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', fontWeight: 600 }}>
                <MapPin size={14} style={{ color: '#d6a44d' }} /> Provincia *
              </label>
              <select style={{ ...INPUT, cursor: 'pointer' }} value={form.provincia} onChange={cambiar('provincia')}>
                {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {error && <p style={{ color: '#ff6b6b', margin: '0 0 14px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>⚠️ {error}</p>}

            <button type="submit" disabled={guardando} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', border: 'none', borderRadius: '12px', color: '#000', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', background: 'linear-gradient(135deg, #00f576, #00b852)', boxShadow: '0 8px 24px rgba(0,245,118,0.25)' }}>
              {guardando ? 'Enviando...' : (plan ? `Solicitar plan ${plan.nombre}` : 'Registrarme y continuar')}
              {!guardando && <ArrowRight size={18} />}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '16px', color: '#78849a', fontSize: '0.7rem' }}>
              <BadgeCheck size={14} style={{ color: '#d6a44d' }} />
              Tus datos se guardan de forma local en tu servidor.
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default WelcomeScreen;
