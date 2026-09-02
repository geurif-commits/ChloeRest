import { useState, useEffect } from 'react';

import MapaMesas from './components/MapaMesas';
import PantallaKDS from './components/PantallaKDS';
import PanelAdmin from './components/PanelAdmin';
import BloqueoLicencia from './components/BloqueoLicencia';
import SafeImage from './components/SafeImage.jsx';
import ActivacionDispositivo from './components/ActivacionDispositivo';
import ConfigurarIP from './components/ConfigurarIP';
import PantallaCaja from './components/PantallaCaja';
import WizardSetup from './components/WizardSetup';
import WelcomeScreen from './components/WelcomeScreen';
import LandingScreen from './components/LandingScreen';
import LoginScreen from './features/login/LoginScreen.jsx';
import PanelDueno from './components/admin/PanelDueno';

import ToastContainer from './components/Toast.jsx';
import { toastAviso } from './components/Toast.jsx';

import { borrarSesion, guardarSesion, obtenerSesion } from './api.js';
import { obtenerInfoDispositivo, obtenerDeviceId } from './utils/dispositivo.js';

import {
  getApiUrl,
  setApiUrl as guardarApiUrl,
  clearApiUrl,
  esElectronApp
} from './configApi.js';

import { aplicarPersonalizacion } from './personalizacion.js';

import './App.css';
import './ui/theme/overrides-pedido.css';

// Build marker: forces a fresh browser asset after deployment.
const BUILD_MARKER = 'multiempresa-2.1.0';
if (typeof window !== 'undefined') window.__CHLOE_BUILD__ = BUILD_MARKER;

const TIEMPO_INACTIVIDAD = 3 * 60 * 1000;

const RUTAS_APP = new Set([
  '/landingscreen', '/formulario', '/solicitar', '/solicitar-licencia',
  '/login', '/activacion', '/paneldueno', '/planeldueno', '/app',
  '/admin', '/paneladmin', '/caja', '/pos', '/kds', '/kds/cocina',
  '/kds/bar', '/cocina', '/bar',
]);

const RUTA_ALIAS = {
  '/paneladmin': '/admin',
  '/planeldueno': '/paneldueno',
  '/pos': '/app',
  '/cocina': '/kds/cocina',
  '/bar': '/kds/bar',
};

function normalizarRuta(ruta, host = '') {
  const limpia = String(ruta || '').replace(/\/+$/, '').toLowerCase() || '/landingscreen';
  if (host.startsWith('formulario.') || host.startsWith('solicitar.')) return '/formulario';
  if (limpia === '/') return '/landingscreen';
  const destino = RUTA_ALIAS[limpia] || limpia;
  return RUTAS_APP.has(destino) ? destino : '/landingscreen';
}

function rutaUsuario(usuario) {
  if (usuario?.rol === 'Dueno' || usuario?.esDueno) return '/paneldueno';
  if (usuario?.rol === 'Administrador') return '/admin';
  if (usuario?.rol === 'Cocina') return '/kds/cocina';
  if (usuario?.rol === 'Bar') return '/kds/bar';
  if (usuario?.rol === 'Cajero') return '/caja';
  return '/app';
}

import { ShieldAlert, KeyRound, Lock, CheckCircle2 } from 'lucide-react';

