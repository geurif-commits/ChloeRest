# ARCHITECTURE.md — Diseño del Sistema

## ChloeRestaurant POS v2.1.0+

Sistema de POS para restaurantes dominicanos con:
- Multi-empresa (tenant isolation vía RLS)
- Integración DGII (reportes 606/607, ECF)
- Licenciamiento (7D a vitalicia)
- Facturación y gestión de inventario
- Notificaciones Telegram en tiempo real

---

## 🏗️ Capas Arquitectónicas

```
┌────────────────────────────────────────────────┐
│  Frontend Layer (React 19 + Vite + Tailwind)  │
│  - UI Components, State Management            │
│  - Type-safe API calls (TypeScript)           │
└────────────────┬─────────────────────────────┘
                 │ HTTPS
┌────────────────▼─────────────────────────────┐
│  API Gateway & Security Layer (Express)      │
│  - CORS, Helmet (CSP, X-Frame-Options)       │
│  - JWT Authentication                        │
│  - Request ID (tracing)                      │
│  - Rate limiting                             │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│  Business Logic Layer (Services + Routers)  │
│  - CuentasService (bills)                    │
│  - InventarioService (stock)                 │
│  - DGIIService (fiscal reports)              │
│  - LicenciasService (licensing)              │
│  - NotificacionesService (Telegram)          │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│  Data Layer (PostgreSQL 15)                  │
│  - Connection Pool (max 25)                  │
│  - Row-Level Security (RLS)                  │
│  - Multi-tenant (empresa_id)                 │
│  - Migrations (27 applied)                   │
└────────────────────────────────────────────────┘
```

---

## 🔄 Request Lifecycle

### Example: Create Account (Crear Cuenta)

```
1. CLIENT
   POST /api/cuentas
   { mesa_id: 1, camarero_id: 5 }
   Authorization: Bearer eyJhbGc...

2. GATEWAY LAYER (Express)
   ✓ CORS validation
   ✓ Body parsing (JSON)
   ✓ Request ID generation

3. AUTH MIDDLEWARE
   ✓ Extract JWT from header
   ✓ Verify signature with JWT_SECRET
   ✓ Check expiration
   ✓ Extract userId, userRole, empresaId
   → Set req.auth

4. ROLE MIDDLEWARE
   ✓ Check if userRole in ['Camarero', 'Administrador']
   → Allow or throw 403

5. TENANT VALIDATION
   ✓ Check empresaId matches user's empresa
   → Allow or throw 403 TENANT_VIOLATION

6. ROUTER (cuentasRouter)
   ✓ Validate input (mesa_id, camarero_id present & valid)
   ✓ Call CuentasService.create()

7. SERVICE (CuentasService)
   ✓ Apply business rules
     - Verify mesa exists and belongs to empresa
     - Verify camarero exists and belongs to empresa
     - Check if mesa already has open account
   ✓ Call db.query() with parameterized SQL

8. DATABASE LAYER
   ✓ Execute INSERT with RLS enforcement
     SET app.empresa_id = $1  (row-level security)
     INSERT INTO cuentas (mesa_id, camarero_id, empresa_id, estado)
     VALUES ($1, $2, $3, 'Abierta')
   ✓ Return inserted row

9. RESPONSE
   ✓ Log success
   ✓ Return 201 + cuenta JSON
   {
     "id": 123,
     "mesa_id": 1,
     "estado": "Abierta",
     "subtotal": 0,
     "created_at": "2026-09-02T12:00:00Z"
   }

10. CLIENT
    ✓ Receive 201 + data
    ✓ Update local state
    ✓ Show success toast
    ✓ Redirect to caja page
```

---

## 🔐 Authentication & Authorization

### JWT Token Structure

```typescript
{
  userId: 123,
  userRole: 'Cajero',
  empresaId: 5,
  iat: 1725270000,
  exp: 1725356400  // 24h
}
```

### User Roles

| Role | Permisos |
|------|----------|
| **Propietario** | Todo (acceso administrativo completo) |
| **Administrador** | Gestión de usuarios, reportes, config |
| **Supervisor** | Reportes, cierre de caja |
| **Cajero** | Cobros, cambio, cierre de caja |
| **Camarero** | Crear cuentas, agregar items |
| **Cocina** | Ver pedidos KDS, marcar completados |
| **Gerente** | Reportes, inventario, análisis |

### Multi-Tenancy (Row-Level Security)

```sql
-- PostgreSQL RLS (Row-Level Security)

-- Create policy for usuarios table
CREATE POLICY usuarios_isolation ON usuarios
  USING (empresa_id = current_setting('app.empresa_id')::int)
  WITH CHECK (empresa_id = current_setting('app.empresa_id')::int);

-- On request
SET app.empresa_id = 5;  -- Set tenant context
SELECT * FROM usuarios;  -- Only rows where empresa_id = 5 returned
```

