/**
 * @file Core Utilities
 * Universal helpers: error handling, money, validators
 */

import { Request, Response, NextFunction } from 'express';
import { IErrorResponse, IMoney } from '../types/index.js';

/**
 * Custom HTTP Error class
 */
export class HttpError extends Error {
  public details?: Record<string, unknown>;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'HTTP_ERROR'
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Factory function for HTTP errors
 */
export const httpError = (
  statusCode: number,
  message: string,
  code: string = 'HTTP_ERROR'
): HttpError => {
  return new HttpError(statusCode, message, code);
};

/**
 * Async route wrapper for error handling
 */
export const route =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (_req: Request, _res: Response, next: NextFunction): void => {
    Promise.resolve(handler(_req, _res, next)).catch(next);
  };

/**
 * Money utility class (centavos internally)
 */
export class Money implements IMoney {
  readonly centavos: number;

  private constructor(centavos: number) {
    this.centavos = centavos;
  }

  static fromAmount(amount: number): Money {
    return new Money(Math.round(amount * 100));
  }

  static fromCentavos(centavos: number): Money {
    return new Money(centavos);
  }

  toAmount(): number {
    return this.centavos / 100;
  }

  display(): string {
    return `RD$ ${(this.centavos / 100).toFixed(2)}`;
  }

  add(other: Money): Money {
    return Money.fromCentavos(this.centavos + other.centavos);
  }

  subtract(other: Money): Money {
    return Money.fromCentavos(this.centavos - other.centavos);
  }

  multiply(factor: number): Money {
    return Money.fromCentavos(Math.round(this.centavos * factor));
  }

  equals(other: Money): boolean {
    return this.centavos === other.centavos;
  }

  isGreaterThan(other: Money): boolean {
    return this.centavos > other.centavos;
  }

  isLessThan(other: Money): boolean {
    return this.centavos < other.centavos;
  }
}

/**
 * Validate Dominican RNC format
 */
export const isValidRNC = (rnc: string): boolean => {
  const clean = rnc.replace(/[^0-9]/g, '');
  return clean.length === 9 && /^\d{9}$/.test(clean);
};

/**
 * Format RNC for display (XXX-XXXXXXX-X)
 */
export const formatRNC = (rnc: string): string => {
  const clean = rnc.replace(/[^0-9]/g, '');
  if (clean.length !== 9) {
    return clean;
  }
  return `${clean.slice(0, 3)}-${clean.slice(3, 9)}-${clean.slice(9)}`;
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length <= 254;
};

/**
 * Validate 6-digit PIN
 */
export const isValidPIN = (pin: string): boolean => {
  return /^\d{6}$/.test(pin);
};

/**
 * Validate license activation key format
 * Format: CHLOE-XXXXX-XXXXX-XXXXX-XXXXX
 */
export const isValidLicenseKey = (key: string): boolean => {
  const parts = key.split('-');
  return (
    parts.length === 5 &&
    parts[0] === 'CHLOE' &&
    parts.slice(1).every(part => /^[A-Z0-9]{5}$/.test(part))
  );
};

/**
 * Safe JSON stringify (handles circular refs)
 */
export const safeStringify = (obj: unknown): string => {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  } catch {
    return String(obj);
  }
};

/**
 * Extract client IP from request
 */
export const getClientIp = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

/**
 * Generate request ID for tracing
 */
export const generateRequestId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Format error response
 */
export const formatErrorResponse = (error: unknown): IErrorResponse => {
  const timestamp = new Date().toISOString();

  if (error instanceof HttpError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      timestamp,
    };
  }

  if (error instanceof Error) {
    return {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp,
    };
  }

  return {
    success: false,
    error: 'Unknown error',
    code: 'UNKNOWN_ERROR',
    timestamp,
  };
};

/**
 * Validate required fields in object
 */
export const validateRequired = (
  obj: Record<string, unknown>,
  fields: string[]
): string | null => {
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      return `Campo requerido: ${field}`;
    }
  }
  return null;
};

/**
 * Sleep utility
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Entero positivo validado; lanza 400 si no lo es. Puerto de lib/core.js.
 */
export function positiveInteger(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw httpError(400, `${field} no es válido.`);
  }
  return numeric;
}

/**
 * Redondea a 2 decimales sin errores de coma flotante. Puerto de lib/core.js.
 */
export function money(value: unknown): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * IP del cliente desde la petición (req.ip respeta 'trust proxy'). Puerto de lib/core.js.
 */
export function clientIp(req: Request): string | null {
  return req.ip || req.socket.remoteAddress || null;
}

/**
 * Parsea una línea CSV respetando comillas dobles. Puerto de lib/core.js.
 */
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}
