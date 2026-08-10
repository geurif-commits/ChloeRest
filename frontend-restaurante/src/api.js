const TOKEN_KEY = 'POS_SESSION_TOKEN';
const PUBLIC_PATHS = ['/api/login/camarero', '/api/licencia/verificar', '/api/health', '/api/configuracion/sistema', '/api/setup/completar', '/api/kds/stream', '/api/mesas/stream'];

/**
 * Normaliza la URL solicitada extrayendo solo el pathname (ej. /api/login/camarero).
 * Soporta cadenas de texto y objetos de tipo Request.
 */
function requestPathname(input) {
  const rawUrl = typeof input === 'string' ? input : input?.url || '';
  try {
    // Si la URL es absoluta (http://...), extrae solo el pathname
    return new URL(rawUrl, window.location.origin).pathname;
  } catch {
    return rawUrl;
  }
}

/**
 * Normaliza la URL objetivo para asegurar que apunte al host/IP desde el cual se abrió la app.
 */
function resolverUrlObjetivo(input) {
  const rawUrl = typeof input === 'string' ? input : input?.url || '';
  
  // Si comienza con /api o /uploads, se deja tal cual (el navegador usará el host actual)
  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    const currentHost = window.location.hostname;

    // Solo rehacemos la URL cuando estamos en una página HTTP/HTTPS con hostname válido.
    // En Electron/file:// no debemos reescribir localhost/127.0.0.1 porque genera URL inválidas.
    if (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      currentHost &&
      currentHost !== 'localhost' &&
      currentHost !== '127.0.0.1'
    ) {
      url.hostname = currentHost;
      url.port = window.location.port || url.port || '3000';
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Indica si la URL solicitada corresponde a una ruta pública (no requiere token).
 * /api/configuracion/sistema es pública solo para lectura (GET, usado antes del login
 * y por el wizard); su PUT/POST requiere autenticación.
 */
function isPublicRequest(input, init) {
  const path = requestPathname(input);
  if (path === '/api/configuracion/sistema') {
    const metodo = String(
      (init && init.method) ||
      (typeof input === 'object' && input && input.method) ||
      'GET'
    ).toUpperCase();
    return metodo === 'GET';
  }
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith('/api/kds/') && path.endsWith('/pedidos')) return true;
  if (path.startsWith('/api/kds/despachar/')) return true;
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
  if (window.__posFetchInstalado) return;
  window.__posFetchInstalado = true;

  const nativeFetch = window.fetch.bind(window);
  const TIMEOUT_MS = 15000; // 15 segundos máximo por petición

  // ── Detección de estado de red (online/offline) ──
  const actualizarEstadoRed = () => {
    if (!navigator.onLine) {
      window.dispatchEvent(new CustomEvent('pos-red-offline'));
    } else {
      window.dispatchEvent(new CustomEvent('pos-red-online'));
    }
  };
  window.addEventListener('online', actualizarEstadoRed);
  window.addEventListener('offline', actualizarEstadoRed);

  window.fetch = async (input, init = {}) => {
    // Resolvemos la URL para asegurar que use la IP local del dispositivo que se conecta
    const targetInput = typeof input === 'string' 
      ? resolverUrlObjetivo(input)
      : (input instanceof Request ? new Request(resolverUrlObjetivo(input.url), input) : input);

    const token = localStorage.getItem(TOKEN_KEY);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));

    if (token && !isPublicRequest(targetInput, init) && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // ── Timeout con AbortController ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;

    try {
      const response = await nativeFetch(targetInput, { ...init, headers, signal });

      if (response.status === 401 && !isPublicRequest(targetInput, init)) {
        borrarSesion();
        window.dispatchEvent(new CustomEvent('pos-sesion-vencida'));
      }

      const responseProxy = new Proxy(response, {
        get(target, prop, receiver) {
          if (prop === 'json') {
            return async () => {
              const text = await target.text();
              const contentType = target.headers.get('content-type') || '';
              if (!contentType.toLowerCase().includes('application/json')) {
                const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text;
                throw new Error(`Respuesta no válida JSON (${target.status} ${target.statusText}): ${preview}`);
              }
              try {
                return JSON.parse(text);
              } catch (err) {
                throw new Error(`Error parseando JSON (${target.status} ${target.statusText}): ${err.message}`);
              }
            };
          }
          // IMPORTANTE: pasar 'receiver' aquí invocaría los getters de Response (ok, status...)
          // con this=Proxy y fallarían el brand-check con "TypeError: Illegal invocation".
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });

      return responseProxy;
    } catch (error) {
      // Detectar errores de red para dispatch de evento offline
      if (error.name === 'AbortError') {
        throw new Error(`Tiempo de espera agotado (${TIMEOUT_MS / 1000}s). El servidor no responde.`);
      }
      if (!navigator.onLine || error.message.includes('fetch') || error.message.includes('network')) {
        window.dispatchEvent(new CustomEvent('pos-red-offline'));
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}