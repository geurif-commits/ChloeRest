import { describe, it, expect, vi, beforeEach } from 'vitest';
import { construirCorreoActivacion, type ISolicitudFila } from '../../../src/services/licenciasService.js';
import type { QueryResult, QueryResultRow } from 'pg';

function solicitudBase(overrides: Partial<ISolicitudFila> = {}): ISolicitudFila {
  return {
    id: 1,
    plan_id: 2,
    plan_nombre: 'Anual',
    propietario: 'Juan Pérez',
    negocio: 'Comedor Doña Ana',
    telefono: '8095551234',
    email: 'cliente@correo.com',
    provincia: 'Santiago',
    notas: null,
    estado: 'Atendida',
    metodo_pago: null,
    comprobante: null,
    monto: null,
    moneda: null,
    numero_factura: null,
    pagada_en: null,
    creado_en: null,
    atendida_en: null,
    clave_generada: null,
    clave_pin_inicial: null,
    clave_enviada_en: null,
    plan_duracion: null,
    ...overrides,
  };
}

describe('construirCorreoActivacion', () => {
  it('compone asunto, texto plano, HTML y mailto con los datos de la solicitud', () => {
    const correo = construirCorreoActivacion(
      solicitudBase({ clave_generada: 'CHLOE-ABCD-EFGH', clave_pin_inicial: '654321' })
    );
    expect(correo.asunto).toContain('Comedor Doña Ana');
    expect(correo.textoPlano).toContain('Juan Pérez');
    expect(correo.textoPlano).toContain('Comedor Doña Ana');
    expect(correo.textoPlano).toContain('CHLOE-ABCD-EFGH');
    expect(correo.textoPlano).toContain('654321');
    expect(correo.textoPlano).toContain('Anual');
    expect(correo.textoPlano).toContain('https://chloerestaurant.lat/activacion');
    expect(correo.html).toContain('CHLOE-ABCD-EFGH');
    expect(correo.pin).toBe('654321');
    expect(correo.mailtoUrl.startsWith('mailto:cliente%40correo.com?subject=')).toBe(true);
  });

  it('usa el PIN inicial enviado por la solicitud aunque falte la clave', () => {
    const correo = construirCorreoActivacion(solicitudBase({ clave_pin_inicial: '112233' }));
    expect(correo.pin).toBe('112233');
  });
});

describe.skipIf(Boolean(process.env.BOOTSTRAP_ADMIN_PIN))('construirCorreoActivacion sin PIN en solicitud', () => {
  it('usa el PIN por defecto 041120', () => {
    const correo = construirCorreoActivacion(solicitudBase());
    expect(correo.pin).toBe('041120');
  });
});

describe('generarClaveParaSolicitud (solicitud con clave previa)', () => {
  const mockDb = {
    queryUnscoped: vi.fn(),
    transaction: vi.fn(),
  };

  beforeEach(() => {
    mockDb.queryUnscoped.mockReset();
    mockDb.transaction.mockReset();
    vi.resetModules();
  });

  it('reutiliza la clave existente y marca como enviada si no lo estaba', async () => {
    vi.doMock('../../../src/db/index.js', () => ({ getDatabase: () => mockDb }));
    const { generarClaveParaSolicitud: generarReutilizada } = await import(
      '../../../src/services/licenciasService.js'
    );

    const fila = solicitudBase({
      clave_generada: 'CHLOE-OLD-KEY',
      clave_pin_inicial: '123456',
      clave_enviada_en: null,
    });
    mockDb.queryUnscoped.mockImplementation(async (text: string) => {
      if (text.includes('SELECT')) {
        return { rows: [fila], rowCount: 1 } as QueryResult<QueryResultRow>;
      }
      return { rows: [], rowCount: 1 } as QueryResult<QueryResultRow>;
    });

    const resultado = await generarReutilizada(5, '30D', null);
    expect(resultado.reutilizada).toBe(true);
    expect(resultado.clave).toBe('CHLOE-OLD-KEY');
    expect(resultado.pinInicial).toBe('123456');
    expect(resultado.duracion).toBe('Anual');
    const update = mockDb.queryUnscoped.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('UPDATE solicitudes_licencia')
    );
    expect(update).toBeDefined();
    expect(String(update[0])).toContain('clave_enviada_en');
  });

  it('lanza 400 si la solicitud fue rechazada', async () => {
    const { generarClaveParaSolicitud: generarReutilizada } = await import(
      '../../../src/services/licenciasService.js'
    );
    const fila = solicitudBase({ estado: 'Rechazada' });
    mockDb.queryUnscoped.mockImplementation(async (text: string) => {
      if (text.includes('SELECT')) {
        return { rows: [fila], rowCount: 1 } as QueryResult<QueryResultRow>;
      }
      return { rows: [], rowCount: 1 } as QueryResult<QueryResultRow>;
    });
    await expect(generarReutilizada(5, '30D', null)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('rechazada'),
    });
  });
});