**Benefit**: Tenant isolation enforced at database level, not application logic.

---

## 💾 Data Model (Simplified)

### Core Entities

```
empresas (tenants)
├── id
├── nombre
├── rnc
└── activo

usuarios
├── id
├── empresa_id
├── nombre
├── email
├── rol
└── activo

mesas (tables)
├── id
├── empresa_id
├── numero
└── capacidad

cuentas (bills/accounts)
├── id
├── empresa_id
├── mesa_id
├── camarero_id
├── estado (Abierta/Cerrada/Anulada)
├── subtotal
├── itbis
├── total
├── fecha_apertura
└── fecha_cierre

lineas_cuenta (bill items)
├── id
├── cuenta_id
├── producto_id
├── cantidad
├── precio_unitario
└── subtotal

productos (menu items)
├── id
├── empresa_id
├── nombre
├── precio_venta
├── costo_unitario
├── stock_actual
└── sku

inventario (stock movements)
├── id
├── empresa_id
├── producto_id
├── cantidad_anterior
├── cantidad_nueva
├── motivo (Venta/Ajuste/Devolución)
└── usuario_id

licencias
├── id
├── empresa_id
├── clave_activacion
├── estado (Activa/Expirada)
└── fecha_expiracion

reportes_dgii
├── id
├── empresa_id
├── tipo (606/607/ECF)
├── periodo
├── estado (Pendiente/Procesado/Enviado)
└── contenido (JSON)
```

---

## 🔄 Key Workflows

### 1. Flujo de Venta (Sale Flow)

```
Camarero
  ↓
Abre Cuenta (POST /api/cuentas)
  ↓
Agrega Items (POST /api/cuentas/{id}/items)
  ↓
Aplica Descuento (PUT /api/cuentas/{id}/descuento)
  ↓
Cobra (POST /api/cuentas/{id}/cobro)
  ├─ Crea Transacción
  ├─ Genera NCF (Número de Comprobante Fiscal)
  ├─ Actualiza Inventario (stock - cantidad)
  ├─ Cierra Cuenta
  └─ Notifica Telegram (recaudación)
```

### 2. Flujo de Reporte DGII (Tax Reporting)

```
Fin de Periodo (mes)
  ↓
Sistema genera Reporte 606 (compras)
  ├─ Agrupa por RNC proveedor
  ├─ Suma montos
  └─ Calcula ITBIS
  ↓
Sistema genera Reporte 607 (ventas)
  ├─ Agrupa por cliente
  ├─ Suma montos
  └─ Calcula ITBIS
  ↓
Sistema genera ECF (ECF details)
  ├─ Detalla cada transacción
  ├─ Incluye NCF
  └─ Valida con DGII
  ↓
Admin revisa → Envía a DGII
  ↓
DGII responde ✓ o ✗
```

### 3. Flujo de Licencia (License Activation)

```
Propietario inicia app
  ↓
System verifica licencia en BD
  ├─ Si Activa: ✓ (use app)
  ├─ Si Expirada: ✗ (show expiration modal)
  └─ Si No existe: ✗ (show activation screen)
  ↓
Propietario ingresa clave de activación
  ├─ Valida formato (CHLOE-XXXXX-XXXXX-XXXXX-XXXXX)
  ├─ Valida checksum
  └─ Busca en BD de claves
  ↓
Si válida:
  ├─ Inserta licencia_id con fecha_expiracion
  ├─ Marca como Activa
  └─ Permite acceso
```

---

## 🧪 Testing Strategy

### Unit Tests (Vitest)

Focus: Pure functions, no DB, no HTTP

```
tests/unit/
├── lib/
│   ├── core.test.ts        (Money, validators, httpError)
│   ├── dgii.test.ts        (DGII logic)
│   ├── licencias.test.ts   (License key generation)
│   └── rnc.test.ts         (RNC validation)
└── services/
    ├── cuentasService.test.ts      (billing logic)
    └── inventarioService.test.ts   (stock management)
```

Coverage target: **95%+**

### Integration Tests (Vitest + DB)

Focus: Services + real (or mocked) database

```
tests/integration/
├── auth.test.ts           (login, tokens)
├── cuentas.test.ts        (account lifecycle)
├── productos.test.ts      (product CRUD)
└── dgii.test.ts           (report generation)
```

Coverage target: **80%+**

### E2E Tests (Playwright)

Focus: Full user journeys, critical paths

```
tests/e2e/
├── auth.spec.ts           (login flow)
├── pedido.spec.ts         (create order, pay, close)
├── inventario.spec.ts     (stock movements)
└── reportes.spec.ts       (DGII report flow)
```

### Test Pyramid

