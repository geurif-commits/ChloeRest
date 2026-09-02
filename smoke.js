const BASE = 'https://chloerestaurant.lat';
async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, headers: res.headers };
}

const out = [];
const r = await request('/');
out.push(['GET /', r.status, r.headers.get('content-type')]);
const html = await (await fetch(BASE + '/')).text();
out.push(['index.html carga index-BomERb7B.js', html.includes('index-BomERb7B.js') ? 'SI' : 'NO']);

const h = await request('/api/health');
out.push(['GET /api/health', h.status, JSON.stringify(h.body)]);

const spa = await request('/paneldueno');
out.push(['GET /paneldueno (SPA fallback)', spa.status, spa.headers.get('content-type')]);
const spaHtml = await (await fetch(BASE + '/paneldueno')).text();
out.push(['SPA envía index.html', spaHtml.includes('<div id="root"') ? 'SI' : 'NO']);

const bad = await request('/api/activar-dispositivo', { method: 'POST', body: JSON.stringify({ dispositivoId: 'SMOKE-TEST', clave: 'CHLOE-99Z-XXXXX-XXXXX-XXXXX-XXXXX' }) });
out.push(['activar con duración inválida', bad.status, JSON.stringify(bad.body)]);

const wronglogin = await request('/api/dueno/login', { method: 'POST', body: JSON.stringify({ pin: '000000' }) });
out.push(['dueno login pin erróneo', wronglogin.status, JSON.stringify(wronglogin.body)]);

const noToken = await request('/api/dueno/solicitudes');
out.push(['dueno solicitudes SIN token', noToken.status]);

const login = await request('/api/dueno/login', { method: 'POST', body: JSON.stringify({ pin: process.env.OWNER_PIN || '000000' }) });
const token = login.body && login.body.token;
out.push(['dueno login OK', login.status, token ? 'token' : 'sin-token']);
const withTok = await request('/api/dueno/solicitudes', { headers: { Authorization: 'Bearer ' + token } });
out.push(['dueno solicitudes CON token', withTok.status, 'rows=' + (withTok.body && withTok.body.solicitudes ? withTok.body.solicitudes.length : '?' )]);

const securityHeaders = {};
for (const name of ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'content-security-policy']) {
  securityHeaders[name] = h.headers.get(name) || r.headers.get(name) || '(ausente)';
}
out.push(['HSTS/CSP/etc', JSON.stringify(securityHeaders)]);

for (const fila of out) console.log('| ' + fila.join(' | '));