function CambioPinObligatorio({ onGuardar }) {
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) {
      setError('El nuevo PIN debe tener exactamente 6 dígitos numéricos.');
      return;
    }
    if (pin !== confirmacion) {
      setError('Los dos PIN ingresados no coinciden. Verifica e intenta de nuevo.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar(pin);
    } catch (e) {
      setError(e.message || 'Error al actualizar el PIN.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="required-pin-screen" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 10%, rgba(245, 184, 61, 0.15), transparent 50%), #07090f',
      padding: '20px'
    }}>
      <form
        className="required-pin-card"
        onSubmit={guardar}
        style={{
          maxWidth: '420px',
          width: '100%',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(245, 184, 61, 0.35)',
          borderRadius: '20px',
          padding: '32px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          textAlign: 'center'
        }}
      >
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'rgba(245, 184, 61, 0.15)',
          border: '1px solid rgba(245, 184, 61, 0.4)',
          color: 'var(--gold, #f5b842)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <ShieldAlert size={28} />
        </div>

        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>
            Cambio Obligatorio de PIN
          </h2>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.5 }}>
            Por razones de seguridad, debes reemplazar el PIN temporal suministrado por un <strong>PIN confidencial y secreto de 6 dígitos</strong>.
          </p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Nuevo PIN de 6 dígitos"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: '1.1rem',
                textAlign: 'center',
                letterSpacing: '0.2em',
                fontFamily: 'monospace'
              }}
            />
          </div>

          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value.replace(/\D/g, ''))}
              placeholder="Confirmar nuevo PIN"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: '1.1rem',
                textAlign: 'center',
                letterSpacing: '0.2em',
                fontFamily: 'monospace'
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '0.78rem',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={guardando || pin.length !== 6 || confirmacion.length !== 6}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #f5b842 0%, #d49524 100%)',
            border: 'none',
            color: '#0b0f19',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 15px rgba(245, 184, 61, 0.3)',
            transition: 'all 0.2s ease',
            opacity: (guardando || pin.length !== 6 || confirmacion.length !== 6) ? 0.6 : 1
          }}
        >
          <Lock size={16} />
          {guardando ? 'Guardando nuevo PIN...' : 'Establecer y Proteger PIN'}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// APP CONTENT
// ============================================================

