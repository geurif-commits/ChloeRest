/**
 * Identidad gráfica de ChloeRestaurant: isotipo (C dorada + gorro de chef + tenedor y hoja), tipografía de marca
 * convertida a trazos y paletas por tema (Dorado, Zafiro, Esmeralda). Todo devuelve SVG listo para incrustar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ paletas
export const TEMAS = {
  dorado: {
    metal: ['#FFF1B8', '#FFD25A', '#F2A91E', '#FFD768', '#B36A00'],
    metalOscuro: ['#E2A526', '#B87A0C', '#8A5A00'],
    disco: ['#172A46', '#081221', '#02050A'],
    acento: '#F5B83D',
    claro: '#FFE9A8',
  },
  zafiro: {
    metal: ['#E6F0FF', '#A8C4FF', '#5E94FF', '#8FB2FF', '#2A52C4'],
    metalOscuro: ['#6E9BFF', '#3A72E8', '#24479E'],
    disco: ['#10224D', '#0A1633', '#040A1A'],
    acento: '#5E94FF',
    claro: '#CFE0FF',
  },
  esmeralda: {
    metal: ['#DBFFEC', '#8EEBBA', '#46C283', '#7FE0AE', '#1C7A52'],
    metalOscuro: ['#52C98B', '#2FA06A', '#1B6B47'],
    disco: ['#14301F', '#0C1F15', '#050E09'],
    acento: '#46C283',
    claro: '#C9F6DE',
  },
};
export const COLORES = { marino: '#0A1426', marinoProfundo: '#050A14', crema: '#F8F4EC', tinta: '#1B1710', blanco: '#FFFFFF' };

// ------------------------------------------------------------------ tipografía (a trazos)
function abrirFuente(rel) {
  const b = fs.readFileSync(path.join(AQUI, 'node_modules', '@fontsource', rel));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
export const FUENTES = {
  marca: abrirFuente('fraunces/files/fraunces-latin-800-normal.woff'),
  marcaItalica: abrirFuente('fraunces/files/fraunces-latin-700-italic.woff'),
  ui: abrirFuente('inter/files/inter-latin-600-normal.woff'),
  uiFuerte: abrirFuente('inter/files/inter-latin-700-normal.woff'),
  uiNormal: abrirFuente('inter/files/inter-latin-500-normal.woff'),
};

/** Texto convertido a trazos. `tracking` en em (0.2 = 20 % del tamaño). Devuelve { d, ancho, alto }. */
export function trazos(fuente, texto, { size, tracking = 0 }) {
  let x = 0;
  const partes = [];
  const glifos = [...texto].map((c) => fuente.charToGlyph(c));
  glifos.forEach((g, i) => {
    partes.push(g.getPath(x, 0, size).toPathData(2));
    let avance = (g.advanceWidth * size) / fuente.unitsPerEm;
    if (i < glifos.length - 1) {avance += (fuente.getKerningValue(g, glifos[i + 1]) * size) / fuente.unitsPerEm;}
    x += avance + tracking * size;
  });
  return { d: partes.join(' '), ancho: x - tracking * size, alto: size };
}

/** <path> de texto colocado en (x, y de la línea base). `ancla`: 'inicio' | 'centro' | 'fin'. */
export function texto(fuente, cadena, { x, y, size, tracking = 0, relleno, ancla = 'inicio', extra = '' }) {
  const t = trazos(fuente, cadena, { size, tracking });
  const dx = ancla === 'centro' ? -t.ancho / 2 : ancla === 'fin' ? -t.ancho : 0;
  return { svg: `<path d="${t.d}" transform="translate(${(x + dx).toFixed(2)} ${y})" fill="${relleno}" ${extra}/>`, ancho: t.ancho };
}

// ------------------------------------------------------------------ degradados
const grad = (id, stops, { x1 = 0.15, y1 = 0.05, x2 = 0.85, y2 = 0.95 } = {}) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;

