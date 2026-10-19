/**
 * Guion del video comercial: opera ChloeRestaurant de punta a punta (como administrador, camarero, cocina, bar y caja)
 * mientras se graba la pantalla. Si un paso falla, deja una captura y el estado de la pantalla para depurar.
 *
 *   node guion.mjs [--hasta=N] [--rapido]        (N = última escena que se graba)
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { abrir, BASE, pausa, pin, clic, escribir, leyenda, ocultarLeyenda, fundido, mover, grabar, carpeta } from './lib.mjs';
import { htmlIntro, htmlCierre } from './tarjetas.mjs';
import { sesion, crearPersonal, api, CATALOGO, pedir, historialDeLaNoche } from './prelude.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split('=')[1];
const HASTA = Number(arg('hasta', 99));
const DESDE = Number(arg('desde', 1));
const RAPIDO = process.argv.includes('--rapido');
const p = (ms) => pausa(RAPIDO ? Math.min(ms, 350) : ms);
const SALIDA = carpeta('salida');
const LOGO = path.resolve(SALIDA, '..', '..', 'branding', 'logos', 'isotipo-dorado.png');

const PINES = { admin: '000000', cajera: '619273', juan: '384726', maria: '529184', cocina: '491837', bar: '372958' };

async function esperarUrl(page, re, ms = 15000) {
  await page.waitForURL(re, { timeout: ms });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ir(page, ruta) {
  await page.goto(BASE + ruta);
  await page.waitForLoadState('networkidle').catch(() => {});
}

/** Desplaza suavemente la lista principal (sin usar la rueda del ratón, que hace rebotar el documento). */
async function desplazarLista(page, y) {
  await page.locator('.tabla-contenedor').first().evaluate((el, top) => el.scrollTo({ top, behavior: 'smooth' }), y).catch(() => {});
  await p(1300);
}

/** Si se reanuda el guion en una escena de caja, entra como la cajera. */
async function asegurarCaja(page) {
  if (page.url().includes('/caja')) return;
  await cerrarSesion(page);
  await ir(page, '/login');
  await pin(page, PINES.cajera, { retardo: 90 });
  await esperarUrl(page, /\/caja/);
  await p(900);
}

async function cerrarSesion(page) {
  if (!page.url().startsWith('http')) await page.goto(BASE + '/login');
  else await fundido(page, true, 450);
  await page.evaluate(() => { localStorage.removeItem('POS_SESSION_TOKEN'); });
}

async function entrar(page, pinTxt, urlEsperada) {
  await ir(page, '/login');
  await p(900);
  await pin(page, pinTxt, { retardo: 200 });
  await esperarUrl(page, urlEsperada);
  await p(900);
}

/** Abre un grupo del menú lateral (acordeón) y entra a una sección. */
async function seccion(page, grupo, nombre) {
  const cabeza = page.locator('button.adm-nav__head', { hasText: new RegExp(grupo, 'i') }).first();
  if ((await cabeza.getAttribute('aria-expanded')) !== 'true') await clic(page, cabeza, { despues: 600 });
  await clic(page, page.getByRole('button', { name: nombre }).first(), { despues: 900 });
}

const escenas = [];
const escena = (nombre, fn) => escenas.push({ nombre, fn });

// ---------------------------------------------------------------------------------------------------------- 1
escena('Apertura', async ({ page }) => {
  await page.goto('about:blank');
  await page.setContent(htmlIntro());
  await pausa(7200);
});

