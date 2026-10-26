# Facturación electrónica (e-CF) — qué hace el sistema y qué falta del lado del negocio

Desde el **15 de noviembre de 2026** (configurable) el NCF tradicional (B01, B02, B14, B15) deja de ser válido y el sistema
solo emite comprobantes electrónicos. Hasta esa fecha se pueden usar ambos.

## Qué hace el sistema

| Tema | Comportamiento |
|------|----------------|
| Fecha de corte | `dgii_config.ecf_obligatorio_desde` (por defecto `2026-11-15`, hora de Santo Domingo). Se cambia en *Comprobantes DGII → Facturación Electrónica e-CF → «El e-CF es obligatorio desde»*. |
| Antes del corte | La caja ofrece e-CF (E32, E31, E45, E44) y NCF (B02, B01, B15, B14). Por defecto se usa B02 si hay secuencia; si no, E32. Un aviso cuenta los días que faltan. |
| Desde el corte | Cobrar con B01/B02/B14/B15 se rechaza (`NCF_NO_VALIDO`); sin tipo se emite E32; ya no se pueden registrar secuencias de NCF. |
| e-NCF | `E` + tipo (2 dígitos) + secuencial de **10 dígitos** = 13 caracteres. El rango autorizado por la DGII es inclusivo (el último número también se emite). |
| Comprador | E31, E45 y E44 exigen RNC/cédula **válidos** y razón social. E32 lo exige desde RD$ 250,000; si se escribe un documento debe ser válido. |
| Emisión | Al cobrar, el e-CF se envía al proveedor (AlgoBack v2 o MSeller). Se guardan código de seguridad, fecha de firma y estado. Si el proveedor no responde, la venta se cobra igual, el ticket sale «pendiente de validación» y un proceso reintenta cada minuto hasta que la DGII acepte o rechace. |
| Ticket | Emisor (razón social, RNC, dirección), título del tipo, e-NCF, fecha de emisión, vencimiento de la secuencia (E31/E44/E45), comprador, detalle, ITBIS, propina legal, total, forma de pago, código de seguridad, fecha de firma digital y **QR del timbre** (obligatorio en e-CF). |
| QR | Consumo menor a RD$ 250,000: `fc.dgii.gov.do/<ambiente>/ConsultaTimbreFC`; el resto: `ecf.dgii.gov.do/<ambiente>/ConsultaTimbre` (`testecf`, `certecf`, `ecf` según el ambiente). |
| Reimpresión | *Historial de facturas → imprimir* vuelve a consultar a la DGII si el e-CF aún no tenía timbre. |
| Estado fiscal | *Comprobantes DGII* muestra qué falta para facturar solo con e-CF (emisor, proveedor, ambiente, secuencias, rechazados). |

## Qué tiene que hacer el negocio (no lo puede hacer el sistema)

1. Estar habilitado como emisor electrónico ante la DGII y haber completado la **certificación** (ambiente de pruebas y certificación).
2. Tener el **certificado digital** del contribuyente cargado en el proveedor (AlgoBack: subir el `.p12` en su portal).
3. Contratar el proveedor y copiar su **API Key** en *Comprobantes DGII → Configuración* (ambiente `TEST` mientras se certifica; `PROD` al terminar).
4. Solicitar en la Oficina Virtual de la DGII los **rangos de e-NCF** (E32, E31 y los que use: E45, E44) y registrarlos en *Secuencias de comprobantes* con su fecha de vencimiento.
5. Completar los **datos del emisor** (RNC, razón social y dirección) en la misma pantalla.
6. Con el ambiente en `PROD` y las secuencias cargadas, el panel «Estado fiscal» queda en verde («Listo para e-CF»).

## Pendientes conocidos

- **Propina legal (10 %)**: la API mínima de AlgoBack (v2) no recibe un campo de propina; el e-CF se envía por el monto sin propina y el ticket la muestra aparte. Confirmar con AlgoBack/DGII si la propina debe declararse como impuesto adicional 001 dentro del e-CF.
- **Notas de crédito (E34)**: existen en el catálogo de tipos y de secuencias, pero la anulación de una factura ya emitida todavía no genera la nota de crédito electrónica (hoy `Anular` solo marca el registro local).
- **Reporte 607**: se sigue generando desde las ventas; los e-CF aceptados ya los recibe la DGII, así que conviene revisar con el contador si hay que excluirlos del 607.
- **Contingencia**: sin proveedor el comprobante queda pendiente de validar; no hay un modo de contingencia con representación impresa especial.
