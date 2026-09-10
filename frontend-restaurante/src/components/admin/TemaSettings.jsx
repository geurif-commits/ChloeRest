import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion } from '../../personalizacion.js';
import { obtenerSesion } from '../../api.js';
import { toastAviso } from '../Toast.jsx';
import { Palette, Save, RefreshCw, Layers, Smartphone, KeyRound } from 'lucide-react';
import { LOGIN_TEMAS } from '../../themes/loginThemes.js';
import './admin.css';

const TEMAS = [
  { id: 'claro-luxury-gold', name: 'Claro Luxury Gold', color: '#F5B83D', accent: '#17120A', desc: 'Superficies marfil, contraste limpio y dorado premium para una operación luminosa.', dark: false },
  { id: 'negro-brillante', name: 'Negro Brillante', color: '#F5B83D', accent: '#07090F', desc: 'Negro profundo, paneles grafito y acentos dorados para una experiencia ejecutiva.', dark: true },
];

const TAMANOS_MARCA = [
  { id: 'mediano', name: 'Mediano', desc: 'Logo 110px · Nombre mediano' },
  { id: 'grande', name: 'Grande (Recomendado)', desc: 'Logo 170px · Nombre grande' },
  { id: 'gigante', name: 'Gigante', desc: 'Logo 230px · Nombre extra grande' },
];

const LANDING_THEMES = [
  { id: 'obsidiana-gold', name: 'Obsidiana Gold', desc: 'Oscuro, dorado y tecnológico.', color: '#D6A44D' },
  { id: 'marfil-editorial', name: 'Marfil Editorial', desc: 'Claro, elegante y gastronómico.', color: '#F0D39A' },
  { id: 'noir-executive', name: 'Noir Executive', desc: 'Negro premium con cobre profundo.', color: '#B9783D' },
];

