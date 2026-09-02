import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LockKeyhole,
  Clock3,
  Server,
  Store,
  User,
  ShieldCheck,
  ChefHat,
  Wine,
  Delete,
  Settings,
  MapPin,
  Sparkles,
  Layers,
  CheckCircle2,
  RefreshCw,
  MonitorCog,
  Palette,
  X,
  Check,
  Moon,
  Crown,
  Zap,
  Coffee,
  Leaf,
  Waves,
  Flame,
  Martini,
  Sun
} from 'lucide-react';
import './login-screen.css';
import { toastError, toastAviso } from '../../components/Toast.jsx';
import { obtenerDeviceId } from '../../utils/dispositivo.js';
import { esElectronApp } from '../../configApi.js';
import { LOGIN_TEMAS } from '../../themes/loginThemes.js';
import fondoPredeterminado from '../../assets/branding/chloe-login-bg.jpg';
import logoPredeterminado from '../../assets/branding/chloe-logo.png';

const PIN_LONGITUD_DEFECTO = 6;

const TECLAS_KEYPAD = [
  { num: '1', sub: ' ' },
  { num: '2', sub: 'ABC' },
  { num: '3', sub: 'DEF' },
  { num: '4', sub: 'GHI' },
  { num: '5', sub: 'JKL' },
  { num: '6', sub: 'MNO' },
  { num: '7', sub: 'PQRS' },
  { num: '8', sub: 'TUV' },
  { num: '9', sub: 'WXYZ' },
];

// Mapa de iconos lucide para badges de temas (reemplaza emojis)
const ICONOS_TEMA = { Crown, Zap, Coffee, Leaf, Waves, Flame, Martini, Sun };
function IconoTema({ nombre, size = 12 }) {
  const Icon = ICONOS_TEMA[nombre];
  return Icon ? <Icon size={size} /> : null;
}

