/**
 * Preparación del negocio de demostración por API (no se graba): personal, mesas, catálogo e historial del día.
 * Solo para el entorno de prueba local.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BASE } from './lib.mjs';

/** CSV del catálogo adaptado (datos del cliente: no se versiona); se puede indicar con CATALOGO_CSV. */
export const CATALOGO = process.env.CATALOGO_CSV || path.join(os.homedir(), 'Desktop', 'resta_articulo_adaptado.csv');
export const DEVICE = 'prueba-web-0001';
let dispositivoActual = DEVICE;
/** Las operaciones automáticas usan otro equipo para no cerrar la sesión que se ve en pantalla (una sesión por equipo). */
export const usarDispositivo = (id) => { dispositivoActual = id; };

export const PERSONAL = [
  { nombre: 'Rosa Peña', rol: 'Cajero', pin: '619273' },
  { nombre: 'Juan Pérez', rol: 'Camarero', pin: '384726' },
  { nombre: 'María Santana', rol: 'Camarero', pin: '529184' },
  { nombre: 'Carlos Rodríguez', rol: 'Camarero', pin: '746315' },
  { nombre: 'Ana Lantigua', rol: 'Camarero', pin: '853962' },
  { nombre: 'Luis Almonte', rol: 'Capitán de Camareros', pin: '267491' },
  { nombre: 'Pedro Díaz', rol: 'Cocina', pin: '491837' },
  { nombre: 'Miguel Ureña', rol: 'Bar', pin: '372958' },
];

export async function api(metodo, ruta, { token, body, form } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'x-device-id': dispositivoActual, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const t = await r.text();
  let cuerpo = t;
  try { cuerpo = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, body: cuerpo };
}

export async function sesion(pin) {
  const r = await api('POST', '/api/login/camarero', { body: { pin, deviceId: dispositivoActual } });
  if (!r.body?.token) throw new Error(`login ${pin}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

export async function crearPersonal(token, lista = PERSONAL) {
  for (const p of lista) {
    const r = await api('POST', '/api/usuarios', { token, body: p });
    console.log(`  personal ${p.nombre} (${p.rol}): ${r.status}${r.status >= 300 ? ' ' + JSON.stringify(r.body) : ''}`);
  }
}

export async function generarMesas(token, cantidad) {
  const r = await api('POST', '/api/mesas/generar', { token, body: { cantidad } });
  console.log(`  mesas: ${r.status} ${JSON.stringify(r.body)}`);
}

export async function importarCatalogo(token, ruta = CATALOGO) {
  const fd = new FormData();
  fd.append('archivo_csv', new Blob([fs.readFileSync(ruta)], { type: 'text/csv' }), 'catalogo.csv');
  const r = await api('POST', '/api/productos/importar', { token, form: fd });
  console.log(`  catálogo: ${r.status} insertados=${r.body.insertados} categorías=${r.body.categoriasCreadas?.length}`);
  return r;
}

// ---------------------------------------------------------------------------------------------- operación por API
let _productos = null;
export async function producto(token, nombre) {
  if (!_productos) _productos = (await api('GET', '/api/productos', { token })).body;
  const prod = _productos.find((x) => x.nombre === nombre);
  if (!prod) throw new Error(`producto no encontrado: ${nombre}`);
  return prod;
}

/** Un camarero abre la mesa y envía su comanda (como lo hace la pantalla del camarero). */
export async function pedir(pinCamarero, nombreMesa, platos) {
  const token = await sesion(pinCamarero);
  const mesas = (await api('GET', '/api/mesas', { token })).body;
  const mesa = mesas.find((m) => m.nombre_numero === nombreMesa);
  if (!mesa) throw new Error(`mesa no encontrada: ${nombreMesa}`);
  const comanda = [];
  for (const [nombre, cantidad = 1, extra = {}] of platos) comanda.push({ id: (await producto(token, nombre)).id, cantidad, ...extra });
  const r = await api('POST', `/api/mesas/${mesa.id}/pedidos`, { token, body: { comanda, items: comanda } });
  if (r.status >= 300) throw new Error(`pedido ${nombreMesa}: ${r.status} ${JSON.stringify(r.body)}`);
  return mesa;
}

/** Historial de una noche de servicio para que los reportes tengan datos reales (todo pasa por la misma API). */
export async function historialDeLaNoche(cantidad = 14) {
  const cajera = await sesion('000000'); // el administrador también cobra; así no se cierra la sesión que está en pantalla
  const camareros = ['384726', '529184', '746315', '853962'];
  const mesas = (await api('GET', '/api/mesas', { token: cajera })).body.filter((m) => m.estado === 'Disponible');
  const combos = [
    [['CEVICHE DE PESCADO'], ['CHILLO POR LBS'], ['TOSTONES'], ['PRESIDENTE GDE', 3]],
    [['SOPA DE MARISCO'], ['PAELLA MARINERA 2 P'], ['JUGOS NATURALES', 2], ['FLAN']],
    [['ALASKA ROLL 12 UND'], ['NARUTO ROLL 12 UND'], ['ATLANTIC ROLL 12 UND'], ['CORONA', 3]],
    [['PICADERA MAR Y TIERRA'], ['MOJITO (COCO, LIMON, CHINOLA, CEREZA)', 2], ['PRESIDENTE PQ', 2]],
    [['MOFONGO DE CAMARONES', 2], ['ENSALADA CESAR'], ['PIÑA COLADA CON ALCOHOL', 2]],
    [['LANGOSTA (AL AJILLO, CREMA, VINAGRETA)'], ['ARROZ BLANCO'], ['VINO AUREO CHARDONAY']],
    [['PASTA ALFREDO DE CAMARONES', 2], ['COCA COLA', 2], ['BROWNIE RUSSA']],
    [['PECHUGA DE POLLO A LA CREMA'], ['ALITAS DE POLLO'], ['MARGARITA', 2], ['SPRITE']],
    [['HOT DOG KING CRAB', 2], ['PAPAS FRITAS', 2], ['MILLER', 2]],
    [['SALPICON DE MARISCOS'], ['PULPO AL AJILLO'], ['BRUGAL EXTRAVIEJO PQ']],
  ];
  const metodos = ['Efectivo', 'Tarjeta', 'Efectivo', 'Transferencia', 'Efectivo', 'Tarjeta'];
  let hechos = 0;
  for (let i = 0; i < cantidad && i < mesas.length; i += 1) {
    const mesa = mesas[i];
    const plato = combos[i % combos.length];
    const tokenC = await sesion(camareros[i % camareros.length]);
    const comanda = [];
    for (const [nombre, cant = 1] of plato) comanda.push({ id: (await producto(tokenC, nombre)).id, cantidad: cant });
    const p = await api('POST', `/api/mesas/${mesa.id}/pedidos`, { token: tokenC, body: { comanda, items: comanda } });
    if (p.status >= 300) { console.log('  historial: pedido', p.status, JSON.stringify(p.body)); continue; }
    const c = await api('POST', `/api/mesas/${mesa.id}/cobrar`, { token: cajera, body: { metodo_pago: metodos[i % metodos.length], tipo_comprobante: 'B02', ...(metodos[i % metodos.length] === 'Tarjeta' ? { tarjeta_ultimos_4: String(1000 + i * 37).slice(0, 4), tarjeta_marca: i % 2 ? 'Mastercard' : 'Visa' } : {}) } });
    if (c.status >= 300) { console.log('  historial: cobro', c.status, JSON.stringify(c.body)); continue; }
    hechos += 1;
  }
  console.log(`  historial de la noche: ${hechos} cuentas cobradas`);
  return hechos;
}
