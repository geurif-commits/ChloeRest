/*
 * ═══════════════════════════════════════════════════════════════════
 * ESTILOS DE LA PANTALLA DE LOGIN Y DEL PINPAD (tres opciones)
 * ═══════════════════════════════════════════════════════════════════
 * - esmeralda:  verde Chloe; el panel de acceso sigue el tema claro/oscuro del sistema.
 * - marfil:     luz cálida con acentos dorados y panel de marca espresso.
 * - medianoche: azul noche profundo con acento eléctrico (siempre oscuro).
 * El estilo se aplica con data-login-skin en <html> (ver personalizacion.js y login-screen.css).
 */

export const LOGIN_TEMA_DEFAULT = 'esmeralda';

export const LOGIN_TEMAS = [
  {
    id: 'esmeralda',
    nombre: 'Esmeralda',
    badge: 'Sistema',
    icon: 'Sun',
    categoria: 'Luz',
    desc: 'Verde Chloe. Sigue el tema claro u oscuro del sistema.',
    paleta: ['#0f2a1b', '#eef1ec', '#1f6b45', '#46c283'],
  },
  {
    id: 'marfil',
    nombre: 'Marfil dorado',
    badge: 'Luz',
    icon: 'Crown',
    categoria: 'Luz',
    desc: 'Cálido y elegante: marfil con acentos dorados.',
    paleta: ['#2b2010', '#f2ede3', '#a9761b', '#e6bc5a'],
  },
  {
    id: 'medianoche',
    nombre: 'Medianoche',
    badge: 'Noche',
    icon: 'Moon',
    categoria: 'Oscuro',
    desc: 'Azul noche profundo con acento eléctrico, ideal para ambientes oscuros.',
    paleta: ['#0a1024', '#0d1426', '#5b8cff', '#9db8ff'],
  },
];
