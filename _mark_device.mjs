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
const dev = 'screenshot-device-0001';
await c.query(
  `INSERT INTO dispositivos (device_id, empresa_id, navegador, ip, estado, activado_en, licencia_duracion, licencia_vencimiento, clave_activacion)
   VALUES ($1, 1, 'playwright', '127.0.0.1', 'Activo', CURRENT_TIMESTAMP, 'L', NULL, 'SCREENSHOT')
   ON CONFLICT (device_id) DO UPDATE SET estado='Activo', licencia_duracion='L', licencia_vencimiento=NULL, clave_activacion='SCREENSHOT', ultimo_acceso=CURRENT_TIMESTAMP`,
  [dev]
);
console.log('DEVICE_OK:', dev);
await c.end();