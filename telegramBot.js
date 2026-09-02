// Bot de Telegram para administración completa del sistema ChloeRestaurant.
// Configuración (variables de entorno):
//   TELEGRAM_BOT_TOKEN      → token del bot creado en @BotFather
//   TELEGRAM_OWNER_CHAT_ID  → ID del chat de Telegram del propietario

import { runWithRequestContext } from './db.js';

const API_BASE = 'https://api.telegram.org';
const LIMITE_TEXTO = 4000;

let token = '';
let ownerChatId = '';
let activo = false;
let offset = 0;
let webhookSecret = '';
let webhookActivo = false;
let ultimoUpdateId = 0;

// ──── Funciones de datos (inyectadas desde server.js) ────
let listarPendientes = null;
let obtenerSolicitud = null;
let listarFacturas = null;
let resumenDueno = null;
let generarClave = null;
let validarClave = null;
let cambiarEstado = null;
let listarDispositivos = null;
let obtenerDispositivo = null;
let cambiarEstadoDispositivo = null;
let eliminarDispositivo = null;
let listarPlanes = null;
let crearPlan = null;
let actualizarPlan = null;
let eliminarPlan = null;
let obtenerNegocio = null;
let obtenerIngresos = null;
let listarMetodos = null;
let eliminarSolicitud = null;

export function telegramActivo() {
  return activo;
}

export async function iniciarTelegramBot(opciones = {}) {
  token = String(opciones.token || '').trim();
  ownerChatId = String(opciones.ownerChatId || '').trim();
  webhookSecret = String(opciones.webhookSecret || '').trim();
  webhookActivo = opciones.webhook === true;
  cambiarEstado = opciones.cambiarEstado;
  listarPendientes = opciones.listarPendientes;
  obtenerSolicitud = opciones.obtenerSolicitud;
  listarFacturas = opciones.listarFacturas;
  resumenDueno = opciones.resumenDueno;
  generarClave = opciones.generarClave;
  validarClave = opciones.validarClave;
  listarDispositivos = opciones.listarDispositivos;
  obtenerDispositivo = opciones.obtenerDispositivo;
  cambiarEstadoDispositivo = opciones.cambiarEstadoDispositivo;
  eliminarDispositivo = opciones.eliminarDispositivo;
  listarPlanes = opciones.listarPlanes;
  crearPlan = opciones.crearPlan;
  actualizarPlan = opciones.actualizarPlan;
  eliminarPlan = opciones.eliminarPlan;
  obtenerNegocio = opciones.obtenerNegocio;
  obtenerIngresos = opciones.obtenerIngresos;
  listarMetodos = opciones.listarMetodos;
  eliminarSolicitud = opciones.eliminarSolicitud;

  if (!token) {
    console.log('Telegram: TELEGRAM_BOT_TOKEN no configurado. Bot inactivo.');
    return false;
  }
  if (!ownerChatId) {
    console.warn('Telegram: TELEGRAM_OWNER_CHAT_ID no configurado. Bot inactivo por seguridad.');
    return false;
  }
  try {
    await comprobarTelegram();
    if (webhookActivo) {
      try {
        await registrarWebhook(opciones.webhookUrl);
      } catch (error) {
        // Si Telegram no puede validar el certificado del hosting, eliminar el
        // webhook evita que las actualizaciones queden bloqueadas y permite
        // administrar el sistema temporalmente por polling.
        console.warn('Telegram: webhook no disponible; activando polling de respaldo:', error.message);
        await peticion('deleteWebhook', { drop_pending_updates: false });
        webhookActivo = false;
      }
    }
    activo = true;
    console.log(`Telegram: bot iniciado (${webhookActivo ? 'webhook' : 'polling'}, propietario chat ${ownerChatId}).`);
    if (!webhookActivo) bucleActualizaciones();
    return true;
  } catch (err) {
    console.warn('Telegram: no se pudo validar la configuración:', err.message);
    return false;
  }
}

export function validarWebhookSecret(value) {
  return Boolean(webhookSecret) && String(value || '') === webhookSecret;
}

export async function procesarActualizacionWebhook(update) {
  if (!activo || !update || update.update_id <= ultimoUpdateId) return;
  ultimoUpdateId = update.update_id;
  await runWithRequestContext({ platform: true }, () => procesarUpdate(update));
}

async function registrarWebhook(url) {
  if (!url || !webhookSecret) throw new Error('PUBLIC_BASE_URL o secreto de webhook no configurado.');
  const respuesta = await peticion('setWebhook', {
    url,
    secret_token: webhookSecret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  }, 15000);
  if (!respuesta?.ok) throw new Error(respuesta?.description || 'Telegram rechazó el webhook.');
}

