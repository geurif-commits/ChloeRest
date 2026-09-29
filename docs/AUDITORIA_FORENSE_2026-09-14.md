# AUDITORIA FORENSE COMPLETA — ChloeRestaurant POS v2.2.0
## Fecha: 2026-09-14
## Estado: LISTO PARA VENTA CON RESERVAS

---

## VEREDICTO EJECUTIVO

**¿Se puede desplegar al público general?** SÍ, con 5 correcciones críticas
que deben resolverse antes del primer cliente pagador.

El sistema es funcionalmente sólido, seguro en su mayoría y técnicamente
superior a la mayoría de POS dominicanos en el mercado. Las brechas más
grandes son operacionales (sin backups, sin monitoreo) más que de código.

---

## TABLA RESUMEN POR AREA

| Area | Estado | Severidad | Nota |
|------|--------|-----------|------|
| Autenticación y sesiones | ✅ Sólido | — | Tokens opacos + scrypt + lockout DB |
| Inyección SQL | ✅ Eliminada | — | 100% queries parametrizadas |
| Rate Limiting (login) | ✅ Activo | — | DB-backed, per-IP + per-device |
| Rate Limiting (API general) | ⚠️ Ausente | Media | Sin throttling en endpoints no-login |
| Manejo de errores | ✅ Seguro | — | Nunca filtra stack traces al cliente |
| **Secretos en repositorio** | **🔴 CRÍTICO** | **P0** | **.env con credenciales vivas** |
| CORS + Headers (helmet) | ✅ Configurado | — | HSTS, CSP, X-Frame-Options |
| Subida de archivos | ✅ Segura | — | Magic-byte validation, 5MB max |
| Telegram Bot | ✅ Seguro | — | Solo owner, HTTPS, webhook secret |
| Integración DGII | ✅ Segura | — | HTTPS, secrets en DB |
| **Aislamiento multi-tenant (RLS)** | **⚠️ RLS robusto** | **P0** | **metodos_pago SIN empresa_id ni RLS** |
| **Backups automáticos** | **🔴 NO EXISTEN** | **P0** | **Sin pg_dump, sin cron, sin retención** |
| Tipos de datos (NUMERIC) | ✅ Correcto | — | Todo monetario es NUMERIC, nunca FLOAT |
| Trail de auditoría | ⚠️ Parcial | Media | CRUD de productos/usuarios no auditado |
| Cobertura de tests | 🔴 Baja | Alta | 33% line coverage, routers sin tests |
| TypeScript strictness | ✅ Total | — | strict + 10 checks extra, 0 errores |
| Configuración ESLint | ⚠️ Config muerta | Baja | .eslintrc.json no se usa (flat config activo) |
| Manejo de errores (código) | ✅ Centralizado | — | route() + errorHandler + shutdown handlers |
| Dependencias | ✅ Limpias | — | 1 vuln moderate en pkg (dev-only) |
| Documentación API | 🔴 No existe | Media | Sin OpenAPI, Postman vacío |
| Pipeline CI/CD | ✅ Funcional | — | quality.yml: typecheck+lint+test+audit+build |
| Arquitectura frontend | ⚠️ Monolito | Media | App.jsx 1167 líneas, sin code splitting |
| Seguridad frontend | ⚠️ Token en localStorage | Media | Vulnerable a XSS |
| Soporte móvil | ✅ Bueno | — | 10 breakpoints, 100dvh, touch targets |
| App Electron | ✅ Segura | — | nodeIntegration:false, contextIsolation |
| Deployment | ⚠️ Sin rollback | Media | Script manual, sin backup previo |
| Entorno producción | ⚠️ cPanel compartido | Media | Passenger, sin Nginx reverse proxy |
| Rendimiento frontend | ⚠️ 730KB JS | Media | Sin lazy loading, sin React Query |
| Accesibilidad | 🔴 Inexistente | Alta | 15 ARIA tags, sin labels, sin nav semántico |
| Monitoreo APM | 🔴 No existe | Alta | Sin Sentry, sin uptime monitoring |
| **División de cuenta** | **🔴 No existe** | **Alta** | **Feature faltante crítica** |
| **Descuentos/cupones** | **🔴 No existe** | **Alta** | **Feature faltante crítica** |

---

## ACCIONES CRITICAS PRE-VENTA (P0 — Antes del primer cliente)