// ---------------------------------------------------------------------------------------------------------- 2
escena('Entrada del administrador', async ({ page }) => {
  await ir(page, '/login');
  await p(900);
  await leyenda(page, 'Entra con tu <i>PIN</i>', 'Cada persona del equipo tiene el suyo');
  await p(1700);
  await pin(page, PINES.admin, { retardo: 210 });
  await esperarUrl(page, /\/admin/);
  await ocultarLeyenda(page);
  await p(1200);
  await leyenda(page, 'Centro de <i>Mando</i>', 'Todo tu restaurante en una sola pantalla');
  await p(2600);
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 3
escena('Identidad del negocio', async ({ page }) => {
  await seccion(page, 'Equipo & Fiscal', 'Datos de la Empresa');
  await leyenda(page, 'Tu marca, en <i>todas partes</i>', 'Sube tu logotipo: sale en tickets, facturas y pantallas');
  await p(1800);
  const archivo = page.locator('input[type=file]').first();
  await mover(page, page.getByRole('button', { name: /Subir nuevo logo/ }).first());
  await p(500);
  await archivo.setInputFiles(LOGO);
  await p(1800);
  await clic(page, page.getByRole('button', { name: /Guardar Identidad del Negocio/ }).first(), { despues: 1800 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 4
escena('Salón y mesas', async ({ page }) => {
  await seccion(page, 'Operaciones & Salón', 'Salón y Mesas');
  await leyenda(page, 'Arma tu <i>salón</i> en segundos', '12 mesas con un solo clic');
  await p(900);
  await escribir(page, page.getByPlaceholder(/Cantidad de mesas/), '12', { retardo: 140 });
  await clic(page, page.getByRole('button', { name: /Crear Mesas/ }), { despues: 2200 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 5
escena('Catálogo masivo', async ({ page }) => {
  await seccion(page, 'Operaciones & Salón', 'Catálogo de Menú');
  await leyenda(page, 'Sube tu menú <i>completo</i>', 'De tu archivo al sistema en segundos');
  await p(1400);
  await clic(page, page.getByRole('button', { name: /Subida Masiva/ }).first(), { despues: 900 });
  await mover(page, page.locator('input[type=file]').first());
  await p(600);
  await page.locator('input[type=file]').first().setInputFiles(CATALOGO);
  await p(1500);
  await clic(page, page.getByRole('button', { name: /Iniciar Importación Masiva/ }), { despues: 2600 });
  await ocultarLeyenda(page);
  await leyenda(page, '223 productos, <i>27 categorías</i>', 'Cocina y Bar se separan solos');
  await p(2200);
  await clic(page, page.getByRole('button', { name: /^Productos$/ }).first(), { despues: 1800 });
  await desplazarLista(page, 1400);
  await p(900);
  await desplazarLista(page, 0);
  await clic(page, page.getByRole('button', { name: /Categorias/ }).first(), { despues: 2200 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 6
escena('Fiscal', async ({ page }) => {
  await seccion(page, 'Equipo & Fiscal', 'Datos de la Empresa');
  await clic(page, page.getByRole('button', { name: 'Fiscal & Cuentas' }).first(), { despues: 800 });
  await leyenda(page, 'Fiscal <i>listo</i>', 'ITBIS 18 % y propina legal 10 %, sin cálculos manuales');
  await p(1600);
  for (const [nombre, etiqueta] of [['cobrar_itbis', /Cobrar ITBIS/], ['cobrar_propina', /Cobrar propina/]]) {
    const casilla = page.locator(`input[name=${nombre}]`);
    if (!(await casilla.isChecked())) await clic(page, page.getByText(etiqueta).first(), { despues: 700 });
  }
  await clic(page, page.getByRole('button', { name: /Aplicar ITBIS 18 % a todos los productos/ }), { despues: 1500 });
  const confirmar = page.getByRole('button', { name: /^(Confirmar|Aplicar|Sí|Aceptar|Continuar)/ }).first();
  if (await confirmar.isVisible().catch(() => false)) await clic(page, confirmar, { despues: 1200 });
  await clic(page, page.getByRole('button', { name: /Guardar Configuración Fiscal/ }), { despues: 1800 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- DGII
escena('Comprobantes DGII', async ({ page }) => {
  await seccion(page, 'Equipo & Fiscal', 'Comprobantes DGII');
  await leyenda(page, 'Comprobantes <i>DGII</i> en regla', 'Secuencias de NCF autorizadas, listas para facturar');
  await p(1700);
  const fecha = page.locator('input[type=date]').first();
  const tipo = page.locator('select').first();
  const guardar = async (etiquetaTipo) => {
    if (etiquetaTipo) {
      await mover(page, tipo);
      const valor = await tipo.evaluate((s, t) => [...s.options].find((o) => o.text.includes(t))?.value, etiquetaTipo);
      await tipo.selectOption(valor);
      await p(700);
    }
    await mover(page, fecha);
    await fecha.fill('2027-12-31');
    await p(700);
    await clic(page, page.getByRole('button', { name: /Guardar NCF/ }), { despues: 1500 });
  };
  await guardar(null);                    // B02 Consumidor Final (valores por omisión: 1 a 1000)
  await guardar('B01');                   // B01 Crédito Fiscal
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 7
escena('Personal', async ({ page }) => {
  await seccion(page, 'Equipo & Fiscal', 'Personal y Accesos');
  await leyenda(page, 'Tu <i>equipo</i>, con su acceso', 'Roles y PIN para cada colaborador');
  await p(1500);
  const crear = async (nombre, rolTexto, pinTxt) => {
    await escribir(page, page.getByPlaceholder(/Ej: Carlos Ramírez/), nombre, { retardo: 45 });
    const sel = page.locator('select').nth(1);
    await mover(page, sel);
    const valor = await sel.evaluate((s, t) => [...s.options].find((o) => o.text.includes(t))?.value, rolTexto);
    await sel.selectOption(valor);
    await p(500);
    await escribir(page, page.getByPlaceholder(/Ej: 123456/), pinTxt, { retardo: 60 });
    await clic(page, page.getByRole('button', { name: /Guardar y Autorizar/ }), { despues: 1500 });
  };
  await crear('Rosa Peña', 'Cajero', '619273');
  await crear('Juan Pérez', 'Camarero', '384726');
  await crear('Pedro Díaz', 'Cocina', '491837');
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 8
escena('Temas', async ({ page }) => {
  await seccion(page, 'Sistema & Terminales', 'Tema y Colores');
  await leyenda(page, 'Un estilo para <i>cada negocio</i>', 'Cambia los colores de todo el sistema en un clic');
  await p(1600);
  await clic(page, page.getByText('Oscuro Zafiro', { exact: true }).first(), { despues: 2000 });
  await clic(page, page.getByText('Oscuro Esmeralda', { exact: true }).first(), { despues: 2000 });
  await clic(page, page.getByText('Marfil Dorado', { exact: true }).first(), { despues: 1800 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 9
escena('Apertura de caja', async ({ page }) => {
  await cerrarSesion(page);
  await ir(page, '/login');
  await p(700);
  await leyenda(page, 'Caja · <i>Rosa Peña</i>', 'Abre el turno con el efectivo de la gaveta');
  await p(1500);
  await pin(page, PINES.cajera, { retardo: 200 });
  await esperarUrl(page, /\/caja/);
  await p(900);
  await escribir(page, page.getByPlaceholder('2,000.00'), '5000', { retardo: 130 });
  await escribir(page, page.getByPlaceholder(/Billetes de 100/), 'Apertura de turno noche', { retardo: 40 });
  await clic(page, page.getByRole('button', { name: /Registrar apertura/ }), { despues: 1800 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 10
/** Elige un plato: categoría -> tarjeta del producto (y opción de cocción si el plato la pide). */
async function plato(page, categoria, nombre, { termino = null, veces = 1 } = {}) {
  await clic(page, page.getByRole('button', { name: new RegExp(`^${categoria}`) }).first(), { despues: 450, pasos: 14 });
  for (let i = 0; i < veces; i += 1) {
    await clic(page, page.getByText(nombre, { exact: true }).first(), { despues: 550, pasos: 16 });
    if (termino) {
      await clic(page, page.getByRole('button', { name: new RegExp(termino) }).first(), { despues: 500 });
      await clic(page, page.getByRole('button', { name: /Agregar a la comanda/ }), { despues: 700 });
    }
  }
}

escena('Camarero toma el pedido', async ({ page }) => {
  await cerrarSesion(page);
  await ir(page, '/login');
  await p(700);
  await leyenda(page, 'Camarero · <i>Juan Pérez</i>', 'Cada mesa, en la palma de la mano');
  await p(1500);
  await pin(page, PINES.juan, { retardo: 200 });
  await esperarUrl(page, /\/app/);
  await p(1800);
  await clic(page, page.getByText('Mesa 4', { exact: true }).first(), { despues: 1100 });
  await ocultarLeyenda(page);
  await leyenda(page, 'Un menú claro, <i>sin papel</i>', 'Categorías y precios al toque');
  await plato(page, 'Ceviches y Cocteles', 'CEVICHE MIXTO');
  await plato(page, 'Pollo y Carnes', 'CHURRASCO', { termino: 'Tres Cuartos' });
  await ocultarLeyenda(page);
  await leyenda(page, 'Cada plato, <i>a su gusto</i>', 'Término de cocción y notas para la cocina');
  await plato(page, 'Acompañantes', 'TOSTONES');
  await clic(page, page.getByRole('button', { name: 'Bebidas', exact: true }).first(), { despues: 600 });
  await plato(page, 'Cervezas', 'PRESIDENTE GDE', { veces: 2 });
  await plato(page, 'Cocteles', 'MOJITO (COCO, LIMON, CHINOLA, CEREZA)');
  await p(900);
  await ocultarLeyenda(page);
  await leyenda(page, 'Un toque y llega a <i>cocina y bar</i>', 'La comanda se separa sola: alimentos a Cocina, bebidas a Bar');
  await clic(page, page.getByRole('button', { name: /Enviar comanda/ }), { despues: 2600 });
  await ocultarLeyenda(page);
  await clic(page, page.getByRole('button', { name: /Mesas/ }).first(), { despues: 1600 });
});

// ---------------------------------------------------------------------------------------------------------- 11
escena('Más mesas, al mismo tiempo', async ({ page }) => {
  await leyenda(page, 'Todo el salón, <i>en tiempo real</i>', 'Varios camareros, varias mesas, un solo sistema');
  await pedir(PINES.maria, 'Mesa 7', [['ALASKA ROLL 12 UND'], ['ATLANTIC ROLL 12 UND'], ['CORONA', 2], ['SODA']]);
  await p(1800);
  await pedir('746315', 'Mesa 2', [['PASTA ALFREDO DE CAMARONES'], ['PICADERA MAR Y TIERRA'], ['MARGARITA', 2]]);
  await p(2600);
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 12
async function kds(page, tipo, pinTxt, titulo, sub) {
  await cerrarSesion(page);
  await ir(page, '/login');
  await p(700);
  await clic(page, page.getByRole('button', { name: tipo === 'cocina' ? /KDS Cocina/ : /KDS Bar/ }).first(), { despues: 700 });
  await pin(page, pinTxt, { retardo: 200 });
  await esperarUrl(page, /\/kds\//);
  await p(1500);
  await leyenda(page, titulo, sub);
  await p(2800);
}

escena('Cocina (KDS)', async ({ page }) => {
  await kds(page, 'cocina', PINES.cocina, 'Cocina <i>sin papelitos</i>', 'Las comandas llegan solas, ordenadas por tiempo de espera');
  await clic(page, page.getByRole('button', { name: 'Listo' }).first(), { despues: 1300 });
  await ocultarLeyenda(page);
  await leyenda(page, 'Listo para <i>servir</i>', 'Despacha la mesa y el camarero lo ve al instante');
  await clic(page, page.getByRole('button', { name: /Despachar mesa completa/ }).first(), { despues: 2200 });
  await ocultarLeyenda(page);
});

escena('Bar (KDS)', async ({ page }) => {
  await kds(page, 'bar', PINES.bar, 'Bar <i>sincronizado</i>', 'Cervezas y cócteles salen sin confusiones');
  await clic(page, page.getByRole('button', { name: /Despachar mesa completa/ }).first(), { despues: 2200 });
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 15
escena('Cobro en caja', async ({ page }) => {
  await cerrarSesion(page);
  await ir(page, '/login');
  await p(700);
  await pin(page, PINES.cajera, { retardo: 180 });
  await esperarUrl(page, /\/caja/);
  await p(1500);
  await leyenda(page, 'Cobra en <i>segundos</i>', 'Efectivo, tarjeta, transferencia o pago mixto');
  await clic(page, page.getByText('Mesa 4', { exact: true }).first(), { despues: 1700 });
  await clic(page, page.getByRole('button', { name: /Proceder al pago/ }), { despues: 1300 });
  await ocultarLeyenda(page);
  const monto = page.locator('input:visible').first();
  await escribir(page, monto, '5000', { retardo: 150 });
  await p(1300);
  await clic(page, page.getByRole('button', { name: /Facturar/ }), { despues: 1800 });
  await leyenda(page, 'Comprobante fiscal <i>listo</i>', 'NCF, ITBIS, propina y código QR de validación');
  await p(4200);
  await ocultarLeyenda(page);
  await clic(page, page.getByRole('button', { name: /❌/ }).first(), { despues: 1200 });
});

// ---------------------------------------------------------------------------------------------------------- 16
escena('Venta rápida', async ({ page }) => {
  await asegurarCaja(page);
  await leyenda(page, 'Venta <i>rápida</i>', 'Para llevar o mostrador, sin abrir mesa');
  await clic(page, page.getByText('Venta Rápida', { exact: true }).first(), { despues: 1300 });
  await clic(page, page.getByRole('button', { name: 'Bebidas', exact: true }).first(), { despues: 600 });
  await plato(page, 'Cafés', 'CAPUCHINO', { veces: 2 });
  await clic(page, page.getByRole('button', { name: 'Comida', exact: true }).first(), { despues: 600 });
  await plato(page, 'Postres', 'FLAN');
  await p(900);
  await clic(page, page.getByRole('button', { name: /^Cobrar/ }).first(), { despues: 1500 });
  await ocultarLeyenda(page);
  await clic(page, page.getByRole('button', { name: /Proceder al pago/ }), { despues: 1200 });
  await clic(page, page.getByRole('button', { name: /Tarjeta/ }).first(), { despues: 900 });
  await escribir(page, page.getByPlaceholder(/4 d.gitos/), '4821', { retardo: 150 });
  await p(700);
  await clic(page, page.getByRole('button', { name: /Facturar/ }), { despues: 2200 });
  await p(1800);
  await clic(page, page.getByRole('button', { name: /❌/ }).first(), { despues: 1200 });
  await clic(page, page.getByRole('button', { name: 'Caja', exact: true }).first(), { despues: 1300 });
});

// ---------------------------------------------------------------------------------------------------------- 17
escena('Fin de la noche', async ({ page }) => {
  await asegurarCaja(page);
  await fundido(page, true, 700);
  await leyenda(page, 'Al cierre de la <i>noche</i>', 'Cada venta quedó registrada, sin papeles ni sumas a mano');
  await historialDeLaNoche(12);
  await p(1200);
  await ocultarLeyenda(page);
  await p(900);
  await fundido(page, false, 700);
  await clic(page, page.getByText('Historial', { exact: true }).first(), { despues: 1500 });
  await leyenda(page, 'Todas las facturas, <i>al alcance</i>', 'Busca por NCF, mesa o método de pago');
  await p(3200);
  await ocultarLeyenda(page);
  await clic(page, page.getByText('Cierre de caja', { exact: true }).first(), { despues: 1500 });
  await leyenda(page, 'Cierre de caja <i>sin sorpresas</i>', 'Desglose por método de pago y por tipo de comprobante DGII');
  await p(4200);
  await ocultarLeyenda(page);
});

// ---------------------------------------------------------------------------------------------------------- 18
escena('Panel final', async ({ page }) => {
  await cerrarSesion(page);
  await ir(page, '/login');
  await p(700);
  await pin(page, PINES.admin, { retardo: 180 });
  await esperarUrl(page, /\/admin/);
  await p(1500);
  await leyenda(page, 'Las ventas de la noche, <i>en vivo</i>', 'Ventas, ticket promedio y los platos más vendidos');
  await p(4200);
  await ocultarLeyenda(page);
  await seccion(page, 'Ventas & Facturación', 'Reporte de Ventas');
  await leyenda(page, 'Reportes <i>claros</i>', 'Para decidir con datos, no con intuición');
  await p(4200);
  await ocultarLeyenda(page);
  await seccion(page, 'Ventas & Facturación', 'Historial Facturas');
  await p(3000);
});

// ---------------------------------------------------------------------------------------------------------- 19
escena('Cierre', async ({ page }) => {
  await fundido(page, true, 700);
  await page.goto('about:blank');
  await page.setContent(htmlCierre());
  await pausa(9000);
});

// ---------------------------------------------------------------------------------------------------------- fin
export async function correr() {
  const { browser, page } = await abrir();
  const rec = await grabar(page, { dir: path.join(SALIDA, 'frames') });
  let n = 0;
  const marcas = [];
  try {
    for (const e of escenas) {
      n += 1;
      if (n > HASTA) break;
      if (n < DESDE) continue;
      console.log(`Escena ${n}: ${e.nombre}`);
      const inicioEscena = Date.now() / 1000;
      try {
        await e.fn({ page });
        marcas.push({ n, nombre: e.nombre, inicio: inicioEscena, fin: Date.now() / 1000 });
      } catch (error) {
        console.log(`  FALLÓ la escena ${n} (${e.nombre}): ${String(error.message).split(String.fromCharCode(10))[0]}`);
        await page.screenshot({ path: path.join(SALIDA, `error_${n}.png`) }).catch(() => {});
        const botones = (await page.locator('button:visible').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
        console.log('  botones visibles:', botones.slice(0, 40).join(' | '));
        throw error;
      }
    }
  } finally {
    const r = await rec.detener(path.join(SALIDA, 'borrador.mp4'));
    fs.writeFileSync(path.join(SALIDA, 'marcas.json'), JSON.stringify({ inicioVideo: r.inicio, marcas }, null, 2));
    console.log(`Video: ${r.archivo} (${r.segundos.toFixed(1)} s, ${r.fotogramas} fotogramas)`);
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await correr();
}