async function comprobarTelegram() {
  const respuesta = await peticion('getMe', {}, 10000);
  if (!respuesta?.ok || !respuesta.result?.id) {
    throw new Error(respuesta?.description || 'Token inválido o API no disponible.');
  }
  return true;
}

function apiUrl(metodo) {
  return `${API_BASE}/bot${token}/${metodo}`;
}

async function peticion(metodo, params = {}, timeoutMs = 40000) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(metodo), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controlador.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(temporizador);
  }
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function enviar(chatId, texto) {
  if (!activo || !texto) return;
  const trozos = texto.length <= LIMITE_TEXTO ? [texto] : dividirTexto(texto);
  for (const trozo of trozos) {
    try {
      await peticion('sendMessage', { chat_id: String(chatId), text: trozo, parse_mode: 'HTML' });
    } catch (err) {
      console.warn('Telegram: no se pudo enviar mensaje:', err.message);
    }
  }
}

function dividirTexto(texto) {
  const lineas = texto.split('\n');
  const trozos = [];
  let actual = '';
  for (const linea of lineas) {
    if (actual && (actual + '\n' + linea).length > LIMITE_TEXTO) {
      trozos.push(actual);
      actual = linea;
    } else {
      actual = actual ? actual + '\n' + linea : linea;
    }
  }
  if (actual) trozos.push(actual);
  return trozos;
}

function escaparHTML(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtFecha(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMonto(moneda, monto) {
  const n = Number(monto ?? 0);
  const txt = Number.isFinite(n) ? n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  return `${moneda || 'RD$'} ${txt}`;
}

function esPropietario(chatId) {
  if (!ownerChatId) {
    ownerChatId = chatId;
    console.log(`Telegram: propietario auto-registrado (chat ${chatId}).`);
    return true;
  }
  return chatId === ownerChatId;
}

async function bucleActualizaciones() {
  let espera = 1000;
  while (activo) {
    try {
      const datos = await peticion('getUpdates', { timeout: 25, offset, allowed_updates: ['message'] });
      if (!datos?.ok) {
        if (datos?.description?.includes('conflict')) {
          console.warn('Telegram: conflicto de polling (posible segunda instancia del bot). Deteniendo polling.');
          activo = false;
          break;
        }
        espera = Math.min(espera * 2, 30000);
        continue;
      }
      espera = 1000;
      for (const update of datos.result || []) {
        if (update.update_id >= offset) offset = update.update_id + 1;
        await runWithRequestContext({ platform: true }, () => procesarUpdate(update));
      }
    } catch (err) {
      console.warn(`Telegram: error en polling (reintentando en ${Math.round(espera / 1000)}s):`, err.message);
      await esperar(espera);
      espera = Math.min(espera * 2, 30000);
    }
  }
}

async function procesarUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);
  if (!esPropietario(chatId)) return;
  const texto = String(msg.text || '').trim();
  if (!texto.startsWith('/')) return;
  try {
    await manejarComando(chatId, texto);
  } catch (err) {
    console.warn('Telegram: error manejando comando:', err.message);
    await enviar(chatId, '⚠️ Ocurrió un error al procesar el comando. Inténtalo de nuevo.');
  }
}

// ──── Notificaciones (llamadas desde server.js) ────

export function notificarSolicitud(sol) {
  if (!activo || !ownerChatId) return;
  const fila = sol || {};
  const lineas = [
    '📬 <b>NUEVA SOLICITUD DE LICENCIA</b>',
    `🆔 <b>#${fila.id}</b>`,
    `👤 <b>Propietario:</b> ${escaparHTML(fila.propietario)}`,
    `🏪 <b>Negocio:</b> ${escaparHTML(fila.negocio)}`,
    `📞 <b>Teléfono:</b> ${escaparHTML(fila.telefono)}`,
    `📧 <b>Correo:</b> ${escaparHTML(fila.email)}`,
    fila.plan_nombre ? `📅 <b>Plan:</b> ${escaparHTML(fila.plan_nombre)}` : '',
    fila.provincia ? `📌 <b>Provincia:</b> ${escaparHTML(fila.provincia)}` : '',
    fila.notas ? `📝 <b>Notas:</b> ${escaparHTML(fila.notas)}` : '',
    `🕐 <b>Recibida:</b> ${fmtFecha(fila.creado_en)}`,
    '',
    '⚡ Comandos:',
    `/pagada ${fila.id}  — confirmar pago`,
    `/atender ${fila.id}  — atender`,
    `/rechazar ${fila.id}  — rechazar`,
    `/solicitud ${fila.id}  — ver detalle`,
  ].filter(Boolean).join('\n');
  enviar(ownerChatId, lineas);
}

