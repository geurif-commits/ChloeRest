/**
 * @file Roles del sistema (constantes ROLES_* de server.js legacy)
 */

import { UserRole } from '../types/index.js';

export const ROLES_OPERACION: readonly UserRole[] = ['Administrador', 'Cajero', 'Camarero', 'Capitán de Camareros'];
export const ROLES_USUARIO: readonly UserRole[] = [...ROLES_OPERACION, 'Cocina', 'Bar'];
export const ROLES_CAJA: readonly UserRole[] = ['Administrador', 'Cajero'];
export const ROLES_ADMIN: readonly UserRole[] = ['Administrador'];
