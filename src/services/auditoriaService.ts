/**
 * @file Registro de auditoría de operaciones. Puerto directo de audit.js.
 */

import type { QueryResult, QueryResultRow } from 'pg';
import { getRequestContext } from '../db/index.js';

/** Acepta tanto Database (query aislada por tenant) como un pg.PoolClient dentro de una transacción. */
export interface IQueryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

export interface IRegistrarAuditoriaParams {
  usuarioId?: number | null;
  accion: string;
  entidad: string;
  entidadId?: number | string | null;
  detalle?: Record<string, unknown>;
  ip?: string | null;
}

export async function registrarAuditoria(
  db: IQueryable,
  { usuarioId = null, accion, entidad, entidadId = null, detalle = {}, ip = null }: IRegistrarAuditoriaParams
): Promise<void> {
  // El Dueño opera con userId 0 (sin fila en usuarios): normalizar a NULL para
  // no violar la FK auditoria_operaciones_usuario_id_fkey (causaba 500 sistémico
  // en cada guardado del dueño: negocio, personalización, licencias, etc.).
  const uid = typeof usuarioId === 'number' && usuarioId > 0 ? usuarioId : null;
  await db.query(
    `INSERT INTO auditoria_operaciones (usuario_id, accion, entidad, entidad_id, detalle, ip, empresa_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      uid,
      accion,
      entidad,
      entidadId === null ? null : String(entidadId),
      JSON.stringify(detalle),
      ip,
      getRequestContext().empresaId || 1,
    ]
  );
}
