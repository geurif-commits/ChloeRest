/**
 * @file Router de Reportes: facturas cerradas (lista y filtro), ventas de hoy,
 * reporte de cierre del turno y dashboard. Puerto directo de server.js
 * (legacy, líneas ~2908-3006 y ~3179-3201). Rutas con prefijo /api completo;
 * listas para app.use(reportesRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { ROLES_ADMIN, ROLES_CAJA } from '../lib/roles.js';

const router = Router();

/** Ítem de una factura cerrada (subconsulta JSON de GET /api/reportes/facturas). */
interface IFacturaItemFila {
  id: number;
  nombre: string;
  cantidad: number;
  precio: number;
}

/** Fila de GET /api/reportes/facturas (factura cerrada con sus items). */
interface IFacturaConItemsFila {
  id: number;
  mesa_id: number | null;
  mesa_nombre: string;
  camarero_nombre: string | null;
  cajero_nombre: string | null;
  subtotal: string | null;
  itbis: string | null;
  propina: string | null;
  total: string | null;
  metodo_pago: string | null;
  tipo_comprobante: string | null;
  ncf_ecf_generado: string | null;
  rnc_cedula_cliente: string | null;
  fecha_cierre: Date | null;
  items: IFacturaItemFila[];
}

/** Fila de GET /api/reportes/facturas/filtro (factura con NCF generado o REC-). */
interface IFacturaFiltroFila {
  ncf: string;
  tipo_comprobante: string | null;
  metodo_pago: string | null;
  mesa: string;
  camarero: string | null;
  cajero: string | null;
  subtotal: string | null;
  itbis: string | null;
  propina: string | null;
  total: string | null;
  fecha_cierre: Date | null;
}

/** Totales agregados del filtro (siempre una fila con ceros). */
interface ITotalesFacturasFila {
  cantidad: string;
  subtotal: string;
  itbis: string;
  propina: string;
  total: string;
}

/** Desglose por método de pago (cantidad/total en texto tal como los devuelve pg). */
interface IDesgloseMetodoFila {
  metodo_pago: string;
  cantidad: string;
  total: string | null;
}

/** Totales del día de GET /api/reportes/hoy. */
interface ITotalesHoyFila {
  subtotal: string;
  itbis: string;
  propina: string;
  total: string;
}

/** Desglose por método de pago del día (GET /api/reportes/hoy). */
interface IDesgloseHoyFila {
  metodo_pago: string;
  cantidad_tickets: string;
  total_recaudado: string | null;
}

/** Totales generales del reporte de cierre del día. */
interface ITotalesCierreFila {
  subtotal: string;
  itbis: string;
  propina: string;
  total: string;
  total_facturas: string;
}

/** Fila fiscal (por tipo de comprobante) del reporte de cierre. */
interface IFiscalCierreFila {
  tipo_comprobante: string | null;
  cantidad: string;
  total: string | null;
}

/** Factura detallada del reporte de cierre (NCF o REC-). */
interface IFacturaCierreFila {
  ncf: string;
  tipo_comprobante: string | null;
  subtotal: string | null;
  itbis: string | null;
  propina: string | null;
  total: string | null;
  mesa: string;
}

/** Resumen del dashboard del día (GET /api/reportes/dashboard). */
interface IResumenDashboardFila {
  total_ventas: string;
  total_facturas: string;
  ticket_promedio: string;
}

/** Conteo de mesas por estado del dashboard. */
interface IMesaEstadoFila {
  estado: string;
  cantidad: string;
}

/** Producto más vendido del día (dashboard). */
interface ITopProductoFila {
  nombre: string;
  total_vendidos: string | null;
}

