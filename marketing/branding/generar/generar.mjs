/**
 * Generador del juego de marca de ChloeRestaurant.
 *   npm install && npm run generar      (desde marketing/branding/generar)
 * Escribe en marketing/branding/: logos/, iconos/, instalador/, ticket/, banners/, redes/ y hoja-de-marca.png.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { isotipo, defs, svg, texto, trazos, FUENTES, TEMAS, COLORES } from './marca.mjs';
import { logoHorizontal, logoVertical, logoIsotipo, bloqueTexto, variante } from './logos.mjs';
import * as B from './banners.mjs';
import { escribirSvg, escribirPng, rasterizar, empaquetarIco, pngABmp, ruta } from './salida.mjs';

const colocar = B.colocar;
let total = 0;
const nota = (rel) => { total += 1; console.log('  ·', rel); };

async function logo(nombre, l, anchoPng, opciones) {
  escribirSvg(`logos/${nombre}.svg`, l.svg);
  await escribirPng(`logos/${nombre}.png`, l.svg, anchoPng, opciones);
  nota(`logos/${nombre}`);
}

// ======================================================================== LOGOS
async function logos() {
  console.log('Logos');
  for (const tema of ['dorado', 'zafiro', 'esmeralda']) {
    await logo(`isotipo-${tema}`, logoIsotipo({ tema, id: `i-${tema}` }), 1024);
  }
  await logo('isotipo-sin-aro-dorado', logoIsotipo({ aro: false, id: 'isa' }), 1024);
  await logo('isotipo-mono-blanco', logoIsotipo({ modo: 'mono', color: '#FFFFFF', id: 'imb' }), 1024);
  await logo('isotipo-mono-negro', logoIsotipo({ modo: 'mono', color: '#000000', id: 'imn' }), 1024);

  const nombres = { oscuro: 'fondo-oscuro', claro: 'fondo-claro', blanco: 'blanco', negro: 'negro' };
  for (const [v, sufijo] of Object.entries(nombres)) {
    await logo(`logo-horizontal-${sufijo}`, logoHorizontal({ nombre: v, id: `h-${v}` }), 2400);
    await logo(`logo-vertical-${sufijo}`, logoVertical({ nombre: v, id: `v-${v}` }), 1600);
  }
  for (const v of ['oscuro', 'claro']) {
    await logo(`logo-horizontal-compacto-${nombres[v]}`, logoHorizontal({ nombre: v, lema: false, id: `hc-${v}` }), 2000);
  }
  for (const tema of ['zafiro', 'esmeralda']) {
    await logo(`logo-horizontal-fondo-oscuro-${tema}`, logoHorizontal({ nombre: 'oscuro', tema, id: `ht-${tema}` }), 2400);
  }
}

// ======================================================================== ICONOS
/** Cuadrado de marino con el isotipo centrado (apple-touch, Android, maskable). */
function iconoCuadrado({ size, nivel, escala, id }) {
  const M = size * escala;
  const cyCont = nivel === 'completo' ? 277 : nivel === 'simple' ? 281 : 256;   // centro vertical del dibujo en su lienzo de 512
  return svg(size, size,
    `${defs(id, 'dorado')}
     <defs><radialGradient id="${id}-f" cx="50%" cy="38%" r="85%"><stop offset="0" stop-color="#15294A"/><stop offset=".7" stop-color="#091226"/><stop offset="1" stop-color="#04070F"/></radialGradient></defs>
     <rect width="${size}" height="${size}" fill="url(#${id}-f)"/>
     ${colocar(isotipo({ p: id, nivel }), (size - M) / 2, size / 2 - (cyCont / 512) * M, M / 512)}`);
}

const nivelPara = (px) => (px <= 32 ? 'minimo' : px <= 96 ? 'simple' : 'completo');
const isotipoNivel = (nivel, id) => logoIsotipo({ nivel, id }).svg;

