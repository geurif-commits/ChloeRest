import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('frontend-restaurante', 'release');
const electronMain = fs.readFileSync(path.resolve('frontend-restaurante', 'main.cjs'), 'utf8');
const required = [
  'ChloeRestaurant Setup 2.1.0.exe',
  'win-unpacked/ChloeRestaurant.exe',
  'win-unpacked/resources/ServidorPOS.exe',
  'win-unpacked/resources/ServidorPOS.cjs',
  'win-unpacked/resources/build/postgresql-installer.exe',
  'builder-effective-config.yaml',
];

const missing = required.filter((relative) => !fs.existsSync(path.join(root, relative)));
if (missing.length) {
  throw new Error(`artefactos de release faltantes: ${missing.join(', ')}`);
}

const sizes = required.map((relative) => ({
  file: relative,
  bytes: fs.statSync(path.join(root, relative)).size,
}));
if (sizes.some(({ bytes }) => bytes === 0)) {
  throw new Error('hay artefactos de release vacíos');
}

const invariants = [
  ['ventana Electron oculta al inicio', /show:\s*false/.test(electronMain)],
  ['backend sin ventana Windows', /windowsHide:\s*true/.test(electronMain)],
  ['health check del backend', /checkBackendHealth\(\)/.test(electronMain)],
  ['Node aislado del renderer', /nodeIntegration:\s*false/.test(electronMain)],
  ['context isolation activo', /contextIsolation:\s*true/.test(electronMain)],
];
const incumplidas = invariants.filter(([, ok]) => !ok).map(([name]) => name);
if (incumplidas.length) throw new Error(`invariantes Electron incumplidas: ${incumplidas.join(', ')}`);

console.log(`Release OK: ${required.length} artefactos presentes y no vacíos`);
