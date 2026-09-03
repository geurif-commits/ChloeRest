/**
 * @file Router de sistema/configuración: info pública del login, personalización
 * (tema/logo/fondo), configuración consolidada, negocio y tasas de divisas.
 * Puerto directo de server.js (legacy). Rutas con prefijo /api completo;
 * listas para app.use(sistemaRouter).
 */

import { Router, Request, Response } from 'express';
import { route, httpError, clientIp } from '../lib/core.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { upload, uploadImagenesSistema, validarImagenSubida, validarImagenesSubidas, uploadUrl } from '../lib/uploads.js';
import { ROLES_ADMIN, ROLES_CAJA } from '../lib/roles.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('sistemaRouter');

const LOGIN_THEMES_VALIDOS = [
  'chef_noir',
  'cyberpunk_neon',
  'warm_cafe',
  'nordic_clean',
  'ocean_chef',
  'crimson_grill',
  'olive_garden',
  'night_lounge',
];

/** true si el valor es un color hexadecimal #RRGGBB (esHex del legacy). */
function esHex(value: unknown): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

/** Extrae el texto de un campo del body (trim) o devuelve el default. */
function campoTexto(value: unknown, porDefecto: string): string {
  const texto = typeof value === 'string' ? value.trim() : '';
  return texto || porDefecto;
}

/** Fila de configuracion_sistema leída con SELECT * (valores crudos de pg). */
type FilaConfiguracion = Record<string, unknown>;

/** Extrae el primer archivo subido de un campo multipart (req.files de multer). */
function archivoDeCampo(req: Request, campo: string) {
  const files = req.files;
  const archivos = Array.isArray(files) ? files : (files ? Object.values(files).flat() : []);
  return archivos.find((archivo) => archivo.fieldname === campo);
}

/** Resuelve empresa_id del dispositivo por x-device-id (patrón público legacy). */
async function empresaPorDeviceId(req: Request): Promise<number | null> {
  const db = getDatabase();
  const deviceId = String(req.get('x-device-id') || '').trim();
  if (!deviceId) {return null;}
  const dev = await db.queryUnscoped<{ empresa_id: number | null }>(
    'SELECT empresa_id FROM dispositivos WHERE device_id = $1',
    [deviceId]
  );
  if (dev.rowCount && dev.rows[0].empresa_id) {return dev.rows[0].empresa_id;}
  return null;
}

/** Fila de configuracion_sistema por empresa (o primera global) sin RLS, como el legacy. */
async function configuracionSistemaDe(empresaId: number | null): Promise<FilaConfiguracion | null> {
  const db = getDatabase();
  if (empresaId) {
    const porEmpresa = await db.queryUnscoped<FilaConfiguracion>(
      'SELECT * FROM configuracion_sistema WHERE empresa_id = $1 ORDER BY id LIMIT 1',
      [empresaId]
    );
    if (porEmpresa.rowCount) {return porEmpresa.rows[0];}
  }
  const global = await db.queryUnscoped<FilaConfiguracion>('SELECT * FROM configuracion_sistema ORDER BY id LIMIT 1');
  return global.rows[0] || null;
}

/** Cuenta administradores activos de la empresa (o globales) sin RLS, como el legacy. */
async function contarAdminsActivos(empresaId: number | null): Promise<number> {
  const db = getDatabase();
  const sql = empresaId
    ? "SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador' AND empresa_id = $1"
    : "SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo' AND rol = 'Administrador'";
  const result = await db.queryUnscoped<{ total: number }>(sql, empresaId ? [empresaId] : []);
  return result.rows[0].total;
}

