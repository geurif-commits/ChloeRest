const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow;
let splashWindow = null;
let backendProcess = null;
const BACKEND_HOST = '127.0.0.1';
// Puerto preferido. Si otra aplicación lo ocupa se usa el siguiente libre (hasta +10).
const BACKEND_PORT = 3000;
let puertoBackend = BACKEND_PORT;
const DB_HOST = 'localhost';
const DB_PORT = 5432;

// Mientras la app arranca no se cierra por "todas las ventanas cerradas".
let arrancando = true;
// true mientras la ventana muestra la pantalla de error de arranque (evita reintentos de carga y permite recuperarse solo).
let mostrandoError = false;
// Últimas líneas del servidor local, para explicar por qué no arrancó.
const ultimasLineasBackend = [];

// ── Registro (log) en la carpeta de datos del usuario ────────────────
// Sin esto, un fallo de arranque no deja rastro: la ventana está oculta hasta que la interfaz se monta.
let rutaLog = null;
function escribirEnLog(nivel, args) {
  try {
    if (!rutaLog) {
      rutaLog = path.join(app.getPath('userData'), 'main.log');
      fs.mkdirSync(path.dirname(rutaLog), { recursive: true });
      try {
        if (fs.statSync(rutaLog).size > 1024 * 1024) fs.writeFileSync(rutaLog, '');
      } catch { /* aún no existe */ }
    }
    const texto = args
      .map((a) => (typeof a === 'string' ? a : (a && a.stack) || JSON.stringify(a)))
      .join(' ');
    fs.appendFileSync(rutaLog, `[${new Date().toISOString()}] ${nivel.toUpperCase()} ${texto}\n`);
  } catch { /* el log es opcional */ }
}
for (const nivel of ['log', 'warn', 'error']) {
  const original = console[nivel].bind(console);
  console[nivel] = (...args) => {
    try { original(...args); } catch { /* sin consola */ }
    escribirEnLog(nivel, args);
  };
}

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Pantalla de arranque ─────────────────────────────────────────────
// Visible desde el primer segundo: la primera vez puede tardar minutos (instala la base de datos).
function htmlSplash(mensaje) {
  return `<!doctype html><meta charset="utf-8"><title>ChloeRestaurant</title>
<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0a1024;color:#f3f6ff;font-family:'Segoe UI',Arial,sans-serif;-webkit-app-region:drag;user-select:none">
<div style="font-size:26px;font-weight:800;letter-spacing:-.5px">ChloeRestaurant</div>
<div id="m" style="font-size:14px;color:#b9c4e6;text-align:center;max-width:340px;line-height:1.5">${escaparHtml(mensaje)}</div>
<div style="width:200px;height:4px;background:#1c2750;border-radius:2px;overflow:hidden"><div style="width:40%;height:100%;background:#ecbc4a;border-radius:2px;animation:m 1.3s ease-in-out infinite"></div></div>
<style>@keyframes m{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}</style></body>`;
}

function mostrarSplash(mensaje) {
  try {
    if (splashWindow && !splashWindow.isDestroyed()) {
      actualizarSplash(mensaje);
      return;
    }
    splashWindow = new BrowserWindow({
      width: 440,
      height: 260,
      frame: false,
      resizable: false,
      center: true,
      alwaysOnTop: true,
      backgroundColor: '#0a1024',
      title: 'ChloeRestaurant',
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlSplash(mensaje))}`);
    splashWindow.on('closed', () => { splashWindow = null; });
  } catch (error) {
    console.warn('No se pudo mostrar la pantalla de arranque:', error?.message || error);
  }
}

function actualizarSplash(mensaje) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(`document.getElementById('m').textContent = ${JSON.stringify(mensaje)}`)
    .catch(() => {});
}

function cerrarSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

// ── Pantalla de error de arranque ────────────────────────────────────
function htmlError(titulo, detalle) {
  return `<!doctype html><meta charset="utf-8"><title>ChloeRestaurant</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a1024;color:#f3f6ff;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:640px;padding:40px;display:flex;flex-direction:column;gap:16px">
<div style="font-size:15px;font-weight:700;letter-spacing:3px;color:#ecbc4a">CHLOERESTAURANT</div>
<h1 style="margin:0;font-size:30px;line-height:1.2">${escaparHtml(titulo)}</h1>
<pre style="margin:0;white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.6;color:#b9c4e6">${escaparHtml(detalle)}</pre>
<div style="font-size:13px;color:#8f9bc0">Registro técnico: ${escaparHtml(rutaLog || 'main.log')}</div>
<div style="display:flex;gap:12px;margin-top:8px">
<button onclick="window.electronPOS && window.electronPOS.reintentarInicio()" style="background:#ecbc4a;color:#2a1c02;border:none;border-radius:999px;padding:14px 28px;font-size:15px;font-weight:700;cursor:pointer">Reintentar</button>
<button onclick="window.electronPOS && window.electronPOS.cerrarVentana()" style="background:transparent;color:#f3f6ff;border:1px solid #2a3765;border-radius:999px;padding:14px 26px;font-size:15px;cursor:pointer">Cerrar</button>
</div></div></body>`;
}

function mostrarErrorInicio(titulo, detalle) {
  console.error(`Error de arranque: ${titulo} — ${detalle}`);
  mostrandoError = true;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlError(titulo, detalle))}`).catch(() => {});
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  cerrarSplash();
}

