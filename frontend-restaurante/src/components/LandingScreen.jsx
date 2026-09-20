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
  TrendingUp,
  Clock,
  Crown,
  Check,
  ChefHat,
  Wifi,
  BadgeCheck,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import './LandingScreen.css';
import { URL_CENTRAL } from '../configApi.js';

const CARACTERISTICAS = [
  { icono: LayoutGrid, titulo: 'Mapa de mesas', desc: 'Control del salón en tiempo real: mesas, traslados, zonas y reservas.' },
  { icono: Receipt, titulo: 'Facturación DGII', desc: 'RNC, ITBIS, NCF y comprobantes electrónicos e-CF listos para auditoría.' },
  { icono: ChefHat, titulo: 'Cocina y bar (KDS)', desc: 'Cada comanda llega al instante a la pantalla de producción correcta.' },
  { icono: ShieldCheck, titulo: 'Seguridad total', desc: 'Acceso por PIN, arqueos ciegos, cierres de caja y auditoría completa.' },
  { icono: BarChart3, titulo: 'Reportes y control', desc: 'Ventas, cierres históricos e ingresos en un tablero claro y en vivo.' },
  { icono: CreditCard, titulo: 'Pagos flexibles', desc: 'Efectivo, tarjeta, transferencia, multidivisa y pago mixto.' },
];

const MESAS_DEMO = [
  { n: 1, e: 'ocupada' }, { n: 2, e: 'libre' }, { n: 3, e: 'ocupada' }, { n: 4, e: 'reservada' },
  { n: 5, e: 'libre' }, { n: 6, e: 'ocupada' }, { n: 7, e: 'libre' }, { n: 8, e: 'ocupada' },
];

const PLANES_FALLBACK = [
  { nombre: 'Mensual', duracion_codigo: '30D', moneda: 'RD$', precio: 29 },
  { nombre: 'Trimestral', duracion_codigo: '90D', moneda: 'RD$', precio: 79 },
  { nombre: 'Semestral', duracion_codigo: '6M', moneda: 'RD$', precio: 149 },
  { nombre: 'Anual', duracion_codigo: '12M', moneda: 'RD$', precio: 249, destacado: true },
  { nombre: 'Bianual', duracion_codigo: '24M', moneda: 'RD$', precio: 449 },
  { nombre: 'Vitalicia', duracion_codigo: 'L', moneda: 'RD$', precio: 499 },
];

const etiquetaDuracion = (codigo) => {
  const u = String(codigo || '').toUpperCase();
  if (u === 'L') return 'pago único';
  const m = /^([0-9]+)([DM])$/.exec(u);
  if (!m) return '';
  const n = Number(m[1]);
  return m[2] === 'M' ? `/ ${n} mes${n > 1 ? 'es' : ''}` : `/ ${n} día${n > 1 ? 's' : ''}`;
};

const formatearPrecio = (plan) => {
  const valor = Number(plan.precio || 0);
  const cifra = valor.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return { moneda: plan?.moneda || 'RD$', cifra };
};

const BENEFICIOS_PLAN = ['Todos los módulos incluidos', 'Facturación DGII y e-CF', 'Soporte y actualizaciones'];

