// Bot de Telegram para notificaciones y gestión de solicitudes de licencia.
// Configuración (variables de entorno):
//   TELEGRAM_BOT_TOKEN      → token del bot creado en @BotFather
//   TELEGRAM_OWNER_CHAT_ID  → ID del chat de Telegram del propietario
// Si no se define TELEGRAM_OWNER_CHAT_ID, el primer chat que le escriba al bot
// queda registrado como propietario.

const API_BASE = 'https://api.telegram.org';
const LIMITE_TEXTO = 4000;

let token = '';
let ownerChatId = '';
let activo = false;
let offset = 0;

let aplicarEstado = null;
let listarPendientes = null;
let obtenerSolicitud = null;
let listarFacturas = null;
let resumenDueno = null;
let generarClave = null;
let validarClave = null;

export function telegramActivo() {
  return activo;
}

export function iniciarTelegramBot(opciones = {}) {
  token = String(opciones.token || '').trim();
  ownerChatId = String(opciones.ownerChatId || '').trim();
  aplicarEstado = opciones.aplicarEstado;
  listarPendientes = opciones.listarPendientes;
  obtenerSolicitud = opciones.obtenerSolicitud;
  listarFacturas = opciones.listarFacturas;
  resumenDueno = opciones.resumenDueno;
  generarClave = opciones.generarClave;
  validarClave = opciones.validarClave;

  if (!token) {
    console.log('Telegram: TELEGRAM_BOT_TOKEN no configurado. Bot inactivo.');
    return;
  }
  activo = true;
  console.log(`Telegram: bot iniciado${ownerChatId ? ` (propietario chat ${ownerChatId})` : ' (esperando al propietario).'}`);
  bucleActualizaciones();
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
          break;
        }
        espera = Math.min(espera * 2, 30000);
        continue;
      }
      espera = 1000;
      for (const update of datos.result || []) {
        if (update.update_id >= offset) offset = update.update_id + 1;
        await procesarUpdate(update);
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

export function notificarTexto(texto) {
  if (!activo || !ownerChatId) return;
  enviar(ownerChatId, texto);
}

// ──── Comandos ────

const AYUDA = [
  '🤖 <b>ChloeRestaurant — Bot del Propietario</b>',
  '',
  '<b>Consultas</b>',
  '/resumen — estado general del sistema',
  '/pendientes — lista de solicitudes pendientes',
  '/solicitud &lt;id&gt; — detalle de una solicitud',
  '/facturas — facturas emitidas',
  '',
  '<b>Acciones sobre solicitudes</b>',
  '/pagada &lt;id&gt; — confirmar pago (genera factura)',
  '/atender &lt;id&gt; — marcar como atendida',
  '/rechazar &lt;id&gt; — rechazar la solicitud',
  '/reabrir &lt;id&gt; — volver a pendiente',
  '',
  '<b>Claves de licencia</b>',
  '/clave &lt;duración&gt; — genera una clave (ej: /clave 30D, /clave 12M, /clave L)',
  '/verificar &lt;clave&gt; — valida una clave CHLOE-...',
  '',
  'Solo el propietario puede usar este bot.',
].join('\n');

async function manejarComando(chatId, texto) {
  const partes = texto.split(/\s+/);
  const comando = (partes[0] || '').toLowerCase();
  const arg = partes.slice(1).join(' ').trim();

  switch (comando) {
    case '/start':
    case '/ayuda':
    case '/help':
      await enviar(chatId, AYUDA);
      break;
    case '/resumen':
      await comandoResumen(chatId);
      break;
    case '/pendientes':
    case '/solicitudes':
      await comandoPendientes(chatId);
      break;
    case '/solicitud':
    case '/info':
      await comandoSolicitud(chatId, arg);
      break;
    case '/facturas':
      await comandoFacturas(chatId);
      break;
    case '/pagada':
    case '/activar':
      await comandoEstado(chatId, arg, 'Pagada');
      break;
    case '/atender':
      await comandoEstado(chatId, arg, 'Atendida');
      break;
    case '/rechazar':
      await comandoEstado(chatId, arg, 'Rechazada');
      break;
    case '/reabrir':
      await comandoEstado(chatId, arg, 'Pendiente');
      break;
    case '/clave':
      await comandoClave(chatId, arg);
      break;
    case '/verificar':
      await comandoVerificar(chatId, arg);
      break;
    default:
      await enviar(chatId, '❓ Comando no reconocido. Usa /ayuda para ver las opciones.');
  }
}

async function comandoResumen(chatId) {
  if (!resumenDueno) return;
  const r = await resumenDueno();
  const lineas = [
    '📊 <b>Resumen del sistema</b>',
    `💻 Dispositivos activos: <b>${r.dispositivos?.activos ?? 0}</b> / ${r.dispositivos?.total ?? 0}`,
    `📨 Solicitudes pendientes: <b>${r.solicitudes?.pendientes ?? 0}</b>`,
    `✅ Solicitudes pagadas: <b>${r.solicitudes?.pagadas ?? 0}</b>`,
    `🧾 Facturas emitidas: <b>${r.facturas?.total ?? 0}</b> (${fmtMonto(null, r.facturas?.monto_total)})`,
    `🗝️ Clave maestra: <code>${escaparHTML(r.claveMaestra || '—')}</code>`,
  ].join('\n');
  await enviar(chatId, lineas);
}

async function comandoPendientes(chatId) {
  if (!listarPendientes) return;
  const filas = (await listarPendientes()) || [];
  if (!filas.length) {
    await enviar(chatId, '✅ No hay solicitudes pendientes en este momento.');
    return;
  }
  const lineas = ['📨 <b>Solicitudes pendientes (${filas.length})</b>', ''];
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

async function comandoSolicitud(chatId, arg) {
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

async function comandoFacturas(chatId) {
  if (!listarFacturas) return;
  const filas = (await listarFacturas()) || [];
  if (!filas.length) {
    await enviar(chatId, '🧾 Aún no hay facturas emitidas.');
    return;
  }
  const lineas = [`🧾 <b>Facturas emitidas (${filas.length})</b>`, ''];
  for (const f of filas) {
    lineas.push(
      `<b>${escaparHTML(f.numero_factura)}</b> · ${fmtMonto(f.moneda, f.monto)}`,
      `   ${escaparHTML(f.propietario)} — ${escaparHTML(f.negocio)} · ${escaparHTML(f.plan_nombre || 'Sin plan')}`,
      `   🕐 ${fmtFecha(f.pagada_en || f.creado_en)}`,
      ''
    );
  }
  await enviar(chatId, lineas.join('\n'));
}

async function comandoEstado(chatId, arg, estado) {
  if (!aplicarEstado) return;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    await enviar(chatId, `ℹ️ Uso: /${estado === 'Pendiente' ? 'reabrir' : comandoParaEstado(estado)} &lt;id&gt;`);
    return;
  }
  const resultado = await aplicarEstado(id, estado);
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

function comandoParaEstado(estado) {
  if (estado === 'Pagada') return 'pagada';
  if (estado === 'Atendida') return 'atender';
  if (estado === 'Rechazada') return 'rechazar';
  return 'reabrir';
}

async function comandoClave(chatId, arg) {
  if (!generarClave) return;
  const dur = arg.toUpperCase();
  if (!dur) {
    await enviar(chatId, 'ℹ️ Uso: /clave &lt;duración&gt; — ej: /clave 30D, /clave 90D, /clave 12M, /clave L');
    return;
  }
  const resultado = generarClave(dur);
  if (resultado.error) {
    await enviar(chatId, `❌ ${escaparHTML(resultado.error)}`);
    return;
  }
  await enviar(chatId, [
    '🔑 <b>Clave generada</b>',
    `Duración: <b>${escaparHTML(resultado.duracion)}</b>${resultado.vitalicia ? ' (Vitalicia)' : ''}`,
    `<code>${escaparHTML(resultado.clave)}</code>`,
    '',
    'Entrégala al cliente para activar en su dispositivo.',
  ].join('\n'));
}

async function comandoVerificar(chatId, arg) {
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
