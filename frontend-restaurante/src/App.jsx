import { useState, useEffect } from 'react';
import MapaMesas from './components/MapaMesas';
import PantallaKDS from './components/PantallaKDS';
import PanelAdmin from './components/PanelAdmin';
import BloqueoLicencia from './components/BloqueoLicencia';
import ConfigurarIP from './components/ConfigurarIP';
import PantallaCaja from './components/PantallaCaja';
import WizardSetup from './components/WizardSetup';
import WelcomeScreen from './components/WelcomeScreen';
import LoginScreen from './features/login/LoginScreen.jsx';
import ToastContainer from './components/Toast.jsx';
import { toastAviso } from './components/Toast.jsx';
import { borrarSesion, guardarSesion } from './api.js';
import { getApiUrl, setApiUrl as guardarApiUrl, clearApiUrl } from './configApi.js';
import { aplicarPersonalizacion } from './personalizacion.js';
import './ui/theme/design-system.css';
import './App.css';

const TIEMPO_INACTIVIDAD = 3 * 60 * 1000;
const obtenerUrlInicial = () => getApiUrl();

function AppContent() {
  const [apiUrl, setApiUrl] = useState(obtenerUrlInicial);
  const [configSistema, setConfigSistema] = useState(null);
  const [configCargada, setConfigCargada] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [viendoKDS, setViendoKDS] = useState(null);
  const [servidorOnline, setServidorOnline] = useState(false);
  const [verificandoLicencia, setVerificandoLicencia] = useState(true);
  const [estadoLicencia, setEstadoLicencia] = useState({ bloqueado: false, motivo: '', contacto: '' });
  const [intentoVerificacion, setIntentoVerificacion] = useState(0);
  const [registroCliente, setRegistroCliente] = useState(null);

  useEffect(() => {
    if (!apiUrl) return;
    let cancelado = false;
    const cargar = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/configuracion/sistema`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelado) { setConfigSistema(data); setServidorOnline(true); aplicarPersonalizacion(data); }
        }
      } catch (e) { console.error('Error cargando config:', e); }
      finally { if (!cancelado) setConfigCargada(true); }
    };
    cargar();
    return () => { cancelado = true; };
  }, [apiUrl]);

  useEffect(() => {
    if (!apiUrl) return;
    let cancelado = false;
    const MAX_INTENTOS = 10;
    const verificar = async () => {
      setVerificandoLicencia(true);
      let intentos = 0;
      while (!cancelado && intentos < MAX_INTENTOS) {
        try {
          intentos++;
          const res = await fetch(`${apiUrl}/api/licencia/verificar`);
          if (cancelado) return;
          if (res.ok) { setEstadoLicencia(await res.json()); setVerificandoLicencia(false); return; }
          setVerificandoLicencia(false); return;
        } catch (e) {
          if (intentos >= MAX_INTENTOS) { setVerificandoLicencia(false); return; }
          await new Promise(r => setTimeout(r, Math.min(2000 * intentos, 30000)));
        }
      }
    };
    verificar();
    return () => { cancelado = true; };
  }, [apiUrl, intentoVerificacion]);

  const verificarLicenciaSistema = () => setIntentoVerificacion(v => v + 1);

useEffect(() => {
    if (!usuario) return;
    let timer;
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(() => {
      toastAviso('🔒 Sesión cerrada por inactividad.');
      resetSesion();
    }, TIEMPO_INACTIVIDAD); };
    ['mousemove','mousedown','keypress','touchstart','scroll'].forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => { clearTimeout(timer); ['mousemove','mousedown','keypress','touchstart','scroll'].forEach(e => window.removeEventListener(e, resetTimer)); };
  }, [usuario]);

  useEffect(() => {
    const handler = () => { setUsuario(null); };
    window.addEventListener('pos-sesion-vencida', handler);
    return () => window.removeEventListener('pos-sesion-vencida', handler);
  }, []);

  useEffect(() => {
    const off = () => setServidorOnline(false);
    const on = () => setServidorOnline(true);
    window.addEventListener('pos-red-offline', off);
    window.addEventListener('pos-red-online', on);
    return () => { window.removeEventListener('pos-red-offline', off); window.removeEventListener('pos-red-online', on); };
  }, []);

  const resetSesion = () => { borrarSesion(); setUsuario(null); setViendoKDS(null); };

  // RENDERIZADO CONDICIONAL
  if (!apiUrl) return (<><ToastContainer /><ConfigurarIP alGuardar={(ip) => { guardarApiUrl(ip); window.location.reload(); }} /></>);
  if (verificandoLicencia) return (<><ToastContainer /><div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', marginBottom: 'var(--space-lg)' }}>🍽️</div><p style={{ color: 'var(--muted)' }}>Verificando licencia...</p></div></div></>);
  if (estadoLicencia.bloqueado && (!usuario || usuario.rol !== 'Administrador')) return (<><ToastContainer /><BloqueoLicencia motivo={estadoLicencia.motivo} contacto={estadoLicencia.contacto} apiUrl={apiUrl} alIniciarSesionAdmin={(d) => { guardarSesion(d.token); setUsuario(d.usuario); }} /></>);
  if (viendoKDS) return (<><ToastContainer /><PantallaKDS tipo={viendoKDS} alSalir={resetSesion} apiUrl={apiUrl} /></>);
  if (usuario) {
    if (usuario.rol === 'Cocina') return (<><ToastContainer /><PantallaKDS tipo="Cocina" alSalir={resetSesion} apiUrl={apiUrl} /></>);
    if (usuario.rol === 'Bar') return (<><ToastContainer /><PantallaKDS tipo="Bar" alSalir={resetSesion} apiUrl={apiUrl} /></>);
    if (usuario.rol === 'Administrador') return (<><ToastContainer /><PanelAdmin usuario={usuario} alVolver={() => { resetSesion(); verificarLicenciaSistema(); }} apiUrl={apiUrl} alVerificarLicencia={verificarLicenciaSistema} /></>);
    if (usuario.rol === 'Cajero') return (<><ToastContainer /><PantallaCaja usuario={usuario} alCerrarSesion={resetSesion} apiUrl={apiUrl} /></>);
    return (<><ToastContainer /><MapaMesas usuario={usuario} alCerrarSesion={resetSesion} apiUrl={apiUrl} /></>);
  }
  if (configCargada && configSistema && !configSistema.setup_completado) {
    if (!registroCliente) return (<><ToastContainer /><WelcomeScreen apiUrl={apiUrl} config={configSistema} alContinuar={(datos) => setRegistroCliente(datos)} /></>);
    return (<><ToastContainer /><WizardSetup apiUrl={apiUrl} config={configSistema} configRegistro={registroCliente} alCompletado={() => window.location.reload()} /></>);
  }

return (
    <>
      <ToastContainer />
      <LoginScreen apiUrl={apiUrl} configSistema={configSistema} onLogin={(data) => { guardarSesion(data.token); setUsuario(data.usuario); }} onVerKDS={(tipo) => setViendoKDS(tipo)} servidorOnline={servidorOnline} onChangeServer={() => { clearApiUrl(); setApiUrl(''); }} />
    </>
  );
}

function App() { return <AppContent />; }
export default App;





