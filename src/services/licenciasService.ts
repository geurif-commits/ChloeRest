/**
 * @file Servicio de licencias de venta: solicitudes, facturas y entrega de
 * claves (CHLOE) con creación de empresa + administrador, y plantillas del
 * correo de activación. Puerto directo de los helpers intermedios de
 * server.js (legacy) a TypeScript.
 */

import crypto from 'node:crypto';
import { httpError } from '../lib/core.js';
import { config } from '../lib/config.js';
import { getDatabase } from '../db/index.js';
import { registrarAuditoria } from './auditoriaService.js';
import { generarClaveLicencia, parsearDuracion } from '../lib/licencias.js';
import { hashPin } from './authService.js';
import { enviarClaveActivacion } from './telegramBotService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('licenciasService');

/** Fila completa de solicitudes_licencia con la duración del plan (join). */
export interface ISolicitudFila {
  id: number;
  plan_id: number | null;
  plan_nombre: string | null;
  propietario: string | null;
  negocio: string | null;
  telefono: string | null;
  email: string | null;
  provincia: string | null;
  notas: string | null;
  estado: string | null;
  metodo_pago: string | null;
  comprobante: string | null;
  monto: string | null;
  moneda: string | null;
  numero_factura: string | null;
  pagada_en: Date | null;
  creado_en: Date | null;
  atendida_en: Date | null;
  clave_generada: string | null;
  clave_pin_inicial: string | null;
  clave_enviada_en: Date | null;
  plan_duracion: string | null;
}

export interface ISolicitudEstado {
  id: number;
  estado: string;
  numero_factura: string | null;
}

export interface IResultadoCambiarEstado {
  ok: boolean;
  eliminada?: boolean;
  solicitud?: ISolicitudEstado | { id: number; estado: string };
  error?: string;
}

/** Resultado de crearLicenciaConAdministrador (misma forma que el legacy). */
export interface IResultadoClaveCreada {
  clave?: string;
  duracion?: string;
  vitalicia?: boolean;
  empresaId?: number;
  pinInicial?: string;
  error?: string;
}

/** Correo de activación ya compuesto (texto plano + HTML + mailto). */
export interface ICorreoActivacion {
  asunto: string;
  textoPlano: string;
  html: string;
  mailtoUrl: string;
  pin: string;
}

const SQL_SOLICITUD_POR_ID = `
  SELECT s.id, s.plan_id, s.plan_nombre, s.propietario, s.negocio, s.telefono, s.email, s.provincia, s.notas,
         s.estado, s.metodo_pago, s.comprobante, s.monto, s.moneda, s.numero_factura, s.pagada_en, s.creado_en, s.atendida_en,
         s.clave_generada, s.clave_pin_inicial, s.clave_enviada_en,
         p.duracion_codigo AS plan_duracion
    FROM solicitudes_licencia s
    LEFT JOIN planes_licencia p ON p.id = s.plan_id
   WHERE s.id = $1`;

export async function obtenerSolicitudPorId(id: number): Promise<ISolicitudFila | null> {
  const db = getDatabase();
  const res = await db.queryUnscoped<ISolicitudFila>(SQL_SOLICITUD_POR_ID, [id]);
  return res.rows[0] || null;
}

export async function generarFacturaSolicitud(solicitudId: number): Promise<void> {
  const db = getDatabase();
  const sol = await db.queryUnscoped<{ id: number; numero_factura: string | null; plan_id: number | null }>(
    `SELECT id, numero_factura, plan_id FROM solicitudes_licencia WHERE id = $1`,
    [solicitudId]
  );
  if (!sol.rowCount || sol.rows[0].numero_factura) {return;}
  const fila = sol.rows[0];
  const numero = `FAC-${String(fila.id).padStart(6, '0')}`;
  let monto = 0;
  let moneda = 'RD$';
  if (fila.plan_id) {
    const plan = await db.queryUnscoped<{ precio: string | null; moneda: string | null }>(
      'SELECT precio, moneda FROM planes_licencia WHERE id = $1',
      [fila.plan_id]
    );
    if (plan.rowCount) {
      monto = Number(plan.rows[0].precio || 0);
      moneda = plan.rows[0].moneda || 'RD$';
    }
  }
  await db.queryUnscoped(
    `UPDATE solicitudes_licencia SET numero_factura = $1, monto = $2, moneda = $3 WHERE id = $4`,
    [numero, monto, moneda, fila.id]
  );
}

