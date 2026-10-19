import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler.js';
import { httpError } from '../../../src/lib/core.js';

function respuestaFalsa() {
  const res = { statusCode: 0, cuerpo: undefined as unknown } as { statusCode: number; cuerpo: unknown; status: (c: number) => unknown; json: (b: unknown) => unknown };
  res.status = (codigo: number) => { res.statusCode = codigo; return res; };
  res.json = (cuerpo: unknown) => { res.cuerpo = cuerpo; return res; };
  return res;
}
const peticion = { method: 'GET', path: '/api/prueba', headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, get: () => undefined } as unknown as Request;

function ejecutar(error: Error) {
  const res = respuestaFalsa();
  errorHandler(error, peticion, res as unknown as Response, vi.fn());
  return res as { statusCode: number; cuerpo: { error: string; code?: string; success: boolean } };
}

describe('errorHandler', () => {
  it('responde con el código y el mensaje de un error HTTP propio', () => {
    const res = ejecutar(httpError(409, 'La caja está cerrada.', 'CAJA_CERRADA'));
    expect(res.statusCode).toBe(409);
    expect(res.cuerpo).toMatchObject({ success: false, error: 'La caja está cerrada.', code: 'CAJA_CERRADA' });
  });

  it('convierte una violación de unicidad de PostgreSQL (23505) en 409', () => {
    const error = Object.assign(new Error('duplicate key'), { code: '23505' });
    const res = ejecutar(error);
    expect(res.statusCode).toBe(409);
    expect(res.cuerpo.code).toBe('DUPLICATE_KEY');
  });

  it('explica con un mensaje accionable un esquema desactualizado (42P01 / 42703) o sin permisos (42501)', () => {
    for (const code of ['42P01', '42703']) {
      const res = ejecutar(Object.assign(new Error('no existe la relación'), { code }));
      expect(res.statusCode).toBe(503);
      expect(res.cuerpo.code).toBe('DB_SCHEMA_OUTDATED');
      expect(res.cuerpo.error).toMatch(/migraciones/i);
    }
    const permisos = ejecutar(Object.assign(new Error('permission denied'), { code: '42501' }));
    expect(permisos.statusCode).toBe(503);
    expect(permisos.cuerpo.error).toMatch(/permisos/i);
  });

  it('nunca filtra el detalle interno de un error inesperado', () => {
    const res = ejecutar(new Error('password authentication failed for user "postgres" (secreto-interno)'));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.cuerpo)).not.toContain('secreto-interno');
  });
});

describe('notFoundHandler', () => {
  it('entrega un error 404 NOT_FOUND al manejador de errores', () => {
    let recibido: { statusCode?: number; code?: string } | undefined;
    notFoundHandler(peticion, respuestaFalsa() as unknown as Response, ((error: unknown) => { recibido = error as typeof recibido; }) as never);
    expect(recibido?.statusCode).toBe(404);
    expect(recibido?.code).toBe('NOT_FOUND');
  });
});
