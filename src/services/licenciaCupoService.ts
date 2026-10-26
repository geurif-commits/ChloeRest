/**
 * @file Cupo de equipos por licencia. Cada licencia admite `max_dispositivos` equipos ACTIVOS a la vez (2 por
 * defecto); el propietario lo cambia cuando el cliente ya la está usando, sin regenerar la clave ni perder datos.
 *
 * Hay una sola regla (`asegurarCupo`) y se aplica en TODA transición a 'Activo': activar con clave y reactivar un
 * equipo desde el panel. Antes solo se validaba al activar con clave, y un Administrador podía pasar del límite
 * desactivando un equipo, activando otro y reactivando el primero.
 */

import crypto from 'node:crypto';
import { httpError } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { registrarAuditoria, type IQueryable } from './auditoriaService.js';
import { invalidarCacheLicencias } from './licenciaAccesoService.js';

export const DISPOSITIVOS_POR_DEFECTO = 2;
export const DISPOSITIVOS_MAXIMO = 50;

export const sha256Hex = (valor: string): string => crypto.createHash('sha256').update(valor).digest('hex');

/** CHLOE-12M-A1B2C-…-D7E8F → CHLOE-12M-•••••-D7E8F (el Administrador no necesita ver la clave completa). */
export function enmascararClave(clave: string | null | undefined): string | null {
  const texto = String(clave ?? '').trim();
  if (!texto) {return null;}
  const partes = texto.split('-');
  if (partes.length < 4) {return `•••••${texto.slice(-5)}`;}
  return `${partes[0]}-${partes[1]}-•••••-${partes[partes.length - 1]}`;
}

export function mensajeSinCupo(max: number): string {
  const plural = max === 1 ? '' : 's';
  return `Esta licencia permite ${max} equipo${plural} activo${plural} y ya están en uso. Desactiva uno de los equipos o pide ampliar el cupo de la licencia.`;
}

/** Serializa las altas y reactivaciones de una misma licencia para que dos peticiones simultáneas no se cuelen. */
export async function bloquearCupoPorHash(client: IQueryable, claveHash: string): Promise<void> {
  const llave = BigInt(`0x${claveHash.slice(0, 15)}`);
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [llave.toString()]);
}

export async function bloquearCupo(client: IQueryable, clave: string | null): Promise<void> {
  await bloquearCupoPorHash(client, sha256Hex(clave ?? ''));
}

export interface ICupo {
  licenciaId: number | null;
  max: number;
  activos: number;
}

/**
 * Cupo vigente de una clave: el de su licencia o, si no está registrada (clave maestra antigua o equipo activado
 * sin clave), el predeterminado. Los equipos sin clave comparten un mismo cupo por empresa.
 */
