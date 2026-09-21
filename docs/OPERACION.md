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
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`, `LOGIN_LOCKOUT_MINUTES` | Bloqueo por PIN incorrecto | 5 / 15 / 5 |
| `DEVICE_REGISTER_RATE_MAX` | Aperturas de app por IP cada 10 min (`/api/dispositivo/registrar`) | 300 |
| `PUBLIC_RATE_MAX` | Solicitudes a endpoints públicos por IP cada 10 min | 30 |
| `BACKUP_ENABLED` | `1` activa el respaldo diario automático | `0` (las instalaciones de escritorio lo activan solas) |
| `BACKUP_DIR` | Carpeta de respaldos | `backups/auto` |
| `BACKUP_COPY_DIR` | Segunda carpeta (USB, carpeta de OneDrive/Dropbox/Google Drive, recurso de red) a la que se copia cada respaldo verificado, con la misma retención | — |
| `BACKUP_HOUR` | Hora local del respaldo diario (0–23) | 3 |
| `BACKUP_RETENTION_DAYS` | Días que se conservan (siempre quedan los 3 más recientes) | 14 |
| `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD` | Rol que respalda (superusuario o con `BYPASSRLS`) | el de la app |
| `PG_BIN_DIR` | Carpeta de `pg_dump`/`pg_restore` si no están en el PATH | autodetecta |
| `BACKUP_TENANT_ACCESS` | `1`: el Administrador ve, crea y descarga respaldos (solo instalaciones de **un** negocio) | `0` |

## 2. Despliegue (servidor central)

1. Compilar y subir: `python scripts/deploy.py` (compila el backend y el frontend, sube y reinicia).
2. Migrar la base con un rol con permisos DDL (el servidor operativo no migra al arrancar):
   ```bash
   DB_USER=<rol_ddl> DB_PASSWORD=<...> DB_HOST=<...> DB_NAME=<...> npm run migrate
   ```
   y conceder al rol de la aplicación acceso a lo nuevo (ver `docs/POSTGRES_PRODUCCION.md`).
3. Verificar (solo lectura, sin credenciales):
   ```bash
   npm run verify:deploy -- https://chloerestaurant.lat
   ```
   Comprueba que responde, que la migración aplicada es la última del código, la zona horaria de la base de datos y las cabeceras de seguridad.
4. Antes de dar por bueno el despliegue: iniciar sesión, abrir caja y cobrar una cuenta de prueba.

**Migración 051**: apaga ITBIS y propina y quita el ITBIS/propina de **todos** los productos de **todos** los negocios de la base. **052** agrega descuentos y cuentas divididas.

## 3. Respaldos

- **Instalación de escritorio (un negocio):** el respaldo diario viene activado; los archivos quedan en la carpeta de datos del usuario (`respaldos`). El Administrador los ve y descarga en *Datos de la Empresa → Respaldos*. **Guardar una copia fuera del equipo**: definir la variable de entorno de Windows `BACKUP_COPY_DIR` con una memoria USB o una carpeta sincronizada de la nube (por ejemplo la de OneDrive) y reiniciar la aplicación; cada respaldo verificado se copia allí solo (si el destino no está disponible, queda el aviso `RESPALDO_COPIA_FALLIDA` en el registro y el respaldo local no se pierde). Si el equipo falla, los respaldos que estén únicamente en él también se pierden.
- **Servidor multiempresa:** definir `BACKUP_ENABLED=1`, `BACKUP_DIR` en un disco distinto al de la base, `BACKUP_DB_USER/PASSWORD` con un rol con `BYPASSRLS` (las tablas de negocio tienen RLS **forzado**: un rol sin ese permiso hace fallar `pg_dump` en voz alta) y `BACKUP_COPY_DIR` apuntando a un disco o montaje de otro equipo/servicio para tener la copia fuera del servidor. En hosting compartido sin acceso a `pg_dump`, usar los respaldos del proveedor y probar su restauración.
- **A mano:** `npm run backup`.
- **Prueba de restauración (hacerla cada mes y tras cambiar de servidor):** `npm run backup:verify` restaura el último respaldo en una base temporal, compara tablas, RLS y migraciones con la base actual y la elimina.
- **Restaurar de verdad:** crear una base vacía y `pg_restore -h <host> -U <rol> -d <base_nueva> --no-owner --no-privileges <archivo.dump>`; después apuntar `DB_NAME` a ella.

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

## 7. Pruebas

| Comando | Qué cubre |
|---|---|
| `npm test` / `npm run test:coverage` | Pruebas unitarias (y piso de cobertura) |
| `npm run test:e2e` | Extremo a extremo contra una BD **local** (dinero, roles, turnos, respaldos). Requiere `E2E_ADMIN_PIN` y `E2E_DEVICE_ID`; en CI se prepara con `npm run seed:e2e` |
| `npm run test:db-security` / `npm run test:rls-runtime` | Todas las tablas por negocio con RLS y aislamiento real |
| `npm run backup:verify` | Restauración de un respaldo en una base temporal |