/** Normaliza la fila de configuracion_sistema al JSON de /api/configuracion/* (formato legacy). */
async function jsonConfiguracion(
  row: FilaConfiguracion,
  empresaId: number | null,
  alternativos?: { nombre_negocio?: unknown; logo_url?: unknown }
): Promise<Record<string, unknown>> {
  return {
    id: row.id,
    empresa_id: row.empresa_id || empresaId || 1,
    nombre_negocio: row.nombre_negocio || alternativos?.nombre_negocio || null,
    slogan: row.slogan || null,
    logo_url: row.logo_url || alternativos?.logo_url || null,
    fondo_login_url: row.fondo_login_url || null,
    tema_activo: row.tema_activo || 'noche',
    estilo_login: row.estilo_login || 'moderno',
    color_primario: row.color_primario || null,
    color_secundario: row.color_secundario || null,
    opacidad_fondo: Number(row.opacidad_fondo || 1),
    login_theme: row.login_theme || 'chef_noir',
    color_acento: row.color_acento || null,
    fondo_tipo: row.fondo_tipo || 'imagen',
    fondo_color: row.fondo_color || null,
    fondo_gradiente: row.fondo_gradiente || null,
    fondo_blur: Number(row.fondo_blur || 0),
    setup_completado: !!row.setup_completado,
    tiene_administrador: (await contarAdminsActivos(empresaId)) > 0,
    owner_pin_longitud: Number(row.owner_pin_longitud || 6),
  };
}

// GET /api/sistema/info (público; pantalla de login). El legacy NO usaba route()
// y respondía 200 aunque fallara: mismo comportamiento con try/catch interno.
router.get('/api/sistema/info', route(async (_req: Request, res: Response) => {
  try {
    await runWithRequestContext({ empresaId: 1 }, async () => {
      const db = getDatabase();
      // Caja estado
      const cajaRes = await db.query<{ estado: string | null; monto_inicial: string | null }>(
        'SELECT estado, monto_inicial FROM aperturas_caja WHERE fecha::date = CURRENT_DATE ORDER BY id DESC LIMIT 1'
      );
      const cajaAbierta = Boolean(cajaRes.rowCount) && cajaRes.rows[0].estado === 'Abierta';
      const montoCaja = cajaRes.rowCount ? Number(cajaRes.rows[0].monto_inicial) : 0;

      // Cajera/cajero de turno: quien abrió la caja hoy
      const cajeraRes = await db.query<{ nombre: string | null }>(
        'SELECT u.nombre FROM aperturas_caja a JOIN usuarios u ON u.id = a.usuario_id WHERE a.estado = \'Abierta\' AND a.fecha::date = CURRENT_DATE ORDER BY a.id DESC LIMIT 1'
      );
      const cajera = cajeraRes.rowCount ? cajeraRes.rows[0].nombre : null;

      // Sucursal / Negocio
      const negRes = await db.query<{ nombre_comercial: string | null; provincia: string | null; direccion: string | null; telefono: string | null }>(
        'SELECT nombre_comercial, provincia, direccion, telefono FROM negocio_config ORDER BY id LIMIT 1'
      );
      const negocio = negRes.rowCount
        ? negRes.rows[0]
        : { nombre_comercial: 'Chloe Restaurant', provincia: '', direccion: '', telefono: '' };

      // Mesas ocupadas
      const mesasRes = await db.query<{ total: string }>("SELECT COUNT(*) AS total FROM mesas WHERE estado = 'Ocupada'");
      const mesasOcupadas = mesasRes.rowCount ? parseInt(mesasRes.rows[0].total, 10) : 0;

      res.json({
        version: '2.1.0',
        caja: { abierta: cajaAbierta, monto: montoCaja },
        sucursal: negocio.provincia || 'No configurada',
        provincia: negocio.provincia || null,
        cajera,
        nombreNegocio: negocio.nombre_comercial || 'Chloe Restaurant',
        direccion: negocio.direccion,
        telefono: negocio.telefono,
        mesasOcupadas,
        horaServidor: new Date().toISOString(),
      });
    });
  } catch (error) {
    logger.warn({ action: 'SISTEMA_INFO_FALLBACK', error: (error as Error).message });
    res.json({
      version: '2.1.0',
      caja: { abierta: false, monto: 0 },
      sucursal: 'No disponible',
      provincia: null,
      cajera: null,
      error: true,
    });
  }
}));

