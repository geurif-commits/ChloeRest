/**
 * @file Router de e-CF (Facturación Electrónica DGII vía AlgoBack): envío,
 * consulta de estado con polling best-effort, historial y anulación local.
 * Puerto directo de server.js (legacy: enviar ~3310-3405, consultar
 * ~3406-3438, historial ~3439-3450, anular ~3470-3489). Rutas con prefijo
 * /api completo; listo para app.use(dgiiEcfRouter).
 */

/* global fetch */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { ROLES_ADMIN } from '../lib/roles.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { emitirEcfDeCuenta } from '../services/ecfEmisionService.js';
import {
  autenticarMseller,
  consultarEstadoMseller,
  mapearEstadoMsellerAEstadoLocal,
  type IMsellerConfig,
} from '../services/msellerEcfService.js';

const router = Router();

/** URL por defecto del proveedor AlgoBack (constante del legacy). */
const URL_ALGOBACK = 'https://api-dgii.algoback.com/ecf/procesar-factura';

/** Fila de dgii_config usada para enviar/consultar e-CF (SELECT *). */
interface IConfigECFFila {
  id: number;
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
  direccion_emisor: string | null;
  proveedor_ecf: string | null;
  ambiente: string | null;
  estado_ecf: string | null;
  algoback_api_key: string | null;
  algoback_url: string | null;
  algoback_ambiente: string | null;
  email_mseller: string | null;
  password_mseller: string | null;
  api_key_mseller: string | null;
}

/** Fila de e_cf_comprobantes (SELECT *, valores crudos de pg). */
interface IECFComprobanteFila {
  id: number;
  cuenta_id: number;
  tipo_cf: string;
  ncf: string;
  track_id: string | null;
  estado: string;
  rnc_emisor: string | null;
  rnc_receptor: string | null;
  monto_total: string | null;
  fecha_emision: Date;
  enviado_en: Date | null;
  respuesta_json: Record<string, unknown> | null;
  creado_en: Date;
  ambiente: string | null;
  fecha_limite_emision: Date | null;
  tipo_emision: number | null;
  codigo_seguridad: string | null;
  qr_url: string | null;
  xml_firmado: string | null;
  motivo_anulacion: string | null;
  ncf_modificado: string | null;
  tipo_pago: number | null;
  monto_exento: string | null;
  monto_gravado: string | null;
  total_itbis: string | null;
  total_propina: string | null;
}

/** Fila del historial de e-CF (SELECT ec.* + total de la cuenta). */
interface IECFHistorialFila extends IECFComprobanteFila {
  cuenta_total: string | null;
}

/** Cuerpo JSON de la API remota de AlgoBack (campos consultados). */
interface IAlgoBackRespuesta {
  [key: string]: unknown;
  trackId?: unknown;
  track_id?: unknown;
  estado?: unknown;
  codigoSeguridad?: unknown;
  codigo_seguridad?: unknown;
  error?: unknown;
  mensaje?: unknown;
}

// POST /api/dgii/ecf/enviar (Administrador): envía (o reenvía) a la DGII el e-CF de una cuenta cerrada, con el proveedor activo.
// Es la misma emisión que se dispara sola al cobrar; aquí sirve para reintentar a mano o para cuentas anteriores.
router.post('/api/dgii/ecf/enviar', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const cuentaId = positiveInteger(req.body.cuenta_id, 'Cuenta');
  const resultado = await emitirEcfDeCuenta(cuentaId, { esperaMs: 12_000 });
  await registrarAuditoria(getDatabase(), {
    usuarioId: req.auth!.userId,
    accion: 'ENVIAR_ECF',
    entidad: 'e_cf_comprobantes',
    entidadId: cuentaId,
    detalle: { ncf: resultado.ncf, estado: resultado.estado, trackId: resultado.trackId },
    ip: clientIp(req),
  });
  if (!resultado.ok && resultado.estado === 'Error') {
    throw httpError(400, resultado.mensaje, 'ECF_NO_ENVIABLE');
  }
  if (resultado.estado === 'Rechazado') {
    throw httpError(422, `La DGII rechazó el comprobante: ${resultado.mensaje}`, 'ECF_RECHAZADO');
  }
  res.json({
    mensaje: resultado.ok
      ? `e-CF aceptado por la DGII. Código de seguridad: ${String(resultado.codigoSeguridad)}`
      : resultado.reintentable
        ? `e-CF enviado; esperando respuesta de la DGII. ${resultado.mensaje}`
        : resultado.mensaje,
    estado: resultado.estado,
    trackId: resultado.trackId,
    codigoSeguridad: resultado.codigoSeguridad,
    fechaFirma: resultado.fechaFirma,
    ncf: resultado.ncf,
  });
}));