function LandingScreen({ onAcceder, onRegistrarse, onAccesoPropietario, config, logoUrl }) {
  const nombre = config?.nombre_negocio || config?.nombre || 'ChloeRestaurant';
  const logo = config?.logo || config?.logo_url || config?.logoUrl || logoUrl || null;
  const landingTheme = ['obsidiana-gold', 'marfil-editorial', 'noir-executive'].includes(config?.landing_theme)
    ? config.landing_theme
    : (localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold');
  const claro = landingTheme === 'marfil-editorial';
  // Ícono de marca del sistema (Chloe) cuando no hay logo comercial asignado.
  const ICONO_SISTEMA = '/icons.svg';

  const [planes, setPlanes] = useState(PLANES_FALLBACK);
  const [planesLoading, setPlanesLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      for (let intento = 0; intento <= 2 && !cancelado; intento += 1) {
        try {
          const res = await fetch(`${URL_CENTRAL}/api/planes`);
          const data = res.ok ? await res.json() : null;
          if (cancelado) return;
          if (data && Array.isArray(data.planes) && data.planes.length > 0) {
            setPlanes(data.planes);
            setPlanesLoading(false);
            return;
          }
        } catch {
          // reintentar abajo (red/arranque lento del servidor central)
        }
        if (intento < 2 && !cancelado) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!cancelado) setPlanesLoading(false);
    })();
    return () => { cancelado = true; };
  }, []);

  const planesVisibles = planes
    .filter((p) => p.activo !== false)
    .sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0))
    .slice(0, 4);

  return (
    <div className={`ld ld--${claro ? 'light' : 'dark'}`}>
      <div className="ld-aura" aria-hidden="true" />

      {/* ── Navegación ── */}
      <header className="ld-nav">
        <a className="ld-brand" href="#inicio" aria-label={nombre}>
          <span className="ld-brand__mark"><img src={logo || ICONO_SISTEMA} alt="" /></span>
          <span className="ld-brand__name">{nombre}</span>
        </a>
        <nav className="ld-nav__links" aria-label="Secciones">
          <a href="#modulos">Módulos</a>
          <a href="#planes">Planes</a>
        </nav>
        <div className="ld-nav__actions">
          {onAccesoPropietario && (
            <button type="button" className="ld-btn ld-btn--ghost ld-btn--sm ld-hide-sm" onClick={onAccesoPropietario} title="Acceso del propietario">
              <Crown size={15} /> Propietario
            </button>
          )}
          <button type="button" className="ld-btn ld-btn--ghost ld-btn--sm" onClick={onAcceder}>Iniciar sesión</button>
          <button type="button" className="ld-btn ld-btn--gold ld-btn--sm" onClick={() => onRegistrarse(null)}>
            <Sparkles size={15} /> Registrarse
          </button>
        </div>
      </header>

      <main id="inicio">
        {/* ── Hero ── */}
        <section className="ld-hero">
          <div className="ld-hero__copy">
            <span className="ld-pill"><span className="ld-pill__dot" />POS integral para restaurantes</span>
            <h1 className="ld-hero__title">
              Tu restaurante, <em>bajo control</em> desde la primera mesa.
            </h1>
            <p className="ld-hero__lead">
              Mesas, comandas, cocina, caja y facturación DGII en un solo sistema elegante,
              rápido y hecho para operar sin fricción todos los días.
            </p>
            <div className="ld-hero__cta">
              <button type="button" className="ld-btn ld-btn--gold ld-btn--lg" onClick={() => onRegistrarse(null)}>
                Comenzar ahora <ArrowRight size={18} />
              </button>
              <button type="button" className="ld-btn ld-btn--outline ld-btn--lg" onClick={onAcceder}>
                <KeyRound size={17} /> Acceder
              </button>
            </div>
            <ul className="ld-proof">
              <li><ShieldCheck size={16} /> Operación segura</li>
              <li><TrendingUp size={16} /> Más control</li>
              <li><Clock size={16} /> Más rapidez</li>
            </ul>
          </div>

          {/* Vista previa del producto (ilustrativa) */}
          <div className="ld-hero__visual" aria-hidden="true">
            <div className="ld-window">
              <div className="ld-window__bar"><i /><i /><i /><span>Salón · en vivo</span><b><Wifi size={12} /> En línea</b></div>
              <div className="ld-window__body">
                <div className="ld-kpis">
                  <div><small>Ventas de hoy</small><strong>RD$ 48,250</strong></div>
                  <div><small>Ocupación</small><strong>75%</strong></div>
                  <div><small>Tiempo medio</small><strong>35 min</strong></div>
                </div>
                <div className="ld-floor">
                  {MESAS_DEMO.map((m) => (
                    <div key={m.n} className={`ld-table ld-table--${m.e}`}>
                      <strong>{m.n}</strong>
                      <span>{m.e === 'ocupada' ? 'Ocupada' : m.e === 'reservada' ? 'Reservada' : 'Libre'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="ld-float ld-float--a"><span><ChefHat size={16} /></span><div><strong>Comanda enviada</strong><small>Mesa 3 · Cocina y bar</small></div></div>
            <div className="ld-float ld-float--b"><span><BadgeCheck size={16} /></span><div><strong>Factura emitida</strong><small>B02 · RD$ 4,108.80</small></div></div>
          </div>
        </section>

        {/* ── Módulos ── */}
        <section className="ld-section" id="modulos">
          <div className="ld-section__head">
            <span className="ld-eyebrow">Módulos</span>
            <h2>Todo lo que tu operación <em>necesita</em></h2>
            <p>Un sistema completo y consistente, del salón a la declaración fiscal.</p>
          </div>
          <div className="ld-features">
            {CARACTERISTICAS.map((f) => {
              const Icon = f.icono;
              return (
                <article key={f.titulo} className="ld-feature">
                  <span className="ld-feature__icon"><Icon size={22} strokeWidth={1.8} /></span>
                  <h3>{f.titulo}</h3>
                  <p>{f.desc}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Planes ── */}
        <section className="ld-section" id="planes">
          <div className="ld-section__head">
            <span className="ld-eyebrow">Suscripción</span>
            <h2>Planes <em>transparentes</em></h2>
            <p>Elige la duración que mejor se adapte a tu negocio. Sin costos ocultos.</p>
          </div>
          <div className="ld-plans">
            {planesLoading
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="ld-plan ld-plan--skeleton" style={{ animationDelay: `${i * 120}ms` }} />)
              : planesVisibles.map((p, i) => {
                  const { moneda, cifra } = formatearPrecio(p);
                  return (
                    <article key={p.id || i} className={`ld-plan ${p.destacado ? 'ld-plan--hot' : ''}`}>
                      {p.destacado && <span className="ld-plan__tag"><Sparkles size={12} /> Más elegido</span>}
                      <h3>{p.nombre}</h3>
                      <p className="ld-plan__price"><small>{moneda}</small>{cifra}<span>{etiquetaDuracion(p.duracion_codigo)}</span></p>
                      <ul>
                        {BENEFICIOS_PLAN.map((b) => <li key={b}><Check size={15} />{b}</li>)}
                      </ul>
                      <button type="button" className={`ld-btn ld-btn--block ${p.destacado ? 'ld-btn--gold' : 'ld-btn--outline'}`} onClick={() => onRegistrarse(p)}>
                        Elegir plan
                      </button>
                    </article>
                  );
                })}
          </div>
        </section>

        {/* ── Cierre ── */}
        <section className="ld-cta">
          <div>
            <h2>Lleva tu restaurante al <em>siguiente nivel</em></h2>
            <p>Activa tu licencia en minutos y comienza a operar hoy mismo.</p>
          </div>
          <div className="ld-cta__actions">
            <button type="button" className="ld-btn ld-btn--gold ld-btn--lg" onClick={() => onRegistrarse(null)}><Utensils size={18} /> Registrarme</button>
            <button type="button" className="ld-btn ld-btn--outline ld-btn--lg" onClick={onAcceder}>Ya tengo cuenta</button>
          </div>
        </section>
      </main>

      <footer className="ld-footer">
        <p>ChloeRestaurant POS Multiempresa By BMTECHRD &copy; {new Date().getFullYear()}</p>
        <p>Desarrollado con dedicación por BMTECHRD</p>
      </footer>
    </div>
  );
}

export default LandingScreen;
