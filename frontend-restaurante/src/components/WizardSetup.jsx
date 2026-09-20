import { useEffect, useRef, useState } from 'react';
import { aplicarPersonalizacion, fondoLogin } from '../personalizacion.js';
import { obtenerDeviceId } from '../utils/dispositivo.js';
import { ArrowLeft, ArrowRight, Building2, Check, ImagePlus, PartyPopper, Palette, Rocket, ShieldCheck } from 'lucide-react';
import './wizard.css';

const DORADO = '#d9a640';

const TEMAS = [
  { id: 'claro', name: 'Ivory & Gold', color: DORADO },
];

function Campo({ etiqueta, children }) {
  return <div className="po-field"><label>{etiqueta}</label>{children}</div>;
}

function WizardSetup({ apiUrl, config, configRegistro, alCompletado }) {
  const urlBase = apiUrl;
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState(config.nombre_negocio || configRegistro?.negocio || '');
  const [slogan, setSlogan] = useState(config.slogan || '');
  const [temaActivo, setTemaActivo] = useState('claro');
  const [colorPrimario, setColorPrimario] = useState(config.color_primario || DORADO);
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
      if (!/^[0-9]{6}$/.test(adminPin)) return setError('El PIN debe ser exactamente 6 dígitos.');
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
      const res = await fetch(`${urlBase}/api/setup/completar`, {
        method: 'POST',
        headers: { 'X-Device-ID': obtenerDeviceId() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          localStorage.removeItem('pos_theme');
          if (alCompletado) return alCompletado(data);
        }
        return setError(data.error || 'Error al finalizar la configuración.');
      }
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
  const pct = Math.round(((paso + 1) / totalPasos) * 100);

  return (
    <div className="wz" onLoad={aplicarVista}>
      {fondoVista && <div className="wz__bg" style={{ backgroundImage: `url(${fondoVista})` }} />}

      <div className="wz__card" role="dialog" aria-label="Configuración inicial">
        <div className="wz__progress">
          <div className="wz__progress-head">
            <span>Paso {paso + 1} de {totalPasos}</span>
            <b>{pct}%</b>
          </div>
          <div className="wz__track"><i style={{ width: `${pct}%` }} /></div>
          <div className="wz__dots">
            {Array.from({ length: totalPasos }).map((_, i) => (
              <span key={i} className={`wz__dot ${i <= paso ? 'is-done' : ''} ${i === paso ? 'is-current' : ''}`}>
                {i < paso ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
            ))}
          </div>
        </div>

        {paso === 0 && (
          <>
            <div className="wz__hero">
              <span className="wz__badge">{logoVista ? <img src={logoVista} alt="Logo" /> : <Rocket size={26} />}</span>
              <span className="px-eyebrow">Configuración inicial</span>
              <h1>Bienvenido a ChloeRestaurant</h1>
              <p>Vamos a personalizar el sistema para tu negocio en unos pocos pasos: identidad, apariencia y acceso del administrador.</p>
            </div>
            <button type="button" className="px-btn px-btn--gold px-btn--lg wz__cta" onClick={siguiente}>Comenzar configuración <ArrowRight size={18} /></button>
          </>
        )}

        {pasoVisible === 1 && (
          <>
            <div className="wz__title"><span className="wz__ico"><Building2 size={20} /></span><div><h2>Datos del negocio</h2><p>Este nombre aparecerá en la pantalla de ingreso de PIN.</p></div></div>
            <Campo etiqueta="Nombre del negocio">
              <input className="po-input" value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} placeholder="Restaurante El Sabor" autoFocus />
            </Campo>
            <Campo etiqueta="Eslogan (opcional)">
              <input className="po-input" value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="Cocina dominicana de primera" />
            </Campo>
            <button type="button" className="px-btn px-btn--gold px-btn--lg wz__cta" onClick={siguiente}>Continuar <ArrowRight size={18} /></button>
          </>
        )}

        {pasoVisible === 2 && (
          <>
            <div className="wz__title"><span className="wz__ico"><Palette size={20} /></span><div><h2>Apariencia del sistema</h2><p>Elige el tema, tus colores y las imágenes de la pantalla de PIN.</p></div></div>
            <Campo etiqueta="Tema">
              <div className="wz__themes">
                {TEMAS.map((t) => (
                  <button key={t.id} type="button" title={t.name} className={`wz__theme ${temaActivo === t.id ? 'is-active' : ''}`} onClick={() => { setTemaActivo(t.id); setColorPrimario(t.color); setColorSecundario(''); aplicarVista(); }}>
                    <i style={{ background: t.color }} />{t.name}
                  </button>
                ))}
              </div>
            </Campo>
            <div className="wz__two">
              <Campo etiqueta="Color principal">
                <div className="wz__color">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colorPrimario) ? colorPrimario : DORADO} onChange={(e) => { setColorPrimario(e.target.value); aplicarVista(); }} aria-label="Color principal" />
                  <input className="po-input" value={colorPrimario} onChange={(e) => { setColorPrimario(e.target.value); aplicarVista(); }} />
                </div>
              </Campo>
              <Campo etiqueta="Color secundario">
                <div className="wz__color">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colorSecundario) ? colorSecundario : (/^#[0-9a-fA-F]{6}$/.test(colorPrimario) ? colorPrimario : DORADO)} onChange={(e) => { setColorSecundario(e.target.value); aplicarVista(); }} aria-label="Color secundario" />
                  <input className="po-input" value={colorSecundario} onChange={(e) => { setColorSecundario(e.target.value); aplicarVista(); }} />
                </div>
              </Campo>
            </div>
            <Campo etiqueta="Logo del negocio (opcional)">
              <label className="wz__file"><ImagePlus size={18} /><span>{logoArchivo ? logoArchivo.name : 'Seleccionar imagen'}</span>
                <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoArchivo(e.target.files[0])} />
              </label>
            </Campo>
            <Campo etiqueta="Imagen de fondo (opcional)">
              <label className="wz__file"><ImagePlus size={18} /><span>{fondoArchivo ? fondoArchivo.name : 'Seleccionar imagen'}</span>
                <input ref={fondoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFondoArchivo(e.target.files[0])} />
              </label>
            </Campo>
            <button type="button" className="px-btn px-btn--gold px-btn--lg wz__cta" onClick={siguiente}>Continuar <ArrowRight size={18} /></button>
          </>
        )}

        {pasoVisible === 3 && necesitaAdmin && (
          <>
            <div className="wz__title"><span className="wz__ico"><ShieldCheck size={20} /></span><div><h2>Cuenta de administrador</h2><p>Crea el acceso principal del dueño del negocio. Guarda bien este PIN.</p></div></div>
            <Campo etiqueta="Nombre del administrador">
              <input className="po-input" value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} placeholder="Juan Pérez" />
            </Campo>
            <Campo etiqueta="PIN de acceso (6 dígitos exactos)">
              <input type="password" inputMode="numeric" className="po-input wz__pin" maxLength="6" value={adminPin} onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
            </Campo>
            <button type="button" className="px-btn px-btn--gold px-btn--lg wz__cta" onClick={siguiente}>Continuar <ArrowRight size={18} /></button>
          </>
        )}

        {paso === totalPasos - 1 && (
          <>
            <div className="wz__hero">
              <span className="wz__badge wz__badge--ok"><PartyPopper size={26} /></span>
              <h1>¡Todo listo!</h1>
              <p>Tu sistema quedó personalizado{necesitaAdmin ? ' y la cuenta de administrador fue creada' : ''}. Ya puedes ingresar tu PIN para comenzar.</p>
            </div>
            <button type="button" className="px-btn px-btn--gold px-btn--lg wz__cta" onClick={terminar} disabled={guardando}>
              {guardando ? 'Configurando…' : <>Finalizar y entrar <Check size={18} /></>}
            </button>
          </>
        )}

        {error && <p className="wz__error" role="alert">{error}</p>}

        {paso > 0 && paso < totalPasos - 1 && (
          <button type="button" className="px-btn px-btn--ghost wz__back" onClick={() => { setError(''); setPaso((p) => p - 1); }}><ArrowLeft size={16} /> Atrás</button>
        )}
      </div>
    </div>
  );
}

export default WizardSetup;
