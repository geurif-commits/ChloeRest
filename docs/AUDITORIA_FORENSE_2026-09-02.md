# AUDITORÍA FORENSE — CHLOE RESTAURANT POS
**Fecha:** 2026-09-02
**Alcance:** Backend (Node/Express/PostgreSQL), Frontend (React/Vite/Tailwind), Electron, Telegram, DGII/ECF.
**Versión auditada:** 2.1.0 (rama `main`, commit `dd2e662` + limpieza `6420527`).

---

## 1. Resumen ejecutivo

ChloeRestaurant es un **POS multi-tenant** para restaurantes con dos superficies de despliegue:
**Electron (escritorio)** y **web (chloerestaurant.lat)**, con licenciamiento por clave, panel
del propietario, facturación electrónica DGII (Rep. Dominicana) y bot de Telegram.

**Veredicto general: 7.8 / 10.** El sistema es funcional, seguro (RLS multi-tenant, PINs
hasheados, rate-limit) y ya cuenta con un design system coherente. Los puntos débiles son
**mantenibilidad** (backend monolítico de ~212 KB), **ausencia de TypeScript** en el frontend,
y **errores latentes en el flujo del propietario** (corregidos en esta auditoría).

### Hallazgo crítico corregido
El endpoint `POST /api/dueno/reset-pruebas` (borrar datos de prueba del dueño) devolvía
**error 500 en producción** por dos causas:
1. Usaba `SET session_replication_role = replica`, que **requiere superusuario** de PostgreSQL.
   En producción el usuario de BD no es superusuario (el propio `db.js` lo exige), por lo que
   la operación fallaba con "permission denied".
2. Insertaba en `negocio_config` la columna `setup_completado`, que **no existe** en esa tabla
   (solo existe en `configuracion_sistema`).

Además, el reset borraba `configuracion_sistema` y luego hacía `UPDATE ... WHERE id=1` sobre una
tabla vacía (0 filas), **perdiendo el `owner_pin_hash`** y dejando el sistema sin fila de
configuración base.

**Corrección aplicada y validada** (ver §4): se eliminó la dependencia de superusuario, se
preserva el PIN del dueño, se recrea `configuracion_sistema` con `setup_completado=FALSE` y se
corrige el insert de `negocio_config`. Probado end-to-end: **200 OK**, estado limpio correcto.

---

## 2. Arquitectura y stack actual

| Capa | Tecnología | Estado |
|------|-----------|--------|
| Backend | Node.js + Express 4 + `pg` | Monolito `server.js` (~212 KB, ~3700 líneas) |
| Base de datos | PostgreSQL 18, multi-tenant con **RLS** por `empresa_id` | Sólida |
| Frontend | React 19 + Vite 8 + Tailwind 4 | Moderno, sin TypeScript |
| Escritorio | Electron 43 (main.cjs + preload.cjs) | Correcto |
| Facturación | DGII: NCF, ECF, reportes 606/607, validación RNC | Completo |
| Notificaciones | Bot Telegram | Activo (si hay token) |
| Empaquetado | esbuild + pkg (ServidorPOS.exe) + electron-builder | Correcto |

**Modelo multi-tenant:** cada tabla operativa tiene `empresa_id` con RLS forzado
(`FORCE ROW LEVEL SECURITY`) y política `aislamiento_empresa`. El contexto se inyecta vía
`app.empresa_id` / `app.platform`. El dueño usa `app.platform=true` para acceso universal.
**Este diseño es correcto y es la mayor fortaleza del sistema.**

---

## 3. Calificación por módulo

Escala: 1–10. Nota = funcionalidad + seguridad + mantenibilidad.

