/**
 * Copias del servidor para las pruebas, SIN tocar `src/lib/propietario.ts`:
 *
 *  - `compilarBundleSinPin()`  → `bundle-pruebas.cjs`: el servidor con el PIN del propietario NEUTRALIZADO. Las pruebas
 *    automáticas (e2e, licencias, integración) lo usan para seguir entrando con `OWNER_PIN` aunque el propietario ya
 *    haya fijado su PIN real en el código (con el PIN real incrustado, ese modo no existe).
 *  - `compilarBundleConPinDePrueba()` → `bundle-pin-prueba.cjs`: el servidor con un PIN de PRUEBA incrustado, para
 *    probar de extremo a extremo el modo "PIN fijo".
 *
 * El servidor real (`bundle.cjs`, el que se despliega y se empaqueta) siempre sale del código tal cual está.
 */
import fs from 'node:fs';
import { build } from 'esbuild';
import { crearCredencial, type ICredencialPropietario } from '../../src/lib/propietario.js';
import { reemplazarBloque } from './propietario-archivo.js';

export const PIN_INCRUSTADO_DE_PRUEBA = '739405182647';

async function compilar(destino: string, credencial: ICredencialPropietario | null): Promise<string> {
  await build({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: destino,
    external: ['pg-native', 'mock-aws-s3', 'aws-sdk', 'nock'],
    logLevel: 'silent',
    plugins: [{
      name: 'pin-propietario-de-prueba',
      setup(b) {
        // El filtro de esbuild usa regex de Go: se filtra por nombre y se confirma la carpeta aquí.
        b.onLoad({ filter: /propietario\.ts$/ }, (args) => {
          if (!args.path.split('\\').join('/').endsWith('/src/lib/propietario.ts')) {return undefined;}
          return { contents: reemplazarBloque(fs.readFileSync(args.path, 'utf8'), credencial), loader: 'ts' };
        });
      },
    }],
  });
  return destino;
}

export const compilarBundleSinPin = (destino = 'bundle-pruebas.cjs'): Promise<string> => compilar(destino, null);

export async function compilarBundleConPinDePrueba(destino = 'bundle-pin-prueba.cjs'): Promise<string> {
  return compilar(destino, await crearCredencial(PIN_INCRUSTADO_DE_PRUEBA));
}
