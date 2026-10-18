/**
 * @file Panel del propietario: cupo de equipos por licencia (ya en uso) y su historial de cambios.
 * Solo el propietario de la plataforma.
 */

import { Router, Request, Response } from 'express';
import { route, httpError, clientIp } from '../lib/core.js';
import { requireDueno } from '../middleware/auth.js';
import {
  cambiarCupoLicencia,
  historialLicencia,
  validarCambioCupo,
} from '../services/licenciaCupoService.js';

const router = Router();

function idDe(valor: unknown, etiqueta: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {throw httpError(400, `${etiqueta} no es válido.`);}
  return id;
}

// PUT /api/dueno/licencias/:id/cupo { max_dispositivos, motivo, desactivar?: [idEquipo] }
router.put('/api/dueno/licencias/:id/cupo', requireDueno, route(async (req: Request, res: Response) => {
  const entrada = validarCambioCupo((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>);
  const resultado = await cambiarCupoLicencia({
    ...entrada,
    licenciaId: idDe(req.params.id, 'Licencia'),
    actor: 'Propietario',
    ip: clientIp(req),
  });
  res.json({ ok: true, mensaje: 'Cupo de la licencia actualizado.', ...resultado });
}));

// GET /api/dueno/licencias/:id/historial
router.get('/api/dueno/licencias/:id/historial', requireDueno, route(async (req: Request, res: Response) => {
  res.json({ historial: await historialLicencia(idDe(req.params.id, 'Licencia')) });
}));

export default router;