export default function TemaSettings({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    tema_activo: localStorage.getItem('POS_THEME') || 'claro-luxury-gold',
    login_theme: 'olive_garden',
    login_marca_tamano: 'grande',
    color_primario: '#F5B83D',
    color_secundario: '#D69E2E',
    nombre_negocio: '',
    slogan: ''
    ,landing_theme: localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold'
  });
  const configRef = useRef(config);
  const debounceRef = useRef(null);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${urlBase}/api/configuracion/sistema`);
        if (res.ok) {
          const data = await res.json();
          const nueva = {
            tema_activo: data.tema_activo || localStorage.getItem('POS_THEME') || 'claro-luxury-gold',
            login_theme: data.login_theme || 'olive_garden',
            login_marca_tamano: data.login_marca_tamano || 'grande',
            color_primario: data.color_primario || '#F5B83D',
            color_secundario: data.color_secundario || '#D69E2E',
            nombre_negocio: data.nombre_negocio || '',
            slogan: data.slogan || ''
            ,landing_theme: data.landing_theme || localStorage.getItem('POS_LANDING_THEME') || 'obsidiana-gold'
          };
          setConfig(nueva);
          configRef.current = nueva;
          aplicarPersonalizacion(nueva);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const cambiar = (campo, valor) => {
    const nueva = { ...configRef.current, [campo]: valor };
    configRef.current = nueva;
    setConfig(nueva);
    if (campo === 'landing_theme') {
      localStorage.setItem('POS_LANDING_THEME', valor);
      window.dispatchEvent(new CustomEvent('landing-theme-updated', { detail: valor }));
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => aplicarPersonalizacion(configRef.current), 200);
  };

  const seleccionarTema = (id) => {
    const tema = TEMAS.find((t) => t.id === id);
    cambiar('tema_activo', id);
    if (tema) {
      cambiar('color_primario', tema.color);
      cambiar('color_secundario', '');
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('tema_activo', config.tema_activo);
      fd.append('login_theme', config.login_theme || 'olive_garden');
      fd.append('login_marca_tamano', config.login_marca_tamano || 'grande');
      fd.append('color_primario', config.color_primario);
      fd.append('color_secundario', config.color_secundario);
      fd.append('nombre_negocio', config.nombre_negocio);
      fd.append('slogan', config.slogan);

      const res = await fetch(`${urlBase}/api/configuracion/sistema`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: fd
      });
      if (res.ok) {
        toastAviso('✅ Tema y skin del sistema guardados y aplicados correctamente.');
        try {
          const res2 = await fetch(`${urlBase}/api/configuracion/sistema`);
          if (res2.ok) {
            window.dispatchEvent(new CustomEvent('configuracion-sistema-actualizada', { detail: await res2.json() }));
          }
        } catch {}
      } else {
        const d = await res.json();
        toastAviso(`❌ ${d.error || 'Error al guardar el tema.'}`);
      }
    } catch {
      toastAviso('⚠️ Error de conexión.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
        <p>Cargando paletas de temas...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      
      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Selector de Temas Visuales Generales */}
        <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--kpi-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Palette size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Tema Universal Claro del Sistema
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                Tema claro moderno y único para todas las pantallas del POS, Mesas, KDS y Administración.
              </p>
            </div>
          </div>

          <div className="temas-horizontal-scroll" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px'
          }}>
            {TEMAS.map((tema) => {
              const esActivo = config.tema_activo === tema.id;
              return (
                <div
                  key={tema.id}
                  onClick={() => seleccionarTema(tema.id)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '14px',
                    borderRadius: '12px',
                    background: esActivo ? 'rgba(245, 184, 61, 0.12)' : 'var(--bg-card-hover)',
                    border: `1.5px solid ${esActivo ? 'var(--kpi-gold)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: esActivo ? '0 0 16px rgba(245, 184, 61, 0.2)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '18px', height: '18px', borderRadius: '5px', background: tema.color, display: 'inline-block', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
                      <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: tema.accent, display: 'inline-block', opacity: 0.8 }} />
                    </div>
                    {esActivo && (
                      <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--gold, #f5b842)', color: '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 900 }}>
                        ✓
                      </span>
                    )}
                  </div>

                  <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '3px' }}>{tema.name}</strong>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--admin-text-muted)', lineHeight: 1.35 }}>{tema.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SECCIÓN NUEVA: Skins de Pantalla de Login PIN ── */}
        <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--kpi-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Skin y Estilo del Panel Login PIN
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                Personaliza la apariencia, texturas, brillo y teclado de acceso PIN para tus cajeros y camareros.
              </p>
            </div>
          </div>

          <div className="temas-horizontal-scroll" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px'
          }}>
            {LOGIN_TEMAS.map((t) => {
              const esActivo = (config.login_theme || 'olive_garden') === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => cambiar('login_theme', t.id)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '14px',
                    borderRadius: '12px',
                    background: esActivo ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-card-hover)',
                    border: `1.5px solid ${esActivo ? '#38bdf8' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: esActivo ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
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
                    {esActivo ? (
                      <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#38bdf8', color: '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 900 }}>
                        ✓
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                        {t.badge}
                      </span>
                    )}
                  </div>

                  <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '3px' }}>{t.nombre}</strong>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--admin-text-muted)', lineHeight: 1.35 }}>{t.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tamaño de Logo y Nombre en el Login ── */}
        <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--kpi-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Tamaño de Logo y Nombre en el Login
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                Controla qué tan grande se ven el logotipo y el nombre del negocio en la pantalla de acceso PIN.
              </p>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px'
          }}>
            {TAMANOS_MARCA.map((tm) => {
              const esActivo = (config.login_marca_tamano || 'grande') === tm.id;
              return (
                <div
                  key={tm.id}
                  onClick={() => cambiar('login_marca_tamano', tm.id)}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: esActivo ? 'rgba(245, 184, 61, 0.12)' : 'var(--bg-card-hover)',
                    border: `1.5px solid ${esActivo ? 'var(--kpi-gold)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'center'
                  }}
                >
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    {esActivo ? '✓ ' : ''}{tm.name}
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>{tm.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ajuste Fino de Colores Primario y Secundario */}
        <div className="admin-card landing-theme-settings" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Diseño de Landing Screen</h3>
            <p style={{ margin: '5px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.78rem' }}>Selecciona la primera impresión comercial del sistema.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            {LANDING_THEMES.map((skin) => {
              const activo = config.landing_theme === skin.id;
              return <button type="button" key={skin.id} onClick={() => cambiar('landing_theme', skin.id)} style={{ textAlign: 'left', padding: '14px', borderRadius: '12px', border: `1px solid ${activo ? skin.color : 'var(--border-subtle)'}`, background: activo ? `${skin.color}20` : 'var(--bg-card-hover)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <span style={{ display: 'block', width: '28px', height: '8px', borderRadius: '8px', background: skin.color, marginBottom: '10px' }} />
                <strong>{activo ? '✓ ' : ''}{skin.name}</strong>
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>{skin.desc}</small>
              </button>;
            })}
          </div>
        </div>

        {/* Ajuste Fino de Colores Primario y Secundario */}
        <div className="admin-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--kpi-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Colores de Acento Personalizados
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                Personaliza los tonos exactos de botones principales y destacados.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            <div className="admin-form-group">
              <label className="admin-label">Color de Acento Principal</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(config.color_primario) ? config.color_primario : '#00f576'}
                  onChange={(e) => cambiar('color_primario', e.target.value)}
                  style={{ width: '40px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={config.color_primario}
                  onChange={(e) => cambiar('color_primario', e.target.value)}
                  placeholder="#00f576"
                  className="admin-input"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Color Secundario / Hover</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(config.color_secundario) ? config.color_secundario : '#00b852'}
                  onChange={(e) => cambiar('color_secundario', e.target.value)}
                  style={{ width: '40px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={config.color_secundario}
                  onChange={(e) => cambiar('color_secundario', e.target.value)}
                  placeholder="#00b852"
                  className="admin-input"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={guardando}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', maxWidth: '300px', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800 }}
            >
              <Save size={16} />
              {guardando ? 'Guardando tema...' : 'Guardar y Aplicar Tema'}
            </button>
          </div>
        </div>

      </form>

    </div>
  );
}
