# Operación de ChloeRestaurant

Guía para quien despliega, respalda y vigila el sistema. Complementa `docs/POSTGRES_PRODUCCION.md` y `docs/PRODUCTION_READINESS.md`.

## 1. Variables de entorno

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a PostgreSQL | — |
| `APP_SESSION_SECRET` | Firma de sesiones y autorizaciones (32+ caracteres aleatorios; **distinto en cada instalación**) | — |
| `BOOTSTRAP_ADMIN_PIN` | PIN inicial del administrador (6 dígitos) | aleatorio |
| `CORS_ORIGINS` | Orígenes permitidos (solo HTTPS en producción) | dominio central |
| `RUN_MIGRATIONS` | `1` migra al arrancar (en producción se usa `npm run migrate`) | `0` |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`, `LOGIN_LOCKOUT_MINUTES` | Bloqueo por PIN incorrecto: intentos permitidos / ventana en minutos (los fallos separados por más de la ventana no se acumulan) / duración del bloqueo | 5 / 15 / 5 |
| `OWNER_PIN` | PIN del propietario de la plataforma. **Obligatorio en un servidor remoto**: sin él (y sin PIN guardado en la base) el PIN inicial solo se puede crear desde el propio equipo servidor, nunca desde la red. Una vez con sesión iniciada en *Panel del Propietario* (`/paneldueno`), el botón **Cambiar PIN** del encabezado permite elegir uno propio sin tocar esta variable; `OWNER_PIN`, si sigue definida, se queda como acceso alterno además del PIN guardado. El PIN puede tener de 4 a 12 dígitos (se recomiendan 6 u 8): el teclado de acceso lo envía solo al completar la longitud real (`GET /api/dueno/pin-info`, público, informa solo las longitudes válidas); si `OWNER_PIN` y el PIN guardado tienen longitudes distintas, no se auto-envía y se confirma con Enter o ➜. Además de los botones en pantalla acepta el teclado físico. **Si hay un PIN incrustado en el código (§3d), `OWNER_PIN` se ignora** | — |
| `SSE_LICENCIA_SEGUNDOS` | Cada cuántos segundos un flujo en tiempo real abierto (cocina, mesas) vuelve a comprobar la licencia de su equipo; si la perdió, recibe el evento `licencia` y se cierra (§3e) | 30 |
| `LICENCIA_CACHE_SEGUNDOS` | Segundos que el servidor recuerda el resultado de la verificación de licencia de un equipo (§3e); `0` la desactiva. Un cambio de licencia rige antes porque revocar, reactivar, eliminar, activar y desactivar equipos la limpian al instante | 10 |
| `DEVICE_REGISTER_RATE_MAX` | Aperturas de app por IP cada 10 min (`/api/dispositivo/registrar`) | 300 |
| `PUBLIC_RATE_MAX` | Solicitudes a endpoints públicos por IP cada 10 min | 30 |
| `BACKUP_ENABLED` | `1` activa el respaldo diario automático. Valores por defecto: lo que el Administrador guarda en *Respaldos* (`ajustes.json`) tiene prioridad (§3) | `0` (las instalaciones de escritorio lo activan solas) |
| `BACKUP_DIR` | Carpeta de respaldos | `backups/auto` |
| `BACKUP_COPY_DIR` | Segunda carpeta (USB, carpeta de OneDrive/Dropbox/Google Drive, recurso de red) a la que se copia cada respaldo verificado, con la misma retención | — |
| `BACKUP_HOUR` | Hora local del respaldo diario (0–23) | 3 |
| `BACKUP_RETENTION_DAYS` | Días que se conservan (siempre quedan los 3 más recientes) | 14 |
| `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD` | Rol que respalda (superusuario o con `BYPASSRLS`) | el de la app |
| `PG_BIN_DIR` | Carpeta de `pg_dump`/`pg_restore` si no están en el PATH | autodetecta |
| `BACKUP_TENANT_ACCESS` | `1`: el Administrador ve, crea y descarga respaldos (solo instalaciones de **un** negocio) | `0` |
| `API_HOST` | Si se define (p. ej. `127.0.0.1`), el servidor solo escucha en esa dirección (lo usa el entorno de prueba). Sin definir escucha en todas las interfaces, necesario para que cajas y tablets del local entren por la red | — |

## 2. Despliegue (servidor central)

1. Compilar y subir: `python scripts/deploy.py` (compila el backend y el frontend, sube y reinicia).
2. Migrar la base con un rol con permisos DDL (el servidor operativo no migra al arrancar). Los comandos exactos, para el servidor y para PowerShell, están en §3a; y conceder al rol de la aplicación acceso a lo nuevo (ver `docs/POSTGRES_PRODUCCION.md`).
3. Verificar (solo lectura, sin credenciales):
   ```bash
   npm run verify:deploy -- https://chloerestaurant.lat
   ```
   Comprueba que responde, que la migración aplicada es la última del código, la zona horaria de la base de datos y las cabeceras de seguridad.
4. Antes de dar por bueno el despliegue: iniciar sesión, abrir caja y cobrar una cuenta de prueba.

**Migración 051**: apaga ITBIS y propina y quita el ITBIS/propina de **todos** los productos de **todos** los negocios de la base. **052** agrega descuentos y cuentas divididas.

## 2b. Solicitud de licencia desde la app de escritorio y avisos por Telegram

**Síntoma que se corrigió:** en la app Electron, enviar la solicitud de registro mostraba «Error de conexión con el servidor». Causa: la app consulta al central (`https://chloerestaurant.lat`) por `fetch` los planes, los métodos de pago y la solicitud de licencia, y el navegador de Electron exige que el central responda con `Access-Control-Allow-Origin` para su origen (`http://127.0.0.1:<puerto>`, o `null` si la pantalla se carga desde archivo). Desde la v2.2.0 la lista de orígenes de producción solo trae el dominio público, así que el central no respondía con ese permiso y el navegador bloqueaba la respuesta (también fallaban, en silencio, los planes y los métodos de pago).

