/**
 * Entorno de prueba de LICENCIAS y ACTIVACIÓN DE EQUIPOS: levanta un servidor aislado con su propia base de datos
 * temporal y le crea una licencia de prueba, como si fuera chloerestaurant.lat.
 *
 * Seguridad: se niega a correr contra una base que no sea local, usa una base con nombre propio (jamás la del .env),
 * secretos nuevos en cada arranque, deja en blanco las integraciones externas (Telegram, correo, DGII), escucha solo
 * en 127.0.0.1 y corre con un rol de PostgreSQL sin privilegios (como producción), de modo que el aislamiento por
 * empresa (RLS) se aplica de verdad. Todo lo que crea son datos de PRUEBA.
 * Lo usan `entorno-prueba.mjs` (a mano) y `e2e-licencias.mjs` (automático).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';

export const RAIZ = process.cwd();
export const PIN_PROPIETARIO = '246810';
export const DISPOSITIVO_WEB = 'prueba-web-0001';

export const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Variables del .env (si existe) mezcladas con las del proceso; el proceso manda. */
export function leerEnv() {
  const env = {};
  const archivo = path.join(RAIZ, '.env');
  if (fs.existsSync(archivo)) {
    for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  for (const clave of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) {
    if (process.env[clave] !== undefined) env[clave] = process.env[clave];
  }
  if (!['localhost', '127.0.0.1', undefined, ''].includes(env.DB_HOST)) {
    throw new Error('El entorno de prueba solo corre contra una base de datos PostgreSQL local.');
  }
  return env;
}

const NOMBRE_BASE_PERMITIDO = /^chloerest_(prueba|e2elic)_[a-z]+$/;

const conexion = (env, database) => new pg.Client({
  host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432),
  user: env.DB_USER || 'postgres', password: env.DB_PASSWORD || undefined, database,
});

export async function prepararBase(env, nombre) {
  if (!NOMBRE_BASE_PERMITIDO.test(nombre)) throw new Error(`Nombre de base no permitido para pruebas: ${nombre}`);
  const admin = conexion(env, 'postgres');
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${nombre}`);
  } finally { await admin.end(); }
}

export async function borrarBase(env, nombre) {
  if (!NOMBRE_BASE_PERMITIDO.test(nombre)) return;
  const admin = conexion(env, 'postgres');
  await admin.connect();
  try { await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`); } finally { await admin.end(); }
}

/** Cliente SQL de la base de prueba, ya en contexto de plataforma (ve todas las empresas). */
export async function abrirBase(env, nombre) {
  const c = conexion(env, nombre);
  await c.connect();
  await c.query("SELECT set_config('app.platform', 'true', false), set_config('app.empresa_id', '1', false)");
  return c;
}

export function matarProceso(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
  else { try { process.kill(pid, 'SIGTERM'); } catch { /* ya no existe */ } }
}

