/**
 * @file Servicio de plataforma: dispositivos, licencias de empresa, login del
 * Dueño (rate-limit), reset de pruebas y CRUDs del panel (planes, métodos de
 * pago, cuentas bancarias). Puerto directo de los flujos de plataforma de
 * server.js (legacy).
 */

import crypto from 'node:crypto';
import { httpError } from '../lib/core.js';
import { config } from '../lib/config.js';
import { getDatabase, runWithRequestContext } from '../db/index.js';
import { registrarAuditoria } from './auditoriaService.js';
import { parsearDuracion, vencimientoDesdeMeses } from '../lib/licencias.js';
import { hashPin } from './authService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('plataformaService');

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ──── Limitador de intentos de PIN del Dueño (anti fuerza bruta) ────

interface IIntentoRecord {
  count: number;
  primerIntento: number;
  bloqueadoHasta: number | null;
}

const loginLimiter = {
  intentos: new Map<string | null, IIntentoRecord>(),
  maxAttempts: config.login.maxAttempts,
  windowMs: config.login.windowMinutes * 60 * 1000,
  lockoutMs: config.login.lockoutMinutes * 60 * 1000,
  limpiarVencidos(): void {
    const now = Date.now();
    for (const [key, record] of this.intentos) {
      if (record.bloqueadoHasta && record.bloqueadoHasta <= now) {this.intentos.delete(key);}
      else if (!record.bloqueadoHasta && now - record.primerIntento > this.windowMs) {this.intentos.delete(key);}
    }
  },
};

export function verificarRateLimit(ip: string | null): void {
  loginLimiter.limpiarVencidos();
  const record = loginLimiter.intentos.get(ip);
  if (!record || !record.bloqueadoHasta) {return;}
  const restanteMin = Math.ceil((record.bloqueadoHasta - Date.now()) / 60000);
  throw httpError(429, `Demasiados intentos fallidos. Reintenta en ${restanteMin} min.`);
}

export function registrarIntentoFallido(ip: string | null): void {
  const now = Date.now();
  const record = loginLimiter.intentos.get(ip) || { count: 0, primerIntento: now, bloqueadoHasta: null };
  record.count += 1;
  if (record.count >= loginLimiter.maxAttempts) {
    record.bloqueadoHasta = now + loginLimiter.lockoutMs;
    record.count = 0;
    console.warn(`IP ${ip} bloqueada temporalmente tras ${loginLimiter.maxAttempts} intentos fallidos.`);
  }
  loginLimiter.intentos.set(ip, record);
}

export function registrarIntentoExitoso(ip: string | null): void {
  loginLimiter.intentos.delete(ip);
}

// ──── Licencia pública (GET /api/licencia/verificar) ────

/** Cuerpo JSON de verificación de licencia (idéntico al legacy). */
export interface IVerificacionLicencia {
  bloqueado: boolean;
  esNuevo?: boolean;
  tipo?: string;
  motivo?: string;
  contacto?: string;
  diasRestantes?: number;
}

export async function verificarLicenciaPublica(): Promise<IVerificacionLicencia> {
  const db = getDatabase();
  const result = await db.queryUnscoped<{
    fecha_instalacion: Date | null;
    duracion_meses: number;
    licencia_bloqueada: boolean;
  }>('SELECT fecha_instalacion, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1');
  if (!result.rowCount) {return { bloqueado: false, esNuevo: true };}
  const negocio = result.rows[0];
  if (negocio.licencia_bloqueada) {
    return { bloqueado: true, motivo: 'La licencia se encuentra suspendida.', contacto: 'Comunícate con soporte técnico.' };
  }
  if (negocio.duracion_meses === -1) {return { bloqueado: false, tipo: 'Vitalicia' };}
  const daysAllowed = negocio.duracion_meses > 0 ? negocio.duracion_meses * 30 : 7;
  // Bug-for-bug con el legacy: fecha nula equivale a la época (new Date(null)).
  const fechaInstalacion = negocio.fecha_instalacion === null ? new Date(0) : new Date(negocio.fecha_instalacion);
  const elapsedDays = (Date.now() - fechaInstalacion.getTime()) / 86400000;
  if (elapsedDays > daysAllowed) {
    return { bloqueado: true, motivo: 'El período de licencia ha finalizado.', contacto: 'Comunícate con soporte técnico.' };
  }
  return { bloqueado: false, diasRestantes: Math.ceil(daysAllowed - elapsedDays) };
}

// ──── Registro público de dispositivo (POST /api/dispositivo/registrar) ────

interface IDispositivoRegistrado {
  device_id: string;
  empresa_id: number;
  estado: string;
  activado_en: Date | null;
  licencia_duracion: string | null;
  licencia_vencimiento: Date | null;
}

/** Cuerpo JSON de registro de dispositivo (idéntico al legacy). */
export interface ICuerpoRegistroDispositivo {
  deviceId: string;
  activado: boolean;
  vencido: boolean;
  licenciaDuracion: string | null;
  licenciaVencimiento: string | null;
  empresaId: number;
  tenantId: number;
}

