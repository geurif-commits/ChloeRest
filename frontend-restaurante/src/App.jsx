import { useState, useEffect } from 'react';

import MapaMesas from './components/MapaMesas';
import PantallaKDS from './components/PantallaKDS';
import PanelAdmin from './components/PanelAdmin';
import BloqueoLicencia from './components/BloqueoLicencia';
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

import { borrarSesion, guardarSesion } from './api.js';

import { obtenerInfoDispositivo } from './utils/dispositivo.js';

import {
  getApiUrl,
  setApiUrl as guardarApiUrl,
  clearApiUrl,
  esElectronApp
} from './configApi.js';

import { aplicarPersonalizacion } from './personalizacion.js';

import './ui/theme/design-system.css';
import './App.css';

const TIEMPO_INACTIVIDAD = 3 * 60 * 1000;

// ============================================================
// APP CONTENT
// ============================================================

function AppContent() {

  const [apiUrl, setApiUrl] = useState(getApiUrl);

  const [configSistema, setConfigSistema] = useState(null);
  const [configCargada, setConfigCargada] = useState(false);

  const [usuario, setUsuario] = useState(null);

  const [viendoKDS, setViendoKDS] = useState(null);

  const [servidorOnline, setServidorOnline] = useState(false);

  const [verificandoLicencia, setVerificandoLicencia] =
    useState(true);

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
    useState('landing');

  const [vistaSetup, setVistaSetup] =
    useState(null);

  const [dispositivoActivado, setDispositivoActivado] =
    useState(null);

  const [verificandoDispositivo, setVerificandoDispositivo] =
    useState(false);

  const [planSeleccionado, setPlanSeleccionado] =
    useState(null);

  const [vistaDueno, setVistaDueno] =
    useState(false);

  // ==========================================================
  // CARGAR CONFIGURACIÓN DEL SISTEMA
  // ==========================================================

  useEffect(() => {

    if (!apiUrl) {
      return;
    }

    let cancelado = false;

    const cargar = async () => {

      try {

        const res = await fetch(
          `${apiUrl}/api/configuracion/sistema`
        );

        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}`
          );
        }

        const data = await res.json();

        if (!cancelado) {
          let negocioData = null;
          try {
            const resNeg = await fetch(`${apiUrl}/api/negocio/config`);
            if (resNeg.ok) negocioData = await resNeg.json();
          } catch {}

          setConfigSistema(data);
          setServidorOnline(true);

          aplicarPersonalizacion(data, negocioData);
        }

      } catch (e) {

        console.error(
          'Error cargando configuración:',
          e
        );

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

  }, [apiUrl]);

  // ==========================================================
  // REGISTRAR / VERIFICAR DISPOSITIVO
  // ==========================================================

  useEffect(() => {

    if (!apiUrl) {
      return;
    }

    let cancelado = false;

    const registrar = async () => {

      setVerificandoDispositivo(true);

      try {

        // Timeout de 8s para que no quede colgado en Electron
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          8000
        );

        const res = await fetch(
          `${apiUrl}/api/dispositivo/registrar`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(
              obtenerInfoDispositivo()
            ),
            signal: controller.signal
          }
        );

        clearTimeout(timer);

        if (cancelado) {
          return;
        }

        if (res.ok) {

          const data = await res.json();

          setDispositivoActivado(
            !!data.activado
          );

        } else {

          setDispositivoActivado(null);
        }

      } catch (e) {

        console.error(
          'Error verificando dispositivo:',
          e
        );

        if (!cancelado) {
          setDispositivoActivado(null);
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
  // VERIFICAR LICENCIA
  // ==========================================================

  useEffect(() => {

    if (!apiUrl) {
      return;
    }

    let cancelado = false;

    const MAX_INTENTOS = 10;

    const verificar = async () => {

      setVerificandoLicencia(true);

      let intentos = 0;

      while (
        !cancelado &&
        intentos < MAX_INTENTOS
      ) {

        try {

          intentos++;

          // Timeout de 8s por intento para que Electron no quede
          // colgado si el backend tarda o no responde.
          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            8000
          );

          const res = await fetch(
            `${apiUrl}/api/licencia/verificar`,
            { signal: controller.signal }
          );

          clearTimeout(timer);

          if (cancelado) {
            return;
          }

          if (res.ok) {

            const data = await res.json();

            setEstadoLicencia(data);
            setVerificandoLicencia(false);

            return;
          }

          setVerificandoLicencia(false);

          return;

        } catch (e) {

          if (intentos >= MAX_INTENTOS) {

            console.error(
              'No se pudo verificar la licencia:',
              e
            );

            setVerificandoLicencia(false);

            return;
          }

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                Math.min(
                  2000 * intentos,
                  30000
                )
              )
          );
        }
      }
    };

    verificar();

    return () => {
      cancelado = true;
    };

  }, [apiUrl, intentoVerificacion]);

  // ==========================================================
  // REINTENTAR LICENCIA
  // ==========================================================

  const verificarLicenciaSistema = () => {
    setIntentoVerificacion(
      (valor) => valor + 1
    );
  };

  // ==========================================================
  // CONTROL DE INACTIVIDAD
  // ==========================================================

  useEffect(() => {

    if (!usuario) {
      return;
    }

    let timer;

    const resetTimer = () => {

      clearTimeout(timer);

      timer = setTimeout(() => {

        toastAviso(
          '🔒 Sesión cerrada por inactividad.'
        );

        resetSesion();

      }, TIEMPO_INACTIVIDAD);
    };

    const eventos = [
      'mousemove',
      'mousedown',
      'keypress',
      'touchstart',
      'scroll'
    ];

    eventos.forEach(
      (evento) =>
        window.addEventListener(
          evento,
          resetTimer
        )
    );

    resetTimer();

    return () => {

      clearTimeout(timer);

      eventos.forEach(
        (evento) =>
          window.removeEventListener(
            evento,
            resetTimer
          )
      );

    };

  }, [usuario]);

  // ==========================================================
  // SESIÓN VENCIDA
  // ==========================================================

  useEffect(() => {

    const handler = () => {
      setUsuario(null);
    };

    window.addEventListener(
      'pos-sesion-vencida',
      handler
    );

    return () => {
      window.removeEventListener(
        'pos-sesion-vencida',
        handler
      );
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

    window.addEventListener(
      'pos-red-offline',
      off
    );

    window.addEventListener(
      'pos-red-online',
      on
    );

    return () => {

      window.removeEventListener(
        'pos-red-offline',
        off
      );

      window.removeEventListener(
        'pos-red-online',
        on
      );

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

      // En la versión web el servidor SIEMPRE es el mismo origen:
      // nunca debe mostrarse la pantalla de configuración de red.
      setApiUrl(window.location.origin);
    }

    setVerificandoLicencia(false);

    setConfigCargada(false);

    setConfigSistema(null);

    setServidorOnline(false);

    setDispositivoActivado(null);

    setVistaActiva('landing');
  };

  // ==========================================================
  // SIN SERVIDOR CONFIGURADO
  // ==========================================================

  if (!apiUrl) {

    if (!esElectronApp()) {

      // La configuración de red es exclusiva de la versión
      // Electron (desktop). En web se usa el mismo origen.
      setApiUrl(window.location.origin);
    }

    return (
      <>
        <ToastContainer />

        <ConfigurarIP
          alGuardar={(ip) => {

            const urlFinal =
              guardarApiUrl(ip);

            setApiUrl(
              urlFinal || ip
            );

          }}
        />
      </>
    );
  }

  // ==========================================================
  // VERIFICANDO LICENCIA
  // ==========================================================

  if (verificandoLicencia) {

    return (
      <>
        <ToastContainer />

        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-base)'
          }}
        >

          <div
            style={{
              textAlign: 'center'
            }}
          >

            <div
              style={{
                fontSize: '2rem',
                marginBottom: 'var(--space-lg)'
              }}
            >
              🍽️
            </div>

            <p
              style={{
                color: 'var(--muted)'
              }}
            >
              Verificando licencia...
            </p>

          </div>

        </div>
      </>
    );
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
            alVolver={() => {

              resetSesion();

              verificarLicenciaSistema();
            }}
            apiUrl={apiUrl}
            alVerificarLicencia={
              verificarLicenciaSistema
            }
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
            setVistaDueno(false);
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
          alCompletado={() => {

            setVistaSetup(null);
            setRegistroCliente(null);

            window.location.reload();
          }}
        />
      </>
    );
  }

  // ==========================================================
  // SETUP INICIAL
  // ==========================================================

  if (
    configCargada &&
    configSistema &&
    !configSistema.setup_completado &&
    !vistaSetup
  ) {

    setVistaSetup('registro');
  }

  // ==========================================================
  // REGISTRO INICIAL
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

            setVistaSetup(null);
          }}
        />
      </>
    );
  }

  // ==========================================================
  // DISPOSITIVO SIN ACTIVAR
  // (se muestra cuando el usuario intenta acceder/registrarse
  //  desde un dispositivo que aún no está activado)
  // ==========================================================

  if (
    vistaActiva === 'activacion' &&
    configCargada &&
    configSistema?.setup_completado &&
    !usuario &&
    !verificandoDispositivo &&
    dispositivoActivado === false
  ) {

    return (
      <>
        <ToastContainer />

        <ActivacionDispositivo
          apiUrl={apiUrl}
          onSolicitarPlan={() => {

            setPlanSeleccionado(null);

            setVistaActiva('landing');

            setVistaSetup('registro');
          }}
          alIniciarSesionAdmin={(d) => {

            guardarSesion(d.token);

            setDispositivoActivado(true);

            setVistaActiva('landing');

            setUsuario(d.usuario);
          }}
        />
      </>
    );
  }

  // ==========================================================
  // LOGIN
  // ==========================================================

  if (vistaActiva === 'login') {

    return (
      <>
        <ToastContainer />

        <LoginScreen
          apiUrl={apiUrl}
          configSistema={configSistema}
          onLogin={(data) => {

            guardarSesion(data.token);

            setDispositivoActivado(true);

            setUsuario(data.usuario);

            setVistaActiva('landing');
          }}
          onVerKDS={(tipo) => {
            setViendoKDS(tipo);
          }}
          servidorOnline={servidorOnline}
          onChangeServer={limpiarServidor}
          onVolver={() => {
            setVistaActiva('landing');
          }}
        />
      </>
    );
  }

  // ==========================================================
  // LANDING
  // ==========================================================

  // Si el dispositivo ya tiene licencia activa y el setup está
  // completado, saltamos el LandingScreen y vamos directo al login.
  if (
    configCargada &&
    configSistema?.setup_completado &&
    dispositivoActivado === true &&
    !verificandoDispositivo
  ) {

    return (
      <>
        <ToastContainer />

        <LoginScreen
          apiUrl={apiUrl}
          configSistema={configSistema}
          onLogin={(data) => {

            guardarSesion(data.token);

            setDispositivoActivado(true);

            setUsuario(data.usuario);

            setVistaActiva('landing');
          }}
          onVerKDS={(tipo) => {
            setViendoKDS(tipo);
          }}
          servidorOnline={servidorOnline}
          onChangeServer={limpiarServidor}
          onVolver={() => {
            setVistaActiva('landing');
          }}
        />
      </>
    );
  }

  if (configCargada) {

    return (
      <>
        <ToastContainer />

        <LandingScreen
          config={configSistema}
          apiUrl={apiUrl}

          onAcceder={() => {
            if (
              configSistema?.setup_completado &&
              !verificandoDispositivo &&
              dispositivoActivado === false
            ) {
              setVistaActiva('activacion');
              return;
            }
            setVistaActiva('login');
          }}

          onAccesoPropietario={() => {
            setVistaDueno(true);
          }}

          onRegistrarse={(plan) => {
            const esWebPublica = window.location.protocol !== 'file:';
            if (
              !esWebPublica &&
              configSistema?.setup_completado &&
              !verificandoDispositivo &&
              dispositivoActivado === false
            ) {
              setPlanSeleccionado(plan || null);
              setVistaActiva('activacion');
              return;
            }
            setPlanSeleccionado(plan || null);
            setVistaSetup('registro');
          }}
        />
      </>
    );
  }

  // ==========================================================
  // FALLBACK
  // ==========================================================

  return (
    <>
      <ToastContainer />

      <LoginScreen
        apiUrl={apiUrl}
        configSistema={configSistema}
        onLogin={(data) => {

          guardarSesion(data.token);

          setDispositivoActivado(true);

          setUsuario(data.usuario);
        }}
        onVerKDS={(tipo) => {
          setViendoKDS(tipo);
        }}
        servidorOnline={servidorOnline}
        onChangeServer={limpiarServidor}
      />
    </>
  );
}

// ============================================================
// APP
// ============================================================

function App() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!esElectronApp()) return;
    const check = () => {
      window.electronPOS?.estaMaximizada?.().then?.(setIsMaximized);
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  if (!esElectronApp()) return <AppContent />;

  return (
    <>
      <AppContent />
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
    </>
  );
}

export default App;