**Qué cambió (`src/lib/corsEscritorio.ts`):** solo las rutas públicas `GET /api/planes`, `GET /api/metodos-pago`, `POST /api/solicitud-licencia` y `POST /api/solicitud-licencia/:id/confirmar-pago`, y solo para orígenes de este mismo equipo (`127.0.0.1`, `localhost`, `[::1]`, cualquier puerto, y `null`), responden con el origen permitido, **sin credenciales**, métodos GET/POST y cabecera `Content-Type`. Todo el resto de la API conserva la lista estricta de `CORS_ORIGINS`; un sitio ajeno no recibe permiso en ninguna ruta.

**Para que rija hay que desplegar el servidor central (`python scripts/deploy.py`).** No hace falta instalador nuevo: las apps de escritorio ya instaladas lo notan de inmediato, porque el permiso lo da el central. Comprobación desde cualquier terminal (debe aparecer `access-control-allow-origin: http://127.0.0.1:3000`):

```bash
curl -i -X OPTIONS https://chloerestaurant.lat/api/solicitud-licencia -H "Origin: http://127.0.0.1:3000" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
```

**Aviso por Telegram:** en las cuatro vistas del bot donde sale el teléfono del cliente (solicitud nueva, clave generada, lista de pendientes y detalle `/solicitud N`) el número es un **enlace que abre un chat nuevo de WhatsApp** (`https://wa.me/<número>`) con el texto tal cual lo escribió el cliente. Se entiende `809-555-1234`, `(829) 555 1234`, `1-809-555-1234`, `+1 849 555 1234` y números de otros países con `+` o `00`; uno de 10 dígitos se toma como +1 (RD/EE. UU.). Si no se puede deducir con seguridad (7 dígitos sin código de área, dos números en el mismo campo, texto) se muestra solo el texto, sin enlace. Los mensajes del bot ya no muestran la tarjeta de vista previa del enlace.

## 3. Respaldos

- **Instalación de escritorio (un negocio):** el respaldo diario viene activado; los archivos quedan en la carpeta de datos del usuario (`respaldos`). El Administrador los ve y descarga en *Datos de la Empresa → Respaldos*, y ahí mismo **configura el respaldo automático sin tocar variables de entorno**: activarlo o desactivarlo, la hora, los días que se conservan y la **carpeta de copia externa** (botón *Elegir carpeta…*: una memoria USB o una carpeta sincronizada de la nube, por ejemplo la de OneDrive). Los cambios se aplican al instante y quedan guardados en `ajustes.json` dentro de la carpeta de respaldos; **lo guardado ahí manda sobre las variables `BACKUP_*`** (para volver a lo que dicten las variables, borrar ese archivo). Al guardar, el sistema prueba de verdad que puede escribir en la carpeta externa y rechaza rutas relativas o la misma carpeta de respaldos. Cada respaldo verificado se copia a la carpeta externa solo (si el destino no está disponible, queda el aviso `RESPALDO_COPIA_FALLIDA` en el registro y el respaldo local no se pierde). La pantalla muestra el próximo respaldo programado y avisa en rojo si el último intento falló. **Equipos que se apagan de noche:** si el equipo estaba apagado a la hora programada, el respaldo perdido se hace 2 minutos después de encender (antes solo ocurría si habían pasado más de 24 h). Si el equipo falla, los respaldos que estén únicamente en él también se pierden: usar la copia externa.
- **Servidor multiempresa:** definir `BACKUP_ENABLED=1`, `BACKUP_DIR` en un disco distinto al de la base, `BACKUP_DB_USER/PASSWORD` con un rol con `BYPASSRLS` (las tablas de negocio tienen RLS **forzado**: un rol sin ese permiso hace fallar `pg_dump` en voz alta) y `BACKUP_COPY_DIR` apuntando a un disco o montaje de otro equipo/servicio para tener la copia fuera del servidor. En hosting compartido sin acceso a `pg_dump`, usar los respaldos del proveedor y probar su restauración.
- **A mano:** `npm run backup`.
- **Prueba de restauración (hacerla cada mes y tras cambiar de servidor):** `npm run backup:verify` restaura el último respaldo en una base temporal, compara tablas, RLS y migraciones con la base actual y la elimina.
- **Restaurar de verdad:** crear una base vacía y `pg_restore -h <host> -U <rol> -d <base_nueva> --no-owner --no-privileges <archivo.dump>`; después apuntar `DB_NAME` a ella.

