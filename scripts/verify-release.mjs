import fs from 'node:fs';
import path from 'node:path';

/*
 * Verifica el release de escritorio ya construido (`npm run dist` en frontend-restaurante): que existan los artefactos de
 * la versión actual, que no estén vacíos, que el servidor empaquetado traiga el control de licencia y la última
 * migración, y que la ventana de Electron mantenga sus invariantes de seguridad.
 * (PostgreSQL ya no viaja dentro del instalador desde la 2.4.0: se descarga en el primer arranque si falta.)
 */
const root = path.resolve('frontend-restaurante', 'release');
const electronMain = fs.readFileSync(path.resolve('frontend-restaurante', 'main.cjs'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.resolve('frontend-restaurante', 'package.json'), 'utf8')).version;

const required = [
  `ChloeRestaurant Setup ${version}.exe`,
  'win-unpacked/ChloeRestaurant.exe',
  'win-unpacked/resources/ServidorPOS.exe',
  'win-unpacked/resources/ServidorPOS.cjs',
  'win-unpacked/resources/app.asar',
];

const missing = required.filter((relative) => !fs.existsSync(path.join(root, relative)));
if (missing.length) {
  throw new Error(`artefactos de release faltantes para la versión ${version}: ${missing.join(', ')}. Ejecuta "npm run dist" en frontend-restaurante.`);
}

const sizes = required.map((relative) => ({
  file: relative,
  bytes: fs.statSync(path.join(root, relative)).size,
}));
if (sizes.some(({ bytes }) => bytes === 0)) {
  throw new Error('hay artefactos de release vacíos');
}

// El servidor empaquetado debe ser el del código actual: control de licencia en cada acceso y la última migración.
const servidor = fs.readFileSync(path.join(root, 'win-unpacked', 'resources', 'ServidorPOS.exe'));
const ultimaMigracion = [...fs.readFileSync(path.resolve('src', 'db', 'migrations.ts'), 'utf8').matchAll(/id: '(\d{3}_[a-z0-9_]+)'/g)].pop()?.[1];
const enServidor = [
  ['control de licencia en cada acceso', servidor.includes('LICENCIA_REQUERIDA')],
  [`última migración (${ultimaMigracion})`, Boolean(ultimaMigracion) && servidor.includes(ultimaMigracion)],
  [`versión ${version}`, servidor.includes(`version: '${version}'`) || servidor.includes(`version: "${version}"`)],
];
const desactualizado = enServidor.filter(([, ok]) => !ok).map(([nombre]) => nombre);
if (desactualizado.length) {
  throw new Error(`el servidor empaquetado no corresponde al código actual (falta: ${desactualizado.join(', ')}). Vuelve a ejecutar "npm run dist".`);
}

const invariants = [
  ['ventana Electron oculta al inicio', /show:\s*false/.test(electronMain)],
  ['backend sin ventana Windows', /windowsHide:\s*true/.test(electronMain)],
  ['health check del backend (/api/health con la firma de ChloeRestaurant)', /function sondearBackend\(/.test(electronMain) && /\/api\/health/.test(electronMain)],
  ['Node aislado del renderer', /nodeIntegration:\s*false/.test(electronMain)],
  ['context isolation activo', /contextIsolation:\s*true/.test(electronMain)],
];
const incumplidas = invariants.filter(([, ok]) => !ok).map(([name]) => name);
if (incumplidas.length) throw new Error(`invariantes Electron incumplidas: ${incumplidas.join(', ')}`);

// Aviso (no error): un instalador sin PIN de propietario incrustado deja el panel del propietario en modo configurable.
const propietario = fs.readFileSync(path.resolve('src', 'lib', 'propietario.ts'), 'utf8');
if (/CREDENCIAL_PROPIETARIO: ICredencialPropietario \| null = null;/.test(propietario)) {
  console.warn('AVISO: no hay PIN de propietario incrustado (npm run propietario:pin); el instalador permitirá crear un PIN de propietario local.');
}

console.log(`Release ${version} OK: ${required.length} artefactos presentes y no vacíos; servidor empaquetado actualizado (${ultimaMigracion}).`);
