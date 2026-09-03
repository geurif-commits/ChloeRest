/**
 * @file Opciones de datos del bot de Telegram (inyectadas al arrancar).
 * Puerto directo del bloque de opciones de inicializarAplicacion() en
 * server.js (legacy): cada comando del bot ejecuta sus propias consultas
 * de plataforma contra la misma conexión de base de datos.
 */

import crypto from 'node:crypto';
import { config } from '../lib/config.js';
import { getDatabase } from '../db/index.js';
import { validarClaveLicencia } from '../lib/licencias.js';
import { IOpcionesTelegramBot } from './telegramBotService.js';
import { cambiarEstadoSolicitud, crearLicenciaConAdministrador, obtenerSolicitudPorId } from './licenciasService.js';

export function obtenerOpcionesTelegramBot(): IOpcionesTelegramBot {
  const db = getDatabase();

  return {
    token: config.telegramBotToken,
    ownerChatId: config.telegramOwnerChatId,
    webhook: config.isProduction,
    webhookSecret:
      config.telegramWebhookSecret ||
      crypto.createHmac('sha256', config.sessionSecret).update('telegram-webhook').digest('base64url'),
    webhookUrl: `${(config.publicBaseUrl || 'https://chloerestaurant.lat').replace(/\/$/, '')}/api/telegram/webhook`,
    cambiarEstado: (id, estado) => cambiarEstadoSolicitud(id, estado, null, 'telegram'),
    listarPendientes: async () =>
      (
        await db.query(
          `SELECT id, plan_nombre, propietario, negocio, telefono, email, creado_en
             FROM solicitudes_licencia
            WHERE estado = 'Pendiente'
            ORDER BY creado_en`
        )
      ).rows,
    obtenerSolicitud: async (id) => obtenerSolicitudPorId(id),
    listarFacturas: async () =>
      (
        await db.query(
          `SELECT id, numero_factura, plan_nombre, propietario, negocio, monto, moneda, estado, pagada_en, creado_en
             FROM solicitudes_licencia
            WHERE numero_factura IS NOT NULL
            ORDER BY pagada_en DESC NULLS LAST, creado_en DESC`
        )
      ).rows,
    resumenDueno: async () => {
      const [devices, solicitudes, facturas, planes, negocio] = await Promise.all([
        db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Activo')::int AS activos FROM dispositivos"),
        db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Pendiente')::int AS pendientes, COUNT(*) FILTER (WHERE estado = 'Pagada')::int AS pagadas FROM solicitudes_licencia"),
        db.query('SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto_total FROM solicitudes_licencia WHERE numero_factura IS NOT NULL'),
        db.query('SELECT COUNT(*)::int AS total FROM planes_licencia WHERE activo = TRUE'),
        db.query('SELECT nombre_comercial, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1'),
      ]);
      return {
        dispositivos: devices.rows[0],
        solicitudes: solicitudes.rows[0],
        planes: planes.rows[0],
        negocio: negocio.rows[0] || null,
        facturas: facturas.rows[0],
        claveMaestra: config.licenseActivationKey || '',
      };
    },
    generarClave: async (dur) => crearLicenciaConAdministrador(dur),
    validarClave: (clave) => validarClaveLicencia(clave, config.licenseActivationKey),
    listarDispositivos: async () =>
      (
        await db.query(
          `SELECT id, device_id, nombre, navegador, ip, estado, licencia_duracion, licencia_vencimiento, activado_en, ultimo_acceso, creado_en
             FROM dispositivos ORDER BY creado_en DESC`
        )
      ).rows,
    obtenerDispositivo: async (id) =>
      (
        await db.query(
          `SELECT id, device_id, nombre, navegador, ip, estado, intentos_fallidos, licencia_duracion, licencia_vencimiento, activado_en, ultimo_acceso, creado_en
             FROM dispositivos WHERE id = $1`,
          [id]
        )
      ).rows[0] || null,
    cambiarEstadoDispositivo: async (id, estado) => {
      const result = await db.query(
        `UPDATE dispositivos SET estado = $1::VARCHAR,
            activado_en = CASE WHEN $1::VARCHAR = 'Activo' THEN COALESCE(activado_en, CURRENT_TIMESTAMP) ELSE activado_en END,
            intentos_fallidos = 0
         WHERE id = $2 RETURNING id, device_id`,
        [estado, id]
      );
      if (!result.rowCount) {return { error: 'Dispositivo no encontrado.' };}
      return { ok: true };
    },
    eliminarDispositivo: async (id) => {
      const result = await db.query('DELETE FROM dispositivos WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) {return { error: 'Dispositivo no encontrado.' };}
      return { ok: true };
    },
    listarPlanes: async () =>
      (
        await db.query(
          'SELECT id, nombre, duracion_codigo, precio, moneda, destacado, activo, orden FROM planes_licencia ORDER BY orden, id'
        )
      ).rows,
    crearPlan: async (datos) => {
      const nombre = String(datos.nombre || '').trim();
      const duracion = String(datos.duracion_codigo || '').trim().toUpperCase();
      const precio = Number(datos.precio);
      const moneda = String(datos.moneda || 'RD$').trim() || 'RD$';
      if (!nombre) {return { error: 'El nombre del plan es obligatorio.' };}
      const result = await db.query(
        `INSERT INTO planes_licencia (nombre, duracion_codigo, precio, moneda, activo)
         VALUES ($1, $2, $3, $4, true) RETURNING *`,
        [nombre, duracion, precio, moneda]
      );
      return { ok: true, plan: result.rows[0] };
    },
    actualizarPlan: async (id, cambios) => {
      const result = await db.query(
        `UPDATE planes_licencia
            SET precio = COALESCE($1, precio), activo = COALESCE($2, activo)
          WHERE id = $3 RETURNING *`,
        [cambios.precio !== null && cambios.precio !== undefined ? Number(cambios.precio) : null, cambios.activo !== null && cambios.activo !== undefined ? Boolean(cambios.activo) : null, id]
      );
      if (!result.rowCount) {return { error: 'Plan no encontrado.' };}
      return { ok: true };
    },
    eliminarPlan: async (id) => {
      const result = await db.query('DELETE FROM planes_licencia WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) {return { error: 'Plan no encontrado.' };}
      return { ok: true };
    },
    obtenerNegocio: async () => {
      const result = await db.query('SELECT nombre_comercial, rnc, duracion_meses, licencia_bloqueada, fecha_instalacion FROM negocio_config ORDER BY id LIMIT 1');
      return result.rows[0] || null;
    },
    obtenerIngresos: async (dias) => {
      const result = await db.query(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto
           FROM solicitudes_licencia
          WHERE numero_factura IS NOT NULL AND pagada_en >= NOW() - ($1 || ' days')::INTERVAL`,
        [String(dias)]
      );
      return result.rows[0] || { total: 0, monto: 0 };
    },
    listarMetodos: async () =>
      (
        await db.query(
          'SELECT id, tipo, nombre, dato1, activo FROM metodos_pago ORDER BY orden, id'
        )
      ).rows,
    eliminarSolicitud: async (id) => {
      const result = await db.query('DELETE FROM solicitudes_licencia WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) {return { error: 'Solicitud no encontrada.' };}
      return { ok: true };
    },
  };
}
