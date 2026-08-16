import { hashPin } from './auth.js';
import { config } from './config.js';

const migrations = [{
  id: '001_security_and_audit',
  sql: `
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin_hash TEXT;
    ALTER TABLE usuarios ALTER COLUMN pin DROP NOT NULL;
    ALTER TABLE cuenta_detalles ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMP;
    ALTER TABLE cuenta_detalles ADD COLUMN IF NOT EXISTS anulado_por INTEGER REFERENCES usuarios(id);
    ALTER TABLE cuenta_detalles ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
    CREATE TABLE IF NOT EXISTS auditoria_operaciones (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      accion VARCHAR(80) NOT NULL,
      entidad VARCHAR(80) NOT NULL,
      entidad_id VARCHAR(80),
      detalle JSONB,
      ip VARCHAR(100),
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_operaciones_creado_en ON auditoria_operaciones(creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_cuenta_detalles_activos ON cuenta_detalles(cuenta_id) WHERE anulado_en IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cuentas_mesa_abierta ON cuentas(mesa_id) WHERE estado = 'Abierta' AND mesa_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cuentas_ncf ON cuentas(ncf_ecf_generado) WHERE ncf_ecf_generado IS NOT NULL;
  `,
}, {
  id: '002_full_features',
  sql: `
    CREATE TABLE IF NOT EXISTS receta_productos (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
      cantidad_necesaria NUMERIC(10,4) NOT NULL CHECK (cantidad_necesaria > 0),
      CONSTRAINT uq_receta_producto_ingrediente UNIQUE(producto_id, ingrediente_id)
    );
    CREATE TABLE IF NOT EXISTS dgii_secuencias (
      id SERIAL PRIMARY KEY,
      tipo_comprobante VARCHAR(10) NOT NULL,
      prefijo VARCHAR(10) NOT NULL,
      secuencia_inicial BIGINT NOT NULL DEFAULT 1,
      secuencia_actual BIGINT NOT NULL DEFAULT 1,
      secuencia_final BIGINT NOT NULL DEFAULT 99999999,
      fecha_vencimiento DATE NOT NULL,
      activa BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id BIGSERIAL PRIMARY KEY,
      ingrediente_id INTEGER REFERENCES ingredientes(id) ON DELETE CASCADE,
      tipo_movimiento VARCHAR(20) NOT NULL,
      cantidad NUMERIC(10,4) NOT NULL,
      motivo TEXT,
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS ingrediente_id INTEGER REFERENCES ingredientes(id) ON DELETE CASCADE;
    ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS motivo TEXT;
    ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_ingrediente ON inventario_movimientos(ingrediente_id, fecha DESC);
    CREATE TABLE IF NOT EXISTS app_sessions (
      token VARCHAR(100) PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      usuario_data JSONB NOT NULL,
      expira_en TIMESTAMP NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_app_sessions_expira_en ON app_sessions(expira_en);
    CREATE TABLE IF NOT EXISTS aperturas_caja (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      monto_inicial NUMERIC(10,2) NOT NULL CHECK (monto_inicial >= 0),
      notas TEXT,
      fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      estado VARCHAR(20) NOT NULL DEFAULT 'Abierta'
    );
    CREATE INDEX IF NOT EXISTS idx_aperturas_caja_fecha ON aperturas_caja(fecha DESC);
  `,
}, {
  id: '003_divisas_y_ecf',
  sql: `
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS tasa_usd NUMERIC(10,4) DEFAULT 60.00;
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS tasa_eur NUMERIC(10,4) DEFAULT 65.00;

    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS moneda_pago VARCHAR(10) DEFAULT 'DOP';
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS monto_extranjero NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS tasa_cambio NUMERIC(10,4) DEFAULT 1;

    CREATE TABLE IF NOT EXISTS arqueos_caja (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      efectivo_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
      efectivo_contado NUMERIC(10,2) NOT NULL DEFAULT 0,
      diferencia_efectivo NUMERIC(10,2) NOT NULL DEFAULT 0,
      tarjeta_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
      tarjeta_reportado NUMERIC(10,2) NOT NULL DEFAULT 0,
      transferencia_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
      transferencia_reportado NUMERIC(10,2) NOT NULL DEFAULT 0,
      notas TEXT,
      fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS usd_contado NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS tasa_usd NUMERIC(10,4) DEFAULT 60.00;
    ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS eur_contado NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS tasa_eur NUMERIC(10,4) DEFAULT 65.00;

    CREATE TABLE IF NOT EXISTS dgii_config (
      id SERIAL PRIMARY KEY,
      rnc_emisor VARCHAR(20),
      razon_social_emisor VARCHAR(200),
      ambiente VARCHAR(20) DEFAULT 'Pruebas',
      url_servicio_dgii TEXT,
      client_id VARCHAR(250),
      client_secret VARCHAR(250),
      clave_certificado VARCHAR(250),
      estado_ecf VARCHAR(50) DEFAULT 'Pendiente de Certificación',
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,
}, {
  id: '004_personalizacion',
  sql: `
    CREATE TABLE IF NOT EXISTS configuracion_sistema (
      id INTEGER PRIMARY KEY DEFAULT 1,
      nombre_negocio VARCHAR(200),
      slogan VARCHAR(300),
      logo_url TEXT,
      fondo_login_url TEXT,
      tema_activo VARCHAR(30) DEFAULT 'noche',
      color_primario VARCHAR(20),
      color_secundario VARCHAR(20),
      opacidad_fondo NUMERIC(3,2) DEFAULT 1,
      setup_completado BOOLEAN NOT NULL DEFAULT FALSE,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_configuracion_sistema_unica CHECK (id = 1)
    );
    INSERT INTO configuracion_sistema (id, setup_completado)
    SELECT 1, FALSE WHERE NOT EXISTS (SELECT 1 FROM configuracion_sistema WHERE id = 1);
  `,
}, {
  id: '005_estilo_login',
  sql: `
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS estilo_login VARCHAR(30) NOT NULL DEFAULT 'moderno';
  `,
}, {
  id: '006_cajero_en_cuentas',
  sql: `
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS cajero_id INTEGER REFERENCES usuarios(id);
  `,
}, {
  id: '007_registro_cliente',
  sql: `
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'negocio_config') THEN
        ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS propietario VARCHAR(200);
        ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS email VARCHAR(200);
        ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS fecha_registro TIMESTAMP;
      END IF;
    END $$;
  `,
}, {
  id: '008_cuentas_bancarias',
  sql: `
    CREATE TABLE IF NOT EXISTS cuentas_bancarias (
      id SERIAL PRIMARY KEY,
      nombre_banco VARCHAR(100) NOT NULL,
      tipo_cuenta VARCHAR(30) NOT NULL DEFAULT 'Corriente',
      numero_cuenta VARCHAR(50) NOT NULL,
      titular VARCHAR(200) NOT NULL,
      activa BOOLEAN NOT NULL DEFAULT TRUE,
      orden INTEGER NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `,
}, {
  id: '009_pago_mixto',
  sql: `
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS metodo_pago_2 VARCHAR(20);
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS monto_pago_2 NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS banco_pago_2 VARCHAR(100);
  `,
}, {
  id: '010_historial_cierres',
  sql: `
    CREATE TABLE IF NOT EXISTS historial_cierres (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      usuario_nombre VARCHAR(200) NOT NULL,
      fecha_apertura TIMESTAMP NOT NULL,
      fecha_cierre TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      monto_inicial NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_ventas NUMERIC(10,2) NOT NULL DEFAULT 0,
      efectivo NUMERIC(10,2) NOT NULL DEFAULT 0,
      tarjeta NUMERIC(10,2) NOT NULL DEFAULT 0,
      transferencia NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_itbis NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_propina NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_facturas INTEGER NOT NULL DEFAULT 0,
      efectivo_contado NUMERIC(10,2) DEFAULT 0,
      diferencia_efectivo NUMERIC(10,2) DEFAULT 0,
      notas TEXT,
      detalle_json JSONB,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_historial_cierres_fecha ON historial_cierres(fecha_cierre DESC);
    CREATE INDEX IF NOT EXISTS idx_historial_cierres_usuario ON historial_cierres(usuario_id);
  `,
}, {
  id: '011_dispositivos',
  sql: `
    CREATE TABLE IF NOT EXISTS dispositivos (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(100) NOT NULL UNIQUE,
      nombre VARCHAR(200),
      navegador TEXT,
      ip VARCHAR(100),
      estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      activado_en TIMESTAMP,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ultimo_acceso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_dispositivos_estado ON dispositivos(estado);
  `,
}, {
  id: '012_planes_solicitudes_y_duracion',
  sql: `
    ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS licencia_duracion VARCHAR(20);
    ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS licencia_vencimiento TIMESTAMP;

    CREATE TABLE IF NOT EXISTS planes_licencia (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(80) NOT NULL,
      duracion_codigo VARCHAR(10) NOT NULL,
      precio NUMERIC(10,2) NOT NULL DEFAULT 0,
      moneda VARCHAR(10) NOT NULL DEFAULT 'RD$',
      destacado BOOLEAN NOT NULL DEFAULT FALSE,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      orden INTEGER NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO planes_licencia (nombre, duracion_codigo, precio, moneda, destacado, orden)
    VALUES
      ('Mensual', '30D', 29, 'RD$', FALSE, 1),
      ('Trimestral', '90D', 79, 'RD$', FALSE, 2),
      ('Semestral', '6M', 149, 'RD$', FALSE, 3),
      ('Anual', '12M', 249, 'RD$', TRUE, 4),
      ('Bianual', '24M', 449, 'RD$', FALSE, 5),
      ('Vitalicia', 'L', 499, 'RD$', FALSE, 6);

    CREATE TABLE IF NOT EXISTS solicitudes_licencia (
      id SERIAL PRIMARY KEY,
      plan_id INTEGER REFERENCES planes_licencia(id) ON DELETE SET NULL,
      plan_nombre VARCHAR(80),
      propietario VARCHAR(200) NOT NULL,
      negocio VARCHAR(200) NOT NULL,
      telefono VARCHAR(50) NOT NULL,
      email VARCHAR(200) NOT NULL,
      provincia VARCHAR(80),
      notas TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atendida_en TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_solicitudes_licencia_estado ON solicitudes_licencia(estado);
  `,
}, {
  id: '013_metodos_pago',
  sql: `
    CREATE TABLE IF NOT EXISTS metodos_pago (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      titular VARCHAR(200),
      detalle TEXT,
      dato1 VARCHAR(255),
      dato2 VARCHAR(255),
      dato3 VARCHAR(255),
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      orden INTEGER NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_metodos_pago_tipo ON metodos_pago(tipo);
  `,
}, {
  id: '014_pagos_solicitudes',
  sql: `
    ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS link_pago VARCHAR(500);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(100);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS token_pago VARCHAR(64);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS comprobante VARCHAR(255);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS pagada_en TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_solicitudes_licencia_token ON solicitudes_licencia(token_pago);
  `,
}, {
  id: '015_facturas_activacion_y_limite_dispositivos',
  sql: `
    ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS clave_activacion VARCHAR(200);
    CREATE INDEX IF NOT EXISTS idx_dispositivos_clave_activacion ON dispositivos(clave_activacion);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS numero_factura VARCHAR(30);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS monto NUMERIC(10,2);
    ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS moneda VARCHAR(10) NOT NULL DEFAULT 'RD$';
    CREATE INDEX IF NOT EXISTS idx_solicitudes_licencia_numero_factura ON solicitudes_licencia(numero_factura);
  `,
}];

export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (id VARCHAR(100) PRIMARY KEY, ejecutada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    
    // Garantizar tablas esenciales de caja independientemente del historial de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS aperturas_caja (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        monto_inicial NUMERIC(10,2) NOT NULL CHECK (monto_inicial >= 0),
        notas TEXT,
        fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(20) NOT NULL DEFAULT 'Abierta'
      );
      CREATE TABLE IF NOT EXISTS arqueos_caja (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        efectivo_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
        efectivo_contado NUMERIC(10,2) NOT NULL DEFAULT 0,
        diferencia_efectivo NUMERIC(10,2) NOT NULL DEFAULT 0,
        tarjeta_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
        tarjeta_reportado NUMERIC(10,2) NOT NULL DEFAULT 0,
        transferencia_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
        transferencia_reportado NUMERIC(10,2) NOT NULL DEFAULT 0,
        usd_contado NUMERIC(10,2) DEFAULT 0,
        tasa_usd NUMERIC(10,4) DEFAULT 60.00,
        eur_contado NUMERIC(10,2) DEFAULT 0,
        tasa_eur NUMERIC(10,4) DEFAULT 65.00,
        notas TEXT,
        fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS usd_contado NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS tasa_usd NUMERIC(10,4) DEFAULT 60.00;
      ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS eur_contado NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE arqueos_caja ADD COLUMN IF NOT EXISTS tasa_eur NUMERIC(10,4) DEFAULT 65.00;
    `);

    for (const migration of migrations) {
      const done = await client.query('SELECT 1 FROM app_migrations WHERE id = $1', [migration.id]);
      if (done.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO app_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    // Solo migrar PINs de usuarios activos (evitar reactivar usuarios eliminados)
    const legacyUsers = await client.query(`SELECT id, pin FROM usuarios WHERE pin_hash IS NULL AND pin IS NOT NULL AND pin <> '' AND estado = 'Activo'`);
    for (const user of legacyUsers.rows) await client.query('UPDATE usuarios SET pin_hash = $1, pin = NULL WHERE id = $2', [hashPin(user.pin), user.id]);

    // Solo crear administrador inicial si NO existe ningún usuario activo en el sistema
    const users = await client.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = 'Activo'");
    const esInstalacionNueva = users.rows[0].total === 0;
    if (esInstalacionNueva) {
      // Primera ejecución: crear el administrador inicial con PIN seguro (si no se proporciona uno)
      const pinInicial = config.bootstrapAdminPin || String(Math.floor(100000 + Math.random() * 900000));
      await client.query(
        `INSERT INTO usuarios (nombre, rol, pin, pin_hash, estado) VALUES ('Administrador Sistema', 'Administrador', NULL, $1, 'Activo')`,
        [hashPin(pinInicial)]
      );
      console.log('✅ Usuario Administrador inicial creado (primera ejecución). PIN temporal:', pinInicial);
    } else {
      console.log(`✅ ${users.rows[0].total} usuario(s) activo(s) verificados. PINes preservados.`);
    }

    // Configuración de personalización: instalaciones existentes quedan "completadas"
    // (no muestran el wizard); instalaciones nuevas (sin usuarios activos) muestran el wizard.
    await client.query(
      `UPDATE configuracion_sistema SET setup_completado = TRUE, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = 1 AND setup_completado = FALSE AND $1 = FALSE`,
      [esInstalacionNueva]
    );

    // Backfill histórico: los dispositivos ya activos se asumen activados con la clave maestra.
    // Así el límite de 2 dispositivos por clave también respeta a los dispositivos previos.
    if (config.licenseActivationKey) {
      await client.query(
        `UPDATE dispositivos SET clave_activacion = $1 WHERE estado = 'Activo' AND clave_activacion IS NULL`,
        [config.licenseActivationKey]
      );
    }
  } finally {
    client.release();
  }
}
