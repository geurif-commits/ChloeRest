/**
 * Verifica un despliegue SIN credenciales (solo lectura): responde, migración al día, zona horaria y cabeceras.
 *
 *   npm run verify:deploy -- https://chloerestaurant.lat
 *
 * Sale con código 1 si algo no está bien, para usarlo en un paso de despliegue o de CI.
 */
import fs from 'node:fs';

const destino = (process.argv[2] || process.env.DEPLOY_URL || '').replace(/\/$/, '');
if (!destino) { console.error('Indica la URL: npm run verify:deploy -- https://tu-dominio'); process.exit(2); }

// Última migración definida en el código (la que debería estar aplicada).
const codigo = fs.readFileSync('src/db/migrations.ts', 'utf8');
const esperada = [...codigo.matchAll(/id:\s*'(\d{3}_[a-z0-9_]+)'/g)].map((m) => m[1]).sort().at(-1);

const resultados = [];
const revisar = (nombre, cumple, detalle = '') => { resultados.push(cumple); console.log(`${cumple ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  → ' + detalle : ''}`); };

try {
  const respuesta = await fetch(`${destino}/api/health`, { signal: AbortSignal.timeout(15000) });
  const cuerpo = await respuesta.json().catch(() => ({}));
  revisar('responde HTTP 200 con estado ok', respuesta.status === 200 && cuerpo.estado === 'ok', `HTTP ${respuesta.status}`);
  revisar('base de datos conectada', cuerpo.baseDeDatos === 'conectada');
  revisar('migración al día', cuerpo.migracion === esperada, `aplicada ${cuerpo.migracion} · esperada ${esperada}`);
  revisar('uploads escribible', cuerpo.uploads === 'escribible');
  if (cuerpo.zonaHorariaBd === undefined) {
    revisar('zona horaria de la base de datos', false, 'el servidor no la informa (versión anterior del código)');
  } else {
    revisar('zona horaria de la base de datos = America/Santo_Domingo (UTC−4)', /Santo_Domingo|La_Paz|Caracas|Puerto_Rico|Barbados|-04/.test(cuerpo.zonaHorariaBd), cuerpo.zonaHorariaBd);
  }
  const cabeceras = respuesta.headers;
  if (destino.startsWith('https://')) revisar('HTTPS con HSTS', Boolean(cabeceras.get('strict-transport-security')));
  else console.log('AVISO  destino sin HTTPS: no se comprueba HSTS (solo válido para pruebas locales)');
  revisar('cabeceras de seguridad (CSP, nosniff, X-Frame-Options)', Boolean(cabeceras.get('content-security-policy')) && cabeceras.get('x-content-type-options') === 'nosniff' && Boolean(cabeceras.get('x-frame-options')));
  const sinCredenciales = await fetch(`${destino}/api/mesas`, { signal: AbortSignal.timeout(15000) });
  revisar('las rutas de negocio exigen sesión (401)', sinCredenciales.status === 401, `HTTP ${sinCredenciales.status}`);
  const info = await fetch(`${destino}/api/sistema/info`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => ({}));
  revisar('los datos públicos no revelan el negocio (sin equipo activado)', !info.nombreNegocio && !info.direccion && !info.telefono, Object.keys(info).length ? 'campos: ' + Object.keys(info).join(',') : 'sin respuesta');
} catch (error) {
  revisar('el servidor responde', false, error.message);
}

const fallos = resultados.filter((r) => !r).length;
console.log(fallos ? `\n${fallos} comprobación(es) fallida(s).` : '\nDespliegue verificado.');
process.exit(fallos ? 1 : 0);