function readLocalEnvValue(name) {
  if (process.env[name]) return process.env[name];
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(process.resourcesPath || __dirname, '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return '';
}

// Nunca incrustar credenciales de PostgreSQL en el ejecutable. Las instalaciones antiguas usan la
// contraseña de la configuración privada empaquetada (herencia); las nuevas generan la suya.
const DB_PASSWORD_HEREDADA = readLocalEnvValue('POSTGRES_SUPER_PASSWORD') || readLocalEnvValue('DB_PASSWORD');

// ── Secretos propios de cada instalación ─────────────────────────────
// El instalador ya no impone el mismo secreto de sesión ni la misma contraseña de PostgreSQL a todos
// los clientes: se generan al primer arranque y se guardan en la carpeta de datos del usuario.
function secretoLocal(nombre, { crear = false } = {}) {
  const archivo = path.join(app.getPath('userData'), `${nombre}.secret`);
  try {
    const guardado = fs.readFileSync(archivo, 'utf8').trim();
    if (guardado.length >= 32) return guardado;
  } catch { /* todavía no existe */ }
  if (!crear) return '';
  const nuevo = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, nuevo, { mode: 0o600 });
  return nuevo;
}

// ¿Ya hay un PostgreSQL instalado en el equipo? Entonces se conserva su contraseña actual.
function postgresYaInstalado() {
  const base = process.env.ProgramFiles || 'C:\\Program Files';
  return fs.existsSync(path.join(base, 'PostgreSQL'));
}

// Contraseña para instalar PostgreSQL: propia en instalaciones nuevas; heredada si ya existía.
function contrasenaDeInstalacionPostgres() {
  if (postgresYaInstalado()) return DB_PASSWORD_HEREDADA;
  return secretoLocal('db', { crear: true });
}