/** Definiciones (degradados) de un tema; `p` es el prefijo de ids para poder repetir marcas en un mismo SVG. */
export function defs(p, tema = 'dorado') {
  const t = TEMAS[tema];
  return `
    ${grad(`${p}-metal`, t.metal)}
    ${grad(`${p}-metalOsc`, t.metalOscuro, { x1: 0, y1: 0, x2: 1, y2: 1 })}
    <radialGradient id="${p}-disco" cx="50%" cy="36%" r="78%">
      <stop offset="0" stop-color="${t.disco[0]}"/><stop offset=".72" stop-color="${t.disco[1]}"/><stop offset="1" stop-color="${t.disco[2]}"/>
    </radialGradient>
    <linearGradient id="${p}-gorro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#F4EFE3"/><stop offset="1" stop-color="#DDD5C0"/>
    </linearGradient>
    <linearGradient id="${p}-cubierto" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFBEA"/><stop offset="1" stop-color="${t.claro}"/>
    </linearGradient>
    <filter id="${p}-sombra" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".55"/>
    </filter>`;
}

// ------------------------------------------------------------------ geometría de la "C"
const rad = (g) => (g * Math.PI) / 180;
const pt = (cx, cy, r, g) => [cx + r * Math.cos(rad(g)), cy - r * Math.sin(rad(g))];
const f = (n) => n.toFixed(2);

/** La C: círculo exterior y círculo interior desplazado (más gruesa a la izquierda, más fina en las puntas). */
function trazoC({ cx = 250, cy = 304, R = 116, r = 76, dx = 14, abertura = 41 }) {
  const [ox1, oy1] = pt(cx, cy, R, abertura);
  const [ox2, oy2] = pt(cx, cy, R, -abertura);
  const icx = cx + dx;
  const [ix1, iy1] = pt(icx, cy, r, abertura);
  const [ix2, iy2] = pt(icx, cy, r, -abertura);
  return `M${f(ox1)} ${f(oy1)} A${R} ${R} 0 1 0 ${f(ox2)} ${f(oy2)} L${f(ix2)} ${f(iy2)} A${r} ${r} 0 1 1 ${f(ix1)} ${f(iy1)} Z`;
}

// ------------------------------------------------------------------ isotipo
/**
 * Isotipo en un lienzo de 512 x 512.
 * opciones: p (prefijo de ids), tema, modo ('color' | 'mono'), color (mono), aro (disco+aros),
 * nivel ('completo' | 'simple' | 'minimo'): menos detalle para tamaños pequeños.
 */
