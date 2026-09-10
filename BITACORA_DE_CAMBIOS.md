# BITÁCORA DE CAMBIOS — ChloeRestaurant POS v2.2.0

Bitácora de la campaña de auditoría, limpieza y puesta a punto ejecutada el 2026-09-01.

---

## FASE 22 — 2026-09-10 (v2.2.0 · reporte de facturas + temas claro/oscuro)

- **Fix reporte de facturas (frontend).** `HistorialFacturas.jsx` cargaba el historial (`GET /api/reportes/facturas`) sin cabeceras de autenticación, dependiendo 100% del wrapper global de fetch → en algunos flujos fallaba con "Error al cargar el historial de facturas". Ahora envía `Authorization: Bearer <token>` y `X-Device-ID` explícitos (mismo patrón que el generador de reportes). Endpoints verificados en producción: `/api/reportes/facturas`, `/api/reportes/facturas/filtro`, `/api/reportes/hoy`, `/api/reportes/cierre` → 200 con sesión tenant.
- **Fix temas claro/oscuro (causa raíz de "al seleccionar no cambia de color").** En `tokens.css` las paletas `[data-theme="claro-luxury-gold"]` y `[data-theme="negro-brillante"]` tenían especificidad (0,1,0), igual que el bloque `:root` oscuro que aparece después en el archivo → el último (`:root`) ganaba siempre y el tema claro nunca se aplicaba. Ahora:
  - Paletas con selector `:root[data-theme=...]` (especificidad 0,2,0) para ganarle al `:root` por defecto.
  - Los remaps del tema claro (KPIs, glass, bordes, acentos) se aplican tanto a `'claro'` como a `'claro-luxury-gold'`; el bloque oscuro excluye ambos ids (solo lo consume `negro-brillante` o ausencia de tema).
  - El `<style>` inyectado por `personalizacion.js` (acentos del negocio) usa `:root[data-theme=...]` para conservar especificidad frente a las paletas.
  - Resultado: seleccionar "Claro Luxury Gold" o "Negro Brillante" en Ajustes → Tema cambia la aplicación completa de inmediato (variables CSS) y persigue al Guardar.
- **Fix BIGINT en secuencias NCF (backend, desplegado en ronda previa).** `siguienteComprobante` (`src/services/cuentasService.ts`) convierte `secuencia_actual`/`secuencia_final` a `Number()` antes de comparar (pg devuelve BIGINT como string). Validado con 100/100 ventas exitosas en Empresas 3/5/6 (RD$262,002.67, secuencias B02 avanzando correctamente hasta 100.000).
- **Versión 2.2.0** subida en `package.json` de root y `frontend-restaurante` (+ lockfiles). Deploy web y nuevo instalador Electron `ChloeRestaurant Setup 2.2.0.exe`.

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

