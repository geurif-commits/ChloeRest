/** Escritura de archivos: SVG, PNG (con sharp), ICO (PNG incrustados) y BMP de 24 bits (instalador NSIS). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..');

export function ruta(rel) {
  const p = path.join(RAIZ, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

export function escribirSvg(rel, contenido) {
  fs.writeFileSync(ruta(rel), contenido, 'utf8');
}

/** Rasteriza un SVG al ancho indicado; el alto sale de la proporción del propio SVG (o se fuerza con `alto`). */
export async function rasterizar(svgTexto, ancho, { fondo = null, alto = null } = {}) {
  const m = svgTexto.match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/);
  const w0 = m ? Number(m[1]) : ancho;
  const h0 = m ? Number(m[2]) : ancho;
  const altoFinal = alto ?? Math.round((ancho * h0) / w0);
  const densidad = Math.min(2400, Math.max(72, Math.ceil((72 * ancho) / w0) * 2));
  let img = sharp(Buffer.from(svgTexto), { density: densidad }).resize(ancho, altoFinal, { fit: 'fill' });
  if (fondo) {img = img.flatten({ background: fondo });}
  return img.png({ compressionLevel: 9 }).toBuffer();
}

export async function escribirPng(rel, svgTexto, ancho, opciones) {
  const buf = await rasterizar(svgTexto, ancho, opciones);
  fs.writeFileSync(ruta(rel), buf);
  return buf;
}

/** ICO con imágenes PNG (válido desde Windows Vista; electron-builder exige una de 256 px). */
export function empaquetarIco(imagenes) {
  const n = imagenes.length;
  const cabecera = Buffer.alloc(6 + n * 16);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(n, 4);
  let offset = cabecera.length;
  imagenes.forEach(({ tam, png }, i) => {
    const e = 6 + i * 16;
    cabecera.writeUInt8(tam >= 256 ? 0 : tam, e);
    cabecera.writeUInt8(tam >= 256 ? 0 : tam, e + 1);
    cabecera.writeUInt8(0, e + 2);
    cabecera.writeUInt8(0, e + 3);
    cabecera.writeUInt16LE(1, e + 4);
    cabecera.writeUInt16LE(32, e + 6);
    cabecera.writeUInt32LE(png.length, e + 8);
    cabecera.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([cabecera, ...imagenes.map((i) => i.png)]);
}

/** BMP de 24 bits sin compresión a partir de un PNG (sobre fondo opaco). */
export async function pngABmp(png, ancho, alto, fondo = '#0A1426') {
  const { data } = await sharp(png).resize(ancho, alto, { fit: 'fill' }).flatten({ background: fondo }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const fila = Math.ceil((ancho * 3) / 4) * 4;
  const out = Buffer.alloc(54 + fila * alto);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(ancho, 18);
  out.writeInt32LE(alto, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(fila * alto, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < alto; y += 1) {
    const origen = (alto - 1 - y) * ancho * 3;   // el BMP guarda las filas de abajo hacia arriba
    for (let x = 0; x < ancho; x += 1) {
      const o = 54 + y * fila + x * 3;
      out[o] = data[origen + x * 3 + 2];
      out[o + 1] = data[origen + x * 3 + 1];
      out[o + 2] = data[origen + x * 3];
    }
  }
  return out;
}