export function notificarPago(sol) {
  if (!activo || !ownerChatId) return;
  const fila = sol || {};
  const lineas = [
    '💰 <b>PAGO CONFIRMADO</b>',
    `🆔 <b>#${fila.id}</b>`,
    `👤 <b>Cliente:</b> ${escaparHTML(fila.propietario)} — ${escaparHTML(fila.negocio)}`,
    `🧾 <b>Factura:</b> ${fila.numero_factura ? escaparHTML(fila.numero_factura) : '—'}`,
    `💵 <b>Monto:</b> ${fmtMonto(fila.moneda, fila.monto)}`,
    fila.metodo_pago ? `💳 <b>Método:</b> ${escaparHTML(fila.metodo_pago)}` : '',
    `🕐 ${fmtFecha(fila.pagada_en)}`,
  ].filter(Boolean).join('\n');
  enviar(ownerChatId, lineas);
}

export async function enviarClaveActivacion(sol, clave, pinInicial) {
  if (!activo || !ownerChatId) return false;
  const fila = sol || {};
  const lineas = [
    '🔑 <b>CLAVE DE ACTIVACIÓN GENERADA</b>',
    '───────────────────',
    `🆔 <b>Solicitud:</b> #${fila.id}`,
    `👤 <b>Propietario:</b> ${escaparHTML(fila.propietario)}`,
    `🏪 <b>Negocio:</b> ${escaparHTML(fila.negocio)}`,
    `📞 <b>Teléfono:</b> ${escaparHTML(fila.telefono)}`,
    `📧 <b>Correo:</b> ${escaparHTML(fila.email)}`,
    fila.plan_nombre ? `📅 <b>Plan:</b> ${escaparHTML(fila.plan_nombre)}` : '',
    '',
    `🔑 <b>Clave:</b> <code>${escaparHTML(clave || fila.clave_generada || '')}</code>`,
    pinInicial ? `📟 <b>PIN inicial del Administrador:</b> <code>${escaparHTML(String(pinInicial))}</code>` : '',
    '',
    '🎯 El cliente ingresa esta clave en <b>Activar dispositivo</b> para iniciar su restaurante.',
  ].filter(Boolean).join('\n');
  await enviar(ownerChatId, lineas);
  return true;
}

// ──── Comandos ────

const AYUDA = [
  '🤖 <b>ChloeRestaurant — Panel de Administración</b>',
  '',
  '<b>📊 Consultas</b>',
  '/resumen — estado general del sistema',
  '/reporte — reporte completo',
  '/ingresos [días] — facturación (ej: /ingresos 30)',
  '',
  '<b>📨 Solicitudes</b>',
  '/pendientes — solicitudes pendientes',
  '/solicitud &lt;id&gt; — detalle de una solicitud',
  '/pagada &lt;id&gt; — confirmar pago (genera factura)',
  '/atender &lt;id&gt; — marcar como atendida',
  '/rechazar &lt;id&gt; — rechazar solicitud',
  '/reabrir &lt;id&gt; — volver a pendiente',
  '/eliminar &lt;id&gt; — eliminar solicitud',
  '',
  '<b>💻 Dispositivos</b>',
  '/dispositivos — listar todos',
  '/dispositivo &lt;id&gt; — detalle',
  '/activar-dev &lt;id&gt; — activar dispositivo',
  '/desactivar-dev &lt;id&gt; — desactivar dispositivo',
  '',
  '<b>💰 Facturas</b>',
  '/facturas — facturas emitidas',
  '',
  '<b>📋 Planes</b>',
  '/planes — listar planes',
  '/plan crear &lt;nombre&gt; &lt;dur&gt; &lt;precio&gt; [moneda]',
  '/plan precio &lt;id&gt; &lt;nuevo precio&gt;',
  '/plan activar &lt;id&gt;',
  '/plan desactivar &lt;id&gt;',
  '/plan eliminar &lt;id&gt;',
  '',
  '<b>🔑 Claves</b>',
  '/clave &lt;duración&gt; — generar clave (ej: /clave 30D)',
  '/verificar &lt;clave&gt; — validar clave CHLOE-...',
  '',
  '<b>🏪 Negocio</b>',
  '/negocio — información del negocio',
  '/metodos — métodos de pago',
  '',
  'Solo el propietario puede usar este bot.',
].join('\n');