## 3a. Orden para desplegar estos cambios (migrar ANTES de reiniciar)

Si al usar el sistema aparece **«La base de datos no está actualizada para esta función. Ejecuta las migraciones del despliegue (RUN_MIGRATIONS=1 con el rol DDL) y reinicia»**, es que el código nuevo corre sobre una base a la que le faltan las migraciones (`053_cupo_dispositivos_por_licencia` y las que sigan). En producción el servidor no migra al arrancar, así que el orden es:

Producción (comprobado el 2026-10-18 con `/api/health`) corre la versión 2.5.0 y sigue en la migración `052`: ya ejecuta código que necesita la `053` (cupo de equipos por licencia) —por eso aparece el aviso— y con la 2.6.0 se suma la `054` (una configuración por empresa). Ese despliegue 2.5.0 no incluye los comandos `node dist/migrar.js`: o se despliega la 2.6.0 primero (paso 2) o se usa el túnel de la alternativa de abajo. Ambas **solo agregan** (una columna con valor por omisión, una tabla, un índice; la 054 borra filas de configuración repetidas), así que el código viejo sigue funcionando con ellas aplicadas.

**Lo que NO se puede hacer:** copiar y pegar `DB_USER=<rol_ddl> DB_PASSWORD=<…> … npm run migrate`. Esa forma (`VARIABLE=valor comando`) es de bash: **PowerShell la rechaza** («El término 'DB_USER=…' no se reconoce»), y los `<…>` son marcadores que hay que sustituir por los valores reales.

**Qué usuario de base usar.** Hace falta un rol que pueda crear tablas y columnas (en cPanel, el usuario dueño de la base). Si el `.env` del servidor ya usa ese usuario, no hay que pasar nada; si la aplicación corre con un rol restringido (`chloerest_app`), se pasa el rol con permisos solo para esa ejecución.

**Pasos:**

1. **Respaldo** de la base (`npm run backup`, o el del proveedor del hosting).
2. **Desplegar** el código: `python scripts/deploy.py` (compila, sube `dist/` —incluye los comandos de este apartado— y reinicia). Entre el reinicio y el paso 4 el código nuevo ve la base vieja: lo que use las columnas nuevas (activar equipos, lista de licencias del propietario) mostrará «La base de datos no está actualizada». Hazlo seguido o fuera de horas de servicio.
3. **Diagnóstico de licencias** (solo lectura, §3e) y **migración**, en el servidor por SSH (usa el `.env` de allí para el servidor y la base):
   ```bash
   ssh -i ~/.ssh/chloerest_deploy -p 21098 chlogdyh@104.207.79.62   # con la llave de despliegue: no se usa contraseña
   source /home/chlogdyh/nodevenv/chloerest/24/bin/activate        # cPanel: sin esto "node: command not found"
   cd /home/chlogdyh/chloerest
   node dist/diagnosticoLicencias.js                      # quién quedaría sin acceso; corrige lo que marque
   node dist/migrar.js                                    # si el .env ya usa el usuario dueño de la base
   DB_USER='<rol_ddl>' DB_PASSWORD='<contraseña>' node dist/migrar.js   # si hay que usar otro rol (sustituye los <…>)
   ```
4. **Conceder al rol de la aplicación** acceso a las tablas nuevas (`npm run provision:production-role` desde un equipo con acceso a la base, o los dos `GRANT` de `src/migrar.ts`), y **reiniciar**: `touch /home/chlogdyh/chloerest/tmp/restart.txt`.
5. **Verificar:** `npm run verify:deploy -- https://chloerestaurant.lat` (la migración mostrada debe ser `054_configuracion_sistema_unica_por_empresa`) e iniciar sesión.

**Alternativa sin ventana de error** (si el hosting permite reenviar puertos por SSH): migrar ANTES de desplegar, desde tu equipo, por un túnel. En PowerShell, en una ventana déjalo abierto:

```powershell
ssh -i $HOME\.ssh\chloerest_deploy -p 21098 -N -L 5433:127.0.0.1:5432 chlogdyh@104.207.79.62
```

