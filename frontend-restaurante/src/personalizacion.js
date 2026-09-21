const VAR_STYLE_ID = 'pos-personalizacion-vars';

/**
 * Temas oficiales (configuracion_sistema.tema_activo). Cada uno se traduce a atributos de <html>:
 *   marfil-dorado    → data-theme="claro-luxury-gold"            (claro, marfil y dorado)
 *   negro-brillante  → data-theme="negro-brillante"              (oscuro, zafiro)
 *   esmeralda-oscuro → data-theme="negro-brillante" data-paleta="esmeralda" (oscuro, esmeralda)
 * Los reglas de CSS antiguas por tema claro/oscuro siguen aplicando porque la base (claro/oscuro) se conserva.
 */
export const TEMAS_SISTEMA = ['marfil-dorado', 'negro-brillante', 'esmeralda-oscuro'];
export const TEMA_DEFECTO = 'marfil-dorado';
export const LOGIN_SKINS = ['sistema', 'medianoche', 'bosque'];
const CLAVE_LOCAL = 'POS_THEME_LOCAL';

let temaServidor = TEMA_DEFECTO;

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Tema válido; el valor claro histórico ('claro-luxury-gold') pasa a marfil-dorado. */
export const normalizarTema = (id) => (TEMAS_SISTEMA.includes(id) ? id : TEMA_DEFECTO);
export const esTemaOscuro = (id) => normalizarTema(id) !== 'marfil-dorado';

/** Escribe el tema en <html>: data-theme (base) y data-paleta (variante). */
export function aplicarTemaId(id) {
  const tema = normalizarTema(id);
  const raiz = document.documentElement;
  raiz.setAttribute('data-theme', esTemaOscuro(tema) ? 'negro-brillante' : 'claro-luxury-gold');
  if (tema === 'esmeralda-oscuro') raiz.setAttribute('data-paleta', 'esmeralda');
  else raiz.removeAttribute('data-paleta');
  return tema;
}

/** Identificador oficial del tema que se está mostrando. */
export function temaActualId() {
  const raiz = document.documentElement;
  if (raiz.getAttribute('data-theme') !== 'negro-brillante') return 'marfil-dorado';
  return raiz.getAttribute('data-paleta') === 'esmeralda' ? 'esmeralda-oscuro' : 'negro-brillante';
}

/** Alterna claro/oscuro en este terminal (preferencia local que no se pierde al recargar la configuración). */
export function alternarTemaLocal() {
  const pasarAOscuro = !esTemaOscuro(temaActualId());
  // Se vuelve al tema elegido por el sistema si coincide con el modo pedido; si no, al predeterminado de ese modo.
  const nuevo = esTemaOscuro(temaServidor) === pasarAOscuro ? temaServidor : (pasarAOscuro ? 'negro-brillante' : TEMA_DEFECTO);
  escribir(CLAVE_LOCAL, nuevo);
  escribir('POS_THEME', nuevo);
  aplicarTemaId(nuevo);
}

/** El administrador eligió un tema para todo el sistema: se descarta la preferencia local. */
export function fijarTemaSistema(id) {
  escribir(CLAVE_LOCAL, null);
  const aplicado = aplicarTemaId(id);
  temaServidor = aplicado;
  escribir('POS_THEME', aplicado);
}

/**
 * Aplica la personalización del sistema al documento:
 *  - tema activo (data-theme / data-paleta) y estilo del login (data-login-skin)
 *  - colores de mesa como variables CSS (:root)
 */
export function aplicarPersonalizacion(config, negocioConfig) {
  if (!config) return;
  temaServidor = normalizarTema(config.tema_activo || leer('POS_THEME'));

  // La elección local del terminal (botón claro/oscuro) prevalece sobre la configuración cargada del servidor.
  const local = leer(CLAVE_LOCAL);
  const tema = local ? normalizarTema(local) : temaServidor;
  aplicarTemaId(tema);
  escribir('POS_THEME', tema);

  const skin = LOGIN_SKINS.includes(config.login_theme) ? config.login_theme : 'sistema';
  document.documentElement.setAttribute('data-login-skin', skin);

  document.getElementById(VAR_STYLE_ID)?.remove();

  const cssVars = [];

  if (negocioConfig) {
    if (negocioConfig.mesa_color_disponible) cssVars.push(`--mesa-disponible: ${negocioConfig.mesa_color_disponible};`);
    if (negocioConfig.mesa_color_ocupada) cssVars.push(`--mesa-ocupada: ${negocioConfig.mesa_color_ocupada};`);
    if (negocioConfig.mesa_color_reservada) cssVars.push(`--mesa-reservada: ${negocioConfig.mesa_color_reservada};`);
  }

  if (cssVars.length) {
    const style = document.createElement('style');
    style.id = VAR_STYLE_ID;
    style.textContent = `:root[data-theme] { ${cssVars.join('\n')} }`;
    document.head.appendChild(style);
  }

  if (config.nombre_negocio) {
    document.title = `${config.nombre_negocio} - Sistema de Gestión`;
  }

  // Favicon / ícono del sistema: usa el logo del negocio si está asignado
  const logoUrl = config.logo_url || negocioConfig?.logo_url;
  const faviconLink =
    document.querySelector('link[rel="icon"]') ||
    document.querySelector('link[rel="shortcut icon"]');
  if (faviconLink && logoUrl) {
    const url = String(logoUrl).trim();
    if (url && !faviconLink.getAttribute('href')?.includes(url)) {
      faviconLink.setAttribute('href', url);
    }
  }
}

export function fondoLogin(config) {
  return config?.fondo_login_url || '';
}
