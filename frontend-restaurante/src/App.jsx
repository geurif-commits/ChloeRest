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
import UpdateBanner from './components/UpdateBanner.jsx';
import { toastAviso } from './components/Toast.jsx';

import { borrarSesion, cerrarSesionServidor, guardarSesion, obtenerSesion } from './api.js';
import { obtenerInfoDispositivo, obtenerDeviceId } from './utils/dispositivo.js';

import {
  getApiUrl,
  setApiUrl as guardarApiUrl,
  clearApiUrl,
  esElectronApp
} from './configApi.js';

import { aplicarPersonalizacion } from './personalizacion.js';

import './ui/theme/tokens.css';
import './App.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './ui/premium/premium-tokens.css';
import './ui/premium/premium-base.css';
import './ui/premium/premium-modal.css';
import './ui/premium/premium-admin.css';
import './ui/premium/premium-gates.css';
import './ui/premium/premium-skins.css';

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

import { ShieldAlert, UtensilsCrossed, WifiOff, Minus, Square, Copy, X } from 'lucide-react';
import PinPad from './components/PinPad.jsx';

function PantallaCarga({ texto }) {
  return (
    <div className="gate" role="status" aria-live="polite">
      <div className="gate__loading">
        <span className="gate__badge"><UtensilsCrossed size={26} /></span>
        <strong style={{ fontFamily: 'var(--px-font-display)', fontSize: '1.25rem', color: 'var(--px-ink)', fontWeight: 600 }}>ChloeRestaurant POS</strong>
        <span>{texto}</span>
      </div>
    </div>
  );
}