export async function cambiarEstadoSolicitud(
  id: number,
  estado: string,
  ip: string | null = null,
  origen: string | null = null
): Promise<IResultadoCambiarEstado> {
  const db = getDatabase();
  if (!['Pendiente', 'Pagada', 'Atendida', 'Rechazada'].includes(estado)) {
    return { ok: false, error: 'Estado inválido.' };
  }

  if (estado === 'Rechazada') {
    const result = await db.queryUnscoped('DELETE FROM solicitudes_licencia WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) {return { ok: false, error: 'Solicitud no encontrada.' };}
    await registrarAuditoria(db, {
      usuarioId: null,
      accion: 'RECHAZAR_Y_ELIMINAR_SOLICITUD',
      entidad: 'solicitudes_licencia',
      entidadId: String(id),
      detalle: { origen },
      ip: ip || null,
    });
    return { ok: true, eliminada: true, solicitud: { id, estado: 'Rechazada' } };
  }

  const result = await db.queryUnscoped<ISolicitudEstado>(
    `UPDATE solicitudes_licencia
        SET estado = $1::VARCHAR,
            atendida_en = CASE WHEN $1::VARCHAR = 'Pendiente' THEN NULL ELSE COALESCE(atendida_en, CURRENT_TIMESTAMP) END,
            pagada_en = CASE WHEN $1::VARCHAR = 'Pagada' THEN COALESCE(pagada_en, CURRENT_TIMESTAMP) ELSE pagada_en END
      WHERE id = $2 RETURNING id, estado, numero_factura`,
    [estado, id]
  );
  if (!result.rowCount) {return { ok: false, error: 'Solicitud no encontrada.' };}
  const solicitud = result.rows[0];
  if (estado === 'Pagada') {
    await generarFacturaSolicitud(id);
    const actualizada = await obtenerSolicitudPorId(id);
    if (actualizada) {solicitud.numero_factura = actualizada.numero_factura;}
  }
  await registrarAuditoria(db, {
    usuarioId: null,
    accion: 'ATENDER_SOLICITUD',
    entidad: 'solicitudes_licencia',
    entidadId: String(id),
    detalle: { estado, origen },
    ip: ip || null,
  });
  return { ok: true, solicitud };
}

export async function marcarClaveEnviada(id: number): Promise<void> {
  const db = getDatabase();
  await db.queryUnscoped(
    `UPDATE solicitudes_licencia SET clave_enviada_en = COALESCE(clave_enviada_en, CURRENT_TIMESTAMP) WHERE id = $1`,
    [id]
  );
}

/**
 * Genera una clave CHLOE con su PIN inicial y crea la empresa + licencia
 * correspondientes (un solo intento de transacción, igual que el legacy).
 */
export async function crearLicenciaConAdministrador(dur: string): Promise<IResultadoClaveCreada> {
  const resultado = generarClaveLicencia(dur);
  if (resultado.error) {return resultado;}
  const clave = resultado.clave || '';
  const pinInicial = String(crypto.randomInt(100000, 1000000));
  const pinHash = hashPin(pinInicial);
  const db = getDatabase();
  const licencia = await db.transaction(async (client) => {
    const empresa = await client.query<{ id: number }>(
      `INSERT INTO empresas (nombre, slug) VALUES ($1, $2) RETURNING id`,
      [`Empresa ${clave.slice(-8)}`, `empresa-${crypto.randomUUID()}`]
    );
    await client.query(
      `INSERT INTO licencias (empresa_id, clave_hash, clave_texto, duracion_codigo, admin_pin_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [empresa.rows[0].id, sha256Hex(clave), clave, resultado.duracion, pinHash]
    );
    return empresa.rows[0].id;
  });
  return { ...resultado, empresaId: licencia, pinInicial };
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Genera la clave de una solicitud (POST /api/dueno/solicitudes/:id/generar-clave).
 * Reutiliza la clave si ya existía y envía por Telegram al chat del propietario.
 * Devuelve el cuerpo JSON completo de la respuesta (idéntico al legacy).
 */
export async function generarClaveParaSolicitud(
  id: number,
  duracionSolicitada: string,
  ip: string | null
): Promise<Record<string, unknown>> {
  const db = getDatabase();
  const solicitud = await obtenerSolicitudPorId(id);
  if (!solicitud) {throw httpError(404, 'Solicitud no encontrada.');}
  if (solicitud.estado === 'Rechazada') {
    throw httpError(400, 'Esta solicitud fue rechazada y no puede generar clave.');
  }

  // Una misma solicitud genera una única clave: evita duplicar licencias.
  if (solicitud.clave_generada) {
    if (!solicitud.clave_enviada_en) {await marcarClaveEnviada(id);}
    return {
      clave: solicitud.clave_generada,
      duracion: String(solicitud.plan_duracion || solicitud.plan_nombre || 'L'),
      vitalicia: solicitud.plan_duracion ? parsearDuracion(solicitud.plan_duracion)?.vitalicia === true : false,
      pinInicial: solicitud.clave_pin_inicial || '',
      reutilizada: true,
      solicitud: await obtenerSolicitudPorId(id),
    };
  }

  // Duración: la que envía el panel dueño, o la del plan elegido, o 30D.
  let dur = String(duracionSolicitada || '').trim().toUpperCase();
  if (!dur && solicitud.plan_duracion) {dur = solicitud.plan_duracion;}
  if (!dur) {dur = '30D';}

  const resultado = await crearLicenciaConAdministrador(dur);
  if (resultado.error) {throw httpError(400, resultado.error);}

  await db.queryUnscoped(
    `UPDATE solicitudes_licencia
        SET clave_generada = $1, clave_pin_inicial = $2, clave_enviada_en = CURRENT_TIMESTAMP,
            estado = 'Atendida',
            atendida_en = COALESCE(atendida_en, CURRENT_TIMESTAMP)
      WHERE id = $3`,
    [resultado.clave, String(resultado.pinInicial || ''), id]
  );

  await registrarAuditoria(db, {
    usuarioId: null,
    accion: 'ENTREGAR_CLAVE',
    entidad: 'solicitudes_licencia',
    entidadId: String(id),
    detalle: { propietario: solicitud.propietario, negocio: solicitud.negocio, duracion: resultado.duracion },
    ip,
  });

  // Envía la clave por Telegram al chat del propietario con la info del cliente.
  let enviadaPorTelegram = false;
  try {
    const actualizada = await obtenerSolicitudPorId(id);
    await enviarClaveActivacion(actualizada || solicitud, resultado.clave, resultado.pinInicial);
    enviadaPorTelegram = true;
  } catch (err) {
    logger.warn({ action: 'TELEGRAM_CLAVE_NO_ENVIADA', error: (err as Error).message });
  }

  return {
    clave: resultado.clave,
    duracion: resultado.duracion,
    vitalicia: resultado.vitalicia,
    pinInicial: resultado.pinInicial,
    empresaId: resultado.empresaId,
    reutilizada: false,
    enviadaPorTelegram,
    solicitud: await obtenerSolicitudPorId(id),
  };
}

/**
 * Compone el correo de entrega de clave (texto plano, HTML y enlace mailto).
 * Replica exactamente la plantilla del legacy (server.js /enviar-email).
 */
export function construirCorreoActivacion(solicitud: ISolicitudFila): ICorreoActivacion {
  const nombreCliente = solicitud.propietario || 'Estimado Cliente';
  const nombreNegocio = solicitud.negocio || 'tu Restaurante';
  const plan = solicitud.plan_nombre || 'Plan POS';
  const clave = solicitud.clave_generada || '';
  const pin = solicitud.clave_pin_inicial || config.bootstrapAdminPin || '041120';
  const urlActivacion = 'https://chloerestaurant.lat/activacion';
  const asunto = `🔑 Licencia y Pasos de Activación — ${nombreNegocio}`;

  const textoPlano = `¡Hola ${nombreCliente}!

Tu licencia para ${nombreNegocio} ha sido generada con éxito.

============================================================
DATOS DE TU LICENCIA POS
============================================================
• Plan: ${plan}
• Clave de Activación: ${clave}
• PIN Inicial Administrador: ${pin}
• Enlace de Activación: ${urlActivacion}

============================================================
PASOS PARA ACTIVAR TU RESTAURANTE:
============================================================
1. Abre tu navegador web en la terminal o tableta del restaurante.
2. Ingresa al enlace de activación: ${urlActivacion}
3. Pega o escribe tu Clave de Activación: ${clave}
4. Completa el Asistente de Configuración (Wizard):
   - Personaliza el Nombre de tu Negocio y Logo
   - Configura tu RNC y datos fiscales
   - Cambia o confirma tu PIN de Administrador
5. ¡Listo! Tu sistema POS quedará 100% activo y personalizado.

============================================================
CANALES DE SOPORTE Y CONTACTO:
============================================================
¿Necesitas ayuda con la instalación o configuración?
• WhatsApp Oficial: +1 (829) 370-0708
• Telegram Soporte: https://t.me/chloerest_bot
• Correo Electrónico: soporte@chloerestaurant.lat
• Portal Web: https://chloerestaurant.lat

¡Gracias por elegir ChloeRestaurant POS!
`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0c101d; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
      <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 30px 24px; text-align: center; border-bottom: 2px solid #f5b83d;">
        <h1 style="color: #f5b83d; margin: 0; font-size: 24px;">🍽️ ChloeRestaurant POS</h1>
        <p style="color: #94a3b8; margin: 6px 0 0; font-size: 14px;">Activación de Licencia Comercial</p>
      </div>

      <div style="padding: 28px 24px;">
        <p style="font-size: 16px; margin: 0 0 16px;">¡Hola <strong>${nombreCliente}</strong>!</p>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          Tu licencia para <strong>${nombreNegocio}</strong> está lista. A continuación te entregamos los datos de acceso y los pasos para activar tu sistema.
        </p>

        <!-- Recuadro Clave -->
        <div style="background: #1e2438; border: 1.5px dashed #f5b83d; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Tu Clave de Activación:</div>
          <div style="font-family: monospace; font-size: 18px; font-weight: bold; color: #f5b83d; word-break: break-all; letter-spacing: 1px;">${clave}</div>
          <div style="margin-top: 12px; font-size: 13px; color: #cbd5e1;">
            PIN Inicial de Administrador: <strong style="color: #00f576; font-family: monospace; font-size: 15px;">${pin}</strong>
          </div>
          <div style="margin-top: 6px; font-size: 12px; color: #94a3b8;">Plan Contratado: <strong>${plan}</strong></div>
        </div>

        <!-- Pasos -->
        <div style="background: #131929; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: #fff; margin: 0 0 14px; font-size: 15px;">🚀 Pasos para realizar la activación:</h3>
          <ol style="color: #cbd5e1; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Abre tu navegador en la computadora o tableta de tu restaurante.</li>
            <li>Ingresa a: <a href="${urlActivacion}" style="color: #38bdf8; text-decoration: none; font-weight: bold;">${urlActivacion}</a></li>
            <li>Introduce tu <strong>Clave de Activación</strong> arriba indicada.</li>
            <li>Completa el <strong>Setup Wizard</strong> (Nombre del negocio, Logo, RNC y PIN).</li>
            <li>¡Tu sistema quedará 100% personalizado y listo para operar!</li>
          </ol>
        </div>

        <!-- Botón de acción -->
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${urlActivacion}" style="display: inline-block; background: #f5b83d; color: #000; font-weight: bold; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 14px;">Ir a la Pantalla de Activación</a>
        </div>

        <!-- Canales de Soporte -->
        <div style="border-top: 1px solid #1e293b; padding-top: 20px; font-size: 12px; color: #94a3b8;">
          <strong style="color: #fff; display: block; margin-bottom: 8px;">📞 Canales de Soporte Técnico:</strong>
          <div>💬 WhatsApp: <strong style="color: #00f576;">+1 (829) 370-0708</strong></div>
          <div>✈️ Telegram: <a href="https://t.me/chloerest_bot" style="color: #38bdf8;">@chloerest_bot</a></div>
          <div>✉️ Correo: <a href="mailto:soporte@chloerestaurant.lat" style="color: #38bdf8;">soporte@chloerestaurant.lat</a></div>
        </div>
      </div>
    </div>
  `;

  const mailtoUrl = `mailto:${encodeURIComponent(solicitud.email || '')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textoPlano)}`;

  logger.info({ action: 'CORREO_ACTIVACION_COMPUESTO', solicitudId: solicitud.id, email: solicitud.email });

  return { asunto, textoPlano, html, mailtoUrl, pin };
}
