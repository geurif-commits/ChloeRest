import { describe, it, expect } from 'vitest';
// @ts-expect-error módulo JS del frontend (sin tipos); no importa dependencias, así corre en el job del backend
import { qrSvgDeModulos } from '../../../frontend-restaurante/src/utils/qrSvg.js';

const decodificar = (url: string): string => decodeURIComponent(url.replace('data:image/svg+xml;charset=utf-8,', ''));

/** Matriz de prueba de 21 x 21 con los tres cuadros de posición de un QR (7 x 7) en tres esquinas. */
const LADO = 21;
const cuadro = (f: number, c: number, f0: number, c0: number): boolean => {
  const df = f - f0;
  const dc = c - c0;
  if (df < 0 || df > 6 || dc < 0 || dc > 6) {return false;}
  return df === 0 || df === 6 || dc === 0 || dc === 6 || (df >= 2 && df <= 4 && dc >= 2 && dc <= 4);
};
const esOscuro = (f: number, c: number): boolean => cuadro(f, c, 0, 0) || cuadro(f, c, 0, LADO - 7) || cuadro(f, c, LADO - 7, 0);

describe('qrSvgDeModulos', () => {
  it('devuelve un SVG incrustado (data URL), sin pedir nada a internet', () => {
    const url: string = qrSvgDeModulos(LADO, esOscuro);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodificar(url);
    expect(svg).toContain('<svg');
    expect(svg).toContain(`viewBox="0 0 ${LADO + 4} ${LADO + 4}"`);
    expect(svg).not.toMatch(/<image|href=/);                                          // nada se pide a otro servidor
    expect(svg).toMatch(/<path d="M\d+ \d+h1v1h-1z/);
  });

  it('dibuja exactamente los módulos oscuros, desplazados por el margen', () => {
    const svg = decodificar(qrSvgDeModulos(LADO, esOscuro, { margen: 2 }));
    const celdas = new Set([...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => `${m[1]},${m[2]}`));
    let esperadas = 0;
    for (let f = 0; f < LADO; f += 1) {
      for (let c = 0; c < LADO; c += 1) {
        if (esOscuro(f, c)) {
          esperadas += 1;
          expect(celdas.has(`${c + 2},${f + 2}`)).toBe(true);
        }
      }
    }
    expect(celdas.size).toBe(esperadas);
    expect(celdas.has('2,2')).toBe(true);                       // arriba izquierda
    expect(celdas.has(`${LADO - 1 + 2},2`)).toBe(true);         // arriba derecha
    expect(celdas.has(`2,${LADO - 1 + 2}`)).toBe(true);         // abajo izquierda
    expect(celdas.has(`${LADO - 1 + 2},${LADO - 1 + 2}`)).toBe(false);   // abajo derecha: sin cuadro de posición
  });

  it('respeta el margen y es determinista', () => {
    const a = qrSvgDeModulos(LADO, esOscuro, { margen: 4 });
    expect(qrSvgDeModulos(LADO, esOscuro, { margen: 4 })).toBe(a);
    expect(decodificar(a)).toContain(`viewBox="0 0 ${LADO + 8} ${LADO + 8}"`);
    expect(qrSvgDeModulos(LADO, esOscuro, { margen: 2 })).not.toBe(a);
  });
});
