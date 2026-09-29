/**
 * @file Router de e-CF (Facturación Electrónica DGII vía AlgoBack): envío,
 * consulta de estado con polling best-effort, historial y anulación local.
 * Puerto directo de server.js (legacy: enviar ~3310-3405, consultar
 * ~3406-3438, historial ~3439-3450, anular ~3470-3489). Rutas con prefijo
 * /api completo; listo para app.use(dgiiEcfRouter).
 */

/* global fetch */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, money, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { ROLES_ADMIN } from '../lib/roles.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { construirECF } from '../lib/ecf.js';
import type { IDetalleECF } from '../lib/ecf.js';
import { normalizarRNC, validarRNC } from '../lib/rnc.js';
import {
  autenticarMseller,
  enviarDocumentoMseller,
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

/** Fila de cuentas cerradas candidatas a e-CF (SELECT c.* + alias ncf). */
interface ICuentaCerradaFila {
  id: number;
  ncf: string;
  tipo_comprobante: string | null;
  rnc_cedula_cliente: string | null;
  total: string | null;
  metodo_pago: string | null;
}

/** Fila de cuenta_detalles con producto y tasa de ITBIS (valores crudos de pg). */
interface IDetalleCuentaFila {
  cantidad: string | null;
  precio_unitario: string | null;
  producto_nombre: string | null;
  tasa_itbis: string;
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

// POST /api/dgii/ecf/enviar (Administrador): envía e-CF a la DGII vía AlgoBack.
router.post('/api/dgii/ecf/enviar', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const cuentaId = positiveInteger(req.body.cuenta_id, 'Cuenta');
  const configResult = await db.query<IConfigECFFila>('SELECT * FROM dgii_config ORDER BY id LIMIT 1');
  const cfg = configResult.rows[0];
  const apiKey = cfg?.algoback_api_key || '';
  const proveedorActivo = (cfg?.proveedor_ecf || 'algoback').toLowerCase();
  const tieneMsellerCfg = Boolean(cfg?.email_mseller && cfg?.password_mseller && cfg?.api_key_mseller);
  if (!cfg || (proveedorActivo === 'mseller' ? !tieneMsellerCfg : !apiKey)) {
    throw httpError(
      400,
      proveedorActivo === 'mseller'
        ? 'No hay credenciales de MSeller ECF configuradas. Ve a DGII > e-CF y guarda email/password/API Key.'
        : 'No hay API Key de AlgoBack configurada. Ve a DGII > e-CF y guarda tus credenciales.',
      proveedorActivo === 'mseller' ? 'MSELLER_SIN_CONFIG' : 'ALGOBACK_SIN_CONFIG'
    );
  }

  const cuenta = await db.query<ICuentaCerradaFila>(
    `SELECT c.*, COALESCE(c.ncf_ecf_generado, '') AS ncf
     FROM cuentas c WHERE c.id = $1 AND c.estado = 'Cerrada'`,
    [cuentaId]
  );
  if (!cuenta.rowCount) {
    throw httpError(404, 'Cuenta no encontrada o no está cerrada.');
  }

  const cta = cuenta.rows[0];
  const tipoCF = cta.tipo_comprobante || 'E32';
  if (!tipoCF.startsWith('E3') && tipoCF !== 'e-CF') {
    throw httpError(400, 'Esta cuenta no fue registrada como e-CF (usa tipo B01/B02).');
  }

  const tipoECF = tipoCF === 'E31' || (tipoCF === 'e-CF' && (cta.ncf || '').startsWith('E31')) ? 31 : 32;

  const detalles = await db.query<IDetalleCuentaFila>(
    `SELECT cd.*, p.nombre AS producto_nombre, COALESCE(p.tasa_itbis, 0) AS tasa_itbis
     FROM cuenta_detalles cd JOIN productos p ON p.id = cd.producto_id
     WHERE cd.cuenta_id = $1 AND cd.anulado_en IS NULL`,
    [cuentaId]
  );

  if (!detalles.rowCount) {
    throw httpError(400, 'No hay detalles para enviar.');
  }

  // Validar RNC del receptor para E31
  if (tipoECF === 31 && !validarRNC(cta.rnc_cedula_cliente)) {
    throw httpError(400, 'Para e-CF E31 (Crédito Fiscal) se requiere un RNC válido del cliente.');
  }

  const items: IDetalleECF[] = detalles.rows.map((d) => ({
    cantidad: Number(d.cantidad),
    precio_unitario: Number(d.precio_unitario),
    tasa_itbis: Number(d.tasa_itbis),
    producto_nombre: d.producto_nombre ?? undefined,
  }));

  const tipoPago = cta.metodo_pago === 'Efectivo' ? 1 : 2;
  const eCFPayload = construirECF({
    tipoECF,
    ncf: cta.ncf,
    cfg: {
      rnc_emisor: cfg.rnc_emisor || '',
      razon_social_emisor: cfg.razon_social_emisor ?? undefined,
      direccion_emisor: cfg.direccion_emisor ?? undefined,
    },
    rncReceptor: cta.rnc_cedula_cliente || '',
    razonSocialReceptor: req.body.razon_social_cliente || cta.rnc_cedula_cliente || 'Cliente Final',
    detalles: items,
    tipoPago,
  });

  // Proveedor seleccionado: 'mseller' (MSeller ECF) o 'algoback' (default)
  const proveedor = (cfg?.proveedor_ecf || 'algoback').toLowerCase();
  let resultadoEnvio: {
    trackId: string | null;
    estado: string;
    codigoSeguridad: string | null;
    qrUrl: string | null;
    xmlFirmado: string | null;
    ambiente: string;
    respuestaJson: unknown;
  };

  if (proveedor === 'mseller') {
    const msellerConfig: IMsellerConfig = {
      email: cfg.email_mseller,
      password: cfg.password_mseller,
      apiKey: cfg.api_key_mseller,
      ambiente: cfg.ambiente,
      estadoEcf: cfg.estado_ecf,
    };
    if (!msellerConfig.email || !msellerConfig.password || !msellerConfig.apiKey) {
      throw httpError(400, 'No hay credenciales de MSeller ECF configuradas. Ve a DGII > e-CF y guarda email/password/API Key.', 'MSELLER_SIN_CONFIG');
    }
    const sesion = await autenticarMseller(msellerConfig);
    const resultado = await enviarDocumentoMseller(msellerConfig, sesion, eCFPayload);
    resultadoEnvio = {
      trackId: resultado.internalTrackId || resultado.ecf || null,
      estado: 'Enviado',
      codigoSeguridad: resultado.codigoSeguridad || null,
      qrUrl: resultado.qrUrl || null,
      xmlFirmado: resultado.signedXml || null,
      ambiente: resultado.environment,
      respuestaJson: resultado.raw,
    };
  } else {
    const algoUrl = cfg.algoback_url || URL_ALGOBACK;
    const algoAmbiente = cfg.algoback_ambiente || 'TEST';

    const response = await fetch(algoUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'X-Entorno': algoAmbiente,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eCFPayload),
    });

    const responseData = (await response.json().catch(() => null)) as IAlgoBackRespuesta | null;
    if (!response.ok) {
      const errMsg = responseData?.error || responseData?.mensaje || `Error HTTP ${response.status}`;
      throw httpError(response.status || 502, `AlgoBack: ${String(errMsg)}`);
    }

    resultadoEnvio = {
      trackId: (responseData?.trackId || responseData?.track_id || null) as string | null,
      estado: String(responseData?.estado || 'Enviado'),
      codigoSeguridad: (responseData?.codigoSeguridad || responseData?.codigo_seguridad || null) as string | null,
      qrUrl: null,
      xmlFirmado: null,
      ambiente: algoAmbiente,
      respuestaJson: responseData,
    };
  }

  const { trackId, estado, codigoSeguridad, qrUrl, xmlFirmado, ambiente: ambienteAlmacenado, respuestaJson } = resultadoEnvio;

  // Calcular totales para almacenar
  let montoGravado = 0;
  let montoExento = 0;
  let totalItbis = 0;
  for (const d of detalles.rows) {
    const montoItem = money(Number(d.cantidad) * Number(d.precio_unitario));
    const tasa = Number(d.tasa_itbis ?? 0);
    if (tasa === 0) {
      montoExento += montoItem;
    } else {
      // Precios sin ITBIS: base = monto de la línea; el ITBIS se suma.
      montoGravado += montoItem;
      totalItbis += money((montoItem * tasa) / 100);
    }
  }

  await db.query(
    `INSERT INTO e_cf_comprobantes
     (cuenta_id, tipo_cf, ncf, track_id, estado, rnc_emisor, rnc_receptor, monto_total,
      enviado_en, respuesta_json, ambiente, tipo_emision, codigo_seguridad,
      tipo_pago, monto_exento, monto_gravado, total_itbis, proveedor_ecf,
      qr_url, xml_firmado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, 1, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [cuentaId, tipoCF, cta.ncf, trackId, estado, normalizarRNC(cfg.rnc_emisor), cta.rnc_cedula_cliente || null,
      cta.total, JSON.stringify(respuestaJson), ambienteAlmacenado, codigoSeguridad, tipoPago,
      montoExento, montoGravado, totalItbis, proveedor, qrUrl, xmlFirmado]
  );

  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ENVIAR_ECF',
    entidad: 'e_cf_comprobantes',
    entidadId: cuentaId,
    detalle: { trackId, estado, tipoCF: tipoECF, proveedor },
    ip: clientIp(req),
  });
  res.json({ mensaje: `e-CF enviado exitosamente. Track ID: ${String(trackId)}`, trackId, estado, codigoSeguridad, proveedor });
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