function AppContent() {

  const [apiUrl, setApiUrl] = useState(getApiUrl);

  const [configSistema, setConfigSistema] = useState(null);
  const [configNegocio, setConfigNegocio] = useState(null);
  const [configCargada, setConfigCargada] = useState(false);

  const [usuario, setUsuario] = useState(null);

  const establecerUsuario = (data) => {
    guardarSesion(data.token);
    if (data.tokenDueno) {
      localStorage.setItem('pos_owner_token', data.tokenDueno);
    }
    // Solo marcamos dispositivo como activado si es un usuario operativo del restaurante
    if (data.usuario?.rol !== 'Dueno' && !data.esDueno) {
      setDispositivoActivado(true);
    }
    setUsuario({ ...data.usuario, requiereCambioPin: Boolean(data.requiereCambioPin) });
  };

  const iniciarSesion = (data) => {
    establecerUsuario(data);
    navegarRuta(rutaUsuario(data.usuario));
  };

  const cambiarPinObligatorio = async (nuevoPin) => {
    const res = await fetch(`${apiUrl}/api/usuarios/mi-pin`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${obtenerSesion()}`,
      },
      body: JSON.stringify({ pin: nuevoPin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el PIN.');
    setUsuario((actual) => ({ ...actual, requiereCambioPin: false }));
  };

  const [viendoKDS, setViendoKDS] = useState(null);

  const [servidorOnline, setServidorOnline] = useState(false);

  const [verificandoLicencia, setVerificandoLicencia] = useState(false);

  const [estadoLicencia, setEstadoLicencia] = useState({
    bloqueado: false,
    motivo: '',
    contacto: ''
  });

  const [intentoVerificacion, setIntentoVerificacion] =
    useState(0);

  const [registroCliente, setRegistroCliente] =
    useState(null);

  const [vistaActiva, setVistaActiva] =
    useState(() => {
      const ruta = normalizarRuta(window.location.pathname, window.location.hostname.toLowerCase());
      if (ruta === '/login') return 'login';
      if (ruta === '/activacion') return 'activacion';
      if (ruta === '/app' || ruta === '/admin' || ruta === '/caja') return ruta.slice(1);
      if (ruta.startsWith('/kds')) return 'kds';
      return 'landing';
    });

  const [vistaSetup, setVistaSetup] =
    useState(() => {
      const ruta = normalizarRuta(window.location.pathname, window.location.hostname.toLowerCase());
      return ruta === '/formulario'
        ? 'registro'
        : null;
    });

  const [dispositivoActivado, setDispositivoActivado] =
    useState(null);

  const [verificandoDispositivo, setVerificandoDispositivo] =
    useState(true);

  const [planSeleccionado, setPlanSeleccionado] =
    useState(null);

  const [vistaDueno, setVistaDueno] =
    useState(() => normalizarRuta(window.location.pathname) === '/paneldueno');

  const navegarRuta = (ruta) => {
    const destino = normalizarRuta(ruta);
    if (window.location.pathname !== destino) window.history.pushState({}, '', destino);
    setVistaDueno(destino === '/paneldueno' || destino === '/planeldueno');
    if (destino === '/formulario' || destino === '/solicitar' || destino === '/solicitar-licencia') {
      setVistaSetup('registro');
      setVistaActiva('landing');
    } else if (destino === '/login') {
      setVistaSetup(null);
      setVistaActiva('login');
    } else if (destino === '/activacion') {
      setVistaSetup(null);
      setVistaActiva('activacion');
    } else if (destino === '/app' || destino === '/admin' || destino === '/caja') {
      setVistaSetup(null);
      setVistaActiva(destino.slice(1));
    } else if (destino.startsWith('/kds')) {
      setVistaSetup(null);
      setViendoKDS(destino.endsWith('/bar') ? 'Bar' : 'Cocina');
      setVistaActiva('kds');
    } else {
      setVistaSetup(null);
      setVistaActiva('landing');
    }
  };

  const [redOnline, setRedOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const alConectar = () => setRedOnline(true);
    const alDesconectar = () => setRedOnline(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, []);

  useEffect(() => {
    const alNavegar = () => {
      navegarRuta(normalizarRuta(window.location.pathname, window.location.hostname.toLowerCase()));
    };
    window.addEventListener('popstate', alNavegar);
    return () => window.removeEventListener('popstate', alNavegar);
  }, []);

  // ==========================================================
  // CARGAR CONFIGURACIÓN DEL SISTEMA
  // ==========================================================

  useEffect(() => {
    if (!apiUrl || verificandoDispositivo) {
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      try {
        const res = await fetch(
          `${apiUrl}/api/configuracion/sistema`,
          { headers: { 'X-Device-ID': obtenerDeviceId() } }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!cancelado) {
          let negocioData = null;
          try {
            const resNeg = await fetch(`${apiUrl}/api/negocio/config`, {
              headers: { 'X-Device-ID': obtenerDeviceId() }
            });
            if (resNeg.ok) negocioData = await resNeg.json();
          } catch {}

          setConfigSistema(data);
          setConfigNegocio(negocioData);
          setServidorOnline(true);
          aplicarPersonalizacion(data, negocioData);
        }
      } catch (e) {
        console.error('Error cargando configuración:', e);
        if (!cancelado) {
          setServidorOnline(false);
        }
      } finally {
        if (!cancelado) {
          setConfigCargada(true);
        }
      }
    };

    cargar();

    return () => {
      cancelado = true;
    };
  }, [apiUrl, verificandoDispositivo, dispositivoActivado]);

  useEffect(() => {
    const alActualizar = (evento) => {
      const detalle = evento?.detail;
      if (!detalle) return;
      setConfigSistema((previa) => ({ ...previa, ...detalle }));
    };

    window.addEventListener('configuracion-sistema-actualizada', alActualizar);
    return () => window.removeEventListener('configuracion-sistema-actualizada', alActualizar);
  }, []);

  useEffect(() => {
    if (
      configCargada &&
      configSistema &&
      !configSistema.setup_completado &&
      !vistaSetup &&
      !verificandoDispositivo &&
      dispositivoActivado === true
    ) {
      // El setup pertenece al negocio después de activar una licencia; una
      // solicitud pública de licencia nunca debe abrir este asistente.
      setVistaSetup('wizard');
    }
  }, [configCargada, configSistema, vistaSetup, verificandoDispositivo, dispositivoActivado]);

  // ==========================================================
  // VALIDAR TOKEN EXISTENTE AL INICIAR
  // Evita "Sesión no válida o vencida" en Electron si hay token viejo
  // ==========================================================

  useEffect(() => {
    if (!apiUrl) return;
    let cancelado = false;
    const validar = async () => {
      const token = localStorage.getItem('POS_SESSION_TOKEN');
      if (!token) return;
      try {
        const res = await fetch(`${apiUrl}/api/sesion/validar`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelado) return;
        if (!res.ok) {
          localStorage.removeItem('POS_SESSION_TOKEN');
          window.dispatchEvent(new CustomEvent('pos-sesion-vencida'));
        }
      } catch {
        localStorage.removeItem('POS_SESSION_TOKEN');
        window.dispatchEvent(new CustomEvent('pos-sesion-vencida'));
      }
    };
    validar();
    return () => { cancelado = true; };
  }, [apiUrl]);

  // ==========================================================
  // REGISTRAR / VERIFICAR DISPOSITIVO
  // ==========================================================

  useEffect(() => {
    if (!apiUrl) return;
    let cancelado = false;

    const registrar = async () => {
      setVerificandoDispositivo(true);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(`${apiUrl}/api/dispositivo/registrar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(obtenerInfoDispositivo()),
          signal: controller.signal
        });

        clearTimeout(timer);
        if (cancelado) return;

        if (res.ok) {
          const data = await res.json();
          if (data.empresaId || data.tenantId) {
            localStorage.setItem('POS_TENANT_ID', String(data.tenantId || data.empresaId));
          }
          setDispositivoActivado(Boolean(data.activado));
        } else {
          setDispositivoActivado(false);
        }
      } catch (e) {
        console.error('Error verificando dispositivo:', e);
        if (!cancelado) {
          setDispositivoActivado(false);
        }
      } finally {
        if (!cancelado) {
          setVerificandoDispositivo(false);
        }
      }
    };

    registrar();

    return () => {
      cancelado = true;
    };
  }, [apiUrl]);

  // ==========================================================
  // VERIFICAR LICENCIA (FONDO NO BLOQUEANTE)
  // ==========================================================

  useEffect(() => {
    if (!apiUrl) return;
    let cancelado = false;

    const verificar = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${apiUrl}/api/licencia/verificar`, { signal: controller.signal });
        clearTimeout(timer);
        if (cancelado) return;
        if (res.ok) {
          const data = await res.json();
          setEstadoLicencia(data);
        }
      } catch (e) {
        console.warn('Verificación de licencia omitida:', e);
      } finally {
        if (!cancelado) setVerificandoLicencia(false);
      }
    };

    verificar();

    return () => {
      cancelado = true;
    };
  }, [apiUrl, intentoVerificacion]);

  const verificarLicenciaSistema = () => {
    setIntentoVerificacion((valor) => valor + 1);
  };

  // ==========================================================
  // CONTROL DE INACTIVIDAD
  // ==========================================================

  useEffect(() => {
    if (!usuario) return;
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        toastAviso('🔒 Sesión cerrada por inactividad.');
        resetSesion();
      }, TIEMPO_INACTIVIDAD);
    };

    const eventos = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    eventos.forEach((evento) => window.addEventListener(evento, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      eventos.forEach((evento) => window.removeEventListener(evento, resetTimer));
    };
  }, [usuario]);

  useEffect(() => {
    const handler = () => {
      setUsuario(null);
    };
    window.addEventListener('pos-sesion-vencida', handler);
    return () => {
      window.removeEventListener('pos-sesion-vencida', handler);
    };
  }, []);

  // ==========================================================
  // ESTADO DE RED
  // ==========================================================

  useEffect(() => {
    const off = () => {
      setServidorOnline(false);
    };
    const on = () => {
      setServidorOnline(true);
    };
    window.addEventListener('pos-red-offline', off);
    window.addEventListener('pos-red-online', on);
    return () => {
      window.removeEventListener('pos-red-offline', off);
      window.removeEventListener('pos-red-online', on);
    };
  }, []);

  // ==========================================================
  // CERRAR SESIÓN
  // ==========================================================

  const resetSesion = () => {
    borrarSesion();
    setUsuario(null);
    setViendoKDS(null);
  };

  // ==========================================================
  // CAMBIAR SERVIDOR
  // ==========================================================

  const limpiarServidor = () => {
    if (esElectronApp()) {
      clearApiUrl();
      setApiUrl('');
    } else {
      setApiUrl(window.location.origin);
    }
    setVerificandoLicencia(false);
    setConfigCargada(false);
    setConfigSistema(null);
    setServidorOnline(false);
    setDispositivoActivado(null);
    setVistaActiva('landing');
  };

  useEffect(() => {
    const handler = () => {
      setUsuario(null);
    };
    window.addEventListener('pos-sesion-vencida', handler);
    return () => {
      window.removeEventListener('pos-sesion-vencida', handler);
    };
  }, []);

  // ==========================================================
  // SIN SERVIDOR CONFIGURADO
  // ==========================================================

  if (!apiUrl) {
    if (!esElectronApp()) {
      setApiUrl(window.location.origin);
    }
    return (
      <>
        <ToastContainer />
        <ConfigurarIP
          alGuardar={(ip) => {
            const urlFinal = guardarApiUrl(ip);
            setApiUrl(urlFinal || ip);
          }}
        />
      </>
    );
  }

  // ==========================================================
  // VERIFICANDO LICENCIA
  // ==========================================================

  if (verificandoLicencia) {
    return <div className="app-loading">Cargando...</div>;
  }

  // No mostrar LoginScreen mientras todavía se resuelven el dispositivo y la
  // configuración. Evita el parpadeo de login antes de LandingScreen.
  if (verificandoDispositivo || !configCargada) {
    return <div className="app-loading">Cargando...</div>;
  }

  // ==========================================================
  // LICENCIA BLOQUEADA
  // ==========================================================

  if (
    estadoLicencia.bloqueado &&
    (
      !usuario ||
      usuario.rol !== 'Administrador'
    )
  ) {

    return (
      <>
        <ToastContainer />

        <BloqueoLicencia
          motivo={estadoLicencia.motivo}
          contacto={estadoLicencia.contacto}
          apiUrl={apiUrl}
          alIniciarSesionAdmin={(d) => {

            guardarSesion(d.token);

            setUsuario(d.usuario);
          }}
        />
      </>
    );
  }

  // ==========================================================
  // KDS SELECCIONADO
  // ==========================================================

  if (viendoKDS) {

    return (
      <>
        <ToastContainer />

        <PantallaKDS
          tipo={viendoKDS}
          alSalir={resetSesion}
          apiUrl={apiUrl}
        />
      </>
    );
  }

  // ==========================================================
  // USUARIO AUTENTICADO
  // ==========================================================

  if (usuario) {

    if (usuario.requiereCambioPin) {
      return <CambioPinObligatorio onGuardar={cambiarPinObligatorio} />;
    }

    if (usuario.rol === 'Cocina') {

      return (
        <>
          <ToastContainer />

          <PantallaKDS
            tipo="Cocina"
            alSalir={resetSesion}
            apiUrl={apiUrl}
          />
        </>
      );
    }

    if (usuario.rol === 'Bar') {

      return (
        <>
          <ToastContainer />

          <PantallaKDS
            tipo="Bar"
            alSalir={resetSesion}
            apiUrl={apiUrl}
          />
        </>
      );
    }

    if (usuario.rol === 'Administrador') {

      return (
        <>
          <ToastContainer />

          <PanelAdmin
            usuario={usuario}
            configSistema={configSistema}
            alVolver={() => {
              resetSesion();
              verificarLicenciaSistema();
            }}
            apiUrl={apiUrl}
            alVerificarLicencia={verificarLicenciaSistema}
          />
        </>
      );
    }

    if (usuario.rol === 'Cajero') {

      return (
        <>
          <ToastContainer />

          <PantallaCaja
            usuario={usuario}
            alCerrarSesion={resetSesion}
            apiUrl={apiUrl}
          />
        </>
      );
    }

    return (
      <>
        <ToastContainer />
        <MapaMesas
          usuario={usuario}
          alCerrarSesion={resetSesion}
          apiUrl={apiUrl}
          configSistema={configSistema}
        />
      </>
    );
  }

  // ==========================================================
  // PANEL DEL PROPIETARIO (ACCESO UNIVERSAL)
  // ==========================================================

  if (vistaDueno) {
    return (
      <>
        <ToastContainer />
        <PanelDueno
          apiUrl={apiUrl}
          config={configSistema}
          alVolver={() => {
            navegarRuta('/landingscreen');
          }}
        />
      </>
    );
  }

  // ==========================================================
  // WIZARD DE SETUP
  // ==========================================================

  if (
    vistaSetup === 'wizard' &&
    configSistema
  ) {
    return (
      <>
        <ToastContainer />
        <WizardSetup
          apiUrl={apiUrl}
          config={configSistema}
          configRegistro={registroCliente}
          alCompletado={async (datos) => {
            const devId = obtenerDeviceId();
            try {
              const res = await fetch(`${apiUrl}/api/configuracion/sistema`, {
                headers: { 'X-Device-ID': devId }
              });
              if (res.ok) {
                const nuevaConfig = await res.json();
                setConfigSistema(nuevaConfig);
                aplicarPersonalizacion(nuevaConfig);
                window.dispatchEvent(new CustomEvent('configuracion-sistema-actualizada', { detail: nuevaConfig }));
              } else {
                setConfigSistema((prev) => ({ ...prev, setup_completado: true, ...(datos?.configuracion || {}) }));
              }
            } catch {
              setConfigSistema((prev) => ({ ...prev, setup_completado: true, ...(datos?.configuracion || {}) }));
            }
            setDispositivoActivado(true);
            setVistaSetup(null);
            setVistaActiva('login');
            setRegistroCliente(null);
            navegarRuta('/login');
          }}
        />
      </>
    );
  }

  // ==========================================================
  // REGISTRO INICIAL (SOLICITUD DE LICENCIA)
  // ==========================================================

  if (vistaSetup === 'registro') {
    return (
      <>
        <ToastContainer />
        <WelcomeScreen
          apiUrl={apiUrl}
          config={configSistema}
          planSeleccionado={planSeleccionado}
          alContinuar={(datos) => {
            setRegistroCliente(datos);
            setVistaSetup('wizard');
          }}
          alVolver={() => {
            setPlanSeleccionado(null);
            navegarRuta('/landingscreen');
          }}
        />
      </>
    );
  }

  if (
    vistaActiva === 'activacion' &&
    !usuario
  ) {
    return (
      <>
        <ToastContainer />
        <ActivacionDispositivo
          apiUrl={apiUrl}
          onVolver={() => navegarRuta('/landingscreen')}
          onSolicitarPlan={() => {
            setPlanSeleccionado(null);
            navegarRuta('/formulario');
          }}
          alActivar={(data) => {
            if (data?.empresaId || data?.tenantId) {
              localStorage.setItem('POS_TENANT_ID', String(data.tenantId || data.empresaId));
            }
            setDispositivoActivado(true);
            fetch(`${apiUrl}/api/configuracion/sistema`, {
              headers: { 'X-Device-ID': obtenerDeviceId() }
            })
              .then((r) => r.json())
              .then((cfg) => {
                setConfigSistema(cfg);
                if (!cfg?.setup_completado) {
                  setVistaSetup('wizard');
                } else {
                  setVistaActiva('login');
                }
              })
              .catch(() => {
                window.location.href = '/';
              });
          }}
          alIniciarSesionAdmin={(d) => {
            iniciarSesion(d);
          }}
        />
      </>
    );
  }

  // ==========================================================
  // PANTALLA DE CARGA DURANTE VERIFICACIÓN INICIAL
  // ==========================================================

  if (verificandoDispositivo) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: '#0a0a0f', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        color: '#fff', fontFamily: 'sans-serif', zIndex: 99999
      }}>
        <div style={{
          width: '54px', height: '54px', borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(245,184,66,0.2), rgba(245,184,66,0.05))',
          border: '1px solid rgba(245,184,66,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.6rem', boxShadow: '0 0 25px rgba(245,184,66,0.2)'
        }}>
          🍽️
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.5px' }}>ChloeRestaurant POS</span>
          <span style={{ fontSize: '0.78rem', color: '#9494ad' }}>Verificando terminal y licencia...</span>
        </div>
      </div>
    );
  }

  // ==========================================================
  // DISPOSITIVO ACTIVADO: MODO OPERATIVO (LOGIN / SALÓN / CAJA / KDS)
  // ==========================================================

  if (
    (dispositivoActivado === true || vistaActiva === 'login') &&
    vistaActiva !== 'landingscreen' &&
    vistaActiva !== 'activacion' &&
    vistaActiva !== 'paneldueno' &&
    vistaSetup !== 'wizard'
  ) {
    return (
      <>
        <ToastContainer />
        <LoginScreen
          apiUrl={apiUrl}
          configSistema={configSistema}
          onLogin={iniciarSesion}
          onVerKDS={(tipo) => {
            navegarRuta(`/kds/${String(tipo || 'Cocina').toLowerCase()}`);
          }}
          servidorOnline={servidorOnline}
          onChangeServer={limpiarServidor}
          onVolver={() => {
            navegarRuta('/landingscreen');
          }}
        />
      </>
    );
  }

  // ==========================================================
  // DISPOSITIVO NO ACTIVADO O VISTA LANDING EXPLÍCITA
  // ==========================================================

  return (
    <>
      <ToastContainer />
      <LandingScreen
        config={configSistema}
        logoUrl={configNegocio?.logo_url}
        apiUrl={apiUrl}
        onAcceder={() => {
          if (dispositivoActivado === true) {
            navegarRuta('/login');
          } else {
            navegarRuta('/activacion');
          }
        }}
        onAccesoPropietario={() => {
          navegarRuta('/paneldueno');
        }}
        onRegistrarse={(plan) => {
          setPlanSeleccionado(plan || null);
          navegarRuta('/formulario');
        }}
      />
    </>
  );
}

function App() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [redOnline, setRedOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const alConectar = () => setRedOnline(true);
    const alDesconectar = () => setRedOnline(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, []);

  useEffect(() => {
    if (!esElectronApp()) return;
    const check = () => {
      window.electronPOS?.estaMaximizada?.().then?.(setIsMaximized);
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <AppContent />

      {!redOnline && (
        <div style={{
          position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 999999, background: 'rgba(239, 68, 68, 0.95)', color: '#fff',
          padding: '10px 20px', borderRadius: '12px', backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          gap: '10px', fontSize: '0.88rem', fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <span>📡</span>
          <span>Sin conexión a internet — Modo de contingencia activo</span>
        </div>
      )}

      {esElectronApp() && (
        <div style={{
          position: 'fixed', top: '10px', right: '10px', zIndex: 99999,
          display: 'flex', gap: '4px', background: 'rgba(20,20,27,0.85)',
          borderRadius: '8px', padding: '4px', border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(8px)', boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}>
          <button onClick={() => window.electronPOS?.minimizarVentana()} title="Minimizar" style={{
            width: '28px', height: '28px', borderRadius: '6px', border: 'none',
            background: 'transparent', color: '#9494ad', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}>─</button>
          <button onClick={() => window.electronPOS?.maximizarVentana()} title={isMaximized ? 'Restaurar' : 'Maximizar'} style={{
            width: '28px', height: '28px', borderRadius: '6px', border: 'none',
            background: 'transparent', color: '#9494ad', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
          }}>{isMaximized ? '❐' : '□'}</button>
          <button onClick={() => window.electronPOS?.cerrarVentana()} title="Cerrar" style={{
            width: '28px', height: '28px', borderRadius: '6px', border: 'none',
            background: 'transparent', color: '#ff5252', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}>✕</button>
        </div>
      )}
    </>
  );
}

export default App;
