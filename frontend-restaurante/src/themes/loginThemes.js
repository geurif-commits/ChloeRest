/*
 * ═══════════════════════════════════════════════════════════════════
 * ESTILOS DE LA PANTALLA DE LOGIN Y DEL PINPAD (tres opciones)
 * ═══════════════════════════════════════════════════════════════════
 * - sistema:    "Del sistema": sigue el tema activo (Marfil Dorado, Oscuro Zafiro u Oscuro Esmeralda).
 * - medianoche: azul noche profundo con acento eléctrico (siempre oscuro).
 * - bosque:     verde bosque profundo con acento esmeralda (siempre oscuro).
 * El estilo se aplica con data-login-skin en <html> (ver personalizacion.js y ui/premium/premium-skins.css).
 */

export const LOGIN_TEMAS = [
  {
    id: 'sistema',
    nombre: 'Del sistema',
    desc: 'Usa los colores del tema activo del sistema.',
    paleta: ['#2b2010', '#f2ede3', '#835b15', '#5e94ff'],
  },
  {
    id: 'medianoche',
    nombre: 'Medianoche',
    desc: 'Azul noche profundo con acento eléctrico, siempre oscuro.',
    paleta: ['#0a1024', '#0d1426', '#5b8cff', '#9db8ff'],
  },
  {
    id: 'bosque',
    nombre: 'Bosque',
    desc: 'Verde bosque profundo con acento esmeralda, siempre oscuro.',
    paleta: ['#0f2a1b', '#16201a', '#46c283', '#9be8bf'],
  },
];