async function manejarComando(chatId, texto) {
  const partes = texto.split(/\s+/);
  // Telegram puede entregar los comandos de grupos como /comando@nombrebot.
  const cmd = (partes[0] || '').toLowerCase().split('@')[0];
  const arg = partes.slice(1).join(' ').trim();
  const args = partes.slice(1);

  switch (cmd) {
    // ── Base ──
    case '/start':
    case '/ayuda':
    case '/help':
      await enviar(chatId, AYUDA);
      break;
    // ── Consultas ──
    case '/resumen':
      await cmdResumen(chatId);
      break;
    case '/reporte':
      await cmdReporte(chatId);
      break;
    case '/ingresos':
      await cmdIngresos(chatId, arg);
      break;
    // ── Solicitudes ──
    case '/pendientes':
    case '/solicitudes':
      await cmdPendientes(chatId);
      break;
    case '/solicitud':
    case '/info':
      await cmdSolicitud(chatId, arg);
      break;
    case '/pagada':
    case '/activar':
      await cmdEstado(chatId, arg, 'Pagada');
      break;
    case '/atender':
      await cmdEstado(chatId, arg, 'Atendida');
      break;
    case '/rechazar':
      await cmdEstado(chatId, arg, 'Rechazada');
      break;
    case '/reabrir':
      await cmdEstado(chatId, arg, 'Pendiente');
      break;
    case '/eliminar':
      await cmdEliminar(chatId, arg);
      break;
    // ── Facturas ──
    case '/facturas':
      await cmdFacturas(chatId);
      break;
    // ── Dispositivos ──
    case '/dispositivos':
      await cmdDispositivos(chatId);
      break;
    case '/dispositivo':
      await cmdDispositivo(chatId, arg);
      break;
    case '/activar-dev':
      await cmdCambiarEstadoDev(chatId, arg, 'Activo');
      break;
    case '/desactivar-dev':
      await cmdCambiarEstadoDev(chatId, arg, 'Inactivo');
      break;
    // ── Planes ──
    case '/planes':
      await cmdPlanes(chatId);
      break;
    case '/plan':
      await cmdPlan(chatId, args);
      break;
    // ── Claves ──
    case '/clave':
      await cmdClave(chatId, arg);
      break;
    case '/verificar':
      await cmdVerificar(chatId, arg);
      break;
    // ── Negocio ──
    case '/negocio':
      await cmdNegocio(chatId);
      break;
    case '/metodos':
      await cmdMetodos(chatId);
      break;
    default:
      await enviar(chatId, '❓ Comando no reconocido. Usa /ayuda para ver las opciones.');
  }
}

// ══════════════════════════════════════════════════════════════════
// COMANDOS DE CONSULTA
// ══════════════════════════════════════════════════════════════════

async function cmdResumen(chatId) {
  if (!resumenDueno) return;
  const r = await resumenDueno();
  const lineas = [
    '📊 <b>Resumen del sistema</b>',
    '───────────────────',
    `💻 Dispositivos: <b>${r.dispositivos?.activos ?? 0}</b> activos / ${r.dispositivos?.total ?? 0} total`,
    `📨 Solicitudes: <b>${r.solicitudes?.pendientes ?? 0}</b> pendientes / ${r.solicitudes?.pagadas ?? 0} pagadas`,
    `🧾 Facturas: <b>${r.facturas?.total ?? 0}</b> (${fmtMonto(null, r.facturas?.monto_total)})`,
    `📋 Planes: <b>${r.planes?.total ?? 0}</b> activos`,
    `🏪 Negocio: ${escaparHTML(r.negocio?.nombre_comercial || 'No configurado')}`,
    `📜 Licencia: ${r.negocio?.duracion_meses === -1 ? 'Vitalicia' : `${r.negocio?.duracion_meses || 0} meses`}`,
  ].join('\n');
  await enviar(chatId, lineas);
}

async function cmdReporte(chatId) {
  if (!resumenDueno || !listarPendientes || !listarFacturas || !listarDispositivos) return;
  const [r, pendientes, facturas, dispositivos] = await Promise.all([
    resumenDueno(),
    listarPendientes(),
    listarFacturas(),
    listarDispositivos(),
  ]);
  const activos = (dispositivos || []).filter(d => d.estado === 'Activo').length;
  const pendientesDev = (dispositivos || []).filter(d => d.estado === 'Pendiente').length;
  const inactivosDev = (dispositivos || []).filter(d => d.estado === 'Inactivo').length;
  const lineas = [
    '📈 <b>REPORTE COMPLETO</b>',
    '═══════════════════════',
    '',
    '💻 <b>DISPOSITIVOS</b>',
    `   Activos: <b>${activos}</b> · Pendientes: ${pendientesDev} · Inactivos: ${inactivosDev}`,
    '',
    '📨 <b>SOLICITUDES</b>',
    `   Pendientes: <b>${pendientes?.length ?? 0}</b>`,
    `   Pagadas: <b>${r.solicitudes?.pagadas ?? 0}</b>`,
    '',
    '🧾 <b>FACTURAS</b>',
    `   Total: <b>${facturas?.length ?? 0}</b> · Monto total: ${fmtMonto(null, r.facturas?.monto_total)}`,
    '',
    '📋 <b>PLANES</b>',
    `   Activos: <b>${r.planes?.total ?? 0}</b>`,
    '',
    '═══════════════════════',
    '🕐 Reporte generado: ' + fmtFecha(new Date().toISOString()),
  ].join('\n');
  await enviar(chatId, lineas);
}

