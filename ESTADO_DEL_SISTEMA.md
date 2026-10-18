# ESTADO DEL SISTEMA — ChloeRestaurant POS

> Documento de traspaso para otras IA y desarrolladores. Resume **qué existe, qué se hizo, cómo se verificó y qué falta**.
> Última actualización: 2026-10-18 (cierre de pendientes y estado de la base local, §12j; límites corregidos, instalador 2.6.0, §12i; licencia verificada en cada acceso, §12h; solicitud de registro desde Electron y teléfono → WhatsApp en el bot, §12g; PIN del propietario incrustado y panel reforzado, §12f; 2026-10-17: cupo de equipos por licencia, §12e; antes, 2026-09-21 v2.3.0: auditoría final y plan ejecutado — ITBIS unificado, descuentos, dividir cuenta, respaldos con copia externa, seguridad, accesibilidad, CI; antes: rediseño, turnos, KDS, temas, limpieza).
> Complementa a `AGENTS.md` (estructura del repo) y `BITACORA_DE_CAMBIOS.md` (histórico anterior). **No contiene credenciales ni PINs.**

---

## 1. Resumen ejecutivo

POS multiempresa para restaurantes dominicanos (React 19 + Vite 8 + Tailwind v4 / Express + TypeScript / PostgreSQL con RLS por `empresa_id`; empaquetado Electron y despliegue web en `chloerestaurant.lat`).

Trabajo de esta sesión:

1. **Rediseño visual completo** (basado en las propuestas de login / mesas / pedido del usuario) con tres temas: Marfil Dorado, Oscuro Zafiro y Oscuro Esmeralda.
2. **Sistema de turnos y asistencia** del personal (marcaje por PinPad + módulo admin + horarios configurables).
3. **Tres temas, tres estilos de login/PinPad y tres protectores de pantalla.**
4. **Correcciones de acceso**: landing vs login según activación del equipo; PIN de propietario; KDS.
5. **Clasificación alimentos → Cocina / bebidas → Bar** unificada (KDS, comandero, admin).
6. **Robustez de producción**: errores de esquema claros, script `npm run migrate`, documentación de despliegue.

**Estado de git**: rama `feat/rediseno-verde-turnos-asistencia` (2 commits sobre `main`, subida a origin). El **PR aún no está creado** (`gh` no estaba autenticado). Hay cambios posteriores **sin commitear** en el árbol de trabajo (ver §10).

**Estado de producción (`chloerestaurant.lat`)**: primero reportaba `migracion: 046_mseller_ecf` (turnos fallaba); en la última comprobación reportaba `049_destino_alimentos_bebidas`. **Falta desplegar el código actual** (migración 050, temas nuevos, clasificación refinada, limpieza). Ver §9.

---

## 2. Arquitectura y convenciones relevantes

- Backend `src/` (TypeScript ESM): routers por dominio, `services/` con lógica pura, `middleware/`, `db/migrations.ts` (migraciones secuenciales en `app_migrations`), RLS por `app.empresa_id`/`app.platform`. `db.query` (con contexto de tenant) vs `queryUnscoped`; rutas públicas usan `runWithRequestContext({ empresaId })`.
- Frontend `frontend-restaurante/src/`: `App.jsx` (ruteo por estado/URL), `components/`, `features/login/`, `ui/premium/*.css` (sistema de diseño), `utils/`, `themes/`.
- **Migraciones en producción**: por diseño (`docs/POSTGRES_PRODUCCION.md`) el servidor operativo no migra al arrancar (`RUN_MIGRATIONS=0`, rol sin DDL) y `scripts/deploy.py` no ejecuta migraciones; sin embargo, en el servidor real se observó que tras un despliegue la migración avanzó sola (046→049), así que su entorno sí migra al iniciar. Si no lo hiciera, usar `npm run migrate` (ver §8).
- Autenticación: sesión por token (`Authorization: Bearer`), cabecera `X-Device-ID`, equipos "activados" (`dispositivos.estado='Activo'`), PIN con scrypt, bloqueo por intentos (`verificarBloqueo/registrarFallo/registrarExito`). Rate limit de login por IP+dispositivo (`LOGIN_RATE_MAX`, 10 por 15 min por defecto).
- Zona horaria de negocio: República Dominicana UTC-4 fijo (sin DST).

---

## 3. Sistema de diseño (tokens de tres temas)

Archivos: `frontend-restaurante/src/ui/premium/`

| Archivo | Contenido |
|---|---|
| `premium-tokens.css` | Tokens de los 3 temas (`--px-*` y variables heredadas `--gold*`, `--bg-*`, `--text-*`, mesas `--mesa-*`, `--brand-ink`, `--kpi-*`). `--gold*` es el **color de marca de cada tema** (nombre conservado por compatibilidad: dorado en Marfil, azul en Zafiro, verde en Esmeralda). |
| `premium-base.css`, `premium-modal.css`, `premium-admin.css`, `premium-gates.css` | Base, modales (`.po-modal`…), reglas del panel admin, pantallas de bloqueo (`.gate`). |
| `premium-skins.css` | Estilos de login/PinPad `medianoche` y `bosque` (`:root[data-login-skin=…]`). |

Reglas: tipografía Inter (`@fontsource-variable/inter`), radios 12/18/24/28, sombras suaves, CSS cargado **al final** en `App.jsx` (el orden importa; usar `:root .clase` para ganar especificidad a `App.css`). Iconos `lucide-react`. Emojis eliminados de etiquetas/botones (se conservan en toasts, que el sistema de notificaciones interpreta).

Pantallas rediseñadas (todas verificadas visualmente en claro/oscuro y móvil):
- **Login** (`features/login/LoginScreen.jsx` + `login-screen.css`): panel de marca con reloj, saludo, turno vigente y botón "Fichar entrada o salida"; panel PIN con teclado; acceso a KDS con PIN; selector claro/oscuro; ajustes de protector de pantalla.
- **Mapa de mesas** (`components/MapaMesas.jsx` + `mapa-mesas.css`): franja de KPIs (ocupación en anillo, por cobrar, tiempo promedio, reservadas), filtros, tarjetas con glifo de mesa/tiempo/consumo/platos en cocina, panel "Requiere atención", "Mis mesas", traslado.
- **Comandero** (`components/MenuPedido.jsx`, `pedido/ProductoGrid.jsx`, `pedido/PedidoTicket.jsx`, `pedido/pedido.css`): rail Comida/Bebidas con categorías y conteos, tarjetas de producto, ticket con "Enviado a cocina y bar" + "Nueva comanda", totales, envío, pre-cuenta, menú "más acciones".
- **Caja**, **KDS** (`PantallaKDS.jsx` + `kd.css`), **Admin** (`PanelAdmin.jsx` + `admin/admin-shell.css`), **Landing**, **Wizard**, **PinPad** (`components/PinPad.jsx`), bloqueo de licencia, panel del dueño, configurar IP, banners, controles de ventana Electron (`html.is-electron`).
- **Encaje al viewport**: login, mesas y barra de caja sin scroll de página desde 1366×650 hasta 360×640 (medido con puppeteer).

---

## 4. Temas, estilos de login y protectores

**Temas del sistema (3)** — `configuracion_sistema.tema_activo` (valores válidos en `src/lib/temas.ts`; el valor histórico `claro-luxury-gold` se normaliza a `marfil-dorado`):
| id | Nombre | Atributos en `<html>` |
|---|---|---|
| `marfil-dorado` | Marfil Dorado (claro, **por defecto**) | `data-theme="claro-luxury-gold"` |
| `negro-brillante` | Oscuro Zafiro (azul zafiro) | `data-theme="negro-brillante"` |
| `esmeralda-oscuro` | Oscuro Esmeralda (verde) | `data-theme="negro-brillante" data-paleta="esmeralda"` |

Se conserva la base claro/oscuro (`claro-luxury-gold` / `negro-brillante`) para que sigan aplicando las reglas CSS por tema. **Ya no existe "Claro Verde".**

`personalizacion.js`: `aplicarTemaId`, `temaActualId`, `alternarTemaLocal` (preferencia local `POS_THEME_LOCAL` que **prevalece** sobre la config del servidor), `fijarTemaSistema`, `aplicarPersonalizacion` (aplica también `data-login-skin`). Hook `utils/tema.js` → `useTemaLocal()`.

**Módulo admin "Tema y Colores"** (`admin/TemaSettings.jsx`): **cada opción se aplica y se guarda al instante** (ya no hay vista previa que se revierta al cambiar de sección — ése era el bug "cae al tema claro"). Verificado: elegir un tema y navegar por otras opciones, recargar o volver a entrar mantiene el tema. El asistente inicial (`WizardSetup.jsx`) ofrece los mismos 3 temas.

**Estilos de login/PinPad (3)** — `configuracion_sistema.login_theme`: `sistema` (sigue el tema activo), `medianoche` (azul noche, siempre oscuro), `bosque` (verde bosque, siempre oscuro). Valores anteriores (`esmeralda`, `marfil`, `olive_garden`…) pasan a `sistema`.

**Diseños de landing (3, preferencia por terminal)**: `obsidiana-gold` (Obsidiana Zafiro), `marfil-editorial` (claro dorado), `noir-executive` (Bosque Esmeralda, clase `ld--emerald`).

**Protectores de pantalla (3)** — `features/login/Screensaver.jsx`: Reloj (se desplaza), Aurora, Marca. Se eligen en el modal del login (preferencia local `chloe_screensaver_tipo`, tiempo `chloe_screensaver_minutos`).

Backend: `src/lib/temas.ts` (constantes y normalizadores), `src/routers/sistema.ts`, `src/routers/setup.ts`. **Migración `050_temas_y_estilos_login`** normaliza los valores guardados y cambia los defaults.

**Sidebar del panel admin**: acordeón (un grupo abierto; se recogen los demás) con textos ampliados (ítems 1rem, títulos de grupo .8rem, ancho 304 px).

---
## 5. Sistema de turnos y asistencia (viene incluido con la licencia del sistema completo)

Sin interruptor propio: cualquier licencia lo incluye; el marcaje exige equipo activado.