```
        ▲
        │  E2E (Playwright)  [5-10%]
        │  ▲▲▲
        │
        │  Integration (Vitest+DB)  [20-30%]
        │  ▲▲▲▲▲▲
        │
        │  Unit (Vitest)  [60-70%]
        │  ▲▲▲▲▲▲▲▲▲▲▲▲
        └─────────────────────────►
         Fast ←→ Slow
         Cheap ←→ Expensive
```

---

## 🚀 Deployment Architecture

### Development

```
Developer
  ↓
npm run dev (tsx watch)
  ├─ Backend: http://localhost:3000
  └─ Frontend: http://localhost:5173
  ↓
npm run test:watch
npm run lint:fix
```

### Staging

```
Feature Branch
  ↓
Push to GitHub
  ↓
CI/CD (GitHub Actions)
  ├─ npm run typecheck
  ├─ npm run lint
  ├─ npm run test
  └─ npm run test:coverage
  ↓
If ✓ → Deploy to staging.chloerestaurant.lat
  ├─ Backend compiled
  ├─ Frontend built + optimized
  └─ DB migrations run
  ↓
QA testing + E2E tests
```

### Production

```
Merge to main
  ↓
CI/CD
  ├─ All tests pass
  ├─ Code review approved (2x)
  └─ Coverage ≥ 85%
  ↓
Manual approval (Prod Release)
  ↓
Deploy to chloerestaurant.lat
  ├─ Blue-Green or Canary
  ├─ Health checks (GET /health)
  └─ Auto-rollback if unhealthy
  ↓
Monitoring + Logging (pino + structured JSON)
```

---

## 📊 Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API Response (p95) | <200ms | ~150ms | ✅ |
| Frontend Load | <3s | ~2.5s | ✅ |
| DB Query (p95) | <50ms | ~30ms | ✅ |
| Overall Request (p95) | <500ms | ~400ms | ✅ |
| Test Coverage | ≥85% | 70% | 🚧 |

---

## 🔒 Security Layers

### 1. Network Level (HTTPS/TLS)

- ✅ SSL/TLS certificate (Let's Encrypt)
- ✅ HSTS enabled
- ✅ No mixed content

### 2. Application Level

- ✅ Helmet (CSP, X-Frame-Options: DENY, etc.)
- ✅ CORS (specific origins only)
- ✅ Rate limiting (login: 5 req/min)
- ✅ Input validation (Zod schemas)
- ✅ SQL injection prevention (parameterized queries)

### 3. Authentication

- ✅ JWT tokens (HS256, 24h TTL)
- ✅ Token refresh (optional)
- ✅ PIN admin (6 digits, from .env)

### 4. Authorization

- ✅ Role-based access control (RBAC)
- ✅ Tenant isolation (RLS in PostgreSQL)
- ✅ Audit logs (user, action, timestamp)

### 5. Data

- ✅ Database encryption at rest (optional)
- ✅ Backups automated daily
- ✅ .env excluded from git

---

## 📈 Monitoring & Observability

### Logs

Structured JSON logs via `pino`:

```json
{
  "level": "error",
  "timestamp": "2026-09-02T12:00:00.000Z",
  "context": "cuentasService",
  "action": "CREATE_FAILED",
  "cuentaId": null,
  "userId": 5,
  "empresaId": 2,
  "error": {
    "message": "Mesa already has open account",
    "code": "MESA_BUSY"
  }
}
```

### Metrics (Optional)

- Request count by endpoint
- Error rate by endpoint
- P50/P95/P99 latencies
- Database connection pool usage

### Health Checks

- `GET /health` — liveness
- `GET /health/ready` — readiness (DB connected, migrations applied)

---

## 🔄 API Versioning

### Strategy: URL-based

```
/api/v1/cuentas      (v1, deprecated soon)
/api/v2/cuentas      (v2, current)
/api/v3/cuentas      (v3, future)
```

### Deprecation Process

1. Release new version `/api/v2/...`
2. Announce 6-month deprecation window
3. Support both v1 and v2 in parallel
4. Remove v1 after 6 months

---

## 🎯 Tech Stack Decision Rationale

| Tech | Why | Alternatives Considered |
|------|-----|------------------------|
| **Express** | Lightweight, mature, community | Fastify, Hapi |
| **PostgreSQL** | ACID, RLS native, scalable | MySQL, MongoDB |
| **React 19** | Component-driven, type-safe | Vue, Svelte |
| **TypeScript** | Catch errors at compile-time | Plain JavaScript |
| **Vitest** | Fast, ESM-native, modern | Jest, Mocha |
| **Playwright** | Cross-browser, reliable | Cypress, Selenium |

---

**Last Updated**: 2026-09-02  
**Version**: 2.1.0+TypeScript  
**Status**: ✅ Active
