/**
 * Avisa a los buscadores que participan en IndexNow (Bing, Yandex, Seznam.cz, Naver — Google NO
 * participa en este protocolo, necesita Search Console) de que hay URLs nuevas o cambiadas.
 * No requiere iniciar sesión en nada: solo que la clave esté publicada en
 * https://chloerestaurant.lat/<clave>.txt (frontend-restaurante/public/<clave>.txt).
 *
 *   node scripts/indexnow-submit.mjs
 *   node scripts/indexnow-submit.mjs https://chloerestaurant.lat/una-url-nueva
 */
const HOST = 'chloerestaurant.lat';
const CLAVE = '01fea755e3f9d5523831d3c07fbaf9c2';
const KEY_LOCATION = `https://${HOST}/${CLAVE}.txt`;

const urlList = process.argv.length > 2
  ? process.argv.slice(2)
  : [
      `https://${HOST}/`,
      `https://${HOST}/landingscreen/`,
      `https://${HOST}/formulario/`,
      `https://${HOST}/solicitar/`,
      `https://${HOST}/solicitar-licencia/`,
    ];

console.log(`Verificando que la clave esté publicada en ${KEY_LOCATION} ...`);
const verificacion = await fetch(KEY_LOCATION).catch(() => null);
if (!verificacion || !verificacion.ok) {
  console.error(`No se pudo leer la clave en ${KEY_LOCATION} (¿ya se desplegó frontend-restaurante/public/${CLAVE}.txt?). No se envía nada.`);
  process.exit(1);
}
const cuerpo = (await verificacion.text()).trim();
if (cuerpo !== CLAVE) {
  console.error(`El archivo de la clave no coincide (leído: "${cuerpo.slice(0, 40)}"). No se envía nada.`);
  process.exit(1);
}

console.log(`Enviando ${urlList.length} URL(s) a IndexNow...`);
const respuesta = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: CLAVE, keyLocation: KEY_LOCATION, urlList }),
});

console.log(`IndexNow respondió HTTP ${respuesta.status}${respuesta.status === 200 || respuesta.status === 202 ? ' (aceptado)' : ''}`);
if (respuesta.status !== 200 && respuesta.status !== 202) {
  console.error(await respuesta.text().catch(() => ''));
  process.exit(1);
}