- **Marcaje** (login → "Fichar entrada o salida"): `POST /api/asistencia/marcar` (público, equipo activado). Previsualiza (ENTRADA/SALIDA, turno, tardanza) y registra solo al confirmar. Guardas: 60 s entre marcas, autocierre de turno abierto >16 h.
- **Admin** "Turnos y Asistencia" (`admin/GestionAsistencia.jsx` + `asistencia.css`): en turno ahora, KPIs, filtros, horas por empleado, CSV, registros manuales/correcciones con motivo y auditoría, y **editor de horarios**.
- **Horarios configurables** (`configuracion_sistema.turnos_config` JSONB): Turno 1 y Turno 2 (por defecto 10:00–17:00 y 17:00–24:00), tolerancia de tardanza/salida anticipada (0–60 min, def. 10) y entrada anticipada (0–120 min, def. 30). Validación: ambos turnos en el mismo día, T1 empieza antes que T2. El login y el panel muestran los horarios configurados (`utils/turnos.js`; el servidor los publica en `GET /api/configuracion/sistema` como `turnos_config`).
- Endpoints (`src/routers/asistencia.ts`, lógica pura en `src/services/asistenciaService.ts`): `GET /api/asistencia/turnos`, `GET|PUT /api/asistencia/config`, `GET /api/asistencia/en-turno`, `GET /api/asistencia?desde&hasta&usuario_id`, `POST /api/asistencia/manual`, `PUT /api/asistencia/:id`.
- Tabla `turnos_empleados` (RLS, índice único: un turno abierto por usuario).
- Tests: `tests/unit/services/asistenciaService.test.ts` (21).

---

## 6. Acceso y sesión

- **Equipo sin activar → siempre LandingScreen** (incluso `/login`, `/app`, `/admin`, `/caja`, `/kds`); **equipo activado → directo al LoginScreen** (`App.jsx`, `dispositivoActivado`). Verificado con puppeteer.
- **PIN del propietario** (`admin/PanelDueno.jsx`): ya no se envía solo al completar 6 dígitos (fallaba si el PIN real tenía otra longitud, p. ej. venía de `OWNER_PIN`). Se confirma con ➜/Enter, 4–12 dígitos. La huella (`owner_pin_hash`, scrypt) no es reversible; ninguna ruta la borra ni la sobrescribe (solo se crea si no existe).
- **KDS**: el acceso rápido del login ahora **pide PIN** antes de abrir Cocina/Bar (los pedidos exigen sesión; antes mostraba "No hay pedidos" en silencio). La sesión **ya no se cierra por inactividad** en pantallas KDS/roles Cocina y Bar. La pantalla muestra el error real y, ante 401, vuelve al login.

---

## 7. Clasificación alimentos → Cocina / bebidas → Bar

Fuente de verdad: **grupo de la categoría** (`menu_categorias.grupo`: `alimentos` | `bebidas`). Implementación única en `src/services/destinoProducto.ts` (espejo JS en `frontend-restaurante/src/utils/destinoMenu.js`):

- Un producto hereda el destino de su categoría. Sin categoría en el menú se usa `productos.tipo_destino`.
- Nombre inequívoco de bebida (Cervezas, Vinos, Cócteles, Jugos, Refrescos, Licores, Bar…, con plurales/acentos) ⇒ siempre bebida, aunque se haya creado como alimento (`grupoParaCategoria`).
- KDS (`GET /api/kds/:categoria/pedidos`, `Cocina|Bar`): consulta reescrita con `SQL_JOIN_CATEGORIA_PRODUCTO` + `sqlProductoEsBar()`.
- Al guardar productos (`productos.ts` crear/editar/importar CSV) el `tipo_destino` se resuelve con `resolverTipoDestino`. En el formulario admin (`GestionProductos.jsx`) el tipo sigue a la categoría elegida.
- Comandero (`ProductoGrid.jsx`): pestañas Comida/Bebidas por grupo (bug previo: "Cervezas" caía en Comida porque la regla no reconocía el plural).
- **Migración `049_destino_alimentos_bebidas`**: normaliza grupos legacy (`Cocina`/`Bar`), fuerza bebidas por nombre y sincroniza `productos.tipo_destino` con su categoría.
- Verificado extremo a extremo en local (categoría "Cervezas" creada como alimento → queda bebidas; producto pedido como bar en categoría de alimentos → Cocina; KDS Cocina/Bar separados; despacho desde cada KDS). Tests: `tests/unit/services/destinoProducto.test.ts`.

Otros ajustes de datos: cantidades de `cuenta_detalles` (NUMERIC) llegan como texto ("1.00") → KDS y ticket muestran `1×`.

---

## 7b. `GET /api/mesas` enriquecido

Devuelve por mesa (cuenta abierta): `cuenta_id`, `minutos_abierta`, `total_cuenta` (subtotal), `platos_pendientes` (pendientes en cocina). Alimenta las tarjetas y el panel "Requiere atención". No existen en el modelo: "cuenta pedida", "ventas del turno", zonas ni vista de plano (no implementados).

---

## 8. Migraciones y despliegue

Migraciones añadidas/relevantes (`src/db/migrations.ts`):
| id | Contenido | Origen |
|---|---|---|
| `046_mseller_ecf` | Columnas de proveedor e-CF (mseller) en `dgii_config` / `e_cf_comprobantes` | trabajo DGII/e-CF previo, incluido en el commit |
| `047_turnos_empleados` | Tabla `turnos_empleados` + RLS + índices | turnos |
| `048_turnos_config` | `configuracion_sistema.turnos_config JSONB` | horarios de turno |
| `049_destino_alimentos_bebidas` | Reparación de grupos/destinos | clasificación |
| `050_temas_y_estilos_login` | Normaliza `tema_activo` (3 temas) y `login_theme` (3 estilos) + defaults | temas |
| `051_itbis_propina_desactivados` | ITBIS/propina apagados para todos, productos sin ITBIS ni propina, defaults nuevos y `propina_porcentaje` (2–30) | impuestos |
| `052_descuentos_y_division_cuenta` | Descuento con motivo en `cuentas` y `cuenta_origen_id` (dividir cuenta) | dinero |

**Procedimiento en producción** (`docs/POSTGRES_PRODUCCION.md`, sección "Cada despliegue con cambios de base de datos"):
1. Desplegar (`scripts/deploy.py`: compila front + back, sube y reinicia; usa llave SSH `~/.ssh/chloerest_deploy` o `DEPLOY_PASS`).
2. `DB_USER=<rol_ddl> DB_PASSWORD=… DB_HOST=… DB_NAME=… npm run migrate` (script nuevo `scripts/run-migrations.ts`; idempotente).
3. Si el rol de la app no tiene `ALTER DEFAULT PRIVILEGES`: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <rol_app>; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <rol_app>;`
4. Verificar `GET /api/health` → campo `migracion` = `052_descuentos_y_division_cuenta` (o posterior).

Instalaciones **frescas**: `schemaBase.ts` / `schema_base.sql` ahora crean `empresas` antes de `metodos_pago` (antes fallaba con «no existe la relación empresas»). Verificado aplicando las 51 migraciones (001–052, sin 017) sobre una BD vacía.

Si falta una migración, el `errorHandler` responde **503** (`DB_SCHEMA_OUTDATED`, códigos PG 42P01/42703/42501) con mensaje accionable en vez de "Error interno"; el módulo de turnos usa horarios por defecto si falta solo la columna 048. La pantalla de asistencia muestra el motivo real.

---

## 9. Producción: diagnóstico y pendientes

- 1.ª comprobación (SSH de solo lectura con la llave de `deploy.py`): `/api/health` → `migracion: 046_mseller_ecf` (faltaban 047–049; causa del error "No se pudo cargar la asistencia").
- Comprobación posterior (HTTP público): `/api/health` → `migracion: 049_destino_alimentos_bebidas` (el servidor migró al reiniciar). **Falta desplegar el código actual** (migración 050 + temas nuevos + clasificación refinada + limpieza): al arrancar migrará solo si el entorno lo permite (`RUN_MIGRATIONS`); si no, usar `npm run migrate`.
- El acceso SSH a producción fue restringido por el sistema de permisos tras la primera consulta; no se validaron datos reales (categorías, productos, pedidos) en el servidor.
- En el `.env` de producción hay `OWNER_PIN` (puede diferir del PIN de dueño de la base local).
- Pendiente del usuario: desplegar (`python scripts/deploy.py`), comprobar `/api/health` y validar KDS/turnos con datos reales.

---
## 10. Estado de git y trabajo sin commitear

- Rama `feat/rediseno-verde-turnos-asistencia` con 2 commits sobre `main` (`cba70c5` rediseño + turnos + temas; `9a971b6` horarios configurables, acceso por activación, PIN de dueño, DGII/e-CF).
- **Sin commitear** (posterior): los 3 temas actuales + migración 050; errores de esquema (`errorHandler.ts`) y `npm run migrate`; migración 049 y clasificación (`destinoProducto.ts`, con regla de comida para categorías mixtas como "Ceviches y Cócteles"); KDS con PIN e inactividad; CSP `connect-src` con el servidor central; **limpieza** (ver §12b); `schemaBase.ts`/`schema_base.sql`; este archivo.
- **PR no creado**: `gh` (`C:\Program Files\GitHub CLI\gh.exe`) sin sesión. Enlace: `https://github.com/geurif-commits/ChloeRest/compare/main...feat/rediseno-verde-turnos-asistencia?expand=1`.

---
## 11. Verificación realizada

- `npx tsc --noEmit`, `npx eslint src --ext .ts` sin errores; `npx vitest run`: **134 tests** pasando (12 archivos); `vite build` OK; `oxlint` del frontend sin errores (quedan solo avisos `exhaustive-deps`/`only-export-components`).
- Pruebas visuales con puppeteer-core + Chrome headless (1440×900, móvil 390×844, 1366×650, etc.) sobre login, mesas, comandero, caja, KDS, admin y landing, en claro/oscuro; auditoría de scroll horizontal/vertical por resolución.
- Extremo a extremo local: turnos (entrada/salida/guardas), configuración de horarios (válida/ inválida), KDS Cocina/Bar, clasificación, migraciones (`npm run migrate`), errores 503 simulando tabla/columna ausente.
- Datos de prueba locales siempre se limpiaron (productos `ZZTEST*`, categorías `ZZ *`, cuentas de prueba).
- Local: `.env` con `DB_*`; backend de desarrollo `npm run dev` (puerto 3000; para pruebas masivas de login usar `LOGIN_RATE_MAX=5000`). PIN de administrador **local** de desarrollo existe pero no se documenta aquí.

---

## 12. Limitaciones conocidas / pendientes

