import { describe, it, expect } from 'vitest';
import { directivasCsp } from '../../../src/lib/csp.js';

describe('directivasCsp', () => {
  it('permite imágenes propias, data: y blob: (vistas previas de logotipo y fondo)', () => {
    expect(directivasCsp()['img-src']).toEqual(["'self'", 'data:', 'blob:']);
  });

  it('no abre las imágenes a servidores externos (el QR de la factura se genera en el equipo)', () => {
    const origenes = directivasCsp()['img-src'].filter((o) => /^https?:/.test(o));
    expect(origenes).toEqual([]);
  });

  it('conserva las directivas por omisión de helmet y el origen central para connect-src', () => {
    const d = directivasCsp();
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['connect-src']).toEqual(["'self'", 'https://chloerestaurant.lat']);
  });
});
