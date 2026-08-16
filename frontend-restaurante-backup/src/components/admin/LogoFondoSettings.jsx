import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion, fondoLogin } from '../../personalizacion.js';
import { toastAviso } from '../Toast.jsx';

export default function LogoFondoSettings({ apiUrl }) {
  const urlBase = apiUrl;
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState({
    nombre_negocio: '',
    slogan: '',
    logo_url: '',
    fondo_login_url: '',
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
            opacidad_fondo: Number(data.opacidad_fondo || 1),
          };
          setConfig(nueva);
          configRef.current = nueva;
        }
      } catch (e) { console.error(e); }
      finally { setCargando(false); }
    })();
  }, []);

  const cambiar = (campo, valor) => {
    const nueva = { ...configRef.current, [campo]: valor };
    configRef.current = nueva;
    setConfig(nueva);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('nombre_negocio', config.nombre_negocio);
      fd.append('slogan', config.slogan);
      fd.append('tema_activo', config.tema_activo || 'noche');
      fd.append('estilo_login', config.estilo_login || 'moderno');
      fd.append('color_primario', config.color_primario || '');
      fd.append('color_secundario', config.color_secundario || '');
      fd.append('opacidad_fondo', config.opacidad_fondo);
      if (fondoArchivo) fd.append('fondo_archivo', fondoArchivo);
      else if (config.quitarFondo) fd.append('quitar_fondo', '1');
      if (logoArchivo) fd.append('logo_archivo', logoArchivo);
      else if (config.quitarLogo) fd.append('quitar_logo', '1');
      const res = await fetch(`${urlBase}/api/configuracion/sistema`, { method: 'PUT', body: fd });
      if (res.ok) { toastAviso('âœ… Logo y fondo guardados correctamente.'); }
      else { const d = await res.json(); toastAviso(`âŒ ${d.error || 'Error al guardar.'}`); }
    } catch { toastAviso('âš ï¸ Error de conexiÃ³n.'); }
    finally { setGuardando(false); }
  };

  const fondoVista = fondoArchivo ? URL.createObjectURL(fondoArchivo) : (config.quitarFondo ? '' : fondoLogin(config));
  const logoVista = logoArchivo ? URL.createObjectURL(logoArchivo) : (config.quitarLogo ? '' : config.logo_url);
  const opacidad = Math.max(0.2, Math.min(1, Number(config.opacidad_fondo || 1)));

  if (cargando) return <p style={{ color: 'var(--text-secondary)', padding: 20 }}>Cargando configuraciÃ³n...</p>;

  return (
    <div className="logo-fondo-settings">
      <div className="logo-fondo-settings__form-col">
        <form onSubmit={guardar} className="logo-fondo-form">
          <h3 className="logo-fondo-form__title">ðŸ–¼ï¸ Logo del Negocio</h3>
          <div className="logo-fondo-form__logo-row">
            {logoVista ? (
              <img src={logoVista} alt="Logo" className="logo-fondo-form__logo-preview" />
            ) : (
              <div className="logo-fondo-form__logo-placeholder">Logo</div>
            )}
            <div className="logo-fondo-form__logo-actions">
              <input type="file" accept="image/jpeg,image/png,image/webp" ref={logoRef} onChange={(e) => { setLogoArchivo(e.target.files[0]); setConfig((c) => ({ ...c, quitarLogo: false })); }} />
              {(config.logo_url || logoArchivo) && (
                <button type="button" className="btn-quitar" onClick={() => { setLogoArchivo(null); if (logoRef.current) logoRef.current.value = ''; setConfig((c) => ({ ...c, quitarLogo: !!(c.logo_url && !c.quitarLogo) })); }}>Quitar logo</button>
              )}
            </div>
          </div>

          <h3 className="logo-fondo-form__title">ðŸŒ„ Imagen de Fondo (Pantalla de PIN)</h3>
          <div className="logo-fondo-form__specs">
            <p><strong>Especificaciones de la imagen de fondo:</strong></p>
            <ul>
              <li><strong>Formatos aceptados:</strong> JPEG, PNG, WebP</li>
              <li><strong>TamaÃ±o mÃ¡ximo:</strong> 5 MB</li>
              <li><strong>Dimensiones recomendadas:</strong> 1920Ã—1080 px (16:9) o superior</li>
              <li><strong>ResoluciÃ³n mÃ­nima:</strong> 1280Ã—720 px para evitar pixelaciÃ³n</li>
              <li><strong>Contenido recomendado:</strong> ImÃ¡genes de paisajes, texturas o abstractas con pocos detalles. Evitar texto o logos en la imagen de fondo ya que se superpondrÃ¡ con el contenido del login.</li>
              <li><strong>Nota:</strong> La imagen se muestra con modo "cover" (cubre toda la pantalla) y se oscurece automÃ¡ticamente para mejorar la legibilidad del PIN.</li>
            </ul>
          </div>

          <input type="file" accept="image/jpeg,image/png,image/webp" ref={fondoRef} onChange={(e) => { setFondoArchivo(e.target.files[0]); setConfig((c) => ({ ...c, quitarFondo: false })); }} />
          {(config.fondo_login_url || fondoArchivo) && (
            <button type="button" className="btn-quitar" onClick={() => { setFondoArchivo(null); if (fondoRef.current) fondoRef.current.value = ''; setConfig((c) => ({ ...c, quitarFondo: !!(c.fondo_login_url && !c.quitarFondo) })); }}>Quitar imagen de fondo</button>
          )}

          <div className="logo-fondo-form__field">
            <label>Opacidad de la Imagen de Fondo ({Math.round(opacidad * 100)}%)</label>
            <input type="range" min="0.2" max="1" step="0.05" value={opacidad} onChange={(e) => cambiar('opacidad_fondo', Number(e.target.value))} />
          </div>

          <div className="logo-fondo-form__field">
            <label>Nombre del Negocio (se muestra en el login)</label>
            <input type="text" value={config.nombre_negocio} onChange={(e) => cambiar('nombre_negocio', e.target.value)} placeholder="Ej: Restaurante El Sabor" />
          </div>

          <div className="logo-fondo-form__field">
            <label>Slogan / Frase</label>
            <input type="text" value={config.slogan} onChange={(e) => cambiar('slogan', e.target.value)} placeholder="Ej: Cocina Dominicana de Primera" />
          </div>

          <button type="submit" disabled={guardando} className="tema-save-btn">
            {guardando ? 'Guardando...' : 'ðŸ’¾ Guardar Logo y Fondo'}
          </button>
        </form>
      </div>

      <div className="logo-fondo-settings__preview-col">
        <h3 className="logo-fondo-form__title">ðŸ‘ï¸ Vista Previa (Pantalla de PIN)</h3>
        <div className="logo-fondo-preview">
          {fondoVista && (
            <div className="logo-fondo-preview__bg" style={{ backgroundImage: `url(${fondoVista})`, opacity: opacidad }} />
          )}
          <div className="logo-fondo-preview__content">
            {logoVista && <img src={logoVista} alt="Logo" className="logo-fondo-preview__logo" />}
            <div className="logo-fondo-preview__name">{config.nombre_negocio || 'ChloeRestaurant'}</div>
            {config.slogan && <div className="logo-fondo-preview__slogan">{config.slogan}</div>}
            <div className="logo-fondo-preview__dots">
              {[1, 2, 3, 4].map((d) => <span key={d} />)}
            </div>
            <div className="logo-fondo-preview__pad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>
        <p className="logo-fondo-preview__note">AsÃ­ se verÃ¡ la pantalla de PIN con la imagen de fondo, el logo y la opacidad configurada.</p>
      </div>
    </div>
  );
}