async function cmdIngresos(chatId, arg) {
  if (!obtenerIngresos) return;
  const dias = arg ? Number(arg) : 30;
  if (!Number.isFinite(dias) || dias <= 0 || dias > 365) {
    await enviar(chatId, 'ℹ️ Uso: /ingresos [días] — ej: /ingresos 30, /ingresos 7');
    return;
  }
  const datos = await obtenerIngresos(dias);
  const lineas = [
    `💰 <b>Ingresos últimos ${dias} días</b>`,
    '───────────────────',
    `   Facturas: <b>${datos.total}</b>`,
    `   Monto total: <b>${fmtMonto(null, datos.monto)}</b>`,
    `   Promedio por factura: ${fmtMonto(null, datos.total > 0 ? Number(datos.monto) / datos.total : 0)}`,
  ].join('\n');
  await enviar(chatId, lineas);
}

// ══════════════════════════════════════════════════════════════════
// COMANDOS DE SOLICITUDES
// ══════════════════════════════════════════════════════════════════

async function cmdPendientes(chatId) {
  if (!listarPendientes) return;
  const filas = (await listarPendientes()) || [];
  if (!filas.length) {
    await enviar(chatId, '✅ No hay solicitudes pendientes en este momento.');
    return;
  }
  const lineas = [`📨 <b>Solicitudes pendientes (${filas.length})</b>`, ''];
  for (const f of filas) {
    lineas.push(
      `<b>#${f.id}</b> · ${escaparHTML(f.plan_nombre || 'Sin plan')}`,
      `   ${escaparHTML(f.propietario)} — ${escaparHTML(f.negocio)}`,
      `   📞 ${escaparHTML(f.telefono)} · 🕐 ${fmtFecha(f.creado_en)}`,
      `   /solicitud ${f.id} · /pagada ${f.id} · /rechazar ${f.id}`,
      ''
    );
  }
  await enviar(chatId, lineas.join('\n'));
}

async function cmdSolicitud(chatId, arg) {
  if (!obtenerSolicitud) return;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    await enviar(chatId, 'ℹ️ Uso: /solicitud &lt;id&gt;');
    return;
  }
  const f = await obtenerSolicitud(id);
  if (!f) {
    await enviar(chatId, `❌ No existe la solicitud #${id}.`);
    return;
  }
  const lineas = [
    `📋 <b>Solicitud #${f.id}</b>`,
    '───────────────────',
    `👤 <b>Propietario:</b> ${escaparHTML(f.propietario)}`,
    `🏪 <b>Negocio:</b> ${escaparHTML(f.negocio)}`,
    `📞 <b>Teléfono:</b> ${escaparHTML(f.telefono)}`,
    `📧 <b>Correo:</b> ${escaparHTML(f.email)}`,
    f.provincia ? `📌 <b>Provincia:</b> ${escaparHTML(f.provincia)}` : '',
    f.plan_nombre ? `📅 <b>Plan:</b> ${escaparHTML(f.plan_nombre)}` : '',
    f.notas ? `📝 <b>Notas:</b> ${escaparHTML(f.notas)}` : '',
    `📌 <b>Estado:</b> ${escaparHTML(f.estado || '—')}`,
    f.numero_factura ? `🧾 <b>Factura:</b> ${escaparHTML(f.numero_factura)}` : '',
    f.monto != null ? `💵 <b>Monto:</b> ${fmtMonto(f.moneda, f.monto)}` : '',
    f.metodo_pago ? `💳 <b>Método:</b> ${escaparHTML(f.metodo_pago)}` : '',
    `🕐 <b>Creada:</b> ${fmtFecha(f.creado_en)}`,
    f.pagada_en ? `✅ <b>Pagada:</b> ${fmtFecha(f.pagada_en)}` : '',
  ].filter(Boolean).join('\n');
  await enviar(chatId, lineas);
}

