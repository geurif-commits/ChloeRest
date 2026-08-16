import { useState, useEffect } from 'react';
import {
  getApiUrl,
  setApiUrl,
  normalizarUrl
} from '../configApi.js';

import BotonSalirElectron from './BotonSalirElectron.jsx';

function ConfigurarIP({ alGuardar }) {

  // ============================================================
  // ORIGEN ACTUAL
  // ============================================================

  const origenActual =
    window.location.protocol === 'file:'
      ? 'http://localhost:3000'
      : getApiUrl();

  const [ipServidor, setIpServidor] = useState(
    getApiUrl() || origenActual
  );

  const [autoDetectado, setAutoDetectado] = useState(false);
  const [probando, setProbando] = useState(false);

  // ============================================================
  // AUTO-DETECCIÓN
  // ============================================================

  useEffect(() => {

    const savedIp =
      localStorage.getItem('POS_API_URL') ||
      localStorage.getItem('API_IP');

    // Si ya existe configuración, no hacemos autodetección.
    if (savedIp) {
      return;
    }

    const urlAuto = normalizarUrl(origenActual);

    if (!urlAuto) {
      return;
    }

    setProbando(true);

    fetch(`${urlAuto}/api/health`)
      .then(async (response) => {

        if (!response.ok) {
          throw new Error('Servidor no disponible');
        }

        return response.json();
      })
      .then((data) => {

        if (data?.estado === 'ok') {

          setAutoDetectado(true);

          const urlFinal = setApiUrl(urlAuto);

          alGuardar(urlFinal);
        }
      })
      .catch(() => {
        // No se pudo detectar automáticamente.
      })
      .finally(() => {
        setProbando(false);
      });

  }, []);

  // ============================================================
  // GUARDAR IP MANUALMENTE
  // ============================================================

  const guardarIP = (e) => {

    e.preventDefault();

    const valor = ipServidor.trim();

    if (!valor) {
      return;
    }

    const urlFinal = normalizarUrl(valor);

    if (!urlFinal) {
      return;
    }

    setApiUrl(urlFinal);

    alGuardar(urlFinal);
  };

  // ============================================================
  // PANTALLA DE AUTO-DETECCIÓN
  // ============================================================

  if (autoDetectado) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: '#0d0d12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif'
        }}
      >
        <BotonSalirElectron />
        <div style={{ textAlign: 'center' }}>

          <div
            style={{
              fontSize: '3rem',
              marginBottom: '15px'
            }}
          >
            🍽️
          </div>

          <h2
            style={{
              color: '#00f576',
              margin: 0
            }}
          >
            Conectando con el servidor...
          </h2>

          <p
            style={{
              color: '#88889d',
              marginTop: '10px'
            }}
          >
            Servidor detectado automáticamente.
          </p>

        </div>
      </div>
    );
  }

  // ============================================================
  // FORMULARIO
  // ============================================================

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#0d0d12',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: 'sans-serif',
        padding: '20px',
        boxSizing: 'border-box'
      }}
    >
      <BotonSalirElectron />

      <div
        style={{
          background: '#181820',
          border: '1px solid #00e5ff',
          borderRadius: '12px',
          padding: '30px',
          maxWidth: '450px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0, 229, 255, 0.15)'
        }}
      >

        <div
          style={{
            fontSize: '3rem',
            marginBottom: '10px'
          }}
        >
          🌐
        </div>

        <h2
          style={{
            color: '#fff',
            fontSize: '1.5rem',
            margin: '0 0 10px 0'
          }}
        >
          Configuración de Red POS
        </h2>

        <p
          style={{
            color: '#88889d',
            fontSize: '0.9rem',
            marginBottom: '20px',
            lineHeight: '1.5'
          }}
        >
          Ingresa la dirección del servidor principal
          del restaurante.
          <br />

          <strong style={{ color: '#00e5ff' }}>
            Ejemplo:
          </strong>{' '}

          <code style={{ color: '#00f576' }}>
            192.168.1.100
          </code>
        </p>

        <div
          style={{
            background: '#0d0d17',
            border: '1px dashed #3e3e52',
            borderRadius: '8px',
            padding: '10px',
            marginBottom: '18px',
            fontSize: '0.82rem',
            color: '#9494ad',
            textAlign: 'left'
          }}
        >
          💡 <strong>Servidor detectado:</strong>

          <br />

          <code
            style={{
              color: '#00e5ff',
              wordBreak: 'break-all'
            }}
          >
            {origenActual}
          </code>

          {probando && (
            <div
              style={{
                marginTop: '6px',
                color: '#88889d'
              }}
            >
              Comprobando conexión...
            </div>
          )}
        </div>

        <form
          onSubmit={guardarIP}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            textAlign: 'left'
          }}
        >

          <div>

            <label
              style={{
                color: '#00e5ff',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                display: 'block',
                marginBottom: '5px'
              }}
            >
              IP / Host del Servidor
            </label>

            <input
              type="text"
              value={ipServidor}
              onChange={(e) => setIpServidor(e.target.value)}
              required
              placeholder="Ej: 192.168.1.100"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '12px',
                background: '#121217',
                color: '#fff',
                border: '1px solid #3e3e4f',
                borderRadius: '6px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />

          </div>

          <button
            type="submit"
            style={{
              background: '#00e5ff',
              color: '#000',
              border: 'none',
              padding: '12px',
              borderRadius: '6px',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: 'pointer',
              marginTop: '5px'
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