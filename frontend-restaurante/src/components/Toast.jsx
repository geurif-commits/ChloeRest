import { useState, useEffect, useCallback } from 'react';
import { CircleCheck, CircleX, TriangleAlert, Info, X } from 'lucide-react';

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
//  Los mensajes históricos traen un emoji inicial (✅ ❌ ⚠️ …). Se usa para
//  inferir el tono real y se retira del texto para no duplicar el icono.
// ──────────────────────────────────────────────
const TONO_POR_EMOJI = [
  [/^(✅|✔️?|🟢)\s*/u, 'exito'],
  [/^(❌|⛔|🚫|🔴)\s*/u, 'error'],
  [/^(⚠️?|📡)\s*/u, 'aviso'],
  [/^(ℹ️?|🔒|🛎️?|🎨|🌙|✨|🖨️?|🔄|📋|💡)\s*/u, 'info'],
];

function interpretar(t) {
  let mensaje = String(t.mensaje ?? '');
  let tipo = t.tipo;
  for (const [re, tono] of TONO_POR_EMOJI) {
    if (re.test(mensaje)) {
      mensaje = mensaje.replace(re, '');
      tipo = tono;
      break;
    }
  }
  return { mensaje, tipo };
}

const ICONOS = { exito: CircleCheck, error: CircleX, aviso: TriangleAlert, info: Info };

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
    <div className="px-toasts" role="region" aria-label="Notificaciones" aria-live="polite">
      {toasts.map((t) => {
        const { mensaje, tipo } = interpretar(t);
        const Icono = ICONOS[tipo] || Info;
        return (
          <div key={t.id} className={`px-toast px-toast--${tipo}`} role="status">
            <span className="px-toast__icon"><Icono size={18} /></span>
            <span className="px-toast__text">{mensaje}</span>
            <button type="button" className="px-toast__close" onClick={() => cerrar(t.id)} aria-label="Cerrar">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
