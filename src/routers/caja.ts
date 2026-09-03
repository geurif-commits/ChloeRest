/**
 * @file Router de Caja: estado de apertura del día, apertura, cierre con
 * reporte de turno, historial de cierres y arqueo de caja. Puerto directo de
 * server.js (legacy, líneas ~3007-3092 y ~3150-3178). Rutas con prefijo /api
 * completo; listas para app.use(cajaRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, money, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { ROLES_ADMIN, ROLES_CAJA } from '../lib/roles.js';

const router = Router();

/** Fila de aperturas_caja del día (a.* + nombre del usuario, GET /api/caja/estado). */
interface IAperturaCajaFila {
  id: number;
  usuario_id: number;
  monto_inicial: string;
  notas: string | null;
  fecha: Date;
  estado: string;
  usuario_nombre?: string;
}

/** Apertura vigente consultada al cerrar (SELECT parcial; {} si no hay turno). */
interface IAperturaTurnoFila {
  id?: number;
  usuario_id?: number;
  monto_inicial?: string;
  fecha?: Date;
}

/** Totales de ventas del día consultados al cerrar la caja. */
interface IVentasTurnoFila {
  total_facturas?: string;
  subtotal?: string;
  itbis?: string;
  propina?: string;
  total?: string;
  efectivo?: string;
  tarjeta?: string;
  transferencia?: string;
}

/** Desglose por método de pago (cantidad/total en texto tal como los devuelve pg). */
interface IDesgloseMetodoFila {
  metodo_pago: string;
  cantidad: string;
  total: string | null;
}

/** Fila guardada en historial_cierres (INSERT ... RETURNING * y GET /api/caja/cierres). */
interface IHistorialCierreFila {
  id: number;
  fecha_cierre?: Date;
  fecha_apertura?: Date;
  monto_inicial?: string;
  total_ventas?: string;
  efectivo?: string;
  tarjeta?: string;
  transferencia?: string;
  total_itbis?: string;
  total_propina?: string;
  total_facturas?: string;
  efectivo_contado?: string;
  diferencia_efectivo?: string;
  notas?: string | null;
  detalle_json?: unknown;
}

/** Resumen por método de pago consultado en el arqueo. */
interface IArqueoResumenFila {
  efectivo_sistema: string;
  tarjeta_sistema: string;
  transferencia_sistema: string;
}

/** Valida una fecha ISO yyyy-mm-dd real (patrón del legacy). */
function esFechaValida(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// GET /api/caja/estado (Cajero): apertura vigente del día
router.get('/api/caja/estado', requireAuth, requireRoles(...ROLES_CAJA), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<IAperturaCajaFila>(
    "SELECT a.*, u.nombre AS usuario_nombre FROM aperturas_caja a JOIN usuarios u ON u.id = a.usuario_id WHERE a.fecha::date = CURRENT_DATE ORDER BY a.id DESC LIMIT 1"
  );
  if (!result.rowCount) {
    res.json({ abierta: false, monto_inicial: 0 });
    return;
  }
  res.json({
    abierta: result.rows[0].estado === 'Abierta',
    apertura: result.rows[0],
    monto_inicial: Number(result.rows[0].monto_inicial),
  });
}));

// POST /api/caja/apertura (Cajero): abre caja para el día
router.post('/api/caja/apertura', requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const initialAmount = money(req.body.monto_inicial);
  if (!Number.isFinite(initialAmount) || initialAmount < 0) {
    throw httpError(400, 'El monto inicial de apertura debe ser un número mayor o igual a 0.');
  }
  const notes = String(req.body.notas || '').trim();
  await db.query("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE fecha::date = CURRENT_DATE");
  const result = await db.query<IAperturaCajaFila>(
    "INSERT INTO aperturas_caja (usuario_id, monto_inicial, notas, fecha, estado) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'Abierta') RETURNING *",
    [req.auth!.userId, initialAmount, notes]
  );
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'ABRIR_CAJA',
    entidad: 'aperturas_caja',
    detalle: { initialAmount },
    ip: clientIp(req),
  });
  res.json({
    mensaje: 'Apertura de caja registrada correctamente.',
    apertura: result.rows[0],
    abierta: true,
    monto_inicial: initialAmount,
  });
}));