### 1. 🔴 ROTAR TODOS LOS SECRETOS expuestos en .env
- `APP_SESSION_SECRET` (session signing key)
- `OWNER_PIN` / `BOOTSTRAP_ADMIN_PIN`
- `LICENSE_ACTIVATION_KEY`
- `DEPLOY_PASS`
- **Acción:** Regenerar todos, desplegar en producción, eliminar .env del historial de git con BFG Repo-Cleaner.

### 2. 🔴 AGREGAR empresa_id + RLS a metodos_pago
- Tabla sin aislamiento: todos los tenants ven los mismos métodos de pago.
- **Acción:** Migración 045: ADD empresa_id, ENABLE RLS, CREATE POLICY, backfill empresa_id=1.

### 3. 🔴 IMPLEMENTAR BACKUPS AUTOMÁTICOS
- Sin pg_dump automatizado = pérdida total de datos en fallo de disco.
- **Acción:** Script backup_db.sh con pg_dump + cron diario + retención 14 días.
- IMPORTANTE: El dump debe usar `SET app.platform=true` para evitar que RLS filtre datos.

### 4. 🔴 AGREGAR rate limiting GENERAL a endpoints públicos
- `/api/solicitud-licencia` y `/api/solicitud-licencia/:id/confirmar-pago` sin throttling.
- **Acción:** express-rate-limit en rutas públicas de formulación.

### 5. 🔴 CORREGIR filtración de error en dueno.ts:254
- `res.status(500).json({ error: 'Error interno: ' + (err as Error).message })` — filtro interno al cliente.
- **Acción:** Usar el error handler centralizado en vez de construir respuesta manual.

---

## ACCIONES ALTAS (P1 — Primeros 30 días)

### 6. Implementar división de cuenta (split bill)
- Feature ausente, esperada por operadores dominicanos.
- Backend: split por items, por porcentaje, por monto fijo.
- Frontend: modal de selección de items a transferir.

### 7. Implementar descuentos y cupones
- Sin capacidad de dar descuentos = POS incompleto para uso real.
- Backend: tablas descuentos + cupones, cálculo en cuentasService.

### 8. Agregar tests de integración (supertest + createApp)
- 0 tests para routers, middleware, y servicios críticos.
- Cobertura actual: 33% (línea), target: 85%.

### 9. Enforce coverage + integration tests en CI
- quality.yml no corre test:coverage ni test:integration.
- Agregar PostgreSQL service container en CI para tests RLS.

### 10. Migrar token de localStorage a httpOnly cookie
- Token en localStorage vulnerable a XSS.
- Cambio: Set-Cookie con httpOnly, Secure, SameSite=Strict.

### 11. Agregar monitoreo Sentry + uptime
- Sin APM = errores invisibles en producción.
- Sentry para backend + frontend, UptimeRobot para /api/health.

### 12. Agregar accessibilidad (a11y)
- 15 ARIA tags en toda la app, sin labels, sin nav semántico.
- axe-core audit, labels en todos los inputs, aria-live en toasts.

### 13. Audit trail completo (auditoria_operaciones)
- CRUD de productos, usuarios, ingredientes, config no auditado.
- Extender registrarAuditoria a todas las operaciones CRUD.

### 14. Code splitting en frontend (React.lazy)
- 730KB JS cargados desde login.
- Lazy loading por módulo: Admin, KDS, Caja, Inventario.

---

## ACCIONES MEDIAS (P2 — Primeros 90 días)

### 15. Reservas de mesa
- Solo estado "Reservada" como color; sin UI de reservas.
- Tabla de reservas + calendario + UI.

### 16. Módulo Delivery / domicilio
- Solo "Para Llevar"; sin tracking de rider ni delivery orders.

### 17. Gestión de clientes / fidelización
- tabla clientes_frecuentes existe pero sin UI CRUD ni puntos.

### 18. Analytics / BI
- Dashboard solo muestra día actual; sin tendencias, margen, por-camarero.

### 19. Documentación API (OpenAPI/Swagger)
- Sin documentación de endpoints.

### 20. Eliminar código muerto
- core.ts: formatRNC, isValidLicenseKey, safeStringify, sleep (no usados).
- Money class sin uso en producción.
- .eslintrc.json muerto (flat config activo).

### 21. Migrar ESLint a flat config con reglas estrictas
- no-floating-promises y explicit-function-return-types no activos.

### 22. Unificar helper de auditoría y validación de campos
- registrarAuditoria invocado 40+ veces manualmente.
- String(req.body.X || '').trim() repetido en cada router.

