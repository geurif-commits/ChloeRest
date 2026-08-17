const VAR_STYLE_ID = 'pos-personalizacion-vars';

function oscurecerColor(hex, factor = 0.18) {
  const limpiar = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpiar)) return hex;
  const r = Math.max(0, Math.round(parseInt(limpiar.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(limpiar.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(limpiar.slice(4, 6), 16) * (1 - factor)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function aColorRgba(hex, alpha) {
  const limpiar = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpiar)) return null;
  const r = parseInt(limpiar.slice(0, 2), 16);
  const g = parseInt(limpiar.slice(2, 4), 16);
  const b = parseInt(limpiar.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Aplica la personalización del sistema al documento:
 *  - tema activo (data-theme)
 *  - colores personalizados como variables CSS (:root)
 *  - guarda el tema como preferencia local
 */
export function aplicarPersonalizacion(config, negocioConfig) {
  if (!config) return;
  const tema = config.tema_activo || 'noche';
  document.documentElement.setAttribute('data-theme', tema);

  const primario = config.color_primario ? String(config.color_primario).trim() : '';
  const secundario = config.color_secundario ? String(config.color_secundario).trim() : '';

  document.getElementById(VAR_STYLE_ID)?.remove();

  const cssVars = [];
  if (primario) {
    const glow = aColorRgba(primario, 0.3) || primario;
    const hover = oscurecerColor(primario);
    cssVars.push(
      `--accent: ${primario} !important;`,
      `--accent-hover: ${secundario || hover} !important;`,
      `--accent-secondary: ${secundario || hover} !important;`,
      `--accent-glow: ${glow} !important;`,
      `--success: ${primario} !important;`
    );
  }

  if (negocioConfig) {
    if (negocioConfig.mesa_color_disponible) cssVars.push(`--mesa-disponible: ${negocioConfig.mesa_color_disponible};`);
    if (negocioConfig.mesa_color_ocupada) cssVars.push(`--mesa-ocupada: ${negocioConfig.mesa_color_ocupada};`);
    if (negocioConfig.mesa_color_reservada) cssVars.push(`--mesa-reservada: ${negocioConfig.mesa_color_reservada};`);
  }

  if (cssVars.length) {
    const style = document.createElement('style');
    style.id = VAR_STYLE_ID;
    style.textContent = `:root, [data-theme="${tema}"] { ${cssVars.join('\n')} }`;
    document.head.appendChild(style);
  }
}

export function fondoLogin(config) {
  return config?.fondo_login_url || '';
}
