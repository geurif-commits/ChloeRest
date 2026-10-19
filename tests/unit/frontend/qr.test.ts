import { describe, it, expect } from 'vitest';
// @ts-expect-error módulo JS del frontend (sin tipos)
import { qrComoImagen } from '../../../frontend-restaurante/src/utils/qr.js';

const decodificar = (url: string): string => decodeURIComponent(url.replace('data:image/svg+xml;charset=utf-8,', ''));

describe('qrComoImagen', () => {
  it('devuelve un SVG incrustado (data URL), sin pedir nada a internet', () => {
    const url: string = qrComoImagen('https://chloerestaurant.lat/verificar-factura?ncf=B0200000001&total=4838.4');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodificar(url);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 ');
    expect(svg).not.toMatch(/<image|href=/);                                         // nada se pide a otro servidor
    expect(svg).toMatch(/<path d="M\d+ \d+h1v1h-1z/);
  });

  it('es determinista y distinto para textos distintos', () => {
    const a = qrComoImagen('B0200000001');
    expect(qrComoImagen('B0200000001')).toBe(a);
    expect(qrComoImagen('B0200000002')).not.toBe(a);
  });

  it('dibuja los tres cuadros de posición de un QR (esquinas)', () => {
    const svg = decodificar(qrComoImagen('E310000000001'));
    const lado = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1]);
    const celdas = new Set([...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => `${m[1]},${m[2]}`));
    const margen = 2;
    expect(celdas.has(`${margen},${margen}`)).toBe(true);                            // arriba izquierda
    expect(celdas.has(`${lado - margen - 1},${margen}`)).toBe(true);                 // arriba derecha
    expect(celdas.has(`${margen},${lado - margen - 1}`)).toBe(true);                 // abajo izquierda
  });
});