---

## QUE TIENE EL SISTEMA (Lo que funciona)

### Core POS
- Mapa de mesas con zonas, colores, transferencia
- Flujo completo: abrir cuenta → agregar productos → enviar a KDS/imprimir → cobrar
- Cobro mixto (2 métodos), multi-divisa (DOP/USD/EUR), cambio
- Para Llevar con cliente frecuente auto-creado
- Anulación de ítems con autorización de supervisor
- Motor de totales: subtotal, ITBIS (gravado/exento), propina 10%, total

### DGII Fiscal
- Validación de RNC
- Gestión de secuencias NCF (B01, B02, B03, etc.)
- Reportes 606/607 (JSON/TXT/CSV)
- e-CF (E-31/32/33/34) vía AlgoBack
- Emisor data, ambiente TEST/PROD, certificación

### Multi-Tenant (RLS)
- 25 tablas con RLS habilitado y FORCE RLS
- Políticas por empresa_id
- Verificación de rol PostgreSQL al inicio (no superuser, no bypassrls)
- AsyncLocalStorage para contexto de request
- Separación de roles: DDL (migraciones) vs operacional

### KDS (Cocina/Bar)
- SSE con tickets efímeros
- Reconexión automática, fallback polling 5s
- Categorización por tipo (Cocina/Bar)
- Sonido en nuevos pedidos, despacho por estación

### Licenciamiento SaaS
- Claves HMAC firmadas (CHLOE-<DUR>-<SIG>)
- Registro/activación de dispositivos
- Planes, solicitudes, renovación
- Bloqueo por expiración
- Panel Dueño para gestión

### Panel Dueño
- Invoices, licencias, login, dispositivos
- Reset de datos preservando PIN
- Epoch-based token revocation
- Telegram bot para gestión remota

### Frontend
- Login, Wizard Setup, Mapa Mesas, Pedido, KDS
- Caja (apertura, cobro, cierre, arqueo)
- Admin: usuarios, productos, recetas, mesas, NCF, inventario, historial, config
- Temas (oscuro, claro, luxury gold), logo personalizable
- 10 breakpoints responsive, touch targets 68-86px
- Auto-update Electron con diálogo nativo

---

## FEATURES FALTANTES (para POS completo)

| Feature | Impacto | Esfuerzo |
|---------|---------|----------|
| División de cuenta | Alto | Alto |
| Descuentos / cupones | Alto | Medio |
| Reservas de mesa | Medio | Medio |
| Delivery / domicilio | Medio | Alto |
| Clientes / fidelización | Medio | Medio |
| Analytics / BI | Medio | Alto |
| Notificaciones push | Bajo | Bajo |
| Code signing Electron | Bajo | Bajo |

---

## ESTADO DEL CÓDIGO

- **Archivos fuente backend:** ~19 routers, ~8 services, ~7 lib utilities
- **Líneas TypeScript backend:** ~12,000
- **Frontend JSX:** ~8,000 (App.jsx monolito de 1,167 líneas)
- **Migraciones de BD:** 044
- **Tests:** 66/66 passing (33% coverage)
- **Build:** tsc --noEmit 0 errores, ESLint 0 errores, Vitest 66/66
- **Commits recientes:** ec5efe8 (hardening), 91dee7b (tema claro), 9214d11 (seguridad), 86dbe54 (mobile+update), dd622e7 (cat grid), 07e3c4d (cat compact), 2da5101 (producto reducido), d7e99da (miniaturas)

---

## CONCLUSIÓN

ChloeRestaurant POS v2.2.0 es un sistema técnicamente competente con
fortalezas reales en DGII, RLS multi-tenant, y licenciamiento SaaS.
Las 5 acciones P0 (secretos, RLS metodos_pago, backups, rate limit,
error leak) son correcciones de 1-2 días. Las features faltantes
(split bill, descuentos) son necesarias para competitividad pero no
bloquean un MVP para clientes pequeños que solo necesitan el flujo
básico de mesa → pedido → cobro.

**Recomendación:** Resolver las 5 P0, lanzar beta controlada con 2-3
restaurantes piloto, iterar P1 durante 30 días, y escalar a venta
general con las P2 completadas.

---

*Auditoría generada automáticamente el 2026-09-14 por análisis de código.*
*Archivos auditados: src/**, frontend-restaurante/src/**, tests/**, scripts/**, configs.*
