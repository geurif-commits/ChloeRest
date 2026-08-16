import { useState, useEffect } from 'react';
import { obtenerDeviceId } from '../utils/dispositivo.js';
import BotonSalirElectron from './BotonSalirElectron.jsx';

function ActivacionDispositivo({ apiUrl, alIniciarSesionAdmin, onSolicitarPlan }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrandoLogin, setMostrandoLogin] = useState(false);
  const [pin, setPin] = useState('');

  const activar = async (e) => {
    if (e) e.preventDefault();
    if (!clave || cargando) return;
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/dispositivo/activar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: obtenerDeviceId(), clave })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo activar el dispositivo.');
      } else {
        window.location.reload();
      }
    } catch {
      setError('⚠️ Error al conectar con el servidor.');
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
        setError('⛔ Acceso denegado: Solo el Administrador puede activar dispositivos.');
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
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box', overflowY: 'auto'
    }}>
      <BotonSalirElectron />
      <div style={{
        background: '#181820', border: '2px solid #00e5ff', borderRadius: '16px',
        padding: '35px', maxWidth: '550px', width: '100%', textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0, 229, 255, 0.2)'
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🖥️</div>
        <h2 style={{ color: '#00e5ff', fontSize: '1.8rem', margin: '0 0 10px 0' }}>Dispositivo no activado</h2>
        <p style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '20px', lineHeight: '1.5' }}>
          Para usar el sistema en este dispositivo necesitas una clave de activación.
          Si aún no la tienes, solicítala por los canales oficiales.
        </p>

        {!mostrandoLogin ? (
          <>
            <form onSubmit={activar} style={{ marginBottom: '20px' }}>
              <input
                type="text"
                value={clave}
                onChange={(e) => { setClave(e.target.value); setError(''); }}
                placeholder="CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #2a2a38',
                  background: '#121217', color: '#fff', fontSize: '0.95rem', textAlign: 'center',
                  letterSpacing: '1px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box'
                }}
              />
              {error && <p style={{ color: '#ff5252', fontSize: '0.85rem', margin: '0 0 10px 0' }}>{error}</p>}
              <button
                type="submit"
                disabled={cargando || !clave}
                style={{
                  width: '100%',
                  background: clave && !cargando ? 'linear-gradient(135deg, #00e5ff, #0088ff)' : '#2a2a38',
                  color: clave && !cargando ? '#000' : '#888',
                  border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold',
                  fontSize: '1rem', cursor: clave && !cargando ? 'pointer' : 'not-allowed'
                }}
              >
                {cargando ? 'Activando...' : '🔑 Activar Dispositivo'}
              </button>
            </form>
            <p style={{ color: '#88889d', fontSize: '0.78rem', margin: '-8px 0 16px 0', lineHeight: 1.5 }}>
              La clave incluye su duración: <code>7D</code> = 7 días, <code>30D</code> = 30 días, <code>12M</code> = 1 año, <code>L</code> = vitalicia.
            </p>

            {onSolicitarPlan && (
              <button
                type="button"
                onClick={onSolicitarPlan}
                style={{
                  width: '100%', background: 'rgba(214,164,77,0.16)', color: '#d6a44d',
                  border: '1px solid rgba(214,164,77,0.5)', padding: '13px', borderRadius: '10px',
                  fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer', marginBottom: '14px',
                }}
              >
                💳 Explorar planes y solicitar licencia
              </button>
            )}

            <div style={{
              background: '#121217', border: '1px solid #3e3e4f', borderRadius: '10px',
              padding: '20px', margin: '0 0 20px 0', textAlign: 'left'
            }}>
              <h4 style={{ color: '#00e5ff', margin: '0 0 10px 0', fontSize: '1rem' }}>📞 Adquirir / Renovar Licencia (Rep. Dom.)</h4>
              <p style={{ color: '#ccc', fontSize: '0.9rem', margin: '5px 0' }}><strong>WhatsApp / Tel:</strong> (829) 969-8604</p>
              <p style={{ color: '#ccc', fontSize: '0.9rem', margin: '5px 0' }}><strong>Soporte y Ventas:</strong> geurig@yahoo.com</p>
              <p style={{ color: '#ccc', fontSize: '0.9rem', margin: '5px 0' }}><strong>Horario:</strong> Lunes a Sábado, 8:00 AM - 6:00 PM</p>
            </div>

            <button
              onClick={() => setMostrandoLogin(true)}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00f576, #00b852)',
                color: '#000', border: 'none', padding: '14px', borderRadius: '10px',
                fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0,245,118,0.3)'
              }}
            >
              👑 Soy el Administrador: Ingresar PIN
            </button>
          </>
        ) : (
          <div style={{ background: '#121217', border: '1px solid #2a2a38', borderRadius: '12px', padding: '20px', margin: '15px 0' }}>
            <h4 style={{ color: '#00f576', margin: '0 0 10px 0' }}>🔑 Iniciar Sesión como Administrador</h4>
            <p style={{ color: '#9494ad', fontSize: '0.85rem', marginBottom: '15px' }}>
              Al ingresar, este dispositivo quedará activado automáticamente.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '15px' }}>
              {[...Array(4)].map((_, i) => (
                <span key={i} style={{
                  width: '45px', height: '45px', borderRadius: '8px', border: '2px solid #00f576',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                  background: i < pin.length ? '#00f576' : 'transparent',
                  color: i < pin.length ? '#000' : 'transparent'
                }}>
                  •
                </span>
              ))}
            </div>

            {error && <p style={{ color: '#ff5252', fontSize: '0.85rem', margin: '0 0 10px 0' }}>{error}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxWidth: '240px', margin: '0 auto 15px auto' }}>
              {['1','2','3','4','5','6','7','8','9'].map((n) => (
                <button
                  key={n}
                  onClick={() => agregarNumero(n)}
                  style={{ background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '12px', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {n}
                </button>
              ))}
              <button onClick={borrarNumero} style={{ background: '#2a2a38', color: '#ff5252', border: '1px solid #2a2a38', padding: '12px', borderRadius: '8px', fontSize: '1.1rem', cursor: 'pointer' }}>⌫</button>
              <button onClick={() => agregarNumero('0')} style={{ background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '12px', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>0</button>
              <button
                onClick={() => intentarLoginAdmin(pin)}
                disabled={cargando || pin.length < 4}
                style={{ background: pin.length >= 4 ? '#00f576' : '#2a2a38', color: pin.length >= 4 ? '#000' : '#888', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ➜
              </button>
            </div>

            <button
              onClick={() => { setMostrandoLogin(false); setPin(''); setError(''); }}
              style={{ background: 'transparent', color: '#9494ad', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
            >
              ⬅ Volver
            </button>
          </div>
        )}

        <p style={{ color: '#88889d', fontSize: '0.8rem', margin: 0 }}>
          Cada dispositivo requiere su propia activación para proteger el uso de la licencia.
        </p>
      </div>
    </div>
  );
}

export default ActivacionDispositivo;
