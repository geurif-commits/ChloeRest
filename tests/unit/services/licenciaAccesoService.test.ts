import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MAESTRA = 'clave-maestra-de-prueba';
const hash = (clave: string): string => crypto.createHash('sha256').update(clave).digest('hex');

interface IEscenario {
  equipo?: { empresa_id: number | null; estado: string; licencia_vencimiento: Date | null; clave_activacion: string | null };
  /** Licencias de la empresa, con su clave para poder buscarlas por hash. */
  licencias?: Array<{ clave: string; empresa_id: number; activa: boolean; revocada: boolean; vencimiento: Date | null }>;
  bloqueada?: boolean;
}

/** Carga el servicio con una base simulada que responde según el texto de cada consulta. */
async function cargar(escenario: IEscenario, segundosCache = 0) {
  vi.resetModules();
  process.env.LICENCIA_CACHE_SEGUNDOS = String(segundosCache);
  process.env.LICENSE_ACTIVATION_KEY = MAESTRA;
  const consultas: string[] = [];
  vi.doMock('../../../src/db/index.js', () => ({
    getDatabase: () => ({
      queryUnscoped: async (sql: string, params: unknown[] = []) => {
        consultas.push(sql);
        if (sql.includes('FROM dispositivos')) {
          return escenario.equipo ? { rows: [escenario.equipo], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM licencias') && sql.includes('clave_hash')) {
          const fila = (escenario.licencias ?? []).find((l) => hash(l.clave) === params[0] && l.empresa_id === params[1]);
          return fila ? { rows: [fila], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM licencias')) {
          const filas = (escenario.licencias ?? []).filter((l) => l.empresa_id === params[0]);
          return { rows: filas, rowCount: filas.length };
        }
        if (sql.includes('FROM negocio_config')) {
          return { rows: [{ licencia_bloqueada: Boolean(escenario.bloqueada) }], rowCount: 1 };
        }
        throw new Error(`consulta inesperada: ${sql}`);
      },
    }),
  }));
  const servicio = await import('../../../src/services/licenciaAccesoService.js');
  return { ...servicio, consultas };
}

const futuro = new Date(Date.now() + 30 * 86400000);
const pasado = new Date(Date.now() - 86400000);
const vigente = (clave: string, empresa = 7) => ({ clave, empresa_id: empresa, activa: true, revocada: false, vencimiento: futuro });
const activo = (clave: string | null, empresa = 7) => ({ empresa_id: empresa, estado: 'Activo', licencia_vencimiento: null, clave_activacion: clave });

beforeEach(() => { vi.restoreAllMocks(); });

describe('equipo activado con la clave de su licencia', () => {
  it('con la licencia activa, sin revocar y sin vencer, tiene acceso', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1'), licencias: [vigente('K1')] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toEqual({ vigente: true });
  });

  it('una licencia vitalicia (sin fecha de vencimiento) tiene acceso', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1'), licencias: [{ ...vigente('K1'), vencimiento: null }] });
    expect((await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).vigente).toBe(true);
  });

  it('licencia vencida → LICENCIA_VENCIDA', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1'), licencias: [{ ...vigente('K1'), vencimiento: pasado }] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_VENCIDA' });
  });

  it('licencia revocada → LICENCIA_REVOCADA', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1'), licencias: [{ ...vigente('K1'), activa: false, revocada: true }] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_REVOCADA' });
  });

  it('licencia desactivada → LICENCIA_REQUERIDA', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1'), licencias: [{ ...vigente('K1'), activa: false }] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_REQUERIDA' });
  });

  it('si la licencia con la que se activó ya no existe, el equipo "Activo" NO basta', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('CLAVE-ANTIGUA'), licencias: [vigente('OTRA')] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_REQUERIDA' });
  });

  it('la clave maestra configurada en el servidor también vale aunque no tenga fila de licencia', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo(MAESTRA, 1), licencias: [] });
    expect((await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 1 })).vigente).toBe(true);
  });

  it('una licencia de OTRA empresa con la misma clave no sirve', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1', 7), licencias: [vigente('K1', 8)] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_REQUERIDA' });
  });
});