(Con la llave de despliegue no se pide contraseña. El destino debe ser `127.0.0.1`: con `localhost` el túnel abre pero el servidor corta cada conexión. Comprobado el 2026-10-18.)

y en otra, con los valores reales (en PowerShell las variables se definen con `$env:`):

```powershell
$env:DB_HOST = '127.0.0.1'; $env:DB_PORT = '5433'; $env:DB_NAME = '<base>'
$env:DB_USER = '<rol_ddl>'; $env:DB_PASSWORD = '<contraseña>'
npm run licencias:diagnostico
npm run migrate
Remove-Item Env:DB_PASSWORD   # no dejar la contraseña en la sesión
```

Después, `python scripts/deploy.py` y los pasos 4 y 5.

En una instalación de escritorio o en desarrollo basta `npm run migrate` (o arrancar con `RUN_MIGRATIONS=1`).

## 3e. La licencia se verifica en CADA acceso

**Qué pasaba:** la licencia solo se miraba al iniciar sesión. Una sesión abierta (8 h) seguía funcionando aunque la licencia venciera, se borrara o el equipo se desactivara; un equipo «Activo» activado con una clave que ya no existe seguía trabajando; y en una instalación nueva o borrada, el Administrador inicial entraba desde un equipo sin activar **sin ninguna licencia**.

**Qué pasa ahora** (`services/licenciaAccesoService.ts`, usado por el inicio de sesión y por `requireAuth` en cada petición):
- **Con sesión de personal**, cada petición exige: equipo **Activo** y de la misma empresa que la sesión, vigencia del equipo sin vencer, la **licencia con la que se activó** (por su clave) existente, activa, no revocada y sin vencer (la clave maestra `LICENSE_ACTIVATION_KEY` también vale), y el negocio no bloqueado. Un equipo activado sin clave (instalaciones antiguas) exige que su empresa tenga al menos una licencia vigente.
- **Equipo sin activar:** solo entra el Administrador de la empresa raíz (1), y **únicamente si esa empresa tiene una licencia vigente**. Sin licencia (sistema recién instalado o borrado) **nadie** inicia sesión: hay que activar el equipo con una clave (la que genera el propietario en su panel, o la clave maestra del servidor).
- **Respuesta:** `403` con `code` `DISPOSITIVO_NO_ACTIVADO`, `LICENCIA_REQUERIDA`, `LICENCIA_VENCIDA` o `LICENCIA_REVOCADA`. La interfaz cierra la sesión y muestra la pantalla de activación (equipo no activado) o la de licencia (resto).
- **Excepciones:** cerrar sesión (`/api/logout`) y activar una clave nueva con sesión (`/api/licencia/activar`). El **propietario de la plataforma** no depende de licencias de negocio.
- **La pantalla de licencia usa la misma regla.** `GET /api/licencia/verificar` (con la cabecera del equipo) responde con la verificación del servidor: bloqueado con su `codigo` y `motivo`, o los días y la fecha de vencimiento de la licencia del equipo. Se retiró la antigua cuenta por antigüedad de `negocio_config` (`duracion_meses` + `fecha_instalacion`, 7 días de prueba por defecto): al renovar con una clave nueva no se reiniciaba y bloqueaba licencias en regla, y el servidor nunca la aplicó.
- **Flujos en tiempo real vigilados.** Los flujos de cocina y mesas (`/api/kds/stream`, `/api/mesas/stream`) se abren con un ticket que no pasa por la verificación de cada petición; ahora el servidor vuelve a comprobar la licencia del equipo cada `SSE_LICENCIA_SEGUNDOS` y, si la perdió, le envía el evento `licencia` y cierra el flujo (tampoco entrega tickets nuevos).
- **Rapidez:** el resultado se recuerda `LICENCIA_CACHE_SEGUNDOS` (10 s); un cambio hecho desde el panel (revocar, reactivar, eliminar, activar/desactivar equipo, cambiar cupo) rige al instante en ese servidor.
- **«Borrado completo»** («Limpiar pruebas»): además de vaciar las sesiones, sube el contador de sesiones del propietario, así que **también se cierra la sesión del propietario** y hay que volver a entrar con su PIN. Esa operación exige ser dueño de las tablas y secuencias (la app de escritorio corre como superusuario; el rol de la aplicación en producción **no puede** y recibe un error: queda bloqueada por permisos).
- Se corrigió además que `requireAdminODueno` escondía cualquier error de autenticación tras un 403 genérico «sin permiso» (ahora devuelve el error real: 401 de sesión, 403 de licencia).

**Antes de desplegar:** `npm run licencias:diagnostico` (solo lectura) aplica esta regla a cada equipo activo y a cada sesión abierta de la base configurada y lista a quién dejaría sin acceso (sale con código 1 si hay alguno). Un equipo bloqueado en regla suele ser uno activado con una clave que ya no corresponde a ninguna licencia: se resuelve activándolo de nuevo con una clave vigente (pantalla *Activación de Dispositivo*) o eliminándolo. La verificación de tu base local, por ejemplo, marcó un equipo de pruebas (`screenshot-device-0001`) activado con una clave antigua.

