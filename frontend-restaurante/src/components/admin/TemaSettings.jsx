import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion, aplicarTemaId, fijarTemaSistema } from '../../personalizacion.js';
import { LOGIN_TEMAS } from '../../themes/loginThemes.js';
import { obtenerSesion } from '../../api.js';
import { toastAviso } from '../Toast.jsx';
import { Palette, Save, RefreshCw, KeyRound, Check, LayoutTemplate } from 'lucide-react';
import './admin.css';

const TEMAS = [
  { id: 'claro-luxury-gold', name: 'Claro Verde', colores: ['#eef1ec', '#ffffff', '#1f6b45'], desc: 'Superficies blancas, contraste limpio y verde Chloe. La opción luminosa por defecto.' },
  { id: 'negro-brillante', name: 'Oscuro Verde', colores: ['#0e1411', '#16201a', '#46c283'], desc: 'Fondo verde carbón y acentos esmeralda, cómodo para turnos de noche.' },
  { id: 'marfil-dorado', name: 'Marfil Dorado', colores: ['#f2ede3', '#fffdf9', '#a9761b'], desc: 'Marfil cálido con acentos dorados para un ambiente elegante.' },
];

const LANDING_THEMES = [
  { id: 'obsidiana-gold', name: 'Obsidiana Esmeralda', desc: 'Oscuro, esmeralda y tecnológico.', color: '#46C283' },
  { id: 'marfil-editorial', name: 'Blanco Editorial', desc: 'Claro, elegante y gastronómico.', color: '#9BE8BF' },
  { id: 'noir-executive', name: 'Noir Executive', desc: 'Negro premium con verde profundo.', color: '#1F6B45' },
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

function Opcion({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px', textAlign: 'left', cursor: 'pointer',
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

export default function TemaSettings({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    tema_activo: 'claro-luxury-gold',
    login_theme: 'esmeralda',
    nombre_negocio: '',
    slogan: '',
    landing_theme: localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold',
  });
  const servidorRef = useRef(null); // última configuración guardada en el servidor
  const guardadoRef = useRef(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${urlBase}/api/configuracion/sistema`);
        if (res.ok) {
          const data = await res.json();
          servidorRef.current = data;
          // Solo se rellena el formulario: entrar aquí no cambia el modo (claro/oscuro) que esté usando el terminal.
          setConfig({
            tema_activo: data.tema_activo || 'claro-luxury-gold',
            login_theme: LOGIN_TEMAS.some((t) => t.id === data.login_theme) ? data.login_theme : 'esmeralda',
            nombre_negocio: data.nombre_negocio || '',
            slogan: data.slogan || '',
            landing_theme: data.landing_theme || localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold',
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCargando(false);
      }
    })();
    // Si se sale sin guardar, se restaura lo que tiene guardado el sistema.
    return () => {
      if (!guardadoRef.current && servidorRef.current) aplicarPersonalizacion(servidorRef.current);
    };
  }, []);

  const cambiar = (campo, valor) => {
    guardadoRef.current = false;
    setConfig((c) => ({ ...c, [campo]: valor }));
    if (campo === 'tema_activo') aplicarTemaId(valor); // vista previa inmediata
    if (campo === 'login_theme') document.documentElement.setAttribute('data-login-skin', valor);
    if (campo === 'landing_theme') {
      localStorage.setItem('POS_LANDING_THEME', valor);
      window.dispatchEvent(new CustomEvent('landing-theme-updated', { detail: valor }));
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('tema_activo', config.tema_activo);
      fd.append('login_theme', config.login_theme);
      fd.append('nombre_negocio', config.nombre_negocio);
      fd.append('slogan', config.slogan);

      const res = await fetch(`${urlBase}/api/configuracion/sistema`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: fd,
      });
      if (res.ok) {
        fijarTemaSistema(config.tema_activo);
        guardadoRef.current = true;
        toastAviso('Tema y estilo de acceso guardados correctamente.');
        try {
          const res2 = await fetch(`${urlBase}/api/configuracion/sistema`);
          if (res2.ok) {
            const nueva = await res2.json();
            servidorRef.current = nueva;
            window.dispatchEvent(new CustomEvent('configuracion-sistema-actualizada', { detail: nueva }));
          }
        } catch { /* la configuración se recargará en la próxima visita */ }
      } else {
        const d = await res.json();
        toastAviso(d.error || 'Error al guardar el tema.');
      }
    } catch {
      toastAviso('Error de conexión.');
    } finally {
      setGuardando(false);
    }
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
      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div className="admin-card" style={cardStyle}>
          {cabeza(Palette, 'Tema del sistema', 'Se aplica a todas las pantallas: mesas, comandero, caja, cocina y administración. Cada terminal puede alternar claro/oscuro desde su pantalla de acceso.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            {TEMAS.map((t) => (
              <Opcion key={t.id} activo={config.tema_activo === t.id} onClick={() => cambiar('tema_activo', t.id)}>
                <span style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                  {t.colores.map((c, i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 7, background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.14)' }} />)}
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
              <Opcion key={t.id} activo={config.login_theme === t.id} onClick={() => cambiar('login_theme', t.id)}>
                <span style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                  {t.paleta.map((c, i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 7, background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.14)' }} />)}
                </span>
                <strong style={{ fontSize: '0.92rem' }}>{t.nombre}</strong>
                <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>{t.desc}</span>
              </Opcion>
            ))}
          </div>
        </div>

        <div className="admin-card landing-theme-settings" style={cardStyle}>
          {cabeza(LayoutTemplate, 'Diseño de la página de inicio', 'Selecciona la primera impresión comercial del sistema.')}
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

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={guardando}
            className="admin-btn admin-btn-primary"
            style={{ width: '100%', maxWidth: '300px', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800 }}
          >
            <Save size={16} />
            {guardando ? 'Guardando...' : 'Guardar y aplicar'}
          </button>
        </div>
      </form>
    </div>
  );
}
