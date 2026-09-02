# AGENTS.md — Guía para Agentes de Código

## ChloeRestaurant POS v2.1.0+ (TypeScript/Elite)

Sistema de POS especializado para restaurantes dominicanos con integración DGII, licenciamiento y gestión multi-empresa.

---

## 📁 Estructura del Proyecto

### Backend TypeScript (`src/`)

```
src/
├── app.ts                 # Express app factory, middleware stack
├── server.ts              # Entrypoint, startup/shutdown logic
├── routers/               # API endpoints por dominio
│   ├── ping.ts           # Health check
│   ├── auth.ts           # Autenticación y login
│   ├── usuarios.ts       # Gestión de usuarios
│   ├── cuentas.ts        # Gestión de cuentas/mesas
│   ├── productos.ts      # Catálogo y productos
│   ├── inventario.ts     # Inventario y stock
│   ├── dgii.ts           # Reportes fiscales (606/607, ECF)
│   └── negocio.ts        # Configuración empresa/negocio
├── services/              # Business logic (sin estado de HTTP)
│   ├── cuentasService.ts
│   ├── inventarioService.ts
│   ├── dgiiService.ts
│   ├── licenciasService.ts
│   └── notificacionesService.ts
├── middleware/            # Express middleware
│   ├── auth.ts           # JWT validation, roles, tenant isolation
│   ├── errorHandler.ts   # Centralized error mapping
│   └── requestLogger.ts  # HTTP request/response logging
├── lib/                   # Pure utilities (no side effects)
│   ├── core.ts           # httpError, route(), Money, validators
│   ├── logger.ts         # Structured logging
│   ├── dgii.ts           # DGII integration (606/607, ECF)
│   ├── licencias.ts      # License key generation/validation
│   ├── rnc.ts            # Dominican RNC validation
│   └── ecf.ts            # Electronic Control Fiscal
├── db/
│   ├── index.ts          # PostgreSQL connection pool, queries
│   ├── migrations.ts     # Database schema migrations
│   └── queries.ts        # Parameterized SQL queries (in progress)
└── types/
    └── index.ts          # Global interfaces & types

```

### Frontend React (`frontend-restaurante/src/`)

```
frontend-restaurante/src/
├── main.tsx               # React entrypoint
├── App.tsx                # Root component
├── components/            # Reusable components
│   ├── Button.tsx
│   ├── Modal.tsx
│   └── ...
├── pages/                 # Route-based pages
│   ├── LoginPage.tsx
│   ├── CajasPage.tsx
│   ├── AdminPage.tsx
│   └── ...
├── types/
│   └── api.ts            # API response/request types
├── hooks/
│   ├── useAuth.ts
│   ├── useCuentas.ts
│   └── ...
└── utils/
    ├── api.ts            # HTTP client
    └── validators.ts
```

### Tests

```
tests/
├── unit/                 # Pure function tests
│   ├── lib/
│   │   ├── core.test.ts
│   │   ├── dgii.test.ts
│   │   └── ...
│   └── services/
│       ├── cuentasService.test.ts
│       └── ...
├── integration/          # Services + DB
│   ├── auth.test.ts
│   ├── cuentas.test.ts
│   └── ...
└── e2e/                  # Full flows (Playwright)
    ├── pedido.spec.ts
    └── ...
```

---

## 🎯 Convenciones de Código

### Nombres

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Función | camelCase | `getUserById`, `crearCuenta` |
| Clase/Interface | PascalCase | `UserService`, `ICuenta` |
| Constante | UPPER_SNAKE_CASE | `MAX_LOGIN_ATTEMPTS`, `JWT_SECRET` |
| Archivo | lowercase kebab-case | `user-service.ts`, `request-logger.ts` |
| Interfaz (tipos) | I + PascalCase | `IUser`, `ICuenta`, `IDGIIResponse` |

### Imports

