/**
 * Prepara el negocio de demostración dentro del entorno de prueba (solo local):
 * nombre ChloeRestaurant, administrador con PIN 000000 y sin cambio de PIN forzado.
 * Uso:  npx tsx marketing/video/preparar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { abrirBase, leerEnv } from '../../scripts/lib/entorno-prueba.mjs';
import { hashPin } from '../../src/services/authService.ts';

const estado = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'chloe-entorno-prueba', 'estado.json'), 'utf8'));
const empresaId = Number(estado.licencia.empresaId);
const bd = await abrirBase(leerEnv(), estado.servidor.baseDatos);
try {
  const u = await bd.query("UPDATE usuarios SET pin_hash = $1, pin = NULL, nombre = $2, requiere_cambio_pin = FALSE WHERE rol = 'Administrador' AND empresa_id = $3 RETURNING id, nombre", [hashPin('000000'), 'Chloe Martínez', empresaId]);
  const n = await bd.query(
    `UPDATE negocio_config SET nombre_comercial = 'ChloeRestaurant', razon_social = 'Chloe Restaurant SRL', rnc = '131234567',
       telefono = '809-555-0142', direccion = 'Av. George Washington #214, Malecón', provincia = 'Distrito Nacional',
       propietario = 'Chloe Martínez', email = 'hola@chloerestaurant.lat' WHERE empresa_id = $1 RETURNING id`, [empresaId]);
  const c = await bd.query("UPDATE configuracion_sistema SET nombre_negocio = 'ChloeRestaurant', setup_completado = TRUE WHERE empresa_id = $1 RETURNING id", [empresaId]);
  console.log(`empresa ${empresaId}: admin=${u.rowCount} negocio_config=${n.rowCount} configuracion_sistema=${c.rowCount}`);
} finally { await bd.end(); }