**Pruebas:** `npm run test:licencias` (secciones 6 y 7: vencimiento con sesión abierta, desactivar equipo, licencia borrada, revocar, administrador raíz con y sin licencia, sistema borrado y reactivación con licencia nueva o clave maestra) y `tests/unit/services/licenciaAccesoService.test.ts`.

## 3b. Licencias: cuántos equipos permite cada una

Cada licencia tiene **su propio cupo de equipos activos** (por defecto 2; antes era un 2 fijo en el código). Un cliente que necesita más (dos cajas, una tablet de salón, pantallas de cocina y bar…) se atiende **sin regenerar la clave ni perder datos**: *Panel del Propietario → Licencias Usadas → botón **Equipos*** de esa licencia.

- **Equipos activos permitidos** (1–50). Cambiarlo exige un **motivo** (mín. 3 letras) que queda en el historial de la licencia (`licencia_cambios`: valor anterior, nuevo, motivo, quién y cuándo, visible en el mismo modal) y en la auditoría (`LICENCIA_CAMBIO_CUPO`). El cupo es **por licencia**: subir una no cambia las demás.
- **Ampliar** (p. ej. 2 → 5 para una cadena con 5 puestos): sube el número, escribe el motivo y guarda; los equipos extra se activan con la misma clave desde la pantalla de activación de cada equipo.
- **Reducir por debajo de lo que está en uso:** la pantalla pide elegir **cuáles equipos desactivar** en la misma operación (nunca se desactiva nada a escondidas; sin elegir, el servidor responde 409 `CUPO_POR_DEBAJO_DE_USO`).
- **Una sola regla** (`asegurarCupo`) rige *toda* transición a Activo: activar con clave **y reactivar desde el panel**. Antes un Administrador podía desactivar un equipo, activar otro con la clave y reactivar el primero (3 activos con límite 2). Las altas simultáneas se serializan por licencia (6 intentos a la vez con 1 espacio libre → entra exactamente 1). Volver a activar un equipo que ya está activo con su clave no gasta otro lugar; un equipo de una licencia no se "cuela" en otra que está llena; eliminar un equipo libera su lugar.
- **Clave oculta al Administrador:** `GET /api/dispositivos` entrega la clave enmascarada (`CHLOE-12M-•••••-D7E8F`); solo el propietario la ve completa. El Administrador ve en *Terminales POS* el cupo real de su licencia ("2 / 5 en uso").
- Un equipo activado **sin clave** (clave maestra antigua) comparte un cupo por defecto de 2 por empresa.
- **Para aplicarlo a producción:** desplegar el código, migrar (`053` y `054`, ver §2 y §3a) y conceder al rol de la aplicación acceso a la tabla nueva (`npm run provision:production-role` es idempotente y concede `SELECT/INSERT/UPDATE/DELETE` sobre todas las tablas y secuencias). Los Electron ya instalados no cambian de comportamiento hasta actualizarse a un instalador nuevo (su servidor local es el que aplica el límite y la verificación de licencia): el instalador **2.6.0** (`frontend-restaurante/release/ChloeRestaurant Setup 2.6.0.exe`, sin firma de código) ya los incluye, junto con el PIN del propietario incrustado y la corrección de la solicitud de registro.
- Corregido de paso: cada equipo activado añadía una fila repetida en `configuracion_sistema` de la empresa (el `ON CONFLICT DO NOTHING` no tenía índice único), y una licencia con 3 equipos aparecía 3 veces en la tabla del propietario. Ya no se duplican y la tabla lee un solo registro por licencia; la migración `054` borra las filas repetidas que ya existan (conserva la fila 1 de la empresa raíz, que guarda el PIN y las sesiones del propietario, y en las demás empresas la configurada más recientemente) y crea un índice único por empresa para que no vuelva a pasar.

## 3c. Entorno de prueba de licencias (probar antes de aplicar a producción)

Levanta un servidor aislado que hace de `chloerestaurant.lat`, con su propia base PostgreSQL (`chloerest_prueba_licencias`; **nunca** toca la base real), corriendo con un rol sin privilegios como producción y escuchando solo en `127.0.0.1`. Los PIN que imprime son de prueba.