describe('el equipo en sí', () => {
  it('equipo inexistente o sin id → no activado', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ licencias: [vigente('K1')] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'fantasma', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'DISPOSITIVO_NO_ACTIVADO' });
    expect(await evaluarLicenciaDeAcceso({ deviceId: null, empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'DISPOSITIVO_NO_ACTIVADO' });
  });

  it('equipo pendiente o inactivo → no activado', async () => {
    for (const estado of ['Pendiente', 'Inactivo']) {
      const { evaluarLicenciaDeAcceso } = await cargar({ equipo: { ...activo('K1'), estado }, licencias: [vigente('K1')] });
      expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'DISPOSITIVO_NO_ACTIVADO' });
    }
  });

  it('equipo de otra empresa que la de la sesión → no activado', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1', 8), licencias: [vigente('K1', 8)] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'DISPOSITIVO_NO_ACTIVADO' });
  });

  it('vigencia del equipo vencida → LICENCIA_VENCIDA', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: { ...activo('K1'), licencia_vencimiento: pasado }, licencias: [vigente('K1')] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_VENCIDA' });
  });

  it('negocio bloqueado → LICENCIA_REVOCADA', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ equipo: activo('K1'), licencias: [vigente('K1')], bloqueada: true });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_REVOCADA' });
  });
});

describe('equipo activado sin clave (instalaciones antiguas)', () => {
  it('exige que la empresa tenga alguna licencia vigente', async () => {
    const con = await cargar({ equipo: activo(null), licencias: [vigente('X')] });
    expect((await con.evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).vigente).toBe(true);
    const sin = await cargar({ equipo: activo(null), licencias: [] });
    expect(await sin.evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_REQUERIDA' });
    const vencida = await cargar({ equipo: activo(null), licencias: [{ ...vigente('X'), vencimiento: pasado }] });
    expect(await vencida.evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'LICENCIA_VENCIDA' });
  });
});

describe('equipo sin activar: solo la empresa raíz y solo con licencia', () => {
  it('la empresa raíz con licencia vigente puede entrar desde un equipo sin activar', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ licencias: [vigente('MAESTRA', 1)] });
    expect((await evaluarLicenciaDeAcceso({ deviceId: 'nuevo', empresaId: 1 })).vigente).toBe(true);
    expect((await evaluarLicenciaDeAcceso({ deviceId: 'nuevo', empresaId: null })).vigente).toBe(true);
  });

  it('SIN licencia (sistema recién instalado o borrado) nadie entra, ni el Administrador de la empresa raíz', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ licencias: [] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'nuevo', empresaId: 1 })).toMatchObject({ vigente: false, codigo: 'DISPOSITIVO_NO_ACTIVADO' });
  });

  it('con la licencia de la raíz vencida o revocada tampoco', async () => {
    for (const cambio of [{ vencimiento: pasado }, { activa: false, revocada: true }]) {
      const { evaluarLicenciaDeAcceso } = await cargar({ licencias: [{ ...vigente('MAESTRA', 1), ...cambio }] });
      expect((await evaluarLicenciaDeAcceso({ deviceId: 'nuevo', empresaId: 1 })).vigente).toBe(false);
    }
  });

  it('otra empresa nunca entra desde un equipo sin activar, aunque tenga licencia', async () => {
    const { evaluarLicenciaDeAcceso } = await cargar({ licencias: [vigente('K1', 7), vigente('MAESTRA', 1)] });
    expect(await evaluarLicenciaDeAcceso({ deviceId: 'nuevo', empresaId: 7 })).toMatchObject({ vigente: false, codigo: 'DISPOSITIVO_NO_ACTIVADO' });
  });
});

describe('caché y errores', () => {
  it('reutiliza la respuesta unos segundos y se renueva al invalidar', async () => {
    const { evaluarLicenciaDeAcceso, invalidarCacheLicencias, consultas } = await cargar({ equipo: activo('K1'), licencias: [vigente('K1')] }, 30);
    await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 });
    const primera = consultas.length;
    await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 });
    expect(consultas.length).toBe(primera);
    invalidarCacheLicencias();
    await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 });
    expect(consultas.length).toBeGreaterThan(primera);
  });

  it('sin caché consulta cada vez', async () => {
    const { evaluarLicenciaDeAcceso, consultas } = await cargar({ equipo: activo('K1'), licencias: [vigente('K1')] }, 0);
    await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 });
    const primera = consultas.length;
    await evaluarLicenciaDeAcceso({ deviceId: 'eq-1', empresaId: 7 });
    expect(consultas.length).toBe(primera * 2);
  });

  it('errorDeLicencia produce un 403 con el código que entiende la interfaz', async () => {
    const { errorDeLicencia, ES_CODIGO_DE_LICENCIA } = await cargar({});
    const error = errorDeLicencia({ vigente: false, codigo: 'LICENCIA_VENCIDA', motivo: 'Vencida' });
    expect(error).toMatchObject({ statusCode: 403, code: 'LICENCIA_VENCIDA', message: 'Vencida' });
    expect(ES_CODIGO_DE_LICENCIA('LICENCIA_REVOCADA')).toBe(true);
    expect(ES_CODIGO_DE_LICENCIA('FORBIDDEN')).toBe(false);
    expect(ES_CODIGO_DE_LICENCIA(undefined)).toBe(false);
  });
});