// GET /api/configuracion/sistema (público; pre-login y wizard)
router.get('/api/configuracion/sistema', route(async (req: Request, res: Response) => {
  const empresaId = await empresaPorDeviceId(req);
  const row = await configuracionSistemaDe(empresaId);
  if (!row) {
    res.json({ setup_completado: false, tema_activo: 'noche', estilo_login: 'moderno', tiene_administrador: false });
    return;
  }
  res.json(await jsonConfiguracion(row, empresaId));
}));

// GET /api/configuracion/completa (público; sistema + negocio consolidados)
router.get('/api/configuracion/completa', route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const empresaId = await empresaPorDeviceId(req);
  const row = await configuracionSistemaDe(empresaId);

  let negocio: FilaConfiguracion = {};
  if (empresaId) {
    const porEmpresa = await db.queryUnscoped<FilaConfiguracion>(
      'SELECT * FROM negocio_config WHERE empresa_id = $1 ORDER BY id LIMIT 1',
      [empresaId]
    );
    if (porEmpresa.rowCount) {negocio = porEmpresa.rows[0];}
  }
  if (!Object.keys(negocio).length) {
    const global = await db.queryUnscoped<FilaConfiguracion>('SELECT * FROM negocio_config ORDER BY id LIMIT 1');
    if (global.rowCount) {negocio = global.rows[0];}
  }

  if (!row) {
    res.json({ setup_completado: false, tema_activo: 'noche', estilo_login: 'moderno', tiene_administrador: false });
    return;
  }
  res.json({
    ...(await jsonConfiguracion(row, empresaId, {
      nombre_negocio: negocio.nombre_comercial,
      logo_url: negocio.logo_url,
    })),
    negocio: {
      nombre_comercial: negocio.nombre_comercial || null,
      razon_social: negocio.razon_social || null,
      rnc: negocio.rnc || null,
      telefono: negocio.telefono || null,
      direccion: negocio.direccion || null,
      provincia: negocio.provincia || null,
      regimen_fiscal: negocio.regimen_fiscal || null,
      nombre_cocina: negocio.nombre_cocina || null,
      nombre_bar: negocio.nombre_bar || null,
      propietario: negocio.propietario || null,
      email: negocio.email || null,
      cobrar_itbis: !!negocio.cobrar_itbis,
      cobrar_propina: !!negocio.cobrar_propina,
      tasa_usd: Number(negocio.tasa_usd || 0),
      tasa_eur: Number(negocio.tasa_eur || 0),
      comanda_modo: negocio.comanda_modo || null,
      ticket_font_family: negocio.ticket_font_family || null,
      ticket_font_size: negocio.ticket_font_size || null,
      ticket_logo_position: negocio.ticket_logo_position || null,
      ticket_show_qr: !!negocio.ticket_show_qr,
      ticket_margin: negocio.ticket_margin || null,
    },
  });
}));

// GET /api/negocio/config (público; pantalla inicial pre-login)
router.get('/api/negocio/config', route(async (_req: Request, res: Response) => {
  await runWithRequestContext({ empresaId: 1 }, async () => {
    const db = getDatabase();
    const result = await db.query<FilaConfiguracion>(
      `SELECT nombre_comercial AS nombre, nombre_comercial, razon_social, rnc, telefono, direccion,
              provincia, regimen_fiscal, nombre_cocina, nombre_bar, logo_url, cobrar_itbis,
              cobrar_propina, tasa_usd, tasa_eur, comanda_modo, ticket_font_family,
              ticket_font_size, ticket_logo_position, ticket_show_qr, ticket_margin
         FROM negocio_config ORDER BY id LIMIT 1`
    );
    res.json(result.rows[0] || { nombre_comercial: 'Mi Restaurante', cobrar_itbis: true, cobrar_propina: true });
  });
}));

