/**
 * Banners y piezas de redes de ChloeRestaurant. Todo SVG con texto a trazos; los tamaños salen de los parámetros
 * (u = unidad de escala) para reutilizar las composiciones en distintos formatos.
 */
import { isotipo, defs, svg, texto, trazos, FUENTES, TEMAS, COLORES } from './marca.mjs';
import { bloqueTexto, variante } from './logos.mjs';

const MENSAJE = {
  linea1: 'Gestiona. Vende.',
  linea2: 'Crece.',
  sub: 'Sistema POS para restaurantes en República Dominicana',
  chips: ['MESAS', 'COCINA Y BAR', 'CAJA', 'FACTURACIÓN DGII', 'INVENTARIO'],
  dominio: 'chloerestaurant.lat',
};
export { MENSAJE };

const T = (fuente, s, o) => texto(fuente, s, o);

/** Fondo de marca: degradado marino, resplandor del color del tema y anillos concéntricos. */
export function fondo({ id, w, h, tema = 'dorado', foco = [w * 0.78, h * 0.5], radio = Math.max(w, h) * 0.55, anillos = true }) {
  const t = TEMAS[tema];
  const [fx, fy] = foco;
  const aros = anillos
    ? [0.34, 0.5, 0.68, 0.88, 1.12].map((k, i) => `<circle cx="${fx}" cy="${fy}" r="${(radio * k).toFixed(0)}" fill="none" stroke="${t.acento}" stroke-opacity="${(0.15 - i * 0.025).toFixed(3)}" stroke-width="${i === 0 ? 2.5 : 1.6}"/>`).join('')
    : '';
  return `<defs>
      <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10213F"/><stop offset=".55" stop-color="#091226"/><stop offset="1" stop-color="#04070F"/></linearGradient>
      <radialGradient id="${id}-glow" cx="${fx}" cy="${fy}" r="${radio}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${t.acento}" stop-opacity=".34"/><stop offset=".55" stop-color="${t.acento}" stop-opacity=".08"/><stop offset="1" stop-color="${t.acento}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#${id}-bg)"/>
    <rect width="${w}" height="${h}" fill="url(#${id}-glow)"/>
    ${aros}`;
}

export const colocar = (g, x, y, esc = 1) => `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${esc})">${g}</g>`;

/** Reduce el tamaño hasta que el texto quepa en `anchoMax`. */
function ajustar(fuente, s, size, anchoMax, tracking = 0) {
  let sz = size;
  while (trazos(fuente, s, { size: sz, tracking }).ancho > anchoMax && sz > 8) {sz -= 1;}
  return sz;
}

/** Pastilla (chip) con borde del color del tema. Devuelve { svg, ancho }. */
function pastilla(cadena, x, y, { size, tema }) {
  const t = TEMAS[tema];
  const tr = 0.12;
  const tx = trazos(FUENTES.ui, cadena, { size, tracking: tr });
  const padX = size * 1.1;
  const alto = size * 2.3;
  const ancho = tx.ancho + padX * 2;
  const txt = T(FUENTES.ui, cadena, { x: x + padX, y: y + alto / 2 + size * 0.36, size, tracking: tr, relleno: t.claro });
  return { svg: `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${alto.toFixed(1)}" rx="${(alto / 2).toFixed(1)}" fill="${t.acento}" fill-opacity=".1" stroke="${t.acento}" stroke-opacity=".55" stroke-width="${Math.max(1.5, size * 0.09).toFixed(2)}"/>${txt.svg}`, ancho, alto };
}

/** Fila de pastillas que salta de línea al llegar a `anchoMax`. Devuelve { svg, alto }. */
function filaPastillas(lista, x, y, anchoMax, { size, tema }) {
  let cx = x;
  let cy = y;
  let svgOut = '';
  const sep = size * 0.7;
  let alto = 0;
  for (const c of lista) {
    const p = pastilla(c, 0, 0, { size, tema });
    if (cx + p.ancho > x + anchoMax && cx > x) {cx = x; cy += p.alto + sep;}
    svgOut += colocar(pastilla(c, 0, 0, { size, tema }).svg, cx, cy);
    cx += p.ancho + sep;
    alto = cy + p.alto - y;
  }
  return { svg: svgOut, alto };
}