async function cmdEstado(chatId, arg, estado) {
  if (!cambiarEstado) return;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    const cmd = estado === 'Pendiente' ? 'reabrir' : estado === 'Pagada' ? 'pagada' : estado.toLowerCase();
    await enviar(chatId, `ℹ️ Uso: /${cmd} &lt;id&gt;`);
    return;
  }
  const resultado = await cambiarEstado(id, estado);
  if (!resultado || resultado.error) {
    await enviar(chatId, `❌ No se pudo marcar la solicitud #${id}: ${escaparHTML(resultado?.error || 'error desconocido')}`);
    return;
  }
  const sol = resultado.solicitud || {};
  const lineas = [
    estado === 'Pagada' ? '✅ <b>Solicitud marcada como PAGADA</b>' : `✅ <b>Solicitud marcada como ${escaparHTML(estado).toUpperCase()}</b>`,
    `🆔 <b>#${id}</b>`,
    sol.numero_factura ? `🧾 <b>Factura:</b> ${escaparHTML(sol.numero_factura)}` : '',
    '',
    '💡 Para entregar la clave al cliente: /clave &lt;duración&gt; (ej: /clave 30D).',
  ].filter(Boolean).join('\n');
  await enviar(chatId, lineas);
}

async function cmdEliminar(chatId, arg) {
  if (!eliminarSolicitud) return;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    await enviar(chatId, 'ℹ️ Uso: /eliminar &lt;id&gt; — Elimina una solicitud de prueba.');
    return;
  }
  const resultado = await eliminarSolicitud(id);
  if (!resultado || resultado.error) {
    await enviar(chatId, `❌ No se pudo eliminar la solicitud #${id}: ${escaparHTML(resultado?.error || 'error desconocido')}`);
    return;
  }
  await enviar(chatId, `🗑️ Solicitud #${id} eliminada correctamente.`);
}

// ══════════════════════════════════════════════════════════════════
// COMANDOS DE DISPOSITIVOS
// ══════════════════════════════════════════════════════════════════

async function cmdDispositivos(chatId) {
  if (!listarDispositivos) return;
  const filas = (await listarDispositivos()) || [];
  if (!filas.length) {
    await enviar(chatId, '💻 No hay dispositivos registrados.');
    return;
  }
  const activos = filas.filter(d => d.estado === 'Activo').length;
  const pendientes = filas.filter(d => d.estado === 'Pendiente').length;
  const inactivos = filas.filter(d => d.estado === 'Inactivo').length;
  const lineas = [
    `💻 <b>Dispositivos (${filas.length})</b>`,
    `   Activos: <b>${activos}</b> · Pendientes: ${pendientes} · Inactivos: ${inactivos}`,
    '',
  ];
  for (const d of filas.slice(0, 15)) {
    const icono = d.estado === 'Activo' ? '🟢' : d.estado === 'Pendiente' ? '🟡' : '🔴';
    lineas.push(
      `${icono} <b>#${d.id}</b> ${escaparHTML(d.nombre || d.device_id?.slice(0, 8) || 'Sin nombre')} · ${d.estado}`,
      `   📜 ${escaparHTML(d.licencia_duracion || '—')} · 🕐 ${fmtFecha(d.activado_en || d.creado_en)}`,
      `   /dispositivo ${d.id}`,
      ''
    );
  }
  if (filas.length > 15) lineas.push(`... y ${filas.length - 15} más`);
  await enviar(chatId, lineas.join('\n'));
}

async function cmdDispositivo(chatId, arg) {
  if (!obtenerDispositivo) return;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    await enviar(chatId, 'ℹ️ Uso: /dispositivo &lt;id&gt;');
    return;
  }
  const d = await obtenerDispositivo(id);
  if (!d) {
    await enviar(chatId, `❌ No existe el dispositivo #${id}.`);
    return;
  }
  const restante = d.licencia_vencimiento
    ? Math.ceil((new Date(d.licencia_vencimiento).getTime() - Date.now()) / 86400000)
    : null;
  const lineas = [
    `💻 <b>Dispositivo #${d.id}</b>`,
    '───────────────────',
    `📌 <b>Estado:</b> ${d.estado}`,
    `📛 <b>Nombre:</b> ${escaparHTML(d.nombre || 'Sin nombre')}`,
    `🔑 <b>ID:</b> <code>${escaparHTML(d.device_id || '—')}</code>`,
    `🌐 <b>IP:</b> ${escaparHTML(d.ip || '—')}`,
    `🖥️ <b>Navegador:</b> ${escaparHTML(d.navegador || '—')}`,
    `📜 <b>Licencia:</b> ${d.licencia_duracion === 'L' ? 'Vitalicia' : escaparHTML(d.licencia_duracion || '—')}`,
    d.licencia_vencimiento ? `📅 <b>Vence:</b> ${fmtFecha(d.licencia_vencimiento)}${restante != null ? ` (${restante}d)` : ''}` : '',
    `🕐 <b>Activado:</b> ${fmtFecha(d.activado_en)}`,
    `⏰ <b>Último acceso:</b> ${fmtFecha(d.ultimo_acceso)}`,
    `❌ <b>Intentos fallidos:</b> ${d.intentos_fallidos || 0}`,
  ].filter(Boolean).join('\n');
  const acciones = d.estado === 'Activo'
    ? `\n💡 /desactivar-dev ${d.id} — desactivar`
    : `\n💡 /activar-dev ${d.id} — activar`;
  await enviar(chatId, lineas + acciones);
}

