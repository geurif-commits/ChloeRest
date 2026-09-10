# ChloeRestaurant — Production Readiness

Este documento es la puerta de salida para operar un restaurante real. Un despliegue solo se considera aprobado cuando todos los puntos **Bloqueantes** están verificados.

## Evidencia verificada en el proyecto

- Backend TypeScript: `npm run typecheck` correcto.
- Tests unitarios: `npm run test` — 66/66.
- Integración reproducible: `npm run test:integration` — health, SPA, auth, mesas, productos, pedido, KDS, cobro, usuarios y CORS.
- RLS: 25 tablas tenant y 25 políticas; aislamiento de lectura/escritura probado.
- Release Electron: `npm run test:release` correcto.
- Electron empaquetado con `nodeIntegration=false`, `contextIsolation=true`, `webSecurity=true` y ventana inicial oculta.
- Backend Windows incluido en el instalador y ejecutado con `windowsHide=true`.
- Arranque de producción con rol operativo restringido probado localmente: `NODE_ENV=production`, `RUN_MIGRATIONS=0`, health HTTP 200.

## Bloqueantes antes de producción pública

### 1. PostgreSQL

- Crear el rol de aplicación con `npm run provision:production-role` usando credenciales temporales fuera de Git.
- Confirmar `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB` y `NOCREATEROLE`.
- Ejecutar migraciones con un rol DDL separado antes de arrancar la aplicación.
- Configurar `RUN_MIGRATIONS=0` en el servicio operativo.

### 2. Secretos y red

- `NODE_ENV=production`.
- `APP_SESSION_SECRET` aleatorio de al menos 32 caracteres.
- `BOOTSTRAP_ADMIN_PIN` de 6 dígitos.
- `CORS_ORIGINS` exclusivamente HTTPS.
- No incluir contraseñas reales en repositorio, logs ni instaladores.

### 3. Operación del restaurante

- Probar impresoras térmicas reales y PDF.
- Probar varias cajas, camareros, cocina y bar simultáneamente.
- Probar caídas de red, reinicio del servidor y recuperación de PostgreSQL.
- Probar backup y restauración en una máquina distinta.
- Validar anulaciones, devoluciones, pagos mixtos y cierres de caja.

### 4. Fiscal

- Completar pruebas DGII/ECF con credenciales y ambiente autorizado.
- Confirmar secuencias NCF, vencimientos, generación de reportes 606/607 y reintentos.
- Obtener aprobación fiscal antes de publicitar cumplimiento certificado.

## Comandos de salida

```bash
npm run typecheck
npm run test
npm run test:integration
npm run test:db-security
npm run test:rls-runtime
npm run test:release
npm run preflight:production
```

`preflight:production` debe terminar con `Production preflight OK`. Si falla, el despliegue debe detenerse.
