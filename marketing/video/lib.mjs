/**
 * Utilidades para operar el sistema como lo haría una persona y grabarlo: cursor visible, clics con movimiento,
 * escritura con ritmo, leyendas de pantalla y pausas. Usa Edge instalado (sin descargar navegadores).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Se inyecta en cada documento: cursor, onda de clic y leyendas. */
const OVERLAY = `
(() => {
  if (window.__overlayListo) return; window.__overlayListo = true;
  const arrancar = () => {
  const css = document.createElement('style');
  css.textContent = \`
    #__cursor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-4px,-3px);
      transition:transform .05s linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
    .__onda{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
      border:3px solid rgba(255,196,64,.95);animation:__onda .6s ease-out forwards}
    @keyframes __onda{from{transform:scale(.5);opacity:1}to{transform:scale(4.2);opacity:0}}
    #__cap{position:fixed;left:50%;bottom:44px;z-index:2147483645;pointer-events:none;transform:translate(-50%,20px);opacity:0;
      transition:opacity .45s ease,transform .45s ease;max-width:78vw;text-align:center;padding:16px 34px 18px;border-radius:22px;
      background:linear-gradient(180deg,rgba(10,20,38,.93),rgba(5,10,20,.95));border:1.5px solid rgba(247,198,69,.55);
      box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.04) inset;font-family:'Segoe UI',Inter,Arial,sans-serif}
    #__cap.on{opacity:1;transform:translate(-50%,0)}
    #__cap b{display:block;font-family:Georgia,'Times New Roman',serif;font-weight:800;font-size:34px;letter-spacing:-.3px;color:#fff;line-height:1.15}
    #__cap b i{font-style:normal;background:linear-gradient(180deg,#FFE9A6,#E19A14 70%,#8E5300);-webkit-background-clip:text;color:transparent}
    #__cap span{display:block;margin-top:6px;font-size:19px;color:#C6D2E8;letter-spacing:.2px}
    #__fade{position:fixed;inset:0;background:#050A14;z-index:2147483644;pointer-events:none;opacity:0;transition:opacity .5s ease}
    #__marca{position:fixed;right:26px;top:22px;z-index:2147483643;pointer-events:none;opacity:.0;transition:opacity .5s}
  \`;
  document.documentElement.appendChild(css);
  const mk = (tag, id) => { const e = document.createElement(tag); e.id = id; document.documentElement.appendChild(e); return e; };
  const cur = mk('div', '__cursor');
  cur.innerHTML = '<svg viewBox="0 0 28 28" width="28" height="28"><path d="M4 2 L4 22 L9.5 17.2 L13.2 25.5 L16.4 24.1 L12.8 15.9 L20 15.6 Z" fill="#fff" stroke="#0A1426" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  mk('div', '__cap'); mk('div', '__fade');
  addEventListener('mousemove', (e) => { cur.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 3) + 'px)'; }, true);
  addEventListener('mousedown', (e) => {
    const o = document.createElement('div'); o.className = '__onda'; o.style.left = e.clientX + 'px'; o.style.top = e.clientY + 'px';
    document.documentElement.appendChild(o); setTimeout(() => o.remove(), 700);
  }, true);
  window.__leyenda = (titulo, sub) => {
    const c = document.getElementById('__cap');
    c.innerHTML = '<b>' + titulo + '</b>' + (sub ? '<span>' + sub + '</span>' : '');
    requestAnimationFrame(() => c.classList.add('on'));
  };
  window.__ocultar = () => document.getElementById('__cap')?.classList.remove('on');
  window.__fundido = (v) => { document.getElementById('__fade').style.opacity = v ? '1' : '0'; };
  try {
    if (sessionStorage.getItem('__fi') === '1') {
      const f = document.getElementById('__fade'); f.style.transition = 'none'; f.style.opacity = '1'; sessionStorage.removeItem('__fi');
      requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = ''; f.style.opacity = '0'; }));
    }
  } catch (e) { /* about:blank */ }
  };
  if (document.documentElement) arrancar(); else document.addEventListener('readystatechange', () => { if (document.documentElement && !document.getElementById('__cursor')) arrancar(); });
})();
`;

