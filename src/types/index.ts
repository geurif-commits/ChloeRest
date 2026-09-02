/**
 * @file Global Type Definitions
 * Shared interfaces entre Backend y API contracts
 */

export interface IUser {
  id: number;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ICuenta {
  id: number;
  mesa_id: number;
  camarero_id: number;
  estado: 'Abierta' | 'Cerrada' | 'Anulada';
  subtotal: number;
  itbis: number;
  total: number;
  fecha_apertura: string;
  fecha_cierre?: string;
  created_at: string;
  updated_at: string;
}

export interface IProducto {
  id: number;
  nombre: string;
  descripcion: string;
  precio_venta: number;
  costo_unitario: number;
  stock_actual: number;
  sku: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface IInventario {
  id: number;
  producto_id: number;
  cantidad_anterior: number;
  cantidad_nueva: number;
  motivo: 'Venta' | 'Ajuste' | 'Devolución' | 'Merma' | 'Entrada';
  usuario_id: number;
  created_at: string;
}

export interface ILicencia {
  id: number;
  clave_activacion: string;
  estado: 'Activa' | 'Expirada' | 'Cancelada';
  tipo_duracion: '7D' | '30D' | '90D' | '6M' | '1Y' | 'Vitalicia';
  fecha_expiracion?: string;
  fecha_activacion: string;
  created_at: string;
  updated_at: string;
}

export interface IReporteDGII {
  id: number;
  tipo: '606' | '607' | 'ECF';
  periodo: string;
  estado: 'Pendiente' | 'Procesado' | 'Enviado' | 'Error';
  contenido: Record<string, unknown>;
  error_mensaje?: string;
  created_at: string;
  updated_at: string;
}

export interface IErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ISuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
  timestamp: string;
}

export type UserRole =
  | 'Administrador'
  | 'Supervisor'
  | 'Cajero'
  | 'Camarero'
  | 'Cocina'
  | 'Gerente'
  | 'Propietario';

export interface IAuthPayload {
  userId: number;
  userRole: UserRole;
  empresaId: number;
  iat: number;
  exp: number;
}

export interface IRequestContext {
  userId: number;
  userRole: UserRole;
  empresaId: number;
  ip: string;
  userAgent: string;
}

export interface ILogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp: string;
  context: string;
  action: string;
  userId?: number;
  empresaId?: number;
  details?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  [key: string]: unknown;
}

export interface IDGIIResponse {
  ncf: string;
  secuencial: number;
  timestamp: string;
  validado: boolean;
}

export interface IMoney {
  centavos: number;
  display(): string;
}