export async function obtenerCupo(
  client: IQueryable,
  empresaId: number,
  clave: string | null,
  excluirDispositivoId: number | null = null
): Promise<ICupo> {
  let licenciaId: number | null = null;
  let max = DISPOSITIVOS_POR_DEFECTO;
  if (clave) {
    const licencia = await client.query<{ id: number; max_dispositivos: number }>(
      'SELECT id, max_dispositivos FROM licencias WHERE clave_hash = $1 AND empresa_id = $2',
      [sha256Hex(clave), empresaId]
    );
    if (licencia.rowCount) {
      licenciaId = Number(licencia.rows[0].id);
      max = Number(licencia.rows[0].max_dispositivos);
    }
  }
  const usados = await client.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM dispositivos
      WHERE estado = 'Activo' AND empresa_id = $1 AND clave_activacion IS NOT DISTINCT FROM $2::text
        AND ($3::int IS NULL OR id <> $3::int)`,
    [empresaId, clave, excluirDispositivoId]
  );
  return { licenciaId, max, activos: Number(usados.rows[0]?.total ?? 0) };
}

/** Lanza 403 CUPO_DISPOSITIVOS si activar un equipo más superaría el cupo. Llamar tras bloquear el cupo. */
export async function asegurarCupo(
  client: IQueryable,
  params: { empresaId: number; clave: string | null; excluirDispositivoId?: number | null }
): Promise<ICupo> {
  const cupo = await obtenerCupo(client, params.empresaId, params.clave, params.excluirDispositivoId ?? null);
  if (cupo.activos >= cupo.max) {throw httpError(403, mensajeSinCupo(cupo.max), 'CUPO_DISPOSITIVOS');}
  return cupo;
}

export interface ICambioCupoEntrada {
  maxDispositivos?: number;
  motivo: string;
  desactivar: number[];
}

const enteroEntre = (valor: unknown, minimo: number, maximo: number): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo;

const aNumero = (valor: unknown): number =>
  typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : Number.NaN;

/** Valida lo que llega del panel del propietario (el motivo es obligatorio: queda en el historial). */
export function validarCambioCupo(cuerpo: Record<string, unknown>): ICambioCupoEntrada {
  const motivo = String(cuerpo.motivo ?? '').trim();
  if (motivo.length < 3) {throw httpError(400, 'Indica el motivo del cambio (mínimo 3 caracteres).', 'CUPO_MOTIVO');}
  if (motivo.length > 300) {throw httpError(400, 'El motivo es demasiado largo (máximo 300 caracteres).', 'CUPO_MOTIVO');}

  const entrada: ICambioCupoEntrada = { motivo, desactivar: [] };
  if (cuerpo.max_dispositivos !== undefined && cuerpo.max_dispositivos !== null) {
    const valor = aNumero(cuerpo.max_dispositivos);
    if (!enteroEntre(valor, 1, DISPOSITIVOS_MAXIMO)) {
      throw httpError(400, `Los equipos permitidos deben ser un número entero entre 1 y ${DISPOSITIVOS_MAXIMO}.`, 'CUPO_VALOR');
    }
    entrada.maxDispositivos = valor;
  }
  if (entrada.maxDispositivos === undefined) {
    throw httpError(400, 'Indica el nuevo número de equipos permitidos.', 'CUPO_VALOR');
  }
  if (cuerpo.desactivar !== undefined && cuerpo.desactivar !== null) {
    if (!Array.isArray(cuerpo.desactivar)) {throw httpError(400, 'La lista de equipos a desactivar no es válida.', 'CUPO_VALOR');}
    const ids = cuerpo.desactivar.map(aNumero);
    if (ids.some((id) => !Number.isInteger(id) || id <= 0) || ids.length > DISPOSITIVOS_MAXIMO) {
      throw httpError(400, 'La lista de equipos a desactivar no es válida.', 'CUPO_VALOR');
    }
    entrada.desactivar = [...new Set(ids)];
  }
  return entrada;
}

interface ILicenciaCupoFila {
  id: number;
  empresa_id: number;
  clave_hash: string;
  max_dispositivos: number;
}

export interface IResultadoCambioCupo {
  licenciaId: number;
  maxDispositivos: number;
  desactivados: Array<{ id: number; device_id: string }>;
}

export interface ICambioCupoParams extends ICambioCupoEntrada {
  licenciaId: number;
  actor: string;
  ip: string | null;
}

/**
 * Cambia el cupo de una licencia ya en uso. Bajarlo por debajo de los equipos activos exige elegir cuáles
 * desactivar en la misma operación (nunca se desactiva nada a escondidas). Todo cambio queda en el historial
 * de la licencia y en la auditoría.
 */
export async function cambiarCupoLicencia(params: ICambioCupoParams): Promise<IResultadoCambioCupo> {
  const resultado = await getDatabase().transaction(async (client) => {
    const fila = await client.query<ILicenciaCupoFila>(
      'SELECT id, empresa_id, clave_hash, max_dispositivos FROM licencias WHERE id = $1 FOR UPDATE',
      [params.licenciaId]
    );
    if (!fila.rowCount) {throw httpError(404, 'Licencia no encontrada.');}
    const licencia = fila.rows[0];
    await bloquearCupoPorHash(client, licencia.clave_hash);

    const nuevoDispositivos = params.maxDispositivos ?? licencia.max_dispositivos;
    if (nuevoDispositivos === licencia.max_dispositivos && !params.desactivar.length) {
      throw httpError(400, 'No hay cambios: los valores indicados ya son los vigentes.', 'CUPO_SIN_CAMBIOS');
    }

    // Equipos activos de ESTA licencia (la clave se guarda en claro en el equipo; la licencia, solo su hash).
    const candidatos = await client.query<{ id: number; device_id: string; clave_activacion: string | null }>(
      "SELECT id, device_id, clave_activacion FROM dispositivos WHERE empresa_id = $1 AND estado = 'Activo' AND clave_activacion IS NOT NULL",
      [licencia.empresa_id]
    );
    const activos = candidatos.rows.filter((d) => d.clave_activacion && sha256Hex(d.clave_activacion) === licencia.clave_hash);

    const aDesactivar = activos.filter((d) => params.desactivar.includes(Number(d.id)));
    if (aDesactivar.length !== params.desactivar.length) {
      throw httpError(400, 'Algún equipo a desactivar no está activo en esta licencia.', 'CUPO_VALOR');
    }
    const quedarian = activos.length - aDesactivar.length;
    if (quedarian > nuevoDispositivos) {
      throw httpError(
        409,
        `La licencia tiene ${activos.length} equipos activos: para permitir solo ${nuevoDispositivos} elige cuáles desactivar (faltan ${quedarian - nuevoDispositivos}).`,
        'CUPO_POR_DEBAJO_DE_USO'
      );
    }

    const historial = async (campo: string, anterior: string | number | null, nuevo: string | number | null): Promise<void> => {
      await client.query(
        `INSERT INTO licencia_cambios (licencia_id, empresa_id, campo, valor_anterior, valor_nuevo, motivo, actor, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [licencia.id, licencia.empresa_id, campo, anterior === null ? null : String(anterior), nuevo === null ? null : String(nuevo), params.motivo, params.actor, params.ip]
      );
    };

    for (const equipo of aDesactivar) {
      await client.query("UPDATE dispositivos SET estado = 'Inactivo' WHERE id = $1", [equipo.id]);
      await historial('dispositivo_desactivado', 'Activo', equipo.device_id);
    }
    if (nuevoDispositivos !== licencia.max_dispositivos) {
      await client.query('UPDATE licencias SET max_dispositivos = $1 WHERE id = $2', [nuevoDispositivos, licencia.id]);
      await historial('max_dispositivos', licencia.max_dispositivos, nuevoDispositivos);
    }
    await registrarAuditoria(client, {
      usuarioId: null,
      accion: 'LICENCIA_CAMBIO_CUPO',
      entidad: 'licencias',
      entidadId: licencia.id,
      detalle: {
        maxDispositivos: [licencia.max_dispositivos, nuevoDispositivos],
        desactivados: aDesactivar.map((d) => d.device_id),
        motivo: params.motivo,
      },
      ip: params.ip,
    });
    return {
      licenciaId: Number(licencia.id),
      maxDispositivos: nuevoDispositivos,
      desactivados: aDesactivar.map((d) => ({ id: Number(d.id), device_id: d.device_id })),
    };
  });
  invalidarCacheLicencias(); // los equipos desactivados dejan de tener acceso al instante
  return resultado;
}

