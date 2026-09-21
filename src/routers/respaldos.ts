/**
 * @file Respaldos de la base de datos: listar, crear ahora y descargar.
 * Un respaldo contiene los datos de TODOS los negocios de la base, así que solo lo gestiona el
 * propietario de la plataforma; en instalaciones de un solo negocio (BACKUP_TENANT_ACCESS=1) también
 * su Administrador.
 */

import path from 'node:path';
import { Router, Request, Response, NextFunction } from 'express';
import { route, httpError, clientIp } from '../lib/core.js';
import { config } from '../lib/config.js';
import { getDatabase } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { crearRespaldo, esNombreDeRespaldo, listarRespaldos, localizarHerramienta } from '../services/backupService.js';

const router = Router();

const accesoRespaldos = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth) {return next(httpError(401, 'Autenticación requerida', 'NO_AUTH'));}
  if (req.auth.isDueno) {return next();}
  if (config.backup.tenantAccess && req.auth.userRole === 'Administrador') {return next();}
  return next(httpError(403, 'No tienes permiso para gestionar respaldos.', 'FORBIDDEN'));
};

// GET /api/respaldos: estado de los respaldos automáticos y lista de archivos.
router.get('/api/respaldos', requireAuth, accesoRespaldos, route(async (_req: Request, res: Response) => {
  res.json({
    automaticos: config.backup.enabled,
    hora: config.backup.hour,
    retencionDias: config.backup.retentionDays,
    copiaExternaConfigurada: config.backup.copyDir !== null,
    herramientaDisponible: localizarHerramienta('pg_dump') !== null,
    respaldos: listarRespaldos(config.backup.dir),
  });
}));

// POST /api/respaldos: crea un respaldo ahora (se verifica antes de responder).
router.post('/api/respaldos', requireAuth, accesoRespaldos, route(async (req: Request, res: Response) => {
  let respaldo;
  try {
    respaldo = await crearRespaldo();
  } catch (error) {
    throw httpError(500, error instanceof Error ? error.message : 'No se pudo crear el respaldo.', 'RESPALDO_FALLIDO');
  }
  await registrarAuditoria(getDatabase(), {
    usuarioId: req.auth!.userId,
    accion: 'CREAR_RESPALDO',
    entidad: 'respaldos',
    detalle: { nombre: respaldo.nombre, bytes: respaldo.bytes, copiaExterna: respaldo.copiaExterna },
    ip: clientIp(req),
  });
  const mensaje = respaldo.copiaExterna === 'fallida'
    ? 'Respaldo creado y verificado, pero no se pudo copiar a la carpeta externa (revisa que esté disponible).'
    : 'Respaldo creado y verificado.';
  res.status(201).json({ mensaje, respaldo });
}));

// GET /api/respaldos/:nombre: descarga (solo nombres válidos dentro de la carpeta de respaldos).
router.get('/api/respaldos/:nombre', requireAuth, accesoRespaldos, route(async (req: Request, res: Response) => {
  const nombre = String(req.params.nombre || '');
  if (!esNombreDeRespaldo(nombre) || !listarRespaldos(config.backup.dir).some((r) => r.nombre === nombre)) {
    throw httpError(404, 'Respaldo no encontrado.');
  }
  res.download(path.join(config.backup.dir, nombre), nombre);
}));

export default router;
