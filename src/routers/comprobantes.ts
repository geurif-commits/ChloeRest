/**
 * @file Comprobantes fiscales para la caja: qué tipos se pueden emitir hoy (según la fecha en que el e-CF pasa a ser
 * obligatorio y las secuencias disponibles) y los datos para imprimir el comprobante de una cuenta cobrada, con el
 * timbre de la DGII cuando ya lo devolvió.
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { ROLES_CAJA } from '../lib/roles.js';
import { TIPOS_COMPROBANTE, TIPOS_ECF_VENTA, TIPOS_NCF_TRADICIONALES } from '../lib/comprobantes.js';
import { datosRepresentacion, emitirEcfDeCuenta, estadoFiscal } from '../services/ecfEmisionService.js';

const router = Router();

interface ISecuenciaTradicionalFila {
  tipo_comprobante: string;
  restantes: string;
}

// GET /api/comprobantes/estado (caja): tipos de comprobante que se pueden elegir al cobrar y el estado del corte al e-CF.
router.get('/api/comprobantes/estado', requireAuth, requireRoles(...ROLES_CAJA), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const fiscal = await estadoFiscal(db);
  const obligatorio = fiscal.corte.obligatorio;
  const tradicionales = await db.query<ISecuenciaTradicionalFila>(
    `SELECT tipo_comprobante, (secuencia_final - secuencia_actual + 1)::text AS restantes
       FROM dgii_secuencias
      WHERE activa = TRUE AND fecha_vencimiento >= CURRENT_DATE AND secuencia_actual <= secuencia_final AND tipo_comprobante LIKE 'B%'
      ORDER BY id`
  );

  const electronicos = TIPOS_ECF_VENTA.map((codigo) => {
    const t = fiscal.tipos.find((x) => x.codigo === codigo);
    return { ...TIPOS_COMPROBANTE[codigo], disponible: Boolean(t?.disponible), restantes: t?.restantes ?? null };
  });
  // El NCF tradicional solo se ofrece mientras siga siendo válido.
  const ncf = obligatorio
    ? []
    : TIPOS_NCF_TRADICIONALES.map((codigo) => {
      const fila = tradicionales.rows.find((s) => s.tipo_comprobante === codigo);
      return { ...TIPOS_COMPROBANTE[codigo], disponible: Boolean(fila), restantes: fila ? Number(fila.restantes) : null };
    });
  const tipos = [...electronicos, ...ncf];

  // Antes del corte se sigue con B02 si hay secuencia (el e-CF puede estar aún en certificación); desde el corte, E32.
  const porDefecto = obligatorio
    ? 'E32'
    : ncf.find((t) => t.codigo === 'B02')?.disponible ? 'B02' : 'E32';

  res.set('Cache-Control', 'no-store');
  res.json({
    corte: fiscal.corte,
    ambiente: fiscal.ambiente,
    proveedor: fiscal.proveedor,
    listoParaEcf: fiscal.listo,
    porDefecto,
    tipos,
  });
}));

// GET /api/cuentas/:id/comprobante (caja): datos para imprimir el comprobante de una cuenta cobrada.
// ?actualizar=1 vuelve a consultar a la DGII si el e-CF aún no tiene timbre (reimpresión desde el historial).
router.get('/api/cuentas/:id/comprobante', requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const cuentaId = positiveInteger(req.params.id, 'Cuenta');
  let datos = await datosRepresentacion(cuentaId);
  if (!datos) {throw httpError(404, 'La cuenta no existe, no está cobrada o no tiene comprobante.');}
  if (datos.electronico && datos.pendiente && String(req.query.actualizar || '') === '1') {
    await emitirEcfDeCuenta(cuentaId, { esperaMs: 6000 });
    datos = (await datosRepresentacion(cuentaId)) ?? datos;
  }
  res.set('Cache-Control', 'no-store');
  res.json(datos);
}));

export default router;
