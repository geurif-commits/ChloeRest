import {
  LayoutGrid,
  Receipt,
  Utensils,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  KeyRound,
  CreditCard,
  BarChart3,
  Users,
  TrendingUp,
  Clock,
  MapPin,
  Zap,
  Shield,
  Crown,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import './LandingScreen.css';
import BotonSalirElectron from './BotonSalirElectron.jsx';

const CARACTERISTICAS = [
  { icono: LayoutGrid, titulo: 'Mapa de Mesas', desc: 'Control del salón en tiempo real con mesas, traslados y reservas.' },
  { icono: Receipt, titulo: 'Facturación DGII', desc: 'Facturas con RNC, ITBIS, NCF y comprobantes electrónicos.' },
  { icono: Utensils, titulo: 'Cocina & Bar', desc: 'Pantallas KDS para envío directo de pedidos a producción.' },
  { icono: ShieldCheck, titulo: 'Seguridad', desc: 'Cierres de caja, arqueos, auditoría y control por PIN.' },
  { icono: BarChart3, titulo: 'Reportes', desc: 'Reportes de ventas, cierres históricos y control de ingresos.' },
  { icono: CreditCard, titulo: 'Pagos Flexibles', desc: 'Efectivo, tarjeta, transferencia y pago mixto.' },
];

const STATSDATA = [
  { icon: TrendingUp, label: 'Ventas Hoy', value: '$12,450', color: 'green' },
  { icon: Users, label: 'Mesas Activas', value: '18/24', color: 'gold' },
  { icon: Clock, label: 'Tiempo Promedio', value: '35 min', color: 'blue' },
];

const TABLESDATA = [
  { num: 1, status: 'occupied', label: 'Mesa 1' },
  { num: 2, status: 'free', label: 'Mesa 2' },
  { num: 3, status: 'occupied', label: 'Mesa 3' },
  { num: 4, status: 'reserved', label: 'Mesa 4' },
  { num: 5, status: 'free', label: 'Mesa 5' },
  { num: 6, status: 'occupied', label: 'Mesa 6' },
  { num: 7, status: 'free', label: 'Mesa 7' },
  { num: 8, status: 'occupied', label: 'Mesa 8' },
  { num: 9, status: 'free', label: 'Mesa 9' },
  { num: 10, status: 'occupied', label: 'Mesa 10' },
  { num: 11, status: 'free', label: 'Mesa 11' },
  { num: 12, status: 'reserved', label: 'Mesa 12' },
];

const PLANES = [
  { nombre: 'Mensual', duracion_codigo: '30D', moneda: 'RD$', precio: 29 },
  { nombre: 'Trimestral', duracion_codigo: '90D', moneda: 'RD$', precio: 79 },
  { nombre: 'Semestral', duracion_codigo: '6M', moneda: 'RD$', precio: 149 },
  { nombre: 'Anual', duracion_codigo: '12M', moneda: 'RD$', precio: 249, destacado: true },
  { nombre: 'Bianual', duracion_codigo: '24M', moneda: 'RD$', precio: 449 },
  { nombre: 'Vitalicia', duracion_codigo: 'L', moneda: 'RD$', precio: 499 },
];

const etiquetaDuracion = (codigo) => {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') return 'Pago único';
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) return '';
  const n = Number(m[1]);
  return m[2] === 'M' ? `/ ${n} mes${n > 1 ? 'es' : ''}` : `/ ${n} día${n > 1 ? 's' : ''}`;
};

const formatearPrecio = (plan) => {
  const valor = Number(plan.precio || 0);
  const cifra = valor.toLocaleString('es-DO', { maximumFractionDigits: 0 });
  return `${plan.moneda || 'RD$'} ${cifra}`;
};

const MODULES = [
  'Mapa de Mesas', 'Facturación DGII', 'KDS Cocina', 'Reportes', 'Pagos Mixtos',
];

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: `${5 + ((i * 7) % 90)}%`,
  bottom: `${3 + ((i * 9) % 45)}%`,
  delay: `${(i * 1.2) % 7}s`,
  duration: `${7 + (i % 4) * 2.5}s`,
  size: `${2 + (i % 3)}px`,
  color:
    i % 3 === 0 ? 'rgba(0,245,118,0.5)' : i % 3 === 1 ? 'rgba(214,164,77,0.45)' : 'rgba(109,140,255,0.35)',
}));