async function iconos() {
  console.log('Iconos');
  // favicon vectorial (nivel mínimo: se lee a 16 px)
  const fav = isotipoNivel('minimo', 'fav');
  escribirSvg('iconos/favicon.svg', fav); nota('iconos/favicon.svg');
  const favPng = {};
  for (const t of [16, 32, 48]) {
    favPng[t] = await escribirPng(`iconos/favicon-${t}.png`, isotipoNivel(nivelPara(t), `f${t}`), t);
    nota(`iconos/favicon-${t}.png`);
  }
  fs.writeFileSync(ruta('iconos/favicon.ico'), empaquetarIco([16, 32, 48].map((t) => ({ tam: t, png: favPng[t] }))));
  nota('iconos/favicon.ico');

  // iconos de aplicación web
  await escribirPng('iconos/apple-touch-icon.png', iconoCuadrado({ size: 180, nivel: 'simple', escala: 0.8, id: 'ap' }), 180); nota('iconos/apple-touch-icon.png');
  await escribirPng('iconos/icon-192.png', iconoCuadrado({ size: 192, nivel: 'simple', escala: 0.8, id: 'a192' }), 192); nota('iconos/icon-192.png');
  await escribirPng('iconos/icon-512.png', iconoCuadrado({ size: 512, nivel: 'completo', escala: 0.82, id: 'a512' }), 512); nota('iconos/icon-512.png');
  await escribirPng('iconos/icon-maskable-512.png', iconoCuadrado({ size: 512, nivel: 'completo', escala: 0.7, id: 'amk' }), 512); nota('iconos/icon-maskable-512.png');

  // escritorio (Electron / instalador de Windows)
  const tam = [16, 24, 32, 48, 64, 128, 256];
  const imagenes = [];
  for (const t of tam) {
    imagenes.push({ tam: t, png: await rasterizar(isotipoNivel(nivelPara(t), `d${t}`), t) });
  }
  fs.writeFileSync(ruta('iconos/icono-escritorio.ico'), empaquetarIco(imagenes));
  nota('iconos/icono-escritorio.ico');
  await escribirPng('iconos/icono-escritorio-256.png', isotipoNivel('completo', 'd256p'), 256);
  // imagen de la marca dentro de la app (sustituye a chloe-logo.png / logo.png: 512 con fondo transparente)
  await escribirPng('iconos/logo-app-512.png', isotipoNivel('completo', 'app'), 512);
  nota('iconos/logo-app-512.png');
}

// ======================================================================== INSTALADOR (BMP de 24 bits)
async function instalador() {
  console.log('Instalador');
  const id = 'il';
  const w = 164;
  const h = 314;
  const v = variante(id, 'oscuro', 'dorado');
  const bt = bloqueTexto(v, { size: 26, lema: false });
  const M = 120;
  const base = 46 + M + 26 + bt.arriba;
  const lema = texto(FUENTES.uiNormal, 'GESTIONA • VENDE • CRECE', { x: w / 2, y: h - 26, size: 8, tracking: 0.2, relleno: '#9FB0CC', ancla: 'centro' });
  const lateral = svg(w, h,
    `${defs(id, 'dorado')}${B.fondo({ id, w, h, tema: 'dorado', foco: [w / 2, 96], radio: 170 })}
     ${colocar(isotipo({ p: id }), (w - M) / 2, 46, M / 512)}${colocar(bt.svg, (w - bt.ancho) / 2, base)}${lema.svg}`);
  const png = await rasterizar(lateral, w * 4, { alto: h * 4 });
  fs.writeFileSync(ruta('instalador/instalador-lateral.bmp'), await pngABmp(png, w, h));
  fs.writeFileSync(ruta('instalador/instalador-lateral-vista.png'), await rasterizar(lateral, w * 3, { alto: h * 3 }));
  nota('instalador/instalador-lateral.bmp');

  const hw = 150;
  const hh = 57;
  const encabezado = svg(hw, hh,
    `${defs('ih', 'dorado')}<rect width="${hw}" height="${hh}" fill="#FFFFFF"/>${colocar(isotipo({ p: 'ih', nivel: 'simple' }), hw - 54, 3, 48 / 512)}`);
  const png2 = await rasterizar(encabezado, hw * 4, { alto: hh * 4 });
  fs.writeFileSync(ruta('instalador/instalador-encabezado.bmp'), await pngABmp(png2, hw, hh, '#FFFFFF'));
  fs.writeFileSync(ruta('instalador/instalador-encabezado-vista.png'), await rasterizar(encabezado, hw * 3, { alto: hh * 3 }));
  nota('instalador/instalador-encabezado.bmp');
}

