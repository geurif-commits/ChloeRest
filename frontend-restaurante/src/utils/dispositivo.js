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

export function obtenerDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = generarId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function obtenerInfoDispositivo() {
  return {
    deviceId: obtenerDeviceId(),
    navegador: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 300) : '',
  };
}