- Falta desplegar y migrar producción (ver §9) y validar allí KDS, clasificación y turnos con datos reales.
- Falta crear el PR y decidir el commit de los cambios pendientes (§10).
- Las pantallas Caja/Comandero/KDS se verificaron con datos de ejemplo o de prueba, no con operación real; el **interior del Panel del Propietario** no se revisó visualmente (PIN de dueño no disponible).
- La vista previa en "Logotipo y Fondo" (`admin/LogoFondoSettings.jsx`) aún imita el estilo de login antiguo.
- Landing: los temas "Obsidiana Esmeralda / Blanco Editorial / Noir Executive" son los 3 diseños de portada; la variante oscura usa ahora paleta zafiro.
- No implementado: "cuenta pedida", "ventas del turno", zonas de salón, vista de plano.
- Regla de negocio de clasificación: si una categoría de **alimentos** contiene un producto marcado como bebida, va a Cocina (manda la categoría). Nombres de categoría de bebidas inequívocos siempre van a Bar.
- **Electron y web son dos sistemas independientes, y las licencias del Electron no están bajo control del central (auditado 2026-10-17, con simulación de un cliente nuevo: base vacía, mismo servidor y mismo entorno que el instalador).** *Actualización del mismo día: el cupo por licencia ya está implementado y probado en un entorno de prueba (§12e); **no está desplegado ni en un instalador**. La sincronización a la nube se evaluó, se implementó y se **retiró a pedido del usuario** (§12e): sigue sin existir, así que lo que sigue sobre datos, red local y claves del Electron se mantiene tal como se auditó.*
  - *Datos:* cada instalación Electron tiene su servidor y su PostgreSQL locales; el backend no hace ninguna llamada al central (solo el aviso de versión `/api/app/version`; el frontend usa el central solo para planes, métodos de pago y solicitudes de licencia). Las ventas y reportes de un Electron **no** se ven en `chloerestaurant.lat`, y la web de producción no se puede apuntar al equipo del cliente (`configApi.js` fuerza el mismo origen). Sí funciona la **red local**: el servidor escucha en todas las interfaces (`::`, verificado respondiendo por la IP de red y sirviendo la interfaz); cualquier navegador de la misma red abre `http://IP-del-equipo:3000`, se registra como equipo (gasta uno de los 2 cupos) y ve el mismo dashboard y reportes. El instalador no crea regla de Firewall (Windows pregunta al primer arranque; sin probar en un equipo limpio). Acceso desde fuera de la red: no existe (requeriría VPN/túnel o sincronización a la nube).
  - *Licencias:* una clave generada en el panel del central **no activa** un Electron (401 "no registrada": las claves viven en la tabla `licencias` del central y el Electron busca en la suya). Y quien abre `/paneldueno` en el Electron crea allí el PIN de dueño local (`establecer-pin` solo exige ser local) y puede generar sus propias claves (`generar-clave` no necesita `LICENSE_ACTIVATION_KEY`); cada clave crea una empresa nueva en esa base. Hoy la licencia de un Electron es autogestionada por el cliente.
  - *Límite de equipos* (**corregido en el código actual, §12e; sigue vigente en producción hasta desplegar**): el 2 está fijo en el código (`>= 2` y su mensaje en `plataformaService.activarDispositivo`, `limiteMaximo: 2` en `routers/dispositivos.ts`), no en la licencia ni en los planes. Solo se valida al **activar con clave**: un Administrador puede desactivar un equipo, activar otro con la clave y **reactivar** el primero desde el panel (`cambiarEstadoDispositivo` no cuenta) → 3 activos con límite 2 (reproducido). Además `GET /api/dispositivos` entrega la **clave completa** (`clave_activacion`) a cualquier Administrador. Estrategia propuesta para el cupo por licencia y su autoridad en el central: ver la conversación del 2026-10-17 (columna `licencias.max_dispositivos`, una sola función de cupo en toda transición a `Activo`, historial y auditoría, panel del dueño, reemplazo y solicitud de equipo extra, y activación en línea con token firmado para el Electron).

---

## 12b. Limpieza realizada (sin cambios visuales)

- Verificado con comparación de píxeles antes/después (15 módulos admin × 2 temas idénticos; login, mesas, comandero, KDS, caja y landing sin cambios).
- CSS muerto eliminado: `App.css` 4341→1027 líneas, `admin.css` 2251→1108, `tokens.css` e `index.css`; borrados `ui/theme/design-system.css` (1743 líneas) y `ui/theme/overrides-pedido.css` (no importados).
- Código JS muerto: imports/variables sin uso (oxlint --fix), estados de pago mixto sin uso en `PantallaCaja.jsx`, funciones de categorías duplicadas en `GestionProductos.jsx`, `listaTodosModulos`, listeners duplicados en `App.jsx`, selector de colores de acento del asistente.
- Archivos eliminados: `_inspect_tmp.mjs`, `_mark_device.mjs`, `_mark_lic.mjs`, `_reset_pin.mjs`, `REPORT.md` (obsoleto), `package_backend.ps1` (duplicado con ruta rota), `scripts/package_frontend.ps1` (duplicado), `scripts/check_health.js` (CommonJS en proyecto ESM), `scripts/build.ts`; directorios vacíos y `coverage/`.
- **No se tocó**: `menu-import.csv` (menú real del negocio, 197 productos), `frontend-restaurante/release/` (~2 GB de instaladores Electron, ignorado por git), `backups/`, `services/dgiiEcfService.ts` (integración e-CF aún sin conectar al servidor, con tests).

---

## 12c. Auditoría final del 2026-09-21 y decisión sobre ITBIS/propina

Informe completo: **`docs/AUDITORIA_FINAL_2026-09-21.md`**. Resumen para quien continúe:

- **Veredicto:** listo para piloto controlado; bloqueantes antes de distribuir a nivel nacional: B2 sin respaldos automáticos, B3 producción/instalador desactualizados, B4 secretos compartidos en el instalador (B1, ver abajo, quedó dormido).
- **Decisión del dueño (2026-09-21): ITBIS y propina NO se aplican por ahora** y los productos no los llevan incluidos. Se pueden activar/desactivar en *Datos de la Empresa → Fiscal & Cuentas* (`negocio_config.cobrar_itbis` / `cobrar_propina`).
  - **Migración `051_itbis_propina_desactivados`**: pone ambos flags en `FALSE` para todos los negocios, deja todos los productos con `aplica_itbis=FALSE`, `tasa_itbis=0`, `aplica_propina=FALSE`, `tasa_propina=0`, cambia los DEFAULT (negocios y productos nuevos nacen sin ITBIS ni propina) y agrega `negocio_config.propina_porcentaje` (NUMERIC, 10 por defecto, `CHECK` entre 2 y 30).
  - **Propina configurable de 2 % a 30 %**: `src/lib/propina.ts` (rango y validación), `POST /api/negocio/config` rechaza valores fuera de rango con 400 y conserva el actual si no se envía, `calcularTotales` usa el porcentaje del negocio, y en el frontend `utils/dinero.js` (`porcentajePropina`) alimenta MenuPedido, PantallaCaja, CobroModal, PedidoTicket y TicketTermico (etiqueta "Propina (X%)"; la línea desaparece si la propina es 0). Control en `ConfiguracionNegocio.jsx` (campo numérico + deslizador, se acota al salir del campo).
  - Importar productos por CSV sin columnas de impuestos → sin ITBIS ni propina; `aplica_propina` por producto no interviene en el cálculo (la propina es a nivel de negocio, sobre el subtotal).
  - **B1 sigue latente:** con ITBIS apagado, pantalla y servidor coinciden (verificado). Si se reactiva el ITBIS reaparece el desajuste: `calcularTotales` extrae el ITBIS del precio (÷1,18) pero lo suma al subtotal, mientras `frontend-restaurante/src/utils/dinero.js` calcula 18 % adicional (subtotal 1,050 → pantalla 1,344.00, servidor 1,315.16). Como los precios NO incluyen ITBIS, hay que cambiar el servidor a `ITBIS = Σ monto × tasa/100` (y alinear `src/lib/ecf.ts`) **antes** de reactivarlo.
- **Corregido en la auditoría:** `validarPagoMixto` (el monto del 2.º método no puede ser negativo ni mayor al total; +4 pruebas); el equipo activado ya no cae al LandingScreen si el servidor responde 429/5xx o no hay red (`recordarActivacion`/`activacionRecordada` en `utils/dispositivo.js`, usados en `App.jsx`); los scripts `check-database-security.mjs` y `verify-rls-runtime.mjs` usan `DB_NAME` del `.env`; el smoke de integración avisa cuando omite los flujos autenticados.
- **Verificado:** 146 pruebas unitarias, tsc/eslint sin errores, `vite build` OK, `npm audit` con 0 vulnerabilidades, 50/50 migraciones aplicadas (también en una BD vacía), 27/27 tablas con RLS y aislamiento comprobado; e2e de la auditoría (41/42; la que falla es B1) y e2e de propina 25/25 (rangos, defaults, cobro con 2/15/30 %, CHECK en BD, importación CSV) más prueba de interfaz.
- **Material comercial:** carpeta `marketing/` (capturas con datos de demostración, 6 anuncios PNG, fuentes HTML y la presentación de 13 diapositivas). Placeholders pendientes: precios, contacto, ciudad/cantidad del piloto. Sin commitear. Las capturas del comandero muestran líneas de ITBIS/propina porque son demostraciones con esas opciones activas.
- **Producción:** al desplegar, la migración 051 apagará ITBIS y propina y quitará el ITBIS/propina de todos los productos existentes de todos los negocios. No se desplegó nada.
- **Trampa conocida:** el frontend asume la API en el puerto 3000 cuando se sirve desde localhost/127.0.0.1; probar en otro puerto deja la app en el LandingScreen.

---

## 12d. Plan de la auditoría ejecutado (2026-09-21, tarde)

Todo lo que se podía resolver desde el código está hecho y verificado; lo que queda depende de terceros o de una decisión (ver la última tabla). Detalle en `docs/AUDITORIA_FINAL_2026-09-21.md` §8.

**Dinero**
- **ITBIS unificado** (precios SIN ITBIS): `calcularTotales` (servidor, en centavos), `frontend/src/utils/dinero.js` (pantalla), `lib/ecf.ts`, `dgiiEcfService`, router e-CF y reporte 607 usan la misma fórmula (ITBIS por línea con la tasa de cada producto, sumado al subtotal). `GET /api/mesas/:id/cuenta` incluye `tasa_itbis` de cada línea. `POST /api/productos/itbis` (Administrador) aplica/quita ITBIS a todos los productos y hay un botón en *Datos de la Empresa → Fiscal & Cuentas*.
- **Descuentos** (migración `052`): `cuentas.descuento/descuento_tipo/descuento_valor/descuento_motivo`; % o monto, motivo obligatorio, reparte entre líneas y reduce la base del ITBIS y de la propina. `cuentas.subtotal` = subtotal **después** del descuento.
- **Dividir cuenta**: `detalles_cobrar` en el cobro separa las líneas elegidas en una cuenta nueva (`cuenta_origen_id`, nace `Cerrada` porque solo puede haber una `Abierta` por mesa) y deja el resto abierto; la mesa no se libera hasta cobrar el resto.
- **El cobro exige caja abierta** (`CAJA_CERRADA`, últimas 24 h). **Pago mixto** valida el monto.

