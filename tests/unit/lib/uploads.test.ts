import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

/** PNG mínimo válido (firma real) para pasar la validación de magic bytes. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let servidor: Server;
let base: string;
let carpeta: string;

beforeAll(async () => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'chloe-uploads-'));
  process.env.UPLOADS_DIR = carpeta;
  const { uploadImagenesSistema, validarImagenesSubidas, upload, validarImagenSubida } = await import('../../../src/lib/uploads.js');
  const { errorHandler } = await import('../../../src/middleware/errorHandler.js');
  const app = express();
  app.post('/sistema', uploadImagenesSistema, validarImagenesSubidas, (req, res) => {
    const archivos = req.files as Record<string, Express.Multer.File[]>;
    res.json({ campos: Object.keys(archivos ?? {}) });
  });
  app.post('/logo', upload.single('logo_archivo'), validarImagenSubida, (req, res) => {
    res.json({ recibido: Boolean(req.file) });
  });
  app.use(errorHandler);
  await new Promise<void>((listo) => { servidor = app.listen(0, '127.0.0.1', listo); });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((listo) => servidor.close(listo));
  fs.rmSync(carpeta, { recursive: true, force: true });
});

const imagen = (relleno = 0) => new Blob([PNG, Buffer.alloc(relleno)], { type: 'image/png' });

describe('subida de imágenes del sistema (fondo y logo)', () => {
  it('acepta fondo y logo en la misma petición', async () => {
    const fd = new FormData();
    fd.append('fondo_archivo', imagen(), 'fondo.png');
    fd.append('logo_archivo', imagen(), 'logo.png');
    const resp = await fetch(`${base}/sistema`, { method: 'POST', body: fd });
    expect(resp.status).toBe(200);
    expect((await resp.json() as { campos: string[] }).campos.sort()).toEqual(['fondo_archivo', 'logo_archivo']);
  });

  it('acepta solo el fondo o solo el logo', async () => {
    for (const campo of ['fondo_archivo', 'logo_archivo']) {
      const fd = new FormData();
      fd.append(campo, imagen(), 'imagen.png');
      const resp = await fetch(`${base}/sistema`, { method: 'POST', body: fd });
      expect(resp.status).toBe(200);
    }
  });

  it('rechaza más de dos archivos o un campo desconocido con un mensaje claro', async () => {
    const fd = new FormData();
    fd.append('fondo_archivo', imagen(), 'a.png');
    fd.append('logo_archivo', imagen(), 'b.png');
    fd.append('otro_archivo', imagen(), 'c.png');
    const resp = await fetch(`${base}/sistema`, { method: 'POST', body: fd });
    expect(resp.status).toBe(400);
    const cuerpo = await resp.json() as { code: string; error: string };
    expect(cuerpo.code).toBe('UPLOAD_INVALID');
    expect(cuerpo.error).toMatch(/campo|archivos/i);
  });

  it('dice que la imagen pesa demasiado (más de 5 MB) en vez de un error genérico', async () => {
    const fd = new FormData();
    fd.append('logo_archivo', imagen(5 * 1024 * 1024 + 10), 'grande.png');
    const resp = await fetch(`${base}/sistema`, { method: 'POST', body: fd });
    expect(resp.status).toBe(400);
    const cuerpo = await resp.json() as { error: string };
    expect(cuerpo.error).toMatch(/5 MB/);
  });

  it('el logo del negocio sigue admitiendo un único archivo', async () => {
    const fd = new FormData();
    fd.append('logo_archivo', imagen(), 'logo.png');
    const resp = await fetch(`${base}/logo`, { method: 'POST', body: fd });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ recibido: true });
  });
});