// PUT /api/configuracion/sistema (Administrador; personalización con imágenes)
router.put(
  '/api/configuracion/sistema',
  requireAuth,
  requireRoles(...ROLES_ADMIN),
  uploadImagenesSistema,
  validarImagenesSubidas,
  route(async (req: Request, res: Response) => {
    const db = getDatabase();
    const body = req.body as Record<string, unknown>;
    const fondoArchivo = archivoDeCampo(req, 'fondo_archivo');
    const logoArchivo = archivoDeCampo(req, 'logo_archivo');
    const actual = await db.query<FilaConfiguracion>('SELECT * FROM configuracion_sistema ORDER BY id LIMIT 1');
    const row = actual.rows[0] || {};
    const fondoAnterior = typeof row.fondo_login_url === 'string' ? row.fondo_login_url : null;
    const logoAnterior = typeof row.logo_url === 'string' ? row.logo_url : null;
    const fondo = fondoArchivo ? uploadUrl(req, fondoArchivo) : (body.quitar_fondo ? null : fondoAnterior);
    const logo = logoArchivo ? uploadUrl(req, logoArchivo) : (body.quitar_logo ? null : logoAnterior);
    const tema = String(body.tema_activo || row.tema_activo || 'noche').trim();
    const primario = String(body.color_primario || '').trim() || null;
    const secundario = String(body.color_secundario || '').trim() || null;
    const opacidad = Number(body.opacidad_fondo);
    const opacidadFinal = Number.isFinite(opacidad)
      ? opacidad
      : Number(row.opacidad_fondo || 1);
    const nombre = String(body.nombre_negocio || '').trim() || null;
    const slogan = String(body.slogan || '').trim() || null;
    const loginTheme = LOGIN_THEMES_VALIDOS.includes(String(body.login_theme || '').trim())
      ? String(body.login_theme).trim()
      : String(row.login_theme || 'chef_noir');
    const estiloLogin = ['moderno', 'clasico'].includes(String(body.estilo_login || '').trim())
      ? String(body.estilo_login).trim()
      : String(row.estilo_login || 'moderno');
    const acento = esHex(body.color_acento) ? String(body.color_acento).trim() : null;
    const fondoTiposValidos = ['imagen', 'color', 'gradiente'];
    const fondoTipoRaw = String(body.fondo_tipo || '').trim();
    const fondoTipo = fondoTiposValidos.includes(fondoTipoRaw)
      ? fondoTipoRaw
      : (body.fondo_tipo !== undefined ? 'imagen' : String(row.fondo_tipo || 'imagen'));
    const fondoColor = esHex(body.fondo_color)
      ? String(body.fondo_color).trim()
      : (body.fondo_color === ''
          ? null
          : (typeof row.fondo_color === 'string' && row.fondo_color ? row.fondo_color : null));
    const fondoGradienteRaw = String(body.fondo_gradiente || '').trim();
    const fondoGradienteAnterior = typeof row.fondo_gradiente === 'string' && row.fondo_gradiente
      ? row.fondo_gradiente
      : null;
    const fondoGradiente = fondoGradienteRaw.length <= 250
      ? (fondoGradienteRaw || (body.fondo_gradiente !== undefined ? null : fondoGradienteAnterior))
      : fondoGradienteAnterior;
    const fondoBlurNum = Number(body.fondo_blur);
    const fondoBlur = body.fondo_blur !== undefined && Number.isFinite(fondoBlurNum)
      ? Math.max(0, Math.min(30, Math.round(fondoBlurNum)))
      : Number(row.fondo_blur || 0);

    await db.query(
      `UPDATE configuracion_sistema
       SET nombre_negocio = $1, slogan = $2, tema_activo = $3, color_primario = $4, color_secundario = $5,
           opacidad_fondo = $6, fondo_login_url = $7, logo_url = $8, estilo_login = $9,
           login_theme = $10, color_acento = $11, fondo_tipo = $12, fondo_color = $13,
           fondo_gradiente = $14, fondo_blur = $15, actualizado_en = CURRENT_TIMESTAMP
       WHERE empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::INTEGER`,
      [nombre, slogan, tema, primario, secundario, opacidadFinal, fondo, logo, estiloLogin,
        loginTheme, acento, fondoTipo, fondoColor, fondoGradiente, fondoBlur]
    );
    if (nombre) {
      await db.query(
        'UPDATE empresas SET nombre = $1 WHERE id = NULLIF(current_setting(\'app.empresa_id\', true), \'\')::INTEGER',
        [nombre]
      );
      await db.query(
        'UPDATE negocio_config SET nombre_comercial = $1 WHERE empresa_id = NULLIF(current_setting(\'app.empresa_id\', true), \'\')::INTEGER',
        [nombre]
      );
    }
    await registrarAuditoria(db, {
      usuarioId: req.auth!.userId,
      accion: 'ACTUALIZAR_PERSONALIZACION',
      entidad: 'configuracion_sistema',
      ip: clientIp(req),
    });
    res.json({ mensaje: 'Personalización del sistema actualizada.' });
  })
);

