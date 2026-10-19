import http from 'node:http';
import type { AddressInfo } from 'node:net';
import cors from 'cors';
import express, { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { esOrigenDeEscritorio, esRutaPublicaDeRegistro, opcionesCors } from '../../../src/lib/corsEscritorio.js';

/** La lista de orígenes de PRODUCCIÓN: solo el dominio público (sin orígenes de desarrollo ni "null"). */
const PRODUCCION = ['https://chloerestaurant.lat', 'https://www.chloerestaurant.lat'];

describe('esOrigenDeEscritorio', () => {
  it('acepta este mismo equipo en cualquier puerto y el origen "null" (pantalla cargada desde archivo)', () => {
    for (const bueno of ['http://127.0.0.1:3000', 'http://127.0.0.1:3007', 'http://localhost:3000', 'https://localhost:8443', 'http://[::1]:3000', 'http://127.0.0.1', 'null']) {
      expect(esOrigenDeEscritorio(bueno)).toBe(true);
    }
  });

  it('rechaza cualquier otro origen, incluidos los que solo se parecen', () => {
    for (const malo of [undefined, '', 'https://chloerestaurant.lat', 'http://127.0.0.1.evil.com', 'http://localhost.evil.com:3000', 'http://evil.com/127.0.0.1', 'http://192.168.1.10:3000', 'http://127.0.0.2:3000', 'ftp://127.0.0.1', 'file://']) {
      expect(esOrigenDeEscritorio(malo)).toBe(false);
    }
  });
});

describe('esRutaPublicaDeRegistro', () => {
  it('cubre solo las rutas públicas que consulta la app de escritorio', () => {
    for (const buena of ['/api/planes', '/api/metodos-pago', '/api/solicitud-licencia', '/api/solicitud-licencia/', '/api/solicitud-licencia/42/confirmar-pago']) {
      expect(esRutaPublicaDeRegistro(buena)).toBe(true);
    }
  });

  it('no abre nada más de la API', () => {
    for (const mala of ['/api/login/camarero', '/api/dueno/login', '/api/dueno/licencias', '/api/dispositivo/activar', '/api/solicitud-licencia/abc/confirmar-pago', '/api/solicitud-licencia/1/otra', '/api/planes/1', '/api/dueno/planes', '/api/usuarios']) {
      expect(esRutaPublicaDeRegistro(mala)).toBe(false);
    }
  });
});

describe('opcionesCors', () => {
  it('para la app de escritorio en una ruta pública: su origen, sin credenciales, solo GET/POST', () => {
    expect(opcionesCors('http://127.0.0.1:3000', '/api/solicitud-licencia', PRODUCCION)).toMatchObject({
      origin: 'http://127.0.0.1:3000', credentials: false, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'],
    });
  });

  it('para todo lo demás: la lista configurada, con credenciales como siempre', () => {
    for (const [origen, ruta] of [['http://127.0.0.1:3000', '/api/login/camarero'], ['https://evil.com', '/api/solicitud-licencia'], [undefined, '/api/planes']] as const) {
      expect(opcionesCors(origen, ruta, PRODUCCION)).toMatchObject({ origin: PRODUCCION, credentials: true });
    }
  });
});

/** Petición HTTP real (Node permite fijar `Origin`, que un navegador pone por su cuenta). */
function pedir(puerto: number, metodo: string, ruta: string, cabeceras: Record<string, string>): Promise<{ status: number; cabeceras: http.IncomingHttpHeaders }> {
  return new Promise((resolver, rechazar) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: cabeceras }, (res) => {
      res.resume();
      res.on('end', () => resolver({ status: res.statusCode ?? 0, cabeceras: res.headers }));
    });
    req.on('error', rechazar);
    req.end();
  });
}

describe('CORS de verdad, con el middleware real y la lista de PRODUCCIÓN', () => {
  let servidor: http.Server;
  let puerto = 0;

  beforeAll(async () => {
    const app = express();
    app.use(cors<Request>((req, callback) => callback(null, opcionesCors(req.headers.origin, req.path, PRODUCCION))));
    app.use('/api', (_req, res) => { res.json({ ok: true }); });
    servidor = http.createServer(app);
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    puerto = (servidor.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolver) => servidor.close(() => resolver())));

  const ORIGEN = { Origin: 'http://127.0.0.1:3000' };

  it('la solicitud de registro desde la app de escritorio ya pasa el control de CORS (preflight y petición)', async () => {
    const previa = await pedir(puerto, 'OPTIONS', '/api/solicitud-licencia', { ...ORIGEN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' });
    expect(previa.status).toBe(204);
    expect(previa.cabeceras['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    expect(previa.cabeceras['access-control-allow-credentials']).toBeUndefined();
    expect(previa.cabeceras['access-control-allow-methods']).toBe('GET,POST,OPTIONS');
    expect(previa.cabeceras['access-control-allow-headers']).toBe('Content-Type');
    const real = await pedir(puerto, 'POST', '/api/solicitud-licencia', ORIGEN);
    expect(real.cabeceras['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    expect(real.cabeceras['access-control-allow-credentials']).toBeUndefined();
  });

  it('funciona con otro puerto local, con "null" y para planes, métodos de pago y confirmar pago', async () => {
    for (const [origen, ruta] of [['http://127.0.0.1:3004', '/api/planes'], ['http://localhost:3000', '/api/metodos-pago'], ['null', '/api/solicitud-licencia/7/confirmar-pago']]) {
      const r = await pedir(puerto, 'GET', ruta, { Origin: origen });
      expect(r.cabeceras['access-control-allow-origin']).toBe(origen);
    }
  });

  it('el resto de la API sigue cerrado para ese origen (no hay Allow-Origin)', async () => {
    for (const ruta of ['/api/login/camarero', '/api/dueno/licencias', '/api/dispositivo/activar', '/api/usuarios']) {
      const r = await pedir(puerto, 'GET', ruta, ORIGEN);
      expect(r.cabeceras['access-control-allow-origin']).toBeUndefined();
      const previa = await pedir(puerto, 'OPTIONS', ruta, { ...ORIGEN, 'Access-Control-Request-Method': 'POST' });
      expect(previa.cabeceras['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('un sitio ajeno no recibe permiso ni en las rutas de registro', async () => {
    for (const origen of ['https://evil.example', 'http://127.0.0.1.evil.example:3000', 'http://192.168.0.20:3000']) {
      const r = await pedir(puerto, 'GET', '/api/planes', { Origin: origen });
      expect(r.cabeceras['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('el dominio público conserva su acceso completo con credenciales', async () => {
    const r = await pedir(puerto, 'GET', '/api/usuarios', { Origin: 'https://chloerestaurant.lat' });
    expect(r.cabeceras['access-control-allow-origin']).toBe('https://chloerestaurant.lat');
    expect(r.cabeceras['access-control-allow-credentials']).toBe('true');
  });
});
