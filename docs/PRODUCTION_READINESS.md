# ChloeRestaurant — Production Readiness

Este documento es la puerta de salida para operar un restaurante real. Un despliegue solo se considera aprobado cuando todos los puntos **Bloqueantes** están verificados.

## Evidencia verificada en el proyecto

- Backend TypeScript: `npm run typecheck` correcto.
- Tests unitarios: `npm run test` — 178/178 (piso de cobertura en `npm run test:coverage`).
- Integración reproducible: `npm run test:integration` — health, SPA, auth, mesas, productos, pedido, KDS, cobro, usuarios y CORS.
- Extremo a extremo: `npm run test:e2e` (52 comprobaciones: rutas sin credenciales, roles, ITBIS/propina, descuentos, división de cuenta, caja cerrada, turnos, respaldos, bloqueo de PIN); corre también en CI.
- Respaldos: `npm run backup` y `npm run backup:verify` (restaura en una base temporal y compara tablas, RLS y migraciones).
- Accesibilidad: 0 violaciones WCAG 2.1 A/AA (axe-core) en las pantallas principales, el panel completo y el cobro, en los tres temas.
- Despliegue: `npm run verify:deploy -- https://<dominio>` (solo lectura).
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

- Respaldos con copia **fuera del equipo** y prueba de restauración mensual (`docs/OPERACION.md`).
- Zona horaria de la base de datos = `America/Santo_Domingo` (`/api/health` → `zonaHorariaBd`).
- Instalador firmado con certificado de firma de código (`docs/OPERACION.md`, §6).

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
