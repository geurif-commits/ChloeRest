import { hashPin } from './auth.js';
import { config } from './config.js';
import crypto from 'node:crypto';

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
}, {
  id: '016_colores_mesa_configurables',
  sql: `
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS mesa_color_disponible VARCHAR(20) NOT NULL DEFAULT '#00f576';
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS mesa_color_ocupada VARCHAR(20) NOT NULL DEFAULT '#ff4444';
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS mesa_color_reservada VARCHAR(20) NOT NULL DEFAULT '#d6a44d';
`,

}, {
  id: '018_owner_pin_hash',
  sql: `
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS owner_pin_hash VARCHAR(200);
  `,
}, {
  id: '019_negocio_comanda_ticket_y_pin_length',
  sql: `
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS owner_pin_longitud INTEGER NOT NULL DEFAULT 6;

    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS comanda_modo VARCHAR(20) NOT NULL DEFAULT 'kds';
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS ticket_font_family VARCHAR(50) NOT NULL DEFAULT 'Inter';
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS ticket_font_size VARCHAR(10) NOT NULL DEFAULT '12';
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS ticket_logo_position VARCHAR(20) NOT NULL DEFAULT 'top';
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS ticket_show_qr BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE negocio_config ADD COLUMN IF NOT EXISTS ticket_margin VARCHAR(20) NOT NULL DEFAULT 'normal';
  `,
}, {
  id: '020_normalizar_uploads_https',
  sql: `
    DO $$
    BEGIN
      BEGIN
        UPDATE configuracion_sistema SET logo_url = REPLACE(logo_url,'http://','https://') WHERE logo_url LIKE 'http://%';
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        UPDATE configuracion_sistema SET fondo_login_url = REPLACE(fondo_login_url,'http://','https://') WHERE fondo_login_url LIKE 'http://%';
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        UPDATE negocio_config SET logo_url = REPLACE(logo_url,'http://','https://') WHERE logo_url LIKE 'http://%';
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        UPDATE productos SET imagen_url = REPLACE(imagen_url,'http://','https://') WHERE imagen_url LIKE 'http://%';
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        UPDATE categorias SET imagen_url = REPLACE(imagen_url,'http://','https://') WHERE imagen_url LIKE 'http://%';
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END $$;
  `,
}, {
  id: '021_login_apariencia_premium',
  sql: `
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS login_theme VARCHAR(30) NOT NULL DEFAULT 'chef_noir';
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS color_acento VARCHAR(20);
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS fondo_tipo VARCHAR(20) NOT NULL DEFAULT 'imagen';
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS fondo_color VARCHAR(20);
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS fondo_gradiente VARCHAR(250);
    ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS fondo_blur INTEGER NOT NULL DEFAULT 0;
  `,
}, {
  id: '022_ecf_algoback',
  sql: `
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS proveedor_ecf VARCHAR(50) NOT NULL DEFAULT 'algoback';
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS algoback_api_key TEXT;
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS algoback_url TEXT NOT NULL DEFAULT 'https://api-dgii.algoback.com/ecf/procesar-factura';
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS algoback_ambiente VARCHAR(20) NOT NULL DEFAULT 'TEST';

    CREATE TABLE IF NOT EXISTS e_cf_comprobantes (
      id BIGSERIAL PRIMARY KEY,
      cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
      tipo_cf VARCHAR(5) NOT NULL,
      ncf VARCHAR(50) NOT NULL,
      track_id VARCHAR(100),
      estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
      rnc_emisor VARCHAR(20),
      rnc_receptor VARCHAR(20),
      monto_total NUMERIC(12,2),
      fecha_emision TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      enviado_en TIMESTAMP,
      respuesta_json JSONB,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_e_cf_comprobantes_cuenta ON e_cf_comprobantes(cuenta_id);
    CREATE INDEX IF NOT EXISTS idx_e_cf_comprobantes_track ON e_cf_comprobantes(track_id);
    CREATE INDEX IF NOT EXISTS idx_e_cf_comprobantes_estado ON e_cf_comprobantes(estado);
  `},
{ id: '023_dgii_ecf_completo', sql: `
    ALTER TABLE productos ADD COLUMN IF NOT EXISTS tasa_itbis NUMERIC(5,2) NOT NULL DEFAULT 18;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS ambiente VARCHAR(20) DEFAULT 'TEST';
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS fecha_limite_emision TIMESTAMP;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS tipo_emision INTEGER DEFAULT 1;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS codigo_seguridad VARCHAR(100);
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS qr_url TEXT;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS xml_firmado TEXT;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS ncf_modificado VARCHAR(50);
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS tipo_pago INTEGER DEFAULT 1;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS monto_exento NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS monto_gravado NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS total_itbis NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE e_cf_comprobantes ADD COLUMN IF NOT EXISTS total_propina NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS direccion_emisor TEXT;
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS telefono_emisor VARCHAR(30);
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS email_emisor VARCHAR(200);
    ALTER TABLE dgii_config ADD COLUMN IF NOT EXISTS regimen_fiscal VARCHAR(100) DEFAULT 'Ordinario';
  `},
  {
    id: '024_multiempresa_segura',
    sql: `
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        slug VARCHAR(120) NOT NULL UNIQUE,
        estado VARCHAR(20) NOT NULL DEFAULT 'Activa',
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS licencias (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        clave_hash CHAR(64) NOT NULL UNIQUE,
        duracion_codigo VARCHAR(20) NOT NULL,
        activa BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        activada_en TIMESTAMP
      );
      INSERT INTO empresas (id, nombre, slug)
      VALUES (1, 'LEGACY', 'legacy')
      ON CONFLICT (id) DO NOTHING;
      SELECT setval(pg_get_serial_sequence('empresas', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM empresas), 1), true);

      DO $$
      DECLARE tabla TEXT;
      BEGIN
        FOREACH tabla IN ARRAY ARRAY[
          'usuarios', 'productos', 'ingredientes', 'clientes_frecuentes', 'mesas',
          'cuentas', 'cuenta_detalles', 'negocio_config', 'menu_categorias',
          'menu_guarniciones', 'menu_terminos', 'auditoria_operaciones',
          'receta_productos', 'dgii_secuencias', 'inventario_movimientos',
          'app_sessions', 'aperturas_caja', 'arqueos_caja', 'dgii_config',
          'configuracion_sistema', 'cuentas_bancarias', 'historial_cierres',
          'dispositivos', 'e_cf_comprobantes'
        ] LOOP
          IF to_regclass(tabla) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)', tabla);
            EXECUTE format('UPDATE %I SET empresa_id = 1 WHERE empresa_id IS NULL', tabla);
            EXECUTE format('ALTER TABLE %I ALTER COLUMN empresa_id SET DEFAULT NULLIF(current_setting(''app.empresa_id'', true), '''')::INTEGER', tabla);
            EXECUTE format('ALTER TABLE %I ALTER COLUMN empresa_id SET NOT NULL', tabla);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (empresa_id)', 'idx_' || tabla || '_empresa', tabla);
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabla);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabla);
            EXECUTE format('DROP POLICY IF EXISTS aislamiento_empresa ON %I', tabla);
            EXECUTE format('CREATE POLICY aislamiento_empresa ON %I USING (current_setting(''app.platform'', true) = ''true'' OR empresa_id = NULLIF(current_setting(''app.empresa_id'', true), '''')::INTEGER) WITH CHECK (current_setting(''app.platform'', true) = ''true'' OR empresa_id = NULLIF(current_setting(''app.empresa_id'', true), '''')::INTEGER)', tabla);
          END IF;
        END LOOP;
      END $$;
      ALTER TABLE configuracion_sistema DROP CONSTRAINT IF EXISTS uq_configuracion_sistema_unica;
      CREATE SEQUENCE IF NOT EXISTS configuracion_sistema_id_seq;
      SELECT setval('configuracion_sistema_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM configuracion_sistema), 1), true);
      ALTER TABLE configuracion_sistema ALTER COLUMN id SET DEFAULT nextval('configuracion_sistema_id_seq');
    `,
  },
  {
    id: '025_sesiones_vinculadas_dispositivo',
    sql: `
      ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);
      CREATE INDEX IF NOT EXISTS idx_app_sessions_device ON app_sessions(device_id);
    `,
  },
  {
    id: '026_pin_temporal_por_licencia',
    sql: `
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS requiere_cambio_pin BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE licencias ADD COLUMN IF NOT EXISTS admin_pin_hash TEXT;
      CREATE INDEX IF NOT EXISTS idx_licencias_empresa_activa ON licencias(empresa_id, activa);
    `,
  },
  {
    id: '027_clave_por_solicitud',
    sql: `
      ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS clave_generada VARCHAR(100);
      ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS clave_pin_inicial VARCHAR(10);
      ALTER TABLE solicitudes_licencia ADD COLUMN IF NOT EXISTS clave_enviada_en TIMESTAMP;
    `,
  },
  {
    id: '028_producto_propina_itbis_flags',
    sql: `
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS aplica_itbis BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS aplica_propina BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS tasa_propina NUMERIC(5,2) NOT NULL DEFAULT 10;
    `,
  },
  {
    id: '029_cuenta_detalles_notas_guarnicion_termino',
    sql: `
      ALTER TABLE cuenta_detalles ADD COLUMN IF NOT EXISTS notas TEXT;
      ALTER TABLE cuenta_detalles ADD COLUMN IF NOT EXISTS guarnicion VARCHAR(100);
      ALTER TABLE cuenta_detalles ADD COLUMN IF NOT EXISTS termino VARCHAR(100);
      CREATE TABLE IF NOT EXISTS menu_guarniciones (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL UNIQUE,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS menu_terminos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL UNIQUE,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: '030_producto_tipo_destino_clasificacion',
    sql: `
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_destino VARCHAR(20) NOT NULL DEFAULT 'cocina';
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_plato VARCHAR(30) NOT NULL DEFAULT 'plato_fuerte';
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_entrada BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_postre BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_guarnicion BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    id: '031_producto_campos_adicionales_completos',
    sql: `
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_plato_fuerte BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS requiere_guarnicion BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS requiere_termino BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_destino VARCHAR(20) NOT NULL DEFAULT 'cocina';
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_plato VARCHAR(30) NOT NULL DEFAULT 'plato_fuerte';
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_entrada BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_postre BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_guarnicion BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    id: '032_menu_categorias_table_garantizada',
    sql: `
      CREATE TABLE IF NOT EXISTS menu_categorias (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        nombre VARCHAR(120) NOT NULL,
        grupo VARCHAR(20) NOT NULL DEFAULT 'alimentos',
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_menu_categorias_nombre UNIQUE (nombre)
      );
      CREATE TABLE IF NOT EXISTS menu_guarniciones (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_menu_guarniciones_nombre UNIQUE (nombre)
      );
      CREATE TABLE IF NOT EXISTS menu_terminos (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        nombre VARCHAR(120) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_menu_terminos_nombre UNIQUE (nombre)
      );
    `,
  },
  {
    id: '033_add_column_activo_and_empresa_id_to_menu_tables',
    sql: `
      ALTER TABLE menu_categorias ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE menu_categorias ADD COLUMN IF NOT EXISTS empresa_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE menu_categorias ADD COLUMN IF NOT EXISTS grupo VARCHAR(20) NOT NULL DEFAULT 'alimentos';
      ALTER TABLE menu_categorias ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE menu_guarniciones ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE menu_guarniciones ADD COLUMN IF NOT EXISTS empresa_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE menu_guarniciones ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE menu_terminos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE menu_terminos ADD COLUMN IF NOT EXISTS empresa_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE menu_terminos ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_categorias_nombre') THEN
          ALTER TABLE menu_categorias ADD CONSTRAINT uq_menu_categorias_nombre UNIQUE (nombre);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_guarniciones_nombre') THEN
          ALTER TABLE menu_guarniciones ADD CONSTRAINT uq_menu_guarniciones_nombre UNIQUE (nombre);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_terminos_nombre') THEN
          ALTER TABLE menu_terminos ADD CONSTRAINT uq_menu_terminos_nombre UNIQUE (nombre);
        END IF;
      END $$;
    `,
  },
  {
    id: '034_fix_unique_constraints_menu_multitenant',
    sql: `
      DO $$
      BEGIN
        ALTER TABLE menu_categorias DROP CONSTRAINT IF EXISTS uq_menu_categorias_nombre;
        ALTER TABLE menu_guarniciones DROP CONSTRAINT IF EXISTS uq_menu_guarniciones_nombre;
        ALTER TABLE menu_terminos DROP CONSTRAINT IF EXISTS uq_menu_terminos_nombre;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_categorias_empresa_nombre') THEN
          ALTER TABLE menu_categorias ADD CONSTRAINT uq_menu_categorias_empresa_nombre UNIQUE (empresa_id, nombre);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_guarniciones_empresa_nombre') THEN
          ALTER TABLE menu_guarniciones ADD CONSTRAINT uq_menu_guarniciones_empresa_nombre UNIQUE (empresa_id, nombre);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_terminos_empresa_nombre') THEN
          ALTER TABLE menu_terminos ADD CONSTRAINT uq_menu_terminos_empresa_nombre UNIQUE (empresa_id, nombre);
        END IF;
      END $$;
    `,
  },
  {
    id: '035_licencias_campos_gestion',
    sql: `
      ALTER TABLE licencias ADD COLUMN IF NOT EXISTS clave_texto VARCHAR(255);
      ALTER TABLE licencias ADD COLUMN IF NOT EXISTS revocada BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE licencias ADD COLUMN IF NOT EXISTS motivo_revocacion TEXT;
      ALTER TABLE licencias ADD COLUMN IF NOT EXISTS vencimiento TIMESTAMP;
    `,
  },
];
export async function runMigrations(pool) {
  const client = await (pool.connectUnscoped ? pool.connectUnscoped() : pool.connect());
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (id VARCHAR(100) PRIMARY KEY, ejecutada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

    // Establecer contexto de plataforma INMEDIATAMENTE para que todas las queries
    // internas del runner puedan atravesar RLS sin restricciones de empresa.
    // Obligatorio desde que migration 024 habilitó Row Level Security en todas las tablas.
    await client.query("SELECT set_config('app.platform', 'true', false), set_config('app.empresa_id', '1', false)");
    
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

    // Las tareas de backfill son internas y deben atravesar RLS sin heredar un
    // contexto de una conexión de aplicación.
    await client.query("SELECT set_config('app.empresa_id', '1', false), set_config('app.platform', 'true', false)");

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
        // empresa_id=1 es LEGACY: la empresa raíz del sistema.
        // Las demás empresas crean su admin exclusivamente en el Wizard Setup.
        `INSERT INTO usuarios (empresa_id, nombre, rol, pin, pin_hash, estado)
         VALUES (1, 'Administrador Sistema', 'Administrador', NULL, $1, 'Activo')`,
        [hashPin(pinInicial)]
      );
      console.log('[migrations] Admin inicial empresa LEGACY creado. PIN temporal:', pinInicial);
    } else {
      console.log(`✅ ${users.rows[0].total} usuario(s) activo(s) verificados. PINes preservados.`);
    }

    // Asegurar que exista la fila de configuración base
    await client.query(`
      INSERT INTO configuracion_sistema (id, empresa_id, nombre_negocio, tema_activo, estilo_login, setup_completado)
      VALUES (1, 1, 'Chloe Restaurant', 'noche', 'moderno', FALSE)
      ON CONFLICT (id) DO NOTHING
    `);

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
      const claveHash = crypto.createHash('sha256').update(config.licenseActivationKey).digest('hex');
      await client.query(
        `INSERT INTO licencias (empresa_id, clave_hash, duracion_codigo, activa)
         VALUES (1, $1, 'L', TRUE) ON CONFLICT (clave_hash) DO NOTHING`,
        [claveHash],
      );
    }
    // El PIN del dueño LEGACY es independiente de los datos de prueba y no
    // debe quedar vacío después de un reset o una instalación antigua.
    if (config.ownerPin) {
      const owner = await client.query('SELECT owner_pin_hash FROM configuracion_sistema WHERE id = 1');
      if (owner.rowCount && !owner.rows[0].owner_pin_hash) {
        await client.query(
          'UPDATE configuracion_sistema SET owner_pin_hash = $1, owner_pin_longitud = $2 WHERE id = 1',
          [hashPin(config.ownerPin), String(config.ownerPin).length],
        );
      }
    }
    await client.query(
      `UPDATE dispositivos SET empresa_id = 1 WHERE empresa_id IS NULL;
       UPDATE app_sessions s SET empresa_id = u.empresa_id FROM usuarios u WHERE s.usuario_id = u.id AND s.empresa_id IS DISTINCT FROM u.empresa_id;
       UPDATE licencias SET activada_en = COALESCE(activada_en, CURRENT_TIMESTAMP) WHERE empresa_id = 1 AND activa = TRUE`,
    );
  } finally {
    client.release();
  }
}