```typescript
// Order: Node > External > Local > Types
import { Request, Response } from 'express';
import { createLogger } from '../lib/logger.js';
import { ICuenta } from '../types/index.js';
```

### Router Structure

Máximo 300 líneas por archivo de router.

```typescript
// routers/cuentas.ts
import { Router } from 'express';
import { route, httpError } from '../lib/core.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { CuentasService } from '../services/cuentasService.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const service = new CuentasService();
const logger = createLogger('cuentasRouter');

// POST /api/cuentas
router.post(
  '/',
  requireAuth,
  requireRoles('Camarero', 'Administrador'),
  route(async (req, res) => {
    const { mesa_id, camarero_id } = req.body;

    // Validate
    if (!mesa_id || !camarero_id) {
      throw httpError(400, 'Campos requeridos: mesa_id, camarero_id');
    }

    // Create
    const cuenta = await service.create({
      mesa_id,
      camarero_id,
      empresa_id: req.auth!.empresaId,
    });

    logger.info({
      action: 'CUENTA_CREATED',
      cuentaId: cuenta.id,
      userId: req.auth!.userId,
    });

    res.status(201).json(cuenta);
  })
);

export default router;
```

### Service Structure

Contiene lógica de negocio, validaciones, queries a BD.

```typescript
// services/cuentasService.ts
import { Database } from '../db/index.js';
import { createLogger } from '../lib/logger.js';
import { ICuenta } from '../types/index.js';

export class CuentasService {
  private db: Database;
  private logger = createLogger('CuentasService');

  constructor(db: Database) {
    this.db = db;
  }

  async create(data: {
    mesa_id: number;
    camarero_id: number;
    empresa_id: number;
  }): Promise<ICuenta> {
    this.logger.info({ action: 'CREATE', data });

    // Validate
    if (data.mesa_id <= 0) {
      throw new Error('Mesa ID inválido');
    }

    // Execute
    const result = await this.db.query(
      `INSERT INTO cuentas (mesa_id, camarero_id, empresa_id, estado)
       VALUES ($1, $2, $3, 'Abierta')
       RETURNING *`,
      [data.mesa_id, data.camarero_id, data.empresa_id]
    );

    return result.rows[0];
  }

  async close(cuentaId: number, empresaId: number): Promise<ICuenta> {
    this.logger.info({ action: 'CLOSE', cuentaId });
    // implementación
  }
}
```

### Error Handling

Siempre usar `httpError`:

```typescript
// ❌ MAL
throw new Error('Usuario no encontrado');

// ✅ BIEN
throw httpError(404, 'Usuario no encontrado', 'USER_NOT_FOUND');
```

### Logging

```typescript
import { createLogger } from '../lib/logger.js';

const logger = createLogger('ModuleName');

logger.info({
  action: 'USER_LOGIN',
  userId: 123,
  ip: '192.168.1.1',
});

logger.error({
  action: 'DB_ERROR',
  error: {
    message: err.message,
    stack: err.stack,
  },
});
```

### Money Handling

```typescript
import { Money } from '../lib/core.js';

const precio = new Money(99.99);
const subtotal = precio.multiply(2);
const total = subtotal.add(new Money(18.00));

console.log(total.display()); // "RD$ 217.98"
console.log(total.centavos); // 21798
```

---

## 🧪 Testing

### Unit Tests (Vitest)

```bash
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

Test file: `tests/unit/lib/core.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Money, httpError, isValidRNC } from '../src/lib/core.js';

describe('Money', () => {
  it('should create money from amount', () => {
    const m = new Money(99.99);
    expect(m.centavos).toBe(9999);
  });

  it('should add money', () => {
    const a = new Money(10.00);
    const b = new Money(5.50);
    expect(a.add(b).toAmount()).toBe(15.50);
  });
});