**Seguridad**
- `/api/sistema/info`, `/api/configuracion/completa` y `/api/negocio/config` no revelan datos del negocio a equipos sin activar (en producción hoy sí, hasta desplegar). Comparación en tiempo constante de secretos (`constantTimeEquals`). Límite de `/api/dispositivo/registrar` 300/10 min por IP (`DEVICE_REGISTER_RATE_MAX`) y `/api/setup` limitado. `package.json` con `UNLICENSED` y `private`.
- **Electron**: el secreto de sesión y (en instalaciones nuevas de PostgreSQL) la contraseña de la base se generan por instalación (`main.cjs`, carpeta `userData`); `predist` ya no copia `APP_SESSION_SECRET` al instalador.

**Operación**
- **Respaldos**: `services/backupService.ts` (pg_dump `-Fc`, verificación con `pg_restore --list`, depuración a 14 días, mínimo 3), programado a las 03:00 (`BACKUP_*`), `npm run backup` y `npm run backup:verify` (restaura en base temporal). API `GET/POST /api/respaldos` y descarga (solo propietario o, con `BACKUP_TENANT_ACCESS=1`, el Administrador de una instalación de un solo negocio); pestaña *Respaldos* en Datos de la Empresa; Electron los activa por defecto en `userData/respaldos`. `BACKUP_COPY_DIR` (opcional) copia cada respaldo verificado a una segunda carpeta (USB, nube sincronizada, red) con la misma retención; si falla queda `RESPALDO_COPIA_FALLIDA` en el log y el respaldo local no se pierde. **RLS está forzado en las 27 tablas**: el rol que respalda necesita `BYPASSRLS`.
- `GET /api/health` informa `zonaHorariaBd`. `npm run verify:deploy -- <url>` verifica un despliegue (solo lectura); `scripts/deploy.py` lo ejecuta al terminar.
- **Versión 2.3.1** (`package.json` raíz y `frontend-restaurante`, más el `version` de `src/app.ts` y `src/routers/sistema.ts`). Instalador compilado **sin firma** en `frontend-restaurante/release/ChloeRestaurant Setup 2.3.1.exe` (≈444 MB, ignorado por git; el `.env` empaquetado no lleva `APP_SESSION_SECRET`). `/api/app/version` informa la versión del `package.json` del servidor: publicar el instalador (`APP_DOWNLOAD_URL`) **antes** de desplegar.
- **Arranque de escritorio (2.3.1, corrige "la app no abre y queda en segundo plano" de la 2.3.0)**: la ventana principal nace oculta y solo se muestra cuando la interfaz se monta. `main.cjs` daba por iniciado el servidor si *cualquier* aplicación respondía HTTP 200 en `127.0.0.1:3000/api/health`; en un equipo con otro servidor en el 3000 (caso real: un proceso pm2) nunca arrancaba el propio y no se veía nada. Ahora: `sondearBackend` exige la firma de ChloeRestaurant en `/api/health` (`estado` + `baseDeDatos`), `elegirPuertoBackend` usa el 3000 o el siguiente libre (3001…3010, con `PORT` explícito al servidor y `urlLocalElectron()` en la interfaz, que toma el puerto del origen), pantalla de arranque inmediata, ventana de error con motivo y *Reintentar* si el servidor no inicia (red de seguridad a los 30 s), instancia única (`requestSingleInstanceLock`) y registro en `%APPDATA%\chloerestaurant\main.log`. Probado con el build `--dir` contra ese mismo escenario, con el servidor imposible de iniciar y abriendo la app dos veces. Con el puerto alterno, las llamadas de Electron al servidor central dependen de que su `CORS_ORIGINS` admita ese origen local. También: `ipKeyGenerator` en `loginLimiter` (quita el error `ERR_ERL_KEY_GEN_IPV6` del arranque y el bypass por IPv6). **Sin probar**: instalación de PostgreSQL en un equipo realmente limpio (el instalador de EDB pide elevación de administrador; `spawn` desde un proceso sin privilegios puede fallar).
- **Versión 2.4.0 — Electron 44.4.5 (antes 43.2.0) y menos recursos en equipos modestos**:
  - **Electron 43.2.0 → 44.4.5** (última estable; 45.x seguía en alpha al momento de actualizar). `electron-builder` ya estaba en la última (26.15.3). `npm audit` en 0 tras `npm audit fix` (2 vulnerabilidades de herramientas de build, no de código enviado al usuario).
  - **Instalador sin PostgreSQL embebido**: pesaba ≈465 MB, de los cuales **376 MB eran el instalador de PostgreSQL**, aunque solo hace falta en una instalación nueva sin PostgreSQL. Ahora `main.cjs` lo descarga bajo demanda desde el sitio oficial de EDB (`POSTGRES_INSTALLER_URL`) solo si no lo encuentra, con el progreso en la pantalla de arranque; si la descarga falla, pantalla de error con el enlace para instalarlo a mano. **El instalador de ChloeRestaurant pasó de ≈465 MB a ≈115 MB** (comprobado: build 2.4.0 real). `predist`/`postdist` pasaron de un one-liner `node -e` a `scripts/predist.cjs`/`postdist.cjs`; `compression` de NSIS a `maximum`.
  - **Equipos con GPU floja o controlador viejo**: `app.on('child-process-gone', ...)` detecta una caída del proceso de GPU, dejar una marca en `userData/modo-seguro-gpu` (arranques siguientes ya sin aceleración por hardware) y se reinicia una vez (`app.relaunch()`); `render-process-gone` en la ventana principal recarga sola una vez si la interfaz se cae por otra causa. `disable-features=CalculateNativeWinOcclusion` (menos CPU en reposo en Windows) y `disk-cache-size` acotado a 75 MB; `spellcheck:false` en las ventanas.
  - **PIN del dueño verificado en esta versión**: probado en la app empaquetada (Electron 44, `release/win-unpacked`) con `puppeteer-core` conectado por `--remote-debugging-port` — entrada del PIN en el teclado de `LoginScreen.jsx` (`.lg-key`) hasta `/paneldueno`, con el negocio de prueba local. No usa un PIN real; para repetir la prueba, `OWNER_PIN=<pin de prueba>` como variable de entorno al lanzar el `.exe` empaquetado se suma (no reemplaza) al PIN ya guardado en la base.
  - **Consumo medido** (app empaquetada en reposo, ventana de PanelDueno abierta): ≈411 MB repartidos en los procesos de Electron/Chromium (normal para Electron: navegador completo + Node) + ≈47 MB del servidor local (`ServidorPOS.exe`). No es una app "liviana" en el sentido de una app nativa pequeña —eso es inherente a empaquetar Chromium—, pero ya no depende de descargar/instalar 376 MB de más y se recupera sola de fallos de GPU en vez de quedar en pantalla negra o sin abrir.
  - Regresión: 183 pruebas unitarias, `tsc`/`eslint`/`oxlint` sin errores, e2e 54/54 sobre una base vacía.
- **Versión 2.4.1 — círculo del login, el dueño cambia su propio PIN, controles de ventana integrados**:
  - **`LoginScreen` (círculo a medias):** los dos círculos decorativos del panel de marca (`.lg-brand::before/::after`) tenían `overflow:hidden` cortándolos justo en la línea que separa los paneles — solo se veía el arco del lado oscuro. `.lg-pin` (el panel del PIN) ahora dibuja la otra mitad exacta de los mismos dos círculos (mismo tamaño y posición, medidos desde la unión de ambos paneles: `left` en vez de `right`), con `border: var(--px-line)` en vez del `rgba` fijo del panel oscuro para que se lea bien en cualquier tema. Verificado con una réplica aislada de la geometría (captura): el círculo cruza limpio de un panel al otro.
  - **El propietario ya puede cambiar su propio PIN** (antes solo existía `OWNER_PIN` por variable de entorno o pedírmelo a mí): `POST /api/dueno/cambiar-pin` (`requireDueno`, pide el PIN actual, bloqueo por intentos igual que el login, `bumpDuenoEpoch` + token nuevo para no cerrar la sesión actual). Botón "Cambiar PIN" en el encabezado de `PanelDueno.jsx`, modal de 3 pasos (actual → nuevo → confirmar) reutilizando el `PinPad` ya usado en el login. Probado extremo a extremo en `scripts/e2e-completo.mjs` (base vacía o con un PIN ya configurado, se restaura al limpiar): crear PIN local, PIN actual incorrecto (401), cambio correcto, el PIN anterior deja de servir, el nuevo funciona de inmediato. e2e sube a 59/59.
  - **Controles de ventana integrados:** `.px-winctl` (minimizar/maximizar/cerrar) era una tarjeta flotante con esquinas redondeadas, sombra y fondo de vidrio a 10px del borde. Ahora es una fila pegada a la esquina superior derecha (0,0), sin fondo ni sombra propios, con el tamaño y el hover de los botones de una ventana de Windows (46×32, cierre en rojo sólido al pasar el mouse) — mismo mecanismo (`window.electronPOS`), solo cambia el estilo. `--px-winctl-w` pasó de 112px a 138px (el espacio reservado en las barras superiores). (El arrastre de la ventana, que esta versión no traía, se agregó después: ver el punto "Después de 2.4.1" más abajo.)
  - Regresión: 183 pruebas unitarias, `tsc`/`eslint`/`oxlint` sin errores, `vite build` sin errores, e2e 59/59 sobre una base vacía.