async function cmdCambiarEstadoDev(chatId, arg, estado) {
  if (!cambiarEstadoDispositivo) return;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    await enviar(chatId, `ℹ️ Uso: /${estado === 'Activo' ? 'activar-dev' : 'desactivar-dev'} &lt;id&gt;`);
    return;
  }
  const resultado = await cambiarEstadoDispositivo(id, estado);
  if (!resultado || resultado.error) {
    await enviar(chatId, `❌ No se pudo actualizar el dispositivo #${id}: ${escaparHTML(resultado?.error || 'error desconocido')}`);
    return;
  }
  await enviar(chatId, `✅ Dispositivo #${id} marcado como ${estado}.`);
}

// ══════════════════════════════════════════════════════════════════
// COMANDOS DE PLANES
// ══════════════════════════════════════════════════════════════════

async function cmdPlanes(chatId) {
  if (!listarPlanes) return;
  const filas = (await listarPlanes()) || [];
  if (!filas.length) {
    await enviar(chatId, '📋 No hay planes de licencia configurados.');
    return;
  }
  const lineas = [`📋 <b>Planes de licencia (${filas.length})</b>`, ''];
  for (const p of filas) {
    const icono = p.activo ? '🟢' : '🔴';
    const dest = p.destacado ? ' ⭐' : '';
    lineas.push(
      `${icono} <b>#${p.id}</b> ${escaparHTML(p.nombre)}${dest}`,
      `   ${escaparHTML(p.duracion_codigo)} · ${fmtMonto(p.moneda, p.precio)}`,
      ''
    );
  }
  await enviar(chatId, lineas.join('\n'));
}

async function cmdPlan(chatId, args) {
  if (!listarPlanes || !crearPlan || !actualizarPlan || !eliminarPlan) return;
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'crear') {
    const [, nombre, duracion, precio, moneda] = args;
    if (!nombre || !duracion || !precio) {
      await enviar(chatId, 'ℹ️ Uso: /plan crear &lt;nombre&gt; &lt;duración&gt; &lt;precio&gt; [moneda]\nEj: /plan crear Anual 12M 249 RD$');
      return;
    }
    const resultado = await crearPlan({ nombre, duracion_codigo: duracion.toUpperCase(), precio: Number(precio), moneda: moneda || 'RD$' });
    if (resultado?.error) {
      await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
      return;
    }
    await enviar(chatId, `✅ Plan "${escaparHTML(nombre)}" creado (${escaparHTML(duracion)} ${fmtMonto(moneda || 'RD$', precio)}).`);
    return;
  }

  if (sub === 'precio') {
    const [, idStr, precioStr] = args;
    const id = Number(idStr);
    const precio = Number(precioStr);
    if (!Number.isInteger(id) || !Number.isFinite(precio) || precio < 0) {
      await enviar(chatId, 'ℹ️ Uso: /plan precio &lt;id&gt; &lt;nuevo precio&gt;');
      return;
    }
    const resultado = await actualizarPlan(id, { precio });
    if (resultado?.error) {
      await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
      return;
    }
    await enviar(chatId, `✅ Plan #${id} actualizado a ${fmtMonto(null, precio)}.`);
    return;
  }

  if (sub === 'activar' || sub === 'desactivar') {
    const id = Number(args[1]);
    if (!Number.isInteger(id) || id <= 0) {
      await enviar(chatId, `ℹ️ Uso: /plan ${sub} &lt;id&gt;`);
      return;
    }
    const resultado = await actualizarPlan(id, { activo: sub === 'activar' });
    if (resultado?.error) {
      await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
      return;
    }
    await enviar(chatId, `✅ Plan #${id} ${sub === 'activar' ? 'activado' : 'desactivado'}.`);
    return;
  }

  if (sub === 'eliminar') {
    const id = Number(args[1]);
    if (!Number.isInteger(id) || id <= 0) {
      await enviar(chatId, 'ℹ️ Uso: /plan eliminar &lt;id&gt;');
      return;
    }
    const resultado = await eliminarPlan(id);
    if (resultado?.error) {
      await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
      return;
    }
    await enviar(chatId, `🗑️ Plan #${id} eliminado.`);
    return;
  }

  await enviar(chatId, [
    '📋 <b>Gestión de planes</b>',
    '',
    '/planes — listar todos',
    '/plan crear &lt;nombre&gt; &lt;dur&gt; &lt;precio&gt; [moneda]',
    '/plan precio &lt;id&gt; &lt;nuevo precio&gt;',
    '/plan activar &lt;id&gt;',
    '/plan desactivar &lt;id&gt;',
    '/plan eliminar &lt;id&gt;',
  ].join('\n'));
}

