/**
 * @file Control de acceso por LICENCIA. Una sola función decide si un equipo/negocio puede usar el sistema, y la usan
 * tanto el inicio de sesión como CADA petición autenticada (`middleware/auth.ts`). Antes la licencia solo se miraba al
 * iniciar sesión: una sesión abierta seguía funcionando aunque la licencia venciera, se borrara o el equipo se
 * desactivara, y en una instalación recién creada o borrada el Administrador inicial entraba sin ninguna licencia.
 *
 * Un acceso tiene licencia cuando:
 *  - el equipo está ACTIVO, es de la misma empresa que la sesión y su vigencia no ha vencido; y
 *  - la licencia con la que se activó (por su clave) existe, está activa, no revocada y vigente (la clave maestra
 *    `LICENSE_ACTIVATION_KEY` también vale); un equipo activado sin clave (instalaciones antiguas) exige que la empresa
 *    tenga al menos una licencia vigente; y
 *  - el negocio no está bloqueado (`negocio_config.licencia_bloqueada`).
 * Un equipo que no está activo solo puede entrar con el Administrador de la empresa raíz (1), y únicamente si esa
 * empresa tiene una licencia vigente (el propietario operando su propio negocio); sin licencia, nadie entra.
 * El propietario de la plataforma (token del dueño) no depende de licencias de negocio y no pasa por aquí.
 */

import crypto from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { config } from '../lib/config.js';
import { httpError, type HttpError } from '../lib/core.js';

export type CodigoLicencia = 'DISPOSITIVO_NO_ACTIVADO' | 'LICENCIA_REQUERIDA' | 'LICENCIA_VENCIDA' | 'LICENCIA_REVOCADA';

export interface IEstadoLicenciaAcceso {
  vigente: boolean;
  codigo?: CodigoLicencia;
  motivo?: string;
}

export const MENSAJES_LICENCIA: Record<CodigoLicencia, string> = {
  DISPOSITIVO_NO_ACTIVADO: 'Este equipo no está activado. Activa una licencia vigente para continuar.',
  LICENCIA_REQUERIDA: 'No hay una licencia vigente para este negocio. Activa una clave de licencia para continuar.',
  LICENCIA_VENCIDA: 'La licencia de este negocio ha vencido. Renueva la licencia para continuar.',
  LICENCIA_REVOCADA: 'La licencia de este negocio está suspendida. Comunícate con soporte técnico.',
};

const sinLicencia = (codigo: CodigoLicencia): IEstadoLicenciaAcceso => ({ vigente: false, codigo, motivo: MENSAJES_LICENCIA[codigo] });
const VIGENTE: IEstadoLicenciaAcceso = { vigente: true };

const sha256 = (valor: string): string => crypto.createHash('sha256').update(valor).digest('hex');
const haVencido = (fecha: Date | string | null | undefined): boolean => Boolean(fecha) && new Date(fecha as Date | string).getTime() < Date.now();

interface ILicenciaFila {
  activa: boolean;
  revocada: boolean;
  vencimiento: Date | null;
}

/** Estado de una licencia concreta: null si está vigente, o el motivo por el que no sirve. */
function motivoDeLicencia(l: ILicenciaFila): CodigoLicencia | null {
  if (l.revocada) {return 'LICENCIA_REVOCADA';}
  if (!l.activa) {return 'LICENCIA_REQUERIDA';}
  if (haVencido(l.vencimiento)) {return 'LICENCIA_VENCIDA';}
  return null;
}

/** ¿La empresa tiene alguna licencia vigente? Si solo tiene vencidas/revocadas, devuelve el motivo más claro. */
async function licenciaDeEmpresa(empresaId: number): Promise<IEstadoLicenciaAcceso> {
  const filas = await getDatabase().queryUnscoped<ILicenciaFila>(
    'SELECT activa, revocada, vencimiento FROM licencias WHERE empresa_id = $1',
    [empresaId]
  );
  if (!filas.rowCount) {return sinLicencia('LICENCIA_REQUERIDA');}
  const motivos = filas.rows.map(motivoDeLicencia);
  if (motivos.some((m) => m === null)) {return VIGENTE;}
  return sinLicencia(motivos.includes('LICENCIA_VENCIDA') ? 'LICENCIA_VENCIDA' : (motivos[0] ?? 'LICENCIA_REQUERIDA'));
}

