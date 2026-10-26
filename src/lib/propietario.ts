/**
 * @file PIN del propietario de la plataforma INCRUSTADO en el código fuente.
 *
 * Lo que va en el código NO es el PIN sino su verificador: una derivación `scrypt` con sal propia. Así el sistema
 * reconoce siempre al propietario, en cualquier instalación (servidor central y apps de escritorio), sin que el PIN
 * aparezca escrito en ninguna parte. Cuando existe, esta credencial PREVALECE: es la única que abre el panel del
 * propietario; el `OWNER_PIN` del entorno y el PIN guardado en la base se ignoran, y nadie puede crear ni cambiar un
 * PIN de propietario desde la interfaz (ver `propietarioService.ts`).
 *
 * Como el verificador viaja dentro de cada instalador, quien lo extraiga puede intentar adivinar el PIN sin conexión.
 * Por eso se exige un PIN largo (10 a 12 dígitos, sin patrones) y un `scrypt` costoso: con 12 dígitos la búsqueda es
 * impracticable. Se genera con `npm run propietario:pin` (pide el PIN sin mostrarlo); no se edita a mano.
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

export interface ICredencialPropietario {
  version: 1;
  /** Dígitos del PIN (el teclado de acceso se envía solo al completarlos). */
  longitud: number;
  /** Sal aleatoria de 16 bytes, base64url. */
  sal: string;
  /** Derivación scrypt de 64 bytes, base64url. */
  hash: string;
  costo: number;
  bloque: number;
  paralelismo: number;
}

export const LONGITUD_MINIMA_INCRUSTADO = 10;
export const LONGITUD_MAXIMA_INCRUSTADO = 12;
/** 32768 × 8 × 128 B = 32 MiB por verificación (≈100 ms): costoso para quien adivina, llevadero para un login. */
export const PARAMETROS_KDF = { costo: 32768, bloque: 8, paralelismo: 1, largo: 64 } as const;

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

// BEGIN CREDENCIAL_PROPIETARIO (generado por `npm run propietario:pin`; no editar a mano)
export const CREDENCIAL_PROPIETARIO: ICredencialPropietario | null = null;
// END CREDENCIAL_PROPIETARIO

function derivar(pin: string, sal: Buffer, c: Pick<ICredencialPropietario, 'costo' | 'bloque' | 'paralelismo'>): Promise<Buffer> {
  return scrypt(pin, sal, PARAMETROS_KDF.largo, {
    N: c.costo,
    r: c.bloque,
    p: c.paralelismo,
    maxmem: 256 * c.costo * c.bloque,
  });
}

/** Crea el verificador de un PIN (lo usa el generador; el PIN debe haber pasado `validarPinParaIncrustar`). */
export async function crearCredencial(pin: string): Promise<ICredencialPropietario> {
  const sal = crypto.randomBytes(16);
  const credencial = {
    version: 1 as const,
    longitud: pin.length,
    sal: sal.toString('base64url'),
    costo: PARAMETROS_KDF.costo,
    bloque: PARAMETROS_KDF.bloque,
    paralelismo: PARAMETROS_KDF.paralelismo,
  };
  const hash = (await derivar(pin, sal, credencial)).toString('base64url');
  return { ...credencial, hash };
}

/** Comparación en tiempo constante del PIN contra un verificador. Un PIN de otra longitud ni se calcula. */
export async function verificarCredencial(pin: string, credencial: ICredencialPropietario | null): Promise<boolean> {
  if (!credencial || typeof pin !== 'string' || pin.length !== credencial.longitud || !/^\d+$/.test(pin)) {return false;}
  const esperado = Buffer.from(credencial.hash, 'base64url');
  const actual = await derivar(pin, Buffer.from(credencial.sal, 'base64url'), credencial);
  return esperado.length === actual.length && crypto.timingSafeEqual(esperado, actual);
}

/**
 * Reglas del PIN que se incrusta. Devuelve el motivo del rechazo, o null si es aceptable.
 * Rechaza lo que cualquiera probaría primero (repeticiones, escaleras, bloques repetidos).
 */
export function validarPinParaIncrustar(pin: string): string | null {
  if (!/^\d+$/.test(pin)) {return 'Solo se admiten dígitos.';}
  if (pin.length < LONGITUD_MINIMA_INCRUSTADO || pin.length > LONGITUD_MAXIMA_INCRUSTADO) {
    return `Debe tener entre ${LONGITUD_MINIMA_INCRUSTADO} y ${LONGITUD_MAXIMA_INCRUSTADO} dígitos (recomendado: ${LONGITUD_MAXIMA_INCRUSTADO}). Un PIN corto se descifraría en horas a partir del verificador que viaja en el instalador.`;
  }
  if (/^(\d)\1+$/.test(pin)) {return 'No puede ser un mismo dígito repetido.';}
  const pasos = [...pin].slice(1).map((d, i) => (Number(d) - Number(pin[i]) + 10) % 10);
  if (pasos.every((p) => p === 1) || pasos.every((p) => p === 9)) {return 'No puede ser una escalera (123456…/…654321).';}
  if (/^(\d{1,6})\1+$/.test(pin)) {return 'No puede ser un bloque repetido (por ejemplo 123456123456).';}
  if (new Set(pin).size < 4) {return 'Usa más variedad de dígitos (al menos 4 distintos).';}
  return null;
}

// El generador reescribe la constante de arriba; estas funciones la leen sin que TypeScript la reduzca a `null`.
const credencialIncrustada = (): ICredencialPropietario | null => CREDENCIAL_PROPIETARIO as ICredencialPropietario | null;

export const pinPropietarioIncrustado = (): boolean => credencialIncrustada() !== null;

export const longitudPinPropietarioIncrustado = (): number | null => credencialIncrustada()?.longitud ?? null;

export const verificarPinPropietarioIncrustado = (pin: string): Promise<boolean> => verificarCredencial(pin, credencialIncrustada());
