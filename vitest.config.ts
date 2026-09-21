import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        // Piso actual (44 % de líneas): sube cuando se agreguen pruebas. Los routers los cubre `npm run test:e2e`.
        lines: 42,
        functions: 47,
        branches: 36,
        statements: 41,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/types/',
        'src/server.ts',
      ],
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    testTimeout: 10000,
  },
});
