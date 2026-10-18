import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CREDENCIAL_PROPIETARIO,
  crearCredencial,
  pinPropietarioIncrustado,
  validarPinParaIncrustar,
  verificarCredencial,
} from '../../../src/lib/propietario.js';
import { bloqueDeCredencial, reemplazarBloque } from '../../../scripts/lib/propietario-archivo.js';

const PIN = '739405182647';
const FUENTE = path.resolve(process.cwd(), 'src', 'lib', 'propietario.ts');

describe('validarPinParaIncrustar', () => {
  it('acepta PIN de 10 a 12 dígitos con variedad', () => {
    for (const bueno of [PIN, '9274016385', '580129347615']) {expect(validarPinParaIncrustar(bueno)).toBeNull();}
  });

  it('rechaza lo corto, lo largo y lo que no son dígitos', () => {
    expect(validarPinParaIncrustar('123456')).toMatch(/entre 10 y 12/);
    expect(validarPinParaIncrustar('73940518264')).toBeNull();
    expect(validarPinParaIncrustar('7394051826471')).toMatch(/entre 10 y 12/);
    expect(validarPinParaIncrustar('73940518a647')).toMatch(/dígitos/);
    expect(validarPinParaIncrustar('')).toMatch(/dígitos|entre/);
  });

  it('rechaza repeticiones, escaleras y bloques repetidos', () => {
    expect(validarPinParaIncrustar('111111111111')).toMatch(/repetido/);
    expect(validarPinParaIncrustar('012345678901')).toMatch(/escalera/);
    expect(validarPinParaIncrustar('987654321098')).toMatch(/escalera/);
    expect(validarPinParaIncrustar('123456123456')).toMatch(/bloque repetido/);
    expect(validarPinParaIncrustar('121212121212')).toMatch(/bloque repetido/);
    expect(validarPinParaIncrustar('1212121213')).toMatch(/variedad/);
  });
});

describe('credencial del propietario (scrypt salado)', () => {
  it('verifica el PIN correcto y rechaza cualquier otro', async () => {
    const credencial = await crearCredencial(PIN);
    expect(credencial).toMatchObject({ version: 1, longitud: 12, costo: 32768, bloque: 8, paralelismo: 1 });
    expect(await verificarCredencial(PIN, credencial)).toBe(true);
    expect(await verificarCredencial('739405182648', credencial)).toBe(false);
    expect(await verificarCredencial('73940518264', credencial)).toBe(false);
    expect(await verificarCredencial('7394051826470', credencial)).toBe(false);
    expect(await verificarCredencial('73940518264x', credencial)).toBe(false);
    expect(await verificarCredencial('', credencial)).toBe(false);
  });

  it('nunca guarda el PIN y usa una sal distinta cada vez', async () => {
    const a = await crearCredencial(PIN);
    const b = await crearCredencial(PIN);
    expect(JSON.stringify(a)).not.toContain(PIN);
    expect(a.sal).not.toBe(b.sal);
    expect(a.hash).not.toBe(b.hash);
    expect(Buffer.from(a.hash, 'base64url')).toHaveLength(64);
    expect(Buffer.from(a.sal, 'base64url')).toHaveLength(16);
  });

  it('sin credencial no valida nada', async () => {
    expect(await verificarCredencial(PIN, null)).toBe(false);
  });

  it('un verificador alterado (otra sal o hash) deja de validar', async () => {
    const credencial = await crearCredencial(PIN);
    const otra = await crearCredencial(PIN);
    expect(await verificarCredencial(PIN, { ...credencial, sal: otra.sal })).toBe(false);
    expect(await verificarCredencial(PIN, { ...credencial, hash: otra.hash })).toBe(false);
  });

  it('el repositorio puede estar sin PIN incrustado o con uno bien formado', () => {
    if (!pinPropietarioIncrustado()) {
      expect(CREDENCIAL_PROPIETARIO).toBeNull();
      return;
    }
    expect(CREDENCIAL_PROPIETARIO).toMatchObject({ version: 1, costo: 32768, bloque: 8, paralelismo: 1 });
    expect(CREDENCIAL_PROPIETARIO!.longitud).toBeGreaterThanOrEqual(10);
    expect(Buffer.from(CREDENCIAL_PROPIETARIO!.hash, 'base64url')).toHaveLength(64);
  });
});

describe('reescritura del bloque generado (npm run propietario:pin)', () => {
  const original = fs.readFileSync(FUENTE, 'utf8');

  it('inserta la credencial entre los marcadores y deja intacto el resto', async () => {
    const credencial = await crearCredencial(PIN);
    const nuevo = reemplazarBloque(original, credencial);
    expect(nuevo).toContain(`sal: '${credencial.sal}'`);
    expect(nuevo).toContain(`hash: '${credencial.hash}'`);
    expect(nuevo).toContain('longitud: 12,');
    expect(nuevo).not.toContain(PIN);
    // Lo anterior y lo posterior al bloque no cambian.
    const corte = (t: string): [string, string] => [t.slice(0, t.indexOf('// BEGIN CREDENCIAL_PROPIETARIO')), t.slice(t.indexOf('// END CREDENCIAL_PROPIETARIO'))];
    expect(corte(nuevo)).toEqual(corte(original));
  });

  it('quitar la credencial devuelve el bloque al estado sin PIN y es reversible', async () => {
    const credencial = await crearCredencial(PIN);
    const con = reemplazarBloque(original, credencial);
    const sin = reemplazarBloque(con, null);
    expect(sin).toContain('export const CREDENCIAL_PROPIETARIO: ICredencialPropietario | null = null;');
    expect(reemplazarBloque(sin, credencial)).toBe(con);
  });

  it('respeta los saltos de línea CRLF y rechaza archivos sin marcadores', async () => {
    const credencial = await crearCredencial(PIN);
    const crlf = original.replace(/\r?\n/g, '\r\n');
    const resultado = reemplazarBloque(crlf, credencial);
    expect(resultado.includes('\r\n')).toBe(true);
    expect(resultado.replace(/\r\n/g, '')).not.toMatch(/\n/);
    expect(() => reemplazarBloque('export const x = 1;', credencial)).toThrow(/marcadores/);
  });

  it('el bloque generado es TypeScript con la forma esperada', async () => {
    const bloque = bloqueDeCredencial(await crearCredencial(PIN));
    expect(bloque.startsWith('// BEGIN CREDENCIAL_PROPIETARIO')).toBe(true);
    expect(bloque.endsWith('// END CREDENCIAL_PROPIETARIO')).toBe(true);
    expect(bloque).toMatch(/export const CREDENCIAL_PROPIETARIO: ICredencialPropietario \| null = \{\n(  \w+: [^\n]+,\n){7}\};/);
  });
});
