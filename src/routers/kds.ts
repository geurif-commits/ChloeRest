/**
 * @file Router KDS: streams SSE (Cocina y Mesas) con autenticación por token de
 * sesión (?token=) o deviceId activo, pedidos pendientes por categoría
 * (Cocina/Bar) y despacho de detalles de cuenta. Puerto directo de server.js
 * (legacy, líneas ~2100-2211). Rutas con prefijo /api completo; listas para
 * app.use(kdsRouter).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { sseClients, sseMesaClients, notificarKDS } from '../lib/sse.js';

const router = Router();

/** Fila de dispositivos consultada al autenticar por deviceId (query sin RLS, como el legacy). */
interface IDispositivoSseFila {
  empresa_id: number;
  estado: string;
}

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
 * Busca un dispositivo por deviceId y devuelve su fila solo si está Activo.
 * Devuelve null si no existe, está inactivo o falla la consulta (el legacy
 * degradaba a 401 con .catch(() => ({ rowCount: 0 }))).
 */
async function buscarDispositivoActivo(deviceId: string): Promise<IDispositivoSseFila | null> {
  const db = getDatabase();
  try {
    const result = await db.queryUnscoped<IDispositivoSseFila>(
      'SELECT empresa_id, estado FROM dispositivos WHERE device_id = $1',
      [deviceId]
    );
    if (result.rowCount && result.rows[0].estado === 'Activo') {return result.rows[0];}
    return null;
  } catch {
    return null;
  }
}

/**
 * Fija req.auth como estación KDS ficticia del deviceId (usuario 0, rol
 * 'Cocina') y corre el resto de la cadena dentro del tenant de la empresa.
 */
function continuarComoEstacionKDS(req: Request, next: NextFunction, empresaId: number): void {
  req.auth = {
    userId: 0,
    nombre: 'Estación KDS',
    userRole: 'Cocina',
    empresaId,
    isDueno: false,
    ip: clientIp(req) || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
  };
  runWithRequestContext({ empresaId }, () => next());
}

/**
 * Middleware de los streams SSE (réplica de autenticarSse legacy): token de
 * sesión en ?token= delegado en requireAuth, o dispositivo Activo por
 * ?deviceId=/x-device-id; si no hay ninguno, 401.
 */
async function autenticarSse(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = String(req.query.token || '').trim();
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
    await requireAuth(req, res, next);
    return;
  }
  const deviceId = String(req.query.deviceId || req.get('x-device-id') || '').trim();
  if (deviceId) {
    const dev = await buscarDispositivoActivo(deviceId);
    if (dev) {
      continuarComoEstacionKDS(req, next, dev.empresa_id);
      return;
    }
  }
  res.status(401).json({ error: 'Sesión no válida o vencida.' });
}

/**
 * Middleware de los endpoints KDS (réplica de autorizarKDS legacy): Authorization
 * o ?token= delegado en requireAuth, o dispositivo Activo; si no hay ninguno, 401.
 */
async function autorizarKDS(req: Request, res: Response, next: NextFunction): Promise<void> {
  const value = req.get('authorization') || (req.query.token ? `Bearer ${req.query.token}` : '');
  if (value) {
    req.headers.authorization = value;
    await requireAuth(req, res, next);
    return;
  }
  const deviceId = String(req.get('x-device-id') || req.query.deviceId || '').trim();
  if (deviceId) {
    const dev = await buscarDispositivoActivo(deviceId);
    if (dev) {
      continuarComoEstacionKDS(req, next, dev.empresa_id);
      return;
    }
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
         ($1 = 'Cocina' AND (
           p.categoria IS NULL 
           OR (
             LOWER(TRIM(p.categoria)) NOT IN ('bar', 'bebida', 'bebidas', 'licor', 'licores', 'trago', 'tragos', 'coctel', 'cocteles', 'cerveza', 'cervezas', 'vino', 'vinos', 'refrescos', 'jugos')
             AND LOWER(p.categoria) NOT LIKE '%bebida%'
             AND LOWER(p.categoria) NOT LIKE '%bar%'
             AND LOWER(p.categoria) NOT LIKE '%coctel%'
             AND LOWER(p.categoria) NOT LIKE '%trago%'
           )
         ))
         OR
         ($1 = 'Bar' AND (
           LOWER(TRIM(p.categoria)) IN ('bar', 'bebida', 'bebidas', 'licor', 'licores', 'trago', 'tragos', 'coctel', 'cocteles', 'cerveza', 'cervezas', 'vino', 'vinos', 'refrescos', 'jugos')
           OR LOWER(p.categoria) LIKE '%bebida%'
           OR LOWER(p.categoria) LIKE '%bar%'
           OR LOWER(p.categoria) LIKE '%coctel%'
           OR LOWER(p.categoria) LIKE '%trago%'
           OR LOWER(p.categoria) LIKE '%licor%'
           OR LOWER(p.categoria) LIKE '%cerveza%'
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
