/**
 * @file Router DGII: configuración e-CF, secuencias NCF, validación de RNC,
 * alertas de secuencias y datos del emisor. Puerto directo de server.js
 * (legacy: config ~3093-3149, secuencias ~3264-3302, validar-rnc ~3303-3309,
 * alertas ~3451-3469, emisor ~3490-3508). Rutas con prefijo /api completo;
 * listo para app.use(dgiiRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { ROLES_ADMIN } from '../lib/roles.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { normalizarRNC, validarRNC } from '../lib/rnc.js';

const router = Router();

/** URL por defecto del proveedor AlgoBack (constante del legacy). */
const URL_ALGOBACK = 'https://api-dgii.algoback.com/ecf/procesar-factura';

/** Fila de GET /api/dgii/config (sin secretos; con flags de configuración). */
interface IDgiiConfigFila {
  id: number;
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
  ambiente: string | null;
  url_servicio_dgii: string | null;
  client_id: string | null;
  estado_ecf: string | null;
  proveedor_ecf: string | null;
  algoback_url: string | null;
  algoback_ambiente: string | null;
  client_secret_configurado: boolean;
  certificado_configurado: boolean;
  algoback_api_key_configurada: boolean;
}

/** Fila de dgii_secuencias (SELECT *, valores crudos de pg). */
interface ISecuenciaFila {
  id: number;
  tipo_comprobante: string;
  prefijo: string;
  secuencia_inicial: string;
  secuencia_actual: string;
  secuencia_final: string;
  fecha_vencimiento: Date;
  activa: boolean;
}

/** Fila de alertas de secuencia (restantes viene como texto por ser BIGINT). */
interface ISecuenciaAlertaFila {
  id: number;
  tipo_comprobante: string;
  prefijo: string;
  secuencia_actual: string;
  secuencia_final: string;
  fecha_vencimiento: Date;
  restantes: string;
  dias_restantes: number;
}

/** Fila de dgii_config para GET /api/dgii/emisor. */
interface IEmisorFila {
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
  direccion_emisor: string | null;
  telefono_emisor: string | null;
  email_emisor: string | null;
  regimen_fiscal: string | null;
  ambiente: string | null;
  estado_ecf: string | null;
}

// GET /api/dgii/config (Administrador): configuración e-CF guardada o vacía.
router.get('/api/dgii/config', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<IDgiiConfigFila>(
    `SELECT id, rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii,
            client_id, estado_ecf, proveedor_ecf, algoback_url, algoback_ambiente,
            (client_secret IS NOT NULL AND client_secret <> '') AS client_secret_configurado,
            (clave_certificado IS NOT NULL AND clave_certificado <> '') AS certificado_configurado,
            (algoback_api_key IS NOT NULL AND algoback_api_key <> '') AS algoback_api_key_configurada
       FROM dgii_config ORDER BY id LIMIT 1`
  );
  if (!result.rowCount) {
    res.json({
      rnc_emisor: '',
      razon_social_emisor: '',
      ambiente: 'Pruebas',
      url_servicio_dgii: 'https://ecf.dgii.gov.do/fe/autenticacion/api/autenticacion',
      client_id: '',
      client_secret: '',
      clave_certificado: '',
      client_secret_configurado: false,
      certificado_configurado: false,
      algoback_api_key_configurada: false,
      estado_ecf: 'Pendiente de Certificación',
      proveedor_ecf: 'algoback',
      algoback_api_key: '',
      algoback_url: URL_ALGOBACK,
      algoback_ambiente: 'TEST',
    });
    return;
  }
  res.json(result.rows[0]);
}));

