import { useState, useEffect } from 'react';
import { getApiUrl, setApiUrl } from '../configApi.js';

function ConfigurarIP({ alGuardar }) {
  const origenActual = window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : window.location.origin;
  const [ipServidor, setIpServidor] = useState(getApiUrl() || origenActual);
  const [autoDetectado, setAutoDetectado] = useState(false);

  // Auto-detección: si el frontend se carga desde el mismo servidor (puerto 3000),
  // configurar automáticamente sin necesidad de input manual.
  useEffect(() => {
    const savedIp = getApiUrl();
    if (!savedIp) {
      // Intentar auto-conectar al origen actual
      fetch(`${origenActual}/api/health`)
        .then(r => r.json())
        .then(data => {
          if (data.estado === 'ok') {
            setAutoDetectado(true);
            setApiUrl(origenActual);
            alGuardar(origenActual);
          }
        })
        .catch(() => {
          // No se pudo auto-detectar, mostrar formulario manual
        });
    }
  }, []);

  const guardarIP = (e) => {
    e.preventDefault();
    let ipLimpia = ipServidor.trim();
    if (!ipLimpia.startsWith('http://') && !ipLimpia.startsWith('https://')) {
      ipLimpia = `http://${ipLimpia}`;
    }
    // Si no tiene puerto explícito (y no es un dominio), agregar :3000
    try {
      const url = new URL(ipLimpia);
      if (!url.port && url.hostname !== 'localhost' && !url.hostname.includes('.')) {
        ipLimpia = `${url.protocol}//${url.hostname}:3000`;
      } else if (url.hostname === 'localhost' && !url.port) {
        ipLimpia = 'http://localhost:3000';
      }
    } catch {
      ipLimpia = `http://${ipLimpia}:3000`;
    }

    // Quitar barra final si existe
    ipLimpia = ipLimpia.replace(/\/+$/, '');

    setApiUrl(ipLimpia);
    alGuardar(ipLimpia);
  };

  if (autoDetectado) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'sans-serif'
      }}>
        <h2 style={{color: '#00f576'}}>✅ Conectando con el servidor...</h2>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, fontFamily: 'sans-serif', padding: '20px'
    }}>
      <div style={{
        background: '#181820', border: '1px solid #00e5ff', borderRadius: '12px',
        padding: '30px', maxWidth: '450px', width: '100%', textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0, 229, 255, 0.15)'
      }}>
        <div style={{fontSize: '3rem', marginBottom: '10px'}}>🌐</div>
        <h2 style={{color: '#fff', fontSize: '1.5rem', margin: '0 0 10px 0'}}>Configuración de Red POS</h2>
        <p style={{color: '#88889d', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.4'}}>
          Ingresa la dirección IP del Servidor Principal del restaurante.<br/>
          <strong style={{color: '#00e5ff'}}>Ejemplo:</strong> Si estás en la PC del servidor, usa <code style={{color: '#00f576'}}>localhost</code>.<br/>
          Si es una tablet/celular por Wi-Fi, usa la IP del servidor: <code style={{color: '#00f576'}}>192.168.x.x</code>
        </p>

        <div style={{
          background: '#0d0d17', border: '1px dashed #3e3e52', borderRadius: '8px',
          padding: '10px', marginBottom: '18px', fontSize: '0.82rem', color: '#9494ad', textAlign: 'left'
        }}>
          💡 <strong>Detección automática:</strong> Se detectó que este servidor está en <code style={{color: '#00e5ff'}}>{origenActual}</code>
        </div>

        <form onSubmit={guardarIP} style={{display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left'}}>
          <div>
            <label style={{color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>IP del Servidor / Host</label>
            <input 
              type="text" 
              value={ipServidor} 
              onChange={(e) => setIpServidor(e.target.value)} 
              required
              placeholder="Ej: 192.168.1.100"
              style={{
                width: '100%', padding: '12px', background: '#121217', color: '#fff',
                border: '1px solid #3e3e4f', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box'
              }}
            />
          </div>

          <button 
            type="submit" 
            style={{
              background: '#00e5ff', color: '#000', border: 'none', padding: '12px',
              borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: '5px'
            }}
          >
            💾 Conectar Terminal al Servidor
          </button>
        </form>
      </div>
    </div>
  );
}

export default ConfigurarIP;