/**
 * @file Respaldos automáticos de la base de datos (pg_dump en formato custom).
 *
 * - Un respaldo por día a la hora BACKUP_HOUR (por defecto 03:00) y uno al arrancar si se perdió el último
 *   programado (equipo apagado a esa hora). Cada archivo se verifica con `pg_restore --list` antes de darlo por bueno.
 * - Se conservan los últimos BACKUP_RETENTION_DAYS días (por defecto 14) y, como mínimo, los 3 más recientes.
 * - Lo que el usuario elige en pantalla (activar, hora, días, carpeta externa) se guarda en `ajustes.json`
 *   dentro de la carpeta de respaldos y manda sobre las variables BACKUP_* del entorno.
 * - Las tablas de negocio tienen RLS forzado: el rol que respalda debe ser superusuario o tener BYPASSRLS
 *   (BACKUP_DB_USER / BACKUP_DB_PASSWORD). Si no puede leer todas las filas, pg_dump falla en voz alta.
 * - `npm run backup` crea uno ahora; `npm run backup:verify` lo restaura en una base temporal y lo comprueba.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { config } from '../lib/config.js';
import { httpError } from '../lib/core.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('backup');

const EXPRESION_NOMBRE = /^chloerest_\d{8}_\d{6}\.dump$/;
const MINIMO_A_CONSERVAR = 3;
const ARCHIVO_AJUSTES = 'ajustes.json';

/** Ajustes efectivos del respaldo automático. */
export interface IAjustesRespaldo {
  enabled: boolean;
  hour: number;
  retentionDays: number;
  copyDir: string | null;
}

/** Resultado del último respaldo intentado (manual o automático); vive en memoria hasta reiniciar. */
export interface IUltimoIntento {
  ok: boolean;
  fecha: string;
  mensaje: string | null;
}

export interface IRespaldo {
  nombre: string;
  bytes: number;
  creado: string;
}

/** Resultado de copiar el respaldo a la segunda carpeta (BACKUP_COPY_DIR). */
export type ICopiaExterna = 'no_configurada' | 'ok' | 'fallida';

export type IRespaldoVerificado = IRespaldo & { verificado: boolean; copiaExterna: ICopiaExterna };

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

/**
 * Copia un respaldo ya verificado a otra carpeta (USB, nube sincronizada, red) y aplica allí la misma
 * depuración. Nunca lanza: un destino caído no debe hacer fallar el respaldo local; se avisa en el log.
 */
export function copiarRespaldo(origen: string, dirDestino: string, retencionDias: number): ICopiaExterna {
  const destino = path.join(dirDestino, path.basename(origen));
  const parcial = `${destino}.parcial`;
  try {
    fs.mkdirSync(dirDestino, { recursive: true });
    fs.copyFileSync(origen, parcial);
    fs.renameSync(parcial, destino);
    depurarRespaldos(dirDestino, retencionDias);
    return 'ok';
  } catch (error) {
    if (fs.existsSync(parcial)) {fs.rmSync(parcial, { force: true });}
    logger.warn({ action: 'RESPALDO_COPIA_FALLIDA', error: { message: error instanceof Error ? error.message : String(error) } });
    return 'fallida';
  }
}

const esEnteroEntre = (valor: unknown, minimo: number, maximo: number): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo;

/** Número o texto numérico no vacío; cualquier otra cosa (null, '', true…) es NaN y no pasa la validación. */
const aNumero = (valor: unknown): number =>
  typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : Number.NaN;

/** Ajustes guardados desde la pantalla. Un archivo ausente, ilegible o con campos inválidos se ignora campo a campo. */
export function leerAjustesGuardados(dir: string): Partial<IAjustesRespaldo> {
  try {
    const crudo = JSON.parse(fs.readFileSync(path.join(dir, ARCHIVO_AJUSTES), 'utf8')) as Record<string, unknown>;
    const ajustes: Partial<IAjustesRespaldo> = {};
    if (typeof crudo.enabled === 'boolean') {ajustes.enabled = crudo.enabled;}
    if (esEnteroEntre(crudo.hour, 0, 23)) {ajustes.hour = crudo.hour;}
    if (esEnteroEntre(crudo.retentionDays, 1, 365)) {ajustes.retentionDays = crudo.retentionDays;}
    if (crudo.copyDir === null || typeof crudo.copyDir === 'string') {ajustes.copyDir = crudo.copyDir || null;}
    return ajustes;
  } catch {
    return {};
  }
}