// Variables que se inyectan al backend local (tienen prioridad sobre el .env empaquetado).
function entornoDelBackend() {
  const dbPassword = secretoLocal('db');
  return {
    ...process.env,
    APP_SESSION_SECRET: secretoLocal('session', { crear: true }),
    ...(dbPassword ? { DB_PASSWORD: dbPassword } : {}),
    // Respaldo diario de la base de datos en la carpeta de datos del usuario; el Administrador puede verlo y descargarlo.
    BACKUP_ENABLED: process.env.BACKUP_ENABLED || '1',
    BACKUP_DIR: process.env.BACKUP_DIR || path.join(app.getPath('userData'), 'respaldos'),
    BACKUP_TENANT_ACCESS: '1',
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkDatabase() {
  return new Promise((resolve) => {
    const socket = net.connect(DB_PORT, DB_HOST);
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function findPostgresInstaller() {
  const baseDir = getAppBaseDir();
  const candidates = [
    path.resolve(baseDir, 'postgresql-installer.exe'),
    path.resolve(baseDir, 'build', 'postgresql-installer.exe'),
    path.resolve(baseDir, 'resources', 'postgresql-installer.exe'),
    path.resolve(baseDir, 'resources', 'build', 'postgresql-installer.exe'),
    path.resolve(baseDir, '..', 'resources', 'postgresql-installer.exe'),
    path.resolve(baseDir, '..', 'resources', 'build', 'postgresql-installer.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function installPostgresSilently(installerPath, superPassword) {
  return new Promise((resolve) => {
    const args = [
      '--mode', 'unattended',
      '--unattendedmodeui', 'none',
      '--superaccount', 'postgres',
      '--superpassword', superPassword,
      '--serverport', String(DB_PORT),
      '--install_runtimes', '0',
      '--create_shortcuts', '0',
      '--enable-components', 'server,commandlinetools',
      '--debuglevel', '1',
    ];
    console.log('Instalando PostgreSQL por primera vez (proceso silencioso)...');
    const child = spawn(installerPath, args, { detached: false, stdio: 'ignore', windowsHide: true });
    child.on('exit', (code) => {
      console.log(`Instalador de PostgreSQL finalizó con código ${code}.`);
      resolve(code);
    });
    child.on('error', (err) => {
      console.error('No se pudo iniciar el instalador de PostgreSQL:', err.message);
      resolve(-1);
    });
  });
}

async function ensureDatabase() {
  if (await checkDatabase()) {
    console.log(`PostgreSQL disponible en ${DB_HOST}:${DB_PORT}.`);
    return;
  }
  const contrasenaInstalacion = contrasenaDeInstalacionPostgres();
  if (!contrasenaInstalacion) {
    console.warn('PostgreSQL no está disponible y no hay contraseña configurada para instalarlo.');
    return;
  }
  const installerPath = findPostgresInstaller();
  if (!installerPath) {
    console.warn('PostgreSQL no está disponible y no se encontró el instalador empaquetado.');
    return;
  }
  console.log('PostgreSQL no detectado en la PC. Ejecutando instalación automática...');
  actualizarSplash('Instalando la base de datos. Solo ocurre la primera vez y puede tardar varios minutos…');
  await installPostgresSilently(installerPath, contrasenaInstalacion);
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (await checkDatabase()) {
      console.log('PostgreSQL listo tras la instalación.');
      return;
    }
    await delay(2000);
  }
  console.warn('No se pudo verificar PostgreSQL tras la instalación automática.');
}

function getAppBaseDir() {
  return app.isPackaged ? process.resourcesPath : __dirname;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALIZACIÓN REMOTA: consulta el feed publicado en el servidor central y,
// si hay una versión más nueva, solicita al usuario instalarla. No requiere
// firma ni servidor de auto-update propio (electron-updater): usa el endpoint
// /api/app/version y abre el instalador publicado.
// ─────────────────────────────────────────────────────────────────────────────
const UPDATE_FEED_URL = readLocalEnvValue('UPDATE_FEED_URL') || 'https://chloerestaurant.lat/api/app/version';
let versionSaltada = null;
let checkInterval = null;

function rutaVersionSaltada() {
  try {
    return path.join(app.getPath('userData'), 'update-skip.json');
  } catch {
    return path.join(__dirname, 'update-skip.json');
  }
}

function cargarVersionSaltada() {
  try {
    const json = JSON.parse(fs.readFileSync(rutaVersionSaltada(), 'utf8'));
    return json && json.version ? String(json.version) : null;
  } catch {
    return null;
  }
}

function guardarVersionSaltada(version) {
  try {
    fs.writeFileSync(rutaVersionSaltada(), JSON.stringify({ version }));
  } catch {
    /* opcional */
  }
}

/** Compara versiones semánticas: >0 si a es mayor que b. */
function compararVersiones(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function consultarVersionRemota() {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(UPDATE_FEED_URL);
    } catch {
      return resolve(null);
    }
    const mod = url.protocol === 'https:' ? require('https') : require('http');
    const req = mod.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Consulta el feed y, si corresponde, avisa al usuario.
 * @param {boolean} interactivo  true si el usuario pidió la verificación a mano.
 */
async function checkForUpdates(interactivo = false) {
  const info = await consultarVersionRemota();
  const actual = app.getVersion();
  if (!info || !info.version) {
    if (interactivo) {
      return { disponible: false, actual, error: 'No se pudo consultar el servidor de actualizaciones.' };
    }
    return null;
  }

  const hayUpdate = compararVersiones(info.version, actual) > 0;
  if (!hayUpdate) {
    if (interactivo) {
      return { disponible: false, actual, version: info.version };
    }
    return null;
  }

  const resumen = {
    disponible: true,
    actual,
    version: info.version,
    downloadUrl: info.downloadUrl || '',
    notes: info.notes || '',
  };

  // Avisar a la interfaz (banner en la app).
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('actualizacion-disponible', resumen);
  }

  // No volver a molestar por una versión que el usuario decidió saltar.
  if (!interactivo && versionSaltada === info.version) {
    return resumen;
  }

  const puedeDescargar = Boolean(resumen.downloadUrl);
  const botones = puedeDescargar
    ? ['Actualizar ahora', 'Más tarde', 'Saltar esta versión']
    : ['Más tarde'];

  const mensaje =
    `Hay una nueva versión de ChloeRestaurant disponible.\n\n` +
    `Versión instalada: ${actual}\n` +
    `Versión nueva: ${resumen.version}` +
    (resumen.notes ? `\n\n${resumen.notes}` : '');

  const opciones = {
    type: 'info',
    buttons: botones,
    defaultId: 0,
    cancelId: puedeDescargar ? 1 : 0,
    title: 'Actualización disponible',
    message: 'Nueva actualización de ChloeRestaurant',
    detail: mensaje,
    noLink: true,
  };

  const { response } = (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible())
    ? await dialog.showMessageBox(mainWindow, opciones)
    : await dialog.showMessageBox(opciones);

  if (puedeDescargar && response === 0) {
    await shell.openExternal(resumen.downloadUrl);
  } else if (puedeDescargar && response === 2) {
    versionSaltada = resumen.version;
    guardarVersionSaltada(resumen.version);
  }

  return resumen;
}

function programarChequeoActualizaciones() {
  versionSaltada = cargarVersionSaltada();
  // Primer chequeo diferido (la ventana suele estar oculta al arrancar) y
  // repetición cada 6 horas mientras la app esté abierta.
  setTimeout(() => { void checkForUpdates(false); }, 20000);
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(() => { void checkForUpdates(false); }, 6 * 60 * 60 * 1000);
}

function findBackendLauncher() {
  const baseDir = getAppBaseDir();
  const resDir = process.resourcesPath || baseDir;
  const candidates = [
    path.resolve(baseDir, 'ServidorPOS.exe'),
    path.resolve(resDir, 'ServidorPOS.exe'),
    path.resolve(baseDir, '..', 'resources', 'ServidorPOS.exe'),
    path.resolve(baseDir, 'ServidorPOS.cjs'),
    path.resolve(resDir, 'ServidorPOS.cjs'),
    path.resolve(baseDir, '..', 'bundle.cjs'),
    path.resolve(baseDir, '..', 'ServidorPOS.cjs'),
    path.resolve(baseDir, 'server.js'),
    path.resolve(resDir, 'server.js'),
    path.resolve(baseDir, '..', 'server.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      if (candidate.toLowerCase().endsWith('.exe')) {
        return { type: 'exe', command: candidate, args: [], cwd: path.dirname(candidate) };
      }
      return { type: 'script', script: candidate, cwd: path.dirname(candidate) };
    }
  }
  return null;
}

/**
 * Qué hay en un puerto local:
 *  - 'chloe': responde /api/health con la firma de ChloeRestaurant (estado + baseDeDatos), aunque la base esté caída.
 *  - 'otro':  algo responde, pero NO es ChloeRestaurant (p. ej. otro servidor de desarrollo en el 3000).
 *  - 'libre': nadie escucha (conexión rechazada).
 * Antes bastaba un HTTP 200: cualquier otra aplicación en el 3000 hacía creer que el servidor ya estaba iniciado,
 * nunca se arrancaba el propio y la ventana quedaba oculta.
 */
function sondearBackend(port, timeout = 2500) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: BACKEND_HOST,
      port,
      path: '/api/health',
      method: 'GET',
      timeout,
    }, (res) => {
      let cuerpo = '';
      res.setEncoding('utf8');
      res.on('data', (trozo) => { if (cuerpo.length < 4096) cuerpo += trozo; });
      res.on('end', () => {
        try {
          const json = JSON.parse(cuerpo);
          const esNuestro = json && (json.estado === 'ok' || json.estado === 'error') && typeof json.baseDeDatos === 'string';
          resolve(esNuestro ? 'chloe' : 'otro');
        } catch {
          resolve('otro');
        }
      });
    });
    req.on('error', (error) => resolve(error && error.code === 'ECONNREFUSED' ? 'libre' : 'otro'));
    req.on('timeout', () => {
      req.destroy();
      resolve('otro');
    });
    req.end();
  });
}

/** Elige el puerto del servidor local: el preferido si es nuestro o está libre; si no, el siguiente disponible. */
async function elegirPuertoBackend() {
  for (let puerto = BACKEND_PORT; puerto <= BACKEND_PORT + 10; puerto += 1) {
    const estado = await sondearBackend(puerto);
    if (estado === 'chloe' || estado === 'libre') return { puerto, estado };
    console.warn(`El puerto ${puerto} está ocupado por otra aplicación; se prueba el siguiente.`);
  }
  return null;
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    try {
      backendProcess.kill();
    } catch (error) {
      console.warn('No se pudo detener el backend automáticamente:', error?.message || error);
    }
    backendProcess = null;
  }
}

