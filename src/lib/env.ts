/**
 * @file Carga del archivo .env (buscando hacia arriba desde cwd), sin
 * depender de dotenv. Puerto directo del loader de config.js.
 *
 * IMPORTANTE: la carga se ejecuta como efecto de módulo (loadEnv() al final)
 * para que baste con importar './lib/env.js' como PRIMER import del entrypoint
 * (server.ts). ESM evalúa los módulos importados en orden DFS: si la carga
 * ocurriera en el cuerpo de server.ts, config.ts (import estático) ya habría
 * leído process.env sin el .env cargado.
 */

import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {return;}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {continue;}
    const separator = line.indexOf('=');
    if (separator === -1) {continue;}
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {process.env[key] = value;}
  }
}

function findEnvFile(startDir: string): string | null {
  let current = startDir;
  const root = path.parse(current).root;
  while (true) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate)) {return candidate;}
    if (current === root) {break;}
    current = path.dirname(current);
  }
  return null;
}

export function loadEnv(): void {
  const dotenvPath = findEnvFile(process.cwd());
  if (dotenvPath) {loadEnvFile(dotenvPath);}
}

// Efecto de módulo: cualquier entrypoint que importe ./lib/env.js primero
// obtiene el .env cargado antes de que se evalúen los demás módulos.
loadEnv();
