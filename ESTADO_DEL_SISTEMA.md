# ESTADO DEL SISTEMA — ChloeRestaurant POS

> Documento de traspaso para otras IA y desarrolladores. Resume **qué existe, qué se hizo, cómo se verificó y qué falta**.
> Última actualización: 2026-09-21 (auditoría final y plan ejecutado: ITBIS unificado, descuentos, dividir cuenta, respaldos, seguridad, accesibilidad, CI; antes: rediseño, turnos, KDS, temas, limpieza).
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
- **Respaldos**: `services/backupService.ts` (pg_dump `-Fc`, verificación con `pg_restore --list`, depuración a 14 días, mínimo 3), programado a las 03:00 (`BACKUP_*`), `npm run backup` y `npm run backup:verify` (restaura en base temporal). API `GET/POST /api/respaldos` y descarga (solo propietario o, con `BACKUP_TENANT_ACCESS=1`, el Administrador de una instalación de un solo negocio); pestaña *Respaldos* en Datos de la Empresa; Electron los activa por defecto en `userData/respaldos`. **RLS está forzado en las 27 tablas**: el rol que respalda necesita `BYPASSRLS`.
- `GET /api/health` informa `zonaHorariaBd`. `npm run verify:deploy -- <url>` verifica un despliegue (solo lectura).

**Calidad**
- `npm run test:e2e` (49 comprobaciones) + `npm run seed:e2e`; job `e2e` en `.github/workflows/quality.yml` (probado en local sobre una base vacía) y `test:coverage` con piso (42 % líneas). 178 pruebas unitarias.
- **Accesibilidad**: 0 violaciones WCAG 2.1 A/AA (axe-core) en pantallas principales, todo el panel y el cobro, en los 3 temas. Tokens de contraste ajustados (Marfil: `--gold` `#835b15`, textos tenues más oscuros; oscuros: textos tenues más claros); `utils/accesibilidad.js` asocia los `<label>` del panel con sus campos.

**Documentos nuevos**: `docs/OPERACION.md`, `docs/MANUAL_USUARIO.md`, `docs/legal/` (borradores: términos, privacidad, contrato; requieren abogado).

**Pendiente (externo / decisión)**: desplegar y firmar el instalador (certificado de firma de código), copia de respaldos fuera del equipo, zona horaria de la BD de producción, certificación e-CF con la DGII, revisión legal, precios, pruebas con impresora térmica real y restaurantes piloto, monitoreo (UptimeRobot), token en `localStorage` (mitigado por CSP). El job de CI no se ha ejecutado en GitHub.

---

## 13. Referencias rápidas de archivos nuevos o clave de esta sesión

Backend: `src/services/asistenciaService.ts`, `src/routers/asistencia.ts`, `src/services/destinoProducto.ts`, `src/routers/kds.ts`, `src/routers/productos.ts`, `src/routers/menuConfiguracion.ts`, `src/routers/mesas.ts` (`MESAS_LISTA_SQL`), `src/routers/sistema.ts`, `src/middleware/errorHandler.ts`, `src/db/migrations.ts`, `scripts/run-migrations.ts`, `docs/POSTGRES_PRODUCCION.md`.

Frontend: `App.jsx`, `features/login/{LoginScreen.jsx,Screensaver.jsx,login-screen.css}`, `components/{MapaMesas.jsx,MenuPedido.jsx,PantallaKDS.jsx,PinPad.jsx,PanelAdmin.jsx}`, `components/pedido/*`, `components/admin/{GestionAsistencia.jsx,TemaSettings.jsx,GestionProductos.jsx,PanelDueno.jsx}`, `ui/premium/*`, `utils/{tema.js,turnos.js,destinoMenu.js,dinero.js}`, `personalizacion.js`, `themes/loginThemes.js`.