/** Arranca el servidor local en `puertoBackend` si aún no hay uno de ChloeRestaurant. Devuelve true si quedó listo. */
async function startBackendIfNeeded() {
  if ((await sondearBackend(puertoBackend)) === 'chloe') {
    console.log(`Backend POS ya está en ejecución en http://${BACKEND_HOST}:${puertoBackend}`);
    return true;
  }

  const launcher = findBackendLauncher();
  if (!launcher) {
    console.warn('No se encontró ServidorPOS.exe ni server.js para iniciar el backend automáticamente.');
    return false;
  }

  // PORT explícito: tiene prioridad sobre el .env empaquetado (que dice 3000).
  const entorno = { ...entornoDelBackend(), PORT: String(puertoBackend) };
  ultimasLineasBackend.length = 0;

  if (launcher.type === 'exe') {
    console.log(`Iniciando backend POS con ${launcher.command} en el puerto ${puertoBackend}`);
    backendProcess = spawn(launcher.command, launcher.args, {
      cwd: launcher.cwd,
      detached: false,
      env: entorno,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    console.log(`Iniciando backend POS (script) con ${launcher.script} en el puerto ${puertoBackend}`);
    backendProcess = spawn(process.execPath, [launcher.script], {
      cwd: launcher.cwd,
      detached: false,
      env: { ...entorno, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  const recordar = (texto) => {
    for (const linea of texto.split(/\r?\n/)) {
      if (!linea.trim()) continue;
      ultimasLineasBackend.push(linea.trim().slice(0, 300));
      if (ultimasLineasBackend.length > 30) ultimasLineasBackend.shift();
    }
  };

  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        console.log(`[backend] ${text}`);
        recordar(text);
      }
    });
  }

  if (backendProcess.stderr) {
    backendProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(`[backend] ${text}`);
        recordar(text);
      }
    });
  }

  backendProcess.on('error', (error) => {
    console.error('No se pudo ejecutar el servidor local:', error?.message || error);
    recordar(`No se pudo ejecutar el servidor local: ${error?.message || error}`);
    backendProcess = null;
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend POS finalizó con código ${code} y señal ${signal}`);
    recordar(`El servidor local terminó (código ${code}).`);
    backendProcess = null;
  });

  const attempts = 60;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if ((await sondearBackend(puertoBackend)) === 'chloe') {
      console.log('Backend POS arrancó correctamente.');
      return true;
    }
    // Si el servidor ya se cayó no tiene sentido esperar el resto del tiempo.
    if (!backendProcess) break;
    await delay(500);
  }

  console.warn(`No se pudo verificar el backend POS en el puerto ${puertoBackend}.`);
  return false;
}

/** Texto para la pantalla de error cuando el servidor local no arrancó. */
function diagnosticoBackend() {
  const cola = ultimasLineasBackend.slice(-8).join('\n');
  return (
    'El servidor local de ChloeRestaurant no pudo iniciar.\n\n' +
    'Causas frecuentes: la base de datos (PostgreSQL) no está disponible o su contraseña no coincide, ' +
    'o un antivirus bloqueó ServidorPOS.exe.\n' +
    (cola ? `\nÚltimos mensajes del servidor:\n${cola}` : '')
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'ChloeRestaurant',
    frame: false,
    fullscreen: true,
    backgroundColor: '#07090f',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    autoHideMenuBar: true
  });

  // Ventana se mantiene oculta hasta que se solicite explícitamente (ipcMain.on('mostrar-ventana'))
  // mainWindow.once('ready-to-show', ...) eliminado intencionalmente para arranque silencioso

  // Reactivación del foco tras diálogos nativos
  ipcMain.on('reenfocar-ventana', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      mainWindow.webContents.focus();
    }
  });

  // Salir del sistema completo
  ipcMain.on('salir-sistema', () => {
    stopBackend();
    app.quit();
  });

  // Controles de ventana
  ipcMain.on('ventana-minimizar', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.on('ventana-maximizar', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
  });
  ipcMain.on('ventana-cerrar', () => {
    try {
      stopBackend();
    } catch (error) {
      console.warn('No se pudo detener el backend al cerrar la ventana:', error?.message || error);
    }
    app.quit();
  });
  ipcMain.handle('ventana-esta-maximizada', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

  // Mostrar ventana bajo demanda (para arranque silencioso)
  ipcMain.handle('mostrar-ventana', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
    cerrarSplash();
    return { ok: true };
  });

  // Desde la pantalla de error: volver a intentar el arranque desde cero.
  ipcMain.on('reintentar-inicio', () => {
    stopBackend();
    app.relaunch();
    app.exit(0);
  });

  // Abrir link de pasarela de pago en el navegador predeterminado
  ipcMain.handle('abrir-link-pago', async (_event, url) => {
    try {
      if (!url) return { exito: false, error: 'Sin URL' };
      await require('electron').shell.openExternal(url);
      return { exito: true };
    } catch (error) {
      console.error('Error abriendo link de pago:', error);
      return { exito: false, error: error.message };
    }
  });

  // Verificación de actualización solicitada desde la interfaz.
  ipcMain.handle('verificar-actualizacion', async () => {
    try {
      const resumen = await checkForUpdates(true);
      return resumen || { disponible: false, actual: app.getVersion() };
    } catch (error) {
      return { disponible: false, actual: app.getVersion(), error: error?.message || String(error) };
    }
  });

  // Abrir la descarga del instalador publicado.
  ipcMain.handle('abrir-descarga-actualizacion', async (_event, url) => {
    try {
      if (!url) return { exito: false, error: 'Sin URL' };
      await shell.openExternal(url);
      return { exito: true };
    } catch (error) {
      return { exito: false, error: error?.message || String(error) };
    }
  });

  // Exportar ticket/factura a PDF
  ipcMain.handle('exportar-pdf', async (_event, { nombre }) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { exito: false, error: 'Ventana no disponible' };
      }
      const { dialog } = require('electron');
      const resultado = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar PDF',
        defaultPath: path.join(require('os').homedir(), 'Documents', nombre || `ticket_${Date.now()}.pdf`),
        filters: [
          { name: 'Archivos PDF', extensions: ['pdf'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ]
      });
      if (resultado.canceled || !resultado.filePath) {
        return { exito: false, cancelado: true };
      }
      const pdfBuffer = await mainWindow.webContents.printToPDF({
        marginsType: 1,
        pageSize: 'A4',
        printBackground: true,
        printSelectionOnly: false,
        landscape: false,
      });
      fs.writeFileSync(resultado.filePath, pdfBuffer);
      return { exito: true, ruta: resultado.filePath };
    } catch (error) {
      console.error('Error generando PDF:', error);
      return { exito: false, error: error.message };
    }
  });

  ipcMain.handle('listar-impresoras', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return [];
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((printer) => ({ name: printer.name, displayName: printer.displayName || printer.name, status: printer.status }));
  });

  ipcMain.handle('imprimir-html', async (_event, { html, impresora, ancho = 80 }) => {
    if (!html) return { exito: false, error: 'Contenido de impresión vacío.' };
    const printWindow = new BrowserWindow({ show: false, width: 420, height: 800, webPreferences: { sandbox: true } });
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const printers = await mainWindow.webContents.getPrintersAsync();
      const selected = printers.find((printer) => printer.name === impresora || printer.displayName === impresora);
      if (!selected) return { exito: false, error: 'La impresora seleccionada no está disponible.' };
      await new Promise((resolve, reject) => printWindow.webContents.print({ silent: true, deviceName: selected.name, printBackground: true, pageSize: { width: Number(ancho) * 1000, height: 297000 }, margins: { marginType: 'none' } }, (ok, errorType) => ok ? resolve() : reject(new Error(errorType || 'No se pudo imprimir.'))));
      return { exito: true, impresora: selected.name };
    } catch (error) {
      return { exito: false, error: error.message };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
    }
  });

  Menu.setApplicationMenu(null);

  // Localizar archivo dist/index.html empaquetado para fallback seguro
  const candidateDistFiles = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(process.resourcesPath || __dirname, 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
  ];
  let localHtmlPath = null;
  for (const p of candidateDistFiles) {
    if (fs.existsSync(p)) {
      localHtmlPath = p;
      break;
    }
  }

  const appUrl = `http://${BACKEND_HOST}:${puertoBackend}`;
  let retryCount = 0;

  mainWindow.loadURL(appUrl).catch(() => {
    if (localHtmlPath && !mostrandoError) {
      mainWindow.loadFile(localHtmlPath);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (errorCode === -3) return; // ERR_ABORTED
    if (mostrandoError) return;
    console.warn(`Intento de carga en ${appUrl} (${errorCode}): ${errorDescription}`);

    if (localHtmlPath && retryCount >= 2) {
      console.log('Cargando fallback local dist/index.html...');
      mainWindow.loadFile(localHtmlPath);
    } else {
      retryCount += 1;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(appUrl).catch(() => {
            if (localHtmlPath) mainWindow.loadFile(localHtmlPath);
          });
        }
      }, 1200);
    }
  });

  // did-finish-load ya no muestra la ventana automáticamente; se muestra bajo demanda
  // mainWindow.webContents.on('did-finish-load', ...) eliminado intencionalmente

  // Reenganche: si la ventana quedó en el fallback local (file://) y el
  // backend levanta después, se recarga hacia el servidor automáticamente
  // para que el login y el resto del POS vuelvan a funcionar sin reiniciar.
  const reenganche = setInterval(async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        clearInterval(reenganche);
        return;
      }
      const urlActual = mainWindow.webContents.getURL();
      // Solo se reengancha desde el fallback local (file:) o desde la pantalla de error (data:).
      if (!urlActual.startsWith('file:') && !urlActual.startsWith('data:')) return;
      if ((await sondearBackend(puertoBackend)) === 'chloe') {
        console.log('Backend disponible: recargando hacia el servidor...');
        mostrandoError = false;
        await mainWindow.loadURL(appUrl);
      }
    } catch {
      // reintentar en el próximo ciclo
    }
  }, 5000);

  // Red de seguridad: si la interfaz no se mostró en 30 s (servidor caído, página que no carga, error al
  // montar), la ventana no puede seguir oculta sin explicación.
  const vigilante = setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible() || mostrandoError) return;
    if ((await sondearBackend(puertoBackend)) !== 'chloe') {
      mostrarErrorInicio('No se pudo iniciar ChloeRestaurant', diagnosticoBackend());
      return;
    }
    console.warn('La interfaz no se mostró a tiempo; se muestra la ventana de todos modos.');
    mainWindow.show();
    mainWindow.focus();
    cerrarSplash();
  }, 30000);

  mainWindow.on('closed', () => {
    clearInterval(reenganche);
    clearTimeout(vigilante);
    mainWindow = null;
  });

  arrancando = false;
}

