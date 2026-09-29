import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { requireRoles, validateTenantAccess } from '../../../src/middleware/auth.js';
import type { UserRole } from '../../../src/types/index.js';

type Auth = { userId: number; nombre: string; userRole: UserRole; empresaId: number | null; isDueno: boolean; ip: string; userAgent: string };
const auth = (rol: UserRole, extra: Partial<Auth> = {}): Auth => ({ userId: 1, nombre: 'X', userRole: rol, empresaId: 1, isDueno: false, ip: '127.0.0.1', userAgent: 't', ...extra });
const pedir = (a?: Auth, extra: Record<string, unknown> = {}) => ({ auth: a, params: {}, body: {}, ...extra }) as unknown as Request;

function correr(middleware: (req: Request, res: Response, next: (e?: unknown) => void) => void, req: Request) {
  let resultado: unknown = 'sin-llamar';
  middleware(req, {} as Response, (error?: unknown) => { resultado = error; });
  return resultado as { statusCode?: number; code?: string } | undefined;
}

describe('requireRoles', () => {
  const soloAdmin = requireRoles('Administrador');

  it('deja pasar al rol permitido', () => {
    expect(correr(soloAdmin, pedir(auth('Administrador')))).toBeUndefined();
  });

  it('rechaza con 403 a un rol no permitido', () => {
    const error = correr(soloAdmin, pedir(auth('Camarero')));
    expect(error?.statusCode).toBe(403);
    expect(error?.code).toBe('FORBIDDEN');
  });

  it('el propietario de la plataforma siempre pasa', () => {
    expect(correr(soloAdmin, pedir(auth('Dueno', { isDueno: true })))).toBeUndefined();
  });

  it('sin autenticar responde 401', () => {
    expect(correr(soloAdmin, pedir(undefined))?.statusCode).toBe(401);
  });
});

describe('validateTenantAccess', () => {
  it('bloquea a quien intenta actuar sobre otra empresa', () => {
    const error = correr(validateTenantAccess, pedir(auth('Administrador', { empresaId: 1 }), { params: { empresaId: '2' } }));
    expect(error?.statusCode).toBe(403);
    expect(error?.code).toBe('TENANT_VIOLATION');
  });

  it('permite actuar sobre la propia empresa o sin indicar empresa', () => {
    expect(correr(validateTenantAccess, pedir(auth('Administrador', { empresaId: 1 }), { params: { empresaId: '1' } }))).toBeUndefined();
    expect(correr(validateTenantAccess, pedir(auth('Administrador')))).toBeUndefined();
  });
});
