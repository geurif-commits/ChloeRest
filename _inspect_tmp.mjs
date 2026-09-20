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
const lic = await c.query('SELECT id, empresa_id, clave_texto, clave_hash, duracion_codigo, activa, creado_en FROM licencias ORDER BY id');
console.log('LICENCIAS:', JSON.stringify(lic.rows, null, 1));
const dev = await c.query('SELECT * FROM dispositivos ORDER BY id');
console.log('DISPOSITIVOS:', JSON.stringify(dev.rows, null, 1));
const cfg = await c.query('SELECT id, setup_completado, empresa_id, owner_pin_longitud FROM configuracion_sistema');
console.log('CONFIG:', JSON.stringify(cfg.rows));
await c.end();