export async function registrarDispositivoPublico(params: {
  deviceId: string;
  headerDeviceId: string;
  navegador: string;
  ip: string | null;
}): Promise<ICuerpoRegistroDispositivo> {
  const db = getDatabase();
  const { deviceId, headerDeviceId, navegador, ip } = params;
  if (!deviceId || deviceId.length > 100) {throw httpError(400, 'Identificador de dispositivo inválido.');}
  if (headerDeviceId && headerDeviceId !== deviceId) {throw httpError(400, 'El identificador del dispositivo no coincide.');}
  const result = await db.queryUnscoped<IDispositivoRegistrado>(
    `INSERT INTO dispositivos (device_id, empresa_id, navegador, ip, ultimo_acceso)
     VALUES ($1, 1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (device_id) DO UPDATE
       SET navegador = $2, ip = $3, ultimo_acceso = CURRENT_TIMESTAMP
     RETURNING device_id, empresa_id, estado, activado_en, licencia_duracion, licencia_vencimiento`,
    [deviceId, navegador, ip]
  );
  const fila = result.rows[0];
  if (!fila) {throw httpError(500, 'No se pudo registrar el dispositivo.');}
  const vencido =
    fila.estado === 'Activo' &&
    fila.licencia_vencimiento !== null &&
    new Date(fila.licencia_vencimiento).getTime() < Date.now();
  if (vencido) {
    await db.queryUnscoped("UPDATE dispositivos SET estado = 'Pendiente' WHERE device_id = $1", [fila.device_id]);
  }
  return {
    deviceId: fila.device_id,
    activado: fila.estado === 'Activo' && !vencido,
    vencido,
    licenciaDuracion: fila.licencia_duracion || null,
    licenciaVencimiento: fila.licencia_vencimiento ? new Date(fila.licencia_vencimiento).toISOString() : null,
    empresaId: fila.empresa_id,
    tenantId: fila.empresa_id,
  };
}

// ──── Activación de dispositivo (POST /api/dispositivo/activar) ────

interface IDispositivoFila {
  id: number;
  device_id: string;
  empresa_id: number;
  estado: string;
  intentos_fallidos: number | null;
  clave_activacion: string | null;
}

interface ILicenciaRegistrada {
  empresa_id: number;
  duracion_codigo: string;
  activa: boolean;
  admin_pin_hash: string | null;
}

interface INegocioFila {
  id: number;
  duracion_meses: number;
}

/** Cuerpo JSON de éxito de la activación (idéntico al legacy). */
export interface ICuerpoActivacion {
  activado: boolean;
  empresaId: number;
  tenantId: number;
  licenciaDuracion?: string | null;
  vitalicia?: boolean;
  licenciaVencimiento?: string | null;
  diasRestantes?: number | null;
  pinAdministradorGenerado?: boolean;
}

const FORMATO_CHLOE = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){1,15})$/i;

