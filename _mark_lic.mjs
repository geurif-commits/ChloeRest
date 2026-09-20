import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('./.env', 'utf8');
const get = (k) => {
  const m = env.split(/\r?\n/).find((l) => l.startsWith(k + '='));
  return m ? m.slice(k.length + 1).trim() : '';
};
const c = new pg.Client({
  host: get('DB_HOST') || 'localhost', port: Number(get('DB_PORT') || 5432),
  user: get('DB_USER') || 'postgres', password: get('DB_PASSWORD'), database: get('DB_NAME'),
});
await c.connect();
await c.query(
  `UPDATE negocio_config
     SET duracion_meses = -1, licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP
   WHERE empresa_id = 1`
);
const r = await c.query('SELECT id, empresa_id, duracion_meses, licencia_bloqueada FROM negocio_config WHERE empresa_id = 1');
console.log('NEGOCIO:', JSON.stringify(r.rows));
await c.end();