// POST /api/caja/cierre (Cajero): reporte del turno + cierre de la apertura
router.post('/api/caja/cierre', requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const efectivoContado = money(req.body.efectivo_contado || 0);
  const notas = String(req.body.notas || '').trim();

  // Generar reporte completo del turno antes de cerrar
  const [apertura, ventas, desgloseMetodos] = await Promise.all([
    db.query<IAperturaTurnoFila>(
      "SELECT id, usuario_id, monto_inicial, fecha FROM aperturas_caja WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta' ORDER BY id DESC LIMIT 1"
    ),
    db.query<IVentasTurnoFila>(
      `SELECT COUNT(*) AS total_facturas, COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(propina),0) AS propina, COALESCE(SUM(total),0) AS total,
        COALESCE(SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END),0) AS efectivo,
        COALESCE(SUM(CASE WHEN metodo_pago = 'Tarjeta' THEN total ELSE 0 END),0) AS tarjeta,
        COALESCE(SUM(CASE WHEN metodo_pago = 'Transferencia' THEN total ELSE 0 END),0) AS transferencia
        FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE`
    ),
    db.query<IDesgloseMetodoFila>(
      "SELECT metodo_pago, COUNT(*) AS cantidad, SUM(total) AS total FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE GROUP BY metodo_pago"
    ),
  ]);

  const aperturaData: IAperturaTurnoFila = apertura.rows[0] || {};
  const ventasData: IVentasTurnoFila = ventas.rows[0] || {};
  const montoInicial = Number(aperturaData.monto_inicial || 0);
  const efectivoEsperado = montoInicial + Number(ventasData.efectivo || 0);
  const diferencia = efectivoContado > 0 ? money(efectivoContado - efectivoEsperado) : 0;

  const detalleJson = {
    desgloseMetodos: desgloseMetodos.rows,
    apertura: aperturaData,
    ventas: ventasData,
    efectivoContado,
    efectivoEsperado,
    diferencia,
  };

  // Guardar en historial
  const cierreResult = await db.query<IHistorialCierreFila>(
    `INSERT INTO historial_cierres 
     (usuario_id, usuario_nombre, fecha_apertura, monto_inicial, total_ventas, efectivo, tarjeta, transferencia, total_itbis, total_propina, total_facturas, efectivo_contado, diferencia_efectivo, notas, detalle_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [req.auth!.userId, req.auth!.nombre, aperturaData.fecha || new Date(), montoInicial, ventasData.total || 0,
      ventasData.efectivo || 0, ventasData.tarjeta || 0, ventasData.transferencia || 0,
      ventasData.itbis || 0, ventasData.propina || 0, ventasData.total_facturas || 0,
      efectivoContado, diferencia, notas, JSON.stringify(detalleJson)]
  );

  // Cerrar apertura
  await db.query("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta'");

  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'CERRAR_CAJA',
    entidad: 'historial_cierres',
    entidadId: cierreResult.rows[0].id,
    detalle: { totalVentas: ventasData.total, efectivo: ventasData.efectivo },
    ip: clientIp(req),
  });

  res.json({ mensaje: 'Caja cerrada correctamente. Reporte generado.', cierre: cierreResult.rows[0] });
}));

// GET /api/caja/cierres (Administrador): historial con filtro de fechas opcional
router.get('/api/caja/cierres', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const { desde, hasta } = req.query;
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (desde && esFechaValida(desde)) {
    parametros.push(desde);
    condiciones.push(`fecha_cierre::date >= $${parametros.length}::date`);
  }
  if (hasta && esFechaValida(hasta)) {
    parametros.push(hasta);
    condiciones.push(`fecha_cierre::date <= $${parametros.length}::date`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const result = await db.query<IHistorialCierreFila>(
    `SELECT * FROM historial_cierres ${where} ORDER BY fecha_cierre DESC LIMIT 200`,
    parametros
  );
  res.json(result.rows);
}));

// POST /api/caja/arqueo (Cajero): conteo físico de caja vs sistema (DOP/USD/EUR)
router.post('/api/caja/arqueo', requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const cashCountDop = money(req.body.efectivo_contado || 0);
  const usdCount = money(req.body.usd_contado || 0);
  const tasaUsd = money(req.body.tasa_usd || 60.00);
  const eurCount = money(req.body.eur_contado || 0);
  const tasaEur = money(req.body.tasa_eur || 65.00);

  const usdEnDop = money(usdCount * tasaUsd);
  const eurEnDop = money(eurCount * tasaEur);
  const totalCashCountDop = money(cashCountDop + usdEnDop + eurEnDop);

  const [summary, apertura] = await Promise.all([
    db.query<IArqueoResumenFila>(
      `SELECT COALESCE(SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END),0) AS efectivo_sistema, COALESCE(SUM(CASE WHEN metodo_pago = 'Tarjeta' THEN total ELSE 0 END),0) AS tarjeta_sistema, COALESCE(SUM(CASE WHEN metodo_pago = 'Transferencia' THEN total ELSE 0 END),0) AS transferencia_sistema FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE`
    ),
    db.query<{ monto_inicial: string }>(
      "SELECT COALESCE(monto_inicial, 0) AS monto_inicial FROM aperturas_caja WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta' ORDER BY id DESC LIMIT 1"
    ),
  ]);
  const values = summary.rows[0];
  const montoInicial = Number(apertura.rows[0].monto_inicial || 0);
  const efectivoEsperado = money(montoInicial + Number(values.efectivo_sistema));
  const difference = money(totalCashCountDop - efectivoEsperado);

  await db.query(
    `INSERT INTO arqueos_caja (usuario_id, efectivo_sistema, efectivo_contado, diferencia_efectivo, tarjeta_sistema, tarjeta_reportado, transferencia_sistema, transferencia_reportado, usd_contado, tasa_usd, eur_contado, tasa_eur, notas, fecha) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)`,
    [req.auth!.userId, values.efectivo_sistema, totalCashCountDop, difference, values.tarjeta_sistema, req.body.tarjeta_reportado || values.tarjeta_sistema, values.transferencia_sistema, req.body.transferencia_reportado || values.transferencia_sistema, usdCount, tasaUsd, eurCount, tasaEur, String(req.body.notas || '')]
  );
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'REGISTRAR_ARQUEO',
    entidad: 'arqueos_caja',
    detalle: { difference },
    ip: clientIp(req),
  });
  res.json({
    mensaje: 'Arqueo registrado.',
    resumen: {
      efectivoSistema: values.efectivo_sistema,
      montoInicial,
      efectivoEsperado,
      efectivoContado: totalCashCountDop,
      diferencia: difference,
      usdCount,
      usdEnDop,
      eurCount,
      eurEnDop,
    },
  });
}));

export default router;
