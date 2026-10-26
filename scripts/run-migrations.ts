/**
 * Aplica las migraciones pendientes y sale (paso de despliegue; ver src/migrar.ts, que es la implementación).
 * En desarrollo / instalación de escritorio: `npm run migrate`. En el servidor de producción, donde solo existe el
 * código compilado: `node dist/migrar.js` (ver docs/OPERACION.md §3a).
 */
import '../src/migrar.js';