// ======================================================================== TICKET (impresora térmica, 1 bit)
async function ticket() {
  console.log('Ticket');
  const marca = logoIsotipo({ modo: 'mono', color: '#000000', id: 'tk' }).svg;
  const bin = async (svgTexto, ancho, rel) => {
    const buf = await sharp(await rasterizar(svgTexto, ancho, { fondo: '#FFFFFF' })).greyscale().threshold(150).png({ palette: true, colours: 2 }).toBuffer();
    fs.writeFileSync(ruta(rel), buf);
    nota(rel);
  };
  await bin(marca, 384, 'ticket/logo-ticket-384.png');
  await bin(logoVertical({ nombre: 'negro', lema: false, id: 'tkv' }).svg, 384, 'ticket/logo-ticket-vertical-384.png');
}

// ======================================================================== BANNERS Y REDES
async function banners() {
  console.log('Banners y redes');
  const out = async (rel, s, ancho) => { await escribirPng(rel, s, ancho); nota(rel); };
  await out('banners/og-image-1200x630.png', B.bannerCompleto({ w: 1200, h: 630, id: 'og' }), 1200);
  await out('banners/landing-hero-1920x800.png', B.bannerCompleto({ w: 1920, h: 800, id: 'hero', margenX: 160 }), 1920);
  for (const tema of ['dorado', 'zafiro', 'esmeralda']) {
    await out(`banners/login-fondo-${tema}-1920x1080.png`, B.fondoLogin({ tema, id: `lg-${tema}` }), 1920);
  }
  await out('banners/panel-encabezado-1600x240.png', B.encabezadoPanel({ id: 'ep' }), 1600);
  await out('banners/correo-encabezado-1200x400.png', B.encabezadoCorreo({ id: 'ec' }), 1200);

  await out('redes/perfil-redes-720.png', B.perfil({ w: 720, id: 'pf' }), 720);
  await out('redes/facebook-portada-1640x624.png', B.bannerCompleto({ w: 1640, h: 624, u: 0.82, margenX: 260, id: 'fb' }), 1640);
  await out('redes/instagram-post-1080x1080.png', B.bannerCentrado({ w: 1080, h: 1080, id: 'ig' }), 1080);
  await out('redes/instagram-historia-1080x1920.png', B.bannerCentrado({ w: 1080, h: 1920, id: 'st', vertical: true }), 1080);
  await out('redes/linkedin-portada-1584x396.png', B.bannerCorto({ w: 1584, h: 396, id: 'li' }), 1584);
  await out('redes/x-portada-1500x500.png', B.bannerCorto({ w: 1500, h: 500, id: 'x' }), 1500);
}

