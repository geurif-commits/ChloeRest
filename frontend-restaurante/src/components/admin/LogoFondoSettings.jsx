import { useEffect, useRef, useState } from 'react';
import { fondoLogin } from '../../personalizacion.js';
import { obtenerSesion } from '../../api.js';
import { toastAviso } from '../Toast.jsx';
import {
  Image as ImageIcon, Upload, Trash2, Save, Store,
  Eye, RefreshCw, Sliders, Smartphone, Palette
} from 'lucide-react';
import { LOGIN_TEMAS } from '../../themes/loginThemes.js';
import './admin.css';

export default function LogoFondoSettings({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modoMovilTab, setModoMovilTab] = useState('config'); // 'config' | 'preview'
  const [config, setConfig] = useState({
    nombre_negocio: '',
    slogan: '',
    logo_url: '',
    fondo_login_url: '',
    login_theme: 'chef_noir',
    opacidad_fondo: 1,
  });
  const [fondoArchivo, setFondoArchivo] = useState(null);
  const [logoArchivo, setLogoArchivo] = useState(null);
  const fondoRef = useRef(null);
  const logoRef = useRef(null);
  const configRef = useRef(config);

  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${urlBase}/api/configuracion/sistema`);
        if (res.ok) {
          const data = await res.json();
          const nueva = {
            nombre_negocio: data.nombre_negocio || '',
            slogan: data.slogan || '',
            logo_url: data.logo_url || '',
            fondo_login_url: data.fondo_login_url || '',
            login_theme: data.login_theme || 'chef_noir',
            opacidad_fondo: Number(data.opacidad_fondo || 1),
          };
          setConfig(nueva);
          configRef.current = nueva;
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
  };

  const guardar = async (e) => {
    if (e) e.preventDefault();
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('nombre_negocio', config.nombre_negocio);
      fd.append('slogan', config.slogan);
      fd.append('login_theme', config.login_theme || 'chef_noir');
      fd.append('opacidad_fondo', config.opacidad_fondo);
      if (fondoArchivo) fd.append('fondo_archivo', fondoArchivo);
      else if (config.quitarFondo) fd.append('quitar_fondo', '1');
      if (logoArchivo) fd.append('logo_archivo', logoArchivo);
      else if (config.quitarLogo) fd.append('quitar_logo', '1');
      
      const res = await fetch(`${urlBase}/api/configuracion/sistema`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: fd
      });
      if (res.ok) {
        toastAviso('✅ Logotipo, fondo y skin guardados correctamente.');
        try {
          const res2 = await fetch(`${urlBase}/api/configuracion/sistema`);
          if (res2.ok) {
            window.dispatchEvent(new CustomEvent('configuracion-sistema-actualizada', { detail: await res2.json() }));
          }
        } catch {}
      } else {
        const d = await res.json();
        toastAviso(`❌ ${d.error || 'Error al guardar.'}`);
      }
    } catch {
      toastAviso('⚠️ Error de conexión.');
    } finally {
      setGuardando(false);
    }
  };

  const fondoVista = fondoArchivo ? URL.createObjectURL(fondoArchivo) : (config.quitarFondo ? '' : fondoLogin(config));
  const logoVista = logoArchivo ? URL.createObjectURL(logoArchivo) : (config.quitarLogo ? '' : config.logo_url);
  const opacidad = Math.max(0.2, Math.min(1, Number(config.opacidad_fondo || 1)));

  if (cargando) {
    return (
      <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
        <p>Cargando personalización visual...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      
      {/* ── Switcher de pestañas en Móvil (Configuración vs Vista Previa) ── */}
      <div className="logo-fondo-tabs-mobile" style={{
        display: 'flex',
        gap: '8px',
        background: 'rgba(255, 255, 255, 0.03)',
        padding: '4px',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)'
      }}>
        <button
          type="button"
          onClick={() => setModoMovilTab('config')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: modoMovilTab === 'config' ? 'var(--gold, #f5b842)' : 'transparent',
            color: modoMovilTab === 'config' ? '#0b0f19' : '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <Sliders size={16} /> Configuración & Archivos
        </button>

        <button
          type="button"
          onClick={() => setModoMovilTab('preview')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: modoMovilTab === 'preview' ? 'var(--gold, #f5b842)' : 'transparent',
            color: modoMovilTab === 'preview' ? '#0b0f19' : '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <Eye size={16} /> Vista Previa PIN
        </button>
      </div>

      {/* ── Contenedor Adaptativo Principal ── */}
      <div className="logo-fondo-main-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.8fr)',
        gap: '18px',
        alignItems: 'start'
      }}>
        
        {/* COLUMNA 1: FORMULARIO Y CONFIGURACIÓN */}
        <form
          onSubmit={guardar}
          className={`logo-fondo-form-panel ${modoMovilTab === 'config' ? 'is-visible-mobile' : 'is-hidden-mobile'}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          
          {/* Card 1: Logotipo */}
          <div className="admin-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Store size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Logotipo Principal</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                  Cabecera, pantallas de PIN e impresiones térmicas.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '10px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                {logoVista ? (
                  <img src={logoVista} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Store size={26} style={{ color: '#0f172a' }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '160px' }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  ref={logoRef}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      setLogoArchivo(e.target.files[0]);
                      setConfig((c) => ({ ...c, quitarLogo: false }));
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => logoRef.current?.click()}
                    className="admin-btn admin-btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Upload size={13} /> Subir Logo
                  </button>
                  {(config.logo_url || logoArchivo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoArchivo(null);
                        if (logoRef.current) logoRef.current.value = '';
                        setConfig((c) => ({ ...c, quitarLogo: !!(c.logo_url && !c.quitarLogo) }));
                      }}
                      className="admin-btn admin-btn-danger"
                      style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                    >
                      <Trash2 size={13} /> Quitar
                    </button>
                  )}
                </div>
                <small style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>PNG transparente recomendado</small>
              </div>
            </div>
          </div>

          {/* Card 2: Fondo de Pantalla y Textos */}
          <div className="admin-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ImageIcon size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Fondo de Pantalla de Acceso (PIN)</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                  Personaliza la imagen y nivel de opacidad del login.
                </p>
              </div>
            </div>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              ref={fondoRef}
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files[0]) {
                  setFondoArchivo(e.target.files[0]);
                  setConfig((c) => ({ ...c, quitarFondo: false }));
                }
              }}
            />

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fondoRef.current?.click()}
                className="admin-btn admin-btn-secondary"
                style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Upload size={14} /> Seleccionar Imagen de Fondo
              </button>
              {(config.fondo_login_url || fondoArchivo) && (
                <button
                  type="button"
                  onClick={() => {
                    setFondoArchivo(null);
                    if (fondoRef.current) fondoRef.current.value = '';
                    setConfig((c) => ({ ...c, quitarFondo: !!(c.fondo_login_url && !c.quitarFondo) }));
                  }}
                  className="admin-btn admin-btn-danger"
                  style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                >
                  <Trash2 size={14} /> Quitar Fondo
                </button>
              )}
            </div>

            {/* Slider de Opacidad */}
            <div className="admin-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="admin-label" style={{ margin: 0 }}>Opacidad de Imagen de Fondo</label>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold, #f5b842)', background: 'rgba(245, 184, 61, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                  {Math.round(opacidad * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={opacidad}
                onChange={(e) => cambiar('opacidad_fondo', Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--gold, #f5b842)' }}
              />
            </div>

            {/* Nombre y Slogan */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Nombre del Negocio</label>
                <input
                  type="text"
                  value={config.nombre_negocio}
                  onChange={(e) => cambiar('nombre_negocio', e.target.value)}
                  placeholder="Ej: Chloe Restaurant"
                  className="admin-input"
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Slogan / Bienvenida</label>
                <input
                  type="text"
                  value={config.slogan}
                  onChange={(e) => cambiar('slogan', e.target.value)}
                  placeholder="Ej: Cocina Gourmet"
                  className="admin-input"
                />
              </div>
            </div>

            {/* Botón Guardar */}
            <button
              type="submit"
              disabled={guardando}
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800 }}
            >
              <Save size={16} />
              {guardando ? 'Guardando...' : 'Guardar Logotipo y Fondo'}
            </button>
          </div>

        </form>

        {/* COLUMNA 2: VISTA PREVIA EN VIVO */}
        <div
          className={`logo-fondo-preview-panel ${modoMovilTab === 'preview' ? 'is-visible-mobile' : 'is-hidden-mobile'}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {(() => {
            const skinActivo = LOGIN_TEMAS.find((t) => t.id === (config.login_theme || 'chef_noir')) || LOGIN_TEMAS[0];
            const colorAcento = skinActivo.paleta[2] || 'var(--gold, #f5b842)';
            const colorSecundario = skinActivo.paleta[3] || 'var(--gold, #f5b842)';
            const esClaro = skinActivo.categoria === 'Luz';

            return (
              <div className="admin-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Eye size={18} style={{ color: colorAcento }} />
                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#fff' }}>Vista Previa en Vivo</h3>
                  </div>
                  
                  {/* Badge de Skin Aplicado */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${colorAcento}`,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: colorAcento
                  }}>
                    <span>{skinActivo.badge} {skinActivo.nombre}</span>
                  </div>
                </div>

                <div style={{
                  position: 'relative',
                  height: '340px',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  border: `1px solid rgba(255, 255, 255, 0.1)`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  background: skinActivo.paleta[0] || '#07090f'
                }}>
                  {fondoVista && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `url(${fondoVista})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      opacity: opacidad,
                      filter: 'blur(2px)'
                    }} />
                  )}

                  {/* Resplandores ambientales de la skin */}
                  <div style={{
                    position: 'absolute',
                    top: '-20%',
                    left: '-20%',
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    background: colorAcento,
                    filter: 'blur(45px)',
                    opacity: 0.35,
                    pointerEvents: 'none'
                  }} />
                  <div style={{
                    position: 'absolute',
                    bottom: '-20%',
                    right: '-20%',
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    background: colorSecundario,
                    filter: 'blur(45px)',
                    opacity: 0.3,
                    pointerEvents: 'none'
                  }} />

                  <div style={{
                    position: 'relative',
                    zIndex: 2,
                    background: esClaro ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.90)',
                    backdropFilter: 'blur(12px)',
                    border: `1.5px solid ${colorAcento}`,
                    borderRadius: '16px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    maxWidth: '220px',
                    width: '100%',
                    textAlign: 'center',
                    boxShadow: `0 12px 30px rgba(0,0,0,0.6), 0 0 20px ${colorAcento}33`
                  }}>
                    {logoVista ? (
                      <img src={logoVista} alt="Logo Preview" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                    ) : (
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: `${colorAcento}22`,
                        color: colorAcento,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '0.9rem',
                        border: `1px solid ${colorAcento}44`
                      }}>
                        {(config.nombre_negocio || 'CR').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <strong style={{ color: esClaro ? '#1a2e20' : '#fff', fontSize: '0.88rem', lineHeight: 1.2 }}>
                      {config.nombre_negocio || 'Mi Negocio'}
                    </strong>
                    {config.slogan && <span style={{ fontSize: '0.65rem', color: colorAcento }}>{config.slogan}</span>}
                    
                    {/* Visualizador PIN */}
                    <div style={{
                      display: 'flex',
                      gap: '5px',
                      margin: '4px 0',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      background: esClaro ? 'rgba(74, 124, 89, 0.1)' : 'rgba(0,0,0,0.35)',
                      border: `1px solid ${colorAcento}44`
                    }}>
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: i < 3 ? colorAcento : (esClaro ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'),
                            boxShadow: i < 3 ? `0 0 8px ${colorAcento}` : 'none',
                            transform: i < 3 ? 'scale(1.15)' : 'scale(1)',
                            transition: 'all 0.2s ease'
                          }}
                        />
                      ))}
                    </div>

                    {/* Teclado */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', width: '100%' }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <div
                          key={n}
                          style={{
                            padding: '4px 0',
                            background: esClaro ? 'rgba(74, 124, 89, 0.08)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${esClaro ? 'rgba(74, 124, 89, 0.2)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            color: esClaro ? '#1a2e20' : '#fff',
                            fontWeight: 700
                          }}
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>
                  Muestra en tiempo real la combinación exacta de logotipo, nombre, fondo y <strong>skin de login ({skinActivo.nombre})</strong>.
                </p>
              </div>
            );
          })()}
        </div>

      </div>

    </div>
  );
}
