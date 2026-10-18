/**
 * @file Router KDS: streams SSE (Cocina y Mesas) con autenticación por token de
 * sesión (?token=), pedidos pendientes por categoría (Cocina/Bar) y despacho de
 * detalles de cuenta. Rutas con prefijo /api completo; listas para
 * app.use(kdsRouter).
 */

/* global clearInterval */

import { Router, Request, Response, NextFunction } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { sseClients, sseMesaClients, notificarKDS } from '../lib/sse.js';
import type { ServerResponse } from 'node:http';
import { consumirTicketSse } from '../lib/sseTickets.js';
import { evaluarLicenciaDeAcceso } from '../services/licenciaAccesoService.js';
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
    res.locals.deviceId = ticket.deviceId;
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

/** Cada cuántos segundos un flujo abierto vuelve a comprobar que su equipo sigue teniendo licencia. */
const SEGUNDOS_VIGILANCIA_LICENCIA = Math.max(1, Number(process.env.SSE_LICENCIA_SEGUNDOS ?? 30));

/**
 * Un flujo abierto no vuelve a pasar por la verificación de licencia de cada petición: si el equipo pierde la licencia
 * (vence, se revoca, se borra o se desactiva) mientras el flujo sigue abierto, se le avisa con un evento `licencia` y
 * se cierra. El propietario de la plataforma no depende de licencias de negocio.
 */
function vigilarLicencia(req: Request, res: Response, clientes: Set<ServerResponse>): void {
  if (req.auth?.isDueno) {return;}
  const deviceId = String(res.locals.deviceId ?? req.get('x-device-id') ?? '').trim() || null;
  const empresaId = req.auth?.empresaId ?? null;
  const reloj = setInterval(() => {
    void evaluarLicenciaDeAcceso({ deviceId, empresaId }).then((estado) => {
      if (estado.vigente) {return;}
      try {
        res.write(`event: licencia\ndata: ${JSON.stringify({ codigo: estado.codigo, motivo: estado.motivo })}\n\n`);
        res.end();
      } finally {
        clientes.delete(res);
        clearInterval(reloj);
      }
    }).catch(() => undefined); // un fallo momentáneo de la base no corta el flujo; se reintenta en el siguiente ciclo
  }, SEGUNDOS_VIGILANCIA_LICENCIA * 1000);
  reloj.unref();
  req.on('close', () => clearInterval(reloj));
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
  vigilarLicencia(req, res, sseClients);
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
  vigilarLicencia(req, res, sseMesaClients);
  req.on('close', () => {
    sseMesaClients.delete(res);
  });
});

// GET /api/kds/:categoria/pedidos (Cocina o Bar): pendientes sin anular de cuentas abiertas y de pedidos
// para llevar ya cobrados en las últimas 12 h (se pagan al ordenar, pero siguen en cocina hasta despacharse).
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
       AND (c.estado = 'Abierta'
            OR (c.tipo_servicio = 'Para Llevar' AND c.estado = 'Cerrada' AND c.fecha_cierre >= NOW() - INTERVAL '12 hours'))
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