/** Pastillas centradas en `cx`, repartidas en las líneas necesarias. Devuelve { svg, alto }. */
function filaCentrada(lista, cx, y, anchoMax, { size, tema }) {
  const sep = size * 0.7;
  const items = lista.map((c) => ({ c, p: pastilla(c, 0, 0, { size, tema }) }));
  const lineas = [[]];
  let acum = 0;
  for (const it of items) {
    const suma = it.p.ancho + (lineas[lineas.length - 1].length ? sep : 0);
    if (acum + suma > anchoMax && lineas[lineas.length - 1].length) {lineas.push([]); acum = 0;}
    lineas[lineas.length - 1].push(it);
    acum += it.p.ancho + (lineas[lineas.length - 1].length > 1 ? sep : 0);
  }
  let out = '';
  let cy = y;
  let alto = 0;
  for (const linea of lineas) {
    const total = linea.reduce((a, it) => a + it.p.ancho, 0) + sep * (linea.length - 1);
    let x = cx - total / 2;
    for (const it of linea) {out += colocar(pastilla(it.c, 0, 0, { size, tema }).svg, x, cy); x += it.p.ancho + sep;}
    alto = cy + linea[0].p.alto - y;
    cy += linea[0].p.alto + sep;
  }
  return { svg: out, alto };
}

// ------------------------------------------------------------------ composición completa (apaisada)
/**
 * Texto a la izquierda y el isotipo grande a la derecha. u = escala (1 = 1200x630). margenX = margen lateral (zona segura).
 */
export function bannerCompleto({ w, h, u = h / 630, margenX = 72 * u, tema = 'dorado', id = 'bc', chips = true, sub = true }) {
  const t = TEMAS[tema];
  const M = 450 * u;
  const xMark = w - margenX - M + 14 * u;
  const yMark = (h - M) / 2 + 4 * u;
  const v = variante(id, 'oscuro', tema);
  const bt = bloqueTexto(v, { size: 68 * u, lema: false });
  const xT = margenX;
  const anchoTexto = xMark - xT - 30 * u;

  const y0 = 52 * u;                                   // tope del bloque
  const baseWord = y0 + bt.arriba;
  const sizeH = ajustar(FUENTES.marca, MENSAJE.linea1, 84 * u, anchoTexto);
  const yH1 = baseWord + bt.abajo + sizeH * 1.15;
  const yH2 = yH1 + sizeH * 1.02;
  const l1 = T(FUENTES.marca, MENSAJE.linea1, { x: xT, y: yH1, size: sizeH, tracking: -0.012, relleno: '#FFFFFF' });
  const l2 = T(FUENTES.marca, MENSAJE.linea2, { x: xT, y: yH2, size: sizeH, tracking: -0.012, relleno: `url(#${id}-metal)` });
  const sizeS = ajustar(FUENTES.uiNormal, MENSAJE.sub, 25 * u, anchoTexto);
  const yS = yH2 + sizeS * 2.1;
  const subt = sub ? T(FUENTES.uiNormal, MENSAJE.sub, { x: xT, y: yS, size: sizeS, relleno: '#B7C4DC' }).svg : '';
  const cp = chips ? filaPastillas(MENSAJE.chips.slice(0, 4), xT, yS + sizeS * 1.5, anchoTexto, { size: 13.5 * u, tema }) : { svg: '', alto: 0 };
  const yD = Math.min(h - 38 * u, yS + sizeS * 1.5 + cp.alto + 62 * u);
  const dom = T(FUENTES.uiFuerte, MENSAJE.dominio, { x: xT, y: yD, size: 25 * u, tracking: 0.04, relleno: t.acento });

  const dy = (h - (yD + 6 * u - y0)) / 2 - y0;      // centra verticalmente el bloque de texto
  return svg(w, h,
    `${defs(id, tema)}${fondo({ id, w, h, tema, foco: [xMark + M / 2, h / 2], radio: M * 1.25 })}
     ${colocar(isotipo({ p: id, tema }), xMark, yMark, M / 512)}
     <g transform="translate(0 ${dy.toFixed(2)})">${colocar(bt.svg, xT, baseWord)}${l1.svg}${l2.svg}${subt}${cp.svg}${dom.svg}</g>`);
}

