/*
 * ═══════════════════════════════════════════════════════════════════
 * TEMAS PREMIUM DE LA PANTALLA DE LOGIN
 * ═══════════════════════════════════════════════════════════════════
 * Cada tema define un juego de variables CSS (--tl-*) que pinta la
 * pantalla de PIN. El tema por defecto (chef_noir) replica el aspecto
 * original del login, por lo que un sistema sin configurar se ve igual
 * que siempre.
 *
 * Los valores personalizables desde el panel de administración
 * (color de acento, tipo de fondo, desenfoque) se aplican como
 * estilos en línea sobre la raíz `.premium-login`, por lo que tienen
 * prioridad sobre cualquier hoja de estilos.
 */

export const LOGIN_TEMA_DEFAULT = 'chef_noir';

export const LOGIN_TEMAS = [
  {
    id: 'chef_noir',
    nombre: 'Gold Noir Luxury',
    badge: 'Luxury',
    icon: 'Crown',
    desc: 'Obsidian azabache con oro pulido 24k. Elegancia clásica de alta cocina y fine dining.',
    paleta: ['#07090f', '#1b2339', '#d4a017', '#e6c040'],
    categoria: 'Oscuro'
  },
  {
    id: 'cyberpunk_neon',
    nombre: 'Cyberpunk Neón',
    badge: 'Neón',
    icon: 'Zap',
    desc: 'Fondo oscuro futurista con cian neón eléctrico y magenta resplandeciente.',
    paleta: ['#050814', '#0f172a', '#00f0ff', '#ff007f'],
    categoria: 'Futurista'
  },
  {
    id: 'warm_cafe',
    nombre: 'Warm Café & Bistro',
    badge: 'Café',
    icon: 'Coffee',
    desc: 'Tonos café expreso, caramelo y madera cálida para cafeterías y panaderías.',
    paleta: ['#1c130e', '#2e1d13', '#d4a373', '#faedcd'],
    categoria: 'Cálido'
  },
  {
    id: 'nordic_clean',
    nombre: 'Nordic Minimalist',
    badge: 'Minimal',
    icon: 'Leaf',
    desc: 'Estética escandinava limpia con grafito mate y esmeralda orgánico.',
    paleta: ['#0a0f16', '#131b26', '#10b981', '#34d399'],
    categoria: 'Moderno'
  },
  {
    id: 'ocean_chef',
    nombre: 'Deep Ocean & Aqua',
    badge: 'Océano',
    icon: 'Waves',
    desc: 'Azules abisales con turquesa marino translúcido y reflejos cristalinos.',
    paleta: ['#041014', '#0d232c', '#00c49f', '#38bdf8'],
    categoria: 'Fresco'
  },
  {
    id: 'crimson_grill',
    nombre: 'Crimson Steakhouse',
    badge: 'Grill',
    icon: 'Flame',
    desc: 'Hierro forjado y carbón volcánico con acentos rojo rubí ardiente para asadores.',
    paleta: ['#140808', '#261111', '#ef4444', '#f97316'],
    categoria: 'Fuego'
  },
  {
    id: 'night_lounge',
    nombre: 'Velvet Night Lounge',
    badge: 'Lounge',
    icon: 'Martini',
    desc: 'Púrpura aterciopelado con violeta neón para bares nocturnos y coctelería.',
    paleta: ['#0a0714', '#1f132e', '#a855f7', '#c084fc'],
    categoria: 'Nocturno'
  },
  {
    id: 'olive_garden',
    nombre: 'Olive & Sage Light',
    badge: 'Claro',
    icon: 'Sun',
    desc: 'Fondo crema suave y verde salvia natural para terrazas y ambientes abiertos.',
    paleta: ['#f5f0e6', '#e8e0d0', '#4a7c59', '#6b9e78'],
    categoria: 'Luz'
  },
];
