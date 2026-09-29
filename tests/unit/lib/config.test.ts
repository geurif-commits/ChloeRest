import { afterEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalCorsOrigins = process.env.CORS_ORIGINS;
const originalAllowNullOrigin = process.env.ALLOW_NULL_ORIGIN;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = originalCorsOrigins;
  if (originalAllowNullOrigin === undefined) delete process.env.ALLOW_NULL_ORIGIN;
  else process.env.ALLOW_NULL_ORIGIN = originalAllowNullOrigin;
  vi.resetModules();
});

describe('CORS de producción', () => {
  it('no permite orígenes de desarrollo ni null por defecto', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    delete process.env.ALLOW_NULL_ORIGIN;

    const { config, isAllowedOrigin } = await import('../../../src/lib/config.js');

    expect(config.corsOrigins).toEqual([
      'https://chloerestaurant.lat',
      'https://www.chloerestaurant.lat',
    ]);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(false);
    expect(isAllowedOrigin('null')).toBe(false);
  });

  it('permite null solo con habilitación explícita', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    process.env.ALLOW_NULL_ORIGIN = '1';

    const { isAllowedOrigin } = await import('../../../src/lib/config.js');

    expect(isAllowedOrigin('null')).toBe(true);
  });
});
