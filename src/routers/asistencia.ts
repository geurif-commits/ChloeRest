/**
 * @file Router de turnos y asistencia del personal.
 *
 * - Marcaje público por PIN (pantalla de login, modo "Marcar turno"): identifica al
 *   empleado, propone ENTRADA o SALIDA y solo registra al confirmar.
 * - Consulta y corrección para el Administrador (panel "Turnos y Asistencia").
 */

import { Router, Request, Response } from 'express';
import { route, httpError, positiveInteger, clientIp } from '../lib/core.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { verifyPin } from '../services/authService.js';
import { verificarBloqueo, registrarFallo, registrarExito } from '../services/seguridadService.js';
import { ROLES_ADMIN } from '../lib/roles.js';
import {
  SEGUNDOS_MIN_ENTRE_MARCAS,
  TURNOS,
  etiquetaTurno,
  minutosSalidaAnticipada,
  minutosTarde,
  minutosTrabajados,
  salidaProgramada,
  turnoOlvidado,
  turnoParaEntrada,
} from '../services/asistenciaService.js';

const router = Router();

interface IUsuarioPinFila {
  id: number;
  nombre: string;
  rol: string;
  pin_hash: string | null;
}

interface ITurnoAbiertoFila {
  id: number;
  turno: string;
  entrada: Date;
}

interface IRegistroFila {
  id: number;
  usuario_id: number;
  usuario_nombre: string;
  usuario_rol: string;
  turno: string;
  entrada: Date;
  salida: Date | null;
  cerrado_auto: boolean;
  editado: boolean;
  notas: string | null;
}

/** Enriquece una fila con horas trabajadas y alertas de puntualidad. */
function enriquecer(fila: IRegistroFila): Record<string, unknown> {
  const entrada = new Date(fila.entrada);
  const salida = fila.salida ? new Date(fila.salida) : null;
  return {
    ...fila,
    turno_etiqueta: etiquetaTurno(fila.turno),
    minutos_trabajados: salida ? minutosTrabajados(entrada, salida) : null,
    minutos_tarde: minutosTarde(fila.turno, entrada),
    minutos_salida_anticipada: salida ? minutosSalidaAnticipada(fila.turno, entrada, salida) : 0,
  };
}

const SQL_REGISTROS = `
  SELECT t.id, t.usuario_id, u.nombre AS usuario_nombre, u.rol AS usuario_rol, t.turno, t.entrada, t.salida,
         t.cerrado_auto, t.editado, t.notas
    FROM turnos_empleados t
    JOIN usuarios u ON u.id = t.usuario_id`;

/** Identifica al empleado por PIN dentro del tenant del dispositivo. */
async function identificarEmpleado(req: Request): Promise<{ empresaId: number; usuario: IUsuarioPinFila }> {
  const db = getDatabase();
  const ip = clientIp(req);
  const deviceId = String(req.get('x-device-id') || req.body.deviceId || '').trim();
  const pin = String(req.body.pin || '').trim();
  if (!deviceId) {throw httpError(400, 'Identificador de dispositivo requerido.');}
  if (!/^\d{4,12}$/.test(pin)) {throw httpError(400, 'PIN inválido.');}

  const claves = ['ip:' + (ip || 'unknown'), 'dev:' + deviceId];
  await verificarBloqueo(claves);

  const device = await db.queryUnscoped<{ empresa_id: number | null; estado: string | null }>(
    'SELECT empresa_id, estado FROM dispositivos WHERE device_id = $1',
    [deviceId]
  );
  if (!device.rowCount || device.rows[0].estado !== 'Activo') {
    throw httpError(403, 'Este equipo no está activado para registrar turnos.');
  }
  const empresaId = device.rows[0].empresa_id || 1;

  const candidatos = await db.queryUnscoped<IUsuarioPinFila>(
    "SELECT id, nombre, rol, pin_hash FROM usuarios WHERE (empresa_id = $1 OR empresa_id IS NULL) AND estado = 'Activo' AND pin_hash IS NOT NULL",
    [empresaId]
  );
  const coincidencias = candidatos.rows.filter((c) => verifyPin(pin, c.pin_hash));
  if (coincidencias.length !== 1) {
    await registrarFallo(claves);
    throw httpError(401, coincidencias.length > 1 ? 'PIN duplicado. Contacta al administrador.' : 'PIN incorrecto.');
  }
  await registrarExito(claves);
  return { empresaId, usuario: coincidencias[0] };
}

