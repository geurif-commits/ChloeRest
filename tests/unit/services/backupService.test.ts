import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  copiarRespaldo,
  depurarRespaldos,
  esNombreDeRespaldo,
  listarRespaldos,
  msHastaProximaEjecucion,
  nombreDeRespaldo,
} from '../../../src/services/backupService.js';

const DIA = 24 * 3600 * 1000;
let dir: string;

function crear(nombre: string, hace: number): void {
  const archivo = path.join(dir, nombre);
  fs.writeFileSync(archivo, 'x');
  const fecha = new Date(Date.now() - hace * DIA);
  fs.utimesSync(archivo, fecha, fecha);
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldos-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('nombres de respaldo', () => {
  it('genera chloerest_AAAAMMDD_HHMMSS.dump con la hora local', () => {
    expect(nombreDeRespaldo(new Date(2026, 8, 5, 3, 7, 9))).toBe('chloerest_20260905_030709.dump');
  });

  it('solo acepta nombres propios (evita rutas y archivos ajenos)', () => {
    expect(esNombreDeRespaldo('chloerest_20260905_030709.dump')).toBe(true);
    for (const malo of ['../secreto.dump', 'chloerest_2026_1.dump', 'chloerest_20260905_030709.dump.parcial', 'otro.dump', 'chloerest_20260905_030709.sql', '']) {
      expect(esNombreDeRespaldo(malo)).toBe(false);
    }
  });
});

describe('listar y depurar', () => {
  it('lista solo respaldos válidos, del más reciente al más antiguo', () => {
    crear('chloerest_20260101_010101.dump', 30);
    crear('chloerest_20260301_010101.dump', 1);
    crear('otro.txt', 1);
    crear('chloerest_20260301_010101.dump.parcial', 1);
    expect(listarRespaldos(dir).map((r) => r.nombre)).toEqual(['chloerest_20260301_010101.dump', 'chloerest_20260101_010101.dump']);
    expect(listarRespaldos(path.join(dir, 'no-existe'))).toEqual([]);
  });

  it('elimina los que superan la retención pero conserva siempre los 3 más recientes', () => {
    crear('chloerest_20260101_000001.dump', 40);
    crear('chloerest_20260102_000001.dump', 35);
    crear('chloerest_20260103_000001.dump', 30);
    crear('chloerest_20260104_000001.dump', 20);
    crear('chloerest_20260105_000001.dump', 3);
    crear('chloerest_20260106_000001.dump', 1);
    const eliminados = depurarRespaldos(dir, 14);
    expect(eliminados.sort()).toEqual(['chloerest_20260101_000001.dump', 'chloerest_20260102_000001.dump', 'chloerest_20260103_000001.dump']);
    expect(listarRespaldos(dir)).toHaveLength(3);
  });

  it('nunca vacía la carpeta aunque todos sean antiguos (reloj mal puesto)', () => {
    for (let i = 1; i <= 5; i += 1) { crear(`chloerest_2025010${i}_000001.dump`, 400 + i); }
    depurarRespaldos(dir, 14);
    expect(listarRespaldos(dir)).toHaveLength(3);
  });
});

describe('copia a otra carpeta', () => {
  it('copia el respaldo, deja el original y no deja archivos parciales', () => {
    crear('chloerest_20260301_010101.dump', 0);
    const otra = path.join(dir, 'usb', 'respaldos');
    expect(copiarRespaldo(path.join(dir, 'chloerest_20260301_010101.dump'), otra, 14)).toBe('ok');
    expect(fs.readdirSync(otra)).toEqual(['chloerest_20260301_010101.dump']);
    expect(fs.readFileSync(path.join(otra, 'chloerest_20260301_010101.dump'), 'utf8')).toBe('x');
    expect(fs.existsSync(path.join(dir, 'chloerest_20260301_010101.dump'))).toBe(true);
  });

  it('aplica la retención en la carpeta de destino, conservando los 3 más recientes', () => {
    const otra = path.join(dir, 'nube');
    fs.mkdirSync(otra);
    for (let i = 1; i <= 4; i += 1) {
      const archivo = path.join(otra, `chloerest_2026010${i}_000001.dump`);
      fs.writeFileSync(archivo, 'x');
      const vieja = new Date(Date.now() - (60 - i) * DIA);
      fs.utimesSync(archivo, vieja, vieja);
    }
    crear('chloerest_20260301_010101.dump', 0);
    expect(copiarRespaldo(path.join(dir, 'chloerest_20260301_010101.dump'), otra, 14)).toBe('ok');
    expect(listarRespaldos(otra)).toHaveLength(3);
    expect(listarRespaldos(otra)[0].nombre).toBe('chloerest_20260301_010101.dump');
  });

  it('avisa con "fallida" (sin lanzar) si el destino no es utilizable', () => {
    crear('chloerest_20260301_010101.dump', 0);
    const ocupado = path.join(dir, 'archivo-normal');
    fs.writeFileSync(ocupado, 'no soy una carpeta');
    expect(copiarRespaldo(path.join(dir, 'chloerest_20260301_010101.dump'), path.join(ocupado, 'dentro'), 14)).toBe('fallida');
  });
});

describe('msHastaProximaEjecucion', () => {
  it('programa para hoy si la hora aún no llegó', () => {
    const ahora = new Date(2026, 8, 5, 1, 0, 0);
    expect(msHastaProximaEjecucion(3, ahora)).toBe(2 * 3600 * 1000);
  });

  it('programa para mañana si la hora ya pasó (o es exactamente ahora)', () => {
    const ahora = new Date(2026, 8, 5, 3, 0, 0);
    expect(msHastaProximaEjecucion(3, ahora)).toBe(24 * 3600 * 1000);
    expect(msHastaProximaEjecucion(2, new Date(2026, 8, 5, 4, 0, 0))).toBe(22 * 3600 * 1000);
  });
});
