/**
 * @file Respaldos automáticos de la base de datos (pg_dump en formato custom).
 *
 * - Un respaldo por día a la hora BACKUP_HOUR (por defecto 03:00) y uno al arrancar si el último tiene
 *   más de 24 h. Cada archivo se verifica con `pg_restore --list` antes de darlo por bueno.
 * - Se conservan los últimos BACKUP_RETENTION_DAYS días (por defecto 14) y, como mínimo, los 3 más recientes.
 * - Las tablas de negocio tienen RLS forzado: el rol que respalda debe ser superusuario o tener BYPASSRLS
 *   (BACKUP_DB_USER / BACKUP_DB_PASSWORD). Si no puede leer todas las filas, pg_dump falla en voz alta.
 * - `npm run backup` crea uno ahora; `npm run backup:verify` lo restaura en una base temporal y lo comprueba.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { config } from '../lib/config.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('backup');

const EXPRESION_NOMBRE = /^chloerest_\d{8}_\d{6}\.dump$/;
const MINIMO_A_CONSERVAR = 3;

export interface IRespaldo {
  nombre: string;
  bytes: number;
  creado: string;
}

export type IRespaldoVerificado = IRespaldo & { verificado: boolean };

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/** chloerest_AAAAMMDD_HHMMSS.dump (hora local del servidor). */
export function nombreDeRespaldo(fecha: Date = new Date()): string {
  const dia = `${fecha.getFullYear()}${dosDigitos(fecha.getMonth() + 1)}${dosDigitos(fecha.getDate())}`;
  const hora = `${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}${dosDigitos(fecha.getSeconds())}`;
  return `chloerest_${dia}_${hora}.dump`;
}

/** Solo estos nombres se listan, se descargan o se depuran (evita salir de la carpeta de respaldos). */
export function esNombreDeRespaldo(nombre: string): boolean {
  return EXPRESION_NOMBRE.test(nombre);
}

/** Respaldos de la carpeta, del más reciente al más antiguo. */
export function listarRespaldos(dir: string): IRespaldo[] {
  if (!fs.existsSync(dir)) {return [];}
  return fs
    .readdirSync(dir)
    .filter(esNombreDeRespaldo)
    .map((nombre) => {
      const stat = fs.statSync(path.join(dir, nombre));
      return { nombre, bytes: stat.size, creado: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.nombre < b.nombre ? 1 : -1));
}

/**
 * Borra los respaldos con más de `retencionDias` días, conservando siempre los más recientes
 * (así un reloj mal puesto nunca vacía la carpeta). Devuelve los nombres eliminados.
 */
export function depurarRespaldos(dir: string, retencionDias: number, ahora: number = Date.now()): string[] {
  const limite = ahora - retencionDias * 24 * 3600 * 1000;
  const eliminados: string[] = [];
  listarRespaldos(dir).forEach((respaldo, indice) => {
    if (indice < MINIMO_A_CONSERVAR) {return;}
    if (new Date(respaldo.creado).getTime() < limite) {
      fs.unlinkSync(path.join(dir, respaldo.nombre));
      eliminados.push(respaldo.nombre);
    }
  });
  return eliminados;
}

/** Milisegundos hasta la próxima ejecución diaria a la hora indicada (0–23). */
export function msHastaProximaEjecucion(hora: number, ahora: Date = new Date()): number {
  const proxima = new Date(ahora);
  proxima.setHours(hora, 0, 0, 0);
  if (proxima.getTime() <= ahora.getTime()) {proxima.setDate(proxima.getDate() + 1);}
  return proxima.getTime() - ahora.getTime();
}

/** Busca pg_dump / pg_restore: PG_BIN_DIR, luego la instalación de PostgreSQL más nueva, luego el PATH. */
export function localizarHerramienta(nombre: 'pg_dump' | 'pg_restore' | 'psql'): string | null {
  const ejecutable = process.platform === 'win32' ? `${nombre}.exe` : nombre;
  const candidatos: string[] = [];
  if (config.backup.pgBinDir) {candidatos.push(path.join(config.backup.pgBinDir, ejecutable));}

  const raicesPg = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL')]
    : ['/usr/lib/postgresql', '/opt/homebrew/opt'];
  for (const raiz of raicesPg) {
    if (!fs.existsSync(raiz)) {continue;}
    const versiones = fs
      .readdirSync(raiz)
      .filter((v) => /^(postgresql@)?\d+/.test(v))
      .sort((a, b) => parseFloat(b.replace(/\D+/, '')) - parseFloat(a.replace(/\D+/, '')));
    for (const version of versiones) {candidatos.push(path.join(raiz, version, 'bin', ejecutable));}
  }
  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) {return candidato;}
  }
  // En el PATH (Linux/macOS o Windows con PostgreSQL agregado al PATH).
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, ejecutable))) {return path.join(dir, ejecutable);}
  }
  return null;
}

interface IConexionRespaldo {
  host: string;
  puerto: string;
  base: string;
  usuario: string;
  password: string | undefined;
}

