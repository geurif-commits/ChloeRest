Despliegue seguro - Terminal POS
================================

Pasos mínimos para desplegar en producción:

1) Preparar servidor/VM y PostgreSQL
   - Instalar Node.js 18.x
   - Instalar PostgreSQL y crear la base de datos indicada en variables de entorno

2) Variables de entorno obligatorias
   - `APP_SESSION_SECRET`: Cadena larga (ej. base64url de 48 bytes). OBLIGATORIO en producción.
   - `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT`
   - `PORT` (opcional, default 3000)
   - `LICENSE_ACTIVATION_KEY` (si se requiere activación de licencias)

3) Construcción y packaging (recomendado en CI/CD)
   - Ejecutar en runner limpio (GitHub Actions incluido): `npm ci && npm run build:server` y `cd frontend-restaurante && npm ci && npm run build`.
   - Usar el workflow `.github/workflows/build.yml` o `.github/workflows/release.yml` para generar artefactos y releases.

4) Ejecutar en producción
   - Colocar `bundle.cjs` y `frontend-restaurante/dist` en el mismo directorio que el servidor.
   - Definir variables de entorno y ejecutar `node bundle.cjs` o usar `ServidorPOS.exe` generado.

5) Seguridad y mantenimiento
   - Asegurar que `uploads/` tenga permisos restrictivos y no ejecute binarios.
   - Configurar TLS frente a peticiones públicas (reverse proxy: Nginx/Caddy).
   - Programar backups y pruebas de migraciones en staging.
