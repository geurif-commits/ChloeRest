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
    metal: ['#FFE9A6', '#F7C645', '#E19A14', '#F8CE5C', '#8E5300'],
    metalOscuro: ['#D9961A', '#A86A06', '#7A4A00'],
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

// ------------------------------------------------------------------ degradados y filtros
const grad = (id, stops, { x1 = 0.15, y1 = 0.05, x2 = 0.85, y2 = 0.95 } = {}) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;

/** Definiciones (degradados y filtros de iluminación) de un tema; `p` es el prefijo de ids (para repetir marcas en un SVG). */
export function defs(p, tema = 'dorado') {
  const t = TEMAS[tema];
  return `
    ${grad(`${p}-metal`, t.metal)}
    ${grad(`${p}-metalOsc`, t.metalOscuro, { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${grad(`${p}-bisel`, [t.metal[0], t.metal[1], t.metal[2], t.metal[4], t.metal[2], t.metal[1]], { x1: 0.1, y1: 0.0, x2: 0.9, y2: 1 })}
    <radialGradient id="${p}-disco" cx="50%" cy="34%" r="80%">
      <stop offset="0" stop-color="${t.disco[0]}"/><stop offset=".62" stop-color="${t.disco[1]}"/><stop offset="1" stop-color="${t.disco[2]}"/>
    </radialGradient>
    <radialGradient id="${p}-brillo" cx="34%" cy="18%" r="62%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}-gorro" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E9E2D0"/><stop offset=".28" stop-color="#FFFFFF"/><stop offset=".72" stop-color="#F6F1E4"/><stop offset="1" stop-color="#D8CFB8"/>
    </linearGradient>
    <linearGradient id="${p}-cubierto" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFBEA"/><stop offset="1" stop-color="${t.claro}"/>
    </linearGradient>
    <filter id="${p}-sombra" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".55"/>
    </filter>
    <filter id="${p}-relieve" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.8" result="b"/>
      <feDiffuseLighting in="b" surfaceScale="6" diffuseConstant="1.1" lighting-color="#FFFFFF" result="d">
        <feDistantLight azimuth="235" elevation="46"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.45" k2="0" k3="0" k4="0" result="sombreado"/>
      <feSpecularLighting in="b" surfaceScale="6" specularConstant="0.95" specularExponent="34" lighting-color="${t.metal[0]}" result="s">
        <feDistantLight azimuth="235" elevation="46"/>
      </feSpecularLighting>
      <feComposite in="s" in2="SourceAlpha" operator="in" result="brillo"/>
      <feComposite in="sombreado" in2="brillo" operator="arithmetic" k1="0" k2="1" k3="0.6" k4="0" result="metal"/>
      <feComposite in="metal" in2="SourceAlpha" operator="in"/>
    </filter>
    <filter id="${p}-halo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="g"/>
      <feFlood flood-color="${t.acento}" flood-opacity=".55"/>
      <feComposite in2="g" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
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

/** Corona de laurel a ambos lados del sello: hojas en lente sobre un tallo en arco. */
function laurel({ cx, cy, R, relleno, tallo, hojas = 9 }) {
  let out = '';
  for (const s of [-1, 1]) {
    out += `<path d="M${f(cx + s * R * Math.sin(rad(8)))} ${f(cy + R * Math.cos(rad(8)))} A${R} ${R} 0 0 ${s === 1 ? 0 : 1} ${f(cx + s * R * Math.sin(rad(106)))} ${f(cy + R * Math.cos(rad(106)))}" fill="none" stroke="${tallo}" stroke-width="3.6" stroke-linecap="round"/>`;
    for (let i = 0; i < hojas; i += 1) {
      const fi = 14 + i * (88 / (hojas - 1));
      const px = cx + s * R * Math.sin(rad(fi));
      const py = cy + R * Math.cos(rad(fi));
      const tang = (Math.atan2(-Math.sin(rad(fi)), s * Math.cos(rad(fi))) * 180) / Math.PI;
      const L = 50 - i * 3.1;
      const W = L * 0.46;
      const hoja = `M0 0 C${f(L * 0.25)} ${f(-W / 2)} ${f(L * 0.72)} ${f(-W / 2)} ${f(L)} 0 C${f(L * 0.72)} ${f(W / 2)} ${f(L * 0.25)} ${f(W / 2)} 0 0 Z`;
      for (const lado of [-1, 1]) {
        const giro = tang + lado * (s === 1 ? 1 : -1) * 34;
        out += `<path d="${hoja}" transform="translate(${f(px)} ${f(py)}) rotate(${f(giro)})" fill="${relleno}"/>`;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ isotipo
/**
 * Isotipo en un lienzo de 512 x 512.
 * opciones: p (prefijo de ids), tema, modo ('color' | 'mono'), color (mono), aro (disco+aros),
 * nivel ('completo' | 'simple' | 'minimo'): menos detalle para tamaños pequeños, halo (resplandor sobre fondos oscuros).
 */
export function isotipo({ p = 'iso', tema = 'dorado', modo = 'color', color = '#FFFFFF', aro = true, nivel = 'completo', halo = false } = {}) {
  const mono = modo === 'mono';
  const completo = nivel === 'completo';
  const minimo = nivel === 'minimo';
  const t = TEMAS[tema];
  const metal = mono ? color : `url(#${p}-metal)`;
  const metalOsc = mono ? color : `url(#${p}-metalOsc)`;
  const bisel = mono ? color : `url(#${p}-bisel)`;
  const cubierto = mono ? color : t.claro;
  const sombra = mono ? '' : `filter="url(#${p}-sombra)"`;
  const relieve = mono ? '' : `filter="url(#${p}-relieve)"`;
  const cy = minimo ? 256 : 306;
  const R0 = minimo ? 250 : 212;                       // radio exterior del bisel
  const gB = minimo ? 28 : completo ? 24 : 20;         // grosor del bisel

  // ---- laurel (solo versión completa)
  const lau = completo && aro ? laurel({ cx: 256, cy, R: 226, relleno: mono ? color : metal, tallo: mono ? color : t.metal[3] }) : '';

  // ---- bisel (anillo de metal pulido), perlas y disco
  const anillo = (r1, r2) => `M256 ${cy - r1} a${r1} ${r1} 0 1 0 0.01 0 Z M256 ${cy - r2} a${r2} ${r2} 0 1 1 -0.01 0 Z`;
  let disco = '';
  if (aro) {
    if (mono) {
      disco = `<circle cx="256" cy="${cy}" r="${R0 - gB / 2}" fill="none" stroke="${color}" stroke-width="${gB * 0.62}"/>`;
    } else {
      const rInt = R0 - gB;
      const perlas = completo
        ? Array.from({ length: 72 }, (_, i) => {
            const [x, y] = pt(256, cy, rInt - 6, i * 5);
            return `<circle cx="${f(x)}" cy="${f(y)}" r="2.3" fill="${t.metal[0]}" opacity=".85"/>`;
          }).join('')
        : '';
      const rayos = completo
        ? Array.from({ length: 48 }, (_, i) => {
            const [x1, y1] = pt(256, cy, 46, i * 7.5);
            const [x2, y2] = pt(256, cy, rInt - 14, i * 7.5);
            return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
          }).join('')
        : '';
      disco = `<g ${halo ? `filter="url(#${p}-halo)"` : ''}>
          <circle cx="256" cy="${cy}" r="${R0 + 2}" fill="#0B0F1A"/>
          <path d="${anillo(R0, rInt)}" fill="${bisel}" fill-rule="evenodd" ${relieve}/>
          <circle cx="256" cy="${cy}" r="${R0 - 1.5}" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="1.6"/>
          <circle cx="256" cy="${cy}" r="${rInt + 1}" fill="none" stroke="#3A2300" stroke-opacity=".55" stroke-width="2"/>
        </g>
        <circle cx="256" cy="${cy}" r="${rInt}" fill="url(#${p}-disco)"/>
        ${completo ? `<g stroke="${t.acento}" stroke-opacity=".07" stroke-width="1.6">${rayos}</g><circle cx="256" cy="${cy}" r="${rInt - 12}" fill="none" stroke="${t.acento}" stroke-opacity=".22" stroke-width="1.4"/>` : ''}
        ${completo ? perlas : ''}
        <circle cx="256" cy="${cy}" r="${rInt}" fill="url(#${p}-brillo)"/>`;
    }
  }

  // ---- la C
  const ccy = minimo ? 262 : completo ? 308 : 312;
  const cR = minimo ? 150 : completo ? 112 : 124;
  const cr = minimo ? 96 : completo ? 73 : 80;
  const trazo = trazoC({ cy: ccy, R: cR, r: cr, cx: minimo ? 244 : 250, dx: minimo ? 18 : 14 });
  const letraC = `<g ${sombra}><path d="${trazo}" fill="${metal}" stroke="${metal}" stroke-width="${minimo ? 9 : 7}" stroke-linejoin="round" ${relieve}/></g>`;
  const brillo = mono || !completo
    ? ''
    : `<path d="M154 296 C156 256 178 226 214 214" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>`;

  // ---- tenedor
  const fx = minimo ? 262 : 266;
  const ft = minimo ? 218 : completo ? 254 : 258;
  const largoDiente = minimo ? 46 : 40;
  const sep = minimo ? 19 : 15;
  const gD = minimo ? 11 : completo ? 6.5 : 8.5;
  const pie = ft + largoDiente + 16;
  const finMango = pie + (minimo ? 72 : completo ? 62 : 62);
  const tenedor = `
    <g fill="none" stroke="${cubierto}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${fx - sep} ${ft} V${ft + largoDiente - 8} Q${fx - sep} ${pie} ${fx} ${pie} Q${fx + sep} ${pie} ${fx + sep} ${ft + largoDiente - 8} V${ft}" stroke-width="${gD}"/>
      <path d="M${fx} ${ft} V${pie}" stroke-width="${gD}"/>
      <path d="M${fx} ${pie} V${finMango}" stroke-width="${gD + 3}"/>
    </g>`;
  const hoja = (esc, giro) => `<g transform="translate(${fx} ${finMango - 18}) rotate(${giro}) scale(${esc})">
      <path d="M0 0 C-34 -2 -54 -30 -46 -60 C-14 -58 6 -32 0 0 Z" fill="${metalOsc}" ${mono ? '' : `stroke="${t.claro}" stroke-width="1.6"`}/>
      ${mono ? '' : `<path d="M-40 -52 L-3 -6" stroke="${t.metalOscuro[2]}" stroke-width="2.4" stroke-linecap="round"/>`}
    </g>`;
  const hojas = completo ? hoja(1, -6) + hoja(0.68, 28).replace(/scale\(0\.68\)/, 'scale(-0.68 0.68)') : '';

  // ---- gorro de chef (esmalte blanco, banda de oro con gema y perlas)
  const dy = minimo ? -999 : completo ? 0 : 6;
  const gorro = minimo
    ? ''
    : (() => {
        const bulbos = [[212, 102 + dy, 32], [256, 84 + dy, 40], [300, 102 + dy, 32]];
        const cuerpo = `M196 ${140 + dy} C186 124 180 110 184 96 L328 96 C332 110 326 124 316 ${140 + dy} Z`;
        const forma = `${bulbos.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}<path d="${cuerpo}"/>`;
        const banda = `<rect x="190" y="${134 + dy}" width="132" height="${completo ? 30 : 34}" rx="8" fill="${metal}" ${mono ? '' : 'stroke="#6B3F00" stroke-opacity=".5" stroke-width="1.5"'}/>`;
        const gema = completo && !mono
          ? `<path d="M256 ${138 + dy} L266 ${149 + dy} L256 ${160 + dy} L246 ${149 + dy} Z" fill="#FFFFFF" fill-opacity=".92" stroke="#6B3F00" stroke-opacity=".6" stroke-width="1.2"/>
             <circle cx="222" cy="${149 + dy}" r="3.4" fill="#FFF7D6" stroke="#6B3F00" stroke-opacity=".5" stroke-width="1"/><circle cx="290" cy="${149 + dy}" r="3.4" fill="#FFF7D6" stroke="#6B3F00" stroke-opacity=".5" stroke-width="1"/>`
          : '';
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
        return `<g ${sombra}><g fill="${bisel}" stroke="${bisel}" stroke-width="11" stroke-linejoin="round">${forma}</g></g>
                <g fill="url(#${p}-gorro)">${forma}</g>${pliegues}${banda}${gema}`;
      })();

  return `<g id="${p}-isotipo">${lau}${disco}${letraC}${brillo}${tenedor}${hojas}${gorro}</g>`;
}

// ------------------------------------------------------------------ envoltorio SVG
export function svg(ancho, alto, contenido, { vista = `0 0 ${ancho} ${alto}`, fondo = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="${vista}">${fondo}${contenido}</svg>`;
}
