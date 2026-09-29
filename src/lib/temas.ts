/**
 * @file Temas de color del sistema y estilos de la pantalla de login / PinPad.
 *
 * Tres temas (configuracion_sistema.tema_activo):
 *   - marfil-dorado    claro, marfil con acentos dorados (por defecto)
 *   - negro-brillante  oscuro, azul zafiro
 *   - esmeralda-oscuro oscuro, verde esmeralda
 * Tres estilos de login/PinPad (configuracion_sistema.login_theme): sistema | medianoche | bosque.
 * Los valores heredados (p. ej. 'claro-luxury-gold', 'olive_garden') se normalizan a los actuales.
 */

export const TEMAS_SISTEMA = ['marfil-dorado', 'negro-brillante', 'esmeralda-oscuro'] as const;
export const TEMA_DEFECTO = 'marfil-dorado';

export const ESTILOS_LOGIN = ['sistema', 'medianoche', 'bosque'] as const;
export const ESTILO_LOGIN_DEFECTO = 'sistema';

/** Devuelve un tema válido: el tema claro histórico ('claro-luxury-gold') pasa a 'marfil-dorado'. */
export function normalizarTema(valor: unknown): string {
  const v = String(valor ?? '').trim();
  if ((TEMAS_SISTEMA as readonly string[]).includes(v)) {return v;}
  return TEMA_DEFECTO;
}

export function esTemaSolicitado(valor: unknown): boolean {
  const v = String(valor ?? '').trim();
  return v === 'claro-luxury-gold' || (TEMAS_SISTEMA as readonly string[]).includes(v);
}

/** Devuelve un estilo de login válido (los valores anteriores pasan a 'sistema'). */
export function normalizarEstiloLogin(valor: unknown): string {
  const v = String(valor ?? '').trim();
  return (ESTILOS_LOGIN as readonly string[]).includes(v) ? v : ESTILO_LOGIN_DEFECTO;
}

export function esEstiloLoginSolicitado(valor: unknown): boolean {
  return (ESTILOS_LOGIN as readonly string[]).includes(String(valor ?? '').trim());
}
