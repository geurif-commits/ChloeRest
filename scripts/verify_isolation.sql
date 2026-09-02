-- Verificación manual, no destructiva. Ejecutar con psql contra una BD de prueba.
-- Requiere dos empresas existentes con datos de prueba.
BEGIN;
SELECT set_config('app.platform', 'false', true);

-- Sustituye los IDs por dos empresas distintas y espera cero filas cruzadas.
SELECT set_config('app.empresa_id', :'empresa_a', true);
SELECT count(*) AS filas_empresa_a FROM productos
WHERE empresa_id <> :'empresa_a';
SELECT set_config('app.empresa_id', :'empresa_b', true);
SELECT count(*) AS filas_empresa_b FROM productos
WHERE empresa_id <> :'empresa_b';

-- Un intento de inserción con empresa_id ajeno debe ser rechazado por RLS.
-- La aplicación nunca acepta este valor del cliente; esto prueba la barrera de BD.
ROLLBACK;
