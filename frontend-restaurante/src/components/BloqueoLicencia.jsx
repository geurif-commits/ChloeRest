import { useState, useEffect } from 'react';
import { Lock, Phone, KeyRound } from 'lucide-react';
import { obtenerDeviceId } from '../utils/dispositivo.js';
import PinPad from './PinPad.jsx';

function BloqueoLicencia({ motivo, contacto, apiUrl, alIniciarSesionAdmin }) {
  const [mostrandoLogin, setMostrandoLogin] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const agregarNumero = (num) => {
    setPin((prev) => {
      if (prev.length < 12) {
        setError('');
        return prev + num;
      }
      return prev;
    });
  };

  const borrarNumero = () => {
    setPin((prev) => prev.slice(0, -1));
  };

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
        setError('Acceso denegado: solo el administrador puede ingresar con la licencia suspendida.');
        setPin('');
      } else {
        alIniciarSesionAdmin(data);
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
      setPin('');
    } finally {
      setCargando(false);
    }
  };

  // El PIN puede tener 4 a 12 dígitos: se envía al pulsar Enter o el botón ➜.

  // Capturar eventos del teclado físico
  useEffect(() => {
    if (!mostrandoLogin) return;

    const manejarTeclado = (evento) => {
      if (evento.key >= '0' && evento.key <= '9') {
        agregarNumero(evento.key);
      } else if (evento.key === 'Backspace' || evento.key === 'Delete') {
        borrarNumero();
      } else if (evento.key === 'Enter' && pin.length >= 4) {
        intentarLoginAdmin(pin);
      }
    };

    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [mostrandoLogin, pin]);

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="bloqueo-title">
      <div className={`gate__card gate__card--wide ${!mostrandoLogin ? 'gate__card--danger' : ''}`}>
        <span className="gate__badge gate__badge--danger"><Lock size={28} /></span>
        <span className="px-eyebrow" style={{ color: 'var(--px-bad)' }}>Licencia</span>
        <h2 id="bloqueo-title">Sistema bloqueado</h2>
        <p className="gate__lead">
          {motivo || 'El período de uso del sistema ha expirado o la licencia no está activa.'}
        </p>

        {!mostrandoLogin ? (
          <>
            <div className="gate__info">
              <h4><Phone size={15} /> Canales de activación oficial (Rep. Dom.)</h4>
              <p><strong>WhatsApp / Tel:</strong> (829) 969-8604</p>
              <p><strong>Soporte y ventas:</strong> geurig@yahoo.com</p>
              <p><strong>Horario:</strong> Lunes a Sábado, 8:00 AM – 6:00 PM</p>
            </div>

            <button type="button" className="px-btn px-btn--gold px-btn--lg" onClick={() => setMostrandoLogin(true)}>
              <KeyRound size={18} /> Ingresar PIN de administrador
            </button>
            <p className="gate__note">Ten a mano el RNC de tu establecimiento para procesar la activación de inmediato.</p>
          </>
        ) : (
          <>
            <p className="gate__lead" style={{ marginTop: 0 }}>Ingresa el PIN de administrador para reactivar el sistema.</p>
            <PinPad
              value={pin}
              length={6}
              error={error}
              disabled={cargando}
              onDigit={agregarNumero}
              onDelete={borrarNumero}
              onSubmit={() => intentarLoginAdmin(pin)}
              submitDisabled={pin.length < 4}
            />
            <button type="button" className="gate__link" onClick={() => { setMostrandoLogin(false); setPin(''); setError(''); }}>
              ← Volver a la información de contacto
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default BloqueoLicencia;