const LINES = [
  { top: '12%', left: '6%', width: '180px', delay: '0s' },
  { top: '28%', right: '4%', width: '140px', delay: '2.5s' },
  { top: '48%', left: '3%', width: '220px', delay: '1s' },
  { top: '65%', right: '8%', width: '120px', delay: '3.5s' },
  { top: '82%', left: '15%', width: '160px', delay: '1.8s' },
];

function LandingScreen({ onAcceder, onRegistrarse, onAccesoPropietario, config, apiUrl }) {
  const nombre = config?.nombre_negocio || config?.nombre || 'ChloeRestaurant';
  const logo = config?.logo || config?.logo_url || config?.logoUrl || null;

  const [planes, setPlanes] = useState(PLANES);
  const [planesCargados, setPlanesCargados] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/planes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelado || !data || !Array.isArray(data.planes) || data.planes.length === 0) return;
        setPlanes(data.planes);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setPlanesCargados(true);
      });
    return () => { cancelado = true; };
  }, [apiUrl]);

  return (
    <div className="landing-root">

      {/* ═══ BOTÓN SALIR (Electron) ═══ */}
      <BotonSalirElectron top="16px" right="16px" />

      {/* ═══ BACKGROUND ═══ */}
      <div className="landing-bg">
        <div className="landing-bg__logo" aria-hidden="true">
          {logo ? <img src={logo} alt="" className="landing-bg__logo-image" /> : <span className="landing-bg__logo-icon">🍽️</span>}
        </div>
        <div className="landing-bg__logo landing-bg__logo--alt" aria-hidden="true">
          {logo ? <img src={logo} alt="" className="landing-bg__logo-image" /> : <span className="landing-bg__logo-icon">🍽️</span>}
        </div>
        <div className="landing-bg__glow landing-bg__glow--1" />
        <div className="landing-bg__glow landing-bg__glow--2" />
        <div className="landing-bg__glow landing-bg__glow--3" />
        <div className="landing-bg__grid" />
        <div className="landing-bg__particles">
          {PARTICLES.map((p) => (
            <div key={p.id} className="landing-bg__particle" style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, background: p.color, animationDelay: p.delay, animationDuration: p.duration }} />
          ))}
        </div>
        {LINES.map((l, i) => (
          <div key={i} className="landing-bg__line" style={{ top: l.top, left: l.left, right: l.right, width: l.width, animationDelay: l.delay }} />
        ))}
        <div className="landing-bg__orb" />
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="landing-content">

        {/* ── NAVBAR ── */}
        <nav className="landing-nav">
          <div className="landing-nav__brand">
            <div className="landing-nav__icon">
              {logo ? <img src={logo} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px' }} /> : '🍽️'}
            </div>
            <span>{nombre}</span>
          </div>
          <div className="landing-nav__actions">
            {onAccesoPropietario && (
              <button type="button" className="landing-nav__link" onClick={onAccesoPropietario} title="Acceso del Propietario">
                <Crown size={14} /> Propietario
              </button>
            )}
            <button type="button" className="landing-nav__link" onClick={onAcceder}>Iniciar Sesión</button>
            <button type="button" className="landing-btn landing-btn--primary landing-btn--nav" onClick={() => onRegistrarse(null)}>
              <Sparkles size={14} /> Registrarse
            </button>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="landing-hero">
          <div className="landing-hero__content">
            <div className="landing-hero__eyebrow">
              <span className="landing-hero__eyebrow-dot" />
              POS INTEGRAL PARA RESTAURANTES
            </div>
            <div className="landing-hero__badge">
              {logo ? <img src={logo} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>🍽️</span>}
            </div>
            <h1 className="landing-hero__title">{nombre}</h1>
            <p className="landing-hero__subtitle">Sistema POS Integral para Restaurantes</p>
            <p className="landing-hero__tagline">
              Facturación DGII · Mapa de mesas · Cocina KDS · Reportes en tiempo real · Pagos mixtos
            </p>
            <div className="landing-hero__modules">
              {MODULES.map((m, i) => (
                <span key={i}><Zap size={10} /> {m}</span>
              ))}
            </div>
            <div className="landing-hero__actions">
              <button type="button" className="landing-btn landing-btn--primary" onClick={() => onRegistrarse(null)}>
                <Sparkles size={18} /> Registrarse Ahora <ArrowRight size={16} />
              </button>
              <button type="button" className="landing-btn landing-btn--secondary" onClick={onAcceder}>
                <KeyRound size={18} /> Acceder al Panel
              </button>
            </div>
          </div>

          {/* Dashboard visual */}
          <div className="landing-dashboard">
            <div className="landing-dashboard__glow" />
            <div className="landing-dashboard__window">
              <div className="landing-dashboard__scan" />
              <div className="landing-dashboard__header">
                <div className="landing-dashboard__window-controls">
                  <span /><span /><span />
                </div>
                <div className="landing-dashboard__title">Panel de Control</div>
                <div className="landing-dashboard__live">
                  <span /> EN VIVO
                </div>
              </div>
              <div className="landing-dashboard__body">
                <div className="landing-dashboard__welcome">
                  <div>
                    <small>PANEL DE CONTROL</small>
                    <strong>Buenas noches, Admin</strong>
                  </div>
                  <div className="landing-dashboard__date">Hoy, 13 Ago 2026</div>
                </div>

                <div className="landing-dashboard__stats">
                  {STATSDATA.map((s, i) => (
                    <div key={i} className="landing-stat">
                      <div className={`landing-stat__icon landing-stat__icon--${s.color}`}>
                        <s.icon size={14} />
                      </div>
                      <div>
                        <small>{s.label}</small>
                        <strong>{s.value}</strong>
                      </div>
                      <div className="landing-stat__trend"><TrendingUp size={8} /></div>
                    </div>
                  ))}
                </div>

                <div className="landing-dashboard__section">
                  <div className="landing-dashboard__section-head">
                    Mapa del Salón <small>18/24 mesas</small>
                  </div>
                  <div className="landing-tables">
                    {TABLESDATA.map((t, i) => (
                      <div key={i} className={`landing-table landing-table--${t.status}`}>
                        <span>{t.num}</span>
                        <small>{t.status === 'occupied' ? 'Ocupada' : t.status === 'reserved' ? 'Reservada' : 'Libre'}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="landing-dashboard__activity">
                  <div><div className="landing-activity__dot" /> Sistema activo</div>
                  <div><Shield size={8} /> <small>Licencia Premium</small></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CARACTERÍSTICAS ── */}
        <section className="landing-section">
          <div className="landing-section__heading-row">
            <div>
              <span className="landing-section__eyebrow">MÓDULOS</span>
              <h2 className="landing-section__title" style={{ textAlign: 'left', marginBottom: 0 }}>
                Todo lo que tu restaurante <span>necesita</span>
              </h2>
            </div>
            <p className="landing-section__heading-desc">
              Un sistema completo diseñado para optimizar cada aspecto de tu negocio gastronómico.
            </p>
          </div>
          <div className="landing-features">
            {CARACTERISTICAS.map((f, i) => {
              const Icon = f.icono;
              return (
                <div key={i} className="landing-feature">
                  <div className="landing-feature__icon"><Icon size={20} strokeWidth={2} /></div>
                  <div>
                    <h3 className="landing-feature__name">{f.titulo}</h3>
                    <p className="landing-feature__desc">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── PLANES ── */}
        <section className="landing-section landing-section--plans">
          <span className="landing-section__eyebrow" style={{ textAlign: 'center', display: 'block', marginBottom: '8px' }}>SUSCRIPCIÓN</span>
          <h2 className="landing-section__title">
            Planes de <span>Suscripción</span>
          </h2>
          <div className="landing-plans">
            {planes.map((p, i) => (
              <div key={p.id || i} className={`landing-plan ${p.destacado ? 'landing-plan--highlight' : ''}`}>
                {p.destacado && <span className="landing-plan__tag">Popular</span>}
                <div>
                  <h3 className="landing-plan__name">{p.nombre}</h3>
                  <p className="landing-plan__price">
                    {formatearPrecio(p)} <small style={{ fontSize: '0.65em', color: 'inherit', opacity: 0.75 }}>{etiquetaDuracion(p.duracion_codigo)}</small>
                  </p>
                </div>
                <button type="button" className={p.destacado ? 'landing-btn--planActive' : 'landing-btn--plan'} onClick={() => onRegistrarse(p)}>
                  Elegir Plan
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="landing-footer">
          <p className="landing-footer__main">© 2026 {nombre} — Sistema POS para Restaurantes</p>
          <p className="landing-footer__sub">Desarrollado con dedicación para emprendedores gastronómicos</p>
        </footer>
      </div>
    </div>
  );
}

export default LandingScreen;
