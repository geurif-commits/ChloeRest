import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 3199;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

// Cargar .env para obtener OWNER_PIN (sin exponerlo)
function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv(path.join(ROOT, '.env'));

let serverProc = null;
let duenoToken = null;

async function request(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, headers: res.headers };
}

function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(BASE + '/api/health');
        if (r.ok) return resolve();
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error('Timeout esperando al servidor'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

before(async () => {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  await waitForServer();
});

after(() => {
  if (serverProc) serverProc.kill('SIGKILL');
});

test('Health endpoint responde ok', async () => {
  const r = await request('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'ok');
  assert.equal(r.body.baseDeDatos, 'conectada');
});

test('Login del dueño emite token', async () => {
  const r = await request('/api/dueno/login', {
    method: 'POST',
    body: JSON.stringify({ pin: env.OWNER_PIN }),
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.token, 'debe emitir token');
  duenoToken = r.body.token;
});

test('Login del dueño con PIN erróneo es rechazado', async () => {
  const r = await request('/api/dueno/login', {
    method: 'POST',
    body: JSON.stringify({ pin: '000000' }),
  });
  assert.equal(r.status, 401);
});

test('Endpoints del dueño requieren token', async () => {
  const sinToken = await request('/api/dueno/resumen');
  assert.equal(sinToken.status, 401);
  const conToken = await request('/api/dueno/resumen', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(conToken.status, 200);
});

test('Planes de licencia disponibles', async () => {
  const r = await request('/api/planes');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.planes));
  assert.ok(r.body.planes.length >= 1);
});

test('Validación de RNC (DGII)', async () => {
  const r = await request('/api/dgii/validar-rnc/131000000', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.valido, 'boolean');
});

test('Reporte DGII 607 responde', async () => {
  const r = await request('/api/dgii/reporte-607?anio=2026&mes=9', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
});

test('Reporte DGII 606 responde', async () => {
  const r = await request('/api/dgii/reporte-606?anio=2026&mes=9', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
});

test('Sesión de usuario se valida', async () => {
  const r = await request('/api/sesion/validar', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
});

test('Configuración del sistema es pública', async () => {
  const r = await request('/api/configuracion/sistema');
  assert.equal(r.status, 200);
});

test('Configuración consolidada (sistema + negocio)', async () => {
  const r = await request('/api/configuracion/completa');
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.setup_completado, 'boolean');
  assert.ok(r.body.negocio, 'debe incluir datos del negocio');
});

test('Alertas de stock mínimo', async () => {
  const r = await request('/api/inventario/alertas', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.alertas));
  assert.equal(typeof r.body.total, 'number');
});

test('Reporte DGII 607 en formato CSV', async () => {
  const r = await request('/api/dgii/reporte-607?anio=2026&mes=9&formato=csv', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
});

test('Reporte DGII 606 en formato CSV', async () => {
  const r = await request('/api/dgii/reporte-606?anio=2026&mes=9&formato=csv', { headers: { Authorization: 'Bearer ' + duenoToken } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
});