## FASE 3 — Correcciones 2026-09-03 (reset-pruebas, formularios, Electron, CSS)
- **Corregido `resetearDatosPruebas` (`src/services/plataformaService.ts`).** Causa del 500: orden de borrado violaba FK `negocio_config_empresa_id_fkey` (se borraba `empresas` antes que `negocio_config`) y faltaba `e_cf_comprobantes` (también con `empresa_id`). Ahora: se eliminan FK huérfanas por duplicado, orden correcto (`configuracion_sistema` → `negocio_config` → `empresas` → `dgii_config`), `e_cf_comprobantes` incluido en borrado y secuencias, y se recrean las FK al final. **Validado en local:** `RESET_LOCAL_OK` + `RESET_PRUEBAS_OK` vía `tsx`. En producción NO se ejecutó el reseteo (destructivo); solo se desplegó el fix.
- **Corregido error `migrations.ts` TS1005.** Un edit previo duplicó el encabezado de `fixDatabaseConsistency`; se eliminó el duplicado. `npx tsc --noEmit` → 0 errores; `npx tsc --build --force` → OK.
- **Formulario PIN propietario (`PanelDueno.jsx` + `admin.css`).** El botón "Volver al inicio" quedaba fuera de vista porque `admin.css` imponía `padding` y `margin-top: 0 !important` que anulaban los inline. Ahora: `.owner-pin-screen` con `height/max-height: 100dvh` + `overflow-y: auto`; `.owner-pin-card` en flex-column con `max-height: calc(100dvh - 32px)` y scroll interno; botón con `margin-top: auto` y color dorado visible; se corrigieron selectores con typo (`_display`/`_key` → `-display`/`-key`) que impedían el modo compacto en pantallas bajas.
- **CSS `@import` (`src/index.css`).** Orden corregido: Google Fonts antes de `@import "tailwindcss"`; warning `[vite:css][postcss] @import must precede...` eliminado. Build verde.
- **LandingScreen (`LandingScreen.css`).** `.landing-quad` con `height: 100%` para que las filas `1fr 1fr` no colapsen y las 4 cajas no se superpongan; responsive 1 columna bajo 900px verificado en código.
- **Electron arranque silencioso (`main.cjs` + `preload.cjs` + `App.jsx`).** Ventana con `show: false`; eliminados auto-show en `ready-to-show` y `did-finish-load`; backend con `windowsHide: true`; nuevo IPC `mostrar-ventana` expuesto en preload y llamado desde `App.jsx` al montar (solo Electron). El acceso directo arranca backend oculto y la ventana aparece únicamente cuando el renderer la solicita; `startBackendIfNeeded` no duplica instancias si el puerto ya responde. No afecta al instalador: cambios aditivos, config `electron-builder` intacta, builds verde.
- **Aclaración warning local `duracion_meses` en `empresas`.** Proviene de bundle/código viejo (`node server.js` legacy): el código actual (`src/db/migrations.ts`) NO inserta `duracion_meses` en `empresas` (esa columna es de `negocio_config`). Recompilar (`tsc --build`) y usar `npm start` (`node dist/server.js`) elimina el aviso. Puerto 3000 en uso = instancia previa activa; Telegram inactivo en local = sin token (esperado).
- **Deploy 2026-09-03:** frontend 1847 módulos + backend `tsc` verdes; deploy atómico OK; `GET /` 200, `/api/health` 200 (migración 038), dueño login 200, `GET /api/dueno/licencias` 200 con 1 licencia (fuente del tab "Licencias Usadas").

## FASE 4 — 2026-09-03 (docs, eliminar-licencia, deploy, instalador Electron)
- **Docs revisados:** `docs/` contiene auditorías 09-01/09-02 (veredicto 7.8/10, reset legacy ya validado 200 OK en su momento, suite 27 tests legacy, plan routers/DGII). El árbol actual TS (`src/routers/dueno.ts` + `src/services/plataformaService.ts`) es el que corre en producción (`dist/server.js`).
- **Corregido `eliminarLicencia` (causa del 500 al borrar licencia).** Solo borraba `licencias` + `empresas`, dejando huérfanos (usuarios, dispositivos, negocio_config...) → FK violation. Ahora limpia dependientes por `empresa_id` en orden FK (hijos primero) + solicitudes por `clave_texto`, y solo borra `empresas` si `id !== 1`. **Validado en local** (`DELETE_LICENCIA_OK`, empresa de prueba con usuario/negocio/config/dispositivo eliminados limpio). En producción NO se borró nada (destructivo).
- **Reescrito `resetearDatosPruebas` con `TRUNCATE ... RESTART IDENTITY CASCADE`.** Elimina la frágil danza drop/re-add de constraints (origen de los 500 intermitentes): una sola sentencia, sin orden manual, sin RLS, con secuencias reiniciadas; preserva `app_migrations`, `planes_licencia`, `metodos_pago` y el PIN del dueño. **Validado en local** (`RESET_LOCAL_OK`). No ejecutado en producción (borraría datos reales).
- **Deploy 2026-09-03 (2ª ronda):** `tsc --build --force` OK, frontend verde, deploy atómico OK (health 200, migración 038). Producción: login OK, `GET /api/dueno/licencias` 200 con **2 licencias intactas** (sin pérdida de datos).
- **Instalador Electron local:** `ServidorPOS.exe` regenerado (39.5 MB, `pkg`, con todo el backend actual), `npm run dist` OK → `release/ChloeRestaurant Setup 2.1.0.exe` (462 MB, firmado NSIS). Verificado dentro del `app.asar` empaquetado: handler `mostrar-ventana`, `preload` con `mostrarVentana`, sin auto-show en `ready-to-show`.
- **Modo oculto validado (código + artefacto):** `main.cjs:238` `show:false`; spawn backend con `windowsHide:true` (líneas 66,183,192); `startBackendIfNeeded` verifica salud primero (no duplica instancia al re-ejecutar el acceso directo); la ventana solo aparece cuando el renderer llama `mostrar-ventana` (`App.jsx:375`). El instalador incluye este comportamiento (confirmado en `app.asar`).