/** Valida una fecha ISO yyyy-mm-dd real (patrón del legacy). */
function esFechaValida(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// GET /api/reportes/facturas (Cajero): últimas 100 facturas cerradas con items
router.get('/api/reportes/facturas', requireAuth, requireRoles(...ROLES_CAJA), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<IFacturaConItemsFila>(
    `SELECT 
      c.id,
      c.mesa_id,
      COALESCE(m.nombre_numero, 'Para llevar') AS mesa_nombre,
      u.nombre AS camarero_nombre,
      j.nombre AS cajero_nombre,
      c.subtotal,
      c.itbis,
      c.propina,
      c.total,
      c.metodo_pago,
      c.tipo_comprobante,
      c.ncf_ecf_generado,
      c.rnc_cedula_cliente,
      c.fecha_cierre,
      (
        SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
          'id', cd.id,
          'nombre', p.nombre,
          'cantidad', cd.cantidad,
          'precio', cd.precio_unitario
        )), '[]'::json)
        FROM cuenta_detalles cd
        JOIN productos p ON p.id = cd.producto_id
        WHERE cd.cuenta_id = c.id AND cd.anulado_en IS NULL
      ) AS items
    FROM cuentas c
    LEFT JOIN mesas m ON m.id = c.mesa_id
    LEFT JOIN usuarios u ON u.id = c.camarero_id
    LEFT JOIN usuarios j ON j.id = c.cajero_id
    WHERE c.estado = 'Cerrada'
    ORDER BY c.fecha_cierre DESC
    LIMIT 100
  `);
  res.json(result.rows);
}));

// GET /api/reportes/facturas/filtro (Administrador): facturas + totales + desglose
router.get('/api/reportes/facturas/filtro', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const { desde, hasta, metodo_pago } = req.query;
  const condiciones: string[] = ["c.estado = 'Cerrada'"];
  const parametros: unknown[] = [];
  if (desde) {
    if (!esFechaValida(desde)) {throw httpError(400, 'La fecha inicial (desde) no es válida.');}
    parametros.push(desde);
    condiciones.push(`c.fecha_cierre::date >= $${parametros.length}::date`);
  }
  if (hasta) {
    if (!esFechaValida(hasta)) {throw httpError(400, 'La fecha final (hasta) no es válida.');}
    parametros.push(hasta);
    condiciones.push(`c.fecha_cierre::date <= $${parametros.length}::date`);
  }
  const metodosValidos = ['Efectivo', 'Tarjeta', 'Transferencia'];
  if (metodo_pago && metodo_pago !== 'Todos') {
    if (typeof metodo_pago !== 'string' || !metodosValidos.includes(metodo_pago)) {
      throw httpError(400, 'Método de pago no válido.');
    }
    parametros.push(metodo_pago);
    condiciones.push(`c.metodo_pago = $${parametros.length}`);
  }
  const where = `WHERE ${condiciones.join(' AND ')}`;
  const [facturas, totales, desglose] = await Promise.all([
    db.query<IFacturaFiltroFila>(
      `SELECT COALESCE(c.ncf_ecf_generado, CONCAT('REC-', LPAD(c.id::text, 8, '0'))) AS ncf,
        c.tipo_comprobante, c.metodo_pago,
        COALESCE(m.nombre_numero, 'Para llevar') AS mesa,
        u.nombre AS camarero,
        j.nombre AS cajero,
        c.subtotal, c.itbis, c.propina, c.total, c.fecha_cierre
      FROM cuentas c
      LEFT JOIN mesas m ON m.id = c.mesa_id
      LEFT JOIN usuarios u ON u.id = c.camarero_id
      LEFT JOIN usuarios j ON j.id = c.cajero_id
      ${where}
      ORDER BY c.fecha_cierre DESC
      LIMIT 500
    `,
      parametros
    ),
    db.query<ITotalesFacturasFila>(
      `SELECT COUNT(*) AS cantidad,
        COALESCE(SUM(subtotal),0) AS subtotal,
        COALESCE(SUM(itbis),0) AS itbis,
        COALESCE(SUM(propina),0) AS propina,
        COALESCE(SUM(total),0) AS total
      FROM cuentas c
      ${where}
    `,
      parametros
    ),
    db.query<IDesgloseMetodoFila>(
      `SELECT c.metodo_pago, COUNT(*) AS cantidad, SUM(c.total) AS total
      FROM cuentas c ${where} GROUP BY c.metodo_pago
    `,
      parametros
    ),
  ]);
  res.json({ facturas: facturas.rows, totales: totales.rows[0], desgloseMetodos: desglose.rows });
}));

