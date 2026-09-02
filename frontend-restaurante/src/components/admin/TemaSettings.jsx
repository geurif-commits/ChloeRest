import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion } from '../../personalizacion.js';
import { obtenerSesion } from '../../api.js';
import { toastAviso } from '../Toast.jsx';
import { Palette, Check, Sparkles, Sun, Moon, Save, RefreshCw, Layers, Smartphone, KeyRound } from 'lucide-react';
import { LOGIN_TEMAS } from '../../themes/loginThemes.js';
import './admin.css';

const TEMAS = [
  { id: 'noche', name: 'Noche Luxury (Predeterminado)', color: '#00f576', accent: '#f5b842', desc: 'Fondo oscuro profundo con acentos dorados y verdes esmeralda.', dark: true },
  { id: 'oceano', name: 'Océano Profundo', color: '#00b4d8', accent: '#38bdf8', desc: 'Oscuro con reflejos azul marino y cian de alto contraste.', dark: true },
  { id: 'lava', name: 'Lava Grill', color: '#ff6b35', accent: '#fb923c', desc: 'Oscuro con tonalidades ámbar, rojizas y fuego para asadores.', dark: true },
  { id: 'esmeralda', name: 'Esmeralda Jardín', color: '#2dc653', accent: '#4ade80', desc: 'Oscuro con acentos verdes orgánicos para cafeterías y bistrós.', dark: true },
  { id: 'amatista', name: 'Amatista Lounge', color: '#a855f7', accent: '#c084fc', desc: 'Ambiente nocturno con tonos púrpuras y violetas elegantes.', dark: true },
  { id: 'claro', name: 'Luz Diurna (Claro)', color: '#1a73e8', accent: '#2563eb', desc: 'Fondo blanco de alta luminosidad para ambientes exteriores o terrazas.', dark: false },
];

export default function TemaSettings({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    tema_activo: 'noche',
    login_theme: 'chef_noir',
    color_primario: '#00f576',
    color_secundario: '#00b852',
    nombre_negocio: '',
    slogan: ''
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
            tema_activo: data.tema_activo || 'noche',
            login_theme: data.login_theme || 'chef_noir',
            color_primario: data.color_primario || '#00f576',
            color_secundario: data.color_secundario || '#00b852',
            nombre_negocio: data.nombre_negocio || '',
            slogan: data.slogan || ''
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
      fd.append('login_theme', config.login_theme || 'chef_noir');
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
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Palette size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                Tema y Paleta Visual General del Sistema
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                Selecciona la ambientación visual para todas las pantallas del POS, Mesas, KDS y Administración.
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
                    background: esActivo ? 'rgba(245, 184, 61, 0.12)' : 'rgba(255, 255, 255, 0.025)',
                    border: `1.5px solid ${esActivo ? 'var(--gold, #f5b842)' : 'var(--border-subtle)'}`,
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

                  <strong style={{ fontSize: '0.88rem', color: '#fff', marginBottom: '3px' }}>{tema.name}</strong>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--admin-text-muted)', lineHeight: 1.35 }}>{tema.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SECCIÓN NUEVA: Skins de Pantalla de Login PIN ── */}
        <div className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
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
              const esActivo = (config.login_theme || 'chef_noir') === t.id;
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
                    background: esActivo ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.025)',
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

                  <strong style={{ fontSize: '0.88rem', color: '#fff', marginBottom: '3px' }}>{t.nombre}</strong>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--admin-text-muted)', lineHeight: 1.35 }}>{t.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ajuste Fino de Colores Primario y Secundario */}
        <div className="admin-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
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