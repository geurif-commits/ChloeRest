/**
 * @file Venta rápida (mostrador / para llevar): POST /api/ventas/rapida crea la cuenta 'Para Llevar' y la
 * cobra en un solo paso (ver services/ventaRapidaService.ts). Solo roles de caja: cobrar es cosa de caja.
 */

import { Router, Request, Response } from 'express';
import { route, clientIp } from '../lib/core.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { cobrarVentaRapida } from '../services/ventaRapidaService.js';
import { notificarKDS } from '../lib/sse.js';
import { ROLES_CAJA } from '../lib/roles.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('ventasRouter');

// POST /api/ventas/rapida: { comanda: [{id, cantidad, notas?, guarnicion?, termino?}], cliente_nombre?, cliente_telefono?,
// enviar_a_cocina? (por defecto true) + los mismos campos de pago que /api/cuentas/:id/cerrar }.
router.post('/api/ventas/rapida', requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const cuerpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { recibo, cuentaId, enviadaACocina } = await cobrarVentaRapida({
    actor: { id: req.auth!.userId, nombre: req.auth!.nombre },
    body: cuerpo,
    req,
  });
  await registrarAuditoria(getDatabase(), {
    usuarioId: req.auth!.userId,
    accion: 'VENTA_RAPIDA',
    entidad: 'cuentas',
    entidadId: cuentaId,
    detalle: { comprobante: recibo.comprobante, total: recibo.total, enviadaACocina },
    ip: clientIp(req),
  });
  logger.info({ action: 'VENTA_RAPIDA', userId: req.auth!.userId, cuentaId, ncf: recibo.comprobante });
  if (enviadaACocina) {notificarKDS('nuevo_pedido');}
  res.status(201).json({
    mensaje: 'Venta registrada e inventario actualizado.',
    ncf: recibo.comprobante,
    comprobante: recibo.comprobante,
    cuenta_id: cuentaId,
    totales: {
      subtotalBruto: recibo.subtotalBruto,
      descuento: recibo.descuento,
      subtotal: recibo.subtotal,
      itbis: recibo.itbis,
      propina: recibo.propina,
      total: recibo.total,
    },
  });
}));

export default router;
