import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';

const env = fs.readFileSync('./.env', 'utf8');
const get = (k) => {
  const m = env.split(/\r?\n/).find((l) => l.startsWith(k + '='));
  return m ? m.slice(k.length + 1).trim() : '';
};

const salt = crypto.randomBytes(16).toString('base64url');
const hash = crypto.scryptSync('123456', salt, 64).toString('base64url');
const pinHash = `scrypt$${salt}$${hash}`;

const c = new pg.Client({
  host: get('DB_HOST') || 'localhost',
  port: Number(get('DB_PORT') || 5432),
  user: get('DB_USER') || 'postgres',
  password: get('DB_PASSWORD'),
  database: get('DB_NAME'),
});
await c.connect();
const r = await c.query(
  "UPDATE usuarios SET pin_hash = $1, pin = NULL, requiere_cambio_pin = FALSE WHERE id = $2 RETURNING id, nombre, rol",
  [pinHash, 2]
);
console.log('PIN_RESET:', r.rows);
await c.end();