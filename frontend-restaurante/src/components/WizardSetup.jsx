import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion, fondoLogin } from '../personalizacion.js';

const TEMAS = [
  { id: 'noche', name: 'Noche', color: '#00f576' },
  { id: 'oceano', name: 'Oceano', color: '#00b4d8' },
  { id: 'lava', name: 'Lava', color: '#ff6b35' },
  { id: 'esmeralda', name: 'Esmeralda', color: '#2dc653' },
  { id: 'amatista', name: 'Amatista', color: '#a855f7' },
  { id: 'claro', name: 'Claro', color: '#1a73e8' },
];

function WizardSetup({ apiUrl, config, configRegistro, alCompletado }) {
  const urlBase = apiUrl;
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState(config.nombre_negocio || configRegistro?.negocio || '');
  const [slogan, setSlogan] = useState(config.slogan || '');
  const [temaActivo, setTemaActivo] = useState(config.tema_activo || 'noche');
  const [colorPrimario, setColorPrimario] = useState(config.color_primario || '#00f576');
  const [colorSecundario, setColorSecundario] = useState(config.color_secundario || '');
  const [opacidad, setOpacidad] = useState(Number(config.opacidad_fondo || 1));
  const [fondoArchivo, setFondoArchivo] = useState(null);
  const [logoArchivo, setLogoArchivo] = useState(null);
  const [adminNombre, setAdminNombre] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const fondoRef = useRef(null);
  const logoRef = useRef(null);
  const temaRef = useRef({ temaActivo, colorPrimario, colorSecundario });
  const aplicarTemaDebounce = useRef(null);

  useEffect(() => {
    temaRef.current = { temaActivo, colorPrimario, colorSecundario };
  }, [temaActivo, colorPrimario, colorSecundario]);

  // Limpia el temporizador de aplicación del tema al desmontar
  useEffect(() => () => {
    if (aplicarTemaDebounce.current) clearTimeout(aplicarTemaDebounce.current);
  }, []);

  const necesitaAdmin = !config.tiene_administrador;
  const totalPasos = necesitaAdmin ? 5 : 4;

  const siguiente = () => {
    setError('');
    if (paso === 1 && !nombreNegocio.trim()) return setError('Ingresa el nombre del negocio.');
    if (paso === 3 && necesitaAdmin) {
      if (!adminNombre.trim()) return setError('Ingresa el nombre del administrador.');
      if (!/^[0-9]{4,12}$/.test(adminPin)) return setError('El PIN debe contener entre 4 y 12 dígitos.');
    }
    setPaso((p) => p + 1);
  };

  const terminar = async () => {
    setError('');
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('nombre_negocio', nombreNegocio.trim());
      fd.append('slogan', slogan.trim());
      fd.append('tema_activo', temaActivo);
      fd.append('color_primario', colorPrimario);
      fd.append('color_secundario', colorSecundario);
      fd.append('opacidad_fondo', opacidad);
      if (fondoArchivo) fd.append('fondo_archivo', fondoArchivo);
      if (logoArchivo) fd.append('logo_archivo', logoArchivo);
      if (necesitaAdmin) {
        fd.append('admin_nombre', adminNombre.trim());
        fd.append('admin_pin', adminPin);
      }
      const res = await fetch(`${urlBase}/api/setup/completar`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Error al finalizar la configuración.');
      localStorage.removeItem('pos_theme');
      if (alCompletado) alCompletado(data);
    } catch (e) {
      setError('No se pudo conectar con el servidor. Verifica la red e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const aplicarVista = () => {
    // Aplica el tema en vivo con debounce para no forzar recalculos de estilo
    // en cada movimiento del color picker (evita congelamientos en Electron).
    if (aplicarTemaDebounce.current) clearTimeout(aplicarTemaDebounce.current);
    aplicarTemaDebounce.current = setTimeout(() => aplicarPersonalizacion(temaRef.current), 250);
  };

  const pasoVisible = paso;
  const fondoVista = fondoArchivo ? URL.createObjectURL(fondoArchivo) : fondoLogin(config);
  const logoVista = logoArchivo ? URL.createObjectURL(logoArchivo) : config.logo_url;
  const primario = colorPrimario || '#00f576';

  const contenedorEstilo = {
    width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
  };
  const panelEstilo = {
    position: 'relative', zIndex: 2, width: '560px', maxWidth: '92vw', background: 'rgba(16,16,24,0.94)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', padding: '34px 36px',
    boxShadow: '0 30px 80px rgba(0,0,0,0.6)', color: '#fff',
  };
  const inputEstilo = { width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '12px', fontSize: '0.95rem', outline: 'none' };
  const btnEstilo = { background: `linear-gradient(135deg, ${primario}, ${colorSecundario || primario})`, color: '#000', border: 'none', padding: '12px 26px', borderRadius: '12px', fontWeight: '800', fontSize: '0.95rem', cursor: 'pointer' };

  return (
    <div style={contenedorEstilo} onLoad={aplicarVista}>
      {fondoVista && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${fondoVista})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5, filter: 'brightness(0.5)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06), transparent 60%)' }} />

      <div style={panelEstilo}>
        {/* Indicador de pasos */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '22px' }}>
          {Array.from({ length: totalPasos }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: '6px', borderRadius: '4px', background: i <= paso ? primario : 'rgba(255,255,255,0.15)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {paso === 0 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              {logoVista && <img src={logoVista} alt="Logo" style={{ width: '70px', height: '70px', objectFit: 'contain', background: '#fff', borderRadius: '50%', padding: '5px', marginBottom: '12px' }} />}
              <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800 }}>🚀 ¡Bienvenido a ChloeRestaurant!</h1>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '8px', lineHeight: 1.5 }}>
                Vamos a personalizar el sistema para tu negocio en unos pocos pasos: identidad, apariencia y acceso del administrador.
              </p>
            </div>
            <button onClick={siguiente} style={{ ...btnEstilo, width: '100%' }}>Comenzar configuración →</button>
          </>
        )}

        {pasoVisible === 1 && (
          <>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.3rem' }}>🏢 Datos del Negocio</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '20px', fontSize: '0.9rem' }}>Este nombre aparecerá en la pantalla de ingreso de PIN.</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Nombre del Negocio</label>
              <input style={inputEstilo} value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} placeholder="Ej: Restaurante El Sabor" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Slogan (opcional)</label>
              <input style={inputEstilo} value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="Ej: Cocina Dominicana de Primera" />
            </div>
            <button onClick={siguiente} style={{ ...btnEstilo, width: '100%' }}>Continuar →</button>
          </>
        )}

        {pasoVisible === 2 && (
          <>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.3rem' }}>🎨 Apariencia del Sistema</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '18px', fontSize: '0.9rem' }}>Elige el tema y una imagen de fondo para la pantalla de PIN.</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Tema</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {TEMAS.map((t) => (
                  <button key={t.id} title={t.name} onClick={() => { setTemaActivo(t.id); setColorPrimario(t.color); setColorSecundario(''); aplicarVista(); }} style={{ width: '40px', height: '40px', borderRadius: '50%', border: temaActivo === t.id ? `3px solid ${primario}` : '2px solid rgba(255,255,255,0.2)', background: t.color, cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Color Principal</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="color" value={colorPrimario} onChange={(e) => { setColorPrimario(e.target.value); aplicarVista(); }} style={{ width: '42px', height: '36px', border: 'none', background: 'transparent' }} />
                  <input style={{ ...inputEstilo, padding: '8px' }} value={colorPrimario} onChange={(e) => { setColorPrimario(e.target.value); aplicarVista(); }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Color Secundario</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colorSecundario) ? colorSecundario : primario} onChange={(e) => { setColorSecundario(e.target.value); aplicarVista(); }} style={{ width: '42px', height: '36px', border: 'none', background: 'transparent' }} />
                  <input style={{ ...inputEstilo, padding: '8px' }} value={colorSecundario} onChange={(e) => { setColorSecundario(e.target.value); aplicarVista(); }} />
                </div>
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Logo del Negocio (opcional)</label>
              <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoArchivo(e.target.files[0])} style={{ color: '#fff', fontSize: '0.85rem' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Imagen de Fondo (opcional)</label>
              <input ref={fondoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFondoArchivo(e.target.files[0])} style={{ color: '#fff', fontSize: '0.85rem' }} />
            </div>
            <button onClick={siguiente} style={{ ...btnEstilo, width: '100%' }}>Continuar →</button>
          </>
        )}

        {pasoVisible === 3 && necesitaAdmin && (
          <>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.3rem' }}>🔐 Cuenta de Administrador</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '20px', fontSize: '0.9rem' }}>Crea el acceso principal del dueño del negocio. Guarda bien este PIN.</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>Nombre del Administrador</label>
              <input style={inputEstilo} value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} placeholder="Ej: Juan Pérez" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', fontWeight: 600 }}>PIN de Acceso (4 a 12 dígitos)</label>
              <input type="password" style={inputEstilo} maxLength="12" value={adminPin} onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 1234" />
            </div>
            <button onClick={siguiente} style={{ ...btnEstilo, width: '100%' }}>Continuar →</button>
          </>
        )}

        {paso === totalPasos - 1 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '2.6rem' }}>🎉</div>
              <h2 style={{ margin: '10px 0 6px 0', fontSize: '1.4rem' }}>¡Todo listo!</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                Tu sistema quedó personalizado{necesitaAdmin ? ' y la cuenta de administrador fue creada' : ''}. Ya puedes ingresar tu PIN para comenzar.
              </p>
            </div>
            <button onClick={terminar} disabled={guardando} style={{ ...btnEstilo, width: '100%' }}>
              {guardando ? 'Configurando...' : 'Finalizar y entrar al sistema ✓'}
            </button>
          </>
        )}

        {error && <p style={{ color: '#ff6b6b', marginTop: '14px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600 }}>⚠️ {error}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '18px' }}>
          {paso > 0 && paso < totalPasos - 1 && (
            <button onClick={() => { setError(''); setPaso((p) => p - 1); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>← Atrás</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WizardSetup;