// GET /api/reportes/hoy (Cajero): totales y desglose de ventas de hoy
router.get('/api/reportes/hoy', requireAuth, requireRoles(...ROLES_CAJA), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const [totals, breakdown] = await Promise.all([
    db.query<ITotalesHoyFila>(
      "SELECT COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(propina),0) AS propina, COALESCE(SUM(total),0) AS total FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE"
    ),
    db.query<IDesgloseHoyFila>(
      "SELECT metodo_pago, COUNT(*) AS cantidad_tickets, SUM(total) AS total_recaudado FROM cuentas WHERE estado = 'Cerrada' AND fecha_cierre::date = CURRENT_DATE GROUP BY metodo_pago"
    ),
  ]);
  res.json({ totales: totals.rows[0], desglose: breakdown.rows });
}));

// GET /api/reportes/cierre (Cajero): reporte completo del turno de hoy
router.get('/api/reportes/cierre', requireAuth, requireRoles(...ROLES_CAJA), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const [totals, methods, fiscal, invoices, apertura] = await Promise.all([
    db.query<ITotalesCierreFila>(
      "SELECT COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(propina),0) AS propina, COALESCE(SUM(total),0) AS total, COUNT(*) AS total_facturas FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE"
    ),
    db.query<IDesgloseMetodoFila>(
      "SELECT metodo_pago, COUNT(*) AS cantidad, SUM(total) AS total FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE GROUP BY metodo_pago"
    ),
    db.query<IFiscalCierreFila>(
      "SELECT tipo_comprobante, COUNT(*) AS cantidad, SUM(total) AS total FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE GROUP BY tipo_comprobante"
    ),
    db.query<IFacturaCierreFila>(
      "SELECT COALESCE(c.ncf_ecf_generado, CONCAT('REC-', LPAD(c.id::text, 8, '0'))) AS ncf, c.tipo_comprobante, c.subtotal, c.itbis, c.propina, c.total, COALESCE(m.nombre_numero, 'Para llevar') AS mesa FROM cuentas c LEFT JOIN mesas m ON m.id = c.mesa_id WHERE c.estado='Cerrada' AND c.fecha_cierre::date=CURRENT_DATE ORDER BY c.fecha_cierre DESC"
    ),
    db.query<{ monto_inicial: string }>(
      "SELECT COALESCE(monto_inicial, 0) AS monto_inicial FROM aperturas_caja WHERE fecha::date = CURRENT_DATE AND estado = 'Abierta' ORDER BY id DESC LIMIT 1"
    ),
  ]);
  const montoInicial = Number(apertura.rows[0].monto_inicial || 0);
  res.json({
    totalesGenerales: totals.rows[0],
    desgloseMetodos: methods.rows,
    desgloseFiscal: fiscal.rows,
    facturasDetalladas: invoices.rows,
    montoInicial,
  });
}));

// GET /api/reportes/dashboard (Administrador): resumen del día + mesas + top productos
router.get('/api/reportes/dashboard', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const [summary, tables, products] = await Promise.all([
    db.query<IResumenDashboardFila>(
      "SELECT COALESCE(SUM(total),0) AS total_ventas, COUNT(*) AS total_facturas, COALESCE(AVG(total),0) AS ticket_promedio FROM cuentas WHERE estado='Cerrada' AND fecha_cierre::date=CURRENT_DATE"
    ),
    db.query<IMesaEstadoFila>('SELECT estado, COUNT(*) AS cantidad FROM mesas GROUP BY estado'),
    db.query<ITopProductoFila>(
      "SELECT p.nombre, SUM(cd.cantidad) AS total_vendidos FROM cuenta_detalles cd JOIN cuentas c ON c.id=cd.cuenta_id JOIN productos p ON p.id=cd.producto_id WHERE c.estado='Cerrada' AND cd.anulado_en IS NULL AND c.fecha_cierre::date=CURRENT_DATE GROUP BY p.nombre ORDER BY total_vendidos DESC LIMIT 5"
    ),
  ]);
  res.json({ resumen: summary.rows[0], mesasEstado: tables.rows, topProductos: products.rows });
}));

export default router;
