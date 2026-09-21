/**
 * @file Router KDS: streams SSE (Cocina y Mesas) con autenticación por token de
 * sesión (?token=), pedidos pendientes por categoría (Cocina/Bar) y despacho de
 * detalles de cuenta. Rutas con prefijo /api completo; listas para
 * app.use(kdsRouter).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { sseClients, sseMesaClients, notificarKDS } from '../lib/sse.js';
import { consumirTicketSse } from '../lib/sseTickets.js';
import { UserRole } from '../types/index.js';
import { SQL_JOIN_CATEGORIA_PRODUCTO, sqlProductoEsBar } from '../services/destinoProducto.js';

const router = Router();

/** Fila de pedido pendiente para la pantalla KDS (GET /api/kds/:categoria/pedidos). */
interface IPedidoKDSFila {
  detalle_id: number;
  cantidad: number;
  hora_pedido: Date;
  notas: string | null;
  guarnicion: string | null;
  termino: string | null;
  producto: string;
  categoria: string | null;
  mesa: string;
}

/**
 * Middleware de los streams SSE: exige token de sesión en ?token= delegado en
 * requireAuth. Seguridad (H2): se eliminó el fallback por solo deviceId, que
 * permitía leer pedidos sin autenticación conociendo un device_id activo.
 */
async function autenticarSse(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Preferido: ticket efímero de un solo uso (no expone el token en la URL).
  const ticket = consumirTicketSse(String(req.query.ticket || '').trim());
  if (ticket) {
    req.auth = {
      userId: ticket.userId,
      nombre: ticket.nombre,
      userRole: ticket.userRole as UserRole,
      empresaId: ticket.empresaId,
      isDueno: ticket.isDueno,
      ip: clientIp(req) || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    const ctx = ticket.isDueno ? { platform: true, empresaId: 1 } : { empresaId: ticket.empresaId };
    return runWithRequestContext(ctx, () => next());
  }
  // Compatibilidad: token de sesión en ?token=.
  const token = String(req.query.token || '').trim();
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
    await requireAuth(req, res, next);
    return;
  }
  res.status(401).json({ error: 'Sesión no válida o vencida.' });
}

/**
 * Middleware de los endpoints KDS: exige Authorization o ?token= delegado en
 * requireAuth. Seguridad (H2): sin fallback por deviceId.
 */
async function autorizarKDS(req: Request, res: Response, next: NextFunction): Promise<void> {
  const value = req.get('authorization') || (req.query.token ? `Bearer ${req.query.token}` : '');
  if (value) {
    req.headers.authorization = value;
    await requireAuth(req, res, next);
    return;
  }
  res.status(401).json({ error: 'Sesión no válida o vencida.' });
}

// GET /api/kds/stream (SSE Cocina): suscribe la respuesta y la retira al cerrarse
router.get('/api/kds/stream', autenticarSse, (req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// GET /api/mesas/stream (SSE Mesas): suscribe la respuesta y la retira al cerrarse
router.get('/api/mesas/stream', autenticarSse, (req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
  sseMesaClients.add(res);
  req.on('close', () => {
    sseMesaClients.delete(res);
  });
});

// GET /api/kds/:categoria/pedidos (Cocina o Bar): pendientes sin anular de cuentas abiertas.
// El destino sigue al GRUPO de la categoría del producto (alimentos → Cocina, bebidas → Bar); ver destinoProducto.ts.
router.get('/api/kds/:categoria/pedidos', autorizarKDS, route(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const categoria = String(req.params.categoria);
  if (categoria !== 'Cocina' && categoria !== 'Bar') {throw httpError(400, 'La pantalla debe ser Cocina o Bar.');}
  const result = await db.query<IPedidoKDSFila>(
    `SELECT cd.id AS detalle_id, cd.cantidad, cd.hora_pedido, cd.notas, cd.guarnicion, cd.termino, p.nombre AS producto, p.categoria, COALESCE(m.nombre_numero, 'Para llevar') AS mesa
     FROM cuenta_detalles cd
     JOIN cuentas c ON c.id = cd.cuenta_id
     LEFT JOIN mesas m ON m.id = c.mesa_id
     JOIN productos p ON p.id = cd.producto_id
     ${SQL_JOIN_CATEGORIA_PRODUCTO}
     WHERE COALESCE(cd.estado_cocina, 'Pendiente') = 'Pendiente'
       AND cd.anulado_en IS NULL
       AND c.estado = 'Abierta'
       AND ${sqlProductoEsBar()} = ($1 = 'Bar')
     ORDER BY cd.hora_pedido ASC`,
    [categoria]
  );
  res.json(result.rows);
}));

// PUT /api/kds/despachar/:id: marca listo un detalle pendiente y notifica a las pantallas KDS
router.put('/api/kds/despachar/:id', autorizarKDS, route(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'Detalle');
  const result = await db.query(
    `UPDATE cuenta_detalles SET estado_cocina = 'Despachado' WHERE id = $1 AND COALESCE(estado_cocina, 'Pendiente') = 'Pendiente' AND anulado_en IS NULL`,
    [id]
  );
  if (!result.rowCount) {throw httpError(404, 'Pedido no encontrado o ya despachado.');}
  if (req.auth && req.auth.userId > 0) {
    await registrarAuditoria(db, {
      usuarioId: req.auth.userId,
      accion: 'DESPACHAR_PEDIDO',
      entidad: 'cuenta_detalles',
      entidadId: id,
      ip: clientIp(req),
    });
  }
  notificarKDS('pedido_despachado');
  res.json({ mensaje: 'Pedido marcado como listo/despachado.' });
}));

export default router;