export function procesoVivo(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Cliente HTTP mínimo: llamar('POST', '/ruta', { token, body, dispositivo, cabeceras }). */
export function crearCliente(base) {
  return async function llamar(metodo, ruta, { token, body, dispositivo, cabeceras } = {}) {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(dispositivo ? { 'X-Device-ID': dispositivo } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cabeceras || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const texto = await r.text();
    let cuerpo = texto;
    try { cuerpo = JSON.parse(texto); } catch { /* texto plano */ }
    return { status: r.status, body: cuerpo };
  };
}

/** Variables que NUNCA deben llegar a un servidor de pruebas desde el entorno real. */
const INTEGRACIONES_EN_BLANCO = {
  TELEGRAM_BOT_TOKEN: '', TELEGRAM_OWNER_CHAT_ID: '', TELEGRAM_WEBHOOK_SECRET: '',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', RESEND_API_KEY: '',
  MSELLER_API_KEY: '', MSELLER_USER: '', MSELLER_PASSWORD: '',
  BACKUP_ENABLED: '0', BACKUP_COPY_DIR: '', BACKUP_TENANT_ACCESS: '0',
  OWNER_PIN: '', BOOTSTRAP_ADMIN_PIN: '', APP_DOWNLOAD_URL: '', PUBLIC_BASE_URL: '',
};

const ROL_APP_PRUEBA = 'chloerest_app_prueba';

/** Rol como el de producción (sin superusuario ni BYPASSRLS): con él las políticas RLS se aplican de verdad. */
async function crearRolRestringido(env, baseDatos, clave) {
  const admin = conexion(env, baseDatos);
  await admin.connect();
  try {
    await admin.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_APP_PRUEBA}') THEN ALTER ROLE ${ROL_APP_PRUEBA} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${clave}'; ELSE CREATE ROLE ${ROL_APP_PRUEBA} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${clave}'; END IF; END $$`);
    await admin.query(`GRANT CONNECT ON DATABASE ${baseDatos} TO ${ROL_APP_PRUEBA}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROL_APP_PRUEBA}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL_APP_PRUEBA}`);
    await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROL_APP_PRUEBA}`);
  } finally { await admin.end(); }
}

/** Elimina el rol de prueba (si quedó de una ejecución anterior). */
export async function borrarRolDePrueba(env) {
  const admin = conexion(env, 'postgres');
  try { await admin.connect(); await admin.query(`DROP ROLE IF EXISTS ${ROL_APP_PRUEBA}`); } catch { /* sigue en uso por otro entorno */ } finally { await admin.end().catch(() => {}); }
}

export class Servidor {
  constructor({ nombre, puerto, baseDatos, extraEnv, dirLogs, desacoplado, bundle = 'bundle-pruebas.cjs' }) {
    this.bundle = bundle;
    this.nombre = nombre;
    this.puerto = puerto;
    this.baseDatos = baseDatos;
    this.extraEnv = extraEnv;
    this.dirLogs = dirLogs;
    this.desacoplado = Boolean(desacoplado);
    this.proceso = null;
    this.pid = null;
    this.url = `http://127.0.0.1:${puerto}`;
    this.api = crearCliente(this.url);
  }

  async iniciar(envBase) {
    if (!fs.existsSync(path.join(RAIZ, this.bundle))) throw new Error(`Falta ${this.bundle}: ejecuta "npm run build:server:pruebas".`);
    fs.mkdirSync(this.dirLogs, { recursive: true });
    const log = fs.openSync(path.join(this.dirLogs, `${this.nombre}.log`), 'a');
    const entorno = {
      ...process.env, ...envBase, ...INTEGRACIONES_EN_BLANCO,
      NODE_ENV: 'development', PORT: String(this.puerto), DB_NAME: this.baseDatos, RUN_MIGRATIONS: '1', API_HOST: '127.0.0.1',
      LOGIN_RATE_MAX: '5000', PUBLIC_RATE_MAX: '100000', LICENCIA_CACHE_SEGUNDOS: '1', SSE_LICENCIA_SEGUNDOS: '1',
      ...this.extraEnv,
    };
    delete entorno.AUTO_FREE_PORT;
    this.proceso = spawn(process.execPath, [this.bundle], {
      cwd: RAIZ, env: entorno, stdio: ['ignore', log, log], windowsHide: true, detached: this.desacoplado,
    });
    this.pid = this.proceso.pid;
    if (this.desacoplado) this.proceso.unref();
    let arriba = false;
    for (let i = 0; i < 80 && !arriba; i += 1) {
      try { arriba = (await fetch(`${this.url}/api/health`)).ok; } catch { /* arrancando */ }
      if (!arriba) {
        if (this.proceso.exitCode !== null) break;
        await pausa(400);
      }
    }
    if (!arriba) throw new Error(`El servidor "${this.nombre}" no arrancó en el puerto ${this.puerto} (revisa ${path.join(this.dirLogs, `${this.nombre}.log`)}).`);
    await pausa(500);
  }

  detener() {
    matarProceso(this.pid);
    this.proceso = null;
    this.pid = null;
  }
}

/**
 * Levanta el servidor ya migrado, con un rol sin privilegios, y crea una licencia de prueba con un equipo activado.
 * Devuelve todo lo necesario para operarlo; `limpiar()` lo apaga y borra la base y el rol.
 */
