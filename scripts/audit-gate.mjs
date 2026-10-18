/**
 * Gate de `npm audit` para dependencias de producción (lo usa el job `backend` de CI).
 *
 * Equivale a `npm audit --omit=dev --audit-level=high`, con una lista de excepciones MÍNIMA y justificada:
 * un aviso sin versión corregida publicada no se puede resolver actualizando, y bloquearía todo el CI.
 * Cada excepción:
 *   - nombra el aviso exacto (GHSA), no el paquete: cualquier otro aviso del mismo paquete sigue fallando;
 *   - caduca (`hasta`): al vencer vuelve a fallar para obligar a revisarla;
 *   - deja de valer en cuanto npm informa de una corrección (`fixAvailable`): entonces hay que actualizar.
 */
import { spawnSync } from 'node:child_process';

const EXCEPCIONES = [
  {
    aviso: 'GHSA-86w9-cpqp-85rv',
    paquete: 'node-forge',
    hasta: '2027-01-18',
    motivo:
      'RSA PKCS#1 v1.5: la verificación de firmas acepta elementos DigestAlgorithm anidados de más. node-forge (<=1.4.0, la última publicada) solo ' +
      'llega por dgii-ecf, que lo usa para leer el certificado .p12 y firmar; no llama a la verificación de firmas RSA de forge ' +
      '(su único .verify es de JWT) y este código no importa node-forge. Sin versión corregida disponible.',
  },
];

const NIVELES = { low: 1, moderate: 2, high: 3, critical: 4 };
const UMBRAL = NIVELES.high;

const r = spawnSync('npm audit --omit=dev --json', { shell: true, encoding: 'utf8', maxBuffer: 1 << 26 });
let informe;
try {
  informe = JSON.parse(r.stdout);
} catch {
  console.error('No se pudo leer la salida de `npm audit` (¿sin red?):\n', r.stdout || r.stderr);
  process.exit(2);
}
if (informe.error) {
  console.error('npm audit falló:', informe.error.summary || informe.error);
  process.exit(2);
}

const hoy = new Date().toISOString().slice(0, 10);
const fallos = [];
const aceptados = [];

for (const [nombre, v] of Object.entries(informe.vulnerabilities ?? {})) {
  if ((NIVELES[v.severity] ?? 0) < UMBRAL) continue;
  for (const via of v.via) {
    if (typeof via === 'string') continue; // aviso heredado de otro paquete: se juzga en el paquete de origen
    if ((NIVELES[via.severity] ?? 0) < UMBRAL) continue;
    const id = (via.url ?? '').split('/').pop();
    const exc = EXCEPCIONES.find((e) => e.aviso === id && e.paquete === via.name);
    if (!exc) {
      fallos.push(`${via.name} (${via.severity}) ${id}: ${via.title}`);
    } else if (hoy > exc.hasta) {
      fallos.push(`${via.name} ${id}: la excepción venció el ${exc.hasta}; hay que revisarla`);
    } else if (informe.vulnerabilities[via.name]?.fixAvailable) {
      fallos.push(`${via.name} ${id}: ya hay una corrección disponible; hay que actualizar y quitar la excepción`);
    } else {
      aceptados.push(`${via.name} ${id} (hasta ${exc.hasta}): ${exc.motivo}`);
    }
  }
}

for (const a of [...new Set(aceptados)]) console.log(`ACEPTADO  ${a}`);
if (fallos.length) {
  for (const f of [...new Set(fallos)]) console.error(`FALLA     ${f}`);
  process.exit(1);
}
console.log('npm audit (producción, nivel high) OK' + (aceptados.length ? ' con la excepción documentada de arriba.' : '.'));
