const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess = null;
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 3000;
const DB_HOST = 'localhost';
const DB_PORT = 5432;
const DB_SUPER_PASSWORD = '012011';

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

function installPostgresSilently(installerPath) {
  return new Promise((resolve) => {
    const args = [
      '--mode', 'unattended',
      '--unattendedmodeui', 'none',
      '--superaccount', 'postgres',
      '--superpassword', DB_SUPER_PASSWORD,
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
  const installerPath = findPostgresInstaller();
  if (!installerPath) {
    console.warn('PostgreSQL no está disponible y no se encontró el instalador empaquetado.');
    return;
  }
  console.log('PostgreSQL no detectado en la PC. Ejecutando instalación automática...');
  await installPostgresSilently(installerPath);
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

function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/health',
      method: 'GET',
      timeout: 1500,
    }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
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

async function startBackendIfNeeded() {
  const running = await checkBackendHealth();
  if (running) {
    console.log(`Backend POS ya está en ejecución en http://${BACKEND_HOST}:${BACKEND_PORT}`);
    return;
  }

  const launcher = findBackendLauncher();
  if (!launcher) {
    console.warn('No se encontró ServidorPOS.exe ni server.js para iniciar el backend automáticamente.');
    return;
  }

  if (launcher.type === 'exe') {
    console.log(`Iniciando backend POS con ${launcher.command}`);
    backendProcess = spawn(launcher.command, launcher.args, {
      cwd: launcher.cwd,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    console.log(`Iniciando backend POS (script) con ${launcher.script}`);
    backendProcess = spawn(process.execPath, [launcher.script], {
      cwd: launcher.cwd,
      detached: false,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[backend] ${text}`);
    });
  }

  if (backendProcess.stderr) {
    backendProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[backend] ${text}`);
    });
  }

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend POS finalizó con código ${code} y señal ${signal}`);
    backendProcess = null;
  });

  const attempts = 15;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const healthy = await checkBackendHealth();
    if (healthy) {
      console.log('Backend POS arrancó correctamente.');
      return;
    }
    await delay(500);
  }

  console.warn('No se pudo verificar el backend POS en el puerto 3000 después de varios intentos.');
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
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    autoHideMenuBar: true
  });

  // Mostrar la ventana solo cuando esté lista para renderizar (evita pantalla blanca)
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

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

  const appUrl = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
  let retryCount = 0;

  mainWindow.loadURL(appUrl).catch(() => {
    if (localHtmlPath) {
      mainWindow.loadFile(localHtmlPath);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (errorCode === -3) return; // ERR_ABORTED
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await ensureDatabase();
  } catch (error) {
    console.error('Error asegurando PostgreSQL:', error?.message || error);
  }
  try {
    await startBackendIfNeeded();
  } catch (error) {
    console.error('Error iniciando el backend POS:', error?.message || error);
  }
  createWindow();
});

app.on('window-all-closed', () => {
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