/** Lo guardado manda sobre el entorno; un `copyDir` guardado como null significa "sin copia externa" aunque BACKUP_COPY_DIR exista. */
export function combinarAjustes(base: IAjustesRespaldo, guardados: Partial<IAjustesRespaldo>): IAjustesRespaldo {
  return { ...base, ...guardados };
}

export function ajustesDeRespaldo(): IAjustesRespaldo {
  return combinarAjustes(
    { enabled: config.backup.enabled, hour: config.backup.hour, retentionDays: config.backup.retentionDays, copyDir: config.backup.copyDir },
    leerAjustesGuardados(config.backup.dir)
  );
}

export function guardarAjustes(dir: string, ajustes: Partial<IAjustesRespaldo>): void {
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, ARCHIVO_AJUSTES);
  const parcial = `${archivo}.parcial`;
  fs.writeFileSync(parcial, JSON.stringify(ajustes, null, 2));
  fs.renameSync(parcial, archivo);
}

/** La carpeta externa debe ser una ruta completa, distinta de la de respaldos, y poder escribirse (se prueba de verdad). */
function comprobarCarpetaExterna(texto: string, dirRespaldos: string): string {
  if (!path.isAbsolute(texto)) {
    throw httpError(400, 'La carpeta externa debe ser una ruta completa (por ejemplo D:\\Respaldos).', 'RESPALDO_CARPETA_INVALIDA');
  }
  const destino = path.resolve(texto);
  const relativa = path.relative(path.resolve(dirRespaldos), destino);
  if (relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa))) {
    throw httpError(400, 'La carpeta externa debe ser distinta de la carpeta de respaldos del sistema.', 'RESPALDO_CARPETA_INVALIDA');
  }
  const prueba = path.join(destino, `.prueba-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(prueba, 'ok');
    fs.rmSync(prueba, { force: true });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw httpError(400, `No se puede escribir en esa carpeta (${detalle}). Revisa que exista y que la memoria USB o la unidad estén conectadas.`, 'RESPALDO_CARPETA_INVALIDA');
  }
  return destino;
}

/** Valida lo que llega de la pantalla; solo devuelve los campos presentes. `copyDir` vacío o null quita la copia externa. */
export function validarAjustes(entrada: Record<string, unknown>, dirRespaldos: string): Partial<IAjustesRespaldo> {
  const resultado: Partial<IAjustesRespaldo> = {};
  if (entrada.enabled !== undefined) {
    if (typeof entrada.enabled !== 'boolean') {throw httpError(400, 'El estado del respaldo automático debe ser verdadero o falso.', 'RESPALDO_AJUSTE_INVALIDO');}
    resultado.enabled = entrada.enabled;
  }
  if (entrada.hour !== undefined) {
    const hora = aNumero(entrada.hour);
    if (!esEnteroEntre(hora, 0, 23)) {throw httpError(400, 'La hora del respaldo debe estar entre 0 y 23.', 'RESPALDO_AJUSTE_INVALIDO');}
    resultado.hour = hora;
  }
  if (entrada.retentionDays !== undefined) {
    const dias = aNumero(entrada.retentionDays);
    if (!esEnteroEntre(dias, 1, 365)) {throw httpError(400, 'Los días a conservar deben estar entre 1 y 365.', 'RESPALDO_AJUSTE_INVALIDO');}
    resultado.retentionDays = dias;
  }
  if (entrada.copyDir !== undefined) {
    const texto = entrada.copyDir === null ? '' : String(entrada.copyDir).trim();
    resultado.copyDir = texto ? comprobarCarpetaExterna(texto, dirRespaldos) : null;
  }
  return resultado;
}

/**
 * ¿Se perdió el respaldo programado? Ocurre cuando el equipo estaba apagado a esa hora (restaurantes que
 * apagan de noche): si el último respaldo es anterior a la última hora programada que ya pasó, toca recuperarlo.
 */
export function debeRecuperarRespaldo(ultimo: Date | null, hora: number, ahora: Date = new Date()): boolean {
  if (!ultimo) {return true;}
  const ultimaProgramada = new Date(ahora);
  ultimaProgramada.setHours(hora, 0, 0, 0);
  if (ultimaProgramada.getTime() > ahora.getTime()) {ultimaProgramada.setDate(ultimaProgramada.getDate() - 1);}
  return ultimo.getTime() < ultimaProgramada.getTime();
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
  const ajustes = ajustesDeRespaldo();
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
    const eliminados = depurarRespaldos(dir, ajustes.retentionDays);
    const copiaExterna: ICopiaExterna = ajustes.copyDir
      ? copiarRespaldo(destino, ajustes.copyDir, ajustes.retentionDays)
      : 'no_configurada';
    const stat = fs.statSync(destino);
    ultimoIntento = { ok: true, fecha: new Date().toISOString(), mensaje: null };
    logger.info({ action: 'RESPALDO_CREADO', details: { nombre, bytes: stat.size, eliminados: eliminados.length, copiaExterna } });
    return { nombre, bytes: stat.size, creado: stat.mtime.toISOString(), verificado, copiaExterna };
  } catch (error) {
    if (fs.existsSync(parcial)) {fs.unlinkSync(parcial);}
    const mensaje = error instanceof Error ? error.message : String(error);
    ultimoIntento = { ok: false, fecha: new Date().toISOString(), mensaje };
    logger.error({ action: 'RESPALDO_FALLIDO', error: { message: mensaje } });
    throw error;
  } finally {
    enCurso = false;
  }
}

let temporizador: ReturnType<typeof setTimeout> | null = null;
let proximaEjecucion: number | null = null;
let ultimoIntento: IUltimoIntento | null = null;

/** Cuándo corre el próximo respaldo automático (null si está desactivado o no hay pg_dump) y cómo fue el último intento. */
export function estadoDeRespaldos(): { proximoRespaldo: string | null; ultimoIntento: IUltimoIntento | null } {
  return { proximoRespaldo: proximaEjecucion ? new Date(proximaEjecucion).toISOString() : null, ultimoIntento };
}

/** (Re)programa el respaldo diario según los ajustes vigentes: lo desactivado o sin pg_dump no deja temporizador. */
function programar(): void {
  if (temporizador) {clearTimeout(temporizador);}
  temporizador = null;
  proximaEjecucion = null;
  const ajustes = ajustesDeRespaldo();
  if (!ajustes.enabled || !localizarHerramienta('pg_dump')) {return;}
  const espera = msHastaProximaEjecucion(ajustes.hour);
  proximaEjecucion = Date.now() + espera;
  temporizador = setTimeout(() => {
    void crearRespaldo().catch(() => undefined).finally(programar);
  }, espera);
  temporizador.unref();
}

/** Aplica de inmediato un cambio de ajustes (activar, desactivar, otra hora) sin reiniciar el servidor. */
export function reprogramarRespaldosAutomaticos(): void {
  programar();
}

/** Valida, guarda y aplica los ajustes elegidos en pantalla. Lanza un 400 claro si algo no es válido. */
export function actualizarAjustes(entrada: Record<string, unknown>): IAjustesRespaldo {
  const dir = config.backup.dir;
  const nuevos = validarAjustes(entrada, dir);
  guardarAjustes(dir, { ...leerAjustesGuardados(dir), ...nuevos });
  reprogramarRespaldosAutomaticos();
  return ajustesDeRespaldo();
}

/** Arranca el respaldo automático (si está activado y hay pg_dump) y recupera el programado que se perdió por tener el equipo apagado. */
export function iniciarRespaldosAutomaticos(): void {
  const ajustes = ajustesDeRespaldo();
  const hayHerramienta = localizarHerramienta('pg_dump') !== null;
  if (ajustes.enabled && !hayHerramienta) {
    logger.warn({ action: 'RESPALDOS_NO_DISPONIBLES', details: 'El respaldo automático está activado pero no se encontró pg_dump; define PG_BIN_DIR.' });
  }
  programar();

  // Al arrancar: si se perdió el último respaldo programado (equipo apagado a esa hora), se hace uno tras 2 minutos.
  const ultimo = listarRespaldos(config.backup.dir)[0];
  if (ajustes.enabled && hayHerramienta && debeRecuperarRespaldo(ultimo ? new Date(ultimo.creado) : null, ajustes.hour)) {
    setTimeout(() => {
      if (ajustesDeRespaldo().enabled) {void crearRespaldo().catch(() => undefined);}
    }, 2 * 60 * 1000).unref();
  }
  if (ajustes.enabled) {
    logger.info({ action: 'RESPALDOS_PROGRAMADOS', details: { hora: ajustes.hour, dir: config.backup.dir, retencionDias: ajustes.retentionDays, copiaExterna: ajustes.copyDir !== null } });
  }
}

export function detenerRespaldosAutomaticos(): void {
  if (temporizador) {clearTimeout(temporizador);}
  temporizador = null;
  proximaEjecucion = null;
}
