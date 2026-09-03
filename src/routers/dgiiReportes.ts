/**
 * @file Router de exportadores oficiales DGII: reporte 607 (Ventas de Bienes
 * y Servicios) y 606 (Compras y Gastos) en JSON, TXT o CSV, con nombres de
 * archivo y cabeceras de descarga legacy. Puerto directo de server.js
 * (legacy: 607 ~3509-3557, 606 ~3559-3624). Middleware Administrador-o-Dueño
 * (token de Dueño o sesión de Administrador). Rutas con prefijo /api
 * completo; listo para app.use(dgiiReportesRouter).
 */

import { Router, Request, Response } from 'express';
import { route } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAdminODueno } from '../middleware/auth.js';
import {
  COLS_607,
  COLS_606,
  formatearFila607,
  formatearFila606,
  serializarTXT,
  serializarCSV,
} from '../lib/dgii.js';
import type { IVenta607, IGasto606, FilaDGII } from '../lib/dgii.js';

const router = Router();

/** Fila cruda de cuentas para el reporte 607 (valores de pg). */
interface ICuenta607Fila {
  id: number;
  ncf: string | null;
  tipo_comprobante: string | null;
  rnc_cedula_cliente: string | null;
  subtotal: string | null;
  itbis: string | null;
  propina: string | null;
  total: string | null;
  metodo_pago: string | null;
  metodo_pago_2: string | null;
  monto_pago_2: string | null;
  fecha_cierre: Date | null;
  fecha_apertura: Date | null;
}

/** Fila cruda de inventario_movimientos para el reporte 606 (valores de pg). */
interface IMovimiento606Fila {
  id: string;
  cantidad: string | null;
  costo_unitario: string | null;
  fecha: Date | null;
}

/** RNC y razón social del emisor (dgii_config) para cabeceras/nombres de archivo. */
interface IEmisorRncFila {
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
}

/**
 * Mismo día local de un Date de pg en texto 'YYYY-MM-DDT00:00:00': fechaDGII
 * lo re-parsea como hora local y extrae el mismo año/mes/día que el Date.
 */
function fechaLocalTexto(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}T00:00:00`;
}

/** Adapter: fila pg del 607 → IVenta607 (coerciones que espera formatearFila607). */
function aFila607(fila: ICuenta607Fila): IVenta607 {
  return {
    ncf: fila.ncf ?? undefined,
    rnc_cedula_cliente: fila.rnc_cedula_cliente ?? undefined,
    subtotal: fila.subtotal === null ? undefined : Number(fila.subtotal),
    itbis: fila.itbis === null ? undefined : Number(fila.itbis),
    propina: fila.propina === null ? undefined : Number(fila.propina),
    total: fila.total === null ? undefined : Number(fila.total),
    metodo_pago: fila.metodo_pago ?? undefined,
    fecha_cierre: fila.fecha_cierre === null ? undefined : fechaLocalTexto(fila.fecha_cierre),
    fecha_apertura: fila.fecha_apertura === null ? undefined : fechaLocalTexto(fila.fecha_apertura),
  };
}

/** Adapter: fila pg del 606 → IGasto606 (coerciones que espera formatearFila606). */
function aFila606(fila: IMovimiento606Fila): IGasto606 {
  return {
    id: Number(fila.id),
    cantidad: fila.cantidad === null ? undefined : Number(fila.cantidad),
    costo_unitario: fila.costo_unitario === null ? undefined : Number(fila.costo_unitario),
    fecha: fila.fecha === null ? undefined : fechaLocalTexto(fila.fecha),
  };
}

/** Descarga el archivo con Content-Type y nombre oficial legacy DGII_F_*. */
function enviarArchivo(
  res: Response,
  tipo: string,
  rncEmisor: string,
  periodo: string,
  contenido: string,
  extension: 'txt' | 'csv'
): void {
  res.setHeader('Content-Type', extension === 'txt' ? 'text/plain; charset=utf-8' : 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="DGII_F_${tipo}_${rncEmisor}_${periodo}.${extension}"`);
  res.send(contenido);
}