// Una sola instancia: abrir la app varias veces (p. ej. porque la primera tarda) no apila procesos ni servidores.
const esInstanciaUnica = app.requestSingleInstanceLock();
if (!esInstanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    console.log(`ChloeRestaurant ${app.getVersion()} iniciando (${process.platform} ${process.arch}).`);
    mostrarSplash('Iniciando ChloeRestaurant…');
    try {
      await ensureDatabase();
    } catch (error) {
      console.error('Error asegurando PostgreSQL:', error?.message || error);
    }

    actualizarSplash('Iniciando el servidor local…');
    const eleccion = await elegirPuertoBackend();
    if (!eleccion) {
      createWindow();
      mostrarErrorInicio(
        'No hay un puerto libre para el servidor local',
        `Otras aplicaciones ocupan los puertos ${BACKEND_PORT} a ${BACKEND_PORT + 10}. Ciérralas o reinicia el equipo y vuelve a intentar.`
      );
      return;
    }
    puertoBackend = eleccion.puerto;
    if (puertoBackend !== BACKEND_PORT) {
      console.warn(`El puerto ${BACKEND_PORT} lo usa otra aplicación: ChloeRestaurant usará el ${puertoBackend}. ` +
        `Los demás equipos de la red deben conectarse a ese puerto.`);
    }

    let listo = false;
    try {
      listo = await startBackendIfNeeded();
    } catch (error) {
      console.error('Error iniciando el backend POS:', error?.message || error);
    }
    createWindow();
    if (!listo) {
      mostrarErrorInicio('No se pudo iniciar ChloeRestaurant', diagnosticoBackend());
    }
    programarChequeoActualizaciones();
  });
}

app.on('window-all-closed', () => {
  if (arrancando) return;
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
