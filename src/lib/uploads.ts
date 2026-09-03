/**
 * @file Multer (uploads de imágenes/CSV) + validación de firmas reales.
 * Puerto directo de la configuración de server.js legacy.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { httpError } from './core.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadsDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

export const uploadCsv = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    const isCsv = allowed.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv');
    callback(null, isCsv);
  },
});

/** Validación de firma real de archivos de imagen (magic bytes). */
export function esImagenValida(ruta: string): boolean {
  const fd = fs.openSync(ruta, 'r');
  try {
    const buf = Buffer.alloc(12);
    const leidos = fs.readSync(fd, buf, 0, 12, 0);
    if (leidos < 3) {return false;}
    const cabecera = buf.subarray(0, leidos);
    if (leidos >= 3 && cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff) {return true;}
    if (leidos >= 8 && cabecera.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {return true;}
    if (leidos >= 12 && cabecera.subarray(0, 4).toString('ascii') === 'RIFF' && cabecera.subarray(8, 12).toString('ascii') === 'WEBP') {return true;}
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

export function validarImagenSubida(req: Request, _res: Response, next: NextFunction): void {
  if (req.file && !esImagenValida(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch { /* noop */ }
    return next(httpError(400, 'El archivo subido no es una imagen válida (JPG, PNG o WEBP).'));
  }
  return next();
}

export function validarImagenesSubidas(req: Request, _res: Response, next: NextFunction): void {
  const files = req.files || {};
  const archivos: { path: string }[] = Array.isArray(files) ? files : Object.values(files).flat();
  for (const archivo of archivos) {
    if (!esImagenValida(archivo.path)) {
      try { fs.unlinkSync(archivo.path); } catch { /* noop */ }
      return next(httpError(400, 'El archivo subido no es una imagen válida (JPG, PNG o WEBP).'));
    }
  }
  return next();
}

export const uploadImagenesSistema = upload.fields([
  { name: 'fondo_archivo', maxCount: 1 },
  { name: 'logo_archivo', maxCount: 1 },
]);

/** URL pública de un archivo subido, respetando el protocolo real (X-Forwarded-Proto). */
export function uploadUrl(req: Request, file: { filename: string }): string {
  const host = req.get('host') || '';
  const fwd = (req.get('x-forwarded-proto') || req.get('x-forwarded-scheme') || '').split(',')[0].trim();
  const isHttps = fwd === 'https' || req.secure || /chloerestaurant\.lat$/i.test(host);
  const proto = isHttps ? 'https' : (req.protocol || 'http');
  return `${proto}://${host}/uploads/${encodeURIComponent(file.filename)}`;
}