function LoginScreen({
  onLogin,
  configSistema = null,
  apiUrl,
  onChangeServer,
  onVerKDS,
  onVolver = null,
  servidorOnline = true,
}) {
  const [pin, setPin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [hora, setHora] = useState('');
  const [fecha, setFecha] = useState('');
  const [logoActual, setLogoActual] = useState(logoPredeterminado);
  const [fondoActual, setFondoActual] = useState(fondoPredeterminado);
  const [sistemaInfo, setSistemaInfo] = useState(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  );

  const pinLength = useMemo(() => {
    const l = Number(configSistema?.pin_longitud);
    return Number.isInteger(l) && l >= 4 && l <= 8 ? l : PIN_LONGITUD_DEFECTO;
  }, [configSistema?.pin_longitud]);

  /* Responsive detector */
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* Reloj y Fecha en tiempo real */
  useEffect(() => {
    const actualizarReloj = () => {
      const ahora = new Date();
      setHora(
        ahora.toLocaleTimeString('es-DO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setFecha(
        ahora.toLocaleDateString('es-DO', {
          weekday: 'long',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      );
    };

    actualizarReloj();
    const intervalo = setInterval(actualizarReloj, 1000);
    return () => clearInterval(intervalo);
  }, []);

  /* Configuración visual del restaurante */
  useEffect(() => {
    if (!configSistema) return;

    if (configSistema.logo_url) {
      const urlLogo = configSistema.logo_url.startsWith('http')
        ? configSistema.logo_url
        : `${apiUrl}${configSistema.logo_url}`;
      setLogoActual(urlLogo);
    } else {
      setLogoActual(logoPredeterminado);
    }

    if (configSistema.fondo_login_url) {
      const urlFondo = configSistema.fondo_login_url.startsWith('http')
        ? configSistema.fondo_login_url
        : `${apiUrl}${configSistema.fondo_login_url}`;
      setFondoActual(urlFondo);
    } else {
      setFondoActual(fondoPredeterminado);
    }
  }, [configSistema, apiUrl]);

  /* Info del sistema */
  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/sistema/info`);
        if (res.ok && activo) {
          setSistemaInfo(await res.json());
        }
      } catch {
        /* No bloqueante */
      }
    };
    cargar();
    const interval = setInterval(cargar, 30000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  /* Iniciar sesión */
  const iniciarSesion = useCallback(
    async (pinAEnviar) => {
      if (cargando) return;
      setCargando(true);

      try {
        const res = await fetch(`${apiUrl}/api/login/camarero`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: pinAEnviar,
            deviceId: obtenerDeviceId(),
          }),
        });

        const data = await res.json();

        if (res.ok) {
          onLogin(data);
        } else {
          toastError(data.error || 'PIN de acceso incorrecto');
          setPin('');
        }
      } catch {
        toastError('No fue posible conectar con el servidor central');
        setPin('');
      } finally {
        setCargando(false);
      }
    },
    [apiUrl, cargando, onLogin]
  );

  /* Teclado numérico */
  const agregarNumero = useCallback(
    (digito) => {
      if (cargando) return;
      setPin((prev) => {
        if (prev.length >= pinLength) return prev;
        const nuevo = prev + digito;
        if (nuevo.length === pinLength) {
          setTimeout(() => iniciarSesion(nuevo), 80);
        }
        return nuevo;
      });
    },
    [cargando, pinLength, iniciarSesion]
  );

  const borrarNumero = useCallback(() => {
    if (cargando) return;
    setPin((prev) => prev.slice(0, -1));
  }, [cargando]);

  const limpiarPin = useCallback(() => {
    if (cargando) return;
    setPin('');
  }, [cargando]);

  /* Soporte teclado físico */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (cargando) return;
      if (/^[0-9]$/.test(e.key)) {
        agregarNumero(e.key);
      } else if (e.key === 'Backspace') {
        borrarNumero();
      } else if (e.key === 'Escape') {
        limpiarPin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agregarNumero, borrarNumero, limpiarPin, cargando]);

  const nombreNegocio = configSistema?.nombre_negocio || 'Mi Negocio';
  const slogan = configSistema?.slogan || 'Sistema Profesional de Gestión Gastronómica & POS';
  const version = configSistema?.version || '2.1.0';
  const provincia = configSistema?.provincia || 'Santo Domingo, DO';
  const cajaAbierta = Boolean(sistemaInfo?.caja_abierta);
  const cajeraTurno = sistemaInfo?.cajera_nombre || null;
  const [skinActual, setSkinActual] = useState(() => {
    return configSistema?.login_theme || localStorage.getItem('chloe_login_skin') || 'chef_noir';
  });
  const [mostrarSelectorSkin, setMostrarSelectorSkin] = useState(false);

  // Protector de Pantalla (Screensaver)
  const [screensaverActivo, setScreensaverActivo] = useState(false);
  const [screensaverMinutos, setScreensaverMinutos] = useState(() => {
    const val = localStorage.getItem('chloe_screensaver_minutos');
    return val !== null ? Number(val) : 2; // 2 minutos por defecto
  });

  useEffect(() => {
    if (configSistema?.login_theme) {
      setSkinActual(configSistema.login_theme);
    }
  }, [configSistema?.login_theme]);

  // Detector de inactividad para activar el protector de pantalla
  useEffect(() => {
    if (!screensaverMinutos || screensaverMinutos <= 0) {
      setScreensaverActivo(false);
      return;
    }

    let timer = null;

    const reiniciarTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setScreensaverActivo(true);
      }, screensaverMinutos * 60 * 1000);
    };

    const despertar = () => {
      setScreensaverActivo(false);
      reiniciarTimer();
    };

    // Despertar con CUALQUIER tecla o interacción
    const manejarTecla = () => {
      despertar();
    };

    const manejarMovimiento = () => {
      if (!screensaverActivo) {
        reiniciarTimer();
      }
    };

    const manejarInteraccion = () => {
      despertar();
    };

    window.addEventListener('keydown', manejarTecla, { passive: true });
    window.addEventListener('mousemove', manejarMovimiento, { passive: true });
    window.addEventListener('mousedown', manejarInteraccion, { passive: true });
    window.addEventListener('touchstart', manejarInteraccion, { passive: true });
    window.addEventListener('pointerdown', manejarInteraccion, { passive: true });

    reiniciarTimer();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('keydown', manejarTecla);
      window.removeEventListener('mousemove', manejarMovimiento);
      window.removeEventListener('mousedown', manejarInteraccion);
      window.removeEventListener('touchstart', manejarInteraccion);
      window.removeEventListener('pointerdown', manejarInteraccion);
    };
  }, [screensaverMinutos, screensaverActivo]);

  const cambiarSkin = (skinId) => {
    setSkinActual(skinId);
    try {
      localStorage.setItem('chloe_login_skin', skinId);
    } catch {}
    toastAviso(`🎨 Skin aplicado: ${LOGIN_TEMAS.find(t => t.id === skinId)?.nombre || skinId}`);
    setMostrarSelectorSkin(false);
  };

  const cambiarTiempoScreensaver = (minutos) => {
    setScreensaverMinutos(minutos);
    try {
      localStorage.setItem('chloe_screensaver_minutos', String(minutos));
    } catch {}
    toastAviso(minutos > 0 ? `🌙 Protector activado tras ${minutos} min de inactividad` : '🌙 Protector de pantalla desactivado');
  };

  const probarScreensaver = () => {
    setMostrarSelectorSkin(false);
    setScreensaverActivo(true);
  };

  const temaInfo = LOGIN_TEMAS.find(t => t.id === skinActual) || LOGIN_TEMAS[0];

  return (
    <main className="modern-login" data-login-skin={skinActual}>
      {/* Fondo con mesh aurora y viñeta profunda */}
      <div
        className="modern-login__bg"
        style={{ backgroundImage: `url(${fondoActual})` }}
      />
      <div className="modern-login__overlay" />
      <div className="modern-login__glow modern-login__glow--left" />
      <div className="modern-login__glow modern-login__glow--right" />

      {/* Barra de Estado Superior */}
      <header className="modern-login__topbar">
        <div className="modern-login__status-badge">
          <span className={`status-dot ${servidorOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
          <span className="status-text">{servidorOnline ? 'Servidor POS en Línea' : 'Servidor Desconectado'}</span>
          <span className="status-sep">•</span>
          <span className="status-host">{window.location.hostname || 'Local'}</span>
        </div>

        <div className="modern-login__topbar-actions">
          {/* Botón de Selección Rápida de Skin */}
          <button
            type="button"
            className="topbar-btn"
            onClick={() => setMostrarSelectorSkin(true)}
            title="Cambiar Skin / Apariencia del Login"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
          >
            <Palette size={14} style={{ color: 'var(--ml-gold)' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <IconoTema nombre={temaInfo.icon} size={12} />
              {temaInfo.badge || 'Skin'}
            </span>
          </button>

          {provincia && (
            <div className="location-pill">
              <MapPin size={13} />
              <span>{provincia}</span>
            </div>
          )}

          {onVolver && (
            <button
              type="button"
              className="topbar-btn"
              onClick={onVolver}
              title="Volver a la pantalla de bienvenida"
            >
              ← Inicio
            </button>
          )}

          {esElectronApp() && onChangeServer && (
            <button
              type="button"
              className="topbar-btn topbar-btn--icon"
              onClick={onChangeServer}
              title="Configurar servidor"
            >
              <Settings size={15} />
            </button>
          )}
        </div>
      </header>

      {/* ── Modal Selector de Skins en Tiempo Real ── */}
      {mostrarSelectorSkin && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setMostrarSelectorSkin(false)}
        >
          <div
            style={{
              background: '#0b0f19',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '20px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--ml-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Palette size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                    Skins de Pantalla PIN
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Elige el estilo visual que mejor combine con tu restaurante
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMostrarSelectorSkin(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {LOGIN_TEMAS.map((t) => {
                const esActivo = skinActual === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => cambiarSkin(t.id)}
                    style={{
                      padding: '14px',
                      borderRadius: '12px',
                      background: esActivo ? 'rgba(245, 184, 61, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1.5px solid ${esActivo ? 'var(--ml-gold, #f5b83d)' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      boxShadow: esActivo ? '0 0 16px rgba(245, 184, 61, 0.2)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {t.paleta.map((c, i) => (
                          <span
                            key={i}
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '4px',
                              background: c,
                              display: 'inline-block',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.4)'
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: esActivo ? 'var(--ml-gold)' : '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <IconoTema nombre={t.icon} size={12} />
                        {t.badge}
                      </span>
                    </div>

                    <div>
                      <strong style={{ color: '#fff', fontSize: '0.88rem', display: 'block' }}>{t.nombre}</strong>
                      <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.3 }}>{t.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Sección Protector de Pantalla (Screensaver) ── */}
            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Moon size={16} style={{ color: 'var(--ml-gold, #f5b83d)' }} />
                  <strong style={{ color: '#fff', fontSize: '0.92rem' }}>Protector de Pantalla</strong>
                </div>
                <button
                  type="button"
                  onClick={probarScreensaver}
                  style={{
                    background: 'rgba(245, 184, 61, 0.15)',
                    border: '1px solid rgba(245, 184, 61, 0.35)',
                    color: 'var(--ml-gold, #f5b83d)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ✨ Probar ahora
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: '🚫 Apagado', minutos: 0 },
                  { label: '⏱️ 1 Min', minutos: 1 },
                  { label: '⏱️ 2 Min', minutos: 2 },
                  { label: '⏱️ 5 Min', minutos: 5 },
                  { label: '⏱️ 10 Min', minutos: 10 },
                ].map((opc) => {
                  const seleccionado = screensaverMinutos === opc.minutos;
                  return (
                    <button
                      key={opc.minutos}
                      type="button"
                      onClick={() => cambiarTiempoScreensaver(opc.minutos)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: seleccionado ? 'rgba(245, 184, 61, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${seleccionado ? 'var(--ml-gold, #f5b83d)' : 'rgba(255, 255, 255, 0.08)'}`,
                        color: seleccionado ? '#fff' : '#94a3b8'
                      }}
                    >
                      {opc.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                El protector se desactiva instantáneamente al presionar cualquier tecla o tocar la pantalla.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setMostrarSelectorSkin(false)}
                className="topbar-btn"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Protector de Pantalla (Screensaver Overlay) ── */}
      {screensaverActivo && (
        <div
          className="modern-screensaver"
          onClick={() => setScreensaverActivo(false)}
          role="dialog"
          aria-label="Protector de pantalla"
        >
          <div
            className="modern-screensaver__bg"
            style={{ backgroundImage: `url(${fondoActual})` }}
          />
          <div className="modern-screensaver__overlay" />
          <div className="modern-screensaver__content">
            <div className="modern-screensaver__logo-box">
              <img
                src={logoActual}
                alt={nombreNegocio}
                className="modern-screensaver__logo"
                onError={() => setLogoActual(logoPredeterminado)}
              />
            </div>
            <div>
              <div className="modern-screensaver__clock">{hora}</div>
              <div className="modern-screensaver__date">{fecha}</div>
            </div>
            <div className="modern-screensaver__brand">{nombreNegocio}</div>
            <div className="modern-screensaver__hint">
              <span>⌨️ Presiona cualquier tecla o toca la pantalla para continuar</span>
            </div>
          </div>
        </div>
      )}

      {/* Contenedor Principal */}
      <div className="modern-login__container">
        {/* Columna Izquierda: Identidad de Marca y Métricas (Desktop) */}
        {!isMobile && (
          <section className="modern-login__brand-panel">
            <div className="brand-crest">
              {logoActual ? (
                <img
                  src={logoActual}
                  alt={nombreNegocio}
                  className="brand-crest__img"
                  onError={() => setLogoActual(logoPredeterminado)}
                />
              ) : (
                <div className="brand-crest__fallback">CR</div>
              )}
            </div>

            <h1 className="brand-title">{nombreNegocio}</h1>
            <p className="brand-slogan">{slogan}</p>

            <div className="brand-rule" />

            {/* Reloj Moderno */}
            <div className="modern-clock">
              <div className="modern-clock__icon">
                <Clock3 size={24} />
              </div>
              <div className="modern-clock__content">
                <span className="modern-clock__time">{hora || '00:00:00'}</span>
                <span className="modern-clock__date">{fecha}</span>
              </div>
            </div>

            {/* Diagnóstico de Terminal */}
            <div className="system-telemetry">
              <div className="telemetry-card">
                <div className="telemetry-card__icon">
                  <Server size={17} />
                </div>
                <div className="telemetry-card__info">
                  <span className="telemetry-label">Servidor Central</span>
                  <span className="telemetry-value telemetry-value--green">
                    {servidorOnline ? 'Conectado (Latencia Óptima)' : 'Reintentando conexión...'}
                  </span>
                </div>
              </div>

              <div className="telemetry-card">
                <div className="telemetry-card__icon">
                  <Store size={17} />
                </div>
                <div className="telemetry-card__info">
                  <span className="telemetry-label">Estado de Caja</span>
                  <span className="telemetry-value">
                    {cajaAbierta ? (cajeraTurno ? `Turno Activo: ${cajeraTurno}` : 'Caja Abierta') : 'Caja Cerrada'}
                  </span>
                </div>
              </div>

              <div className="telemetry-card">
                <div className="telemetry-card__icon">
                  <ShieldCheck size={17} />
                </div>
                <div className="telemetry-card__info">
                  <span className="telemetry-label">Seguridad Multi-empresa</span>
                  <span className="telemetry-value telemetry-value--gold">Cifrado RLS Activo • v{version}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Columna Derecha: Tarjeta de Acceso y Teclado Numérico */}
        <section className={`modern-login__card ${cargando ? 'modern-login__card--loading' : ''}`}>
          {/* Encabezado Móvil con Logo */}
          {isMobile && (
            <div className="mobile-brand-header">
              <div className="mobile-brand-header__logo">
                <img
                  src={logoActual}
                  alt={nombreNegocio}
                  onError={() => setLogoActual(logoPredeterminado)}
                />
              </div>
              <div className="mobile-brand-header__text">
                <h2>{nombreNegocio}</h2>
                <span className="mobile-brand-header__time">{hora} • {fecha}</span>
              </div>
            </div>
          )}

          {/* Encabezado de la Tarjeta */}
          <div className="card-header" style={{ textAlign: 'center', justifyContent: 'center', marginBottom: '18px' }}>
            <div className="card-header__text" style={{ textAlign: 'center', width: '100%' }}>
              <h2 className="card-header__title" style={{ margin: '0 0 6px', fontSize: '1.45rem', fontWeight: 800 }}>Introduce tu PIN</h2>
              <p className="card-header__desc" style={{ margin: 0, fontSize: '0.84rem' }}>Digita tu clave numérica de {pinLength} dígitos</p>
            </div>
          </div>

          {/* Visualizador de PIN (Píldoras Luminous) */}
          <div className="pin-visualizer" aria-label={`${pin.length} de ${pinLength} dígitos`}>
            {Array.from({ length: pinLength }).map((_, i) => {
              const lleno = i < pin.length;
              return (
                <div
                  key={i}
                  className={`pin-pill ${lleno ? 'pin-pill--filled' : ''}`}
                >
                  <span className="pin-pill__core" />
                </div>
              );
            })}
          </div>

          {/* Teclado Numérico Ergonómico */}
          <div className="keypad-grid" role="group" aria-label="Teclado numérico">
            {TECLAS_KEYPAD.map((k) => (
              <button
                key={k.num}
                type="button"
                className="keypad-btn"
                onClick={() => agregarNumero(k.num)}
                disabled={cargando}
              >
                <span className="keypad-btn__num">{k.num}</span>
                {k.sub.trim() && <span className="keypad-btn__sub">{k.sub}</span>}
              </button>
            ))}

            <button
              type="button"
              className="keypad-btn keypad-btn--action"
              onClick={limpiarPin}
              disabled={cargando || pin.length === 0}
              title="Borrar todo"
            >
              <span className="keypad-btn__action-text">C</span>
            </button>

            <button
              type="button"
              className="keypad-btn"
              onClick={() => agregarNumero('0')}
              disabled={cargando}
            >
              <span className="keypad-btn__num">0</span>
              <span className="keypad-btn__sub">+</span>
            </button>

            <button
              type="button"
              className="keypad-btn keypad-btn--action keypad-btn--delete"
              onClick={borrarNumero}
              disabled={cargando || pin.length === 0}
              title="Borrar dígito"
            >
              <Delete size={22} strokeWidth={2} />
            </button>
          </div>

          {/* Estado / Mensaje de Seguridad */}
          <div className="card-status-bar">
            {cargando ? (
              <div className="card-status-bar__loading">
                <RefreshCw size={14} className="spin-icon" />
                <span>Verificando credenciales de acceso...</span>
              </div>
            ) : (
              <div className="card-status-bar__ready">
                <ShieldCheck size={14} />
                <span>Teclado listo • Terminal autorizada</span>
              </div>
            )}
          </div>

          {/* Acceso Rápido a Pantallas KDS (Cocina y Bar) */}
          {onVerKDS && (
            <div className="kds-quick-access">
              <div className="kds-quick-access__label">
                <span>Acceso Rápido Comanderas (KDS)</span>
              </div>
              <div className="kds-quick-access__grid">
                <button
                  type="button"
                  className="kds-btn kds-btn--kitchen"
                  onClick={() => onVerKDS('Cocina')}
                >
                  <ChefHat size={18} />
                  <span>KDS Cocina</span>
                </button>

                <button
                  type="button"
                  className="kds-btn kds-btn--bar"
                  onClick={() => onVerKDS('Bar')}
                >
                  <Wine size={18} />
                  <span>KDS Bar</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Footer Minimalista */}
      <footer className="modern-login__footer">
        <span>ChloeRestaurant POS Multiempresa &copy; {new Date().getFullYear()}</span>
        <span className="footer-sep">•</span>
        <span className="footer-secured">
          <CheckCircle2 size={12} />
          Protegido con Cifrado Integral
        </span>
      </footer>
    </main>
  );
}

export default LoginScreen;