// POST /api/dgii/config (Administrador): crea o actualiza la configuración e-CF.
router.post('/api/dgii/config', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const {
    rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii, client_id,
    client_secret, clave_certificado, estado_ecf, proveedor_ecf,
    algoback_api_key, algoback_url, algoback_ambiente,
  } = req.body;
  const current = await db.query<{ id: number }>('SELECT id FROM dgii_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query(
      `UPDATE dgii_config
       SET rnc_emisor=$1, razon_social_emisor=$2, ambiente=$3, url_servicio_dgii=$4,
           client_id=$5, client_secret=COALESCE(NULLIF($6, ''), client_secret),
           clave_certificado=COALESCE(NULLIF($7, ''), clave_certificado), estado_ecf=$8, actualizado_en=CURRENT_TIMESTAMP,
           proveedor_ecf=$10, algoback_api_key=$11, algoback_url=$12, algoback_ambiente=$13
       WHERE id=$9`,
      [rnc_emisor, razon_social_emisor, ambiente || 'Pruebas', url_servicio_dgii, client_id,
        client_secret, clave_certificado, estado_ecf || 'Pendiente de Certificación', current.rows[0].id,
        proveedor_ecf || 'algoback', algoback_api_key || '', algoback_url || URL_ALGOBACK, algoback_ambiente || 'TEST']
    );
  } else {
    await db.query(
      `INSERT INTO dgii_config
       (rnc_emisor, razon_social_emisor, ambiente, url_servicio_dgii, client_id, client_secret, clave_certificado, estado_ecf,
        proveedor_ecf, algoback_api_key, algoback_url, algoback_ambiente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [rnc_emisor, razon_social_emisor, ambiente || 'Pruebas', url_servicio_dgii, client_id,
        client_secret, clave_certificado, estado_ecf || 'Pendiente de Certificación',
        proveedor_ecf || 'algoback', algoback_api_key || '', algoback_url || URL_ALGOBACK, algoback_ambiente || 'TEST']
    );
  }
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ACTUALIZAR_DGII_ECF',
    entidad: 'dgii_config',
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Configuración de Facturación Electrónica e-CF (DGII) guardada correctamente.' });
}));

// GET /api/dgii/secuencias (Administrador): lista secuencias NCF configuradas.
router.get('/api/dgii/secuencias', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<ISecuenciaFila>('SELECT * FROM dgii_secuencias ORDER BY id');
  res.json(result.rows);
}));

// POST /api/dgii/secuencias (Administrador): crea o actualiza una secuencia NCF.
router.post('/api/dgii/secuencias', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const tipo = String(req.body.tipo_comprobante || '').trim();
  const prefijo = String(req.body.prefijo || '').trim();
  const inicial = Number(req.body.secuencia_inicial || 1);
  const actual = Number(req.body.secuencia_actual || inicial);
  const secuenciaFinal = Number(req.body.secuencia_final || 99999999);
  const vencimiento = String(req.body.fecha_vencimiento || '').trim();
  if (!tipo || !prefijo || !vencimiento) {
    throw httpError(400, 'Tipo, prefijo y fecha de vencimiento son obligatorios.');
  }

  if (req.body.id) {
    await db.query(
      `UPDATE dgii_secuencias SET tipo_comprobante=$1, prefijo=$2, secuencia_inicial=$3, secuencia_actual=$4, secuencia_final=$5, fecha_vencimiento=$6, activa=$7 WHERE id=$8`,
      [tipo, prefijo, inicial, actual, secuenciaFinal, vencimiento, req.body.activa !== false, req.body.id]
    );
  } else {
    await db.query(
      `INSERT INTO dgii_secuencias (tipo_comprobante, prefijo, secuencia_inicial, secuencia_actual, secuencia_final, fecha_vencimiento, activa) VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
      [tipo, prefijo, inicial, actual, secuenciaFinal, vencimiento]
    );
  }
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'GUARDAR_SECUENCIA_NCF',
    entidad: 'dgii_secuencias',
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Secuencia NCF guardada correctamente.' });
}));

// DELETE /api/dgii/secuencias/:id (Administrador): elimina una secuencia NCF.
router.delete('/api/dgii/secuencias/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Secuencia');
  await db.query('DELETE FROM dgii_secuencias WHERE id = $1', [id]);
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ELIMINAR_SECUENCIA_NCF',
    entidad: 'dgii_secuencias',
    entidadId: id,
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Secuencia eliminada.' });
}));

// GET /api/dgii/validar-rnc/:rnc (Administrador): valida RNC/Cédula de RD.
router.get('/api/dgii/validar-rnc/:rnc', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const rnc = normalizarRNC(req.params.rnc);
  const valido = validarRNC(rnc);
  res.json({ rnc, valido, longitud: rnc.length });
}));

// GET /api/dgii/secuencias/alertas (Administrador): secuencias agotadas o por vencer.
router.get('/api/dgii/secuencias/alertas', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<ISecuenciaAlertaFila>(`
    SELECT id, tipo_comprobante, prefijo, secuencia_actual, secuencia_final,
           fecha_vencimiento,
           (secuencia_final - secuencia_actual) AS restantes,
           (fecha_vencimiento - CURRENT_DATE) AS dias_restantes
    FROM dgii_secuencias
    WHERE activa = TRUE
    ORDER BY secuencia_final - secuencia_actual ASC
  `);
  const alertas = result.rows.map((r) => ({
    ...r,
    alerta_agotamiento: Number(r.restantes) < 1000,
    alerta_vencimiento: r.dias_restantes < 30,
  }));
  res.json(alertas);
}));

// GET /api/dgii/emisor (Administrador): datos del emisor para e-CF.
router.get('/api/dgii/emisor', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<IEmisorFila>(
    'SELECT rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor, email_emisor, regimen_fiscal, ambiente, estado_ecf FROM dgii_config ORDER BY id LIMIT 1'
  );
  res.json(result.rows[0] || {});
}));

// PUT /api/dgii/emisor (Administrador): actualiza datos del emisor.
router.put('/api/dgii/emisor', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const {
    rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor,
    email_emisor, regimen_fiscal,
  } = req.body;
  const current = await db.query<{ id: number }>('SELECT id FROM dgii_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query(
      `UPDATE dgii_config SET rnc_emisor=$1, razon_social_emisor=$2, direccion_emisor=$3, telefono_emisor=$4, email_emisor=$5, regimen_fiscal=$6, actualizado_en=CURRENT_TIMESTAMP WHERE id=$7`,
      [rnc_emisor, razon_social_emisor, direccion_emisor, telefono_emisor, email_emisor, regimen_fiscal || 'Ordinario', current.rows[0].id]
    );
  }
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ACTUALIZAR_EMISOR',
    entidad: 'dgii_config',
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Datos del emisor actualizados.' });
}));

export default router;