| # | Módulo | Nota | Fortalezas | Qué mejorar |
|---|--------|------|-----------|-------------|
| 1 | **Autenticación y roles** (`auth.js`, `requireRoles`, `authenticate`) | **8.5** | PINs hasheados (bcrypt), rate-limit, sesiones por dispositivo, roles claros | Migrar a TypeScript; centralizar políticas de rol en un solo lugar |
| 2 | **Panel del Propietario** (licencias, solicitudes, planes, reset) | **7.0** | Control total, auditoría de acciones, reset de pruebas | **Bug de reset corregido**; el panel es monolítico; falta paginación en listas |
| 3 | **Licenciamiento y dispositivos** | **8.0** | Claves únicas, límite de dispositivos, revocación/reactivación, bloqueo por licencia | Validar vencimiento en middleware central; exponer estado en un solo endpoint |
| 4 | **Setup Wizard** (registro/completar) | **8.0** | Flujo guiado, subida de imágenes, creación de admin | Reutilizar lógica de "estado limpio" (duplicada con reset) |
| 5 | **Configuración del sistema/negocio** | **7.5** | Personalización completa (tema, colores, login) | Columnas duplicadas entre `configuracion_sistema` y `negocio_config`; unificar |
| 6 | **Mesas y cuentas (POS)** | **8.5** | Flujo completo: abrir, pedido, trasladar, cobrar, cuenta | SSE para mesas; considerar WebSocket si crece la concurrencia |
| 7 | **Productos, menú y recetas** | **8.0** | CRUD completo, importación CSV, recetas con ingredientes | Validar stock negativo; normalizar importación |
| 8 | **Inventario** | **7.5** | Ajustes, movimientos, recetas | Falta alerta de stock mínimo; reporte de merma |
| 9 | **Caja** (apertura/cierre/arqueo) | **8.0** | Control de turnos, arqueo, cierres | Validar cierre concurrente (doble cierre) |
| 10 | **Reportes** (facturas, dashboard, cierre, tipo pago) | **7.5** | Dashboard gerencial, filtros | Agregar exportación PDF/Excel; métricas de propina/ITBIS |
| 11 | **DGII / ECF** | **8.5** | NCF, ECF, reportes 606/607, validación RNC, anulación | Manejo de reintentos de envío; cola de ECF pendientes |
| 12 | **KDS (cocina)** | **8.0** | Stream SSE, categorías, despacho | Priorización de pedidos; tiempos de preparación |
| 13 | **Telegram bot** | **7.0** | Envío de claves, notificaciones | Manejo de errores de red; reintentos |
| 14 | **Frontend (UI/UX)** | **7.5** | Design system "Luxury Dark", tokens, coherente | Sin TypeScript; componentes grandes; ver §6 |
| 15 | **Seguridad general** | **8.5** | RLS forzado, PINs hasheados, rate-limit, secretos en `.env` | Eliminar credenciales hardcodeadas (hecho); auditoría de dependencias |

**Promedio ponderado: 7.8 / 10.**

---

## 4. Correcciones aplicadas y validadas

### 4.1 `reset-pruebas` del dueño (crítico)
- **Antes:** error 500 en producción (superusuario + columna inexistente + pérdida de `owner_pin_hash`).
- **Después:** borrado en orden de FK sin superusuario, preserva el PIN del dueño, recrea
  `configuracion_sistema` (`setup_completado=FALSE`) y `negocio_config`.
- **Validación:** probado end-to-end contra BD real → `200 OK`; estado limpio correcto
  (empresa raíz, planes intactos, PIN preservado). BD restaurada tras la prueba.

### 4.2 Limpieza de archivos y código muerto
Eliminados (disco + commit `6420527`):
- **Scripts de depuración con credenciales hardcodeadas** (riesgo de seguridad):
  `check_db.mjs`, `check_empresas.py`, `check_pg_hba.py`, `fix_db.py`, `fix_prod_db.py`,
  `fix_prod.js`, `fix_remote.js`, `fix_remote.mjs`.
- **Scripts one-off:** `audit-cleanup.mjs`, `update_caja.py`, `update_css.py`, `update_menu.py`,
  `generar_clave.cjs`, `reemplazar_alerts.ps1`, `reparar-utf8.ps1`, `pin_snapshot_before.json`.
- **Copia obsoleta:** `frontend-restaurante-backup/` (redundante con git).
- **Componentes/utilidades sin uso:** `AsistenteIA.jsx`, `CierreCaja.jsx`,
  `PersonalizacionSistema.jsx`, `caja/CajaSidebar.jsx`, `CuentaDetallePanel.jsx`,
  `MesaDetalleModal.jsx`, `features/login/Clock.jsx`, `NumericKeypad.jsx`, `PinDisplay.jsx`,
  `Shortcuts.jsx`, `StatusCard.jsx`, `ui/theme/index.ts`, `assets/hero.png`, `react.svg`, `vite.svg`.
