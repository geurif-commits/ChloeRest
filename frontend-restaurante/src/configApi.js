// Fuente única para la URL del API.
//
// Modos soportados:
// - Electron / file://        -> http://localhost:3000
// - Navegador en LAN local    -> http(s)://HOST:3000
// - Web de producción         -> mismo origen (sin puerto visible)
//
// La URL guardada por el usuario sigue teniendo prioridad para conservar
// compatibilidad con la configuración manual de IP/servidor del POS.
const URL_KEY = 'POS_API_URL';
const LEGACY_KEYS = ['API_IP'];

const esHostLocal = (hostname = '') => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;

  // IPv4 privadas utilizadas por instalaciones LAN del POS.
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;

  return false;
};

const esElectron = () => window.location.protocol === 'file:' || !window.location.hostname;

// Obtiene la URL guardada o selecciona automáticamente el modo adecuado.
export const getApiUrl = () => {
  const urlGuardada = localStorage.getItem(URL_KEY) || localStorage.getItem(LEGACY_KEYS[0]);
  if (urlGuardada) return urlGuardada;

  // Electron / aplicación cargada desde archivo.
  if (esElectron()) return 'http://localhost:3000';

  const { protocol, hostname, origin } = window.location;

  // Navegador dentro de una instalación LAN: el backend escucha en :3000.
  if (esHostLocal(hostname)) {
    const protocolo = protocol.startsWith('http') ? protocol : 'http:';
    return `${protocolo}//${hostname}:3000`;
  }

  // Producción web: Express sirve frontend y /api desde el mismo origen.
  // No exponemos :3000 al navegador ni dependemos de un dominio API separado.
  return origin;
};

export const setApiUrl = (url) => {
  if (!url) return;

  let urlLimpia = url.trim().replace(/\/+$/, '');

  // Si se intenta guardar file://, volver al backend local de Electron.
  if (urlLimpia.startsWith('file:') || urlLimpia === '') {
    urlLimpia = 'http://localhost:3000';
  }

  // Si el usuario ingresa solo una IP o dominio sin protocolo, añadir http://
  if (!urlLimpia.startsWith('http://') && !urlLimpia.startsWith('https://')) {
    urlLimpia = `http://${urlLimpia}`;
  }

  // Mantener el comportamiento histórico para configuración manual de un
  // servidor LAN: si no se especifica puerto, asumir 3000.
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
