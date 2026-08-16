import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion, fondoLogin } from '../personalizacion.js';
import { toastAviso } from './Toast.jsx';

const TEMAS = [
  { id: 'noche', name: 'Noche', color: '#00f576' },
  { id: 'oceano', name: 'Océano', color: '#00b4d8' },
  { id: 'lava', name: 'Lava', color: '#ff6b35' },
  { id: 'esmeralda', name: 'Esmeralda', color: '#2dc653' },
  { id: 'amatista', name: 'Amatista', color: '#a855f7' },
  { id: 'claro', name: 'Claro', color: '#1a73e8' },
];

const ESTILOS_LOGIN = [
  { id: 'moderno', name: 'Moderno', icon: '✨', desc: 'Dividido: logo/reloj a la izquierda y teclado PIN a la derecha. Sin cuadro.' },
  { id: 'minimal', name: 'Mínimo', icon: '⬛', desc: 'Sin cuadro contenedor. Solo logo, PIN y teclado centrados.' },
  { id: 'clasico', name: 'Clásico', icon: '📦', desc: 'El cuadro tradicional con todo centrado.' },
];

function PersonalizacionSistema({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    nombre_negocio: '',
    slogan: '',
    logo_url: '',
    fondo_login_url: '',
    tema_activo: 'noche',
    estilo_login: 'moderno',
    color_primario: '',
    color_secundario: '',
    opacidad_fondo: 1,
    setup_completado: true,
  });
  const [fondoArchivo, setFondoArchivo] = useState(null);
  const [logoArchivo, setLogoArchivo] = useState(null);
  const fondoRef = useRef(null);
  const logoRef = useRef(null);
  const configRef = useRef(config);
  const aplicarTemaDebounce = useRef(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Limpia el temporizador de aplicación del tema al desmontar
  useEffect(() => () => {
    if (aplicarTemaDebounce.current) clearTimeout(aplicarTemaDebounce.current);
  }, []);

  const cargar = async () => {
    try {
      const res = await fetch(`${urlBase}/api/configuracion/sistema`);
      if (res.ok) {
        const data = await res.json();
        setConfig({
          nombre_negocio: data.nombre_negocio || '',
          slogan: data.slogan || '',
          logo_url: data.logo_url || '',
          fondo_login_url: data.fondo_login_url || '',
          tema_activo: data.tema_activo || 'noche',
          estilo_login: data.estilo_login || 'moderno',
          color_primario: data.color_primario || '',
          color_secundario: data.color_secundario || '',
          opacidad_fondo: Number(data.opacidad_fondo || 1),
          setup_completado: !!data.setup_completado,
        });
        aplicarPersonalizacion(data);
      }
    } catch (e) {
      console.error('Error cargando personalización:', e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const cambiar = (campo, valor) => {
    const nueva = { ...configRef.current, [campo]: valor };
    configRef.current = nueva;
    setConfig(nueva);
    // Aplica el tema en vivo con debounce para no forzar recalculos de estilo
    // en cada movimiento del color picker/slider (evita congelamientos en Electron).
    if (aplicarTemaDebounce.current) clearTimeout(aplicarTemaDebounce.current);
    aplicarTemaDebounce.current = setTimeout(() => aplicarPersonalizacion(configRef.current), 250);
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
      fd.append('nombre_negocio', config.nombre_negocio);
      fd.append('slogan', config.slogan);
      fd.append('tema_activo', config.tema_activo);
      fd.append('estilo_login', config.estilo_login || 'moderno');
      fd.append('color_primario', config.color_primario);
      fd.append('color_secundario', config.color_secundario);
      fd.append('opacidad_fondo', config.opacidad_fondo);
      if (fondoArchivo) fd.append('fondo_archivo', fondoArchivo);
      else if (config.quitarFondo) fd.append('quitar_fondo', '1');
      if (logoArchivo) fd.append('logo_archivo', logoArchivo);
      else if (config.quitarLogo) fd.append('quitar_logo', '1');

      const res = await fetch(`${urlBase}/api/configuracion/sistema`, { method: 'PUT', body: fd });
      const data = await res.json();
      if (res.ok) {
        localStorage.removeItem('pos_theme');
        toastAviso('✅ Personalización guardada. Se aplicará en todas las pantallas.');
        cargar();
      } else {
        toastAviso(`❌ ${data.error || 'Error al guardar la personalización.'}`);
      }
    } catch (err) {
      toastAviso('⚠️ Error de conexión al guardar la personalización.');
    } finally {
      setGuardando(false);
    }
  };

  const fondoVista = fondoArchivo ? URL.createObjectURL(fondoArchivo) : (config.quitarFondo ? '' : fondoLogin(config));
  const logoVista = logoArchivo ? URL.createObjectURL(logoArchivo) : (config.quitarLogo ? '' : config.logo_url);
  const primario = config.color_primario || '#00f576';
  const opacidad = Math.max(0.2, Math.min(1, Number(config.opacidad_fondo || 1)));

  if (cargando) return <div className="admin-workspace"><p style={{ color: '#fff', padding: '20px' }}>Cargando personalización...</p></div>;

  const estiloInput = { width: '100%', padding: '10px', background: 'var(--bg-tertiary, #1a1a24)', color: '#fff', border: '1px solid var(--border-color, #2a2a38)', borderRadius: '10px', fontSize: '0.9rem' };

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* FORMULARIO */}
      <form onSubmit={guardar} style={{ flex: 1, minWidth: '340px', background: 'var(--bg-secondary, #14141b)', border: '1px solid var(--border-color, #2a2a38)', borderRadius: '16px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <h3 style={{ color: 'var(--accent, #00f576)', margin: 0 }}>🎨 Personalización del Sistema</h3>

        <div className="form-group">
          <label>Nombre del Negocio (pantalla de PIN)</label>
          <input type="text" value={config.nombre_negocio} onChange={(e) => cambiar('nombre_negocio', e.target.value)} placeholder="Ej: Restaurante El Sabor" style={estiloInput} />
        </div>

        <div className="form-group">
          <label>Slogan / Frase</label>
          <input type="text" value={config.slogan} onChange={(e) => cambiar('slogan', e.target.value)} placeholder="Ej: Cocina Dominicana de Primera" style={estiloInput} />
        </div>

        <div className="form-group">
          <label>Tema del Sistema</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
            {TEMAS.map((tema) => (
              <button
                type="button"
                key={tema.id}
                title={tema.name}
                onClick={() => seleccionarTema(tema.id)}
                style={{
                  aspectRatio: '1', borderRadius: '50%', border: config.tema_activo === tema.id ? '2px solid #fff' : '2px solid transparent',
                  background: tema.color, cursor: 'pointer', boxShadow: config.tema_activo === tema.id ? `0 0 10px ${tema.color}` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Estilo de la Pantalla de PIN</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {ESTILOS_LOGIN.map((estilo) => (
              <button
                type="button"
                key={estilo.id}
                title={estilo.desc}
                onClick={() => cambiar('estilo_login', estilo.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  padding: '12px 6px', borderRadius: '12px', cursor: 'pointer',
                  background: config.estilo_login === estilo.id ? 'rgba(0,245,118,0.12)' : 'var(--bg-tertiary, #1a1a24)',
                  border: config.estilo_login === estilo.id ? '1px solid var(--accent, #00f576)' : '1px solid var(--border-color, #2a2a38)',
                  color: '#fff', fontSize: '0.78rem', fontWeight: 600,
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>{estilo.icon}</span>
                {estilo.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Color Principal</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(config.color_primario) ? config.color_primario : '#00f576'} onChange={(e) => cambiar('color_primario', e.target.value)} style={{ width: '46px', height: '38px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
              <input type="text" value={config.color_primario} onChange={(e) => cambiar('color_primario', e.target.value)} placeholder="#00f576" style={estiloInput} />
            </div>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Color Secundario</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(config.color_secundario) ? config.color_secundario : '#00b852'} onChange={(e) => cambiar('color_secundario', e.target.value)} style={{ width: '46px', height: '38px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
              <input type="text" value={config.color_secundario} onChange={(e) => cambiar('color_secundario', e.target.value)} placeholder="#00b852" style={estiloInput} />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Opacidad de la Imagen de Fondo ({Math.round(opacidad * 100)}%)</label>
          <input type="range" min="0.2" max="1" step="0.05" value={opacidad} onChange={(e) => cambiar('opacidad_fondo', Number(e.target.value))} style={{ width: '100%', accentColor: primario }} />
        </div>

        <div className="form-group">
          <label>Logo del Negocio</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {logoVista ? (
              <img src={logoVista} alt="Logo" style={{ width: '56px', height: '56px', objectFit: 'contain', background: '#fff', borderRadius: '10px', border: '1px solid var(--border-color)' }} />
            ) : (
              <div style={{ width: '56px', height: '56px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dimmed)' }}>Logo</div>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" ref={logoRef} onChange={(e) => { setLogoArchivo(e.target.files[0]); setConfig((c) => ({ ...c, quitarLogo: false })); }} style={{ flex: 1, color: '#fff', fontSize: '0.8rem' }} />
            {(config.logo_url || logoArchivo) && (
              <button type="button" onClick={() => { setLogoArchivo(null); if (logoRef.current) logoRef.current.value = ''; setConfig((c) => ({ ...c, quitarLogo: !!(c.logo_url && !c.quitarLogo) })); }} style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>Quitar</button>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Imagen de Fondo de la Pantalla de PIN</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" ref={fondoRef} onChange={(e) => { setFondoArchivo(e.target.files[0]); setConfig((c) => ({ ...c, quitarFondo: false })); }} style={{ color: '#fff', fontSize: '0.8rem' }} />
          {(config.fondo_login_url || fondoArchivo) && (
            <button type="button" onClick={() => { setFondoArchivo(null); if (fondoRef.current) fondoRef.current.value = ''; setConfig((c) => ({ ...c, quitarFondo: !!(c.fondo_login_url && !c.quitarFondo) })); }} style={{ marginTop: '8px', background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>Quitar imagen de fondo</button>
          )}
        </div>

        <button type="submit" disabled={guardando} style={{ background: 'linear-gradient(135deg, var(--accent, #00f576), var(--accent-secondary, #00b852))', color: '#000', border: 'none', padding: '13px', borderRadius: '10px', fontWeight: '800', fontSize: '1rem', cursor: guardando ? 'wait' : 'pointer', boxShadow: '0 4px 15px var(--accent-glow, rgba(0,245,118,0.3))' }}>
          {guardando ? 'Guardando...' : '💾 Guardar Personalización'}
        </button>
      </form>

      {/* VISTA PREVIA EN VIVO */}
      <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-secondary, #14141b)', border: '1px solid var(--border-color, #2a2a38)', borderRadius: '16px', padding: '22px' }}>
        <h3 style={{ color: 'var(--accent, #00f576)', margin: '0 0 14px 0' }}>👁️ Vista Previa (Pantalla de PIN)</h3>
        <div style={{ position: 'relative', width: '100%', height: '300px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color, #2a2a38)', background: 'linear-gradient(135deg, #0a0a0f, #1a1a24)' }}>
          {fondoVista && (
            <div style={{
              position: 'absolute', inset: 0, backgroundImage: `url(${fondoVista})`, backgroundSize: 'cover', backgroundPosition: 'center',
              opacity: opacidad, filter: 'brightness(0.55)',
            }} />
          )}
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', textAlign: 'center' }}>
            {logoVista && <img src={logoVista} alt="Logo" style={{ width: '54px', height: '54px', objectFit: 'contain', background: '#fff', borderRadius: '50%', padding: '4px' }} />}
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem' }}>{config.nombre_negocio || 'ChloeRestaurant'}</div>
            {config.slogan && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>{config.slogan}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              {[1, 2, 3, 4].map((d) => (
                <span key={d} style={{ width: '12px', height: '12px', borderRadius: '50%', background: d === 1 ? primario : 'rgba(255,255,255,0.25)' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: '8px', marginTop: '8px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <span key={d} style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>{d}</span>
              ))}
            </div>
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary, #9494ad)', fontSize: '0.78rem', marginTop: '10px', lineHeight: 1.4 }}>
          La pantalla de PIN usará la imagen de fondo y el estilo seleccionado (Moderno, Mínimo o Clásico). El tema y colores se aplican a todo el sistema al guardar.
        </p>
      </div>
    </div>
  );
}

export default PersonalizacionSistema;