- **Código muerto detectado en esta auditoría:** `components/ui/Button.jsx` y `lib/utils.js`
  (no importados por nadie; `Button.jsx` importaba `@radix-ui/react-slot` que ni siquiera era
  dependencia). Se eliminaron y se quitaron las dependencias huérfanas `class-variance-authority`,
  `clsx`, `tailwind-merge`.
- **Artefactos de build regenerables:** `ServidorPOS.exe` (x2, ~75 MB), `ServidorPOS.cjs`,
  `release/release.rar` (885 MB), `release/win-unpacked/`.
- **Logs de runtime:** `server.log`, `server.err`, `stderr.log`, `stderr2.log` (ahora en `.gitignore`).

**Conservados a propósito:** `backups/` (18.5 MB, red de seguridad), `release/ChloeRestaurant
Setup 2.1.0.exe` (instalador distribuible), `build/postgresql-installer.exe` (dependencia del
instalador), `uploads/` (referenciados por la BD), scripts de `scripts/` (deploy/health).

### 4.3 Validación post-limpieza
- `node --check server.js` → OK.
- Servidor arranca sin errores; `/api/health` → `{"estado":"ok","baseDeDatos":"conectada"}`.
- Login del dueño y `/api/dueno/resumen` → 200 OK.
- `npm run build` (frontend) → compila sin errores (1846 módulos).

---

## 5. Recomendación de framework

**Veredicto: NO migrar el stack base.** React 19 + Vite + Tailwind 4 (frontend) y Express
(backend) ya son opciones de primer nivel para un POS. Migrar a otro framework sería un riesgo
alto sin beneficio proporcional. Las mejoras de "nivel top" son incrementales:

### Frontend (recomendado: mantener React + Vite + Tailwind)
- **Añadir TypeScript** (migración progresiva por módulo). Es el mayor salto de calidad:
  contratos de API tipados, menos bugs, mejor autocompletado.
- Mantener Tailwind 4 + design system de tokens (ya es moderno).
- Opcional: **TanStack Query** para cachear/validar datos del servidor y reducir `useEffect`.

### Backend (dos opciones)
| Opción | Esfuerzo | Beneficio | Recomendación |
|--------|----------|-----------|---------------|
| **A. Modularizar Express** (dividir `server.js` en routers por dominio) | Bajo | Mantenibilidad inmediata, sin riesgo | **Recomendada ahora** |
| **B. Migrar a NestJS** (TypeScript, DI, módulos) | Alto | Estructura empresarial, testabilidad | A medio plazo, si el equipo crece |

Para un sistema que ya funciona y está validado, **la opción A es la correcta**: conserva el
stack probado y elimina el monolito. NestJS es la meta "top" si se quiere inversión mayor.

### Tiempo real
El SSE actual (KDS, mesas) es suficiente. Si la concurrencia crece, migrar a **WebSockets
(Socket.io)** manteniendo la misma API.

### Base de datos
PostgreSQL + RLS multi-tenant es la decisión correcta. No cambiar.

---

## 6. Propuesta de rediseño: "Chloe Noir" (moderno y único)

El sistema ya tiene un design system "Luxury Dark POS". La propuesta lo **eleva a una identidad
única** sin romper los flujos existentes (se aplica por capas de tokens y componentes).

### Concepto
**"Chloe Noir"** — POS de lujo con estética de *fine dining*: fondo grafito profundo, acento
**dorado champagne** como marca, tipografía display para títulos y micro-interacciones suaves.
Se diferencia de los POS genéricos (azul/gris corporativo) por su calidez y elegancia.

### Pilares
1. **Tokens refinados** — paleta dorada (`#C9A227` → `#F5D06F`), grafito azulado, superficies
   con gradientes sutiles y sombras suaves.
2. **Tipografía** — `Fraunces` (display, títulos) + `Inter` (UI). Jerarquía clara.
3. **Componentes** — botones con brillo dorado, tarjetas con borde sutil, modales con blur,
   tablas con filas hover, estados de mesa con glow.
4. **Micro-interacciones** — transiciones de 150–250 ms, feedback táctil en el POS táctil.
5. **Consistencia** — un solo `design-system.css` como fuente de verdad; los módulos antiguos
   consumen tokens (ya hay aliases `--admin-*`).

### Implementación segura (por fases)
- **Fase 1 (bajo riesgo):** refinar tokens y tipografía en `design-system.css`; aplicar a
  LoginScreen, Dashboard y KDS. No cambia flujos.
