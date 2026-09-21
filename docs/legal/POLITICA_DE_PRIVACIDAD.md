# Política de Privacidad de ChloeRestaurant

> **BORRADOR — NO ES ASESORÍA LEGAL.** Base de trabajo para revisión por un abogado dominicano, conforme a la Ley núm. 172-13 sobre Protección Integral de los Datos Personales y su reglamentación. Complete los datos entre corchetes `[ ]`.

**Responsable:** [razón social], RNC [número], [dirección], [correo de contacto de privacidad].

## 1. Qué datos trata el Sistema

| Categoría | Ejemplos | Quién los ingresa |
|---|---|---|
| Datos del negocio (Cliente) | Nombre comercial, razón social, RNC, dirección, teléfono, correo, propietario | El Cliente |
| Datos de empleados | Nombre, rol, **PIN (guardado cifrado con scrypt, nunca en texto plano)**, horas de entrada/salida | El administrador del Cliente |
| Datos de operación | Mesas, pedidos, ventas, comprobantes (NCF), métodos de pago, últimos 4 dígitos y marca de tarjeta, cierres de caja | Personal del Cliente |
| Datos de clientes finales | Nombre, teléfono y RNC/cédula cuando se solicita factura con datos o pedido para llevar | Personal del Cliente |
| Datos técnicos | Identificador del equipo, dirección IP, navegador, registros de auditoría | El Sistema |

El Sistema **no almacena** el número completo de tarjetas ni sus códigos de seguridad.

## 2. Para qué se usan

Operar el Sistema (ventas, cocina, caja, inventario, turnos), emitir comprobantes y reportes fiscales, garantizar la seguridad (autenticación, bloqueo por intentos, auditoría de operaciones), gestionar licencias y prestar soporte. No se venden los datos ni se usan para publicidad de terceros.

## 3. Base de legitimación

Ejecución del contrato de licencia, cumplimiento de obligaciones legales del Cliente (fiscales y laborales) e interés legítimo de seguridad. Para datos que no se necesiten para operar (por ejemplo, marketing) se pedirá consentimiento. [Revisar con el abogado.]

## 4. Roles: responsable y encargado

Respecto de los datos de sus empleados y clientes finales, **el Cliente es el responsable del tratamiento** y el Proveedor actúa como **encargado**, solo bajo instrucciones del Cliente y para prestar el servicio. Respecto de los datos de contratación de la licencia, el Proveedor es responsable. [Anexar contrato de encargo si el abogado lo recomienda.]

## 5. Dónde se guardan y con quién se comparten

- **Instalación de escritorio:** los datos residen en una base de datos PostgreSQL **en el equipo del Cliente**. El servidor central solo recibe datos de licencia y activación.
- **Servidor central (chloerestaurant.lat):** licencias, planes, solicitudes y, si se usa el Sistema alojado, los datos del negocio con **aislamiento por empresa** a nivel de base de datos.
- Proveedores que pueden intervenir: alojamiento, correo, mensajería (Telegram, para avisos al propietario) y, si el Cliente lo activa, un proveedor de facturación electrónica. [Listar proveedores reales y países.]
- No se transfieren datos a terceros salvo obligación legal o autorización del Cliente.

## 6. Cuánto tiempo se conservan

Los datos operativos se conservan mientras dure la licencia y, después, el plazo que exijan las normas fiscales y contables aplicables ([__] años). Los respaldos automáticos se conservan 14 días (configurable). Al terminar, el Cliente puede solicitar la exportación y eliminación de sus datos.

## 7. Seguridad

PIN con hash scrypt; bloqueo por intentos fallidos; roles y permisos; sesiones ligadas al equipo; comunicación cifrada (HTTPS) en el servidor central; aislamiento entre negocios (RLS en PostgreSQL); registro de auditoría de operaciones sensibles; respaldos verificados. Ningún sistema es infalible: ante una brecha que afecte datos personales se notificará al Cliente sin demora injustificada.

## 8. Derechos de los titulares

Toda persona puede **acceder, rectificar, cancelar (suprimir) y oponerse** al tratamiento de sus datos, y solicitar su actualización, escribiendo a [correo de privacidad] con copia de su documento de identidad. Responderemos en [10] días hábiles. Si el dato pertenece a un negocio Cliente, se remitirá la solicitud al Cliente responsable. El titular puede además acudir a la autoridad competente.

## 9. Menores

El Sistema no está dirigido a menores de edad ni recopila deliberadamente sus datos.

## 10. Cambios

Se publicará la versión vigente con su fecha; los cambios relevantes se notificarán a los Clientes.

**Contacto de privacidad:** [correo] · [dirección]
