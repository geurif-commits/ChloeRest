// Fuente única para la URL del API. Compatible con la clave antigua API_IP.
const URL_KEY = 'POS_API_URL';
const LEGACY_KEYS = ['API_IP'];

// Obtiene la URL guardada por el usuario o usa localhost por defecto si es Electron (file://)
export const getApiUrl = () => {
  const urlGuardada = localStorage.getItem(URL_KEY) || localStorage.getItem(LEGACY_KEYS[0]);
  if (urlGuardada) return urlGuardada;

  // Si se ejecuta en Electron o protocolo de archivos, conectar automáticamente a localhost:3000
  if (window.location.protocol === 'file:' || !window.location.hostname) {
    return 'http://localhost:3000';
  }

  // Si corre desde el navegador de una red local
  const protocol = window.location.protocol.startsWith('http') ? window.location.protocol : 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:3000`;
};

export const setApiUrl = (url) => {
  if (!url) return;

  let urlLimpia = url.trim().replace(/\/+$/, '');

  // Si la autodetección capturó 'file://', corregirlo inmediatamente a 'http://localhost:3000'
  if (urlLimpia.startsWith('file:') || urlLimpia === '') {
    urlLimpia = 'http://localhost:3000';
  }

  // Si el usuario ingresa solo una IP o dominio sin protocolo, añadir http://
  if (!urlLimpia.startsWith('http://') && !urlLimpia.startsWith('https://')) {
    urlLimpia = `http://${urlLimpia}`;
  }

  // Asegurar el puerto 3000 si no se especifica otro puerto
  if (!urlLimpia.includes(':', 7)) {
    urlLimpia = `${urlLimpia}:3000`;
  }

  localStorage.setItem(URL_KEY, urlLimpia);
  localStorage.removeItem(LEGACY_KEYS[0]);
};

export const clearApiUrl = () => {
  localStorage.removeItem(URL_KEY);
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
};
