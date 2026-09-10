const baseUrl = (process.env.TEST_BASE_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [];

const envText = await import('node:fs').then(({ readFileSync }) => readFileSync('.env', 'utf8'));
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim()])
);

const health = await request('/api/health');
assert(health.response.status === 200, `health devolvió ${health.response.status}`);
assert(health.body?.estado === 'ok', 'health no reportó estado ok');
assert(health.body?.baseDeDatos === 'conectada', 'health no confirmó la base de datos');
checks.push('health + PostgreSQL');

const ping = await request('/ping');
assert(ping.response.status === 200 && ping.body?.status === 'pong', 'ping no respondió pong');
checks.push('ping');

const frontend = await fetch(`${baseUrl}/`);
const frontendHtml = await frontend.text();
assert(frontend.status === 200 && frontendHtml.includes('<div id="root"></div>'), 'el frontend compilado no se sirve desde /');
const assetPath = frontendHtml.match(/(?:src|href)="(\/assets\/[^"']+)"/)?.[1];
assert(assetPath, 'index.html no referencia assets compilados');
const asset = await fetch(`${baseUrl}${assetPath}`);
assert(asset.status === 200, `asset frontend devolvió ${asset.status}`);
checks.push('SPA y assets compilados');

const protectedResponse = await request('/api/mesas');
assert(protectedResponse.response.status === 401, `ruta protegida devolvió ${protectedResponse.response.status} sin sesión`);
checks.push('autenticación de ruta protegida');

if (env.BOOTSTRAP_ADMIN_PIN) {
  const login = await request('/api/login/camarero', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: env.BOOTSTRAP_ADMIN_PIN, deviceId: 'codex-integration-admin' }),
  });
  assert(login.response.status === 200, `login del dueño devolvió ${login.response.status}`);
  assert(login.body?.token && login.body.token === login.body.tokenDueno, 'el token principal del dueño no coincide con el token firmado');
  const session = await request('/api/sesion/validar', {
    headers: { authorization: `Bearer ${login.body.token}` },
  });
  assert(session.response.status === 200 && session.body?.valido === true, 'la sesión del dueño no pudo validarse');
  const ownerMesas = await request('/api/mesas', {
    headers: { authorization: `Bearer ${login.body.token}` },
  });
  assert(ownerMesas.response.status === 200, `el dueño no pudo acceder a mesas: ${ownerMesas.response.status}`);
  checks.push('login y sesión del dueño');

  const authHeaders = { authorization: `Bearer ${login.body.token}` };
  const suffix = Date.now().toString(36);

  const beforeMesas = await request('/api/mesas', { headers: authHeaders });
  const generateMesa = await request('/api/mesas/generar', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ cantidad: 1 }),
  });
  assert(generateMesa.response.status === 200, `crear mesa devolvió ${generateMesa.response.status}`);
  const afterMesas = await request('/api/mesas', { headers: authHeaders });
  const mesaNueva = afterMesas.body.find((mesa) => !beforeMesas.body.some((anterior) => anterior.id === mesa.id));
  assert(mesaNueva?.id, 'no se encontró la mesa creada');
  const deleteMesa = await request(`/api/mesas/${mesaNueva.id}`, { method: 'DELETE', headers: authHeaders });
  assert(deleteMesa.response.status === 200, `eliminar mesa devolvió ${deleteMesa.response.status}`);
  checks.push('CRUD de mesas');

  const nombreProducto = `Producto Integración ${suffix}`;
  const createProduct = await request('/api/productos', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ nombre: nombreProducto, precio: 10, categoria: 'Pruebas' }),
  });
  assert(createProduct.response.status === 201, `crear producto devolvió ${createProduct.response.status}`);
  const catalog = await request('/api/productos', { headers: authHeaders });
  const product = catalog.body.find((item) => item.nombre === nombreProducto);
  assert(product?.id, 'no se encontró el producto creado');

  const sequences = await request('/api/dgii/secuencias', { headers: authHeaders });
  assert(sequences.response.status === 200, `listar secuencias devolvió ${sequences.response.status}`);
  if (!sequences.body.some((sequence) => sequence.tipo_comprobante === 'B02' && sequence.activa && Number(sequence.secuencia_actual) < Number(sequence.secuencia_final))) {
    const createSequence = await request('/api/dgii/secuencias', {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ tipo_comprobante: 'B02', prefijo: 'B02', secuencia_inicial: 1, secuencia_actual: 1, secuencia_final: 999999, fecha_vencimiento: '2099-12-31' }),
    });
    assert(createSequence.response.status === 200, `crear secuencia NCF devolvió ${createSequence.response.status}`);
  }

  const flowBeforeMesas = await request('/api/mesas', { headers: authHeaders });
  const flowGenerateMesa = await request('/api/mesas/generar', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ cantidad: 1 }),
  });
  assert(flowGenerateMesa.response.status === 200, `crear mesa del flujo devolvió ${flowGenerateMesa.response.status}`);
  const flowMesas = await request('/api/mesas', { headers: authHeaders });
  const flowMesa = flowMesas.body.find((mesa) => !flowBeforeMesas.body.some((anterior) => anterior.id === mesa.id));
  assert(flowMesa?.id, 'no se encontró la mesa del flujo operativo');

  const order = await request(`/api/mesas/${flowMesa.id}/pedido`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ comanda: [{ id: product.id, cantidad: 1 }] }),
  });
  assert(order.response.status === 200, `crear pedido devolvió ${order.response.status}`);
  const accountDetails = await request(`/api/mesas/${flowMesa.id}/cuenta`, { headers: authHeaders });
  assert(accountDetails.response.status === 200 && accountDetails.body.length === 1, 'la cuenta no contiene el pedido');
  const kds = await request('/api/kds/Cocina/pedidos', { headers: authHeaders });
  const pendingItem = kds.body.find((item) => item.detalle_id === accountDetails.body[0].id);
  assert(pendingItem?.detalle_id, 'el pedido no llegó a cocina');
  const dispatch = await request(`/api/kds/despachar/${pendingItem.detalle_id}`, { method: 'PUT', headers: authHeaders });
  assert(dispatch.response.status === 200, `despachar pedido devolvió ${dispatch.response.status}`);
  const payment = await request(`/api/mesas/${flowMesa.id}/cobrar`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ metodo_pago: 'Efectivo' }),
  });
  assert(payment.response.status === 200, `cobrar cuenta devolvió ${payment.response.status}: ${JSON.stringify(payment.body)}`);
  const deleteFlowMesa = await request(`/api/mesas/${flowMesa.id}`, { method: 'DELETE', headers: authHeaders });
  assert(deleteFlowMesa.response.status === 409, `eliminar mesa con historial devolvió ${deleteFlowMesa.response.status}`);
  checks.push('pedido → KDS → cobro');

  const deleteProduct = await request(`/api/productos/${product.id}`, { method: 'DELETE', headers: authHeaders });
  assert(deleteProduct.response.status === 200, `desactivar producto devolvió ${deleteProduct.response.status}`);
  checks.push('CRUD de productos');

  const nombreUsuario = `Usuario Integración ${suffix}`;
  const createUser = await request('/api/usuarios', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ nombre: nombreUsuario, rol: 'Camarero', pin: '654321' }),
  });
  assert(createUser.response.status === 201, `crear usuario devolvió ${createUser.response.status}`);
  const users = await request('/api/usuarios', { headers: authHeaders });
  const user = users.body.find((item) => item.nombre === nombreUsuario);
  assert(user?.id, 'no se encontró el usuario creado');
  const deleteUser = await request(`/api/usuarios/${user.id}`, { method: 'DELETE', headers: authHeaders });
  assert(deleteUser.response.status === 200, `desactivar usuario devolvió ${deleteUser.response.status}`);
  checks.push('CRUD de usuarios');
}

const cors = await request('/api/health', { headers: { Origin: 'https://origen-no-autorizado.example' } });
assert(!cors.response.headers.get('access-control-allow-origin'), 'CORS permitió un origen no autorizado');
checks.push('CORS');

console.log(`Smoke integration OK (${checks.length} checks): ${checks.join(', ')}`);
