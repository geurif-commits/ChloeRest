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

// GET /api/kds/:categoria/pedidos (Cocina o Bar): pendientes sin anular de cuentas abiertas
router.get('/api/kds/:categoria/pedidos', autorizarKDS, route(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const categoria = String(req.params.categoria);
  const result = await db.query<IPedidoKDSFila>(
    `SELECT cd.id AS detalle_id, cd.cantidad, cd.hora_pedido, cd.notas, cd.guarnicion, cd.termino, p.nombre AS producto, p.categoria, COALESCE(m.nombre_numero, 'Para llevar') AS mesa
     FROM cuenta_detalles cd
     JOIN cuentas c ON c.id = cd.cuenta_id
     LEFT JOIN mesas m ON m.id = c.mesa_id
     JOIN productos p ON p.id = cd.producto_id
     WHERE COALESCE(cd.estado_cocina, 'Pendiente') = 'Pendiente'
       AND cd.anulado_en IS NULL
       AND c.estado = 'Abierta'
       AND (
         ($1 = 'Bar' AND (
           LOWER(TRIM(COALESCE(p.tipo_destino, ''))) = 'bar'
           OR LOWER(TRIM(COALESCE(p.categoria, ''))) IN (
             'bar', 'bebida', 'bebidas', 'licor', 'licores', 'trago', 'tragos',
             'coctel', 'cocteles', 'cóctel', 'cócteles', 'cerveza', 'cervezas',
             'vino', 'vinos', 'ron', 'rones', 'whisky', 'whiskey', 'vodka',
             'tequila', 'refresco', 'refrescos', 'jugo', 'jugos', 'malta',
             'soda', 'agua', 'champagne', 'brandy', 'ginebra', 'gin',
             'mojito', 'margarita', 'sangria', 'sangría', 'ponche', 'batida',
             'frappe', 'frappé', 'batido', 'batidos', 'limonada', 'tamarindo',
             'chinola', 'mabi'
           )
           OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ' LIKE '% bebida%'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% bar %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% coctel %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% trago %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% licor %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% cerveza %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% jugo %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% refresco %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% vino %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% ron %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% whisky %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% whiskey %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% vodka %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% tequila %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% malta %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% soda %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% champagne %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% mojito %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% margarita %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% sangria %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% ponche %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% batida %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% batido %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% frappe %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% limonada %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% tamarindo %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% chinola %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% mabi %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% brandy %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% ginebra %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% gin %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% morir %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% cóctel %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% sangría %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% frappé %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% mabí %')
         ))
         OR
         ($1 = 'Cocina' AND NOT (
           LOWER(TRIM(COALESCE(p.tipo_destino, ''))) = 'bar'
           OR LOWER(TRIM(COALESCE(p.categoria, ''))) IN (
             'bar', 'bebida', 'bebidas', 'licor', 'licores', 'trago', 'tragos',
             'coctel', 'cocteles', 'cóctel', 'cócteles', 'cerveza', 'cervezas',
             'vino', 'vinos', 'ron', 'rones', 'whisky', 'whiskey', 'vodka',
             'tequila', 'refresco', 'refrescos', 'jugo', 'jugos', 'malta',
             'soda', 'agua', 'champagne', 'brandy', 'ginebra', 'gin',
             'mojito', 'margarita', 'sangria', 'sangría', 'ponche', 'batida',
             'frappe', 'frappé', 'batido', 'batidos', 'limonada', 'tamarindo',
             'chinola', 'mabi'
           )
           OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ' LIKE '% bebida%'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% bar %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% coctel %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% trago %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% licor %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% cerveza %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% jugo %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% refresco %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% vino %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% ron %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% whisky %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% whiskey %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% vodka %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% tequila %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% malta %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% soda %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% champagne %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% mojito %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% margarita %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% sangria %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% ponche %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% batida %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% batido %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% frappe %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% limonada %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% tamarindo %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% chinola %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% mabi %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% brandy %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% ginebra %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% gin %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% morir %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% cóctel %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% sangría %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% frappé %'
             OR (' ' || LOWER(COALESCE(p.categoria, '')) || ' ') LIKE '% mabí %')
         ))
       )
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
