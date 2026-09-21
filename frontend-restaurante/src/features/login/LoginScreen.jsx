import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  ChefHat,
  Wine,
  Delete,
  Settings,
  MonitorOff,
  MapPin,
  RefreshCw,
  Clock,
  Moon,
  Sun,
  X,
  LogIn,
  LogOut,
  CircleCheck,
  Tablet,
  Wifi,
  WifiOff,
  Fingerprint,
  ArrowLeft,
} from 'lucide-react';
import './login-screen.css';
import { toastError, toastAviso, toastExito } from '../../components/Toast.jsx';
import { obtenerDeviceId } from '../../utils/dispositivo.js';
import { esElectronApp } from '../../configApi.js';
import logoPredeterminado from '../../assets/branding/chloe-logo.png';
import { useTemaLocal } from '../../utils/tema.js';
import { horariosDe, rango, turnoVigente } from '../../utils/turnos.js';
import Screensaver, { TIPOS_PROTECTOR, VistaPreviaProtector } from './Screensaver.jsx';

const PIN_LONGITUD_DEFECTO = 6;
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function iniciales(nombre = '') {
  const p = String(nombre).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}

function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function duracion(minutos = 0) {
  const m = Math.max(0, Math.round(minutos));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

function LoginScreen({
  onLogin,
  configSistema = null,
  apiUrl,
  onChangeServer,
  onVerKDS,
  onVolver = null,
  servidorOnline = true,
}) {
  const [pin, setPin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modo, setModo] = useState('acceso'); // 'acceso' | 'turno'
  // Pantalla KDS pedida desde el acceso rápido: los pedidos exigen sesión, así que primero se pide el PIN.
  const [kdsPendiente, setKdsPendiente] = useState(null); // 'Cocina' | 'Bar' | null
  const [turnoPaso, setTurnoPaso] = useState(null);
  const turnoPinRef = useRef('');
  const [ahora, setAhora] = useState(() => new Date());
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [fallo, setFallo] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [logoActual, setLogoActual] = useState(logoPredeterminado);
  const { esOscuro, alternar: alternarTema } = useTemaLocal();

  const pinLength = useMemo(() => {
    const l = Number(configSistema?.pin_longitud);
    return Number.isInteger(l) && l >= 4 && l <= 8 ? l : PIN_LONGITUD_DEFECTO;
  }, [configSistema?.pin_longitud]);

  /* Reloj en tiempo real */
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  const hora = ahora.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true });
  const fecha = ahora.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  const saludo = ahora.getHours() < 12 ? 'Buenos días' : ahora.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const horarios = horariosDe(configSistema?.turnos_config);
  const turnoActual = turnoVigente(ahora, horarios);

  /* Logo del restaurante */
  useEffect(() => {
    if (configSistema?.logo_url) {
      setLogoActual(configSistema.logo_url.startsWith('http') ? configSistema.logo_url : `${apiUrl}${configSistema.logo_url}`);
    } else {
      setLogoActual(logoPredeterminado);
    }
  }, [configSistema?.logo_url, apiUrl]);

  const fondoMarca = configSistema?.fondo_login_url
    ? (configSistema.fondo_login_url.startsWith('http') ? configSistema.fondo_login_url : `${apiUrl}${configSistema.fondo_login_url}`)
    : null;

  const avisar = useCallback((texto, tipo = '') => setMensaje({ texto, tipo }), []);

  const marcarFallo = useCallback((texto) => {
    avisar(texto, 'error');
    setFallo(true);
    setTimeout(() => setFallo(false), 500);
  }, [avisar]);

  /* Iniciar sesión */
  const iniciarSesion = useCallback(
    async (pinAEnviar) => {
      if (cargando) return;
      setCargando(true);
      avisar('Verificando…');

      try {
        const res = await fetch(`${apiUrl}/api/login/camarero`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pinAEnviar, deviceId: obtenerDeviceId() }),
        });
        const data = await res.json();

        if (res.ok) {
          avisar(`Hola, ${data.usuario?.nombre || data.nombre || ''}`.trim(), 'ok');
          onLogin(data, kdsPendiente);
        } else {
          toastError(data.error || 'PIN de acceso incorrecto');
          marcarFallo(data.error || 'PIN incorrecto.');
          setPin('');
        }
      } catch {
        toastError('No fue posible conectar con el servidor central');
        marcarFallo('Sin conexión con el servidor.');
        setPin('');
      } finally {
        setCargando(false);
      }
    },
    [apiUrl, cargando, onLogin, avisar, marcarFallo, kdsPendiente]
  );

  /* ── Registro de turno (entrada / salida) ── */
  const llamarMarcaje = useCallback(async (pinEnviar, confirmar) => {
    const res = await fetch(`${apiUrl}/api/asistencia/marcar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinEnviar, deviceId: obtenerDeviceId(), confirmar }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo registrar el turno.');
    return data;
  }, [apiUrl]);

  const reiniciarTurno = useCallback(() => {
    turnoPinRef.current = '';
    setTurnoPaso(null);
    setPin('');
    avisar('');
  }, [avisar]);

  const previsualizarTurno = useCallback(async (pinEnviar) => {
    if (cargando) return;
    setCargando(true);
    avisar('Buscando tu registro…');
    try {
      const data = await llamarMarcaje(pinEnviar, false);
      turnoPinRef.current = pinEnviar;
      setTurnoPaso(data);
      avisar('');
    } catch (e) {
      const texto = e.message === 'Failed to fetch' ? 'No fue posible conectar con el servidor central' : e.message;
      toastError(texto);
      marcarFallo(texto);
    } finally {
      setPin('');
      setCargando(false);
    }
  }, [cargando, llamarMarcaje, avisar, marcarFallo]);

  const confirmarTurno = useCallback(async () => {
    if (cargando || !turnoPinRef.current) return;
    setCargando(true);
    try {
      const data = await llamarMarcaje(turnoPinRef.current, true);
      turnoPinRef.current = '';
      setTurnoPaso({ ...data, preview: false, registrado: true });
      toastExito(data.accion === 'entrada' ? 'Entrada registrada.' : 'Salida registrada.');
    } catch (e) {
      toastError(e.message);
      turnoPinRef.current = '';
      setTurnoPaso(null);
    } finally {
      setCargando(false);
    }
  }, [cargando, llamarMarcaje]);

  const cambiarModo = useCallback((nuevo) => {
    if (cargando) return;
    turnoPinRef.current = '';
    setTurnoPaso(null);
    setPin('');
    avisar('');
    setKdsPendiente(null);
    setModo(nuevo);
  }, [cargando, avisar]);

  // El resultado se cierra solo para dejar el teclado listo para el siguiente empleado.
  useEffect(() => {
    if (!turnoPaso?.registrado) return;
    const t = setTimeout(reiniciarTurno, 6000);
    return () => clearTimeout(t);
  }, [turnoPaso, reiniciarTurno]);

  /* Teclado numérico */
  const agregarNumero = useCallback(
    (digito) => {
      if (cargando || pin.length >= pinLength) return;
      const nuevo = pin + digito;
      setPin(nuevo);
      if (mensaje.tipo === 'error') avisar('');
      if (nuevo.length === pinLength) {
        setTimeout(() => (modo === 'turno' ? previsualizarTurno(nuevo) : iniciarSesion(nuevo)), 80);
      }
    },
    [cargando, pin, pinLength, iniciarSesion, previsualizarTurno, modo, mensaje.tipo, avisar]
  );

  const borrarNumero = useCallback(() => {
    if (!cargando) setPin((prev) => prev.slice(0, -1));
  }, [cargando]);

  const limpiarPin = useCallback(() => {
    if (!cargando) { setPin(''); avisar(''); }
  }, [cargando, avisar]);

  /* Teclado físico */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (ajustesAbiertos) {
        if (e.key === 'Escape') setAjustesAbiertos(false);
        return;
      }
      if (turnoPaso) {
        if (e.key === 'Enter' && turnoPaso.preview) confirmarTurno();
        else if (e.key === 'Escape' || (e.key === 'Enter' && turnoPaso.registrado)) reiniciarTurno();
        return;
      }
      if (cargando) return;
      if (/^[0-9]$/.test(e.key)) agregarNumero(e.key);
      else if (e.key === 'Backspace') borrarNumero();
      else if (e.key === 'Escape') limpiarPin();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agregarNumero, borrarNumero, limpiarPin, cargando, ajustesAbiertos, turnoPaso, confirmarTurno, reiniciarTurno]);

  const nombreNegocio = configSistema?.nombre_negocio || 'Mi Negocio';
  const provincia = configSistema?.provincia || 'Santo Domingo, DO';

  /* Protector de pantalla */
  const [screensaverActivo, setScreensaverActivo] = useState(false);
  const [screensaverMinutos, setScreensaverMinutos] = useState(() => {
    const val = localStorage.getItem('chloe_screensaver_minutos');
    return val !== null ? Number(val) : 2;
  });

  const [screensaverTipo, setScreensaverTipo] = useState(() => {
    const t = localStorage.getItem('chloe_screensaver_tipo');
    return TIPOS_PROTECTOR.some((x) => x.id === t) ? t : 'reloj';
  });

  useEffect(() => {
    if (!screensaverMinutos || screensaverMinutos <= 0) {
      setScreensaverActivo(false);
      return undefined;
    }
    let timer = null;
    const reiniciarTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setScreensaverActivo(true), screensaverMinutos * 60 * 1000);
    };
    const despertar = () => { setScreensaverActivo(false); reiniciarTimer(); };
    const movimiento = () => { if (!screensaverActivo) reiniciarTimer(); };

    window.addEventListener('keydown', despertar, { passive: true });
    window.addEventListener('mousemove', movimiento, { passive: true });
    window.addEventListener('mousedown', despertar, { passive: true });
    window.addEventListener('touchstart', despertar, { passive: true });
    window.addEventListener('pointerdown', despertar, { passive: true });
    reiniciarTimer();
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('keydown', despertar);
      window.removeEventListener('mousemove', movimiento);
      window.removeEventListener('mousedown', despertar);
      window.removeEventListener('touchstart', despertar);
      window.removeEventListener('pointerdown', despertar);
    };
  }, [screensaverMinutos, screensaverActivo]);

  const cambiarTiempoScreensaver = (minutos) => {
    setScreensaverMinutos(minutos);
    try { localStorage.setItem('chloe_screensaver_minutos', String(minutos)); } catch { /* sin almacenamiento */ }
    toastAviso(minutos > 0 ? `Protector activado tras ${minutos} min de inactividad` : 'Protector de pantalla desactivado');
  };

  const cambiarTipoProtector = (id) => {
    setScreensaverTipo(id);
    try { localStorage.setItem('chloe_screensaver_tipo', id); } catch { /* sin almacenamiento */ }
  };

  const esTurno = modo === 'turno';
  const skinFijo = configSistema?.login_theme === 'medianoche' || configSistema?.login_theme === 'bosque';

  return (
    <main className="lg">
      {/* ============ Panel de marca / contexto del turno ============ */}
      <section className="lg-brand" aria-label="Información del terminal">
        {fondoMarca && <div className="lg-brand__bg" style={{ backgroundImage: `url(${fondoMarca})` }} aria-hidden="true" />}

        <div className="lg-brand__top">
          <div className="lg-brand__id">
            <span className="lg-brand__logo">
              <img src={logoActual} alt="" onError={() => setLogoActual(logoPredeterminado)} />
            </span>
            <div>
              <p className="lg-brand__name">{nombreNegocio}</p>
              <p className="lg-brand__sub">POS multiempresa</p>
            </div>
          </div>
          <p className={`lg-server ${servidorOnline ? '' : 'is-off'}`}>
            <span className="lg-server__dot" aria-hidden="true" />
            {servidorOnline ? 'Servidor POS en línea' : 'Servidor desconectado'} · {window.location.hostname || 'local'}
          </p>
        </div>

        <div className="lg-clock">
          <p className="lg-clock__greeting">{saludo}</p>
          <p className="lg-clock__time">{hora}</p>
          <p className="lg-clock__date">{fecha}</p>
        </div>

        <div className="lg-brand__bottom">
          <ul className="lg-facts">
            <li><Tablet size={18} />Terminal autorizada</li>
            <li><Clock size={18} />{turnoActual.nombre} · {turnoActual.rango}</li>
            <li>{servidorOnline ? <Wifi size={18} /> : <WifiOff size={18} />}{servidorOnline ? 'En línea' : 'Sin conexión'} · {provincia}</li>
          </ul>
          <button type="button" className="lg-brand__btn" onClick={() => cambiarModo(esTurno ? 'acceso' : 'turno')} disabled={cargando}>
            {esTurno ? <><ArrowLeft size={18} />Volver al acceso</> : <><Fingerprint size={18} />Fichar entrada o salida</>}
          </button>
        </div>
      </section>

      {/* ============ Panel del PIN ============ */}
      <section className="lg-pin">
        <div className="lg-pin__top">
          <button type="button" className="lg-btn lg-only-mobile" onClick={() => cambiarModo(esTurno ? 'acceso' : 'turno')} disabled={cargando}>
            {esTurno ? <ArrowLeft size={16} /> : <Fingerprint size={16} />}<span>{esTurno ? 'Acceso' : 'Fichar turno'}</span>
          </button>
          {!skinFijo && (
            <button type="button" className="lg-btn" onClick={alternarTema} aria-label="Cambiar tema">
              {esOscuro ? <Sun size={17} /> : <Moon size={17} />}
              <span>{esOscuro ? 'Claro' : 'Oscuro'}</span>
            </button>
          )}
          <button type="button" className="lg-btn lg-btn--icon" onClick={() => setAjustesAbiertos(true)} aria-label="Protector de pantalla" title="Protector de pantalla">
            <MonitorOff size={17} />
          </button>
          <span className="lg-chip"><MapPin size={16} />{provincia}</span>
          {onVolver && <button type="button" className="lg-btn" onClick={onVolver}><ArrowLeft size={16} />Inicio</button>}
          {esElectronApp() && onChangeServer && (
            <button type="button" className="lg-btn lg-btn--icon" onClick={onChangeServer} aria-label="Configurar servidor" title="Configurar servidor">
              <Settings size={17} />
            </button>
          )}
        </div>

        <div className={`lg-body ${cargando ? 'is-loading' : ''}`}>
          {!turnoPaso && (
            <>
              <div className="lg-head">
                <h1>{esTurno ? 'Marca tu turno' : kdsPendiente ? `PIN para KDS ${kdsPendiente}` : 'Introduce tu PIN'}</h1>
                <p>{esTurno ? 'Digita tu PIN para registrar tu entrada o tu salida.' : kdsPendiente ? `Ingresa tu PIN para abrir la pantalla de ${kdsPendiente === 'Bar' ? 'bar' : 'cocina'}.` : 'Tu PIN abre tu sesión y tus mesas.'}</p>
              </div>

              <div className={`lg-dots ${fallo ? 'is-error' : ''}`} role="img" aria-label={`${pin.length} de ${pinLength} dígitos`}>
                {Array.from({ length: pinLength }).map((_, i) => (
                  <span key={i} className={`lg-dot ${i < pin.length ? 'is-filled' : ''}`} />
                ))}
              </div>

              <p className={`lg-msg ${mensaje.tipo ? `is-${mensaje.tipo}` : ''}`} role="status" aria-live="polite">
                {cargando && <RefreshCw size={14} className="lg-spin" />}
                {mensaje.texto || (esTurno ? '' : 'Terminal lista')}
              </p>

              <div className="lg-keypad" role="group" aria-label="Teclado numérico">
                {TECLAS.map((n) => (
                  <button key={n} type="button" className="lg-key" onClick={() => agregarNumero(n)} disabled={cargando}>{n}</button>
                ))}
                <button type="button" className="lg-key lg-key--aux" onClick={limpiarPin} disabled={cargando || pin.length === 0} aria-label="Borrar todo">C</button>
                <button type="button" className="lg-key" onClick={() => agregarNumero('0')} disabled={cargando}>0</button>
                <button type="button" className="lg-key lg-key--aux" onClick={borrarNumero} disabled={cargando || pin.length === 0} aria-label="Borrar último dígito">
                  <Delete size={24} />
                </button>
              </div>

              {!esTurno && onVerKDS && (
                <div className="lg-kds">
                  {kdsPendiente ? (
                    <button type="button" className="lg-btn" onClick={() => { setKdsPendiente(null); setPin(''); avisar(''); }}><ArrowLeft size={16} />Cancelar KDS {kdsPendiente}</button>
                  ) : (
                    <>
                      <span>Comanderas</span>
                      <button type="button" className="lg-btn" onClick={() => { setPin(''); avisar(''); setKdsPendiente('Cocina'); }}><ChefHat size={17} />KDS Cocina</button>
                      <button type="button" className="lg-btn" onClick={() => { setPin(''); avisar(''); setKdsPendiente('Bar'); }}><Wine size={17} />KDS Bar</button>
                    </>
                  )}
                </div>
              )}

              {esTurno && (
                <div className="lg-legend" aria-label="Horarios de turno">
                  <div><b>Turno 1</b><span>{rango(horarios.turno1)}</span></div>
                  <div><b>Turno 2</b><span>{rango(horarios.turno2)}</span></div>
                </div>
              )}
            </>
          )}

          {turnoPaso?.preview && (
            <div className={`lg-turno lg-turno--${turnoPaso.accion}`} role="dialog" aria-label="Confirmar registro de turno">
              <span className="lg-turno__avatar">{iniciales(turnoPaso.usuario?.nombre)}</span>
              <p className="lg-turno__hello">Hola, <strong>{turnoPaso.usuario?.nombre}</strong></p>
              <div className="lg-turno__action">
                {turnoPaso.accion === 'entrada' ? <LogIn size={22} /> : <LogOut size={22} />}
                <span>{turnoPaso.accion === 'entrada' ? 'Registrar ENTRADA' : 'Registrar SALIDA'}</span>
              </div>
              <dl className="lg-turno__meta">
                <div><dt>Hora</dt><dd>{horaCorta(turnoPaso.ahora)}</dd></div>
                <div><dt>Turno</dt><dd>{turnoPaso.turno}</dd></div>
                {turnoPaso.accion === 'salida' && <div><dt>Trabajado</dt><dd>{duracion(turnoPaso.minutosTrabajados)}</dd></div>}
              </dl>
              <p className="lg-turno__range">{turnoPaso.turnoEtiqueta}</p>
              {turnoPaso.accion === 'entrada' && turnoPaso.tardeMin > 0 && <p className="lg-turno__warn">Llegada con {duracion(turnoPaso.tardeMin)} de retraso.</p>}
              {turnoPaso.accion === 'entrada' && turnoPaso.turnoAnteriorOlvidado && <p className="lg-turno__warn">Tu turno anterior quedó abierto; se cerrará automáticamente.</p>}
              {turnoPaso.accion === 'salida' && turnoPaso.salidaAnticipadaMin > 0 && <p className="lg-turno__warn">Salida {duracion(turnoPaso.salidaAnticipadaMin)} antes del fin del turno.</p>}
              <div className="lg-turno__buttons">
                <button type="button" className="lg-btn lg-btn--lg" onClick={reiniciarTurno} disabled={cargando}>Cancelar</button>
                <button type="button" className="lg-btn lg-btn--lg lg-btn--primary" onClick={confirmarTurno} disabled={cargando}>
                  {cargando ? 'Registrando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}

          {turnoPaso?.registrado && (
            <div className={`lg-turno lg-turno--done lg-turno--${turnoPaso.accion}`} role="status">
              <span className="lg-turno__ok"><CircleCheck size={44} strokeWidth={1.8} /></span>
              <h2>{turnoPaso.accion === 'entrada' ? '¡Entrada registrada!' : '¡Salida registrada!'}</h2>
              <p><strong>{turnoPaso.usuario?.nombre}</strong> · {horaCorta(turnoPaso.ahora)}</p>
              <p className="lg-turno__range">
                {turnoPaso.accion === 'entrada' ? `${turnoPaso.turno} · ${turnoPaso.turnoEtiqueta}` : `Tiempo trabajado: ${duracion(turnoPaso.minutosTrabajados)}`}
              </p>
              <button type="button" className="lg-btn lg-btn--lg" onClick={reiniciarTurno}>Listo</button>
            </div>
          )}
        </div>

        <footer className="lg-foot">
          <ShieldCheck size={14} />
          {nombreNegocio} · ChloeRestaurant POS by BMTECHRD © {new Date().getFullYear()} · Protegido con cifrado integral
        </footer>
      </section>

      {/* ── Ajustes: protector de pantalla ── */}
      {ajustesAbiertos && (
        <div className="lg-modal" onClick={() => setAjustesAbiertos(false)} role="dialog" aria-modal="true" aria-label="Protector de pantalla">
          <div className="lg-modal__panel" onClick={(e) => e.stopPropagation()}>
            <div className="lg-modal__head">
              <h3>Protector de pantalla</h3>
              <button type="button" className="lg-btn lg-btn--icon" onClick={() => setAjustesAbiertos(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <p className="lg-modal__note">Se activa tras un tiempo sin uso y se cierra al tocar la pantalla o presionar cualquier tecla.</p>
            <p className="lg-modal__label">Estilo</p>
            <div className="lg-modal__types" role="radiogroup" aria-label="Estilo del protector">
              {TIPOS_PROTECTOR.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={screensaverTipo === t.id} className={`lg-typecard ${screensaverTipo === t.id ? 'is-on' : ''}`} onClick={() => cambiarTipoProtector(t.id)}>
                  <VistaPreviaProtector tipo={t.id} />
                  <strong>{t.nombre}</strong>
                  <small>{t.desc}</small>
                </button>
              ))}
            </div>
            <p className="lg-modal__label">Activar tras</p>
            <div className="lg-modal__times">
              {[0, 1, 2, 5, 10].map((m) => (
                <button key={m} type="button" className={`lg-chipbtn ${screensaverMinutos === m ? 'is-on' : ''}`} onClick={() => cambiarTiempoScreensaver(m)}>
                  {m === 0 ? 'Apagado' : `${m} min`}
                </button>
              ))}
            </div>
            <button type="button" className="lg-btn lg-btn--primary" onClick={() => { setAjustesAbiertos(false); setScreensaverActivo(true); }}>Probar ahora</button>
          </div>
        </div>
      )}

      {/* ── Protector de pantalla ── */}
      {screensaverActivo && (
        <Screensaver tipo={screensaverTipo} hora={hora} fecha={fecha} logo={logoActual} nombre={nombreNegocio} onClose={() => setScreensaverActivo(false)} onLogoError={() => setLogoActual(logoPredeterminado)} />
      )}
    </main>
  );
}

export default LoginScreen;