// POST /api/asistencia/marcar (público, equipo activado): { pin, deviceId, confirmar? }
router.post('/api/asistencia/marcar', route(async (req: Request, res: Response) => {
  const { empresaId, usuario } = await identificarEmpleado(req);
  const confirmar = req.body.confirmar === true;
  const ahora = new Date();

  await runWithRequestContext({ empresaId }, async () => {
    const db = getDatabase();
    const abierto = await db.query<ITurnoAbiertoFila>(
      'SELECT id, turno, entrada FROM turnos_empleados WHERE usuario_id = $1 AND salida IS NULL ORDER BY id DESC LIMIT 1',
      [usuario.id]
    );
    let previo = abierto.rows[0];
    let autocerrar = false;
    if (previo && turnoOlvidado(new Date(previo.entrada), ahora)) {
      autocerrar = true;
      previo = undefined as unknown as ITurnoAbiertoFila;
    }

    const base = {
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      ahora: ahora.toISOString(),
    };

    // ── SALIDA ──
    if (previo) {
      const entrada = new Date(previo.entrada);
      if (confirmar && (ahora.getTime() - entrada.getTime()) / 1000 < SEGUNDOS_MIN_ENTRE_MARCAS) {
        throw httpError(409, 'Acabas de registrar tu entrada. Espera un minuto antes de marcar la salida.');
      }
      const detalle = {
        accion: 'salida',
        turno: previo.turno,
        turnoEtiqueta: etiquetaTurno(previo.turno),
        entrada: entrada.toISOString(),
        minutosTrabajados: minutosTrabajados(entrada, ahora),
        salidaAnticipadaMin: minutosSalidaAnticipada(previo.turno, entrada, ahora),
      };
      if (!confirmar) {
        res.json({ ...base, ...detalle, preview: true });
        return;
      }
      await db.query('UPDATE turnos_empleados SET salida = $2, salida_ip = $3 WHERE id = $1 AND salida IS NULL', [previo.id, ahora, clientIp(req)]);
      await registrarAuditoria(db, { usuarioId: usuario.id, accion: 'TURNO_SALIDA', entidad: 'turnos_empleados', entidadId: previo.id, detalle, ip: clientIp(req) });
      res.json({ ...base, ...detalle, preview: false, registrado: true });
      return;
    }

    // ── ENTRADA ──
    const turno = turnoParaEntrada(ahora);
    const detalle = {
      accion: 'entrada',
      turno,
      turnoEtiqueta: etiquetaTurno(turno),
      tardeMin: minutosTarde(turno, ahora),
      turnoAnteriorOlvidado: autocerrar,
    };
    if (!confirmar) {
      res.json({ ...base, ...detalle, preview: true });
      return;
    }
    if (autocerrar) {
      const olvidado = abierto.rows[0];
      await db.query(
        'UPDATE turnos_empleados SET salida = $2, cerrado_auto = TRUE WHERE id = $1 AND salida IS NULL',
        [olvidado.id, salidaProgramada(olvidado.turno, new Date(olvidado.entrada))]
      );
    }
    const insertado = await db.query<{ id: number }>(
      'INSERT INTO turnos_empleados (empresa_id, usuario_id, turno, entrada, entrada_ip) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [empresaId, usuario.id, turno, ahora, clientIp(req)]
    );
    await registrarAuditoria(db, { usuarioId: usuario.id, accion: 'TURNO_ENTRADA', entidad: 'turnos_empleados', entidadId: insertado.rows[0].id, detalle, ip: clientIp(req) });
    res.json({ ...base, ...detalle, preview: false, registrado: true });
  });
}));

// GET /api/asistencia/turnos (Administrador): definición de turnos
router.get('/api/asistencia/turnos', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  res.json(TURNOS.map((t) => ({ id: t.id, etiqueta: t.etiqueta })));
}));

// GET /api/asistencia/en-turno (Administrador): personal con turno abierto
router.get('/api/asistencia/en-turno', requireAuth, requireRoles(...ROLES_ADMIN), route(async (_req: Request, res: Response) => {
  const db = getDatabase();
  const result = await db.query<IRegistroFila>(`${SQL_REGISTROS} WHERE t.salida IS NULL ORDER BY t.entrada`);
  res.json(result.rows.map(enriquecer));
}));

