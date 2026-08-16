// ════════════════════════════════════════════════════════════════════════
// Chloe Restaurant POS — Design System v3.0
// "Luxury Dark POS"
// ════════════════════════════════════════════════════════════════════════

export const colors = {
  bg: {
    base: '#07090D',
    panel: '#0D1220',
    card: '#151D31',
    cardHover: '#1C2540',
    input: '#0A0E1A',
    overlay: 'rgba(7,9,13,0.85)',
  },
  gold: {
    DEFAULT: '#D4AF37',
    light: '#EBCB72',
    dark: '#B8962E',
    glow: 'rgba(212,175,55,0.25)',
  },
  blue: {
    DEFAULT: '#3D7CFF',
    light: '#6B9DFF',
    glow: 'rgba(61,124,255,0.2)',
  },
  green: {
    DEFAULT: '#30D158',
    glow: 'rgba(48,209,88,0.2)',
  },
  red: {
    DEFAULT: '#FF453A',
    glow: 'rgba(255,69,58,0.2)',
  },
  white: {
    DEFAULT: '#F9FAFB',
    muted: '#9EA6B7',
    dim: '#5C6370',
  },
} as const;

export const radius = {
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  full: '9999px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '40px',
  '3xl': '48px',
} as const;

export const shadows = {
  sm: '0 2px 8px rgba(0,0,0,0.3)',
  md: '0 8px 24px rgba(0,0,0,0.4)',
  lg: '0 16px 48px rgba(0,0,0,0.5)',
  glow: '0 0 20px rgba(212,175,55,0.15)',
} as const;

export const typography = {
  fontFamily: "'Inter', 'Manrope', -apple-system, sans-serif",
  weights: { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  sizes: { xs: '0.7rem', sm: '0.85rem', md: '1rem', lg: '1.2rem', xl: '1.5rem', '2xl': '2rem', '3xl': '3rem' },
} as const;

export const animations = {
  fast: '150ms ease',
  normal: '250ms ease',
  slow: '350ms ease',
  spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

export const glass = {
  background: 'rgba(13,18,32,0.8)',
  border: '1px solid rgba(255,255,255,0.06)',
  blur: 'blur(16px)',
} as const;