// ======================================================================== HOJA DE MARCA
async function hoja() {
  console.log('Hoja de marca');
  const W = 2400;
  const H = 1900;
  const a = (fuente, s, o) => texto(fuente, s, o).svg;
  const panel = (x, y, w, h, fill, borde = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${fill}" ${borde}/>`;
  const lh1 = logoHorizontal({ nombre: 'oscuro', id: 'hj1' });
  const lh2 = logoHorizontal({ nombre: 'claro', id: 'hj2' });
  const lv = logoVertical({ nombre: 'oscuro', lema: false, id: 'hj3' });
  /** Coloca un logo centrado dentro de una caja, a la escala que cabe. */
  const centrado = (l, x, y, cw, ch, margen = 40) => {
    const esc = Math.min((cw - margen * 2) / l.w, (ch - margen * 2) / l.h);
    return colocar(l.svg, x + (cw - l.w * esc) / 2, y + (ch - l.h * esc) / 2, esc);
  };

  const swatches = [
    ['Marino', COLORES.marino], ['Marino profundo', COLORES.marinoProfundo], ['Dorado claro', TEMAS.dorado.metal[1]],
    ['Dorado', TEMAS.dorado.metal[2]], ['Dorado oscuro', TEMAS.dorado.metal[4]], ['Crema', COLORES.crema],
    ['Zafiro', TEMAS.zafiro.acento], ['Esmeralda', TEMAS.esmeralda.acento],
  ];
  const sw = swatches.map(([n, c], i) => {
    const x = 90 + i * 276;
    const claro = ['#F8F4EC', '#FFD25A', '#46C283'].includes(c);
    return `<rect x="${x}" y="1240" width="250" height="150" rx="16" fill="${c}" ${c === COLORES.crema ? 'stroke="#D8D1BF" stroke-width="2"' : ''}/>
      ${a(FUENTES.ui, n, { x: x + 18, y: 1332, size: 24, relleno: claro ? '#1B1710' : '#FFFFFF' })}
      ${a(FUENTES.uiNormal, c.toUpperCase(), { x: x + 18, y: 1370, size: 22, relleno: claro ? '#4A4234' : '#D3DCEC', tracking: 0.04 })}`;
  }).join('');

  const pequenos = [[16, 'minimo'], [32, 'minimo'], [48, 'simple'], [64, 'simple'], [128, 'completo']];
  let xi = 120;
  const iconos = pequenos.map(([px, nivel]) => {
    const x = xi;
    xi += px + 56;
    return `<g transform="translate(${x} ${1640 + (128 - px)}) scale(${px / 512})">${isotipo({ p: `hi${px}`, nivel })}</g>
      ${a(FUENTES.uiNormal, `${px} px`, { x: x + px / 2, y: 1810, size: 20, relleno: '#9FB0CC', ancla: 'centro' })}`;
  }).join('');
  const defsIconos = pequenos.map(([px]) => defs(`hi${px}`, 'dorado')).join('');

  const temas = ['dorado', 'zafiro', 'esmeralda'].map((tema, i) =>
    `<g transform="translate(${1330 + i * 330} 1560) scale(${290 / 512})">${isotipo({ p: `ht${i}`, tema })}</g>`).join('');
  const defsTemas = ['dorado', 'zafiro', 'esmeralda'].map((tema, i) => defs(`ht${i}`, tema)).join('');

  const monoBlanco = logoIsotipo({ modo: 'mono', color: '#FFFFFF', id: 'hmb' });
  const monoNegro = logoIsotipo({ modo: 'mono', color: '#000000', id: 'hmn' });

  const contenido = `
    <defs>${defs('hj1', 'dorado')}${defs('hj2', 'dorado')}${defs('hj3', 'dorado')}${defsIconos}${defsTemas}</defs>
    <rect width="${W}" height="${H}" fill="${COLORES.crema}"/>
    ${a(FUENTES.marca, 'ChloeRestaurant', { x: 90, y: 150, size: 92, relleno: COLORES.marino })}
    ${a(FUENTES.ui, 'HOJA DE MARCA  ·  LOGOS, COLORES, TIPOGRAFÍA E ICONOS', { x: 94, y: 208, size: 26, tracking: 0.2, relleno: '#7A5A14' })}

    ${panel(90, 270, 1100, 380, COLORES.marinoProfundo)}${centrado(lh1, 90, 270, 1100, 380, 50)}
    ${panel(1210, 270, 1100, 380, '#FFFFFF')}${centrado(lh2, 1210, 270, 1100, 380, 50)}

    ${panel(90, 680, 520, 460, COLORES.marinoProfundo)}${centrado(lv, 90, 680, 520, 460, 36)}
    ${panel(630, 680, 340, 228, '#2A3D63')}${centrado(monoBlanco, 630, 680, 340, 228, 24)}
    ${panel(630, 912, 340, 228, '#E9E3D4')}${centrado(monoNegro, 630, 912, 340, 228, 24)}
    ${panel(990, 680, 1320, 460, '#FFFFFF')}
    ${a(FUENTES.marca, 'Tipografía', { x: 1040, y: 760, size: 46, relleno: COLORES.marino })}
    ${a(FUENTES.marca, 'Aa Bb Cc 123', { x: 1040, y: 890, size: 100, relleno: COLORES.marino })}
    ${a(FUENTES.uiNormal, 'Fraunces ExtraBold — nombre de marca y titulares', { x: 1040, y: 945, size: 26, relleno: '#6B7385' })}
    ${a(FUENTES.uiFuerte, 'Aa Bb Cc 123', { x: 1040, y: 1060, size: 80, relleno: COLORES.marino })}
    ${a(FUENTES.uiNormal, 'Inter 500 / 600 / 700 — interfaz, descriptor y textos', { x: 1040, y: 1110, size: 26, relleno: '#6B7385' })}

    ${a(FUENTES.marca, 'Color', { x: 90, y: 1215, size: 46, relleno: COLORES.marino })}
    ${sw}

    ${a(FUENTES.marca, 'Tamaños pequeños', { x: 90, y: 1520, size: 40, relleno: COLORES.marino })}
    ${panel(90, 1560, 800, 280, COLORES.marinoProfundo)}
    ${iconos}
    ${a(FUENTES.marca, 'Un logo por tema', { x: 1330, y: 1520, size: 40, relleno: COLORES.marino })}
    ${temas}`;

  await escribirPng('hoja-de-marca.png', svg(W, H, contenido), W);
  nota('hoja-de-marca.png');
}

// ======================================================================== APLICAR AL SISTEMA
/** Copia cada pieza del juego a su lugar en la aplicación. Origen y destino quedan documentados en README.md. */
async function aplicar() {
  console.log('Aplicando al sistema');
  const FRONT = path.resolve(ruta('.'), '..', '..', 'frontend-restaurante');
  const mapa = [
    ['iconos/favicon.svg', 'public/favicon.svg'],                   // pestaña del navegador (versión mínima)
    ['logos/isotipo-dorado.svg', 'public/icons.svg'],               // sello completo (bienvenida, landing, activación)
    ['iconos/favicon.ico', 'public/favicon.ico'],
    ['iconos/favicon.ico', 'public/icons.ico'],
    ['iconos/apple-touch-icon.png', 'public/apple-touch-icon.png'],
    ['iconos/icon-192.png', 'public/icon-192.png'],
    ['iconos/icon-512.png', 'public/icon-512.png'],
    ['iconos/logo-app-512.png', 'public/logo.png'],                 // schema.org (index.html)
    ['iconos/logo-app-512.png', 'src/assets/branding/chloe-logo.png'], // pantalla de inicio de sesión
    ['iconos/icono-escritorio.ico', 'build/icon.ico'],              // ejecutable e instalador de Windows
    ['instalador/instalador-lateral.bmp', 'build/instalador-lateral.bmp'],
    ['instalador/instalador-encabezado.bmp', 'build/instalador-encabezado.bmp'],
  ];
  for (const [origen, destino] of mapa) {
    const d = path.join(FRONT, destino);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(ruta(origen), d);
    nota(`frontend-restaurante/${destino}`);
  }
}

const pasos = { logos, iconos, instalador, ticket, banners, hoja, aplicar };
const pedidos = process.argv.slice(2);
for (const [n, fn] of Object.entries(pasos)) {
  if (pedidos.includes(n) || (!pedidos.length && n !== 'aplicar')) {await fn();}
}
console.log(`\nListo: ${total} archivos en marketing/branding/`);