| Comando | Qué hace |
|---|---|
| `npm run entorno:prueba` | Compila, crea la base, migra, crea una licencia de prueba con un equipo y muestra la URL (`:3100`) y los PIN. Para ver la interfaz antes hay que compilarla: `cd frontend-restaurante && npm run build` |
| `npm run entorno:prueba:estado` | Si sigue arriba y cuántos equipos activos tiene la licencia de prueba |
| `npm run entorno:prueba:detener -- --borrar` | Lo apaga y elimina la base de prueba (sin `--borrar` se conserva) |
| `npm run licencias:diagnostico` (servidor: `node dist/diagnosticoLicencias.js`) | Solo lectura sobre la base configurada: aplica la regla de licencia a cada equipo activo y a cada sesión abierta y dice quién quedaría sin acceso (código de salida 1 si alguno); informa también si el Administrador de la empresa raíz puede entrar desde un equipo sin activar (§3e). Correrlo **antes de desplegar** |
| `npm run test:release` | Comprueba el release de escritorio ya construido (`npm run dist`): instalador de la versión actual, servidor empaquetado con el control de licencia y la última migración, e invariantes de seguridad de Electron |
| `npm run test:propietario` | PIN del propietario incrustado y panel reforzado (copia del servidor con un PIN de prueba, ver §3d) |
| `npm run test:licencias` | Prueba automática completa (levanta su propio servidor en `:3120`, ~50 comprobaciones: cupo, ampliar a más de 2, reducir, reactivación, concurrencia, clave oculta, historial, aislamiento por empresa con rol sin privilegios) y lo borra todo al terminar |

Prueba manual sugerida: entrar a `/paneldueno` con el PIN del propietario, abrir *Licencias Usadas → Equipos*, subir el cupo con un motivo, activar equipos nuevos con la clave (`POST /api/dispositivo/activar` con `{ deviceId, clave }` o desde la pantalla de activación de otro navegador) y comprobar como Administrador (equipo y PIN que imprime el comando) que *Terminales POS* muestra "usados / permitidos". Los registros quedan en `%TEMP%\chloe-entorno-prueba`.

## 3d. PIN del propietario incrustado en el código y panel del propietario reforzado

**Qué es.** El PIN del propietario puede quedar **fijado en el código fuente del sistema** y entonces **prevalece** sobre cualquier otro: es el único que abre el *Panel del Propietario* (`/paneldueno`) y la entrada de propietario de la pantalla de acceso general, en el servidor central y en cada app de escritorio. Lo que se incrusta **no es el PIN** sino su *verificador* (`scrypt` con sal propia y 32 MiB de memoria por intento) en `src/lib/propietario.ts`; el PIN no se escribe en ningún archivo.

**Cómo fijarlo (lo haces tú, una vez):**

```bash
npm run propietario:pin                  # pide el PIN dos veces, sin mostrarlo, y lo incrusta
npm run propietario:pin -- --verificar   # comprueba que lo recuerdas (no cambia nada)
npm run propietario:pin -- --quitar      # vuelve al PIN configurable de antes
```

El PIN debe tener **10 a 12 dígitos** (recomendado 12) y sin patrones (no repetidos, escaleras ni bloques repetidos). Después hay que **recompilar y desplegar** el servidor y, para las apps de escritorio, **generar un instalador nuevo**: lo ya desplegado/instalado sigue con el PIN que tenía. Guarda el PIN en tu gestor de contraseñas: si lo olvidas, se regenera con el mismo comando (tienes el código) y se vuelve a desplegar.

**Qué pasa cuando hay un PIN incrustado:**
- Es el **único** válido. El `OWNER_PIN` del entorno y el PIN guardado en la base se **ignoran**; `POST /api/dueno/establecer-pin` y `POST /api/dueno/cambiar-pin` responden 409 `PIN_FIJO` (ya nadie puede crear o cambiar un PIN de propietario desde la interfaz: un cliente no puede quedarse con el panel de su instalación creando el suyo). El botón *Cambiar PIN* es sustituido por «PIN fijado en el sistema».
- Panel y login general usan la **misma función** (`propietarioService.esPinDelPropietario`); no pueden discrepar.
- `GET /api/dueno/pin-info` anuncia solo `{ configurado, longitudes: [12], fijo: true }` y el teclado se envía solo al completar los 12 dígitos (también se puede teclear en el teclado físico).
- Sin PIN incrustado el comportamiento es el de siempre (`OWNER_PIN` o PIN guardado); al arrancar queda un aviso `PIN_PROPIETARIO_NO_INCRUSTADO` en el registro. Con PIN incrustado el registro dice `PIN_PROPIETARIO_INCRUSTADO` (solo la longitud).

**Lo que debes saber (límites honestos):**
- El verificador **viaja dentro de cada instalador**. Quien lo extraiga puede intentar adivinar el PIN sin conexión; por eso se exigen 10–12 dígitos y un `scrypt` costoso (con 12 dígitos la búsqueda es impracticable; con 6–8 se rompería en minutos u horas, y como el mismo PIN abre también el central, sería grave). **No reutilices este PIN en ningún otro sitio.** Si sospechas que se filtró: fija otro, despliega y redistribuye el instalador (los instaladores viejos conservan el PIN viejo).
- La computadora de un cliente es del cliente: quien controle su equipo puede alterar su copia local (el código, su base). El PIN incrustado impide el uso normal y accidental (crear su propio PIN, generar claves, subir su cupo) y protege el servidor central; una protección fuerte de licencias en el equipo del cliente solo existe validando contra el central.

