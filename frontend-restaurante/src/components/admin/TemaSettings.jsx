import { useEffect, useRef, useState } from 'react';
import { fijarTemaSistema, normalizarTema } from '../../personalizacion.js';
import { LOGIN_TEMAS } from '../../themes/loginThemes.js';
import { obtenerSesion } from '../../api.js';
import { toastAviso, toastError } from '../Toast.jsx';
import { Palette, RefreshCw, KeyRound, Check, LayoutTemplate } from 'lucide-react';
import './admin.css';

const TEMAS = [
  { id: 'marfil-dorado', name: 'Marfil Dorado', colores: ['#f2ede3', '#fffdf9', '#a9761b'], desc: 'Claro y cálido: marfil con acentos dorados. Ideal para salones luminosos.' },
  { id: 'negro-brillante', name: 'Oscuro Zafiro', colores: ['#081022', '#0f1a36', '#5e94ff'], desc: 'Azul zafiro profundo con acentos brillantes, elegante para turnos de noche.' },
  { id: 'esmeralda-oscuro', name: 'Oscuro Esmeralda', colores: ['#0e1411', '#16201a', '#46c283'], desc: 'Verde carbón con acentos esmeralda, sobrio y fresco.' },
];

const LANDING_THEMES = [
  { id: 'obsidiana-gold', name: 'Obsidiana Zafiro', desc: 'Oscuro, azul y tecnológico.', color: '#5E94FF' },
  { id: 'marfil-editorial', name: 'Marfil Editorial', desc: 'Claro, elegante y gastronómico.', color: '#A9761B' },
  { id: 'noir-executive', name: 'Bosque Esmeralda', desc: 'Oscuro con verde esmeralda.', color: '#46C283' },
];

const cardStyle = { padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' };
const cabeza = (Icono, titulo, sub) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <Icono size={20} />
    </div>
    <div>
      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{titulo}</h3>
      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>{sub}</p>
    </div>
  </div>
);

function Opcion({ activo, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px', textAlign: 'left', cursor: disabled ? 'progress' : 'pointer',
        borderRadius: '14px', color: 'var(--text-primary)', font: 'inherit',
        background: activo ? 'var(--gold-soft)' : 'var(--bg-card-hover)',
        border: `1.5px solid ${activo ? 'var(--gold)' : 'var(--border-subtle)'}`,
        transition: 'border-color .15s, background .15s',
      }}
    >
      {activo && (
        <span style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: '50%', background: 'var(--gold)', color: 'var(--text-on-accent)', display: 'grid', placeItems: 'center' }}>
          <Check size={13} strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

/**
 * Cada opción se aplica y se guarda al instante: el tema elegido queda como tema del sistema
 * y no se revierte al cambiar de sección del panel.
 */
export default function TemaSettings({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    tema_activo: 'marfil-dorado',
    login_theme: 'sistema',
    nombre_negocio: '',
    slogan: '',
    landing_theme: localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold',
  });
  const configRef = useRef(config);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await fetch(`${urlBase}/api/configuracion/sistema`);
        if (res.ok && activo) {
          const data = await res.json();
          const nueva = {
            tema_activo: normalizarTema(data.tema_activo),
            login_theme: LOGIN_TEMAS.some((t) => t.id === data.login_theme) ? data.login_theme : 'sistema',
            nombre_negocio: data.nombre_negocio || '',
            slogan: data.slogan || '',
            landing_theme: data.landing_theme || localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold',
          };
          configRef.current = nueva;
          setConfig(nueva);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [urlBase]);

  const guardar = async (nueva) => {
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('tema_activo', nueva.tema_activo);
      fd.append('login_theme', nueva.login_theme);
      fd.append('nombre_negocio', nueva.nombre_negocio);
      fd.append('slogan', nueva.slogan);
      const res = await fetch(`${urlBase}/api/configuracion/sistema`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${obtenerSesion()}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'No se pudo guardar el tema.');
      }
      try {
        const res2 = await fetch(`${urlBase}/api/configuracion/sistema`);
        if (res2.ok) window.dispatchEvent(new CustomEvent('configuracion-sistema-actualizada', { detail: await res2.json() }));
      } catch { /* la configuración se recargará en la próxima visita */ }
      toastAviso('Cambios guardados y aplicados.');
    } catch (e) {
      toastError(e.message || 'Error de conexión.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (campo, valor) => {
    const nueva = { ...configRef.current, [campo]: valor };
    configRef.current = nueva;
    setConfig(nueva);
    if (campo === 'tema_activo') fijarTemaSistema(valor);
    if (campo === 'login_theme') document.documentElement.setAttribute('data-login-skin', valor);
    if (campo === 'landing_theme') {
      localStorage.setItem('POS_LANDING_THEME', valor);
      window.dispatchEvent(new CustomEvent('landing-theme-updated', { detail: valor }));
      return; // el diseño de la landing es una preferencia del terminal, no se envía al servidor
    }
    guardar(nueva);
  };

  if (cargando) {
    return (
      <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
        <p>Cargando temas...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      <div className="admin-card" style={cardStyle}>
        {cabeza(Palette, 'Tema del sistema', 'Se aplica a todas las pantallas: mesas, comandero, caja, cocina y administración. Cada terminal puede alternar claro/oscuro desde su pantalla de acceso.')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          {TEMAS.map((t) => (
            <Opcion key={t.id} activo={config.tema_activo === t.id} disabled={guardando} onClick={() => cambiar('tema_activo', t.id)}>
              <span style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                {t.colores.map((c, i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 7, background: c, boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.35)' }} />)}
              </span>
              <strong style={{ fontSize: '0.92rem' }}>{t.name}</strong>
              <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>{t.desc}</span>
            </Opcion>
          ))}
        </div>
      </div>

      <div className="admin-card" style={cardStyle}>
        {cabeza(KeyRound, 'Pantalla de acceso y PinPad', 'Estilo del login, del teclado PIN y de las pantallas de bloqueo. El logotipo y el fondo se configuran en «Logotipo y Fondo».')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          {LOGIN_TEMAS.map((t) => (
            <Opcion key={t.id} activo={config.login_theme === t.id} disabled={guardando} onClick={() => cambiar('login_theme', t.id)}>
              <span style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                {t.paleta.map((c, i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 7, background: c, boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.35)' }} />)}
              </span>
              <strong style={{ fontSize: '0.92rem' }}>{t.nombre}</strong>
              <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>{t.desc}</span>
            </Opcion>
          ))}
        </div>
      </div>

      <div className="admin-card landing-theme-settings" style={cardStyle}>
        {cabeza(LayoutTemplate, 'Diseño de la página de inicio', 'Primera impresión comercial del sistema en este terminal.')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          {LANDING_THEMES.map((sk) => (
            <Opcion key={sk.id} activo={config.landing_theme === sk.id} onClick={() => cambiar('landing_theme', sk.id)}>
              <span style={{ display: 'block', width: 28, height: 8, borderRadius: 8, background: sk.color, marginBottom: 8 }} />
              <strong style={{ fontSize: '0.92rem' }}>{sk.name}</strong>
              <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>{sk.desc}</span>
            </Opcion>
          ))}
        </div>
      </div>
    </div>
  );
}