// ------------------------------------------------------------------ composición corta (portadas muy anchas)
export function bannerCorto({ w, h, margenX = h * 0.7, tema = 'dorado', id = 'bk' }) {
  const t = TEMAS[tema];
  const M = h * 0.84;
  const x0 = margenX;
  const yMark = (h - M) / 2;
  const v = variante(id, 'oscuro', tema);
  const bt = bloqueTexto(v, { size: h * 0.15, lema: false });
  const xT = x0 + M + h * 0.07;
  const anchoMax = w - margenX - xT;
  const sizeH = ajustar(FUENTES.marca, `${MENSAJE.linea1} ${MENSAJE.linea2}`, h * 0.2, anchoMax, -0.012);
  const bloqueAlto = bt.arriba + bt.abajo + sizeH * 1.35 + h * 0.2;
  const top = (h - bloqueAlto) / 2;
  const baseWord = top + bt.arriba;
  const yH = baseWord + bt.abajo + sizeH * 1.15;
  const linea = trazos(FUENTES.marca, `${MENSAJE.linea1} `, { size: sizeH, tracking: -0.012 });
  const a = T(FUENTES.marca, `${MENSAJE.linea1} `, { x: xT, y: yH, size: sizeH, tracking: -0.012, relleno: '#FFFFFF' });
  const b = T(FUENTES.marca, MENSAJE.linea2, { x: xT + linea.ancho - sizeH * 0.012, y: yH, size: sizeH, tracking: -0.012, relleno: `url(#${id}-metal)` });
  const sizeS = ajustar(FUENTES.uiNormal, MENSAJE.sub, h * 0.062, anchoMax);
  const yS = yH + sizeS * 2.2;
  const subt = T(FUENTES.uiNormal, MENSAJE.sub, { x: xT, y: yS, size: sizeS, relleno: '#B7C4DC' });
  const dom = T(FUENTES.uiFuerte, MENSAJE.dominio, { x: xT, y: yS + sizeS * 2.1, size: h * 0.06, tracking: 0.04, relleno: t.acento });
  return svg(w, h,
    `${defs(id, tema)}${fondo({ id, w, h, tema, foco: [x0 + M / 2, h / 2], radio: h * 1.1 })}
     ${colocar(isotipo({ p: id, tema }), x0, yMark, M / 512)}
     ${colocar(bt.svg, xT, baseWord)}${a.svg}${b.svg}${subt.svg}${dom.svg}`);
}

// ------------------------------------------------------------------ cuadrada / vertical (Instagram)
export function bannerCentrado({ w, h, tema = 'dorado', id = 'bq', vertical = false }) {
  const t = TEMAS[tema];
  const u = w / 1080;
  const M = (vertical ? 600 : 470) * u;
  const yMark = (vertical ? 400 : 96) * u;
  const v = variante(id, 'oscuro', tema);
  const bt = bloqueTexto(v, { size: (vertical ? 118 : 96) * u, lema: false });
  const baseWord = yMark + M + 34 * u + bt.arriba;
  const sizeH = (vertical ? 78 : 62) * u;
  const yH = baseWord + bt.abajo + sizeH * 1.35;
  const l1 = T(FUENTES.marca, `${MENSAJE.linea1} `, { x: 0, y: 0, size: sizeH, tracking: -0.012, relleno: '#FFFFFF' });
  const l2 = T(FUENTES.marca, MENSAJE.linea2, { x: l1.ancho - sizeH * 0.012, y: 0, size: sizeH, tracking: -0.012, relleno: `url(#${id}-metal)` });
  const total = l1.ancho + l2.ancho;
  const sizeS = (vertical ? 33 : 26) * u;
  const subt = T(FUENTES.uiNormal, MENSAJE.sub, { x: w / 2, y: yH + sizeS * 2.3, size: sizeS, relleno: '#B7C4DC', ancla: 'centro' });
  const yChips = yH + sizeS * 3.4;
  const cp = filaCentrada(MENSAJE.chips.slice(0, vertical ? 4 : 3), w / 2, yChips, w - 140 * u, { size: (vertical ? 18 : 15) * u, tema });
  const dom = T(FUENTES.uiFuerte, MENSAJE.dominio, { x: w / 2, y: h - (vertical ? 330 : 56) * u, size: (vertical ? 36 : 28) * u, tracking: 0.05, relleno: t.acento, ancla: 'centro' });
  return svg(w, h,
    `${defs(id, tema)}${fondo({ id, w, h, tema, foco: [w / 2, yMark + M / 2], radio: w * 0.62 })}
     ${colocar(isotipo({ p: id, tema }), (w - M) / 2, yMark, M / 512)}
     ${colocar(bt.svg, (w - bt.ancho) / 2, baseWord)}
     ${colocar(l1.svg + l2.svg, (w - total) / 2, yH)}${subt.svg}
     ${cp.svg}${dom.svg}`);
}

