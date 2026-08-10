import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChefHat,
  Clock3,
  Delete,
  LockKeyhole,
  MonitorCog,
  Server,
  Settings,
  ShieldCheck,
  Store,
  Utensils,
  Wine,
} from 'lucide-react';

import { toastError } from '../../components/Toast.jsx';
import './login-screen.css';

const PIN_LENGTH = 4;

function Icon({ children, className = '' }) {
  return (
    <span className={`login-icon ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}

export default function LoginScreen({
  apiUrl,
  configSistema,
  onLogin,
  onVerKDS,
  servidorOnline,
  onChangeServer,
}) {
  const [pin, setPin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [sistemaInfo, setSistemaInfo] = useState(null);
  const [time, setTime] = useState(new Date());

  const nombreNegocio =
    configSistema?.nombre_negocio || 'Chloe Restaurant';

  const logoUrl =
    configSistema?.logo_url || '';

  const slogan =
    configSistema?.slogan ||
    'Sistema de gestión para restaurantes';

  const bgFondo =
    configSistema?.fondo_login_url;

  const hostServidor = useMemo(() => {
    try {
      return new URL(apiUrl).hostname;
    } catch {
      return apiUrl || 'Sin configurar';
    }
  }, [apiUrl]);

  /* ================================================================
     RELOJ
     ================================================================ */

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /* ================================================================
     INFORMACIÓN DEL SISTEMA
     ================================================================ */

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/sistema/info`);

        if (res.ok && activo) {
          setSistemaInfo(await res.json());
        }
      } catch {
        /*
         * La información secundaria no debe impedir
         * el acceso al sistema.
         */
      }
    };

    cargar();

    const interval = setInterval(cargar, 30000);

    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  /* ================================================================
     LOGIN
     ================================================================ */

  const iniciarSesion = useCallback(
    async (pinAEnviar) => {
      if (cargando) return;

      setCargando(true);

      try {
        const res = await fetch(`${apiUrl}/api/login/camarero`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pin: pinAEnviar,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          onLogin({
            token: data.token,
            usuario: data.usuario,
          });
        } else {
          toastError(
            data.error || 'PIN incorrecto'
          );

          setPin('');
        }
      } catch {
        toastError(
          'No fue posible conectar con el servidor'
        );

        setPin('');
      } finally {
        setCargando(false);
      }
    },
    [apiUrl, cargando, onLogin]
  );

  /* ================================================================
     TECLADO
     ================================================================ */

  const agregarNumero = useCallback(
    (numero) => {
      if (cargando) return;

      setPin((actual) => {
        if (actual.length >= PIN_LENGTH) {
          return actual;
        }

        return `${actual}${numero}`;
      });
    },
    [cargando]
  );

  const borrarNumero = useCallback(() => {
    if (cargando) return;

    setPin((actual) => actual.slice(0, -1));
  }, [cargando]);

  /* ================================================================
     TECLADO FÍSICO
     ================================================================ */

  useEffect(() => {
    const handler = (event) => {
      if (
        event.key >= '0' &&
        event.key <= '9'
      ) {
        agregarNumero(event.key);
      }

      if (
        event.key === 'Backspace' ||
        event.key === 'Delete'
      ) {
        borrarNumero();
      }

      if (event.key === 'Escape' && !cargando) {
        setPin('');
      }
    };

    window.addEventListener(
      'keydown',
      handler
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handler
      );
    };
  }, [
    agregarNumero,
    borrarNumero,
    cargando,
  ]);

  /* ================================================================
     LOGIN AUTOMÁTICO AL COMPLETAR PIN
     ================================================================ */

  useEffect(() => {
    if (
      pin.length === PIN_LENGTH &&
      !cargando
    ) {
      iniciarSesion(pin);
    }
  }, [
    pin,
    cargando,
    iniciarSesion,
  ]);

  /* ================================================================
     FECHA / HORA
     ================================================================ */

  const hora = time.toLocaleTimeString(
    'es-DO',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }
  );

  const fecha = time.toLocaleDateString(
    'es-DO',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
  );

  /* ================================================================
     ESTADOS
     ================================================================ */

  const cajaAbierta =
    Boolean(sistemaInfo?.caja?.abierta);

  const version =
    sistemaInfo?.version || '2.0.0';

  const sucursal =
    sistemaInfo?.sucursal ||
    'No configurada';

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <main className="premium-login">

      {/* ============================================================
          FONDO
      ============================================================ */}

      <div
        className="premium-login__background"
        style={
          bgFondo
            ? {
                backgroundImage: `url(${bgFondo})`,
              }
            : undefined
        }
      />

      <div className="premium-login__overlay" />

      <div className="premium-login__spark premium-login__spark--one" />
      <div className="premium-login__spark premium-login__spark--two" />

      {/* ============================================================
          TOP BAR
      ============================================================ */}

      <header className="premium-login__topbar">

        <div className="premium-login__appname">
          <Icon>
            <Utensils size={17} strokeWidth={2} />
          </Icon>

          <span>
            {nombreNegocio} POS
          </span>
        </div>

        <button
          type="button"
          className="server-selector"
          onClick={onChangeServer}
          title="Cambiar servidor"
        >
          <span
            className={`server-selector__dot ${
              servidorOnline
                ? 'is-online'
                : ''
            }`}
          />

          <span className="server-selector__content">
            <strong>
              {servidorOnline
                ? 'Servidor conectado'
                : 'Servidor desconectado'}
            </strong>

            <small>
              {hostServidor}
            </small>
          </span>

          <Settings
            size={16}
            className="server-selector__gear"
          />
        </button>

      </header>

      {/* ============================================================
          CONTENIDO PRINCIPAL
      ============================================================ */}

      <div className="premium-login__layout">

        {/* ==========================================================
            COLUMNA IZQUIERDA
        ========================================================== */}

        <section
          className="premium-login__welcome"
        >

          <div className="brand-mark">

            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`Logo de ${nombreNegocio}`}
              />
            ) : (
              <span>
                CR
              </span>
            )}

          </div>

          <h1>
            {nombreNegocio}
          </h1>

          <p className="premium-login__slogan">
            {slogan}
          </p>

          <span className="gold-rule" />

          {/* ========================================================
              RELOJ
          ======================================================== */}

          <div className="clock-card">

            <div className="clock-card__icon">
              <Clock3
                size={27}
                strokeWidth={1.7}
              />
            </div>

            <div>
              <strong>
                {hora}
              </strong>

              <span>
                {fecha}
              </span>
            </div>

          </div>

          {/* ========================================================
              ESTADOS
          ======================================================== */}

          <div className="status-stack">

            <StatusItem
              icon={
                <Server size={19} />
              }
              label="Servidor"
              value={
                servidorOnline
                  ? 'En línea'
                  : 'Sin conexión'
              }
              ok={servidorOnline}
            />

            <StatusItem
              icon={
                <Store size={19} />
              }
              label="Caja"
              value={
                cajaAbierta
                  ? 'Disponible'
                  : 'Cerrada'
              }
              ok={cajaAbierta}
            />

            <StatusItem
              icon={
                <MonitorCog size={19} />
              }
              label="Versión"
              value={`v${version}`}
            />

            <StatusItem
              icon={
                <Utensils size={19} />
              }
              label="Sucursal"
              value={sucursal}
            />

          </div>

        </section>

        {/* ==========================================================
            LOGIN
        ========================================================== */}

        <section
          className={`login-access-card ${
            cargando
              ? 'is-loading'
              : ''
          }`}
          aria-label="Acceso al sistema"
        >

          <div className="login-access-card__header">

            <div className="login-access-card__lock">
              <LockKeyhole
                size={29}
                strokeWidth={1.8}
              />
            </div>

            <div>
              <span className="login-access-card__eyebrow">
                Acceso seguro
              </span>

              <h2>
                Iniciar sesión
              </h2>

              <p>
                Ingresa tu PIN de acceso
              </p>
            </div>

          </div>

          {/* ========================================================
              PIN
          ======================================================== */}

          <div
            className="pin-dots"
            aria-label={`${pin.length} de ${PIN_LENGTH} dígitos ingresados`}
          >
            {Array.from(
              { length: PIN_LENGTH },
              (_, index) => (
                <span
                  key={index}
                  className={
                    pin.length > index
                      ? 'is-filled'
                      : ''
                  }
                />
              )
            )}
          </div>

          {/* ========================================================
              TECLADO
          ======================================================== */}

          <div
            className="premium-keypad"
            aria-label="Teclado numérico"
          >

            {[
              '1',
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
            ].map((numero) => (
              <button
                type="button"
                key={numero}
                onClick={() =>
                  agregarNumero(numero)
                }
                disabled={cargando}
                aria-label={`Número ${numero}`}
              >
                {numero}
              </button>
            ))}

            <span
              className="premium-keypad__empty"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={() =>
                agregarNumero('0')
              }
              disabled={cargando}
              aria-label="Número 0"
            >
              0
            </button>

            <button
              type="button"
              className="premium-keypad__erase"
              onClick={borrarNumero}
              disabled={
                cargando ||
                pin.length === 0
              }
              aria-label="Borrar último dígito"
            >
              <Delete
                size={25}
                strokeWidth={2}
              />
            </button>

          </div>

          {/* ========================================================
              ESTADO DE CARGA
          ======================================================== */}

          <div className="login-access-card__status">

            {cargando ? (
              <>
                <span className="loading-dot" />
                Verificando acceso…
              </>
            ) : (
              <>
                <ShieldCheck
                  size={15}
                />
                Sistema seguro y protegido
              </>
            )}

          </div>

          {/* ========================================================
              DIVISOR
          ======================================================== */}

          <div className="login-access-card__divider" />

          {/* ========================================================
              KDS
          ======================================================== */}

          <div className="kds-shortcuts">

            <button
              type="button"
              className="kds-shortcut kds-shortcut--kitchen"
              onClick={() =>
                onVerKDS('Cocina')
              }
            >

              <span className="kds-shortcut__icon">
                <ChefHat
                  size={28}
                  strokeWidth={1.8}
                />
              </span>

              <span>
                <strong>
                  Pantalla cocina
                </strong>

                <small>
                  Ver pedidos
                </small>
              </span>

            </button>

            <button
              type="button"
              className="kds-shortcut kds-shortcut--bar"
              onClick={() =>
                onVerKDS('Bar')
              }
            >

              <span className="kds-shortcut__icon">
                <Wine
                  size={28}
                  strokeWidth={1.8}
                />
              </span>

              <span>
                <strong>
                  Pantalla bar
                </strong>

                <small>
                  Ver pedidos
                </small>
              </span>

            </button>

          </div>

        </section>

      </div>

      {/* ============================================================
          FOOTER
      ============================================================ */}

      <footer className="premium-login__footer">

        <ShieldCheck
          size={14}
        />

        <span>
          Sistema seguro y protegido
        </span>

      </footer>

    </main>
  );
}


/* ====================================================================
   STATUS ITEM
   ==================================================================== */

function StatusItem({
  icon,
  label,
  value,
  ok,
}) {
  return (
    <div className="status-item">

      <span className="status-item__icon">
        {icon}
      </span>

      <span className="status-item__content">

        <small>
          {label}
        </small>

        <strong
          className={
            ok === undefined
              ? ''
              : ok
                ? 'is-ok'
                : 'is-off'
          }
        >
          {value}
        </strong>

      </span>

      {ok !== undefined && (
        <span
          className={`status-item__indicator ${
            ok
              ? 'is-ok'
              : 'is-off'
          }`}
        />
      )}

    </div>
  );
}