- **Versión 2.5.0 — PIN de 4/6/8 dígitos con teclado físico, arrastre de ventana, respaldos automáticos configurables y venta rápida** (instalador `ChloeRestaurant Setup 2.5.0.exe`, 115 598 422 bytes, SHA-256 `7402D215A7E2A121822335707D09467CBCC3E6FF8BE7E0A58D9DFD4959AF229B`, **sin firma digital**; sin commitear):
  - **PIN del propietario de 4, 6 u 8 dígitos (hasta 12) con teclado físico y auto-envío.** Causa raíz del "pide 4 dígitos pero mi PIN es de 6": `PanelDueno.jsx` habilitaba el botón ➜ con `longitudPinEfectiva = 4` fijo. Ahora se exige la longitud real, y al completarla el acceso se envía solo (también el paso "PIN actual" y "confirmar" del modal *Cambiar PIN*; el paso "PIN nuevo" queda manual porque ahí el usuario elige la longitud). La longitud viene del endpoint público nuevo `GET /api/dueno/pin-info` (`{ configurado, longitudes[] }`): puede haber **dos** PIN válidos con longitudes distintas (`OWNER_PIN` del entorno + el guardado tras un *Cambiar PIN*), y en ese caso no se auto-envía (Enter o ➜). Así `OWNER_PIN` de una longitud distinta al valor por defecto de la BD (6) ya no deja al dueño fuera. Si no hay PIN configurado, el acceso abre directo en "Configurar PIN" (antes había que teclear 6 dígitos de prueba para descubrirlo).
  - **`PinPad` compartido con teclado físico** (`components/PinPad.jsx`): dígitos, Backspace/Delete y Enter, con `preventDefault`; ignora campos de texto, Ctrl/Alt/Meta y Enter sobre un botón enfocado (accesibilidad); las teclas pulsadas con el mouse no retienen el foco (si no, Enter volvía a pulsar el último dígito); `autoSubmitLength` para el auto-envío. Lo usan `PanelDueno` (acceso y *Cambiar PIN*, con el foco movido al diálogo al abrirlo), `BloqueoLicencia` (ya no tiene manejador propio) y el cambio obligatorio de PIN de `App.jsx`, que antes **no** aceptaba teclado físico. Sin cambios, con su propio teclado: `LoginScreen`, `MapaMesas` y `ActivacionDispositivo`.
  - **Arrastrar la ventana de Electron** (`premium-base.css`, `App.jsx`): las barras superiores (`.ld-nav`, `.adm-top`, `.mp-top`, `.caja-topbar`, `.kd-head`, `.lg-pin__top`) son zona de arrastre con todos sus controles (`button`, `a`, `input`, `label`, `[role=button|tab]`, `[tabindex]`) fuera de ella, más una franja de 8 px arriba del todo (`.px-windrag`) para pantallas sin barra, como el acceso del propietario. Antes de esto la ventana restaurada no se podía mover (0 zonas de arrastre medidas).
  - **Respaldos automáticos configurables desde la pantalla** (*Datos de la Empresa → Respaldos*, `PUT /api/respaldos/ajustes`, mismos permisos que el resto de `/api/respaldos`, con auditoría `CONFIGURAR_RESPALDOS`): activar/desactivar, hora, días a conservar y carpeta de copia externa (en Electron con el selector nativo de carpetas, IPC `elegir-carpeta`). Se guardan en `ajustes.json` dentro de la carpeta de respaldos y **mandan sobre `BACKUP_*`**; se aplican al instante (el temporizador se reprograma sin reiniciar). La carpeta externa se valida de verdad al guardar (ruta completa, distinta de la de respaldos, escritura probada). La pantalla muestra el próximo respaldo y avisa en rojo si el último intento falló. **Mejora de fondo:** si el equipo estaba apagado a la hora programada, el respaldo perdido se recupera 2 min después de encender (antes solo si pasaban más de 24 h, así que un restaurante que apaga de noche quedaba con respaldos día por medio).
  - **Verificado:** 197 pruebas unitarias (14 nuevas de ajustes/recuperación), `tsc`/`eslint src`/`oxlint`/`vite build` sin errores y e2e 74/74 sobre una base vacía (15 comprobaciones nuevas: `pin-info` con PIN de 6, 8 y 4 dígitos, ajustes de respaldo válidos e inválidos, persistencia tras reiniciar, copia a la carpeta elegida, desactivar al instante); en navegador real con backend y BD temporales: acceso del propietario con 8 y 4 dígitos por teclado, PIN incorrecto y confirmación que no coincide (sin bucles ni doble envío: un solo cambio en el registro), clic de mouse + teclado mezclados, "Sistema bloqueado", cambio obligatorio de PIN y el panel de respaldos completo (rechazo de ruta relativa, guardado, respaldo creado y copiado al mismo tamaño); en la **app empaquetada**: arrastre real con el mouse del sistema (la ventana se movió de 35,0 a 163,55), zonas de arrastre y el diálogo nativo de carpeta (se abre y devuelve `null` al cancelar).
  - **No verificado:** el panel de respaldos dentro de la app empaquetada (requiere el PIN de administrador de la BD real, que no tengo), y el cambio de hora/recuperación con el reloj real (cubiertos por pruebas unitarias y e2e, no esperando una hora programada). (El instalador 2.4.1 incluyó la venta rápida tal como venía, antes de rehacerla; el 2.5.0 ya trae la versión final.) **Instalador 2.5.0 verificado ejecutando la app empaquetada** (sin tocar el PIN ni los datos de la BD real): `main.log` y `/api/health` reportan 2.5.0, `GET /api/dueno/pin-info` responde (`configurado: true, longitudes: [6]`, coherente con el PIN actual de 6 dígitos), `POST /api/ventas/rapida` y `PUT /api/respaldos/ajustes` existen y exigen sesión (401), el frontend servido trae la venta rápida, los ajustes de respaldo y el arrastre de ventana y no trae `react-router` ni el NCF falso, las barras son zona de arrastre con sus controles fuera de ella y `elegirCarpeta` existe; sin PostgreSQL embebido (115,6 MB) y sin restos de `ServidorPOS` en `frontend-restaurante/`. No se pudo usar la venta rápida ni los respaldos *dentro* de la app empaquetada (requieren iniciar sesión con el PIN de administrador de la BD real); esas pantallas sí se probaron en navegador real con el mismo frontend y backend.
- **Venta rápida (mostrador / para llevar) — terminada e integrada** (pestaña *Venta Rápida* de la Caja). Llegó a medias y con problemas serios, por lo que se rehízo en vez de heredarla: `useNavigate` sin ningún `Router` (reventaba al abrir la pestaña); "Pagar" no cobraba nada y **fabricaba un NCF falso** (`B0200000001`) con RNC y nombre de negocio inventados; ITBIS/propina ignoraban la configuración; usaba `prompt()`/`confirm()` nativos; `TicketTermico.jsx` quedó con **todas las tildes corrompidas** (mojibake + BOM) y con el encabezado fiscal oculto cuando no hay logo; CSS global que chocaba con el resto. El trabajo original se conserva fuera del repo (parche y archivos en el scratchpad de la sesión). Se revirtió `TicketTermico.jsx` y se quitó `react-router-dom` (+4 paquetes) del `package.json`/lock.
  - **Cómo funciona:** el catálogo es el `ProductoGrid` del comandero (categorías, búsqueda, comida/bebidas) y las opciones del plato (guarnición, término, nota) las pide el nuevo `PersonalizarPlato` (con `useOpcionesPlato`); la venta se arma en `VentaRapida.jsx` y se cobra con el `CobroModal` y el cobro de siempre (sin "Dividir cuenta" ni "Pre-cuenta"). Nuevo `POST /api/ventas/rapida` (`routers/ventas.ts`, solo roles de caja) → `services/ventaRapidaService.ts`: crea la cuenta "Para Llevar" (sin mesa) y la cobra con el mismo `cobrarCuenta` (caja abierta, NCF real, métodos de pago, descuento, inventario) **en un solo paso: si el cobro falla se borra la cuenta recién creada** (nunca quedan cuentas abiertas que la caja no sabría encontrar). Los precios los pone siempre el servidor; el cliente es opcional (nombre **y** teléfono, o ninguno) y `enviar_a_cocina` (por defecto sí) decide si las líneas quedan pendientes en Cocina/Bar o ya entregadas.
  - **Cocina:** el KDS solo mostraba cuentas `Abierta`, así que un pedido cobrado al ordenar nunca habría llegado a cocina. Ahora `GET /api/kds/:categoria/pedidos` incluye también pedidos "Para Llevar" cobrados en las últimas 12 h hasta que se despachan.
  - **Error heredado corregido:** `/api/pedidos/llevar` (que nadie usaba) hacía `ON CONFLICT (telefono)` sobre una columna **sin índice único** → daba 500 cada vez que se indicaba un cliente (también en tu base local). Ahora busca por teléfono y actualiza o inserta; el cliente es opcional y el endpoint comparte validación con la venta rápida (notas, guarnición y término ahora sí se guardan).
  - **Verificado:** 206 pruebas unitarias (9 nuevas), e2e **91/91** (17 comprobaciones nuevas: total con ITBIS/propina, precio decidido por la base, cuenta cerrada "Para Llevar" con cajero y NCF, entrega/cocina, cliente, descuento, 8 entradas inválidas sin dejar cuentas, caja cerrada, rol camarero 403, historial y auditoría, y el flujo abierto de `/api/pedidos/llevar`); en navegador real con backend y BD temporales: venta con plato con término y guarnición, ITBIS/propina, cliente, cobro en efectivo, ticket con datos reales del negocio y tildes intactas, base (cuenta cerrada, cliente ligado, auditoría doble), Cocina y Bar la reciben "Para llevar" con sus opciones, cierre de caja la cuenta (por método y comprobante), la pantalla queda limpia; cancelar el cobro conserva la venta; un fallo del servidor (caja cerrada a mitad del cobro) avisa, no deja ninguna cuenta y permite reintentar; regresión del cobro de mesas (sigue con "Cuenta abierta", "Dividir cuenta", "Descuento" y "Pre-cuenta"); axe WCAG 2.1 A/AA: **0 violaciones** en los 3 temas (15 escaneos: pantalla, opciones, cliente, cobro y pago).
  - **No verificado / pendiente:** usar esta pantalla dentro del Electron empaquetado con una sesión real de caja (el instalador 2.5.0 ya la incluye y arranca bien); el descuento de inventario por receta en una venta rápida (usa la misma función del cobro de mesas, sin receta de prueba); la pantalla en teléfono (se diseñó para caja, escritorio o tableta). **Riesgo previo, sin tocar:** `POST /api/cuentas/:id/cerrar` (y sus alias) resuelve el `:id` como cuenta **o** como mesa (`id = $1 OR mesa_id = $1`); con una cuenta antigua y otra más nueva de una mesa con ese mismo número podría cobrar la equivocada. La venta rápida no pasa por ahí (llama a `cobrarCuenta` con el id exacto), pero el alias de la caja de mesas sí lo usa.