// GET /api/dgii/reporte-607 (Administrador o Dueño): ventas por NCF del período.
router.get('/api/dgii/reporte-607', requireAdminODueno, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const anio = parseInt(String(req.query.anio || ''), 10) || new Date().getFullYear();
  const mes = String(req.query.mes || new Date().getMonth() + 1).padStart(2, '0');
  const formato = String(req.query.formato || 'json').toLowerCase();

  const cfg = await db.query<IEmisorRncFila>('SELECT rnc_emisor, razon_social_emisor FROM dgii_config ORDER BY id LIMIT 1');
  const rncEmisor = (cfg.rows[0]?.rnc_emisor || '000000000').replace(/[^0-9]/g, '');

  const inicioMes = `${anio}-${mes}-01 00:00:00`;
  const finMes = `${anio}-${mes}-${new Date(anio, parseInt(mes, 10), 0).getDate()} 23:59:59`;

  const ventas = await db.query<ICuenta607Fila>(
    `SELECT
       c.id, c.ncf_ecf_generado AS ncf, c.tipo_comprobante, c.rnc_cedula_cliente,
       c.subtotal, c.itbis, c.propina, c.total, c.metodo_pago, c.metodo_pago_2, c.monto_pago_2,
       c.fecha_cierre, c.fecha_apertura
     FROM cuentas c
     WHERE c.estado = 'Cerrada'
       AND COALESCE(c.fecha_cierre, c.fecha_apertura) BETWEEN $1 AND $2
       AND c.ncf_ecf_generado IS NOT NULL
     ORDER BY COALESCE(c.fecha_cierre, c.fecha_apertura) ASC`,
    [inicioMes, finMes]
  );

  const periodo = `${anio}${mes}`;
  const filas: FilaDGII[] = ventas.rows.map((fila) => formatearFila607(aFila607(fila)));

  if (formato === 'txt') {
    enviarArchivo(res, '607', rncEmisor, periodo, serializarTXT('607', rncEmisor, periodo, filas, COLS_607), 'txt');
    return;
  }

  if (formato === 'csv') {
    enviarArchivo(res, '607', rncEmisor, periodo, serializarCSV(filas, COLS_607), 'csv');
    return;
  }

  res.json({
    periodo,
    rncEmisor,
    totalRegistros: filas.length,
    registros: filas,
  });
}));

// GET /api/dgii/reporte-606 (Administrador o Dueño): compras y gastos del período.
router.get('/api/dgii/reporte-606', requireAdminODueno, route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const anio = parseInt(String(req.query.anio || ''), 10) || new Date().getFullYear();
  const mes = String(req.query.mes || new Date().getMonth() + 1).padStart(2, '0');
  const formato = String(req.query.formato || 'json').toLowerCase();

  const cfg = await db.query<IEmisorRncFila>('SELECT rnc_emisor, razon_social_emisor FROM dgii_config ORDER BY id LIMIT 1');
  const rncEmisor = (cfg.rows[0]?.rnc_emisor || '000000000').replace(/[^0-9]/g, '');
  const periodo = `${anio}${mes}`;

  const gastos = await db.query<IMovimiento606Fila>(
    `SELECT
       im.id, im.cantidad, im.motivo, im.fecha,
       i.nombre AS ingrediente_nombre, i.costo_unitario
     FROM inventario_movimientos im
     JOIN ingredientes i ON i.id = im.ingrediente_id
     WHERE im.tipo_movimiento IN ('Entrada', 'Ajuste Positivo')
       AND TO_CHAR(im.fecha, 'YYYYMM') = $1
     ORDER BY im.fecha ASC`,
    [periodo]
  );

  const filas: FilaDGII[] = gastos.rows.map((fila) => formatearFila606(aFila606(fila)));

  if (formato === 'txt') {
    enviarArchivo(res, '606', rncEmisor, periodo, serializarTXT('606', rncEmisor, periodo, filas, COLS_606), 'txt');
    return;
  }

  if (formato === 'csv') {
    enviarArchivo(res, '606', rncEmisor, periodo, serializarCSV(filas, COLS_606), 'csv');
    return;
  }

  res.json({
    periodo,
    rncEmisor,
    totalRegistros: filas.length,
    registros: filas,
  });
}));

export default router;