// ── Endpoints de Divisas ──

// GET /api/divisas (público; pre-login)
router.get('/api/divisas', route(async (_req: Request, res: Response) => {
  await runWithRequestContext({ empresaId: 1 }, async () => {
    const db = getDatabase();
    const result = await db.query<{ tasa_usd: string | null; tasa_eur: string | null }>(
      'SELECT tasa_usd, tasa_eur FROM negocio_config ORDER BY id LIMIT 1'
    );
    const row = result.rows[0];
    res.json({
      tasa_usd: Number(row?.tasa_usd || 60.0),
      tasa_eur: Number(row?.tasa_eur || 65.0),
    });
  });
}));

// POST /api/divisas (Administrador o Cajero)
router.post('/api/divisas', requireAuth, requireRoles(...ROLES_CAJA), route(async (req: Request, res: Response) => {
  const db = getDatabase();
  const tasaUsd = Number(req.body.tasa_usd);
  const tasaEur = Number(req.body.tasa_eur);
  if (!Number.isFinite(tasaUsd) || tasaUsd <= 0) {throw httpError(400, 'Tasa USD no válida (debe ser mayor a 0).');}
  if (!Number.isFinite(tasaEur) || tasaEur <= 0) {throw httpError(400, 'Tasa EUR no válida (debe ser mayor a 0).');}

  const current = await db.query<{ id: number }>('SELECT id FROM negocio_config ORDER BY id LIMIT 1');
  if (current.rowCount) {
    await db.query('UPDATE negocio_config SET tasa_usd = $1, tasa_eur = $2 WHERE id = $3', [tasaUsd, tasaEur, current.rows[0].id]);
  } else {
    await db.query(
      "INSERT INTO negocio_config (nombre_comercial, rnc, tasa_usd, tasa_eur) VALUES ('Mi Restaurante', '130000001', $1, $2)",
      [tasaUsd, tasaEur]
    );
  }
  res.json({ mensaje: 'Tasas de cambio de divisas actualizadas correctamente.', tasa_usd: tasaUsd, tasa_eur: tasaEur });
}));