## FASE 6 — 2026-09-03 (logo único, 2 temas, KDS bar, login 2 cuadros)
- **Logo fusionado.** `ConfiguracionNegocio.jsx` (Identidad) ya no sube logo: muestra solo-lectura con nota hacia Logotipo y Fondo. `PUT /api/configuracion/sistema` replica `logo_url` a `negocio_config` (misma empresa). Eliminados `archivoLogo`/`fileRef`/`handleArchivo` + 7 imports muertos.
- **Solo 2 sistemas de color.** General: `noche` + `claro` (fuera oceano/lava/esmeralda/amatista). Login skins: `chef_noir` + `olive_garden` (`loginThemes.js`, `LOGIN_THEMES_VALIDOS`, −130 líneas CSS). Sin referencias rotas; `TemaSettings` y selector de skins operan con 2 opciones.
- **KDS Bar corregido (`src/routers/kds.ts`).** El query ignoraba `tipo_destino` y su lista corta dejaba fuera vino/ron/jugo/refresco/mojito/etc. Ahora Bar = `tipo_destino='bar'` O 50+ nombres con acentos O palabra completa (bordes evitan "macarrones"→Bar); Cocina = NOT Bar (cada pedido en exactamente una pantalla). Validado 28/28 casos.
- **Login en 2 cuadros.** Izquierda: solo logo (112→170px, configurable 110/170/230) + nombre (2.9→3.6rem, hasta 4.4rem) centrados; fuera reloj/telemetría (+ polling e imports muertos). Derecha: keypad con solo "Introduce tu PIN". Nuevo campo `login_marca_tamano` (migración 039, validado en PUT, expuesto en GET) con selector Mediano/Grande/Gigante en TemaSettings.
- **Deploy:** `tsc` 0 errores, `vite`+`oxlint` verdes; producción sirve `index-_uLqHu2u.js`; `/api/configuracion/sistema` expone `login_marca_tamano: 'grande'`; login y licencias (2) → 200.

## FASE 7 — 2026-09-03 (login paralelo 2 columnas)
- **Causa de que no quedaban paralelos:** `.modern-login__container` NO tenía definición desktop (solo reglas responsive) → las columnas no formaban grid y no podían alinearse. Se agregó grid base 2 columnas (`1fr 1fr`) con `align-items: center` + `justify-items: center`, `max-width: 1120px`, `margin: auto` y `flex: 1` para centrar entre topbar y footer. Panel izquierdo con `width: 100%` para centrado real del logo+nombre.
- **Deploy:** producción sirve `index-ai18ZBx_.js`; health 200.

## FASE 8 — 2026-09-03 (centrado blindado logo/nombre)
- El logo PNG (512×512) está bien centrado en su canvas; el CSS ya centraba por flex. Se blindó a 4 niveles: `margin: 0 auto` en `.brand-crest`, `.brand-title` y `.brand-slogan` (+ `width: 100%`), `display: block` + `object-position: center` en la imagen. Deploy con hashes nuevos (`index-p6_tP0mF.js`) para forzar CSS fresco.

## FASE 20 — 2026-09-04 (diagnóstico definitivo Electron)
- Estado real hallado: app desinstalada, sin backend corriendo; URL guardada correcta; backend sano al lanzar. El error genérico no identificaba el servidor.
- **Diagnóstico permanente:** los errores de conexión del panel dueño ahora muestran la URL intentada (`No se pudo conectar con el servidor (URL)...`). Instalador reconstruido con esto (9:34 PM).
- **Protocolo de prueba pedido al usuario:** instalar nuevo Setup, abrir panel dueño, reportar mensaje EXACTO (con URL), más estado de `http://127.0.0.1:3000/api/health` en navegador.

## FASE 19 — 2026-09-04 (instalador final verificado + PIN Electron)
- El instalador previo NO traía los fixes de PIN (verificado binario). Reconstruido: `ServidorPOS.exe` + `ChloeRestaurant Setup 2.1.0.exe` frescos con todo.
- **PIN en Electron:** auto-aceptado a 6 dígitos (longitud efectiva con default 6) + auto-borrado en todo fallo (incluidos errores de red); sin auto-aceptado al crear PIN. Verificado en bundle empaquetado (byte-idéntico al build fresco).
- Diagnóstico previo: apiUrl guardada correcta (`127.0.0.1:3000`), backend sano; el fallo real era PIN inexistente + falta de setup inicial (ya resuelto en FASE 17).

