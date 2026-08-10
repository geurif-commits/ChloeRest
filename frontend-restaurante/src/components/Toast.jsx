import { useState, useEffect, useCallback } from 'react';

// ──────────────────────────────────────────────
//  Sistema global de Toast para evitar alert()
//  que en Electron roba el foco de los inputs
// ──────────────────────────────────────────────

let _setToasts = null;
let _idCounter = 0;

export function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
  if (!_setToasts) {
    // Fallback en caso de que el componente no esté montado aún
    console.warn('[Toast]', mensaje);
    return;
  }
  const id = ++_idCounter;
  _setToasts((prev) => [...prev, { id, mensaje, tipo }]);
  setTimeout(() => {
    _setToasts((prev) => prev.filter((t) => t.id !== id));
  }, duracion);
}

// Reemplazos directos de alert / confirm
export function toastExito(msg, duracion) { mostrarToast(msg, 'exito', duracion); }
export function toastError(msg, duracion) { mostrarToast(msg, 'error', duracion); }
export function toastInfo(msg, duracion)  { mostrarToast(msg, 'info',  duracion); }
export function toastAviso(msg, duracion) { mostrarToast(msg, 'aviso', duracion); }

// ──────────────────────────────────────────────
//  Componente que renderiza los toasts
// ──────────────────────────────────────────────
export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  const cerrar = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={estilos.contenedor}>
      {toasts.map((t) => (
        <div key={t.id} style={{ ...estilos.toast, ...colores[t.tipo] }}>
          <span style={estilos.icono}>{iconos[t.tipo]}</span>
          <span style={estilos.texto}>{t.mensaje}</span>
          <button
            style={estilos.cerrar}
            onClick={() => cerrar(t.id)}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

const iconos = {
  exito: '✅',
  error: '❌',
  aviso: '⚠️',
  info:  'ℹ️',
};

const colores = {
  exito: { borderLeft: '4px solid #00f576', background: 'rgba(0,245,118,0.10)' },
  error: { borderLeft: '4px solid #ff3366', background: 'rgba(255,51,102,0.10)' },
  aviso: { borderLeft: '4px solid #ffb703', background: 'rgba(255,183,3,0.10)'  },
  info:  { borderLeft: '4px solid #60a5fa', background: 'rgba(96,165,250,0.10)' },
};

const estilos = {
  contenedor: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '420px',
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '14px 16px',
    borderRadius: '12px',
    backdropFilter: 'blur(12px)',
    background: 'rgba(20,20,28,0.95)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '0.9rem',
    lineHeight: '1.4',
    animation: 'toastEntrar 0.3s ease',
    pointerEvents: 'auto',
  },
  icono: { fontSize: '1.1rem', flexShrink: 0, marginTop: '1px' },
  texto: { flex: 1, wordBreak: 'break-word' },
  cerrar: {
    background: 'none',
    border: 'none',
    color: '#9494ad',
    fontSize: '1.3rem',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
  },
};