// POST /api/negocio/config (Administrador; datos del negocio + licencia + logo)
router.post(
  '/api/negocio/config',
  requireAuth,
  requireRoles(...ROLES_ADMIN),
  upload.single('logo_archivo'),
  validarImagenSubida,
  route(async (req: Request, res: Response) => {
    const db = getDatabase();
    const body = req.body as Record<string, unknown>;
    const logoUrlLink = typeof body.logo_url_link === 'string' ? body.logo_url_link.trim() || null : null;
    const logo = req.file ? uploadUrl(req, req.file) : logoUrlLink;
    const duration = Number(body.duracion_meses || 0);
    const unblock = duration > 0 || duration === -1;
    const values: unknown[] = [
      typeof body.nombre_comercial === 'string' ? body.nombre_comercial.trim() : undefined,
      typeof body.razon_social === 'string' ? body.razon_social.trim() : undefined,
      typeof body.rnc === 'string' ? body.rnc.trim() : undefined,
      typeof body.telefono === 'string' ? body.telefono.trim() : undefined,
      typeof body.direccion === 'string' ? body.direccion.trim() : undefined,
      typeof body.provincia === 'string' ? body.provincia.trim() : undefined,
      typeof body.regimen_fiscal === 'string' ? body.regimen_fiscal.trim() : undefined,
      campoTexto(body.nombre_cocina, 'Cocina'),
      campoTexto(body.nombre_bar, 'Bar'),
      duration,
      logo,
      body.cobrar_itbis === 'true' || body.cobrar_itbis === true,
      body.cobrar_propina === 'true' || body.cobrar_propina === true,
    ];
    const mesaDisp = campoTexto(body.mesa_color_disponible, '#00f576');
    const mesaOcup = campoTexto(body.mesa_color_ocupada, '#ff4444');
    const mesaRes = campoTexto(body.mesa_color_reservada, '#d6a44d');
    const comandaModo = campoTexto(body.comanda_modo, 'kds');
    const ticketFontFamily = campoTexto(body.ticket_font_family, 'Inter');
    const ticketFontSize = campoTexto(body.ticket_font_size, '12');
    const ticketLogoPosition = campoTexto(body.ticket_logo_position, 'top');
    const ticketShowQr = body.ticket_show_qr === 'true' || body.ticket_show_qr === true;
    const ticketMargin = campoTexto(body.ticket_margin, 'normal');

    if (values.slice(0, 5).some((value) => !value)) {
      throw httpError(400, 'Completa los datos obligatorios del negocio.');
    }
    const current = await db.query<{ id: number; logo_url: string | null }>(
      'SELECT id, logo_url FROM negocio_config ORDER BY id LIMIT 1'
    );
    if (current.rowCount) {
      values[10] = logo || current.rows[0].logo_url;
      await db.query(
        `UPDATE negocio_config
         SET nombre_comercial = $1, razon_social = $2, rnc = $3, telefono = $4, direccion = $5, provincia = $6,
             regimen_fiscal = $7, nombre_cocina = $8, nombre_bar = $9, duracion_meses = $10, logo_url = $11,
             cobrar_itbis = $12, cobrar_propina = $13,
             mesa_color_disponible = $15, mesa_color_ocupada = $16, mesa_color_reservada = $17,
             comanda_modo = $18, ticket_font_family = $19, ticket_font_size = $20,
             ticket_logo_position = $21, ticket_show_qr = $22, ticket_margin = $23
             ${unblock ? ', licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP' : ''}
         WHERE id = $14`,
        [...values, current.rows[0].id, mesaDisp, mesaOcup, mesaRes, comandaModo, ticketFontFamily,
          ticketFontSize, ticketLogoPosition, ticketShowQr, ticketMargin]
      );
    } else {
      await db.query(
        `INSERT INTO negocio_config
         (nombre_comercial, razon_social, rnc, telefono, direccion, provincia, regimen_fiscal, nombre_cocina, nombre_bar, duracion_meses, logo_url, estado_licencia, cobrar_itbis, cobrar_propina, licencia_bloqueada, fecha_instalacion, mesa_color_disponible, mesa_color_ocupada, mesa_color_reservada, comanda_modo, ticket_font_family, ticket_font_size, ticket_logo_position, ticket_show_qr, ticket_margin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Activa', $12, $13, FALSE, CURRENT_TIMESTAMP, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [...values, mesaDisp, mesaOcup, mesaRes, comandaModo, ticketFontFamily, ticketFontSize,
          ticketLogoPosition, ticketShowQr, ticketMargin]
      );
    }
    await registrarAuditoria(db, {
      usuarioId: req.auth!.userId,
      accion: 'ACTUALIZAR_NEGOCIO',
      entidad: 'negocio_config',
      ip: clientIp(req),
    });
    res.json({ mensaje: 'Configuración de negocio y licencia actualizada.', bloqueado: !unblock });
  })
);

export default router;