// ------------------------------------------------------------------ perfil (cuadrado, se recorta en círculo)
export function perfil({ w = 720, tema = 'dorado', id = 'pf' }) {
  const M = w * 0.8;
  return svg(w, w,
    `${defs(id, tema)}${fondo({ id, w, h: w, tema, foco: [w / 2, w / 2], radio: w * 0.7, anillos: false })}
     ${colocar(isotipo({ p: id, tema }), (w - M) / 2, w * 0.5 - (277 / 512) * M, M / 512)}`);
}

// ------------------------------------------------------------------ fondo de inicio de sesión (sin texto)
export function fondoLogin({ w = 1920, h = 1080, tema = 'dorado', id = 'fl' }) {
  const M = h * 0.96;
  const cx = w * 0.76;
  return svg(w, h,
    `<defs>${defs(`${id}m`, tema)}</defs>${fondo({ id, w, h, tema, foco: [cx, h * 0.5], radio: h * 0.95 })}
     <g opacity=".11">${colocar(isotipo({ p: `${id}m`, tema }), cx - M / 2, h * 0.5 - (277 / 512) * M, M / 512)}</g>`);
}

// ------------------------------------------------------------------ encabezado del panel (franja)
export function encabezadoPanel({ w = 1600, h = 240, tema = 'dorado', id = 'ep' }) {
  const v = variante(id, 'oscuro', tema);
  const bt = bloqueTexto(v, { size: h * 0.36, lema: false });
  const M = h * 0.74;
  const yBase = (h - (bt.arriba + bt.abajo)) / 2 + bt.arriba;
  return svg(w, h,
    `${defs(id, tema)}${fondo({ id, w, h, tema, foco: [w * 0.9, h * 0.5], radio: h * 1.6 })}
     ${colocar(isotipo({ p: id, tema }), h * 0.14, (h - M) / 2, M / 512)}
     ${colocar(bt.svg, h * 0.14 + M + h * 0.14, yBase)}`);
}

// ------------------------------------------------------------------ encabezado de correo (fondo claro)
export function encabezadoCorreo({ w = 1200, h = 400, tema = 'dorado', id = 'ec' }) {
  const v = variante(id, 'claro', tema);
  const M = h * 0.66;
  const bt = bloqueTexto(v, { size: h * 0.3, lema: false });
  const total = M + h * 0.07 + bt.ancho;
  const x0 = (w - total) / 2;
  const yBase = (h - (bt.arriba + bt.abajo)) / 2 + bt.arriba;
  return svg(w, h,
    `${defs(id, tema)}<rect width="${w}" height="${h}" fill="${COLORES.crema}"/>
     <rect x="0" y="${h - 8}" width="${w}" height="8" fill="url(#${id}-metal)"/>
     ${colocar(isotipo({ p: id, tema }), x0, (h - M) / 2 - 4, M / 512)}
     ${colocar(bt.svg, x0 + M + h * 0.07, yBase - 4)}`);
}