// ══════════════════════════════════════════════════════════════════
// COMANDOS DE CLAVES
// ══════════════════════════════════════════════════════════════════

async function cmdClave(chatId, arg) {
  if (!generarClave) return;
  const dur = arg.toUpperCase();
  if (!dur) {
    await enviar(chatId, 'ℹ️ Uso: /clave &lt;duración&gt;\nDuraciones: 7D, 15D, 30D, 60D, 90D, 6M, 12M, 24M, L (vitalicia)\nEj: /clave 30D');
    return;
  }
  const resultado = await generarClave(dur);
  if (resultado.error) {
    await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
    return;
  }
  await enviar(chatId, [
    '🔑 <b>Clave generada</b>',
    `Duración: <b>${escaparHTML(resultado.duracion)}</b>${resultado.vitalicia ? ' (Vitalicia)' : ''}`,
    `<code>${escaparHTML(resultado.clave)}</code>`,
    resultado.pinInicial ? `PIN inicial del Administrador: <code>${escaparHTML(resultado.pinInicial)}</code>` : '',
    '',
    'Entrégala al cliente para activar en su dispositivo.',
  ].join('\n'));
}

async function cmdVerificar(chatId, arg) {
  if (!validarClave) return;
  if (!arg) {
    await enviar(chatId, 'ℹ️ Uso: /verificar CHLOE-30D-XXXXX-XXXXX-XXXXX-XXXXX');
    return;
  }
  const resultado = validarClave(arg);
  if (resultado.error) {
    await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
    return;
  }
  await enviar(chatId, [
    '✅ <b>Clave VÁLIDA</b>',
    `Duración: <b>${escaparHTML(resultado.duracion || 'Vitalicia')}</b>`,
  ].join('\n'));
}

// ══════════════════════════════════════════════════════════════════
// COMANDOS DE NEGOCIO
// ══════════════════════════════════════════════════════════════════

async function cmdNegocio(chatId) {
  if (!obtenerNegocio) return;
  const n = await obtenerNegocio();
  if (!n) {
    await enviar(chatId, '❌ No se pudo obtener la información del negocio.');
    return;
  }
  const lineas = [
    '🏪 <b>Información del negocio</b>',
    '───────────────────',
    `📛 <b>Nombre:</b> ${escaparHTML(n.nombre_comercial || 'No configurado')}`,
    `📋 <b>RNC:</b> ${escaparHTML(n.rnc || 'No configurado')}`,
    `📜 <b>Licencia:</b> ${n.duracion_meses === -1 ? 'Vitalicia' : `${n.duracion_meses || 0} meses`}`,
    `🔒 <b>Bloqueado:</b> ${n.licencia_bloqueada ? 'Sí' : 'No'}`,
    n.fecha_instalacion ? `🕐 <b>Instalado:</b> ${fmtFecha(n.fecha_instalacion)}` : '',
  ].filter(Boolean).join('\n');
  await enviar(chatId, lineas);
}

async function cmdMetodos(chatId) {
  if (!listarMetodos) return;
  const filas = (await listarMetodos()) || [];
  if (!filas.length) {
    await enviar(chatId, '💳 No hay métodos de pago configurados.');
    return;
  }
  const lineas = [`💳 <b>Métodos de pago (${filas.length})</b>`, ''];
  for (const m of filas) {
    const icono = m.activo ? '🟢' : '🔴';
    lineas.push(
      `${icono} <b>${escaparHTML(m.nombre)}</b> · ${escaparHTML(m.tipo)}`,
      m.dato1 ? `   ${escaparHTML(m.dato1)}` : '',
      ''
    );
  }
  await enviar(chatId, lineas.join('\n'));
}