**Refuerzos del panel del propietario (rigen siempre, con o sin PIN incrustado):**
- **Bloqueo propio** del propietario por IP (clave `dueno:ip:…`, aparte de los errores de PIN del personal): con PIN incrustado, 5 PIN incorrectos → 15 min bloqueado (incluso con el PIN correcto); sin PIN incrustado, más estricto: 3 → 30 min. Cada PIN incorrecto tarda además 0,4 s en responder.
- **Auditoría y aviso:** cada acceso queda en `auditoria_operaciones` (`DUENO_LOGIN_OK` / `DUENO_LOGIN_FALLIDO`, entidad `propietario`, con IP y navegador, por el panel o por el login general) y, si el bot de Telegram está activo, llega un aviso al chat del propietario.
- **Sesión más corta:** el token dura **4 horas** (antes 12) y el panel se **cierra solo tras 15 minutos sin uso** revocando la sesión en el servidor. La respuesta del login no se guarda en cachés.
- Comparaciones en tiempo constante; todas las rutas `/api/dueno/*` salvo `login`, `pin-info` y `establecer-pin` exigen token del propietario (un Administrador de un negocio o un token falsificado reciben 401).

**Las pruebas automáticas no usan el PIN real.** Con un PIN incrustado el modo `OWNER_PIN` no existe, así que `test:e2e`, `test:integration` y `test:licencias` (y `npm run entorno:prueba`) levantan `bundle-pruebas.cjs`, una copia del servidor con el PIN del propietario neutralizado (`npm run build:server:pruebas`). El servidor que se despliega y se empaqueta es siempre `bundle.cjs` (`npm run build:server`), con el PIN incrustado tal cual está en el código. En CI esto es automático (`test:e2e` lo compila).

**Verificación:** `npm run test:propietario` (30 comprobaciones: compila una copia del servidor con un PIN de **prueba** incrustado y deja un `OWNER_PIN` señuelo para demostrar que el incrustado prevalece). Para comprobar el servidor **real** sin necesitar el PIN: arrancar `bundle.cjs` y ver que `GET /api/dueno/pin-info` devuelve `fijo: true` con la longitud de tu PIN, que el `OWNER_PIN` del entorno responde 401 y que `establecer-pin` responde 409; y `npm run propietario:pin -- --verificar` confirma que recuerdas el PIN.

## 4. Zona horaria

Las fechas de cierres, reportes y caja usan la zona horaria de la **base de datos**. `GET /api/health` devuelve `zonaHorariaBd`: debe ser `America/Santo_Domingo` (UTC−4). Si no lo es:

```sql
ALTER DATABASE <base> SET timezone TO 'America/Santo_Domingo';
```

y reiniciar la aplicación. Hacerlo antes de acumular historial (los datos ya guardados no se convierten).

## 5. Monitoreo

- Monitor de disponibilidad (UptimeRobot u otro) sobre `https://<dominio>/api/health`, esperando HTTP 200 y `"estado":"ok"`; alerta por correo/Telegram.
- Revisar semanalmente: `migracion` (última), `uploads` = `escribible`, y que exista un respaldo reciente.
- El servidor registra en formato JSON (`action`, `error`); buscar `RESPALDO_FALLIDO`, `HTTP_ERROR_5XX` y `DB_SCHEMA_OUTDATED`.

## 6. Instalador de Windows