export interface IHistorialLicenciaFila {
  id: number;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  motivo: string;
  actor: string | null;
  creado_en: Date;
}

export async function historialLicencia(licenciaId: number): Promise<IHistorialLicenciaFila[]> {
  const resultado = await getDatabase().query<IHistorialLicenciaFila>(
    `SELECT id, campo, valor_anterior, valor_nuevo, motivo, actor, creado_en
       FROM licencia_cambios WHERE licencia_id = $1 ORDER BY id DESC LIMIT 100`,
    [licenciaId]
  );
  return resultado.rows;
}

export interface ICupoEmpresa {
  id: number;
  clave: string | null;
  max_dispositivos: number;
  activos: number;
}

/** Cupo de cada licencia vigente de una empresa (para la pantalla de terminales del Administrador). */
export async function cupoDeLaEmpresa(empresaId: number): Promise<ICupoEmpresa[]> {
  const db = getDatabase();
  const licencias = await db.query<{ id: number; clave_texto: string | null; clave_hash: string; max_dispositivos: number }>(
    'SELECT id, clave_texto, clave_hash, max_dispositivos FROM licencias WHERE empresa_id = $1 AND activa = TRUE AND revocada = FALSE ORDER BY id',
    [empresaId]
  );
  if (!licencias.rowCount) {return [];}
  const equipos = await db.query<{ clave_activacion: string | null }>(
    "SELECT clave_activacion FROM dispositivos WHERE empresa_id = $1 AND estado = 'Activo' AND clave_activacion IS NOT NULL",
    [empresaId]
  );
  const hashes = equipos.rows.map((d) => sha256Hex(String(d.clave_activacion)));
  return licencias.rows.map((l) => ({
    id: Number(l.id),
    clave: enmascararClave(l.clave_texto),
    max_dispositivos: Number(l.max_dispositivos),
    activos: hashes.filter((h) => h === l.clave_hash).length,
  }));
}
