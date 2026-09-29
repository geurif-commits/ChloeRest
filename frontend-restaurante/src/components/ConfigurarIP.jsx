import { useState, useEffect } from 'react';
import { Server, Wifi } from 'lucide-react';
import './pinpad.css';
import {
  getApiUrl,
  setApiUrl,
  normalizarUrl
} from '../configApi.js';


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
      <div className="gate" role="status" aria-live="polite">
        <div className="gate__loading">
          <span className="gate__badge"><Wifi size={26} /></span>
          <strong style={{ fontFamily: 'var(--px-font-display)', fontSize: '1.4rem', color: 'var(--px-ink)', fontWeight: 600 }}>Conectando con el servidor…</strong>
          <span>Servidor detectado automáticamente.</span>
        </div>
      </div>
    );
  }

  // ============================================================
  // FORMULARIO
  // ============================================================

  return (
    <div className="gate">
      <div className="gate__card">
        <span className="gate__badge"><Server size={26} /></span>
        <span className="px-eyebrow">Terminal POS</span>
        <h2>Configuración de red</h2>
        <p className="gate__lead">
          Ingresa la dirección del servidor principal del restaurante. Ejemplo: <code>192.168.1.100</code>
        </p>

        <div className="gate__info">
          <h4><Wifi size={15} /> Servidor detectado</h4>
          <p><code style={{ wordBreak: 'break-all' }}>{origenActual}</code></p>
          {probando && <p style={{ color: 'var(--px-ink-3)' }}>Comprobando conexión…</p>}
        </div>

        <form onSubmit={guardarIP} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
          <div className="po-field" style={{ marginBottom: 0 }}>
            <label htmlFor="ip-servidor">IP / host del servidor</label>
            <input
              id="ip-servidor"
              className="po-input"
              type="text"
              value={ipServidor}
              onChange={(e) => setIpServidor(e.target.value)}
              required
              placeholder="192.168.1.100"
              autoComplete="off"
              autoFocus
            />
          </div>
          <button type="submit" className="px-btn px-btn--gold px-btn--lg">Conectar terminal al servidor</button>
        </form>
      </div>
    </div>
  );
}

export default ConfigurarIP;
