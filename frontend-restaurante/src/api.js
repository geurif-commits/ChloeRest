const TOKEN_KEY = 'POS_SESSION_TOKEN';

const PUBLIC_PATHS = [
  '/api/login/camarero',
  '/api/licencia/verificar',
  '/api/health',
  '/api/configuracion/sistema',
  '/api/setup/completar',
  '/api/setup/registro',
  '/api/dispositivo/registrar',
  '/api/dispositivo/activar',
  '/api/planes',
  '/api/solicitud-licencia',
  '/api/dueno/login',
];

const PRODUCCION_HOSTS = new Set([
  'chloerestaurant.lat',
  'www.chloerestaurant.lat',
]);

function esProduccionWeb() {
  if (typeof window === 'undefined') return false;

  return (
    (window.location.protocol === 'https:' ||
      window.location.protocol === 'http:') &&
    PRODUCCION_HOSTS.has(
      window.location.hostname.toLowerCase()
    )
  );
}

function requestPathname(input) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input?.url || '';

  try {
    return new URL(
      rawUrl,
      window.location.origin
    ).pathname;
  } catch {
    return rawUrl;
  }
}

function esHostLocal(hostname = '') {
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
}

/**
 * En producción TODO el tráfico de API debe permanecer
 * en el mismo origen HTTPS.
 *
 * /api/...
 * /uploads/...
 * /assets/...
 *
 * Esto evita completamente:
 *
 * localhost:3000
 * 127.0.0.1:3000
 * 192.168.x.x:3000
 * 10.x.x.x:3000
 */
function resolverUrlObjetivo(input) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input?.url || '';

  if (
    rawUrl.startsWith('/') &&
    !rawUrl.startsWith('//')
  ) {
    return rawUrl;
  }

  if (esProduccionWeb()) {
    try {
      const url = new URL(
        rawUrl,
        window.location.origin
      );

      const hostname =
        url.hostname.toLowerCase();

      const esProduccion =
        PRODUCCION_HOSTS.has(hostname);

      const esLocal =
        esHostLocal(hostname);

      /*
       * En producción:
       *
       * localhost       -> mismo origen
       * 127.0.0.1       -> mismo origen
       * 192.168.x.x     -> mismo origen
       * 10.x.x.x        -> mismo origen
       * 172.16-31.x.x   -> mismo origen
       * :3000           -> mismo origen
       *
       * También corregimos cualquier URL absoluta
       * que ya pertenezca a chloerestaurant.lat.
       */
      if (
        esLocal ||
        esProduccion ||
        url.port === '3000'
      ) {
        return (
          window.location.origin +
          url.pathname +
          url.search +
          url.hash
        );
      }

      /*
       * Si es un dominio externo real, se conserva.
       */
      return url.toString();

    } catch {
      return rawUrl;
    }
  }

  /*
   * Electron / LAN / instalación local.
   */
  try {
    const url = new URL(rawUrl);

    const currentHost =
      window.location.hostname;

    if (
      (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1'
      ) &&
      currentHost &&
      currentHost !== 'localhost' &&
      currentHost !== '127.0.0.1'
    ) {
      url.hostname = currentHost;

      if (!url.port) {
        url.port = '3000';
      }
    }

    return url.toString();

  } catch {
    return rawUrl;
  }
}

function isPublicRequest(input, init) {
  const path = requestPathname(input);

  if (path === '/api/configuracion/sistema') {
    const metodo = String(
      (init && init.method) ||
      (typeof input === 'object' &&
        input &&
        input.method) ||
      'GET'
    ).toUpperCase();

    return metodo === 'GET';
  }

  if (PUBLIC_PATHS.includes(path)) {
    return true;
  }

  return false;
}

export function obtenerSesion() {
  return localStorage.getItem(TOKEN_KEY);
}

