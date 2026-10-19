/**
 * Reescribe el bloque generado de `src/lib/propietario.ts` (entre los marcadores BEGIN/END). Separado del generador
 * para poder probarlo sobre un archivo temporal.
 */
import fs from 'node:fs';
import type { ICredencialPropietario } from '../../src/lib/propietario.js';

export const MARCA_INICIO = '// BEGIN CREDENCIAL_PROPIETARIO';
export const MARCA_FIN = '// END CREDENCIAL_PROPIETARIO';

export function bloqueDeCredencial(credencial: ICredencialPropietario | null): string {
  const cabecera = `${MARCA_INICIO} (generado por \`npm run propietario:pin\`; no editar a mano)`;
  const cuerpo = credencial === null
    ? 'export const CREDENCIAL_PROPIETARIO: ICredencialPropietario | null = null;'
    : [
      'export const CREDENCIAL_PROPIETARIO: ICredencialPropietario | null = {',
      `  version: ${credencial.version},`,
      `  longitud: ${credencial.longitud},`,
      `  sal: '${credencial.sal}',`,
      `  hash: '${credencial.hash}',`,
      `  costo: ${credencial.costo},`,
      `  bloque: ${credencial.bloque},`,
      `  paralelismo: ${credencial.paralelismo},`,
      '};',
    ].join('\n');
  return `${cabecera}\n${cuerpo}\n${MARCA_FIN}`;
}

/** Devuelve el texto con el bloque reemplazado, conservando el estilo de saltos de línea. Lanza si faltan marcadores. */
export function reemplazarBloque(original: string, credencial: ICredencialPropietario | null): string {
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  const texto = original.replace(/\r\n/g, '\n');
  const i = texto.indexOf(MARCA_INICIO);
  const j = texto.indexOf(MARCA_FIN);
  if (i === -1 || j === -1 || j < i) {throw new Error(`No encontré los marcadores ${MARCA_INICIO} / ${MARCA_FIN}.`);}
  return `${texto.slice(0, i)}${bloqueDeCredencial(credencial)}${texto.slice(j + MARCA_FIN.length)}`.replace(/\n/g, nl);
}

export function reescribirCredencial(ruta: string, credencial: ICredencialPropietario | null): void {
  fs.writeFileSync(ruta, reemplazarBloque(fs.readFileSync(ruta, 'utf8'), credencial), 'utf8');
}