function CambioPinObligatorio({ onGuardar }) {
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Paso 1: nuevo PIN. Paso 2: confirmación. Se avanza solo al completar 6 dígitos.
  const confirmando = pin.length === 6;
  const actual = confirmando ? confirmacion : pin;

  const guardar = async (confirmado) => {
    if (pin !== confirmado) {
      setError('Los dos PIN no coinciden. Vuelve a intentarlo.');
      setPin('');
      setConfirmacion('');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar(pin);
    } catch (e) {
      setError(e.message || 'Error al actualizar el PIN.');
      setPin('');
      setConfirmacion('');
    } finally {
      setGuardando(false);
    }
  };

  const agregar = (digito) => {
    if (guardando) return;
    setError('');
    if (!confirmando) {
      setPin((p) => (p.length < 6 ? p + digito : p));
      return;
    }
    const siguiente = confirmacion + digito;
    if (siguiente.length > 6) return;
    setConfirmacion(siguiente);
    if (siguiente.length === 6) guardar(siguiente);
  };

  const borrar = () => {
    if (guardando) return;
    if (confirmando) {
      if (confirmacion.length > 0) setConfirmacion((c) => c.slice(0, -1));
      else setPin((p) => p.slice(0, -1));
    } else {
      setPin((p) => p.slice(0, -1));
    }
  };

  return (
    <div className="gate required-pin-screen">
      <div className="gate__card required-pin-card">
        <span className="gate__badge"><ShieldAlert size={28} /></span>
        <span className="px-eyebrow">Seguridad de la cuenta</span>
        <h2>Cambio obligatorio de PIN</h2>
        <p className="gate__lead">
          Por seguridad, reemplaza el PIN temporal por un <strong>PIN confidencial de 6 dígitos</strong>.
          {' '}{confirmando ? 'Ahora confírmalo.' : 'Ingresa tu nuevo PIN.'}
        </p>
        <PinPad
          value={actual}
          length={6}
          error={error}
          disabled={guardando}
          onDigit={agregar}
          onDelete={borrar}
        />
        <p className="gate__note">
          {guardando ? 'Guardando nuevo PIN…' : confirmando ? 'Paso 2 de 2 · Confirmar PIN' : 'Paso 1 de 2 · Nuevo PIN'}
        </p>
      </div>
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
      // Login unificado: el token del dueño también queda disponible para el
      // PanelDueno (que lee POS_DUENO_TOKEN), evitando un segundo login.
      localStorage.setItem('POS_DUENO_TOKEN', data.tokenDueno);
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
    let destino = normalizarRuta(ruta);
    // El dueño nunca entra al sistema operativo directo; todo lo redirige al panel.
    const esDueno = usuario && (usuario.rol === 'Dueno' || usuario.esDueno);
    if (
      esDueno &&
      (destino === '/app' || destino === '/admin' || destino === '/caja' || destino.startsWith('/kds'))
    ) {
      destino = '/paneldueno';
    }
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
    // Mostrar ventana en Electron al montar la app (arranque silencioso -> visible bajo demanda)
    if (esElectronApp && window.electronPOS?.mostrarVentana) {
      window.electronPOS.mostrarVentana();
    }
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
  }, [navegarRuta]);

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
    // Revoca la sesión en el servidor (item 7) antes de limpiar el cliente.
    void cerrarSesionServidor(apiUrl);
    borrarSesion();
    setUsuario(null);
    setViendoKDS(null);
    // Todo cierre de sesión vuelve al LoginScreen operativo, nunca a LandingScreen.
    navegarRuta('/login');
  };

  // ==========================================================
  // CAMBIAR SERVIDOR
  // ==========================================================

  const limpiarServidor = () => {
    if (esElectronApp()) {
      clearApiUrl();
      setApiUrl('http://127.0.0.1:3000');
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
      <UpdateBanner />
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
    return <PantallaCarga texto="Cargando…" />;
  }

  // No mostrar LoginScreen mientras todavía se resuelven el dispositivo y la
  // configuración. Evita el parpadeo de login antes de LandingScreen.
  if (verificandoDispositivo || !configCargada) {
    return <PantallaCarga texto="Verificando terminal y licencia…" />;
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
      <UpdateBanner />

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
      <UpdateBanner />

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

    if (usuario.rol === 'Dueno' || usuario.esDueno) {
      return (
        <>
          <ToastContainer />
      <UpdateBanner />
          <PanelDueno
            apiUrl={apiUrl}
            config={configSistema}
            alVolver={resetSesion}
          />
        </>
      );
    }

    if (usuario.requiereCambioPin) {
      return <CambioPinObligatorio onGuardar={cambiarPinObligatorio} />;
    }

    if (usuario.rol === 'Cocina') {

      return (
        <>
          <ToastContainer />
      <UpdateBanner />

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
      <UpdateBanner />

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
      <UpdateBanner />

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
      <UpdateBanner />

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
      <UpdateBanner />
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
      <UpdateBanner />
<PanelDueno
          apiUrl={apiUrl}
          config={configSistema}
          alVolver={resetSesion}
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
      <UpdateBanner />
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
      <UpdateBanner />
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
      <UpdateBanner />
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
    return <PantallaCarga texto="Verificando terminal y licencia…" />;
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
      <UpdateBanner />
<LoginScreen
          apiUrl={apiUrl}
          configSistema={configSistema}
          onLogin={iniciarSesion}
          onVerKDS={(tipo) => {
            navegarRuta(`/kds/${String(tipo || 'Cocina').toLowerCase()}`);
          }}
          servidorOnline={servidorOnline}
          onChangeServer={limpiarServidor}
          onVolver={
            dispositivoActivado === true
              ? undefined
              : () => {
                  navegarRuta('/landingscreen');
                }
          }
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
      <UpdateBanner />
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
    if (esElectronApp()) document.documentElement.classList.add('is-electron');
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
        <div className="px-offline" role="alert">
          <WifiOff size={17} />
          <span>Sin conexión a internet — modo de contingencia activo</span>
        </div>
      )}

      {esElectronApp() && (
        <div className="px-winctl" role="group" aria-label="Controles de ventana">
          <button type="button" onClick={() => window.electronPOS?.minimizarVentana()} title="Minimizar" aria-label="Minimizar"><Minus size={15} /></button>
          <button type="button" onClick={() => window.electronPOS?.maximizarVentana()} title={isMaximized ? 'Restaurar' : 'Maximizar'} aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}>{isMaximized ? <Copy size={13} /> : <Square size={13} />}</button>
          <button type="button" className="px-winctl__close" onClick={() => window.electronPOS?.cerrarVentana()} title="Cerrar" aria-label="Cerrar"><X size={15} /></button>
        </div>
      )}
    </>
  );
}

export default App;
