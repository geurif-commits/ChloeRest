# PostgreSQL seguro para producción

El servidor rechaza deliberadamente roles con `SUPERUSER` o `BYPASSRLS` cuando `NODE_ENV=production`.
La aplicación debe usar un rol dedicado, no `postgres`.

## Crear el rol

Ejecuta estas sentencias conectado como administrador de PostgreSQL, sustituyendo los valores entre `<...>`:

```sql
CREATE ROLE chloerest_app LOGIN PASSWORD '<CONTRASEÑA_LARGA_Y_ALEATORIA>'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE <DB_NAME> TO chloerest_app;
GRANT USAGE ON SCHEMA public TO chloerest_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chloerest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chloerest_app;
```

Las migraciones deben ejecutarse previamente con un administrador o con un rol de despliegue separado. El rol de la aplicación no debe recibir permisos para crear tablas, roles o bases de datos.

## Migraciones separadas del arranque

En producción, el servidor operativo no ejecuta migraciones por defecto. Ejecuta las migraciones previamente con un rol de despliegue y arranca la aplicación con `RUN_MIGRATIONS=0`. Solo habilita `RUN_MIGRATIONS=1` durante una ventana explícita de mantenimiento y usando un rol con permisos DDL.

## Configuración

En el entorno de producción:

```env
NODE_ENV=production
DB_USER=chloerest_app
DB_PASSWORD=<CONTRASEÑA_LARGA_Y_ALEATORIA>
DB_NAME=<DB_NAME>
```

Nunca guardes la contraseña en Git, `.env.example`, logs ni artefactos del instalador.

## Verificación

Antes de arrancar el servicio, valida el rol:

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'chloerest_app';
```

Todos los indicadores deben ser `false`. Después ejecuta el servidor en producción y confirma que `/api/health` responde con la base conectada.