export function isotipo({ p = 'iso', tema = 'dorado', modo = 'color', color = '#FFFFFF', aro = true, nivel = 'completo' } = {}) {
  const mono = modo === 'mono';
  const completo = nivel === 'completo';
  const minimo = nivel === 'minimo';
  const t = TEMAS[tema];
  const metal = mono ? color : `url(#${p}-metal)`;
  const metalOsc = mono ? color : `url(#${p}-metalOsc)`;
  const cubierto = mono ? color : t.claro;
  const sombra = mono ? '' : `filter="url(#${p}-sombra)"`;
  const cy = minimo ? 256 : 306;

  // ---- disco y aros
  const grosorAro = minimo ? 22 : completo ? 12 : 18;
  const disco = !aro
    ? ''
    : mono
      ? `<circle cx="256" cy="${cy}" r="${minimo ? 236 : 200}" fill="none" stroke="${color}" stroke-width="${grosorAro}"/>`
      : `<circle cx="256" cy="${cy}" r="${minimo ? 250 : 206}" fill="url(#${p}-disco)"/>
         <circle cx="256" cy="${cy}" r="${minimo ? 238 : completo ? 200 : 196}" fill="none" stroke="${metal}" stroke-width="${grosorAro}"/>
         ${completo ? `<circle cx="256" cy="${cy}" r="181" fill="none" stroke="${t.acento}" stroke-opacity=".28" stroke-width="2"/>` : ''}`;

  // ---- la C
  const ccy = minimo ? 262 : completo ? 308 : 312;
  const cR = minimo ? 150 : completo ? 116 : 124;
  const cr = minimo ? 96 : completo ? 76 : 80;
  const letraC = `<path d="${trazoC({ cy: ccy, R: cR, r: cr, cx: minimo ? 244 : 250, dx: minimo ? 18 : 14 })}" fill="${metal}" stroke="${metal}" stroke-width="${minimo ? 9 : 7}" stroke-linejoin="round" ${sombra}/>`;
  const brillo = mono || !completo
    ? ''
    : `<path d="M150 294 C152 252 176 220 214 208" fill="none" stroke="#FFFFFF" stroke-opacity=".38" stroke-width="5" stroke-linecap="round"/>`;

  // ---- tenedor (en el hueco de la C)
  const fx = minimo ? 262 : 268;
  const ft = minimo ? 218 : completo ? 252 : 258;     // punta de los dientes
  const largoDiente = minimo ? 46 : 42;
  const sep = minimo ? 19 : 16;
  const gD = minimo ? 11 : completo ? 7 : 8.5;          // grosor de los dientes
  const pie = ft + largoDiente + 16;                    // arranque del mango
  const finMango = pie + (minimo ? 72 : completo ? 66 : 62);
  const tenedor = `
    <g fill="none" stroke="${cubierto}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${fx - sep} ${ft} V${ft + largoDiente - 8} Q${fx - sep} ${pie} ${fx} ${pie} Q${fx + sep} ${pie} ${fx + sep} ${ft + largoDiente - 8} V${ft}" stroke-width="${gD}"/>
      <path d="M${fx} ${ft} V${pie}" stroke-width="${gD}"/>
      <path d="M${fx} ${pie} V${finMango}" stroke-width="${gD + 3}"/>
    </g>`;

  // ---- hojas (brote del mango)
  const hoja = (esc, giro) => `<g transform="translate(${fx} ${finMango - 20}) rotate(${giro}) scale(${esc})">
      <path d="M0 0 C-34 -2 -54 -30 -46 -60 C-14 -58 6 -32 0 0 Z" fill="${metalOsc}" ${mono ? '' : `stroke="${t.claro}" stroke-width="1.6"`}/>
      ${mono ? '' : `<path d="M-40 -52 L-3 -6" stroke="${t.metalOscuro[2]}" stroke-width="2.4" stroke-linecap="round"/>`}
    </g>`;
  const hojas = completo ? hoja(1, -6) + hoja(0.68, 28).replace(/scale\(0\.68\)/, 'scale(-0.68 0.68)') : '';

  // ---- gorro de chef: tres bulbos, cuerpo que se ensancha hacia arriba y banda
  const dy = minimo ? -999 : completo ? 0 : 6;
  const gorro = minimo
    ? ''
    : (() => {
        const bulbos = [[212, 102 + dy, 32], [256, 84 + dy, 40], [300, 102 + dy, 32]];
        const cuerpo = `M196 ${140 + dy} C186 124 180 110 184 96 L328 96 C332 110 326 124 316 ${140 + dy} Z`;
        const forma = `${bulbos.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}<path d="${cuerpo}"/>`;
        const banda = `<rect x="190" y="${134 + dy}" width="132" height="${completo ? 30 : 34}" rx="8" fill="${metal}" ${mono ? '' : 'stroke="#7A4A00" stroke-opacity=".4" stroke-width="1.5"'}/>`;
        const pliegues = mono || !completo
          ? ''
          : `<g fill="none" stroke="#CFC6AE" stroke-width="2.6" stroke-linecap="round" opacity=".9">
               <path d="M230 ${136 + dy} C226 120 227 108 232 96"/><path d="M282 ${136 + dy} C286 120 285 108 280 96"/><path d="M256 ${134 + dy} V108"/>
             </g>`;
        if (mono) {
          const m = `${p}-mgorro`;
          return `<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/><g fill="#000">${forma}</g></mask>
                  <g mask="url(#${m})" fill="none" stroke="${color}" stroke-width="18" stroke-linejoin="round">${forma}</g>${banda}`;
        }
        return `<g ${sombra}><g fill="${metal}" stroke="${metal}" stroke-width="11" stroke-linejoin="round">${forma}</g></g>
                <g fill="url(#${p}-gorro)">${forma}</g>${pliegues}${banda}`;
      })();

  return `<g id="${p}-isotipo">${disco}${letraC}${brillo}${tenedor}${hojas}${gorro}</g>`;
}

// ------------------------------------------------------------------ envoltorio SVG
export function svg(ancho, alto, contenido, { vista = `0 0 ${ancho} ${alto}`, fondo = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="${vista}">${fondo}${contenido}</svg>`;
}
