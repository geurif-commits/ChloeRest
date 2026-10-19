import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const bundle = path.join(root, 'bundle.cjs');
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_SESSION_SECRET: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_NAME: 'chloerest_config_probe',
  DB_USER: 'chloerest_app',
  DB_PASSWORD: 'invalid-config-probe',
};

const child = spawn(process.execPath, [bundle], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

const exitCode = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error('El bundle no rechazó la configuración insegura dentro del tiempo esperado.'));
  }, 10000);
  child.once('error', reject);
  child.once('exit', (code) => {
    clearTimeout(timer);
    resolve(code ?? 0);
  });
});

if (exitCode === 0 || !output.includes('CONFIG_PRODUCCION_INVALIDA')) {
  throw new Error(`El guard de producción no se activó. exit=${exitCode}\n${output}`);
}

console.log('Production config guard OK: APP_SESSION_SECRET vacío bloquea el arranque.');