export async function activarDispositivo(params: {
  deviceId: string;
  clave: string;
  ip: string | null;
  navegador: string;
}): Promise<ICuerpoActivacion> {
  const db = getDatabase();
  const { deviceId, clave, ip, navegador } = params;
  if (!deviceId || deviceId.length > 100) {throw httpError(400, 'Identificador de dispositivo inválido.');}
  if (!clave) {throw httpError(400, 'Ingresa la clave de activación del dispositivo.');}

  let deviceRes = await db.queryUnscoped<IDispositivoFila>(
    'SELECT id, empresa_id, estado, intentos_fallidos, clave_activacion FROM dispositivos WHERE device_id = $1',
    [deviceId]
  );
  if (!deviceRes.rowCount) {
    deviceRes = await db.queryUnscoped<IDispositivoFila>(
      `INSERT INTO dispositivos (device_id, empresa_id, estado, navegador, ip)
       VALUES ($1, 1, 'Pendiente', $2, $3)
       ON CONFLICT (device_id) DO UPDATE SET ultimo_acceso = CURRENT_TIMESTAMP
       RETURNING id, empresa_id, estado, intentos_fallidos, clave_activacion`,
      [deviceId, navegador, ip]
    );
  }
  const dispositivo = deviceRes.rows[0];

  const claveHash = sha256Hex(clave);
  let stored: ILicenciaRegistrada | null = null;
  try {
    const res = await db.queryUnscoped<ILicenciaRegistrada>(
      'SELECT empresa_id, duracion_codigo, activa, admin_pin_hash FROM licencias WHERE clave_hash = $1',
      [claveHash]
    );
    stored = res.rows[0] || null;
  } catch (err) {
    logger.warn({ action: 'LICENCIA_BUSQUEDA_FALLIDA', error: (err as Error).message });
  }

  // Clave generada por el Bot de Telegram / Propietario aún no registrada:
  // se valida por formato y se registra dinámicamente con empresa nueva.
  if (!stored && clave !== config.licenseActivationKey) {
    const match = FORMATO_CHLOE.exec(clave);
    if (match) {
      const parsed = parsearDuracion(match[1]);
      if (parsed) {
        const pinInicial = String(crypto.randomInt(100000, 1000000));
        const pinHash = hashPin(pinInicial);
        const nuevaEmpresaId = await db.transaction(async (client) => {
          const emp = await client.query<{ id: number }>(
            `INSERT INTO empresas (nombre, slug) VALUES ($1, $2) RETURNING id`,
            [`Empresa ${clave.slice(-8)}`, `empresa-${crypto.randomUUID()}`]
          );
          await client.query(
            `INSERT INTO licencias (empresa_id, clave_hash, duracion_codigo, admin_pin_hash, activa)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [emp.rows[0].id, claveHash, match[1].toUpperCase(), pinHash]
          );
          return emp.rows[0].id;
        });
        stored = {
          empresa_id: nuevaEmpresaId,
          duracion_codigo: match[1].toUpperCase(),
          activa: true,
          admin_pin_hash: pinHash,
        };
      }
    }
  }

  const empresaId = stored ? stored.empresa_id : 1;

  // 1) Clave maestra antigua (compatibilidad) → Vitalicia
  // 2) CHLOE-<DURACION>-<FIRMA> → valida firma y aplica la duración
  let licencia: { vitalicia: boolean; meses: number; codigo: string };
  let claveCanonica: string;
  if (stored && !stored.activa) {throw httpError(403, 'La licencia está inactiva.');}
  if (stored) {
    const parsed = parsearDuracion(stored.duracion_codigo);
    if (!parsed) {throw httpError(500, 'La licencia registrada tiene una duración inválida.');}
    licencia = { vitalicia: parsed.vitalicia, meses: parsed.meses, codigo: stored.duracion_codigo };
    claveCanonica = clave;
  } else if (clave === config.licenseActivationKey) {
    if (dispositivo.empresa_id !== 1) {throw httpError(403, 'La clave legacy solo puede usarse con la empresa LEGACY.');}
    licencia = { vitalicia: true, meses: -1, codigo: 'L' };
    claveCanonica = config.licenseActivationKey;
  } else {
    const intentos = (dispositivo.intentos_fallidos || 0) + 1;
    await db.queryUnscoped('UPDATE dispositivos SET intentos_fallidos = $1 WHERE id = $2', [intentos, dispositivo.id]);
    throw httpError(401, 'Clave de activación no registrada o formato inválido.');
  }

  if (dispositivo.estado === 'Activo' && dispositivo.empresa_id === empresaId && dispositivo.clave_activacion === claveCanonica) {
    return { activado: true, empresaId: dispositivo.empresa_id, tenantId: dispositivo.empresa_id };
  }

  const activacion = await runWithRequestContext({ empresaId }, () =>
    db.transaction(async (client) => {
      // Serializa activaciones concurrentes de la misma clave antes de contar.
      // PG10 no tiene hashtextextended (PG14+): se deriva la llave en Node.
      const lockKey = BigInt('0x' + claveHash.slice(0, 15));
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey]);
      const contador = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM dispositivos
         WHERE estado = 'Activo' AND clave_activacion = $1 AND empresa_id = $2 AND id != $3`,
        [claveCanonica, empresaId, dispositivo.id]
      );
      if (contador.rows[0].total >= 2) {
        throw httpError(403, 'Esta clave de licencia ya tiene 2 dispositivos activos. Usa otra clave o gestiona los dispositivos activos.');
      }

      // El dispositivo pendiente puede estar en LEGACY; la reasignación queda
      // explícitamente limitada a la empresa de la licencia resuelta.
      if (dispositivo.empresa_id !== empresaId) {await client.query("SELECT set_config('app.platform', 'true', true)");}
      const vencimiento = licencia.vitalicia ? null : vencimientoDesdeMeses(licencia.meses);
      await client.query(
        `UPDATE dispositivos SET estado = 'Activo', activado_en = CURRENT_TIMESTAMP,
            intentos_fallidos = 0, licencia_duracion = $1, licencia_vencimiento = $2,
            clave_activacion = $3, empresa_id = $5 WHERE id = $4`,
        [licencia.codigo, vencimiento, claveCanonica, dispositivo.id, empresaId]
      );
      if (dispositivo.empresa_id !== empresaId) {await client.query("SELECT set_config('app.platform', 'false', true)");}

      // Sólo se crea el negocio si aún no existe uno para esa empresa: evita
      // duplicados y cumple las columnas NOT NULL (razon_social, rnc, telefono,
      // direccion) con un rnc único por empresa (hay índice UNIQUE sobre rnc).
      const negocioExistente = await client.query<{ id: number }>(
        'SELECT id FROM negocio_config WHERE empresa_id = $1 LIMIT 1',
        [empresaId]
      );
      if (!negocioExistente.rowCount) {
        const ncRnc = String(empresaId).padStart(11, '0');
        await client.query(
          `INSERT INTO negocio_config (empresa_id, nombre_comercial, razon_social, rnc, telefono, direccion, duracion_meses, estado_licencia)
           VALUES ($1, 'Mi Restaurante', 'Mi Restaurante', $2, '', '', $3, 'Activa')`,
          [empresaId, ncRnc, licencia.meses]
        );
      }
      await client.query(
        `INSERT INTO configuracion_sistema (empresa_id, setup_completado)
         VALUES ($1, FALSE) ON CONFLICT DO NOTHING`,
        [empresaId]
      );
      if (stored && stored.admin_pin_hash) {
        const admin = await client.query<{ id: number }>(
          "SELECT 1 FROM usuarios WHERE empresa_id = $1 AND rol = 'Administrador' AND estado = 'Activo' LIMIT 1",
          [empresaId]
        );
        if (!admin.rowCount) {
          await client.query(
            `INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, requiere_cambio_pin, estado)
             VALUES ($1, 'Administrador Sistema', 'Administrador', NULL, $2, TRUE, 'Activo')`,
            [empresaId, stored.admin_pin_hash]
          );
        }
      }
      if (stored) {
        await client.query(
          'UPDATE licencias SET activada_en = COALESCE(activada_en, CURRENT_TIMESTAMP) WHERE clave_hash = $1 AND empresa_id = $2',
          [claveHash, empresaId]
        );
      }

      const negocio = await client.query<INegocioFila>(
        'SELECT id, duracion_meses FROM negocio_config WHERE empresa_id = $1 LIMIT 1',
        [empresaId]
      );
      if (negocio.rowCount && negocio.rows[0].duracion_meses !== -1) {
        if (licencia.vitalicia) {
          await client.query('UPDATE negocio_config SET duracion_meses = -1, licencia_bloqueada = FALSE WHERE id = $1 AND empresa_id = $2', [negocio.rows[0].id, empresaId]);
        } else if (vencimiento) {
          const diasRestantes = Math.max(0, Math.ceil((vencimiento.getTime() - Date.now()) / 86400000));
          const nuevosMeses = Math.max(negocio.rows[0].duracion_meses || 0, Math.ceil(diasRestantes / 30));
          await client.query('UPDATE negocio_config SET duracion_meses = $1, licencia_bloqueada = FALSE WHERE id = $2 AND empresa_id = $3', [nuevosMeses, negocio.rows[0].id, empresaId]);
        }
      }
      await registrarAuditoria(client, {
        usuarioId: null,
        accion: 'ACTIVAR_DISPOSITIVO',
        entidad: 'dispositivos',
        entidadId: String(dispositivo.id),
        detalle: { deviceId, duracion: licencia.codigo, vitalicia: licencia.vitalicia },
        ip,
      });
      return { vencimiento };
    })
  );
  const vencimiento = activacion.vencimiento;
  return {
    activado: true,
    empresaId,
    tenantId: empresaId,
    licenciaDuracion: licencia.codigo,
    vitalicia: licencia.vitalicia,
    licenciaVencimiento: vencimiento ? vencimiento.toISOString() : null,
    diasRestantes: vencimiento ? Math.max(0, Math.ceil((vencimiento.getTime() - Date.now()) / 86400000)) : null,
    pinAdministradorGenerado: Boolean(stored && stored.admin_pin_hash),
  };
}

// ──── Gestión de dispositivos (GET list, estado, DELETE; admin/dueño) ────

export interface IDispositivoGestion {
  id: number;
  device_id: string;
  nombre: string | null;
  navegador: string | null;
  ip: string | null;
  estado: string;
  intentos_fallidos: number | null;
  activado_en: Date | null;
  licencia_duracion: string | null;
  licencia_vencimiento: Date | null;
  creado_en: Date | null;
  ultimo_acceso: Date | null;
  empresa_id: number;
  clave_activacion: string | null;
}

const COLUMNAS_DISPOSITIVO = `id, device_id, nombre, navegador, ip, estado, intentos_fallidos, activado_en,
              licencia_duracion, licencia_vencimiento, creado_en, ultimo_acceso, empresa_id, clave_activacion`;

export async function listarDispositivos(esDueno: boolean, empresaId: number): Promise<IDispositivoGestion[]> {
  const db = getDatabase();
  const result = esDueno
    ? await db.query<IDispositivoGestion>(`SELECT ${COLUMNAS_DISPOSITIVO} FROM dispositivos ORDER BY creado_en DESC`)
    : await db.query<IDispositivoGestion>(
        `SELECT ${COLUMNAS_DISPOSITIVO} FROM dispositivos WHERE empresa_id = $1 ORDER BY creado_en DESC`,
        [empresaId]
      );
  return result.rows;
}

export async function cambiarEstadoDispositivo(id: number, estado: string): Promise<{ id: number; device_id: string }> {
  const db = getDatabase();
  const result = await db.query<{ id: number; device_id: string }>(
    `UPDATE dispositivos
       SET estado = $1::VARCHAR,
           activado_en = CASE WHEN $1::VARCHAR = 'Activo' THEN COALESCE(activado_en, CURRENT_TIMESTAMP) ELSE activado_en END,
           intentos_fallidos = 0
     WHERE id = $2 RETURNING id, device_id`,
    [estado, id]
  );
  if (!result.rowCount) {throw httpError(404, 'Dispositivo no encontrado.');}
  return result.rows[0];
}

export async function eliminarDispositivo(id: number, esDueno: boolean, empresaId: number): Promise<void> {
  const db = getDatabase();
  const result = esDueno
    ? await db.query('DELETE FROM dispositivos WHERE id = $1 RETURNING id, device_id', [id])
    : await db.query('DELETE FROM dispositivos WHERE id = $1 AND empresa_id = $2 RETURNING id, device_id', [
        id,
        empresaId,
      ]);
  if (!result.rowCount) {throw httpError(404, 'Dispositivo no encontrado.');}
}

// ──── Activación por Administrador (POST /api/licencia/activar) ────

export type IResultadoActivacionAdmin =
  | { ok: true }
  | { ok: false; error401: string };

export async function activarLicenciaDesdeSesion(params: {
  duracionMeses: unknown;
  claveMaestra: string;
  ip: string | null;
  usuarioId: number;
}): Promise<IResultadoActivacionAdmin> {
  const db = getDatabase();
  let duration = Number(params.duracionMeses);
  const clave = params.claveMaestra;
  if (!config.licenseActivationKey) {throw httpError(503, 'La activación no está configurada en el servidor.');}

  let duracionDesdeClave: { vitalicia: boolean; meses: number } | null = null;
  if (clave !== config.licenseActivationKey) {
    const match = /^CHLOE-([0-9]+[DM]|L)-([A-F0-9]{5}(?:-[A-F0-9]{5}){3})$/i.exec(clave);
    if (match) {
      const firmaRecibida = String(match[2]).replace(/-/g, '').toUpperCase();
      // Bug-for-bug con el legacy: firma calculada sin secret (la clave maestra
      // CHLOE se valida realmente por lado del dispositivo, no aquí).
      const firmaEsperada = firmarDuracionSinSecret(match[1]);
      const a = Buffer.from(firmaRecibida);
      const b = Buffer.from(firmaEsperada);
      const firmaValida = a.length === b.length && crypto.timingSafeEqual(a, b);
      const parsed = parsearDuracion(match[1]);
      if (firmaValida && parsed) {duracionDesdeClave = parsed;}
    }
  }
  if (duracionDesdeClave) {
    duration = duracionDesdeClave.vitalicia ? -1 : duracionDesdeClave.meses;
  } else if (clave !== config.licenseActivationKey) {
    return { ok: false, error401: 'Clave de activación incorrecta.' };
  }

  if (!Number.isInteger(duration) || duration < -1) {throw httpError(400, 'Duración de licencia no válida.');}
  await db.query(
    'UPDATE negocio_config SET duracion_meses = $1, licencia_bloqueada = FALSE, fecha_instalacion = CURRENT_TIMESTAMP',
    [duration]
  );
  await registrarAuditoria(db, {
    usuarioId: params.usuarioId,
    accion: 'ACTIVAR_LICENCIA',
    entidad: 'negocio_config',
    detalle: { duration },
    ip: params.ip,
  });
  return { ok: true };
}

function firmarDuracionSinSecret(dur: string): string {
  return crypto.createHmac('sha256', '').update(`CHLOE:${dur.toUpperCase()}`).digest('hex').toUpperCase().slice(0, 20);
}

// ──── CRUD Cuentas Bancarias (por empresa, RLS) ────

export type IFilaGenerica = Record<string, unknown>;

function textoSinUndefined(v: unknown): string | undefined {
  return v === undefined || v === null ? undefined : String(v).trim();
}

export async function listarCuentasBancarias(): Promise<IFilaGenerica[]> {
  const db = getDatabase();
  const result = await db.query('SELECT * FROM cuentas_bancarias ORDER BY orden, id');
  return result.rows;
}

export async function crearCuentaBancaria(body: Record<string, unknown>): Promise<IFilaGenerica> {
  const db = getDatabase();
  const nombreBanco = textoSinUndefined(body.nombre_banco);
  const numeroCuenta = textoSinUndefined(body.numero_cuenta);
  const titular = textoSinUndefined(body.titular);
  if (!nombreBanco || !numeroCuenta || !titular) {
    throw httpError(400, 'Banco, número de cuenta y titular son obligatorios.');
  }
  const result = await db.query(
    `INSERT INTO cuentas_bancarias (nombre_banco, tipo_cuenta, numero_cuenta, titular)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nombreBanco, body.tipo_cuenta || 'Corriente', numeroCuenta, titular]
  );
  return result.rows[0];
}

export async function actualizarCuentaBancaria(id: number, body: Record<string, unknown>): Promise<IFilaGenerica> {
  const db = getDatabase();
  const result = await db.query(
    `UPDATE cuentas_bancarias
     SET nombre_banco = $1, tipo_cuenta = $2, numero_cuenta = $3, titular = $4, activa = $5, orden = $6
     WHERE id = $7 RETURNING *`,
    [
      textoSinUndefined(body.nombre_banco),
      body.tipo_cuenta || 'Corriente',
      textoSinUndefined(body.numero_cuenta),
      textoSinUndefined(body.titular),
      body.activa !== false,
      body.orden || 0,
      id,
    ]
  );
  if (!result.rowCount) {throw httpError(404, 'Cuenta bancaria no encontrada.');}
  return result.rows[0];
}

export async function eliminarCuentaBancaria(id: number): Promise<void> {
  const db = getDatabase();
  const result = await db.query('DELETE FROM cuentas_bancarias WHERE id = $1', [id]);
  if (!result.rowCount) {throw httpError(404, 'Cuenta bancaria no encontrada.');}
}

// ──── Panel del Dueño: licencias, resumen, planes y métodos de pago ────

export async function revocarLicencia(id: number, motivo: string): Promise<void> {
  const db = getDatabase();
  const lic = await db.query<{ id: number; empresa_id: number }>('SELECT id, empresa_id FROM licencias WHERE id = $1', [id]);
  if (!lic.rowCount) {throw httpError(404, 'Licencia no encontrada.');}
  const empresaId = lic.rows[0].empresa_id;
  await db.transaction(async (client) => {
    await client.query('UPDATE licencias SET activa = FALSE, revocada = TRUE, motivo_revocacion = $1 WHERE id = $2', [motivo, id]);
    await client.query("UPDATE dispositivos SET estado = 'Inactivo' WHERE empresa_id = $1", [empresaId]);
    await client.query('UPDATE negocio_config SET licencia_bloqueada = TRUE WHERE empresa_id = $1', [empresaId]);
    await client.query('DELETE FROM app_sessions WHERE empresa_id = $1', [empresaId]);
  });
  logger.info({ action: 'LICENCIA_REVOCADA', licenciaId: id, empresaId });
}

export async function reactivarLicencia(id: number): Promise<void> {
  const db = getDatabase();
  const lic = await db.query<{ id: number; empresa_id: number }>('SELECT id, empresa_id FROM licencias WHERE id = $1', [id]);
  if (!lic.rowCount) {throw httpError(404, 'Licencia no encontrada.');}
  const empresaId = lic.rows[0].empresa_id;
  await db.transaction(async (client) => {
    await client.query('UPDATE licencias SET activa = TRUE, revocada = FALSE, motivo_revocacion = NULL WHERE id = $1', [id]);
    await client.query("UPDATE dispositivos SET estado = 'Activo' WHERE empresa_id = $1", [empresaId]);
    await client.query('UPDATE negocio_config SET licencia_bloqueada = FALSE WHERE empresa_id = $1', [empresaId]);
  });
  logger.info({ action: 'LICENCIA_REACTIVADA', licenciaId: id, empresaId });
}

export async function eliminarLicencia(id: number): Promise<void> {
  const db = getDatabase();
  const lic = await db.query<{ id: number; empresa_id: number }>('SELECT id, empresa_id FROM licencias WHERE id = $1', [id]);
  if (!lic.rowCount) {throw httpError(404, 'Licencia no encontrada.');}
  const empresaId = lic.rows[0].empresa_id;
  await db.transaction(async (client) => {
    await client.query('DELETE FROM licencias WHERE id = $1', [id]);
    if (empresaId !== 1) {
      await client.query('DELETE FROM empresas WHERE id = $1', [empresaId]);
    }
  });
  logger.info({ action: 'LICENCIA_ELIMINADA', licenciaId: id, empresaId });
}

export interface ILicenciaDueno {
  id: number;
  empresa_id: number;
  clave_hash: string;
  clave: string;
  duracion_codigo: string;
  activa: boolean;
  revocada: boolean;
  motivo_revocacion: string | null;
  creado_en: Date | null;
  activada_en: Date | null;
  vencimiento: Date | null;
  empresa_nombre: string;
  nombre_negocio: string | null;
  total_dispositivos: number;
  dispositivos_activos: number;
  propietario: string | null;
  email: string | null;
  telefono: string | null;
}

export async function listarLicenciasDueno(): Promise<ILicenciaDueno[]> {
  const db = getDatabase();
  const result = await db.query<ILicenciaDueno>(
    `SELECT
       l.id,
       l.empresa_id,
       l.clave_hash,
       COALESCE(l.clave_texto, 'CHLOE-' || l.duracion_codigo || '-******') AS clave,
       l.duracion_codigo,
       l.activa,
       l.revocada,
       l.motivo_revocacion,
       l.creado_en,
       l.activada_en,
       l.vencimiento,
       e.nombre AS empresa_nombre,
       cfg.nombre_negocio,
       (SELECT COUNT(*)::int FROM dispositivos d WHERE d.empresa_id = l.empresa_id) AS total_dispositivos,
       (SELECT COUNT(*)::int FROM dispositivos d WHERE d.empresa_id = l.empresa_id AND d.estado = 'Activo') AS dispositivos_activos,
       (SELECT s.propietario FROM solicitudes_licencia s WHERE s.clave_generada = l.clave_texto LIMIT 1) AS propietario,
       (SELECT s.email FROM solicitudes_licencia s WHERE s.clave_generada = l.clave_texto LIMIT 1) AS email,
       (SELECT s.telefono FROM solicitudes_licencia s WHERE s.clave_generada = l.clave_texto LIMIT 1) AS telefono
     FROM licencias l
     JOIN empresas e ON e.id = l.empresa_id
     LEFT JOIN configuracion_sistema cfg ON cfg.empresa_id = l.empresa_id
     ORDER BY l.creado_en DESC`
  );
  return result.rows;
}

export async function listarFacturasDueno(): Promise<IFilaGenerica[]> {
  const db = getDatabase();
  const result = await db.query(
    `SELECT id, numero_factura, plan_id, plan_nombre, propietario, negocio, telefono, email,
            provincia, metodo_pago, comprobante, monto, moneda, estado, pagada_en, creado_en
       FROM solicitudes_licencia
      WHERE numero_factura IS NOT NULL
      ORDER BY pagada_en DESC NULLS LAST, creado_en DESC`
  );
  return result.rows;
}

/** Resumen del panel del Dueño (GET /api/dueno/resumen). */
export interface IResumenDueno {
  dispositivos: { total: number; activos: number };
  solicitudes: { total: number; pendientes: number; pagadas: number };
  planes: { total: number };
  negocio: { nombre_comercial: string; duracion_meses: number; licencia_bloqueada: boolean } | null;
  facturas: { total: number; monto_total: string };
  ownerPinConfigurado: boolean;
}

export async function resumenDueno(): Promise<IResumenDueno> {
  const db = getDatabase();
  const [devices, solicitudes, planes, negocio, facturas, ownerCfg] = await Promise.all([
    db.query<{ total: number; activos: number }>(
      "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Activo')::int AS activos FROM dispositivos"
    ),
    db.query<{ total: number; pendientes: number; pagadas: number }>(
      "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'Pendiente')::int AS pendientes, COUNT(*) FILTER (WHERE estado = 'Pagada')::int AS pagadas FROM solicitudes_licencia"
    ),
    db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM planes_licencia WHERE activo = TRUE'),
    db.query<{ nombre_comercial: string; duracion_meses: number; licencia_bloqueada: boolean }>(
      'SELECT nombre_comercial, duracion_meses, licencia_bloqueada FROM negocio_config ORDER BY id LIMIT 1'
    ),
    db.query<{ total: number; monto_total: string }>(
      'SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto_total FROM solicitudes_licencia WHERE numero_factura IS NOT NULL'
    ),
    db.query<{ owner_pin_configurado: boolean }>(
      'SELECT owner_pin_hash IS NOT NULL AS owner_pin_configurado FROM configuracion_sistema WHERE id = 1'
    ),
  ]);
  return {
    dispositivos: devices.rows[0],
    solicitudes: solicitudes.rows[0],
    planes: planes.rows[0],
    negocio: negocio.rows[0] || null,
    facturas: facturas.rows[0],
    ownerPinConfigurado: ownerCfg.rows[0]?.owner_pin_configurado || false,
  };
}

/** Parámetros ya validados de un plan (ver planDesdeBody en dueno.ts). */
export interface IDatosPlan {
  nombre: string;
  duracionCodigo: string;
  precio: number;
  moneda: string;
  destacado: boolean;
  activo: boolean;
  orden: number;
}

export async function crearPlanDueno(p: IDatosPlan): Promise<IFilaGenerica> {
  const db = getDatabase();
  const result = await db.query(
    `INSERT INTO planes_licencia (nombre, duracion_codigo, precio, moneda, destacado, activo, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [p.nombre, p.duracionCodigo, p.precio, p.moneda, p.destacado, p.activo, p.orden]
  );
  return result.rows[0];
}

export async function actualizarPlanDueno(id: number, p: IDatosPlan): Promise<IFilaGenerica> {
  const db = getDatabase();
  const result = await db.query(
    `UPDATE planes_licencia
        SET nombre = $1, duracion_codigo = $2, precio = $3, moneda = $4, destacado = $5, activo = $6, orden = $7
      WHERE id = $8 RETURNING *`,
    [p.nombre, p.duracionCodigo, p.precio, p.moneda, p.destacado, p.activo, p.orden, id]
  );
  if (!result.rowCount) {throw httpError(404, 'Plan no encontrado.');}
  return result.rows[0];
}

export async function eliminarPlanDueno(id: number): Promise<void> {
  const db = getDatabase();
  const result = await db.query('DELETE FROM planes_licencia WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {throw httpError(404, 'Plan no encontrado.');}
}

export async function listarPlanesDueno(): Promise<IFilaGenerica[]> {
  const db = getDatabase();
  const result = await db.query('SELECT * FROM planes_licencia ORDER BY orden, id');
  return result.rows;
}

export async function listarMetodosPagoDueno(): Promise<IFilaGenerica[]> {
  const db = getDatabase();
  const result = await db.query('SELECT * FROM metodos_pago ORDER BY orden, id');
  return result.rows;
}

/** Parámetros ya validados de un método de pago (ver metodoDesdeBody en dueno.ts). */
export interface IDatosMetodoPago {
  tipo: string;
  nombre: string;
  titular: string | null;
  detalle: string | null;
  dato1: string | null;
  dato2: string | null;
  dato3: string | null;
  linkPago: string | null;
  activo: boolean;
  orden: number;
}

export async function crearMetodoPagoDueno(m: IDatosMetodoPago): Promise<IFilaGenerica> {
  const db = getDatabase();
  const result = await db.query(
    `INSERT INTO metodos_pago (tipo, nombre, titular, detalle, dato1, dato2, dato3, link_pago, activo, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [m.tipo, m.nombre, m.titular, m.detalle, m.dato1, m.dato2, m.dato3, m.linkPago, m.activo, m.orden]
  );
  return result.rows[0];
}

export async function actualizarMetodoPagoDueno(id: number, m: IDatosMetodoPago): Promise<IFilaGenerica> {
  const db = getDatabase();
  const result = await db.query(
    `UPDATE metodos_pago
        SET tipo = $1, nombre = $2, titular = $3, detalle = $4,
            dato1 = $5, dato2 = $6, dato3 = $7, link_pago = $8, activo = $9, orden = $10
      WHERE id = $11 RETURNING *`,
    [m.tipo, m.nombre, m.titular, m.detalle, m.dato1, m.dato2, m.dato3, m.linkPago, m.activo, m.orden, id]
  );
  if (!result.rowCount) {throw httpError(404, 'Método de pago no encontrado.');}
  return result.rows[0];
}

export async function eliminarMetodoPagoDueno(id: number): Promise<void> {
  const db = getDatabase();
  const result = await db.query('DELETE FROM metodos_pago WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {throw httpError(404, 'Método de pago no encontrado.');}
}

// ──── Reset de datos de prueba (POST /api/dueno/reset-pruebas) ────

const SECUENCIAS_RESET = [
  'usuarios', 'empresas', 'licencias', 'productos', 'mesas', 'cuentas',
  'cuenta_detalles', 'aperturas_caja', 'arqueos_caja', 'dispositivos',
  'solicitudes_licencia', 'auditoria_operaciones', 'inventario_movimientos',
  'receta_productos', 'dgii_secuencias', 'cuentas_bancarias',
  'historial_cierres', 'menu_categorias', 'menu_guarniciones',
  'menu_terminos', 'clientes_frecuentes', 'ingredientes',
];

interface IConfigFila {
  owner_pin_hash: string | null;
  owner_pin_longitud: number | null;
}

/** Borra los datos de prueba preservando el PIN del Dueño y la empresa raíz. */
export async function resetearDatosPruebas(): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (client) => {
    await client.query("SELECT set_config('app.platform', 'true', false)");
    // Preservar el PIN del dueño: es independiente de los datos de prueba y no
    // debe perderse al resetear (el dueño conserva el control total del sistema).
    const owner = await client.query<IConfigFila>(
      'SELECT owner_pin_hash, owner_pin_longitud FROM configuracion_sistema WHERE id = 1'
    );
    const ownerHash = owner.rows[0]?.owner_pin_hash || null;
    const ownerLongitud = owner.rows[0]?.owner_pin_longitud || 6;

    // Borrar en orden correcto para respetar las claves foráneas.
    // (No se usa session_replication_role: requiere superusuario y en producción
    //  el usuario de BD no lo es, lo que provocaba error 500 al dueño.)
    await client.query('DELETE FROM auditoria_operaciones');
    await client.query('DELETE FROM receta_productos');
    await client.query('DELETE FROM dgii_secuencias');
    await client.query('DELETE FROM inventario_movimientos');
    await client.query('DELETE FROM app_sessions');
    await client.query('DELETE FROM aperturas_caja');
    await client.query('DELETE FROM arqueos_caja');
    await client.query('DELETE FROM cuentas_bancarias');
    await client.query('DELETE FROM historial_cierres');
    await client.query('DELETE FROM dispositivos');
    await client.query('DELETE FROM solicitudes_licencia');
    await client.query('DELETE FROM cuenta_detalles');
    await client.query('DELETE FROM cuentas');
    await client.query('DELETE FROM mesas');
    await client.query('DELETE FROM clientes_frecuentes');
    await client.query('DELETE FROM ingredientes');
    await client.query('DELETE FROM productos');
    await client.query('DELETE FROM menu_categorias');
    await client.query('DELETE FROM menu_guarniciones');
    await client.query('DELETE FROM menu_terminos');
    await client.query('DELETE FROM usuarios');
    await client.query('DELETE FROM licencias');
    await client.query('DELETE FROM configuracion_sistema');
    await client.query('DELETE FROM empresas');
    await client.query('DELETE FROM negocio_config');
    await client.query('DELETE FROM dgii_config');
    // Reset sequences (ignore errors for missing sequences)
    for (const seq of SECUENCIAS_RESET) {
      await client
        .query("SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)", [seq])
        .catch(() => undefined);
    }
    // Re-crear la empresa raíz y la configuración base para que el Setup Wizard
    // pueda iniciar de nuevo (setup_completado = FALSE).
    await client.query(
      `INSERT INTO empresas (id, nombre, slug, estado)
       VALUES (1, 'Mi Restaurante', 'mi-restaurante', 'Activa')
       ON CONFLICT (id) DO NOTHING`
    );
    await client.query(
      `INSERT INTO configuracion_sistema
        (id, empresa_id, nombre_negocio, tema_activo, estilo_login, setup_completado, owner_pin_hash, owner_pin_longitud)
       VALUES (1, 1, 'Mi Restaurante', 'noche', 'moderno', FALSE, $1, $2)
       ON CONFLICT (id) DO UPDATE SET
         nombre_negocio = 'Mi Restaurante',
         setup_completado = FALSE,
         owner_pin_hash = COALESCE($1, configuracion_sistema.owner_pin_hash),
         owner_pin_longitud = COALESCE($2, configuracion_sistema.owner_pin_longitud)`,
      [ownerHash, ownerLongitud]
    );
    await client.query(
      `INSERT INTO negocio_config (id, nombre_comercial, empresa_id)
       VALUES (1, 'Mi Restaurante', 1)
       ON CONFLICT (id) DO UPDATE SET
         nombre_comercial = 'Mi Restaurante',
         empresa_id = 1`
    );
  });
  logger.info({ action: 'RESET_PRUEBAS_OK' });
}
