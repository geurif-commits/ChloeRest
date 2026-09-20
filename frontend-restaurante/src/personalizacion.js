const VAR_STYLE_ID = 'pos-personalizacion-vars';

/** Los tres temas oficiales. marfil-dorado es una paleta clara sobre la base claro-luxury-gold. */
export const TEMAS_SISTEMA = ['claro-luxury-gold', 'negro-brillante', 'marfil-dorado'];
export const LOGIN_SKINS = ['esmeralda', 'marfil', 'medianoche'];
const CLAVE_LOCAL = 'POS_THEME_LOCAL';

let temaServidor = 'claro-luxury-gold';

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Escribe el tema en <html>: data-theme (base) y data-paleta (variante). */
export function aplicarTemaId(id) {
  const tema = TEMAS_SISTEMA.includes(id) ? id : 'claro-luxury-gold';
  const raiz = document.documentElement;
  raiz.setAttribute('data-theme', tema === 'marfil-dorado' ? 'claro-luxury-gold' : tema);
  if (tema === 'marfil-dorado') raiz.setAttribute('data-paleta', 'dorado');
  else raiz.removeAttribute('data-paleta');
  return tema;
}

/** Identificador oficial del tema que se está mostrando. */
export function temaActualId() {
  const raiz = document.documentElement;
  const base = raiz.getAttribute('data-theme');
  if (base === 'negro-brillante') return 'negro-brillante';
  return raiz.getAttribute('data-paleta') === 'dorado' ? 'marfil-dorado' : 'claro-luxury-gold';
}

/** Alterna claro/oscuro en este terminal (preferencia local que no se pierde al recargar la configuración). */
export function alternarTemaLocal() {
  const nuevo = temaActualId() === 'negro-brillante'
    ? (temaServidor === 'negro-brillante' ? 'claro-luxury-gold' : temaServidor)
    : 'negro-brillante';
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
 * Opciones: { soloVistaPrevia: true } aplica el tema pedido sin tocar el almacenamiento local.
 */
export function aplicarPersonalizacion(config, negocioConfig, opciones = {}) {
  if (!config) return;
  const solicitadoServidor = String(config.tema_activo || leer('POS_THEME') || 'claro-luxury-gold');
  temaServidor = TEMAS_SISTEMA.includes(solicitadoServidor) ? solicitadoServidor : 'claro-luxury-gold';

  // La elección local del terminal (botón claro/oscuro) prevalece sobre la configuración cargada del servidor.
  const local = opciones.soloVistaPrevia ? null : leer(CLAVE_LOCAL);
  const tema = TEMAS_SISTEMA.includes(local) ? local : temaServidor;
  aplicarTemaId(tema);
  escribir('POS_THEME', tema);

  const skin = LOGIN_SKINS.includes(config.login_theme) ? config.login_theme : 'esmeralda';
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