/** Conexión con la que se respalda: BACKUP_DB_* si existen (rol con BYPASSRLS), si no las de la aplicación. */
export function conexionDeRespaldo(): IConexionRespaldo {
  return {
    host: process.env.DB_HOST || 'localhost',
    puerto: String(process.env.DB_PORT || 5432),
    base: process.env.DB_NAME || 'postgres',
    usuario: process.env.BACKUP_DB_USER || process.env.DB_USER || 'postgres',
    password: process.env.BACKUP_DB_PASSWORD || process.env.DB_PASSWORD || undefined,
  };
}

export function ejecutar(comando: string, argumentos: string[], password?: string): Promise<{ codigo: number | null; salida: string; error: string }> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, argumentos, {
      env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) },
      windowsHide: true,
    });
    let salida = '';
    let error = '';
    proceso.stdout.on('data', (trozo: Buffer) => { salida += trozo.toString(); });
    proceso.stderr.on('data', (trozo: Buffer) => { error += trozo.toString(); });
    proceso.on('error', reject);
    proceso.on('close', (codigo) => resolve({ codigo, salida, error }));
  });
}

/** Un respaldo es válido si pg_restore puede leer su tabla de contenido y hay datos de tablas. */
export async function verificarRespaldo(archivo: string): Promise<boolean> {
  const pgRestore = localizarHerramienta('pg_restore');
  if (!pgRestore) {return false;}
  const resultado = await ejecutar(pgRestore, ['--list', archivo]);
  return resultado.codigo === 0 && /TABLE DATA/.test(resultado.salida);
}

let enCurso = false;

/** Crea un respaldo ahora, lo verifica y depura los antiguos. Lanza un error claro si algo falla. */
export async function crearRespaldo(): Promise<IRespaldoVerificado> {
  if (enCurso) {throw new Error('Ya hay un respaldo en curso.');}
  const pgDump = localizarHerramienta('pg_dump');
  if (!pgDump) {throw new Error('No se encontró pg_dump. Instala las herramientas de PostgreSQL o define PG_BIN_DIR.');}

  enCurso = true;
  const dir = config.backup.dir;
  const nombre = nombreDeRespaldo();
  const destino = path.join(dir, nombre);
  const parcial = `${destino}.parcial`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const conexion = conexionDeRespaldo();
    const resultado = await ejecutar(
      pgDump,
      ['-h', conexion.host, '-p', conexion.puerto, '-U', conexion.usuario, '-d', conexion.base, '-Fc', '-Z', '6', '--no-owner', '--no-privileges', '-f', parcial],
      conexion.password
    );
    if (resultado.codigo !== 0) {
      throw new Error(`pg_dump falló (código ${resultado.codigo}): ${resultado.error.trim().split('\n').slice(-3).join(' | ')}`);
    }
    fs.renameSync(parcial, destino);
    const verificado = await verificarRespaldo(destino);
    if (!verificado) {
      throw new Error('El respaldo se creó pero no pasó la verificación (pg_restore --list).');
    }
    const eliminados = depurarRespaldos(dir, config.backup.retentionDays);
    const stat = fs.statSync(destino);
    logger.info({ action: 'RESPALDO_CREADO', details: { nombre, bytes: stat.size, eliminados: eliminados.length } });
    return { nombre, bytes: stat.size, creado: stat.mtime.toISOString(), verificado };
  } catch (error) {
    if (fs.existsSync(parcial)) {fs.unlinkSync(parcial);}
    logger.error({ action: 'RESPALDO_FALLIDO', error: { message: error instanceof Error ? error.message : String(error) } });
    throw error;
  } finally {
    enCurso = false;
  }
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Programa el respaldo diario. No hace nada si BACKUP_ENABLED no es 1 o no hay pg_dump. */
export function iniciarRespaldosAutomaticos(): void {
  if (!config.backup.enabled) {return;}
  if (!localizarHerramienta('pg_dump')) {
    logger.warn({ action: 'RESPALDOS_NO_DISPONIBLES', details: 'BACKUP_ENABLED=1 pero no se encontró pg_dump; define PG_BIN_DIR.' });
    return;
  }
  const programar = (): void => {
    temporizador = setTimeout(() => {
      void crearRespaldo().catch(() => undefined).finally(programar);
    }, msHastaProximaEjecucion(config.backup.hour));
    temporizador.unref();
  };
  programar();

  // Al arrancar: si el último respaldo tiene más de 24 h (o no hay), se hace uno tras 2 minutos.
  const ultimo = listarRespaldos(config.backup.dir)[0];
  if (!ultimo || Date.now() - new Date(ultimo.creado).getTime() > 24 * 3600 * 1000) {
    setTimeout(() => { void crearRespaldo().catch(() => undefined); }, 2 * 60 * 1000).unref();
  }
  logger.info({ action: 'RESPALDOS_PROGRAMADOS', details: { hora: config.backup.hour, dir: config.backup.dir, retencionDias: config.backup.retentionDays } });
}

export function detenerRespaldosAutomaticos(): void {
  if (temporizador) {clearTimeout(temporizador);}
  temporizador = null;
}
