import { describe, it, expect } from 'vitest';
import {
  asegurarCupo,
  enmascararClave,
  mensajeSinCupo,
  obtenerCupo,
  sha256Hex,
  validarCambioCupo,
} from '../../../src/services/licenciaCupoService.js';
import type { IQueryable } from '../../../src/services/auditoriaService.js';

const mensaje = (fn: () => unknown): string => {
  try { fn(); } catch (error) { return error instanceof Error ? error.message : String(error); }
  return '';
};

/** Cliente simulado: responde por el texto de la consulta (licencias → cupo, dispositivos → activos). */
function clienteSimulado(opciones: { licencia?: { id: number; max_dispositivos: number }; activos: number }): { client: IQueryable; llamadas: Array<{ sql: string; params: unknown[] }> } {
  const llamadas: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      llamadas.push({ sql, params });
      if (sql.includes('FROM licencias')) {
        return opciones.licencia ? { rows: [opciones.licencia], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM dispositivos')) {return { rows: [{ total: opciones.activos }], rowCount: 1 };}
      return { rows: [], rowCount: 0 };
    },
  } as unknown as IQueryable;
  return { client, llamadas };
}

describe('enmascararClave', () => {
  it('oculta el centro de la clave y deja el tipo y el final', () => {
    expect(enmascararClave('CHLOE-12M-A1B2C-D7E8F')).toBe('CHLOE-12M-•••••-D7E8F');
    expect(enmascararClave('CHLOE-12M-A1B2C-X9Y8Z-D7E8F')).toBe('CHLOE-12M-•••••-D7E8F');
  });
  it('tolera claves cortas, vacías y nulas', () => {
    expect(enmascararClave('ABCDEFGH')).toBe('•••••DEFGH');
    expect(enmascararClave('')).toBeNull();
    expect(enmascararClave(null)).toBeNull();
    expect(enmascararClave(undefined)).toBeNull();
  });
});

describe('mensajeSinCupo', () => {
  it('concuerda en singular y plural', () => {
    expect(mensajeSinCupo(1)).toMatch(/1 equipo activo y/);
    expect(mensajeSinCupo(2)).toMatch(/2 equipos activos y/);
  });
});

describe('validarCambioCupo', () => {
  it('exige un motivo de al menos 3 caracteres y como máximo 300', () => {
    expect(mensaje(() => validarCambioCupo({ max_dispositivos: 3 }))).toMatch(/motivo/i);
    expect(mensaje(() => validarCambioCupo({ max_dispositivos: 3, motivo: '  ab ' }))).toMatch(/motivo/i);
    expect(mensaje(() => validarCambioCupo({ max_dispositivos: 3, motivo: 'x'.repeat(301) }))).toMatch(/largo/i);
  });

  it('acepta números o textos numéricos enteros entre 1 y 50', () => {
    expect(validarCambioCupo({ max_dispositivos: 3, motivo: 'Segundo local' })).toEqual({ maxDispositivos: 3, motivo: 'Segundo local', desactivar: [] });
    expect(validarCambioCupo({ max_dispositivos: '50', motivo: 'Cadena' }).maxDispositivos).toBe(50);
    expect(validarCambioCupo({ max_dispositivos: 1, motivo: 'Reducción' }).maxDispositivos).toBe(1);
  });

  it('rechaza 0, negativos, decimales, texto, vacíos y más de 50 equipos', () => {
    for (const malo of [0, -1, 2.5, 51, 'tres', '', Number.NaN, true]) {
      expect(mensaje(() => validarCambioCupo({ max_dispositivos: malo, motivo: 'motivo válido' }))).toMatch(/entero entre 1 y 50/);
    }
  });

  it('exige indicar el nuevo número de equipos', () => {
    expect(mensaje(() => validarCambioCupo({ motivo: 'motivo válido' }))).toMatch(/Indica el nuevo número/);
    expect(mensaje(() => validarCambioCupo({ max_dispositivos: null, motivo: 'motivo válido' }))).toMatch(/Indica el nuevo número/);
  });

  it('ignora campos que ya no existen (como instalaciones) sin dejarlos pasar', () => {
    const entrada = validarCambioCupo({ max_dispositivos: 3, max_instalaciones: 9, motivo: 'motivo válido' }) as unknown as Record<string, unknown>;
    expect(entrada.maxInstalaciones).toBeUndefined();
    expect(entrada.maxDispositivos).toBe(3);
  });

  it('normaliza la lista de equipos a desactivar (sin repetidos) y rechaza ids inválidos', () => {
    expect(validarCambioCupo({ max_dispositivos: 1, motivo: 'Reducción', desactivar: [4, '5', 4] }).desactivar).toEqual([4, 5]);
    for (const mala of ['4', [0], [-3], [1.5], ['x'], [null]]) {
      expect(mensaje(() => validarCambioCupo({ max_dispositivos: 1, motivo: 'Reducción', desactivar: mala }))).toMatch(/no es válida/);
    }
  });
});