## FASE 17 — 2026-09-04 (PIN auto-aceptado + auto-borrado)
- **PanelDueño:** auto-aceptado al completar la longitud efectiva (6 por defecto aunque se desconozca la configurada); antes exigía longitud conocida o no disparaba. Enter/botón usan la misma longitud efectiva.
- **Auto-borrado en todo fallo:** los `catch` de login/crear-PIN no limpiaban el PIN (quedaba lleno y bloqueaba reintento); ahora `setPin('')` también en errores de red. Login principal ya lo hacía (verificado).
- **Sin auto-aceptado al CREAR PIN** (modo setup): la creación exige confirmación explícita, correcto.
- **Deploy:** requirió 311s (reintentar con timeout mayor si se corta); producción sirve `index-DTR7qgqd.js`; health 200.

## FASE 9 — 2026-09-03 (divisor centrado, reloj 24h, tarjetas 1.5×1)
- **Divisor dorado centrado y ancho:** `.brand-rule` de 72→140px, simétrico con glow, `margin: 0 auto` + `flex-shrink: 0` bajo el nombre.
- **Reloj protector 24h sin segundos** (`LoginScreen.jsx`): `hour/minute` + `hour12: false` (antes 12h con segundos titilando); intervalo 1s→10s. Fecha corregida a formato largo capitalizado ("Jueves, 04 de septiembre de 2026") en vez de mes abreviado.
- **Tarjetas de producto 1.5 ancho × 1 alto:** `aspect-ratio: 3/2` unificado en `App.css`, `pedido.css` y `overrides-pedido.css` (donde un `min-height: 190px` anulaba el ratio y las dejaba verticales; ahora `min-height: 0`).
- **Deploy:** `oxlint` 0 errores; producción sirve `index-ZZjZ7gWt.js`; health 200.

## FASE 10 — 2026-09-03 (ratio 1/0.5 + hora 12h DO)
- **Tarjetas a `aspect-ratio: 1/0.5`** en `App.css`, `pedido.css` y `overrides-pedido.css` (compila a `1/.5`, mismo 2:1). Producción sirve `index-D3hkEIAw.js`.
- **Hora estilo Santo Domingo:** protector y login en 12h (`hour12: true`, formato `es-DO`) solo hora:minutos, sin segundos; intervalo 10s; fecha larga capitalizada. Consistente con el resto del sistema.

## FASE 11 — 2026-09-03 (grid 5 por fila + tarjetas compactas)
- **5 recuadros por línea** al abrir categoría: grid base `repeat(8→5)` unificado en `App.css`, `pedido.css` y `overrides-pedido.css`; cascada responsive 5→4→4→3→2 (verificado en el bundle compilado).
- **Tarjetas más pequeñas:** imagen 38→32px (30px en móvil), padding 6→5px; ratio `1/0.5` intacto.
- **Deploy:** producción sirve `index-BbXwtQP_.js`; health 200.

## FASE 18 — 2026-09-04 (instalador fresco con todos los fixes)
- El instalador anterior (2:23 PM) NO traía `establecer-pin`/`pinNoConfigurado`/reset-TRUNCATE (verificado binario). Reconstruido todo: `ServidorPOS.exe` 39.5 MB vía `pkg` + `npm run dist` → `ChloeRestaurant Setup 2.1.0.exe` 462 MB firmado (7:26 PM). Verificado dentro del paquete: `establecer-pin` ✓, `pinNoConfigurado` ✓, `TRUNCATE` ✓, `mostrar-ventana` ✓.

## FASE 17 — 2026-09-04 (owner setup: flag + endpoint faltantes)
- **Causa del bloqueo en instalaciones frescas:** el frontend esperaba `pinNoConfigurado` y `POST /api/dueno/establecer-pin`, inexistentes en backend → imposible crear el PIN inicial (solo quedaba el PIN admin aleatorio desconocido).
- **Implementado en `src/routers/dueno.ts`:** login 401 incluye `pinNoConfigurado:true` solo si no hay PIN en ningún lado; nuevo endpoint `establecer-pin` (PIN 4-12, un solo uso, devuelve token; 400 si ya existe). **Validado end-to-end en BD virgen:** 401+flag → crear 200+token → login 200 → reconfigurar 400.
- **Limpieza:** procesos de prueba eliminados, BDs `zz_*` borradas. **Deploy + validación producción:** health/login/licencias (3) → 200.

