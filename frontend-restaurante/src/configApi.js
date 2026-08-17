const URL_KEY = 'POS_API_URL';
const LEGACY_KEYS = ['API_IP'];

const DOMINIO_PRODUCCION = 'chloerestaurant.lat';
const PUERTO_API_LOCAL = '3000';

/*
 * URL central donde vive el panel del propietario.
 * Las solicitudes de licencia y los pagos SIEMPRE viajan a este
 * servidor, sin importar si la app se ejecuta en Electron (servidor
 * local del cliente) o en la web pública.
 */
export const URL_CENTRAL = `https://${DOMINIO_PRODUCCION}`;

const limpiarUrl = (url) => {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '');
};

const esHostLocal = (hostname = '') => {
  const host = String(hostname).toLowerCase();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1'
  ) {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(host)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(host)) {
    return true;
  }

  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) {
    return true;
  }

  return false;
};

const esElectron = () => {
  return (
    typeof window !== 'undefined' &&
    (
      window.location.protocol === 'file:' ||
      !window.location.hostname ||
      window.location.hostname === '127.0.0.1' ||
      (
        typeof navigator !== 'undefined' &&
        /electron/i.test(navigator.userAgent)
      )
    )
  );
};

const esProduccionWeb = () => {
  if (
    typeof window === 'undefined'
  ) {
    return false;
  }

  const host =
    window.location.hostname.toLowerCase();

  return (
    (
      window.location.protocol === 'https:' ||
      window.location.protocol === 'http:'
    ) &&
    (
      host === DOMINIO_PRODUCCION ||
      host === `www.${DOMINIO_PRODUCCION}`
    )
  );
};

export const normalizarUrl = (url) => {

  let valor =
    limpiarUrl(url);

  if (!valor) {
    return '';
  }

  if (
    !valor.startsWith('http://') &&
    !valor.startsWith('https://')
  ) {
    valor =
      `http://${valor}`;
  }

  try {

    const parsed =
      new URL(valor);

    const hostname =
      parsed.hostname.toLowerCase();

    /*
     * Producción SIEMPRE utiliza HTTPS
     * y nunca :3000.
     */
    if (
      hostname === DOMINIO_PRODUCCION ||
      hostname === `www.${DOMINIO_PRODUCCION}`
    ) {
      return `https://${DOMINIO_PRODUCCION}`;
    }

    if (
      !parsed.port &&
      (
        esHostLocal(hostname) ||
        !hostname.includes('.')
      )
    ) {
      return (
        `${parsed.protocol}//${hostname}:${PUERTO_API_LOCAL}`
      );
    }

    return parsed.origin;

  } catch {

    return valor;
  }
};

export const getApiUrl = () => {

  /*
   * PRODUCCIÓN SIEMPRE TIENE PRIORIDAD.
   *
   * Esto es importante porque puede existir
   * localStorage antiguo con:
   *
   * localhost:3000
   * 127.0.0.1:3000
   * 192.168.x.x:3000
   */
  if (esProduccionWeb()) {

    const origen =
      window.location.origin;

    localStorage.setItem(
      URL_KEY,
      origen
    );

    localStorage.removeItem(
      LEGACY_KEYS[0]
    );

    return origen;
  }

  /*
   * URL guardada para Electron/LAN.
   */
  const guardada =
    localStorage.getItem(URL_KEY) ||
    localStorage.getItem(
      LEGACY_KEYS[0]
    );

  if (guardada) {

    const normalizada =
      normalizarUrl(guardada);

    if (normalizada) {

      localStorage.setItem(
        URL_KEY,
        normalizada
      );

      localStorage.removeItem(
        LEGACY_KEYS[0]
      );

      return normalizada;
    }
  }

  /*
   * Electron.
   */
  if (esElectron()) {
    return `http://localhost:${PUERTO_API_LOCAL}`;
  }

  /*
   * Navegador LAN.
   */
  const {
    protocol,
    hostname,
    origin
  } = window.location;

  if (esHostLocal(hostname)) {

    const protocolo =
      protocol === 'https:'
        ? 'https:'
        : 'http:';

    return (
      `${protocolo}//${hostname}:${PUERTO_API_LOCAL}`
    );
  }

  /*
   * Cualquier otro dominio:
   * mismo origen.
   */
  return origin;
};

export const setApiUrl = (url) => {

  if (!url) {
    return '';
  }

  const normalizada =
    normalizarUrl(url);

  if (!normalizada) {
    return '';
  }

  localStorage.setItem(
    URL_KEY,
    normalizada
  );

  localStorage.removeItem(
    LEGACY_KEYS[0]
  );

  return normalizada;
};

export const clearApiUrl = () => {

  localStorage.removeItem(
    URL_KEY
  );

  LEGACY_KEYS.forEach(
    (key) => {
      localStorage.removeItem(key);
    }
  );
};

export const esProduccion =
  esProduccionWeb;

export const esElectronApp =
  esElectron;

export const esServidorLocal =
  esHostLocal;
