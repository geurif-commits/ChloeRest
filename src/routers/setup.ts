/**
 * @file Router del Setup Wizard: registro inicial del negocio y personalización
 * (POST /api/setup/registro y POST /api/setup/completar). Puerto directo de
 * server.js (legacy). Rutas públicas con prefijo /api completo; listas para
 * app.use(setupRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError } from '../lib/core.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { uploadImagenesSistema, validarImagenesSubidas, uploadUrl } from '../lib/uploads.js';
import { assertSixDigitPin, hashPin } from '../services/authService.js';

const router = Router();

/** Extrae el primer archivo subido de un campo multipart (req.files de multer). */
function archivoDeCampo(req: Request, campo: string) {
  const files = req.files;
  const archivos = Array.isArray(files) ? files : (files ? Object.values(files).flat() : []);
  return archivos.find((archivo) => archivo.fieldname === campo);
}

interface IDispositivoSetupFila {
  empresa_id: number | null;
  estado: string | null;
}

interface IFilaId {
  id: number;
}

// POST /api/setup/registro (público; pantalla de bienvenida / setup wizard)
router.post('/api/setup/registro', route(async (req: Request, res: Response) => {
  const propietario = String(req.body.propietario || '').trim();
  const nombreComercial = String(req.body.negocio || req.body.nombre_comercial || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const email = String(req.body.email || '').trim();
  const provincia = String(req.body.provincia || '').trim();

  if (!propietario || !nombreComercial || !telefono || !email || !provincia) {
    throw httpError(400, 'Completa el registro: propietario, negocio, teléfono, correo y provincia.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {throw httpError(400, 'El correo electrónico no es válido.');}

  // Tablas de negocio (negocio_config) con RLS: contexto empresa 1, igual que
  // el contexto por defecto del middleware global de dispositivo del legacy.
  await runWithRequestContext({ empresaId: 1 }, async () => {
    const db = getDatabase();
    const current = await db.query<IFilaId>('SELECT id FROM negocio_config ORDER BY id LIMIT 1');
    if (current.rowCount) {
      await db.query(
        `UPDATE negocio_config
         SET nombre_comercial = COALESCE(NULLIF($1, ''), nombre_comercial),
             propietario = $2, telefono = $3, email = $4, provincia = $5,
             fecha_registro = COALESCE(fecha_registro, CURRENT_TIMESTAMP)
         WHERE id = $6`,
        [nombreComercial, propietario, telefono, email, provincia, current.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO negocio_config
         (nombre_comercial, razon_social, rnc, telefono, direccion, provincia, regimen_fiscal,
          nombre_cocina, nombre_bar, duracion_meses, logo_url, estado_licencia, cobrar_itbis,
          cobrar_propina, licencia_bloqueada, fecha_instalacion, propietario, email, fecha_registro)
         VALUES ($1, $1, '', $3, '', $5, 'Ordinario', 'Cocina', 'Bar', 0, NULL, 'Activa',
                 TRUE, TRUE, FALSE, CURRENT_TIMESTAMP, $2, $4, CURRENT_TIMESTAMP)`,
        [nombreComercial, propietario, telefono, email, provincia]
      );
    }
  });

  res.json({ mensaje: 'Registro completado correctamente. Bienvenido a ChloeRestaurant.' });
}));

// POST /api/setup/completar (público pero verifica el dispositivo por x-device-id)
router.post(
  '/api/setup/completar',
  uploadImagenesSistema,
  validarImagenesSubidas,
  route(async (req: Request, res: Response) => {
    const db = getDatabase();
    const deviceId = String(req.get('x-device-id') || '').trim();
    const device = await db.queryUnscoped<IDispositivoSetupFila>(
      'SELECT empresa_id, estado FROM dispositivos WHERE device_id = $1',
      [deviceId]
    );
    if (!device.rowCount || device.rows[0].estado !== 'Activo') {
      throw httpError(403, 'El setup solo está disponible después de activar este dispositivo.');
    }
    const empresaId = device.rows[0]?.empresa_id || 1;

    const fondoArchivo = archivoDeCampo(req, 'fondo_archivo');
    const logoArchivo = archivoDeCampo(req, 'logo_archivo');
    const fondo = fondoArchivo ? uploadUrl(req, fondoArchivo) : null;
    const logo = logoArchivo ? uploadUrl(req, logoArchivo) : null;
    const tema = String(req.body.tema_activo || 'noche').trim();
    const primario = String(req.body.color_primario || '').trim() || null;
    const secundario = String(req.body.color_secundario || '').trim() || null;
    const opacidad = Number(req.body.opacidad_fondo);
    const opacidadValida = Number.isFinite(opacidad) ? opacidad : 1;
    const nombre = String(req.body.nombre_negocio || '').trim() || null;
    const slogan = String(req.body.slogan || '').trim() || null;

    // Configuración del administrador para esta empresa:
    if (req.body.admin_pin) {
      const adminNombre = String(req.body.admin_nombre || 'Administrador Sistema').trim();
      assertSixDigitPin(req.body.admin_pin);
      const adminPinHash = hashPin(req.body.admin_pin);
      const existingAdmin = await db.queryUnscoped<IFilaId>(
        "SELECT id FROM usuarios WHERE empresa_id = $1 AND rol = 'Administrador' LIMIT 1",
        [empresaId]
      );
      if (existingAdmin.rowCount) {
        await db.queryUnscoped(
          "UPDATE usuarios SET empresa_id = $1, nombre = $2, pin_hash = $3, requiere_cambio_pin = TRUE, estado = 'Activo' WHERE id = $4",
          [empresaId, adminNombre, adminPinHash, existingAdmin.rows[0].id]
        );
      } else {
        await db.queryUnscoped(
          "INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, requiere_cambio_pin, estado) VALUES ($1, $2, 'Administrador', NULL, $3, TRUE, 'Activo')",
          [empresaId, adminNombre, adminPinHash]
        );
      }
    }

    const cfgCheck = await db.queryUnscoped<IFilaId>(
      'SELECT id FROM configuracion_sistema WHERE empresa_id = $1 LIMIT 1',
      [empresaId]
    );
    if (cfgCheck.rowCount) {
      await db.queryUnscoped(
        `UPDATE configuracion_sistema
         SET nombre_negocio = COALESCE($1::text, nombre_negocio),
             slogan = COALESCE($2::text, slogan),
             tema_activo = $3::text,
             color_primario = $4::text,
             color_secundario = $5::text,
             opacidad_fondo = $6::numeric,
             setup_completado = TRUE,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE empresa_id = $7::int`,
        [nombre, slogan, tema, primario, secundario, opacidadValida, empresaId]
      );
    } else {
      await db.queryUnscoped(
        `INSERT INTO configuracion_sistema (empresa_id, nombre_negocio, slogan, tema_activo, color_primario, color_secundario, opacidad_fondo, setup_completado, actualizado_en)
         VALUES ($1::int, $2::text, $3::text, $4::text, $5::text, $6::text, $7::numeric, TRUE, CURRENT_TIMESTAMP)`,
        [empresaId, nombre, slogan, tema, primario, secundario, opacidadValida]
      );
    }
    if (fondo) {
      await db.queryUnscoped('UPDATE configuracion_sistema SET fondo_login_url = $1 WHERE empresa_id = $2', [fondo, empresaId]);
    }
    if (logo) {
      await db.queryUnscoped('UPDATE configuracion_sistema SET logo_url = $1 WHERE empresa_id = $2', [logo, empresaId]);
    }

    if (nombre) {
      await db.queryUnscoped('UPDATE empresas SET nombre = $1 WHERE id = $2', [nombre, empresaId]);
      const negCheck = await db.queryUnscoped<IFilaId>(
        'SELECT id FROM negocio_config WHERE empresa_id = $1 LIMIT 1',
        [empresaId]
      );
      if (negCheck.rowCount) {
        await db.queryUnscoped(
          `UPDATE negocio_config
           SET nombre_comercial = $1::varchar,
               razon_social = COALESCE(NULLIF(razon_social, ''), $1::varchar)
           WHERE empresa_id = $2::int`,
          [nombre, empresaId]
        );
      } else {
        await db.queryUnscoped(
          'INSERT INTO negocio_config (empresa_id, nombre_comercial, razon_social) VALUES ($1::int, $2::varchar, $3::varchar)',
          [empresaId, nombre, nombre]
        );
      }
    }

    const updatedCfg = await db.queryUnscoped<Record<string, unknown>>(
      'SELECT * FROM configuracion_sistema WHERE empresa_id = $1 LIMIT 1',
      [empresaId]
    );
    res.json({
      mensaje: 'Personalización completada correctamente.',
      setup_completado: true,
      empresaId,
      configuracion: updatedCfg.rows[0] || null,
    });
  })
);

export default router;