describe('Validators', () => {
  it('should validate Dominican RNC', () => {
    expect(isValidRNC('001-1234567-1')).toBe(true);
    expect(isValidRNC('invalid')).toBe(false);
  });
});
```

### Integration Tests

```bash
# Tests contra BD real (o mocked)
npm run test -- tests/integration/
```

### E2E Tests (Playwright)

```bash
# Requiere app running (npm run dev)
npx playwright test
```

---

## 📝 Adding New Features

### Step 1: Create Service

```bash
# services/nuevaFeatureService.ts
```

### Step 2: Create Router

```bash
# routers/nuevaFeature.ts
# Mount in app.ts: app.use('/api/nueva-feature', nuevaFeatureRouter);
```

### Step 3: Write Tests

```bash
# tests/integration/nuevaFeature.test.ts
# tests/e2e/nuevaFeature.spec.ts
```

### Step 4: Lint & Format

```bash
npm run lint:fix
npm run format
npm run typecheck
```

### Step 5: Create PR

- Requerimientos: 2 code reviews, todas las pruebas pasando
- Descripción: qué, por qué, cómo

---

## 🔒 Authentication & Authorization

### JWT Token Structure

```typescript
interface IAuthPayload {
  userId: number;
  userRole: UserRole;  // 'Administrador' | 'Cajero' | 'Camarero' | ...
  empresaId: number;   // Tenant isolation
  iat: number;
  exp: number;
}
```

### Middleware Stacking

```typescript
// Require auth + specific role + tenant
router.post(
  '/',
  requireAuth,                // Valida JWT
  requireRoles('Administrador'),  // Valida rol
  validateTenantAccess,       // Valida empresa
  route(handler)
);
```

---

## 🗄️ Database

### Connection Pool

```typescript
// db/index.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 25,
  idleTimeoutMillis: 30000,
});
```

### Queries (Parameterized)

```typescript
// ❌ MAL - SQL Injection risk
const query = `SELECT * FROM usuarios WHERE id = ${userId}`;

// ✅ BIEN - Parameterized
const result = await db.query(
  'SELECT * FROM usuarios WHERE id = $1',
  [userId]
);
```

### Row-Level Security (RLS)

Habilitado en BD. Columna `empresa_id` auto-aislada por role de PostgreSQL.

---

## 🚀 Development Workflow

### Start Development

```bash
npm run dev        # Inicia server con hot-reload (tsx watch)
cd frontend-restaurante && npm run dev  # Vite dev server
```

### Build & Deploy

```bash
npm run typecheck  # Valida tipos
npm run lint       # ESLint
npm run format     # Prettier
npm run test       # Tests
npm run build      # Produce dist/
```

---

## 🔧 Debugging

### VS Code Debugger

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Attach to Node",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/server.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

Press F5 to debug.

### Logging

```bash
# Backend logs (structured JSON)
npm run dev 2>&1 | grep ERROR

# Check specific context
npm run dev 2>&1 | grep "cuentasService"
```

---

## 📚 Key Files to Know

| Archivo | Propósito | Mantenido por |
|---------|-----------|--------------|
| `src/lib/core.ts` | Utilities core (httpError, Money, validators) | Core Team |
| `src/lib/logger.ts` | Logging infrastructure | DevOps |
| `src/middleware/auth.ts` | JWT auth & roles | Security |
| `src/middleware/errorHandler.ts` | Error mapping | Backend Lead |
| `src/routers/*` | Business endpoints | Feature Owners |
| `src/services/*` | Business logic | Feature Owners |
| `vitest.config.ts` | Test configuration | QA Lead |
| `.eslintrc.json` | Code style | Frontend/Backend Leads |

---

## 🎓 Resources

- **TypeScript**: https://www.typescriptlang.org/
- **Express**: https://expressjs.com/
- **Vitest**: https://vitest.dev/
- **Playwright**: https://playwright.dev/
- **PostgreSQL**: https://www.postgresql.org/docs/

---

**Última actualización**: 2026-09-02  
**Versión**: 2.1.0+TypeScript  
**Status**: ✅ Producción
