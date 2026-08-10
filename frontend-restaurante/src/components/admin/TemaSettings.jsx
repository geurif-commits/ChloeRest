import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion } from '../../personalizacion.js';
import { toastAviso } from '../Toast.jsx';

const TEMAS = [
  { id: 'noche', name: 'Noche', color: '#00f576', desc: 'Oscuro con acentos dorados/verdes' },
  { id: 'oceano', name: 'Océano', color: '#00b4d8', desc: 'Oscuro con tonos azul marino' },
  { id: 'lava', name: 'Lava', color: '#ff6b35', desc: 'Oscuro con tonos rojizos/naranjas' },
  { id: 'esmeralda', name: 'Esmeralda', color: '#2dc653', desc: 'Oscuro con tonos verdes' },
  { id: 'amatista', name: 'Amatista', color: '#a855f7', desc: 'Oscuro con tonos púrpura' },
  { id: 'claro', name: 'Claro', color: '#1a73e8', desc: 'Fondo blanco, texto oscuro, ideal para ambientes con mucha luz' },
];

const ESTILOS_LOGIN = [
  { id: 'moderno', name: 'Moderno', icon: '✨', desc: 'Dividido: logo/reloj a la izquierda y teclado PIN a la derecha.' },
  { id: 'minimal', name: 'Mínimo', icon: '⬛', desc: 'Sin cuadro contenedor. Solo logo, PIN y teclado centrados.' },
  { id: 'clasico', name: 'Clásico', icon: '📦', desc: 'El cuadro tradicional con todo centrado.' },
];

export default function TemaSettings({ apiUrl }) {
  const urlBase = apiUrl || 'http://localhost:3000';
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    tema_activo: 'noche',
    estilo_login: 'moderno',
    color_primario: '',
    color_secundario: '',
    nombre_negocio: '',
    slogan: '',
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
            estilo_login: data.estilo_login || 'moderno',
            color_primario: data.color_primario || '',
            color_secundario: data.color_secundario || '',
            nombre_negocio: data.nombre_negocio || '',
            slogan: data.slogan || '',
          };
          setConfig(nueva);
          configRef.current = nueva;
          aplicarPersonalizacion(data);
        }
      } catch (e) { console.error(e); }
      finally { setCargando(false); }
    })();
  }, []);

  const cambiar = (campo, valor) => {
    const nueva = { ...configRef.current, [campo]: valor };
    configRef.current = nueva;
    setConfig(nueva);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => aplicarPersonalizacion(configRef.current), 250);
  };

  const seleccionarTema = (id) => {
    const tema = TEMAS.find((t) => t.id === id);
    cambiar('tema_activo', id);
    if (tema) { cambiar('color_primario', tema.color); cambiar('color_secundario', ''); }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('nombre_negocio', config.nombre_negocio);
      fd.append('slogan', config.slogan);
      fd.append('tema_activo', config.tema_activo);
      fd.append('estilo_login', config.estilo_login);
      fd.append('color_primario', config.color_primario);
      fd.append('color_secundario', config.color_secundario);
      fd.append('opacidad_fondo', '1');
      const res = await fetch(`${urlBase}/api/configuracion/sistema`, { method: 'PUT', body: fd });
      if (res.ok) { toastAviso('✅ Tema guardado correctamente.'); }
      else { const d = await res.json(); toastAviso(`❌ ${d.error || 'Error al guardar.'}`); }
    } catch { toastAviso('⚠️ Error de conexión.'); }
    finally { setGuardando(false); }
  };

  if (cargando) return <p style={{ color: 'var(--text-secondary)', padding: 20 }}>Cargando temas...</p>;

  return (
    <form onSubmit={guardar} className="tema-settings">
      <h3 className="tema-settings__title">🎨 Tema del Sistema</h3>
      <p className="tema-settings__desc">Selecciona un tema visual para toda la aplicación. El modo "Claro" usa fondo blanco para ambientes con mucha iluminación.</p>

      <div className="tema-grid">
        {TEMAS.map((tema) => (
          <button type="button" key={tema.id} className={`tema-card ${config.tema_activo === tema.id ? 'activo' : ''}`} onClick={() => seleccionarTema(tema.id)}>
            <span className="tema-card__swatch" style={{ background: tema.color }} />
            <span className="tema-card__name">{tema.name}</span>
            <span className="tema-card__desc">{tema.desc}</span>
            {config.tema_activo === tema.id && <span className="tema-card__check">✓</span>}
          </button>
        ))}
      </div>

      <h3 className="tema-settings__subtitle">✏️ Colores Personalizados</h3>
      <div className="tema-colors">
        <div className="tema-color-field">
          <label>Color Principal (acentos, botones)</label>
          <div className="tema-color-input">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(config.color_primario) ? config.color_primario : '#00f576'} onChange={(e) => cambiar('color_primario', e.target.value)} />
            <input type="text" value={config.color_primario} onChange={(e) => cambiar('color_primario', e.target.value)} placeholder="#00f576" />
          </div>
        </div>
        <div className="tema-color-field">
          <label>Color Secundario</label>
          <div className="tema-color-input">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(config.color_secundario) ? config.color_secundario : '#00b852'} onChange={(e) => cambiar('color_secundario', e.target.value)} />
            <input type="text" value={config.color_secundario} onChange={(e) => cambiar('color_secundario', e.target.value)} placeholder="#00b852" />
          </div>
        </div>
      </div>

      <h3 className="tema-settings__subtitle">🔐 Estilo de Pantalla de PIN</h3>
      <div className="tema-login-styles">
        {ESTILOS_LOGIN.map((estilo) => (
          <button type="button" key={estilo.id} className={`tema-login-btn ${config.estilo_login === estilo.id ? 'activo' : ''}`} onClick={() => cambiar('estilo_login', estilo.id)}>
            <span className="tema-login-btn__icon">{estilo.icon}</span>
            <span className="tema-login-btn__name">{estilo.name}</span>
            <span className="tema-login-btn__desc">{estilo.desc}</span>
          </button>
        ))}
      </div>

      <button type="submit" disabled={guardando} className="tema-save-btn">
        {guardando ? 'Guardando...' : '💾 Guardar Tema'}
      </button>
    </form>
  );
}
