/**
 * Orquesta la grabación completa: reinicia el entorno de prueba, crea el negocio ChloeRestaurant (admin PIN 000000),
 * deja listo el personal que no se crea en cámara y graba el guion.
 *   node correr.mjs [--hasta=N] [--rapido] [--sin-reset]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { sesion, crearPersonal, usarDispositivo } from './prelude.mjs';
import { correr } from './guion.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: RAIZ, shell: true, encoding: 'utf8' });

if (!process.argv.includes('--sin-reset')) {
  console.log('Reiniciando el entorno de prueba…');
  sh('npm', ['run', 'entorno:prueba:detener', '--', '--borrar']);
  const r = sh('npm', ['run', 'entorno:prueba', '--', ...(process.argv.includes('--sin-build') ? ['--sin-build'] : [])]);
  if (r.status !== 0) { console.log(r.stdout, r.stderr); process.exit(1); }
  const prep = sh('npx', ['tsx', 'marketing/video/preparar.mjs']);
  console.log(prep.stdout.trim() || prep.stderr.trim());
  const admin = await sesion('000000');
  // el resto del equipo ya existe; Rosa, Juan y Pedro se crean en cámara
  await crearPersonal(admin, [
    { nombre: 'María Santana', rol: 'Camarero', pin: '529184' },
    { nombre: 'Carlos Rodríguez', rol: 'Camarero', pin: '746315' },
    { nombre: 'Ana Lantigua', rol: 'Camarero', pin: '853962' },
    { nombre: 'Luis Almonte', rol: 'Capitán de Camareros', pin: '267491' },
    { nombre: 'Miguel Ureña', rol: 'Bar', pin: '372958' },
  ]);
}
// segundo equipo (como otra tablet) para las operaciones automáticas
const estado = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'chloe-entorno-prueba', 'estado.json'), 'utf8'));
const act = await fetch('http://127.0.0.1:3100/api/dispositivo/activar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deviceId: 'prueba-api-0001', clave: estado.licencia.clave }),
});
console.log('equipo de apoyo:', act.status);
usarDispositivo('prueba-api-0001');
await correr();
