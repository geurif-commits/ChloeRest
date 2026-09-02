import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRNC, normalizarRNC } from '../lib/rnc.js';

test('RNC de 9 dígitos con dígito verificador correcto', () => {
  // Construir un RNC válido de 9 dígitos: primeros 8 + dígito verificador (módulo 11)
  const base = '13100000';
  const weights = [7, 8, 9, 4, 5, 6, 7, 8];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(base[i]) * weights[i];
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
  const rnc = base + checkDigit;
  assert.equal(validarRNC(rnc), true);
});

test('RNC de 9 dígitos con dígito verificador incorrecto', () => {
  const base = '13100000';
  const weights = [7, 8, 9, 4, 5, 6, 7, 8];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(base[i]) * weights[i];
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
  const wrong = (checkDigit + 1) % 10;
  const rnc = base + wrong;
  assert.equal(validarRNC(rnc), false);
});

test('Cédula de 11 dígitos (módulo 10)', () => {
  // Cédula de ejemplo de persona física
  assert.equal(validarRNC('00100000000'), false);
});

test('RNC con formato sucio se normaliza', () => {
  assert.equal(normalizarRNC('131-000000-0'), '1310000000');
  assert.equal(normalizarRNC('abc123'), '123');
  assert.equal(normalizarRNC(''), '');
});

test('RNC inválido o vacío devuelve false', () => {
  assert.equal(validarRNC(''), false);
  assert.equal(validarRNC(null), false);
  assert.equal(validarRNC('123'), false);
  assert.equal(validarRNC('123456789012345'), false);
});