// GET /api/dgii/ecf/consultar/:trackId (Administrador): estado desde DB + polling AlgoBack.
router.get('/api/dgii/ecf/consultar/:trackId', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const { trackId } = req.params;
  const result = await db.query<IECFComprobanteFila>('SELECT * FROM e_cf_comprobantes WHERE track_id = $1', [trackId]);
  if (!result.rowCount) {
    throw httpError(404, 'Comprobante e-CF no encontrado.');
  }

  const ecf = result.rows[0];

  // Intentar actualizar estado desde el proveedor activo si está en estado intermedio
  if (['Pendiente', 'Enviado', 'Procesando'].includes(ecf.estado)) {
    try {
      const configResult = await db.query<IConfigECFFila>('SELECT * FROM dgii_config ORDER BY id LIMIT 1');
      const cfg = configResult.rows[0];
      if (!cfg) {
        return;
      }
      const proveedor = (cfg.proveedor_ecf || 'algoback').toLowerCase();

      if (proveedor === 'mseller' && cfg.email_mseller && cfg.password_mseller && cfg.api_key_mseller) {
        const msellerConfig: IMsellerConfig = {
          email: cfg.email_mseller,
          password: cfg.password_mseller,
          apiKey: cfg.api_key_mseller,
          ambiente: cfg.ambiente,
          estadoEcf: cfg.estado_ecf,
        };
        const sesion = await autenticarMseller(msellerConfig);
        const consulta = await consultarEstadoMseller(msellerConfig, sesion, ecf.ncf);
        const estadoNuevo = mapearEstadoMsellerAEstadoLocal(consulta.estado);
        if (consulta.estado && estadoNuevo && estadoNuevo !== ecf.estado) {
          await db.query(
            `UPDATE e_cf_comprobantes
             SET estado = $1, respuesta_json = $2,
                 codigo_seguridad = COALESCE($3, codigo_seguridad),
                 qr_url = COALESCE($4, qr_url),
                 xml_firmado = COALESCE($5, xml_firmado)
             WHERE track_id = $6`,
            [estadoNuevo, JSON.stringify(consulta.raw),
              consulta.securityCode || null, consulta.qrUrl || null, consulta.signedXml || null,
              trackId]
          );
          ecf.estado = estadoNuevo;
          ecf.respuesta_json = consulta.raw as Record<string, unknown> | null;
          if (consulta.securityCode) { ecf.codigo_seguridad = consulta.securityCode; }
          if (consulta.qrUrl) { ecf.qr_url = consulta.qrUrl; }
          if (consulta.signedXml) { ecf.xml_firmado = consulta.signedXml; }
        }
      } else if (cfg.algoback_api_key) {
        const pollUrl = `${cfg.algoback_url || URL_ALGOBACK}/consultar/${trackId}`;
        const pollRes = await fetch(pollUrl, {
          headers: {
            'X-API-KEY': cfg.algoback_api_key,
            'X-Entorno': cfg.algoback_ambiente || 'TEST',
          },
        });
        if (pollRes.ok) {
          const pollData = (await pollRes.json().catch(() => null)) as IAlgoBackRespuesta | null;
          if (pollData?.estado && pollData.estado !== ecf.estado) {
            const estadoNuevo = String(pollData.estado);
            await db.query(
              'UPDATE e_cf_comprobantes SET estado = $1, respuesta_json = $2 WHERE track_id = $3',
              [estadoNuevo, JSON.stringify(pollData), trackId]
            );
            ecf.estado = estadoNuevo;
            ecf.respuesta_json = pollData;
          }
        }
      }
    } catch {
      /* polling es best-effort */
    }
  }

  res.json(ecf);
}));

// GET /api/dgii/ecf/historial (Administrador): lista e-CF enviados (filtro por estado).
router.get('/api/dgii/ecf/historial', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const limit = Math.min(parseInt(String(req.query.limit || ''), 10) || 100, 500);
  const estado = String(req.query.estado || '') || null;
  let sql = 'SELECT ec.*, c.total AS cuenta_total FROM e_cf_comprobantes ec LEFT JOIN cuentas c ON c.id = ec.cuenta_id';
  const params: string[] = [];
  if (estado) {
    params.push(estado);
    sql += ` WHERE ec.estado = $${params.length}`;
  }
  sql += ` ORDER BY ec.creado_en DESC LIMIT $${params.length + 1}`;
  params.push(String(limit));
  const result = await db.query<IECFHistorialFila>(sql, params);
  res.json(result.rows);
}));

// POST /api/dgii/ecf/anular (Administrador): anulación local del comprobante e-CF.
router.post('/api/dgii/ecf/anular', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const ecfId = positiveInteger(req.body.ecf_id, 'Comprobante e-CF');
  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) {
    throw httpError(400, 'El motivo de anulación es obligatorio.');
  }

  const ecf = await db.query<IECFComprobanteFila>('SELECT * FROM e_cf_comprobantes WHERE id = $1', [ecfId]);
  if (!ecf.rowCount) {
    throw httpError(404, 'Comprobante e-CF no encontrado.');
  }
  if (ecf.rows[0].estado === 'Anulado') {
    throw httpError(400, 'Este comprobante ya fue anulado.');
  }

  // Actualizar estado local
  await db.query(
    'UPDATE e_cf_comprobantes SET estado = $1, motivo_anulacion = $2 WHERE id = $3',
    ['Anulado', motivo, ecfId]
  );

  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ANULAR_ECF',
    entidad: 'e_cf_comprobantes',
    entidadId: ecfId,
    detalle: { motivo },
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Comprobante e-CF anulado. Se recomienda emitir una nota de crédito (E34) para afectos contables.' });
}));

export default router;
