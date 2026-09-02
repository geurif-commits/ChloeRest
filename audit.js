import { getRequestContext } from './db.js';

export async function registrarAuditoria(db, { usuarioId = null, accion, entidad, entidadId = null, detalle = {}, ip = null }) {
  await db.query(
    `INSERT INTO auditoria_operaciones (usuario_id, accion, entidad, entidad_id, detalle, ip, empresa_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [usuarioId, accion, entidad, entidadId === null ? null : String(entidadId), JSON.stringify(detalle), ip, getRequestContext().empresaId || 1],
  );
}