export async function abrir({ ancho = 1920, alto = 1080, deviceId = 'prueba-web-0001', movil = false } = {}) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--hide-scrollbars', '--disable-features=TranslateUI', '--autoplay-policy=no-user-gesture-required'] });
  const opciones = {
    viewport: movil ? { width: 430, height: 932 } : { width: ancho, height: alto },
    deviceScaleFactor: 1,
    locale: 'es-DO',
    timezoneId: 'America/Santo_Domingo',
    ...(movil ? { isMobile: true, hasTouch: true } : {}),
  };
  const context = await browser.newContext(opciones);
  await context.addInitScript(`try{localStorage.setItem('POS_DEVICE_ID', ${JSON.stringify(deviceId)});}catch(e){}`);
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [error de la página]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [consola]', m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 500) console.log('  [HTTP', r.status() + ']', r.url().replace(BASE, '')); });
  return { browser, context, page };
}


/**
 * Graba la página con el screencast de DevTools (fotogramas JPEG con su marca de tiempo) y los codifica con el
 * ffmpeg del sistema a ritmo constante. `detener(salida)` devuelve la ruta del MP4.
 */
export async function grabar(page, { dir, fps = 30, calidad = 92, ancho = 1920, alto = 1080 } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const marcas = [];
  let n = 0;
  const pendientes = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const i = n++;
    marcas.push(metadata.timestamp);
    pendientes.push(fs.promises.writeFile(path.join(dir, `f${String(i).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: calidad, maxWidth: ancho, maxHeight: alto, everyNthFrame: 1 });
  return {
    async detener(salida, { extra = [] } = {}) {
      await pausa(400);
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all(pendientes);
      const lista = marcas.map((t, i) => {
        const dur = i < marcas.length - 1 ? Math.max(0.001, marcas[i + 1] - t) : 0.5;
        return `file 'f${String(i).padStart(6, '0')}.jpg'\nduration ${dur.toFixed(4)}`;
      });
      lista.push(`file 'f${String(marcas.length - 1).padStart(6, '0')}.jpg'`);
      fs.writeFileSync(path.join(dir, 'lista.txt'), lista.join('\n'));
      fs.mkdirSync(path.dirname(salida), { recursive: true });
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'lista.txt'),
        '-vf', `fps=${fps},scale=${ancho}:${alto}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '17', '-preset', 'medium',
        '-movflags', '+faststart', ...extra, salida], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`ffmpeg falló: ${r.stderr}`);
      return { archivo: salida, fotogramas: marcas.length, segundos: marcas.length ? marcas[marcas.length - 1] - marcas[0] : 0, inicio: marcas[0] };
    },
  };
}

/** Texto de una leyenda con la palabra clave en dorado: "Gestiona|Todo en un solo lugar" → <i> en el último segmento. */
export async function leyenda(page, titulo, sub = '', ms = 0) {
  await page.evaluate(([t, s]) => window.__leyenda?.(t, s), [titulo, sub]);
  if (ms) await pausa(ms);
}
export const ocultarLeyenda = (page) => page.evaluate(() => window.__ocultar?.());
export const fundido = async (page, v, ms = 600) => { await page.evaluate((x) => { try { sessionStorage.setItem('__fi', x ? '1' : ''); } catch (e) { /* about:blank */ } window.__fundido?.(x); }, v); await pausa(ms); };

async function centro(page, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox();
  if (!box) throw new Error('elemento sin caja visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function mover(page, loc, { pasos = 22 } = {}) {
  const { x, y } = await centro(page, loc);
  await page.mouse.move(x, y, { steps: pasos });
  return { x, y };
}

/** Mueve el cursor al elemento y hace clic como una persona. */
export async function clic(page, loc, { antes = 220, despues = 450, pasos = 22 } = {}) {
  await mover(page, loc, { pasos });
  await pausa(antes);
  await loc.click({ timeout: 8000 });
  await pausa(despues);
}

export async function escribir(page, loc, texto, { retardo = 55, despues = 300 } = {}) {
  await mover(page, loc);
  await loc.click({ timeout: 8000 });
  await loc.fill('');
  await page.keyboard.type(texto, { delay: retardo });
  await pausa(despues);
}

/** Teclea un PIN en el teclado numérico de pantalla. */
export async function pin(page, digitos, { retardo = 230 } = {}) {
  for (const d of String(digitos)) {
    await clic(page, page.getByRole('button', { name: d, exact: true }).first(), { antes: 90, despues: retardo, pasos: 14 });
  }
}

export function carpeta(rel) {
  const d = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), rel);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
