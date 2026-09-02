import { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Sparkles,
  Phone,
  Mail,
  Clock,
  ArrowLeft,
  Crown,
  CreditCard,
  Delete
} from 'lucide-react';
import { obtenerDeviceId } from '../utils/dispositivo.js';
import BotonSalirElectron from './BotonSalirElectron.jsx';
import './ActivacionDispositivo.css';

function ActivacionDispositivo({ apiUrl, alIniciarSesionAdmin, alActivar, onSolicitarPlan, onVolver }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrandoLogin, setMostrandoLogin] = useState(false);
  const [pin, setPin] = useState('');

  const activar = async (e) => {
    if (e) e.preventDefault();
    const claveLimpia = String(clave || '').trim().toUpperCase();
    if (!claveLimpia || cargando) return;
    setCargando(true);
    setError('');
    try {
      const targetUrl = apiUrl ? `${apiUrl}/api/dispositivo/activar` : '/api/dispositivo/activar';
      const devId = obtenerDeviceId();
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': devId
        },
        body: JSON.stringify({ deviceId: devId, clave: claveLimpia })
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Respuesta inválida del servidor (HTTP ${res.status}).`);
      }
      if (!res.ok) {
        setError(data.error || `No se pudo activar el dispositivo (HTTP ${res.status}).`);
      } else {
        if (data.empresaId || data.tenantId) {
          localStorage.setItem('POS_TENANT_ID', String(data.tenantId || data.empresaId));
        }
        if (alActivar) {
          alActivar(data);
        } else {
          window.location.href = '/';
        }
      }
    } catch (err) {
      console.error('Error al activar dispositivo:', err);
      setError(err.message || '⚠️ Error al conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  const agregarNumero = (num) => {
    setPin((prev) => {
      if (prev.length < 12) {
        setError('');
        return prev + num;
      }
      return prev;
    });
  };

  const borrarNumero = () => setPin((prev) => prev.slice(0, -1));

  const intentarLoginAdmin = async (pinAEnviar) => {
    if (!pinAEnviar || cargando) return;
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/login/camarero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinAEnviar, deviceId: obtenerDeviceId() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'PIN incorrecto.');
        setPin('');
      } else if (data.usuario?.rol !== 'Administrador') {
        setError('⛔ Acceso denegado: Solo el Administrador puede ingresar aquí.');
        setPin('');
      } else {
        alIniciarSesionAdmin(data);
      }
    } catch {
      setError('⚠️ Error al conectar con el servidor.');
      setPin('');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!mostrandoLogin) return;
    const manejarTeclado = (evento) => {
      if (evento.key >= '0' && evento.key <= '9') agregarNumero(evento.key);
      else if (evento.key === 'Backspace' || evento.key === 'Delete') borrarNumero();
      else if (evento.key === 'Enter' && pin.length >= 4) intentarLoginAdmin(pin);
    };
    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [mostrandoLogin, pin]);

  return (
    <div className="activacion-shell">
      <BotonSalirElectron />
      <div className="activacion-card">
        {onVolver && (
          <button type="button" onClick={onVolver} className="activacion-back-btn">
            <ArrowLeft size={16} /> Volver al inicio
          </button>
        )}

        <img className="activacion-brand" src="/icons.svg" alt="Chloe POS" />
        <h2 className="activacion-title">Activación de Dispositivo</h2>
        <p className="activacion-desc">
          Introduce la clave de licencia asignada a tu empresa para habilitar este equipo en el sistema.
        </p>

        {!mostrandoLogin ? (
          <>
            <form onSubmit={activar} className="activacion-form">
              <input
                type="text"
                value={clave}
                onChange={(e) => { setClave(e.target.value.toUpperCase()); setError(''); }}
                placeholder="CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="activacion-input"
              />
              {error && <p className="activacion-error-msg">{error}</p>}
              <button
                type="submit"
                disabled={cargando || !clave}
                className="activacion-submit-btn"
              >
                <KeyRound size={18} /> {cargando ? 'Activando...' : 'Activar Dispositivo'}
              </button>
            </form>

            <p className="activacion-helper">
              Formatos soportados: <code>30D</code> = 30 días, <code>12M</code> = 1 año, <code>L</code> = Vitalicia.
            </p>

            {onSolicitarPlan && (
              <button
                type="button"
                onClick={onSolicitarPlan}
                className="activacion-plan-btn"
              >
                <CreditCard size={18} /> Explorar planes y solicitar licencia
              </button>
            )}

            <div className="activacion-contact-box">
              <h4 className="activacion-contact-title">
                <Phone size={14} /> Soporte y Activaciones Oficiales
              </h4>
              <div className="activacion-contact-items-row">
                <span className="activacion-contact-item">
                  <Phone size={13} color="#00e5ff" /> <strong>WhatsApp:</strong> (829) 969-8604
                </span>
                <span className="activacion-contact-item">
                  <Mail size={13} color="#00e5ff" /> <strong>Email:</strong> geurig@yahoo.com
                </span>
                <span className="activacion-contact-item">
                  <Clock size={13} color="#00e5ff" /> Lun-Sáb 8am-6pm
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMostrandoLogin(true)}
              className="activacion-admin-btn"
            >
              <Crown size={18} /> Acceso administrador
            </button>
          </>
        ) : (
          <div className="activacion-admin-panel">
            <h4><Crown size={18} /> Acceso Administrador</h4>
            <p>
              Ingresa el PIN de administrador para acceder temporalmente a tareas de soporte o configuración.
            </p>

            <div className="activacion-pin-dots">
              {[...Array(6)].map((_, i) => (
                <span
                  key={i}
                  className={`activacion-pin-dot ${i < pin.length ? 'activacion-pin-dot--active' : ''}`}
                >
                  •
                </span>
              ))}
            </div>

            {error && <p className="activacion-error-msg">{error}</p>}

            <div className="activacion-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => agregarNumero(n)}
                  className="activacion-keypad-btn"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={borrarNumero}
                className="activacion-keypad-btn activacion-keypad-btn--del"
              >
                ⌫
              </button>
              <button
                type="button"
                onClick={() => agregarNumero('0')}
                className="activacion-keypad-btn"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => intentarLoginAdmin(pin)}
                disabled={cargando || pin.length < 4}
                className="activacion-keypad-btn activacion-keypad-btn--enter"
              >
                ✓
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setMostrandoLogin(false); setPin(''); setError(''); }}
              className="activacion-back-btn"
            >
              <ArrowLeft size={14} /> Volver a clave de activación
            </button>
          </div>
        )}

        <p className="activacion-footnote">
          Cada terminal requiere su propia clave registrada para garantizar el aislamiento multiempresa.
        </p>
      </div>
    </div>
  );
}

export default ActivacionDispositivo;
