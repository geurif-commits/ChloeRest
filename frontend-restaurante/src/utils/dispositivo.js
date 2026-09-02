const DEVICE_KEY = 'POS_DEVICE_ID';

function generarId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function parsearUserAgent(ua = '', w = 0, h = 0) {
  let so = 'Desconocido';
  let tipo = 'Computadora / PC';
  let navegadorNombre = 'Navegador Web';

  if (/Windows NT 10/i.test(ua)) so = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) so = 'Windows 8.1';
  else if (/Windows NT 6.1/i.test(ua)) so = 'Windows 7';
  else if (/Windows/i.test(ua)) so = 'Windows';
  else if (/Android/i.test(ua)) {
    so = 'Android';
    tipo = Math.min(w, h) >= 600 || !/Mobile/i.test(ua) ? 'Tablet POS' : 'Teléfono Móvil';
  } else if (/iPad/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    so = 'iPadOS';
    tipo = 'iPad / Tablet';
  } else if (/iPhone/i.test(ua)) {
    so = 'iOS';
    tipo = 'iPhone / Móvil';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    so = 'macOS';
    tipo = 'Computadora Mac';
  } else if (/Linux/i.test(ua)) {
    so = 'Linux';
    tipo = 'Terminal Linux';
  }

  if (/Edg\//i.test(ua)) navegadorNombre = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium|Edg/i.test(ua)) navegadorNombre = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) navegadorNombre = 'Apple Safari';
  else if (/Firefox\//i.test(ua)) navegadorNombre = 'Mozilla Firefox';
  else if (/Opera|OPR\//i.test(ua)) navegadorNombre = 'Opera';

  return {
    so,
    tipo,
    navegadorNombre,
    nombreSugerido: `${tipo} (${so} • ${navegadorNombre})`,
    resolucion: w && h ? `${w}x${h}` : null
  };
}

export function obtenerDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = generarId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function obtenerInfoDispositivo() {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const w = typeof window !== 'undefined' && window.screen ? window.screen.width : 0;
  const h = typeof window !== 'undefined' && window.screen ? window.screen.height : 0;
  const parsed = parsearUserAgent(ua, w, h);

  return {
    deviceId: obtenerDeviceId(),
    navegador: ua.slice(0, 300),
    nombre: parsed.nombreSugerido,
    tipo: parsed.tipo,
    so: parsed.so,
    navegadorNombre: parsed.navegadorNombre,
    resolucion: parsed.resolucion
  };
}