## FASE 16 — 2026-09-04 (instalación fresca end-to-end: causa raíz real)
- **Causa raíz del fallo en Electron:** en BD virgen, `runMigrations` fallaba porque `schema_base.sql` es **una sola línea**: todo tras el primer `--` era comentario → 0 tablas, sin error (EmptyQuery). El servidor quedaba degradado y todo daba 500/conexión.
- **Fix:** `src/db/schemaBase.ts` regenerado limpio (11 sentencias) + `runMigrations` lo aplica por sentencias si falta `usuarios`. **Validado en BD virgen real:** health 200 con migración 039, login dueño 200, licencias 200.
- **Deploy + instalador:** producción OK (licencias 3 intactas); `ServidorPOS.exe` (39.5 MB) e instalador (462 MB) reconstruidos con el fix embebido (verificado binario).
- **Lección para el usuario:** en Electron, instalar y esperar 2-4 min el primer arranque (PostgreSQL + migraciones); luego el login de dueño conecta solo.

## FASE 14 — 2026-09-03 (instalador Electron fresco)
- `ServidorPOS.exe` regenerado vía `pkg` (39.5 MB, con auditoría-fix + logo-sync + migración 039).
- `npm run dist` OK → `release/ChloeRestaurant Setup 2.1.0.exe` (462 MB, firmado NSIS, 9:01 PM). `app.asar` empaquetado contiene arranque silencioso (`mostrar-ventana`, sin auto-show) y `ServidorPOS.exe` fresco. (El primer intento excedió 10 min en ensamblaje NSIS; el segundo con caché completó.)

## FASE 15 — 2026-09-04 (Electron sin conexión: BD auto + reenganche)
- **Causa del "error de conexión" en Electron:** en máquinas frescas la BD `sistema_restaurante` no existe y el arranque era lento → la ventana caía al fallback local y se quedaba pegada ahí. Tres blindajes: (1) el backend ahora **crea la BD si falta** (`asegurarBaseDeDatosExiste` en `src/server.ts`, validado CREATE/DROP real contra PostgreSQL); (2) espera de salud 7.5s→20s en `main.cjs`; (3) **reenganche automático**: si la ventana está en `file://` y el backend levanta, recarga sola al servidor cada 5s.
- **Instalador regenerado** (`ServidorPOS.exe` 39.5 MB + `ChloeRestaurant Setup 2.1.0.exe` 462 MB firmado): `app.asar` verificado con `mostrar-ventana`, reenganche y sin auto-show.
- **Deploy + validación producción:** health 200, login 200, licencias 200 (3 intactas).

## FASE 12 — 2026-09-03 (recuadro ceñido al contenido)
- El `aspect-ratio` forzaba altura mínima (espacio vacío en el recuadro). Ahora `aspect-ratio: auto` en los 3 archivos: el recuadro abraza imagen + nombre + precio, como la descripción. 5 por fila intacto.
- **Deploy:** producción sirve `index-CXUcS_tz.js`; health 200.

