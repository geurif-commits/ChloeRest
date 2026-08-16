const crypto = require('crypto');

const SECRETO = process.env.LICENSE_ACTIVATION_KEY || 'CHLOE-8VQ5K-R9CK9-8H8B8-FTGUA';

const DURACIONES = ['7D', '15D', '30D', '60D', '90D', '6M', '12M', '24M', 'L'];

function firmarDuracion(dur) {
  const mensaje = `CHLOE:${String(dur).toUpperCase()}`;
  const hex = crypto
    .createHmac('sha256', SECRETO)
    .update(mensaje)
    .digest('hex')
    .toUpperCase()
    .slice(0, 20);
  return hex;
}

function generarClave(dur) {
  const firma = firmarDuracion(dur);
  const grupos = firma.match(/.{1,5}/g).join('-');
  return `CHLOE-${String(dur).toUpperCase()}-${grupos}`;
}

const solicitada = process.argv[2];

if (solicitada) {
  console.log(generarClave(solicitada));
} else {
  console.log(`Secreto: ${SECRETO}`);
  console.log('');
  for (const dur of DURACIONES) {
    console.log(`${dur.padEnd(3)}  ${generarClave(dur)}`);
  }
}