describe('obtenerCupo', () => {
  it('usa el máximo de la licencia y cuenta los equipos activos de esa clave, excluyendo el indicado', async () => {
    const { client, llamadas } = clienteSimulado({ licencia: { id: 9, max_dispositivos: 5 }, activos: 3 });
    const cupo = await obtenerCupo(client, 7, 'CHLOE-12M-AAAAA-BBBBB', 42);
    expect(cupo).toEqual({ licenciaId: 9, max: 5, activos: 3 });
    expect(llamadas[0].params).toEqual([sha256Hex('CHLOE-12M-AAAAA-BBBBB'), 7]);
    expect(llamadas[1].params).toEqual([7, 'CHLOE-12M-AAAAA-BBBBB', 42]);
  });

  it('sin licencia registrada (clave antigua o equipo sin clave) usa el cupo predeterminado de 2', async () => {
    const { client, llamadas } = clienteSimulado({ activos: 1 });
    expect(await obtenerCupo(client, 1, null)).toEqual({ licenciaId: null, max: 2, activos: 1 });
    expect(llamadas).toHaveLength(1);
    expect((await obtenerCupo(clienteSimulado({ activos: 0 }).client, 1, 'CLAVE-SIN-REGISTRAR')).max).toBe(2);
  });
});

describe('asegurarCupo', () => {
  it('deja activar mientras haya espacio', async () => {
    const { client } = clienteSimulado({ licencia: { id: 1, max_dispositivos: 3 }, activos: 2 });
    await expect(asegurarCupo(client, { empresaId: 1, clave: 'CLAVE-A' })).resolves.toMatchObject({ max: 3, activos: 2 });
  });

  it('rechaza con 403 CUPO_DISPOSITIVOS cuando los activos ya llegaron al máximo', async () => {
    const { client } = clienteSimulado({ licencia: { id: 1, max_dispositivos: 2 }, activos: 2 });
    await expect(asegurarCupo(client, { empresaId: 1, clave: 'CLAVE-A' })).rejects.toMatchObject({ statusCode: 403, code: 'CUPO_DISPOSITIVOS' });
  });

  it('ampliar el cupo de una licencia ya usada habilita el siguiente equipo', async () => {
    const lleno = clienteSimulado({ licencia: { id: 1, max_dispositivos: 2 }, activos: 2 });
    await expect(asegurarCupo(lleno.client, { empresaId: 1, clave: 'CLAVE-A' })).rejects.toBeTruthy();
    const ampliado = clienteSimulado({ licencia: { id: 1, max_dispositivos: 3 }, activos: 2 });
    await expect(asegurarCupo(ampliado.client, { empresaId: 1, clave: 'CLAVE-A' })).resolves.toBeTruthy();
  });

  it('un cupo de 1 equipo bloquea el segundo', async () => {
    const { client } = clienteSimulado({ licencia: { id: 1, max_dispositivos: 1 }, activos: 1 });
    await expect(asegurarCupo(client, { empresaId: 1, clave: 'CLAVE-A' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
