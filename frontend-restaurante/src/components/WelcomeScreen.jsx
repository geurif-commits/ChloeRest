import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  KeyRound,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  Sparkles,
  Utensils,
} from 'lucide-react';

const PROVINCIAS = [
  'Distrito Nacional', 'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Duarte',
  'Elías Piña', 'El Seibo', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal',
  'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
  'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata',
  'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná', 'San Cristóbal',
  'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez',
  'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
];

const PLANES = [
  { nombre: 'Mensual', duracion: '1 mes', detalle: 'Para empezar y conocer el sistema.' },
  { nombre: 'Trimestral', duracion: '3 meses', detalle: 'Ideal para temporadas cortas.' },
  { nombre: 'Semestral', duracion: '6 meses', detalle: 'Ahorro frente al plan mensual.' },
  { nombre: 'Anual', duracion: '12 meses', detalle: 'El más solicitado por los negocios.', recomendado: true },
  { nombre: 'Bianual', duracion: '24 meses', detalle: 'Máximo ahorro a largo plazo.' },
  { nombre: 'Vitalicia', duracion: 'De por vida', detalle: 'Pago único, uso sin vencimiento.' },
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

function WelcomeScreen({ apiUrl, config, alContinuar }) {
  const urlBase = apiUrl || 'http://localhost:3000';
  const [form, setForm] = useState({
    propietario: '',
    negocio: '',
    telefono: '',
    email: '',
    provincia: 'La Romana',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

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
      const res = await fetch(`${urlBase}/api/setup/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'No se pudo completar el registro.');
      if (alContinuar) alContinuar(form);
    } catch {
      setError('No se pudo conectar con el servidor. Verifica la red e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const logoVista = config?.logo_url;

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'auto', background: 'radial-gradient(circle at 15% 15%, rgba(70,90,146,0.25), transparent 40%), radial-gradient(circle at 90% 85%, rgba(214,164,77,0.12), transparent 40%), linear-gradient(135deg, #07090f 0%, #0c1220 55%, #070a11 100%)' }}>
      <div style={{ width: 'min(1200px, 94vw)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '34px', padding: '40px 0' }}>

        {/* ══════════ COLUMNA IZQUIERDA: BIENVENIDA ══════════ */}
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
              El sistema incluye <strong style={{ color: '#ead18b' }}>7 días de prueba</strong>. Para continuar usándolo,
              contacta a nuestro equipo de soporte, elige el plan que se ajuste a tu negocio y recibe tu{' '}
              <strong style={{ color: '#ead18b' }}>clave maestra de activación</strong>.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              {PLANES.map((plan) => (
                <div key={plan.nombre} style={{ position: 'relative', padding: '11px 12px', borderRadius: '12px', border: plan.recomendado ? '1px solid rgba(214,164,77,0.7)' : '1px solid rgba(255,255,255,0.1)', background: plan.recomendado ? 'rgba(214,164,77,0.14)' : 'rgba(255,255,255,0.04)' }}>
                  {plan.recomendado && <span style={{ position: 'absolute', top: '-8px', right: '10px', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '999px', color: '#000', background: '#d6a44d' }}>Popular</span>}
                  <strong style={{ display: 'block', fontSize: '0.82rem' }}>{plan.nombre}</strong>
                  <span style={{ display: 'block', color: '#d6a44d', fontSize: '0.74rem', fontWeight: 600, margin: '2px 0 3px' }}>{plan.duracion}</span>
                  <p style={{ margin: 0, color: '#8e98ab', fontSize: '0.68rem', lineHeight: 1.4 }}>{plan.detalle}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: '12px 0 0', color: '#8e98ab', fontSize: '0.74rem', lineHeight: 1.5 }}>
              La activación se realiza desde el panel de administración con la clave que te entregará tu proveedor.
            </p>
          </div>
        </section>

        {/* ══════════ COLUMNA DERECHA: REGISTRO ══════════ */}
        <section style={{ alignSelf: 'center' }}>
          <form onSubmit={registrar} style={{ padding: '30px 32px', borderRadius: '24px', border: '1px solid rgba(126,148,220,0.35)', background: 'linear-gradient(145deg, rgba(27,35,57,0.94), rgba(8,12,22,0.97))', boxShadow: '0 28px 80px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <Sparkles size={22} style={{ color: '#d6a44d' }} />
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 750 }}>Registro del cliente</h3>
            </div>
            <p style={{ margin: '0 0 22px', color: '#aeb7cc', fontSize: '0.84rem' }}>
              Cuéntanos quién eres para preparar tu configuración inicial.
            </p>

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
              {guardando ? 'Registrando...' : 'Registrarme y continuar'}
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
