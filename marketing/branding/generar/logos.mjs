/**
 * Logotipos de ChloeRestaurant: bloque tipográfico ("ChloeRest" + descriptor + lema) y composiciones
 * horizontal y vertical con el isotipo. Todo el texto va convertido a trazos.
 */
import { isotipo, defs, svg, texto, trazos, FUENTES, TEMAS, COLORES } from './marca.mjs';

/** Variantes de color de texto. `rest` es el relleno de "Rest" (degradado de metal u otro color). */
export function variante(p, nombre, tema = 'dorado') {
  const t = TEMAS[tema];
  const base = {
    oscuro: { fondoOscuro: true, chloe: '#FFFFFF', rest: `url(#${p}-metal)`, descriptor: t.claro, lema: '#9FB0CC', regla: t.acento, modo: 'color' },
    claro: { fondoOscuro: false, chloe: COLORES.marino, rest: `url(#${p}-metalOsc)`, descriptor: '#7A5A14', lema: '#5C667A', regla: t.metalOscuro[1], modo: 'color' },
    blanco: { fondoOscuro: true, chloe: '#FFFFFF', rest: '#FFFFFF', descriptor: '#FFFFFF', lema: '#FFFFFF', regla: '#FFFFFF', modo: 'mono', color: '#FFFFFF' },
    negro: { fondoOscuro: false, chloe: '#000000', rest: '#000000', descriptor: '#000000', lema: '#000000', regla: '#000000', modo: 'mono', color: '#000000' },
  };
  return base[nombre];
}

/** Ajusta el tracking para que `cadena` ocupe exactamente `ancho`. */
function trackingParaAncho(fuente, cadena, size, ancho) {
  const w0 = trazos(fuente, cadena, { size, tracking: 0 }).ancho;
  return (ancho - w0) / ((cadena.length - 1) * size);
}

/**
 * Bloque de texto del logo. Origen (0,0) = esquina izquierda de la línea base de "ChloeRest".
 * Devuelve { svg, ancho, arriba, abajo } (arriba/abajo = extensión respecto a la línea base).
 */
export function bloqueTexto(v, { size = 180, lema = true } = {}) {
  const chloe = texto(FUENTES.marca, 'Chloe', { x: 0, y: 0, size, tracking: -0.006, relleno: v.chloe });
  const rest = texto(FUENTES.marca, 'Rest', { x: chloe.ancho - size * 0.004, y: 0, size, tracking: -0.006, relleno: v.rest });
  const ancho = chloe.ancho + rest.ancho - size * 0.004;
  const sd = size * 0.2;
  const trD = trackingParaAncho(FUENTES.ui, 'RESTAURANT SYSTEM', sd, ancho);
  const yD = size * 0.41;
  const descriptor = texto(FUENTES.ui, 'RESTAURANT SYSTEM', { x: 0, y: yD, size: sd, tracking: trD, relleno: v.descriptor });
  let extra = '';
  let abajo = yD + sd * 0.05;
  if (lema) {
    const yR = yD + size * 0.115;
    const sl = size * 0.118;
    const cadena = 'GESTIONA  •  VENDE  •  CRECE';
    const trL = trackingParaAncho(FUENTES.uiNormal, cadena, sl, ancho);
    const yL = yR + size * 0.17;
    extra = `<rect x="0" y="${yR.toFixed(1)}" width="${ancho.toFixed(1)}" height="${Math.max(2, size * 0.012).toFixed(1)}" fill="${v.regla}" opacity=".55"/>`
      + texto(FUENTES.uiNormal, cadena, { x: 0, y: yL, size: sl, tracking: trL, relleno: v.lema }).svg;
    abajo = yL + sl * 0.12;
  }
  return { svg: `${chloe.svg}${rest.svg}${descriptor.svg}${extra}`, ancho, arriba: size * 0.72, abajo };
}

const pegar = (g, x, y, esc = 1) => `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${esc})">${g}</g>`;

/** Logo horizontal: isotipo a la izquierda, texto a la derecha. */
export function logoHorizontal({ nombre = 'oscuro', tema = 'dorado', lema = true, margen = 28, id = 'lh' } = {}) {
  const v = variante(id, nombre, tema);
  const H = 360;
  const esc = H / 512;
  const mark = isotipo({ p: id, tema, modo: v.modo, color: v.color });
  const bt = bloqueTexto(v, { size: 150, lema });
  const sep = 46;
  const altoTexto = bt.arriba + bt.abajo;
  const baseY = margen + (H - altoTexto) / 2 + bt.arriba + 6;
  const x0 = margen + H + sep;
  const W = x0 + bt.ancho + margen;
  const Ht = H + margen * 2;
  const cuerpo = pegar(mark, margen, margen, esc) + pegar(bt.svg, x0, baseY);
  return { w: Math.ceil(W), h: Ht, svg: svg(Math.ceil(W), Ht, `<defs>${v.modo === 'color' ? defs(id, tema) : ''}</defs>${cuerpo}`), oscuro: v.fondoOscuro };
}

/** Logo vertical: isotipo arriba, texto centrado debajo. */
export function logoVertical({ nombre = 'oscuro', tema = 'dorado', lema = true, margen = 28, id = 'lv' } = {}) {
  const v = variante(id, nombre, tema);
  const M = 420;
  const esc = M / 512;
  const mark = isotipo({ p: id, tema, modo: v.modo, color: v.color });
  const bt = bloqueTexto(v, { size: 150, lema });
  const W = Math.max(M, bt.ancho) + margen * 2;
  const xMark = (W - M) / 2;
  const baseY = margen + M + 26 + bt.arriba;
  const Ht = Math.ceil(baseY + bt.abajo + margen);
  const cuerpo = pegar(mark, xMark, margen, esc) + pegar(bt.svg, (W - bt.ancho) / 2, baseY);
  return { w: Math.ceil(W), h: Ht, svg: svg(Math.ceil(W), Ht, `<defs>${v.modo === 'color' ? defs(id, tema) : ''}</defs>${cuerpo}`), oscuro: v.fondoOscuro };
}

/** Isotipo solo (lienzo cuadrado 512). */
export function logoIsotipo({ tema = 'dorado', modo = 'color', color = '#FFFFFF', aro = true, nivel = 'completo', id = 'is' } = {}) {
  const cuerpo = isotipo({ p: id, tema, modo, color, aro, nivel });
  return { w: 512, h: 512, svg: svg(512, 512, `<defs>${modo === 'color' ? defs(id, tema) : ''}</defs>${cuerpo}`) };
}