1. Subir la versión (`npm version x.y.z --no-git-tag-version` en la raíz y en `frontend-restaurante`, y el `version` de `src/app.ts` y `src/routers/sistema.ts`) y ejecutar `npm run dist` (desde `frontend-restaurante`): compila el servidor, la interfaz y genera `release/ChloeRestaurant Setup <versión>.exe`. No reutilizar el número de una versión ya distribuida.
2. **Secretos:** el secreto de sesión **ya no viaja** en el instalador; cada instalación genera el suyo la primera vez (y, si PostgreSQL no estaba instalado, también su propia contraseña de base de datos). Las instalaciones antiguas conservan la contraseña que ya tenían.
3. **Firma de código:** sin firma, Windows SmartScreen muestra "editor desconocido". Con un certificado de firma de código (OV/EV) definir `CSC_LINK` (ruta o base64 del `.pfx`) y `CSC_KEY_PASSWORD` antes de `npm run dist`; `electron-builder` firma solo.
4. Publicar la versión: **primero** subir el instalador y definir `APP_DOWNLOAD_URL` y `APP_UPDATE_NOTES` en el servidor central, y **después** desplegar. `/api/app/version` informa la versión del `package.json` del servidor; si se despliega antes, los equipos ya instalados muestran "hay una nueva versión" sin enlace de descarga.
5. Probar en un equipo limpio: instalación, activación con clave, apertura de caja, cobro, impresión de ticket y respaldo (*Datos de la Empresa → Respaldos → Crear respaldo ahora*).
6. **Si la aplicación no abre:** al arrancar aparece una pantalla de "Iniciando ChloeRestaurant…" (la primera vez puede tardar minutos porque instala la base de datos). Si algo falla se muestra una ventana con el motivo y los botones *Reintentar* y *Cerrar*; el detalle técnico queda en `%APPDATA%\chloerestaurant\main.log`. El servidor local usa el puerto **3000**; si otra aplicación lo ocupa (por ejemplo otro servidor de desarrollo) usa el siguiente libre (3001…3010) y lo anota en el log: los demás equipos de la red deben conectarse a ese puerto. La app solo abre una instancia a la vez.
7. **PostgreSQL ya no viaja dentro del instalador** (desde 2.4.0): antes ocupaba ~376 MB del `.exe` para *todos*, aunque solo hace falta en una instalación nueva sin PostgreSQL. Ahora, si al arrancar no lo encuentra, `main.cjs` lo descarga una vez desde el sitio oficial de EDB (`POSTGRES_INSTALLER_URL` en `main.cjs`) mostrando el progreso en la pantalla de arranque, y recién entonces lo instala en silencio. Requiere internet en ese primer arranque; si falla (sin conexión, firewall, servidor de descarga caído), se muestra el enlace para instalarlo a mano. El instalador de ChloeRestaurant pasó de ≈465 MB a ≈115 MB.
8. **Equipos modestos o con GPU problemática:** si el proceso de GPU de Chromium se cae (controlador viejo, GPU integrada floja, máquina virtual), la app detecta el fallo (`child-process-gone`), guarda una marca en `%APPDATA%\chloerestaurant\modo-seguro-gpu` y se reinicia sola sin aceleración por hardware; los siguientes arranques en ese equipo ya inician directo en ese modo. Si la interfaz se cae por otra causa (`render-process-gone`), se recarga sola una vez.

## 7. Pruebas

| Comando | Qué cubre |
|---|---|
| `npm test` / `npm run test:coverage` | Pruebas unitarias (y piso de cobertura) |
| `npm run test:e2e` | Extremo a extremo contra una BD **local** (dinero, roles, turnos, respaldos), con el servidor de pruebas `bundle-pruebas.cjs` (§3d). Requiere `E2E_ADMIN_PIN` y `E2E_DEVICE_ID`; en CI se prepara con `npm run seed:e2e` |
| `npm run test:licencias` | Cupo de equipos por licencia y activación de equipos (servidor temporal de pruebas, ver §3c) |
| `npm run test:db-security` / `npm run test:rls-runtime` | Todas las tablas por negocio con RLS y aislamiento real |
| `npm run backup:verify` | Restauración de un respaldo en una base temporal |

## 8. Posicionamiento en buscadores (SEO)

El `<title>`, la descripción, el `sitemap.xml` y los datos estructurados viven en `frontend-restaurante/index.html` y `frontend-restaurante/public/`. Después de cualquier despliegue con cambios ahí:

1. **Avisar a Bing/Yandex/Seznam/Naver (sin iniciar sesión en nada):**
   ```bash
   npm run seo:indexnow
   ```
   Envía las URLs del sitemap a [IndexNow](https://www.indexnow.org/); primero comprueba que `https://chloerestaurant.lat/01fea755e3f9d5523831d3c07fbaf9c2.txt` ya esté desplegado (si no, avisa y no envía nada). **Google no participa en IndexNow.**
2. **Google Search Console (requiere tu cuenta de Google — no lo puede hacer un agente):**
   - Entra a [search.google.com/search-console](https://search.google.com/search-console) con la cuenta dueña de la verificación (`google-site-verification` en `index.html`) y confirma que la propiedad `https://chloerestaurant.lat` esté verificada.
   - *Sitemaps* → agrega `sitemap.xml`.
   - *Inspección de URLs* → pega `https://chloerestaurant.lat/` → **Solicitar indexación**.
3. **Bing Webmaster Tools** (opcional, además de IndexNow): [bing.com/webmasters](https://www.bing.com/webmasters) → puedes importar la propiedad directamente desde Google Search Console.
4. **Al menos un enlace entrante real** (redes sociales, Google Business Profile, un directorio de negocios): sin ningún enlace apuntando al dominio, a los buscadores les cuesta mucho más encontrarlo por su cuenta.

Ver `docs/AUDITORIA_FINAL_2026-09-21.md` y el hallazgo del 2026-09-27 en `ESTADO_DEL_SISTEMA.md` §12e: el `<title>` de SEO se pisaba con "Mi Restaurante - Sistema de Gestión" en cualquier visitante (no solo equipos activados), lo que probablemente impedía indexar el título real. Ya está corregido; falta desplegarlo.
