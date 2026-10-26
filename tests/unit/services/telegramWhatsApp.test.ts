import { describe, expect, it } from 'vitest';
import { numeroParaWhatsApp, telefonoConWhatsApp } from '../../../src/services/telegramBotService.js';

describe('numeroParaWhatsApp', () => {
  it('convierte los formatos dominicanos más comunes al número internacional', () => {
    for (const [escrito, esperado] of [
      ['809-555-1234', '18095551234'],
      ['(829) 555 1234', '18295551234'],
      ['8495551234', '18495551234'],
      ['809.555.1234', '18095551234'],
      ['1-809-555-1234', '18095551234'],
      ['18095551234', '18095551234'],
      ['+1 809 555 1234', '18095551234'],
      ['+1 (829) 555-1234', '18295551234'],
      ['  809 555 1234  ', '18095551234'],
    ]) {
      expect(numeroParaWhatsApp(escrito)).toBe(esperado);
    }
  });

  it('respeta los números de otros países cuando traen su código', () => {
    expect(numeroParaWhatsApp('+34 600 123 456')).toBe('34600123456');
    expect(numeroParaWhatsApp('0034600123456')).toBe('34600123456');
    expect(numeroParaWhatsApp('+58 412 1234567')).toBe('584121234567');
  });

  it('no inventa enlaces cuando no se puede deducir el número', () => {
    for (const dudoso of ['', '   ', null, undefined, 'sin teléfono', '555-1234', '12345', '809 555', '8095551234 / 8295551234', '+0 123']) {
      expect(numeroParaWhatsApp(dudoso)).toBeNull();
    }
  });
});

describe('telefonoConWhatsApp', () => {
  it('deja el teléfono tal cual lo escribió el cliente, como enlace que abre un chat nuevo en WhatsApp', () => {
    expect(telefonoConWhatsApp('809-555-1234')).toBe('<a href="https://wa.me/18095551234">809-555-1234</a>');
    expect(telefonoConWhatsApp(' +1 (829) 555-1234 ')).toBe('<a href="https://wa.me/18295551234">+1 (829) 555-1234</a>');
  });

  it('el enlace solo lleva dígitos: nada de lo que escriba el cliente puede salirse del href', () => {
    const html = telefonoConWhatsApp('809"><script>alert(1)</script> 555 1234');
    expect(html).not.toContain('<script>');
    expect(html).toMatch(/^<a href="https:\/\/wa\.me\/\d+">/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('sin número utilizable muestra el texto escapado y sin enlace', () => {
    expect(telefonoConWhatsApp('555-1234')).toBe('555-1234');
    expect(telefonoConWhatsApp('llamar <hoy> & mañana')).toBe('llamar &lt;hoy&gt; &amp; mañana');
    expect(telefonoConWhatsApp(null)).toBe('');
  });
});