// GET /api/asistencia?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&usuario_id= (Administrador)
router.get('/api/asistencia', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const haceDosSemanas = new Date(Date.now() - 4 * 3600_000 - 13 * 86400_000).toISOString().slice(0, 10);
  const desde = esFecha(req.query.desde) ? req.query.desde : haceDosSemanas;
  const hasta = esFecha(req.query.hasta) ? req.query.hasta : hoy;
  // Rango [desde 00:00, hasta+1 00:00) en hora local de RD (UTC-4), como instantes:
  // así el filtro no depende de la zona horaria del proceso ni de la BD.
  const inicioLocal = (fechaIso: string, sumarDias = 0): Date => {
    const [a, m, d] = fechaIso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + sumarDias, 4, 0, 0));
  };
  const valores: unknown[] = [inicioLocal(desde), inicioLocal(hasta, 1)];
  let filtroUsuario = '';
  if (req.query.usuario_id !== undefined && req.query.usuario_id !== '') {
    valores.push(positiveInteger(req.query.usuario_id, 'usuario_id'));
    filtroUsuario = ` AND t.usuario_id = $${valores.length}`;
  }
  const result = await db.query<IRegistroFila>(
    `${SQL_REGISTROS}
      WHERE t.entrada >= $1 AND t.entrada < $2${filtroUsuario}
      ORDER BY t.entrada DESC
      LIMIT 2000`,
    valores
  );
  res.json({ desde, hasta, registros: result.rows.map(enriquecer) });
}));

/** Valida y normaliza un instante recibido del cliente. */
function fechaObligatoria(valor: unknown, campo: string): Date {
  const d = new Date(String(valor || ''));
  if (Number.isNaN(d.getTime())) {throw httpError(400, `${campo} no es una fecha válida.`);}
  if (d.getTime() > Date.now() + 5 * 60_000) {throw httpError(400, `${campo} no puede estar en el futuro.`);}
  return d;
}

// POST /api/asistencia/manual (Administrador): registra un turno olvidado
router.post('/api/asistencia/manual', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const usuarioId = positiveInteger(req.body.usuario_id, 'usuario_id');
  const entrada = fechaObligatoria(req.body.entrada, 'La entrada');
  const salida = req.body.salida ? fechaObligatoria(req.body.salida, 'La salida') : null;
  if (salida && salida <= entrada) {throw httpError(400, 'La salida debe ser posterior a la entrada.');}
  const notas = String(req.body.notas || '').trim().slice(0, 300);
  if (!notas) {throw httpError(400, 'Indica el motivo del registro manual.');}
  const usuario = await db.query<{ id: number }>('SELECT id FROM usuarios WHERE id = $1', [usuarioId]);
  if (!usuario.rowCount) {throw httpError(404, 'Empleado no encontrado.');}
  const turno = turnoParaEntrada(entrada);
  const empresaId = req.auth!.empresaId || 1;
  const insertado = await db.query<{ id: number }>(
    'INSERT INTO turnos_empleados (empresa_id, usuario_id, turno, entrada, salida, editado, notas) VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id',
    [empresaId, usuarioId, turno, entrada, salida, notas]
  );
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'TURNO_MANUAL',
    entidad: 'turnos_empleados',
    entidadId: insertado.rows[0].id,
    detalle: { usuarioId, turno, notas },
    ip: clientIp(req),
  });
  res.json({ id: insertado.rows[0].id, mensaje: 'Registro creado.' });
}));

// PUT /api/asistencia/:id (Administrador): corrige entrada/salida con motivo auditado
router.put('/api/asistencia/:id', requireAuth, requireRoles(...ROLES_ADMIN), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const id = positiveInteger(req.params.id, 'id');
  const actual = await db.query<{ id: number; entrada: Date; salida: Date | null; turno: string }>(
    'SELECT id, entrada, salida, turno FROM turnos_empleados WHERE id = $1',
    [id]
  );
  if (!actual.rowCount) {throw httpError(404, 'Registro no encontrado.');}
  const fila = actual.rows[0];
  const entrada = req.body.entrada ? fechaObligatoria(req.body.entrada, 'La entrada') : new Date(fila.entrada);
  let salida: Date | null = fila.salida ? new Date(fila.salida) : null;
  if (req.body.salida === null || req.body.salida === '') {salida = null;}
  else if (req.body.salida) {salida = fechaObligatoria(req.body.salida, 'La salida');}
  if (salida && salida <= entrada) {throw httpError(400, 'La salida debe ser posterior a la entrada.');}
  const notas = String(req.body.notas || '').trim().slice(0, 300);
  if (!notas) {throw httpError(400, 'Indica el motivo de la corrección.');}
  const turno = turnoParaEntrada(entrada);
  await db.query(
    'UPDATE turnos_empleados SET entrada = $2, salida = $3, turno = $4, editado = TRUE, cerrado_auto = FALSE, notas = $5 WHERE id = $1',
    [id, entrada, salida, turno, notas]
  );
  await registrarAuditoria(db, {
    usuarioId: req.auth!.userId,
    accion: 'TURNO_CORREGIDO',
    entidad: 'turnos_empleados',
    entidadId: id,
    detalle: {
      antes: { entrada: fila.entrada, salida: fila.salida, turno: fila.turno },
      despues: { entrada, salida, turno },
      notas,
    },
    ip: clientIp(req),
  });
  res.json({ mensaje: 'Registro actualizado.' });
}));

export default router;