## FASE 5 — 2026-09-03 (logos, temas, KDS bar, rediseño login)
- **Logo fusionado (fin de la duplicación).** Había dos uploads con dos logos distintos: `LogoFondoSettings.jsx` → `configuracion_sistema.logo_url` y `ConfiguracionNegocio.jsx` (Identidad) → `negocio_config.logo_url`. Ahora: **subida en ambas pantallas pero UN solo logo** — sincronización bidireccional en backend (`PUT /api/configuracion/sistema` replica a `negocio_config`; `POST /api/negocio/config` replica a `configuracion_sistema`, misma empresa). Se configura desde donde prefieras, siempre queda el mismo.
- **Temas reducidos a 2** (`chef_noir` oscuro + `olive_garden` claro): `loginThemes.js` (91→~30 líneas), `LOGIN_THEMES_VALIDOS` en backend, y 130 líneas de CSS muerto eliminadas de `login-screen.css` (skins 2-7). Sin referencias rotas (verificado por búsqueda). `TemaSettings` y selector de skins siguen funcionando con 2 opciones.
- **KDS Bar corregido (`src/routers/kds.ts`).** Causa: el query ignoraba `tipo_destino` y usaba una lista corta de nombres (faltaban vino/ron/jugo/refresco/mojito/etc.), mandando bebidas a Cocina. Ahora: Bar = `tipo_destino='bar'` O nombre en lista ampliada (50+ variantes + acentos) O palabra completa (`% ron %` con bordes evita falsos como "macarrones"); Cocina = NOT Bar (cada pedido aparece en exactamente una pantalla). **Validado con 28/28 casos** (incluye trampa `Macarrones`/`Camarones`).
- **Login rediseñado (2 cuadros).** Izquierda: solo logo GRANDE (52→112px) + nombre GRANDE (2→2.9rem) + slogan; eliminados reloj y 3 tarjetas de telemetría (+ su polling `/api/sistema/info` cada 30s, estados y 9 imports muertos). Derecha: keypad con encabezado corto "Introduce tu PIN" (eliminado "Digita tu clave numérica de X dígitos"). JS del bundle bajó 737→512 KB.
- **Deploy:** `tsc` 0 errores, `vite` verde, `oxlint` 0 errores, deploy atómico OK; producción sirve `index-BFapddTG.js`; `/api/health`, login dueño y licencias (2) → 200.

## FASE 18 — 2026-09-04 (tema claro universal + PIN admin + móvil + labels)
- **Tema claro universal (oscuridad retirada).** Evaluación: `tokens.css` ya traía implementación clara completa → vía segura = forzar `data-theme='claro'` + Quitar opciones oscuras (NO reescribir CSS). `personalizacion.js` fuerza claro; `TemaSettings`/`WizardSetup` solo `claro`; `loginThemes` solo `olive_garden` (−6 skins JS + −130 líneas CSS antes, chef_noir ahora también fuera); backend valida/normaliza (`LOGIN_THEMES_VALIDOS`, PUT fuerza `claro`); migración **040** normaliza datos existentes + defaults. Producción confirma: `tema_activo: claro`, `login_theme: olive_garden`.
- **Recuperar PIN admin (dueño).** Hashes son unidireccionales → se REGENERA: `POST /api/dueno/licencias/:id/reset-pin` crea PIN 6 dígitos, lo guarda hasheado (licencia + admins empresa, exige cambio al ingresar) y lo devuelve UNA vez. UI: botón "🔑 PIN Admin" por licencia + banner con PIN copiable y descarte.
- **Salir visible en móvil:** pills de reloj/en-línea ocultas bajo 640px; botón Volver con tamaño táctil mínimo y sin encogerse.
- **Labels:** "Salón & Mesas"→"Camareros", "Registrar Nuevo Acceso"→"Crear Usuario Nuevo" (+7 imports muertos).
- **Modales con esquinas en móvil:** overlays con padding 16px; `confirm-modal`/`cobro-modal`/`modal-pago` con anchos relativos (`100%`/`calc(100vw-32px)`) y scroll interno en vez de tocar bordes.
- **Fecha/hora admin abreviadas:** reloj sin segundos, fecha `DD/MM`, intervalo 1s→10s.
- **Deploy:** `tsc`+`vite`+`oxlint` verdes; producción sirve bundle nuevo; licencias intactas y creciendo (5).

## FASE 13 — 2026-09-03 (fix 500 Identidad: auditoría + logo en Identidad)
- **Causa raíz del 500 al guardar Identidad (reproducido en local):** `registrarAuditoria` insertaba `usuario_id = 0` del Dueño, violando la FK. Afectaba a TODO guardado del dueño. **Fix sistémico** en `src/services/auditoriaService.ts`: `usuarioId <= 0 → NULL` (único punto de inserción; 50+ llamadores cubiertos; verificado que no hay otros INSERT directos). `POST /api/negocio/config` → 200 en local con servidor fresco.
- **Trampa detectada:** un proceso de prueba viejo superviviente servía código pre-fix en puerto 3001 (mismos síntomas); se eliminó y validó en puerto limpio. `deploy.py` vuelve a compilar backend siempre.
- **Logo en Identidad restaurado** (pedido explícito) + sync inverso en backend. Upload en ambas pantallas, un solo logo.
- **Deploy + validación producción:** health 200 (mig 039), login 200, licencias 200 (3 intactas), config con `login_marca_tamano`/`login_theme` válidos.