async function evaluar(deviceId: string | null, empresaSesion: number | null): Promise<IEstadoLicenciaAcceso> {
  const db = getDatabase();
  const empresaId = empresaSesion ?? 1;
  const equipo = deviceId
    ? await db.queryUnscoped<{ empresa_id: number | null; estado: string; licencia_vencimiento: Date | null; clave_activacion: string | null }>(
      'SELECT empresa_id, estado, licencia_vencimiento, clave_activacion FROM dispositivos WHERE device_id = $1',
      [deviceId]
    )
    : null;
  const dispositivo = equipo?.rows[0];

  // Equipo sin activar: solo la empresa raíz, y solo si tiene una licencia vigente.
  if (!dispositivo || dispositivo.estado !== 'Activo') {
    if (empresaId !== 1) {return sinLicencia('DISPOSITIVO_NO_ACTIVADO');}
    const raiz = await licenciaDeEmpresa(1);
    return raiz.vigente ? VIGENTE : sinLicencia('DISPOSITIVO_NO_ACTIVADO');
  }

  if ((dispositivo.empresa_id ?? 1) !== empresaId) {return sinLicencia('DISPOSITIVO_NO_ACTIVADO');}
  if (haVencido(dispositivo.licencia_vencimiento)) {return sinLicencia('LICENCIA_VENCIDA');}

  if (dispositivo.clave_activacion) {
    const clave = dispositivo.clave_activacion;
    const licencia = await db.queryUnscoped<ILicenciaFila>(
      'SELECT activa, revocada, vencimiento FROM licencias WHERE clave_hash = $1 AND empresa_id = $2',
      [sha256(clave), empresaId]
    );
    if (licencia.rowCount) {
      const motivo = motivoDeLicencia(licencia.rows[0]);
      if (motivo) {return sinLicencia(motivo);}
    } else if (!(config.licenseActivationKey && clave === config.licenseActivationKey)) {
      // La licencia con la que se activó este equipo ya no existe (borrada): no basta con que el equipo siga "Activo".
      return sinLicencia('LICENCIA_REQUERIDA');
    }
  } else {
    const delNegocio = await licenciaDeEmpresa(empresaId);
    if (!delNegocio.vigente) {return delNegocio;}
  }

  const negocio = await db.queryUnscoped<{ licencia_bloqueada: boolean }>(
    'SELECT licencia_bloqueada FROM negocio_config WHERE empresa_id = $1 ORDER BY id LIMIT 1',
    [empresaId]
  );
  if (negocio.rows[0]?.licencia_bloqueada) {return sinLicencia('LICENCIA_REVOCADA');}
  return VIGENTE;
}

// ── Caché corta: el POS hace muchas peticiones por minuto; un cambio de licencia rige en segundos ──

const SEGUNDOS_CACHE = Math.max(0, Number(process.env.LICENCIA_CACHE_SEGUNDOS ?? 10));
const cache = new Map<string, { estado: IEstadoLicenciaAcceso; hasta: number }>();
const MAX_ENTRADAS_CACHE = 2000;

/** Se llama al cambiar licencias o equipos (revocar, reactivar, eliminar, activar…) para que rija al instante. */
export function invalidarCacheLicencias(): void {
  cache.clear();
}

export async function evaluarLicenciaDeAcceso(params: { deviceId: string | null | undefined; empresaId: number | null | undefined }): Promise<IEstadoLicenciaAcceso> {
  const deviceId = params.deviceId ? String(params.deviceId) : null;
  const empresaId = params.empresaId ?? null;
  const clave = `${deviceId ?? ''}|${empresaId ?? ''}`;
  const ahora = Date.now();
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > ahora) {return guardado.estado;}
  const estado = await evaluar(deviceId, empresaId);
  if (SEGUNDOS_CACHE > 0) {
    if (cache.size >= MAX_ENTRADAS_CACHE) {cache.clear();}
    cache.set(clave, { estado, hasta: ahora + SEGUNDOS_CACHE * 1000 });
  }
  return estado;
}

/** Error HTTP 403 con el código que entiende la interfaz para mostrar la pantalla de licencia. */
export function errorDeLicencia(estado: IEstadoLicenciaAcceso): HttpError {
  const codigo = estado.codigo ?? 'LICENCIA_REQUERIDA';
  return httpError(403, estado.motivo ?? MENSAJES_LICENCIA[codigo], codigo);
}

export const ES_CODIGO_DE_LICENCIA = (codigo: unknown): codigo is CodigoLicencia =>
  typeof codigo === 'string' && Object.prototype.hasOwnProperty.call(MENSAJES_LICENCIA, codigo);
