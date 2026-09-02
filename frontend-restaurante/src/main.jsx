import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { instalarFetchAutenticado } from './api.js'

instalarFetchAutenticado()

// En Electron, los diálogos alert()/confirm() nativos hacen que la ventana pierda el
// foco del S.O. y el tecleo manual en cualquier campo deja de registrarse. El renderer
// no puede recuperar ese foco por script (Chromium lo bloquea), así que se pide la
// reactivación real al proceso principal y se reintenta el foco del elemento activo.
const encontrarElementoEnfocable = () => {
  const candidatos = document.querySelectorAll('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
  for (const el of candidatos) {
    const estilo = window.getComputedStyle(el);
    if (el.disabled || el.hidden || estilo.display === 'none' || estilo.visibility === 'hidden' || estilo.opacity === '0') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
};

// Guarda el elemento activo antes de que alert() lo pierda
let _elementoAntesDeLlamada = null;
const reintentarFoco = () => {
  try {
    // 1. Intenta el elemento que estaba activo antes del alert
    if (_elementoAntesDeLlamada && document.body.contains(_elementoAntesDeLlamada) && !_elementoAntesDeLlamada.disabled) {
      _elementoAntesDeLlamada.focus();
      return;
    }
    // 2. Intenta el elemento activo actual (si es un input/textarea)
    const actual = document.activeElement;
    if (actual && /^(INPUT|TEXTAREA|SELECT)$/.test(actual.tagName) && document.body.contains(actual)) {
      actual.focus();
      return;
    }
    // 3. Foca el body como último recurso para devolver control al DOM
    document.body.focus();
  } catch (e) { /* ignorar */ }
};

const restaurarFoco = () => {
  try {
    if (window.electronPOS?.reenfocarVentana) window.electronPOS.reenfocarVentana();
  } catch (e) { /* ignorar */ }
  reintentarFoco();
  setTimeout(reintentarFoco, 100);
  setTimeout(reintentarFoco, 300);
  setTimeout(reintentarFoco, 600);
  setTimeout(() => { _elementoAntesDeLlamada = null; }, 700);
};

const alertOriginal = window.alert;
window.alert = (mensaje) => {
  _elementoAntesDeLlamada = document.activeElement;
  try { alertOriginal(mensaje); } finally { restaurarFoco(); }
};

const confirmOriginal = window.confirm;
window.confirm = (mensaje) => {
  _elementoAntesDeLlamada = document.activeElement;
  try { return confirmOriginal(mensaje); } finally { restaurarFoco(); }
};

const promptOriginal = window.prompt;
window.prompt = (mensaje, valorPredeterminado) => {
  _elementoAntesDeLlamada = document.activeElement;
  try { return promptOriginal(mensaje, valorPredeterminado); } finally { restaurarFoco(); }
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