**SEO (2026-09-27)**
- **Bing y DuckDuckGo confirmaron 0 páginas indexadas** de `chloerestaurant.lat` (`site:chloerestaurant.lat` sin resultados). Causa probable encontrada y corregida: `personalizacion.js`/`App.jsx` pisaban el `<title>` de SEO con `"Mi Restaurante - Sistema de Gestión"` (el nombre de negocio por defecto) para **cualquier visitante**, no solo en un equipo activado — `aplicarPersonalizacion` ahora recibe `{ renombrarPestana }` y `App.jsx` solo lo activa con `dispositivoActivado === true`. Verificado localmente (antes/después) que el `<title>` ya no se pisa en la landing pública.
- `og:image`, `twitter:image` y el logo del JSON-LD pasaron de `favicon.svg` a PNG reales (`public/og-image.png` 1200×628, `public/logo.png` 512×512); JSON-LD `Organization` (BMTECHRD) añadido junto al `SoftwareApplication` existente (`areaServed: República Dominicana`); `sitemap.xml` con `<lastmod>`.
- `npm run seo:indexnow` (`scripts/indexnow-submit.mjs`): avisa a Bing/Yandex/Seznam/Naver vía [IndexNow](https://www.indexnow.org/) sin iniciar sesión en nada (clave publicada en `public/01fea755e3f9d5523831d3c07fbaf9c2.txt`). Google no participa en IndexNow: Search Console requiere la cuenta de Google del dueño (`docs/OPERACION.md` §8).
- **Pendiente:** desplegar (el despliegue de este cambio fue denegado por el sistema de permisos de la sesión, igual que otras acciones de producción; no se intentó otra vía), correr `npm run seo:indexnow` tras desplegar, verificar/enviar el sitemap en Search Console y Bing Webmaster Tools (requieren la cuenta del dueño), y conseguir al menos un enlace entrante real (redes, Google Business Profile, un directorio).

**Calidad**
- `npm run test:e2e` (52 comprobaciones, incluida la copia externa de respaldos) + `npm run seed:e2e`; job `e2e` en `.github/workflows/quality.yml` (runner `ubuntu-24.04` con `postgresql-client-16`; reproducido en local sobre una base vacía, lo que destapó y corrigió un error de tipos en `seed-e2e.mjs`) y `test:coverage` con piso (42 % líneas). 181 pruebas unitarias. **CI en GitHub (PR #3): `backend`, `e2e`, `frontend` y `build` en verde.** Su primera ejecución destapó dos fallos previos, ya corregidos: `npm ci` fallaba con Node 20/npm 10 ("Missing: esbuild@0.28.2 from lock file": faltaban las 27 entradas opcionales de esbuild anidado bajo tsx y vitest) y `.github/workflows/release.yml` tenía una expresión inválida (`'nightly-' + github.run_id`) que hacía fallar el archivo en cada push. Para validar cambios de dependencias antes de subirlos: `npx -y -p node@20 -p npm@10 -- npm ci --dry-run`.
- **Accesibilidad**: 0 violaciones WCAG 2.1 A/AA (axe-core) en pantallas principales, todo el panel y el cobro, en los 3 temas. Tokens de contraste ajustados (Marfil: `--gold` `#835b15`, textos tenues más oscuros; oscuros: textos tenues más claros); `utils/accesibilidad.js` asocia los `<label>` del panel con sus campos.

**Documentos nuevos**: `docs/OPERACION.md`, `docs/MANUAL_USUARIO.md`, `docs/legal/` (borradores: términos, privacidad, contrato; requieren abogado).

**Pendiente (externo / decisión)**: desplegar (el acceso SSH a producción y `git push` los bloquea el sistema de permisos de la sesión: los ejecuta el dueño), firmar el instalador (certificado de firma de código; el 2.3.0 ya está compilado sin firma) y probarlo en un equipo limpio, definir `BACKUP_COPY_DIR`/copia externa y el rol `BYPASSRLS` del servidor central, zona horaria de la BD de producción, certificación e-CF con la DGII, revisión legal, precios, pruebas con impresora térmica real y restaurantes piloto, monitoreo (UptimeRobot), token en `localStorage` (mitigado por CSP).

---

## 12e. Cupo de equipos por licencia (2026-10-17) — implementado y probado en entorno de prueba, SIN desplegar

**Pedido:** un cliente puede necesitar más de 2 equipos en una misma licencia. El usuario instala y configura cada cliente él mismo, por eso no se hizo la activación en línea con token firmado (fase 3).

**Qué se hizo** (`src/services/licenciaCupoService.ts`, `plataformaService.ts`, `routers/dispositivos.ts`, `routers/duenoLicencias.ts`, migración `053`):
- `licencias.max_dispositivos` (1–50, por defecto 2). **Una sola función** (`asegurarCupo`, tras `bloquearCupo` con `pg_advisory_xact_lock` por licencia) rige activar con clave y **reactivar** desde el panel (cerrado el rescate desactivar → activar otro → reactivar). El cupo es por licencia; volver a activar un equipo ya activo no gasta lugar.
- El propietario cambia el cupo de una licencia ya usada (`PUT /api/dueno/licencias/:id/cupo`, botón *Equipos* en *Licencias Usadas*; motivo obligatorio, historial en `licencia_cambios` con RLS solo-plataforma + auditoría `LICENCIA_CAMBIO_CUPO`); bajar por debajo del uso exige elegir qué equipos desactivar (409 `CUPO_POR_DEBAJO_DE_USO` si no).
- `GET /api/dispositivos` enmascara `clave_activacion` al Administrador y devuelve el cupo real (`limiteMaximo`); `GestionDispositivos.jsx` ya no tiene el 2 fijo.
- **Defecto previo corregido de paso:** `activarDispositivo` insertaba una fila de `configuracion_sistema` por cada equipo (el `ON CONFLICT DO NOTHING` no tenía índice único), y `listarLicenciasDueno` hacía `LEFT JOIN` a esa tabla, así que una licencia con N equipos salía N veces en el panel del propietario. Corregidos ambos (inserción condicional + subconsulta con `LIMIT 1`); **no se borraron** las filas repetidas que pueda haber en producción.
- **Entorno de prueba** (`scripts/entorno-prueba.mjs`, `scripts/lib/entorno-prueba.mjs`; `npm run entorno:prueba[:estado|:detener]`): un servidor aislado en `:3100` con base `chloerest_prueba_licencias`, rol de base **sin** `BYPASSRLS`, solo `127.0.0.1` (`API_HOST`), integraciones externas vaciadas. Detalle en `docs/OPERACION.md` §3b–3c.

**Sincronización a la nube — retirada.** Se llegó a implementar (envío de ventas y cierres del Electron al central, credencial por licencia, dashboard web "Ventas en la nube", pestaña "Nube" en el local; migraciones `054`/`055`) y se probó, pero el usuario pidió deshacerla y quedarse solo con las licencias y la activación de equipos. Se eliminó todo (código, migraciones —nunca se aplicaron fuera de bases temporales—, interfaz, pruebas y documentación). **El comportamiento de producción sobre datos del Electron no cambia**: sus ventas siguen sin verse en la web (ver el punto de *Datos* en §12).

**Verificación (2026-10-17):** `tsc`, `eslint src` y `oxlint` sin errores; `vite build` OK; `vitest`: **221 tests** (15 nuevos del cupo); `npm run test:licencias`: **51/51** (cupo por defecto, rescate cerrado, ampliar a más de 2 y activar 5 equipos que inician sesión de verdad, el sexto rechazado, reducir eligiendo equipos, historial y auditoría, clave oculta al Administrador, equipo de otra licencia no se cuela, eliminar libera lugar, 6 activaciones simultáneas con 1 espacio → entra 1, y aislamiento por RLS con rol sin privilegios); regresión `scripts/e2e-completo.mjs` (base temporal de CI) y `check-database-security`/`verify-rls-runtime` sobre una base migrada. Revisado en el navegador integrado: modal *Equipos* del propietario (ampliar, reducir eligiendo equipos, historial) y *Terminales POS* del Administrador ("1 / 1 En Uso").

**Pendiente / no verificado:**
- **No está desplegado ni en un instalador.** Para producción: desplegar, migrar `053`, conceder el rol de la app a la tabla nueva y compilar un instalador nuevo si se quiere que los Electron apliquen el cupo (cada Electron decide con su propia base). El instalador `2.6.0` (construido el 2026-10-18, ver §12i) ya incluye el cupo por licencia; el `2.5.0` no.
- Probado en la misma máquina con un servidor local; no contra `https://chloerestaurant.lat` real ni en un equipo limpio. La interfaz se revisó por DOM y medidas (el panel del navegador estaba oculto, sin capturas).
- Las filas `configuracion_sistema` repetidas de producción (si las hay) las elimina la migración `054` (ver §12i).
- Un Electron sigue siendo autogestionado por el cliente (puede crear su PIN de dueño local y generar sus propias claves); el cupo por licencia protege el central y lo que el propietario administra, no una base local ajena.

---

## 12f. PIN del propietario incrustado en el código + panel del propietario reforzado (2026-10-18) — implementado, PIN real YA fijado por el propietario, SIN desplegar

**Pedido:** reforzar el Panel del Propietario y que el PIN de acceso del dueño prevalezca en todo el sistema "como un código incrustado en el código fuente".

**Qué se hizo** (`src/lib/propietario.ts`, `src/services/propietarioService.ts`, `routers/dueno.ts`, `routers/auth.ts`, `seguridadService.ts`, `telegramBotService.ts`, `scripts/generar-pin-propietario.ts`, `PanelDueno.jsx`):
- Se incrusta el **verificador** (no el PIN): `scrypt` N=32768 con sal de 16 B, 10–12 dígitos sin patrones, generado con `npm run propietario:pin` (pide el PIN sin eco; `--verificar`, `--quitar`). **El propietario ya lo ejecutó (2026-10-18): `CREDENCIAL_PROPIETARIO` contiene un verificador de 10 dígitos** (el mínimo; se recomienda 12). El PIN no se vio ni se escribió en ningún archivo. Sin credencial (`null`) todo se comportaría como antes (aviso `PIN_PROPIETARIO_NO_INCRUSTADO` al arrancar).
- Con PIN incrustado **prevalece**: es el único válido en `/api/dueno/login` y en `/api/login/camarero`; `OWNER_PIN` y `owner_pin_hash` de la base se ignoran; `establecer-pin` y `cambiar-pin` → 409 `PIN_FIJO`; `pin-info` devuelve `{ configurado, longitudes:[12], fijo:true }`; el panel muestra «PIN fijado en el sistema».
- **Refuerzos** (siempre): una sola función de verificación para panel y login general (`esPinDelPropietario`, comparación en tiempo constante); bloqueo propio `dueno:ip:` (5 fallos/15 min con PIN incrustado, 3/30 sin él) más espera de 0,4 s por intento fallido; auditoría `DUENO_LOGIN_OK/FALLIDO` con IP y navegador + aviso por Telegram; token del propietario de 12 h → **4 h**; cierre automático del panel a los **15 min** de inactividad (revoca la sesión); `Cache-Control: no-store` en el login.
- El `OWNER_PIN` y el PIN guardado quedan como el modo "configurable" solo mientras no haya PIN incrustado (compatibilidad total con producción actual).

**Pruebas con el PIN real incrustado:** como con una credencial real el modo `OWNER_PIN` ya no existe, las suites automáticas (`test:e2e`, `test:integration`, `test:licencias`, `entorno:prueba`) usan `bundle-pruebas.cjs`, una copia del servidor con el PIN neutralizado (`npm run build:server:pruebas`, `scripts/lib/bundle-pin-prueba.ts`); `test:propietario` usa otra copia con un PIN de prueba. El servidor real (`bundle.cjs`) se comprobó sin conocer el PIN: `pin-info` → `{ configurado, longitudes:[10], fijo:true }`, el `OWNER_PIN` del entorno → 401, `establecer-pin` → 409 `PIN_FIJO`, un PIN de 10 dígitos incorrecto → 401 y el registro anuncia `PIN_PROPIETARIO_INCRUSTADO`. **No se probó que el PIN real abra el panel** (no se conoce a propósito): se comprueba con `npm run propietario:pin -- --verificar` o entrando al panel.

**Verificación (2026-10-18):** `tsc`, `eslint src`, `oxlint` sin errores; `vitest`: **233 tests** (12 nuevos de la credencial y de la reescritura del archivo); `npm run test:propietario`: **30/30** (PIN incrustado entra; el `OWNER_PIN` señuelo, un PIN guardado en la base y PIN de otra longitud no; establecer/cambiar PIN cerrados; mismo criterio en el login general; sesión de 4 h; no-store; espera de 0,4 s; auditoría con IP; el PIN no aparece en ningún registro; 5 fallos → 429 aun con el PIN correcto y bloqueo de 15 min; el bloqueo no afecta al personal; rutas del propietario cerradas a Administradores, sin sesión y a tokens falsificados; el cierre de sesión revoca); `npm run test:licencias` y la regresión `scripts/e2e-completo.mjs` siguen en verde. Revisado en el navegador: teclear 12 dígitos en el teclado físico abre el panel solo y aparece «PIN fijado en el sistema».

**Pendiente / no verificado:**
- **No está desplegado ni en un instalador.** Al desplegar, el PIN guardado/`OWNER_PIN` actuales de ese servidor dejan de servir y solo vale el PIN incrustado (recuperación si se olvida: `npm run propietario:pin` y volver a desplegar). Los servidores e instaladores ya en uso conservan su PIN anterior hasta actualizarse.
- El PIN real tiene 10 dígitos: funciona, pero un verificador de 10 dígitos que viaja en cada instalador resiste menos una búsqueda sin conexión que uno de 12; conviene rotarlo a 12 con el mismo comando.
- El cierre por inactividad se verificó leyendo el código y comprobando que el panel carga sin errores; no se esperaron los 15 minutos reales en el navegador.
- Límites del diseño (ver `docs/OPERACION.md` §3d): el verificador viaja en cada instalador, así que el PIN debe ser largo y no reutilizarse; la máquina del cliente sigue bajo su control.

---

## 12g. «Error de conexión» al solicitar licencia desde Electron + teléfono como enlace de WhatsApp en el bot (2026-10-18) — corregido en el código, SIN desplegar

- **Causa (verificada en producción, solo lectura):** `OPTIONS`/`GET` a `https://chloerestaurant.lat` con `Origin: http://127.0.0.1:3000` respondían sin `access-control-allow-origin`. La v2.2.0 (`ec5efe8`) dejó la lista de CORS de producción solo con el dominio público; la app de escritorio llama al central desde su origen local (`WelcomeScreen.jsx`, `LandingScreen.jsx`), el navegador bloquea la respuesta y el `catch` del formulario muestra «Error de conexión con el servidor». Los planes y métodos de pago fallaban igual, pero en silencio (reintentos y valores por defecto).
- **Arreglo:** `src/lib/corsEscritorio.ts` + `app.ts` (CORS con función por petición): excepción acotada a 4 rutas públicas y a orígenes de este equipo, sin credenciales; el resto de la API no cambia. Reproducido contra el servidor real en modo producción (solo el dominio público en `CORS_ORIGINS`): `OPTIONS`/`POST /api/solicitud-licencia` desde `http://127.0.0.1:3000` → permitido y la solicitud se crea; `/api/sistema/info` y un sitio ajeno → sin permiso.
- **Bot:** `telegramBotService.ts` → `numeroParaWhatsApp` / `telefonoConWhatsApp`: el teléfono sale como `<a href="https://wa.me/1809…">` en las 4 vistas; mensajes sin vista previa de enlaces.
- **Pruebas:** `tests/unit/lib/corsEscritorio.test.ts` (11, con el middleware real y peticiones HTTP reales con la lista de producción) y `tests/unit/services/telegramWhatsApp.test.ts` (6); suite unitaria: **250 tests**.
- **Pendiente:** hay que **desplegar el central** (no hace falta instalador nuevo: el permiso lo da el central). Hasta entonces la app de escritorio sigue fallando. No se probó dentro de la app Electron real ni el aspecto del enlace en el cliente de Telegram.

---

## 12h. La licencia se verifica en CADA acceso + borrado completo cierra también al propietario (2026-10-18) — implementado y probado, SIN desplegar

- **Problema reportado:** «si el sistema fue borrado completamente, ¿por qué hay sesiones sin licencia funcionando? El sistema siempre debe verificar la licencia antes de permitir cualquier acceso». Causas encontradas en el código: (1) `requireAuth` solo validaba la sesión, el usuario y el equipo, **nunca la licencia**; (2) el inicio de sesión para un equipo sin activar admitía al Administrador de la empresa raíz **sin ninguna licencia** (instalación nueva/borrada); (3) un equipo «Activo» seguía valiendo aunque la clave con la que se activó ya no correspondiera a ninguna licencia; (4) los tokens del propietario sobrevivían al «borrado completo» porque el contador de sesiones volvía a 1.
- **Arreglo:** `services/licenciaAccesoService.ts` (una sola regla, caché de 10 s con invalidación al cambiar licencias/equipos) aplicada en `middleware/auth.ts` (cada petición; excepciones: `/api/logout` y `/api/licencia/activar`) y en `routers/auth.ts` (inicio de sesión, incluida la rama del Administrador raíz). Respuestas `403` con `DISPOSITIVO_NO_ACTIVADO|LICENCIA_REQUERIDA|LICENCIA_VENCIDA|LICENCIA_REVOCADA`; `api.js` y `App.jsx` cierran la sesión y muestran la pantalla de activación/licencia. `resetearDatosPruebas` sube `owner_token_epoch`. `requireAdminODueno` ya no esconde los errores de autenticación. `scripts/seed-e2e.mjs` siembra una licencia para el equipo de la prueba. Herramienta `npm run licencias:diagnostico` (solo lectura).
- **Base de datos «no actualizada»:** el error `La base de datos no está actualizada para esta función…` es la migración `053_cupo_dispositivos_por_licencia` pendiente. En la base **local** de desarrollo (`chlogdyh_chloerest`) se aplicó con `npm run migrate` (solo agrega una columna y una tabla). **En producción no se tocó**: ver el orden de despliegue en `docs/OPERACION.md` §3a.
- **Efecto en la base local:** el diagnóstico marcó que su único equipo activo (`screenshot-device-0001`, activado el 2026-09-20 con una clave de 10 caracteres que no corresponde a ninguna licencia) **dejará de tener acceso**: hay que activarlo de nuevo con una clave vigente o eliminarlo. No se modificó.
- **Verificación:** `tsc`, `eslint src`, `oxlint` sin errores; **271 tests unitarios** (21 nuevos del control de licencia); `npm run test:licencias`: **78/78** (sesión abierta + licencia vencida/desactivada/borrada/revocada; Administrador raíz con y sin licencia; sistema borrado y vuelto a activar con licencia nueva o clave maestra; el rol de producción no puede borrar el sistema); regresión `e2e-completo`: **91/91**; `test:propietario`: **30/30**.
- **Pendiente / no verificado:** no está desplegado ni en un instalador (los Electron ya instalados siguen con el comportamiento anterior hasta actualizarse). Correr `licencias:diagnostico` contra **producción** antes de desplegar (no tengo acceso a esa base). Revisado en el navegador contra el entorno de prueba: con la sesión abierta, vencer la licencia muestra «Sistema bloqueado — La licencia de este negocio ha vencido» y borra la sesión; al renovarla se vuelve a entrar; desactivar el equipo con la sesión abierta lleva a la pantalla de inicio/activación con el aviso «Este equipo no está activado». *(Los dos límites que quedaban —flujos en tiempo real abiertos y la regla antigua por antigüedad de `negocio_config` solo en la interfaz— se corrigieron después: ver §12i.)*

---

## 12i. Límites corregidos (2026-10-18) — instalador 2.6.0 construido; producción SIN tocar

Pedido: «corrige todos los límites del sistema». Se entendieron como los límites señalados al cerrar §12h; los que dependen del código se corrigieron:
- **Pantalla de licencia ≠ servidor (corregido).** `verificarLicenciaPublica(deviceId)` (`plataformaService.ts`, `GET /api/licencia/verificar`) ahora responde con la misma regla del servidor (`licenciaAccesoService`) para el equipo que pregunta; se retiró la cuenta antigua de `negocio_config` (`duracion_meses`/`fecha_instalacion`, 7 días por defecto) que no se reiniciaba al renovar con otra clave (`activarDispositivo` nunca tocaba `fecha_instalacion`) y bloqueaba licencias en regla. Devuelve además `codigo`, `venceEn` y `diasRestantes` reales.
- **Flujos en tiempo real sin vigilancia (corregido).** `/api/kds/stream` y `/api/mesas/stream` entraban con un ticket que se saltaba la verificación de licencia y seguían abiertos indefinidamente. El ticket ahora recuerda el equipo y el flujo vuelve a comprobar la licencia cada `SSE_LICENCIA_SEGUNDOS` (30 s): si se perdió, envía `event: licencia` y se cierra (`routers/kds.ts`, `lib/sseTickets.ts`).
- **Filas repetidas de `configuracion_sistema` (corregido).** Migración `054_configuracion_sistema_unica_por_empresa`: elimina las repetidas (conserva la fila 1 y, en el resto, la configurada más recientemente) y crea el índice único `uq_configuracion_sistema_empresa`. **Se aplica con `npm run migrate`; en producción no se ejecutó.** (Se numeró 054 porque las migraciones 054/055 de la sincronización a la nube se retiraron y nunca se aplicaron fuera de bases temporales.)
- **Apps de escritorio instaladas (instalador construido).** Versión **2.6.0** (`package.json`, `frontend-restaurante/package.json`, locks, `src/app.ts`, `src/routers/sistema.ts`). `frontend-restaurante/release/ChloeRestaurant Setup 2.6.0.exe`, 115 613 281 bytes, SHA-256 `061b3e41cbb243b6a3efbecd2912627860f291dc4f20277f3323b997cdf3fb44`, **sin firma de código** (Windows SmartScreen mostrará «editor desconocido»). El servidor empaquetado se comprobó por cadenas: trae el control de licencia, el PIN del propietario incrustado y la migración 054. **No se instaló ni se probó dentro de un Windows limpio, y no se publicó** (ni `APP_DOWNLOAD_URL` ni el feed de actualización).
- **Verificación:** `tsc`, `eslint src`, `oxlint` sin errores; **271 tests unitarios**; `test:licencias` **90/90** (nuevas: pantalla de licencia = servidor, renovación con la cuenta antigua vencida, flujo en tiempo real que se cierra al perder la licencia, unificación de configuración conservando la fila 1); `e2e-completo` **91/91**; `test:propietario` **30/30**.

**No son corregibles desde el código (siguen pendientes):** desplegar y migrar producción (`053` y `054`, ver `docs/OPERACION.md` §3a) y correr antes `npm run licencias:diagnostico` contra esa base; commitear (no pedido); publicar el instalador; firmar el instalador (requiere un certificado de firma de código); rotar el PIN del propietario a 12 dígitos (lo fija el propietario con `npm run propietario:pin`); y que los servidores con varios procesos aplican un cambio de licencia en ≤ `LICENCIA_CACHE_SEGUNDOS` (10 s) y no al instante.

---

## 12j. Cierre de errores restantes y estado de la base local (2026-10-18)

Tras correr `npm run licencias:diagnostico` en la base local (marcó un equipo bloqueado) se revisó todo lo que quedaba:
- **Base local (`chlogdyh_chloerest`):** migraciones al día (`054_configuracion_sistema_unica_por_empresa`; no había filas de configuración repetidas); el único equipo «Activo», `screenshot-device-0001`, era un resto de pruebas de capturas de pantalla (sin nombre, último uso 2026-09-21, activado con una clave antigua que ya no corresponde a ninguna licencia) y además **ocupaba uno de los 2 lugares** de la licencia vigente: se dejó **Inactivo** (no se borró). La zona horaria de la base pasó de `America/La_Paz` a `America/Santo_Domingo` (`ALTER DATABASE … SET timezone`), como exige `docs/OPERACION.md` §4 (mismo desfase UTC−4, sin cambio de comportamiento). El diagnóstico ahora da **0 equipos y 0 sesiones bloqueados**, y confirma que el Administrador de la empresa raíz puede entrar desde un equipo sin activar (la raíz tiene 2 licencias vigentes). Tus equipos reales están «Pendiente»: se activan con la clave maestra desde la pantalla de activación, o entran como Administrador raíz.
- **Servidor real contra esa base:** `bundle.cjs` (con el PIN del propietario incrustado) arrancó y respondió `version 2.6.0`, migración 054, base conectada, `pin-info` → fijo de 10 dígitos, `licencia/verificar` correcto y 401 sin sesión; sin avisos ni errores en el registro de arranque.
- **`scripts/verify-release.mjs` (`npm run test:release`) estaba obsoleto** (pedía el instalador 2.1.0, el instalador de PostgreSQL que ya no va dentro desde la 2.4.0 y un archivo que electron-builder ya no genera, y buscaba una función que se renombró). Se actualizó: instalador de la versión actual, `app.asar`, servidor empaquetado con el control de licencia y la última migración, invariantes de Electron (con el sondeo `sondearBackend`) y un aviso si el instalador saldría sin PIN de propietario incrustado. Resultado: `Release 2.6.0 OK`.
- **Simulación de la integración continua de GitHub:** la prueba de extremo a extremo con la base vacía **sin la clave maestra** (que en CI no existe) pasa **91/91** gracias a la licencia que ahora siembra `scripts/seed-e2e.mjs`.
- **Otras comprobaciones:** `typecheck`, `lint`, `test:coverage` (49,6 % de líneas frente al piso de 42 %), `test:production-config`, `test:db-security` (28 tablas con RLS), `test:integration` (solo los flujos públicos: no hay `BOOTSTRAP_ADMIN_PIN` en el `.env`), `licencias:diagnostico` ampliado con la línea de la empresa raíz.

---

## 12k. Migrar producción desde Windows y desde el servidor (2026-10-18)

- **Qué falló:** se intentó `DB_USER=<rol_ddl> … npm run migrate` en PowerShell: esa sintaxis es de bash (PowerShell no la reconoce) y los `<…>` eran marcadores sin sustituir. Además, el servidor de producción solo tiene el código compilado (`dist/`) y no `tsx`, de modo que `npm run migrate` no sirve allí.
- **Arreglo:** la migración y el diagnóstico de licencias pasaron a `src/migrar.ts` y `src/diagnosticoLicencias.ts`, que `tsc` compila a `dist/migrar.js` y `dist/diagnosticoLicencias.js` y `scripts/deploy.py` ya sube con el resto de `dist/`. Se ejecutan con `node dist/migrar.js` y `node dist/diagnosticoLicencias.js` en el servidor; `npm run migrate` y `npm run licencias:diagnostico` siguen igual en desarrollo (ahora son envoltorios). Pasos en PowerShell y por SSH, con y sin túnel: `docs/OPERACION.md` §3a.
- **Verificación:** `node dist/migrar.js` sobre una base vacía aplicó las 53 migraciones y terminó en `054_configuracion_sistema_unica_por_empresa` (código 0); `npm run migrate` y `npm run licencias:diagnostico` siguen funcionando; `tsc`, `eslint src` sin errores. **No se ejecutó nada contra producción** (no tengo sus credenciales ni acceso a su base).
- **Producción (comprobado hoy con `/api/health`):** versión 2.5.0, migración `052`, reiniciada hace minutos; ya corre código que necesita la `053` y por eso muestra el aviso. Faltan `053` y `054`, ambas aditivas. Lo que falta es ejecutar los pasos de §3a con el usuario de base adecuado.
- **Producción migrada (2026-10-18, ya con la 2.6.0 desplegada):** el túnel SSH con contraseña no hacía falta; la llave `~/.ssh/chloerest_deploy` entra sin contraseña y, con destino `127.0.0.1:5432`, el túnel funciona (con `localhost` el servidor cortaba la conexión). En el servidor, Node no está en el PATH de SSH: `/home/chlogdyh/nodevenv/chloerest/24/bin/node`. Se corrió `node dist/diagnosticoLicencias.js` (0 bloqueados) y `node dist/migrar.js` con el `.env` del servidor (usuario `chlogdyh_chloerest1`, sí tiene permisos DDL): terminó en `054_configuracion_sistema_unica_por_empresa` y `npm run verify:deploy -- https://chloerestaurant.lat` pasó completo. Efecto lateral conocido de `migrar`: si `LICENSE_ACTIVATION_KEY` está en el `.env`, crea la licencia vitalicia de la empresa raíz (1) derivada de la clave maestra (código anterior a esta versión, `src/db/migrations.ts`); por eso el diagnóstico pasó de «Administrador raíz bloqueado» a «permitido» tras migrar.

---

## 12l. Commit y push; el PIN del propietario no se versiona (2026-10-18)

- Todo el trabajo (v2.5.0 desplegada + v2.6.0) estaba sin commitear sobre `39e643b` (v2.4.1). Se subió en `e3605bc` a la rama `feat/rediseno-verde-turnos-asistencia` (no a `main`: un push a `main` dispara `build_installers.yml`).
- **El repositorio de GitHub es público.** Por eso el verificador scrypt del PIN real (`src/lib/propietario.ts`, bloque `CREDENCIAL_PROPIETARIO`) **no está en el commit**: lleva `null`. En el equipo del propietario el archivo conserva el verificador real y está marcado con `git update-index --skip-worktree`, de modo que `git status`/`git add -A` no lo tocan y los instaladores y el `dist` construidos allí siguen llevándolo. Detalle y recuperación en `docs/OPERACION.md` §3d.
- **Instalador 2.6.0:** sin firmar. No hay certificado de firma de código (ni en el almacén de Windows, ni en `CSC_LINK`, ni en la configuración de `electron-builder`); hay que comprar uno (OV/EV) y apuntar `CSC_LINK`/`CSC_KEY_PASSWORD` antes de `npm run dist`. No hay canal de descarga automático ni actualización automática: el propietario instala en cada cliente.

---

## 13. Referencias rápidas de archivos nuevos o clave de esta sesión

Backend: `src/services/asistenciaService.ts`, `src/routers/asistencia.ts`, `src/services/destinoProducto.ts`, `src/routers/kds.ts`, `src/routers/productos.ts`, `src/routers/menuConfiguracion.ts`, `src/routers/mesas.ts` (`MESAS_LISTA_SQL`), `src/routers/sistema.ts`, `src/middleware/errorHandler.ts`, `src/db/migrations.ts`, `scripts/run-migrations.ts`, `docs/POSTGRES_PRODUCCION.md`.

Frontend: `App.jsx`, `features/login/{LoginScreen.jsx,Screensaver.jsx,login-screen.css}`, `components/{MapaMesas.jsx,MenuPedido.jsx,PantallaKDS.jsx,PinPad.jsx,PanelAdmin.jsx}`, `components/pedido/*`, `components/admin/{GestionAsistencia.jsx,TemaSettings.jsx,GestionProductos.jsx,PanelDueno.jsx}`, `ui/premium/*`, `utils/{tema.js,turnos.js,destinoMenu.js,dinero.js}`, `personalizacion.js`, `themes/loginThemes.js`.


Cupo por licencia (2026-10-17): backend `src/services/licenciaCupoService.ts`, `src/routers/duenoLicencias.ts`, `src/services/plataformaService.ts` (`activarDispositivo`, `cambiarEstadoDispositivo`, `listarDispositivos`, `listarLicenciasDueno`), `src/routers/dispositivos.ts`, migración `053` en `src/db/migrations.ts`; frontend `components/admin/{LicenciaCupoModal.jsx,LicenciaCupoModal.css,PanelDueno.jsx,GestionDispositivos.jsx}`; pruebas `tests/unit/services/licenciaCupoService.test.ts`, `scripts/e2e-licencias.mjs`; entorno `scripts/entorno-prueba.mjs`, `scripts/lib/entorno-prueba.mjs`.

PIN del propietario incrustado (2026-10-18): backend `src/lib/propietario.ts`, `src/services/propietarioService.ts`, `src/routers/{dueno,auth}.ts`, `src/services/{seguridadService,telegramBotService}.ts`, `src/server.ts` (aviso de arranque); herramienta `scripts/generar-pin-propietario.ts` + `scripts/lib/propietario-archivo.ts`; frontend `components/admin/PanelDueno.jsx`; pruebas `tests/unit/lib/propietario.test.ts`, `scripts/e2e-propietario.mjs` + `scripts/lib/bundle-pin-prueba.ts`.
