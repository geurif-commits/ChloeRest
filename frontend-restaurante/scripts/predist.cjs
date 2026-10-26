// Prepara los archivos que electron-builder empaqueta como extraResources: el servidor compilado
// (ServidorPOS.exe/.cjs) y el .env de la instalación (sin APP_SESSION_SECRET: cada instalación genera
// el suyo). El instalador de PostgreSQL YA NO se empaqueta: pesaba ~376 MB y la mayoría de los
// arranques no lo necesitan (equipo con PostgreSQL ya instalado, o una actualización). main.cjs lo
// descarga bajo demanda solo si hace falta (ver POSTGRES_INSTALLER_URL).
const fs = require('fs');
const path = require('path');

const raiz = process.cwd();
const padre = path.resolve(raiz, '..');

const srcExe = path.resolve(padre, 'ServidorPOS.exe');
if (fs.existsSync(srcExe)) fs.copyFileSync(srcExe, path.resolve(raiz, 'ServidorPOS.exe'));

const srcCjs = path.resolve(padre, 'bundle.cjs');
if (fs.existsSync(srcCjs)) fs.copyFileSync(srcCjs, path.resolve(raiz, 'ServidorPOS.cjs'));

const srcEnv = path.resolve(padre, '.env.electron');
if (fs.existsSync(srcEnv)) {
  const contenido = fs
    .readFileSync(srcEnv, 'utf8')
    .split(/\r?\n/)
    .filter((linea) => !linea.startsWith('APP_SESSION_SECRET='))
    .join('\n');
  fs.writeFileSync(path.resolve(raiz, '.env'), contenido);
}