export async function levantarEntorno({
  puerto, baseDatos, dirLogs, desacoplado = false, avisar = () => {},
  bundle = 'bundle-pruebas.cjs', pinEntorno = PIN_PROPIETARIO, pinLogin = pinEntorno,
}) {
  const env = leerEnv();
  // En mayúsculas: el servidor normaliza a mayúsculas la clave que escribe el usuario al activar un equipo.
  const secretoLicencias = `PRUEBA-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
  const secretoSesion = crypto.randomBytes(32).toString('hex');
  const comunes = { ...env, APP_SESSION_SECRET: secretoSesion, LICENSE_ACTIVATION_KEY: secretoLicencias };

  avisar('Creando la base de datos de prueba…');
  await prepararBase(env, baseDatos);

  const servidor = new Servidor({
    nombre: 'licencias', puerto, baseDatos, dirLogs, desacoplado, bundle,
    extraEnv: { LOGIN_MAX_ATTEMPTS: '25', OWNER_PIN: pinEntorno, APP_SESSION_SECRET: secretoSesion, LICENSE_ACTIVATION_KEY: secretoLicencias },
  });

  const limpiar = async () => {
    servidor.detener();
    await pausa(700);
    await borrarBase(env, baseDatos).catch(() => {});
    const admin = conexion(env, 'postgres');
    try { await admin.connect(); await admin.query(`DROP ROLE IF EXISTS ${ROL_APP_PRUEBA}`); } catch { /* otro entorno de prueba lo sigue usando */ } finally { await admin.end().catch(() => {}); }
  };

  try {
    avisar('Arrancando el servidor y migrando la base…');
    await servidor.iniciar(comunes);

    avisar('Reiniciándolo con un rol de base de datos sin privilegios (como producción)…');
    const clave = crypto.randomBytes(18).toString('hex');
    servidor.detener();
    await pausa(900);
    await crearRolRestringido(env, baseDatos, clave);
    servidor.extraEnv = { ...servidor.extraEnv, DB_USER: ROL_APP_PRUEBA, DB_PASSWORD: clave, RUN_MIGRATIONS: '0' };
    await servidor.iniciar(comunes);

    avisar('Creando la licencia de prueba…');
    const duenoSesion = await servidor.api('POST', '/api/dueno/login', { body: { pin: pinLogin } });
    if (!duenoSesion.body?.token) throw new Error(`No se pudo iniciar sesión como propietario: ${JSON.stringify(duenoSesion.body)}`);
    const tokenDueno = duenoSesion.body.token;
    const creada = await servidor.api('POST', '/api/dueno/generar-clave', { token: tokenDueno, body: { duracion: '12M' } });
    if (!creada.body?.clave) throw new Error(`No se pudo generar la licencia de prueba: ${JSON.stringify(creada.body)}`);
    const { clave: claveLicencia, pinInicial, empresaId } = creada.body;
    const activada = await servidor.api('POST', '/api/dispositivo/activar', { body: { deviceId: DISPOSITIVO_WEB, clave: claveLicencia } });
    if (activada.status >= 300) throw new Error(`No se pudo activar el equipo de prueba: ${JSON.stringify(activada.body)}`);
    const licencias = (await servidor.api('GET', '/api/dueno/licencias', { token: tokenDueno })).body;
    const licencia = (Array.isArray(licencias) ? licencias : licencias.licencias || []).find((l) => Number(l.empresa_id) === Number(empresaId));
    if (!licencia) throw new Error('La licencia recién creada no aparece en el panel del propietario.');

    // Comodidad de prueba: se salta el asistente inicial y el cambio forzado de PIN para entrar directo a probar.
    const bd = await abrirBase(env, baseDatos);
    try {
      await bd.query("UPDATE usuarios SET requiere_cambio_pin = FALSE WHERE rol = 'Administrador'");
      await bd.query("UPDATE configuracion_sistema SET setup_completado = TRUE, nombre_negocio = COALESCE(nombre_negocio, 'Negocio de Prueba')");
    } finally { await bd.end(); }

    return {
      env, servidor, limpiar, baseDatos, dirLogs, claveMaestra: secretoLicencias, rolApp: { usuario: ROL_APP_PRUEBA, clave },
      licencia: { id: licencia.id, clave: claveLicencia, pinInicial, empresaId },
      credenciales: { pinPropietario: pinLogin, dispositivoWeb: DISPOSITIVO_WEB },
      tokenDueno,
    };
  } catch (error) {
    await limpiar();
    throw error;
  }
}

export const dirEstadoPrueba = () => path.join(os.tmpdir(), 'chloe-entorno-prueba');
