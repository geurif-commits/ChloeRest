# BITÁCORA DE CAMBIOS — ChloeRestaurant POS v2.1.0

Bitácora de la campaña de auditoría, limpieza y puesta a punto ejecutada el 2026-09-01.

---

## FASE 0 —  Limpieza de código muerto y reparación del build

### Build reparado (bloqueador crítico)
- `frontend-restaurante/src/features/login/login-screen.css` tenía **dos** corrupciones que rompían el build de Vite:
  1. Un byte inválido UTF-8 (`0x90`) → corregido re-encodificando en UTF-8 limpio.
  2. Una línea corrupta `} ═══...═══ */` (cierre de `@media (max-height:700px)` con un comentario decorativo pegado, dejando un `*/` huérfano que disparaba `Unexpected token Delim('/')` en LightningCSS) → corregido a `}`.
- Resultado: build **verde**. Se verificó mediante script que **todos** los .css/.js/.jsx del `src` son UTF-8 válido (0 archivos malos).

### Assets muertos eliminados
- `src/assets/hero.png`, `src/assets/vite.svg`, `src/assets/react.svg` (verificados sin referencia en ningún archivo fuente/index.html).

### Hoja de temas de login obsoleta eliminada
- `src/themes/login-themes.css` (28 KB): estilizaba selectores obsoletos `.premium-login[data-login-theme]` (con variables `--tl-*`). El login actual usa `.modern-login[data-login-skin]` desde `login-screen.css`, que está **completo** (los 8 skins de `LOGIN_TEMAS` coinciden con los 8 selectores `data-login-skin`). Era código muerto de un sistema de temas abandonado. Eliminada.

### Código muerto backend eliminado
- `server.js`: constante `ROLES_KDS` (nunca usada).
- `server.js`: función `claveParaDuracion` (nunca llamada).
- `server.js`: import huérfano `applyRequestContext` (no se usaba).
- `telegramBot.js`: función exportada `notificarTexto` (nunca importada/usada). Se conservó `eliminarDispositivo` porque `server.js` la inyecta como dependencia a través de `iniciarTelegramBot`.

### Código muerto frontend eliminado (verificado con grafo de imports/ocurrencias)
- `src/utils/input.js`: `aCentevos`, `deCentevos`.
- `src/configApi.js`: `esServidorLocal` (re-export huérfana; se conservó `esHostLocal`, que sí se usa internamente).
- `src/themes/loginThemes.js`: `esLoginTemaValido`, `resolverTemaLogin`, `estiloTemaLogin`, `estiloFondoLogin` y helpers huérfanas (`hexAHexLimpio`, `rgba`, `aclarar`, `oscurecer`, `TEMAS_POR_ID`). El archivo quedó reducido solo al array `LOGIN_TEMAS`.
- `src/utils/imprimirComanda.js`: función `linea` (definida y nunca llamada).

> Constatación: NO hay archivos .jsx/.js muertos en el frontend (los 49 archivos restantes son todos importados).

## FASE 1 — Seguridad (backend `server.js`)

- **Cerrada brecha de acceso no autenticado KDS/SSE.** En `autenticarSse` y `autorizarKDS` existía un fallback que, ante la ausencia de token Y de device-id válido, otorgaba acceso a `empresaId: 1` sin autenticación (exponía `/api/kds/stream`, `/api/mesas/stream`, `/api/kds/:categoria/pedidos`, `/api/kds/despachar/:id`). Ahora ambos devuelven `401` en ese caso (consistente con `authenticate`).
- Eliminado `console.log('[adminODueno DEBUG]')`.
- Eliminada la **ruta duplicada** `GET /api/negocio/config` (se conservó la versión pública canónica con su comentario; se quitó la variante redundante `SELECT *`).
- **Corregido bug `estiloLogin`**: en el guardado de configuración se usaba la variable `estiloLogin` como parámetro SQL `$9` (columna `estilo_login`) sin estar definida → escribía `NULL` en cada guardado. Ahora se define validando contra `['moderno','clasico']` y conservando el valor actual de BD (o `'moderno'`) cuando no se envía.
- **KiPIN admin**: el fallback hardcodeado `'041120'` ahora usa `config.bootstrapAdminPin` (viene de `BOOTSTRAP_ADMIN_PIN` en `.env`).
- `smoke.js`: removido el PIN real de propietario hardcodeado (`012011`); ahora lee `process.env.OWNER_PIN`. (`smoke.js` y `.env` no están trackeados en git.)

## FASE 2 — Unificación y hardening completados (2026-09-01 continuación)

- **Unificada duplicación `firmarDuenoTok`/`verificarDuenoTok`.** `auth.js` ahora exporta `firmarDuenoTok` + `verificarDuenoTok` (firma HMAC-SHA256 `dueno:${encoded}` con `config.sessionSecret`). `server.js` eliminó definiciones locales (559-578) e importa ambas desde `auth.js`. Firma idéntica → tokens existentes siguen válidos. Duplicación eliminada.
- **Rate-limit aplicado al login de propietario.** `POST /api/dueno/login` ahora ejecuta `verificarRateLimit(clientIp(req))` al inicio y `registrarIntentoFallido` en fallo (ya tenía `registrarIntentoExitoso` en éxito). Usa `config.login` (`maxAttempts`/`windowMinutes`/`lockoutMinutes`). Cierra brute-force sobre PIN de dueño.
- Verificación: `node --check` OK en 7 módulos backend + build backend `esbuild` OK (`bundle.cjs` 1.7 MB) + build frontend verde.

## Verificación final (actualizada)
- `node --check` OK en: server.js, telegramBot.js, auth.js, db.js, config.js, audit.js, migrations.js.
- `npm run build:server` OK: `bundle.cjs` 1.7 MB (3 warnings import.meta esperados por formato cjs).
- Build frontend **verde**: `index-BzRdW5FF.js` (737.68 kB / gzip 134.91), `index-CicghBPp.css` (200.44 kB / gzip 36.23).

## Pendientes (requieren autorización)
- Deploy a Namecheap pendiente de autorización tras pruebas locales.
- Optimizaciones no bloqueantes: `chloe-logo.png` 1.98 MB → <300 KB, migración a Tailwind v4 + shadcn, Vitest/Playwright, TypeScript progresivo, CI/CD.
