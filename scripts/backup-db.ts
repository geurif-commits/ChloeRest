/**
 * Crea un respaldo de la base de datos ahora (pg_dump), lo verifica y depura los antiguos.
 *
 *   npm run backup
 *
 * Variables (además de las de la aplicación): BACKUP_DIR, BACKUP_COPY_DIR (segunda carpeta: USB, nube
 * sincronizada o red), BACKUP_RETENTION_DAYS, PG_BIN_DIR y, si el rol de la aplicación no puede leer todas
 * las filas (RLS forzado), BACKUP_DB_USER / BACKUP_DB_PASSWORD con un superusuario o un rol con BYPASSRLS.
 */
import '../src/lib/env.js';
import { config } from '../src/lib/config.js';
import { crearRespaldo } from '../src/services/backupService.js';

try {
  const respaldo = await crearRespaldo();
  console.log(`Respaldo creado y verificado: ${config.backup.dir}/${respaldo.nombre} (${(respaldo.bytes / 1024 / 1024).toFixed(2)} MB)`);
  if (respaldo.copiaExterna === 'ok') {console.log(`Copia externa: ${config.backup.copyDir}`);}
  if (respaldo.copiaExterna === 'fallida') {
    console.error(`AVISO: no se pudo copiar a ${config.backup.copyDir}; revisa que esté disponible.`);
    process.exit(2);
  }
  process.exit(0);
} catch (error) {
  console.error('ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
}
