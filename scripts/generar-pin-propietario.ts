/**
 * Fija (o verifica, o quita) el PIN del propietario incrustado en el código fuente.
 *
 *   npm run propietario:pin                 pide el PIN dos veces (sin mostrarlo) y lo incrusta
 *   npm run propietario:pin -- --verificar  comprueba si recuerdas el PIN incrustado (no cambia nada)
 *   npm run propietario:pin -- --quitar     vuelve al PIN configurable (OWNER_PIN / PIN guardado)
 *
 * Lo que se escribe en `src/lib/propietario.ts` es solo un verificador scrypt salado, jamás el PIN. El PIN no se guarda
 * en ningún archivo ni en el historial de comandos: se teclea aquí, sin eco. Después hay que recompilar y desplegar
 * (y, para las apps de escritorio, generar un instalador nuevo) para que el cambio rija.
 */
import path from 'node:path';
import readline from 'node:readline';
import {
  CREDENCIAL_PROPIETARIO,
  LONGITUD_MAXIMA_INCRUSTADO,
  LONGITUD_MINIMA_INCRUSTADO,
  crearCredencial,
  validarPinParaIncrustar,
  verificarCredencial,
} from '../src/lib/propietario.js';
import { reescribirCredencial } from './lib/propietario-archivo.js';

const ARCHIVO = path.resolve(process.cwd(), 'src', 'lib', 'propietario.ts');

function salir(mensaje: string, codigo = 1): never {
  console.error(mensaje);
  process.exit(codigo);
}

/** Lee una línea sin mostrar lo que se teclea. */
function pedirOculto(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const consola = rl as unknown as { _writeToOutput?: (texto: string) => void };
    let ocultar = false;
    consola._writeToOutput = (texto: string): void => {
      if (!ocultar) {process.stdout.write(texto);}
    };
    rl.question(pregunta, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolver(respuesta.trim());
    });
    ocultar = true;
  });
}

async function principal(): Promise<void> {
  const modo = process.argv.includes('--quitar') ? 'quitar' : process.argv.includes('--verificar') ? 'verificar' : 'fijar';
  if (!process.stdin.isTTY && modo !== 'quitar') {
    salir('Este comando pide el PIN por teclado: ejecútalo en una terminal interactiva.');
  }

  if (modo === 'quitar') {
    if (!CREDENCIAL_PROPIETARIO) {salir('No hay PIN incrustado: ya se usa el PIN configurable.', 0);}
    reescribirCredencial(ARCHIVO, null);
    console.log('PIN incrustado eliminado. El sistema vuelve a usar OWNER_PIN o el PIN guardado en la base.');
    return;
  }

  if (modo === 'verificar') {
    if (!CREDENCIAL_PROPIETARIO) {salir('No hay PIN incrustado todavía.', 0);}
    const pin = await pedirOculto('PIN del propietario a comprobar: ');
    const ok = await verificarCredencial(pin, CREDENCIAL_PROPIETARIO);
    console.log(ok ? '✔ Correcto: ese es el PIN incrustado.' : '✘ No coincide con el PIN incrustado.');
    process.exit(ok ? 0 : 1);
  }

  console.log(`PIN del propietario incrustado en el código (${LONGITUD_MINIMA_INCRUSTADO} a ${LONGITUD_MAXIMA_INCRUSTADO} dígitos; recomendado ${LONGITUD_MAXIMA_INCRUSTADO}).`);
  console.log('Quedará como el ÚNICO PIN válido del panel del propietario en todo el sistema, y se guarda solo su verificador.\n');
  if (CREDENCIAL_PROPIETARIO) {console.log('Ya hay un PIN incrustado: este reemplazará al anterior.\n');}
  const pin = await pedirOculto('Nuevo PIN: ');
  const problema = validarPinParaIncrustar(pin);
  if (problema) {salir(`PIN rechazado: ${problema}`);}
  const repetido = await pedirOculto('Repite el PIN: ');
  if (repetido !== pin) {salir('Los dos PIN no coinciden. No se cambió nada.');}

  console.log('Calculando el verificador…');
  const credencial = await crearCredencial(pin);
  if (!(await verificarCredencial(pin, credencial))) {salir('Error interno: el verificador no valida el PIN. No se cambió nada.');}
  reescribirCredencial(ARCHIVO, credencial);
  console.log(`\n✔ PIN incrustado en src/lib/propietario.ts (verificador scrypt de ${credencial.longitud} dígitos).`);
  console.log('Siguientes pasos:');
  console.log('  1. Comprueba que lo recuerdas:  npm run propietario:pin -- --verificar');
  console.log('  2. Recompila y despliega el servidor; para las apps de escritorio, genera un instalador nuevo.');
  console.log('  3. Desde entonces el OWNER_PIN del entorno y el PIN guardado en la base dejan de valer para el panel del propietario.');
  console.log('El PIN no se guardó en ningún archivo. Si lo olvidas, vuelve a ejecutar este comando para fijar otro.');
}

principal().catch((error) => salir(`Error: ${error instanceof Error ? error.message : String(error)}`));