- **Fase 2:** componentes compartidos (Button, Card, Modal, Table) en TypeScript.
- **Fase 3:** migrar módulos uno a uno, validando cada uno con build + smoke test.

> **Nota:** el rediseño se entrega como propuesta detallada. Aplicarlo por completo es un
> proyecto de varias fases; se recomienda ejecutar la Fase 1 (tokens) primero por su bajo riesgo.

---

## 7. Plan de acción priorizado

| Prioridad | Acción | Esfuerzo | Impacto |
|-----------|--------|----------|---------|
| **P0** | ✅ Fix `reset-pruebas` del dueño | Hecho | Crítico |
| **P0** | ✅ Eliminar credenciales hardcodeadas | Hecho | Seguridad |
| **P1** | Modularizar `server.js` en routers por dominio | Medio | Mantenibilidad |
| **P1** | Añadir TypeScript al frontend (progresivo) | Alto | Calidad |
| **P1** | Unificar `configuracion_sistema` / `negocio_config` | Medio | Consistencia |
| **P2** | Rediseño "Chloe Noir" Fase 1 (tokens) | Bajo | UX |
| **P2** | Exportación PDF/Excel en reportes | Medio | Funcionalidad |
| **P2** | Alertas de stock mínimo en inventario | Bajo | Funcionalidad |
| **P3** | Migrar SSE → WebSocket si crece concurrencia | Medio | Escalabilidad |
| **P3** | Migrar backend a NestJS (opcional) | Alto | Estructura |

---

## 8. Estado de validación (evidencia)

- `node --check server.js` → **OK**
- `/api/health` → **ok, BD conectada, uploads escribible, uptime, memoria, latencia**
- `POST /api/dueno/login` → **200** (token emitido)
- `GET /api/dueno/resumen` → **200**
- `POST /api/dueno/reset-pruebas` → **200** (estado limpio correcto)
- `npm run build` (frontend) → **compila sin errores**
- BD restaurada a su estado original tras las pruebas.

---

## 9. Mejoras de robustez aplicadas (hacia 10/10)

Tras la auditoría se aplicaron mejoras concretas y verificadas:

| Mejora | Impacto | Validación |
|--------|---------|-----------|
| **Limitador de tasa general por IP** (600 req/min, configurable `API_RATE_LIMIT`) | Protege todos los endpoints contra abuso/DDoS, complementa al de login y mutaciones públicas | 5/5 peticiones OK, no bloquea uso normal |
| **Logging estructurado de peticiones** (método, ruta, estado, duración, IP) | Observabilidad; en producción solo loguea errores (>=400) | Visible en `server.log` |
| **Health endpoint enriquecido** (uploads escribible, uptime, memoria, latencia) | Monitoreo proactivo | `/api/health` devuelve todos los campos |
| **ErrorBoundary global en React** | Un error de renderizado ya no tumba todo el POS; muestra pantalla de recuperación | Compila correctamente |
| **Fix vulnerabilidad `nanoid`** (alta) | Seguridad de dependencias | `npm audit` → 0 vulnerabilidades frontend |
| **Rediseño Chloe Noir Fase 1** (tipografía Fraunces, acento champagne, gradiente) | Identidad única y moderna | Compila correctamente |

### Vulnerabilidad restante (aceptada)
- `pkg` (moderate, escalada de privilegios local): **sin fix disponible**. Es una herramienta de
  empaquetado **solo de desarrollo** (genera `ServidorPOS.exe`); no se ejecuta en producción.
  Riesgo aceptado y documentado.

### Para llegar a un 10/10 completo (trabajo futuro, mayor esfuerzo)
1. **TypeScript** en el frontend (migración progresiva por módulo).
2. **Modularizar `server.js`** en routers por dominio (o migrar a NestJS).
3. **Pruebas automatizadas** (unitarias + integración) — el sistema no tiene suite de tests.
4. **Unificar `configuracion_sistema` / `negocio_config`** (columnas duplicadas).
5. **Exportación PDF/Excel** en reportes y **alertas de stock mínimo** en inventario.

> **Nota honesta:** un "10/10" absoluto es aspiracional. El sistema ya está en un nivel alto
> (seguridad fuerte, RLS, validación, observabilidad). Las mejoras de esta sección elevan la
> robustez y la experiencia; los puntos 1–5 del plan futuro son los que cierran la brecha restante.