export function guardarSesion(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function borrarSesion() {
  localStorage.removeItem(TOKEN_KEY);
}

export function instalarFetchAutenticado() {
  if (window.__posFetchInstalado) {
    return;
  }

  window.__posFetchInstalado = true;

  const nativeFetch =
    window.fetch.bind(window);

  const TIMEOUT_MS = 15000;

  const actualizarEstadoRed = () => {
    if (!navigator.onLine) {
      window.dispatchEvent(
        new CustomEvent('pos-red-offline')
      );
    } else {
      window.dispatchEvent(
        new CustomEvent('pos-red-online')
      );
    }
  };

  window.addEventListener(
    'online',
    actualizarEstadoRed
  );

  window.addEventListener(
    'offline',
    actualizarEstadoRed
  );

  window.fetch = async (
    input,
    init = {}
  ) => {

    let targetInput;

    if (typeof input === 'string') {

      targetInput =
        resolverUrlObjetivo(input);

    } else if (input instanceof Request) {

      targetInput = new Request(
        resolverUrlObjetivo(input.url),
        input
      );

    } else {

      targetInput = input;
    }

    const token =
      localStorage.getItem(TOKEN_KEY);

    const headers = new Headers(
      init.headers ||
      (
        input instanceof Request
          ? input.headers
          : undefined
      )
    );

    let deviceId = localStorage.getItem('POS_DEVICE_ID');
    if (!deviceId) {
      deviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('POS_DEVICE_ID', deviceId);
    }
    if (deviceId && !headers.has('X-Device-ID')) headers.set('X-Device-ID', deviceId);

    if (
      token &&
      !isPublicRequest(
        targetInput,
        init
      ) &&
      !headers.has('Authorization')
    ) {
      headers.set(
        'Authorization',
        `Bearer ${token}`
      );
    }

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
      );

    let signal;

    /*
     * AbortSignal.any() no existe en navegadores
     * antiguos. Usamos fallback compatible.
     */
    if (
      init.signal &&
      typeof AbortSignal.any === 'function'
    ) {
      signal = AbortSignal.any([
        init.signal,
        controller.signal
      ]);
    } else {
      signal = controller.signal;

      if (init.signal) {
        if (init.signal.aborted) {
          controller.abort();
        } else {
          init.signal.addEventListener(
            'abort',
            () => controller.abort(),
            { once: true }
          );
        }
      }
    }

    try {

      const response =
        await nativeFetch(
          targetInput,
          {
            ...init,
            headers,
            signal
          }
        );

      if (
        response.status === 401 &&
        !isPublicRequest(
          targetInput,
          init
        )
      ) {
        borrarSesion();

        window.dispatchEvent(
          new CustomEvent(
            'pos-sesion-vencida'
          )
        );
      }

      const responseProxy =
        new Proxy(
          response,
          {
            get(
              target,
              prop
            ) {

              if (prop === 'json') {

                return async () => {

                  const text =
                    await target.text();

                  const contentType =
                    target.headers.get(
                      'content-type'
                    ) || '';

                  if (
                    !contentType
                      .toLowerCase()
                      .includes(
                        'application/json'
                      )
                  ) {

                    const preview =
                      text.length > 500
                        ? `${text.slice(0, 500)}...`
                        : text;

                    throw new Error(
                      `Respuesta no válida JSON (${target.status} ${target.statusText}): ${preview}`
                    );
                  }

                  try {

                    return JSON.parse(text);

                  } catch (err) {

                    throw new Error(
                      `Error parseando JSON (${target.status} ${target.statusText}): ${err.message}`
                    );
                  }
                };
              }

              const value =
                Reflect.get(
                  target,
                  prop
                );

              return typeof value === 'function'
                ? value.bind(target)
                : value;
            }
          }
        );

      return responseProxy;

    } catch (error) {

      if (
        error.name === 'AbortError'
      ) {

        throw new Error(
          `Tiempo de espera agotado (${TIMEOUT_MS / 1000}s). El servidor no responde.`
        );
      }

      const mensaje =
        String(
          error?.message || ''
        ).toLowerCase();

      if (
        !navigator.onLine ||
        mensaje.includes('fetch') ||
        mensaje.includes('network') ||
        mensaje.includes('failed to fetch')
      ) {
        window.dispatchEvent(
          new CustomEvent(
            'pos-red-offline'
          )
        );
      }

      throw error;

    } finally {

      clearTimeout(timeoutId);
    }
  };
}
