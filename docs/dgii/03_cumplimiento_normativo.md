# CUMPLIMIENTO NORMATIVO - CERTIFICACION DGII

**Sistema:** ChloeRestaurant POS
**Normativas:** Ley 32-23, Decreto 587-24, NG 06-2018
**Fecha:** [FECHA]

---

## 1. Marco Normativo Aplicable

| Normativa | Descripcion |
|---|---|
| Ley 32-23 | Ley General de Facturacion Electronica |
| Decreto 587-24 | Reglamento de la Ley 32-23 |
| NG 06-2018 | Norma General sobre Comprobantes Fiscales |

## 2. Requisitos del Articulo 13 - Decreto 587-24

### 2.1 RNC Activo

| Requisito | Estado |
|---|---|
| RNC en estado Activo | [Verificar en dgii.gov.do] |
| Sin omisiones de declaraciones | [Verificar en OFV] |
| Sin deudas tributarias | [Verificar en OFV] |

### 2.2 Clave de Acceso a OFV

| Requisito | Estado |
|---|---|
| Clave OFV activa | [Verificar] |

### 2.3 Certificado Digital

| Requisito | Estado |
|---|---|
| Certificado para Procesos Tributarios | [Pendiente] |
| A nombre del representante legal | [Pendiente] |
| Vigente | [Pendiente] |

### 2.4 Formulario FI-GDF-016

| Requisito | Estado |
|---|---|
| Formulario completado | Este documento |
| Firmado por representante legal | [Pendiente] |

### 2.5 Sistema Homologado

| Requisito | Estado |
|---|---|
| Sistema propio certificado por DGII | [Solicitando certificacion] |

## 3. Cumplimiento Ley 32-23

### 3.1 Conservacion (Art. 15)

| Obligacion | Implementacion |
|---|---|
| Conservar e-CF 10 anos | PostgreSQL + XML firmados |
| Respaldo automatico | Copias de seguridad programadas |
| Disponibilidad | Consulta por NCF o periodo |

### 3.2 Deberes del Emisor (Art. 16)

| Obligacion | Implementacion |
|---|---|
| Emitir conforme a especificaciones | JSON segun esquema DGII |
| Numeracion secuencial | Control en tabla dgii_secuencias |
| Datos actualizados | Endpoints de configuracion |

### 3.3 Representacion Impresa (Art. 17)

| Obligacion | Implementacion |
|---|---|
| Generar RI | Plantilla PDF con QR |
| Datos minimos | Emisor, receptor, totales, ITBIS, NCF |

## 4. Cumplimiento NG 06-2018

### 4.1 Tipos de Comprobantes

| Tipo | Codigo | Estado |
|---|---|---|
| Factura Credito Fiscal | E31 | Implementado |
| Factura Consumo | E32 | Implementado |
| Nota Debito | E33 | Implementado |
| Nota Credito | E34 | Implementado |

### 4.2 Datos Obligatorios del e-CF

#### Encabezado
- [x] Version del esquema
- [x] Tipo de e-CF
- [x] e-NCF (13 posiciones)
- [x] Fecha de emision
- [x] Fecha de vencimiento de secuencia
- [x] Indicador de envio diferido
- [x] Tipo de ingresos
- [x] Tipo de pago

#### Emisor
- [x] RNC del emisor
- [x] Razon social del emisor
- [x] Direccion del emisor
- [x] Fecha de emision

#### Comprador
- [x] RNC del comprador (obligatorio E31)
- [x] Razon social del comprador

#### Totales
- [x] Monto total
- [x] Monto exento
- [x] Monto gravado total
- [x] ITBIS por tasa
- [x] Total ITBIS

#### Detalle
- [x] Numero de linea
- [x] Indicador de facturacion
- [x] Nombre del item
- [x] Indicador bien/servicio
- [x] Cantidad
- [x] Precio unitario
- [x] Monto del item
- [x] ITBIS por linea

### 4.3 Numeracion e-NCF

| Campo | Especificacion | Estado |
|---|---|---|
| Longitud | 13 caracteres | Implementado |
| Prefijo E | Electronico | Implementado |
| Tipo | 2 digitos | Implementado |
| Secuencial | 10 digitos | Implementado |

## 5. Certificacion del Sistema

### 5.1 Requisitos Tecnicos

| Requisito | Estado |
|---|---|
| Generar e-CF con estructura correcta | Completo |
| Enviar e-CF a DGII | Completo |
| Recibir acuse de recibo | Completo |
| Generar representacion impresa | Pendiente frontend |
| Validar RNC emisor | Completo |
| Validar RNC receptor | Completo |
| Control de secuencias | Completo |

### 5.2 Set de Pruebas Requerido

| Prueba | Cantidad | Estado |
|---|---|---|
| Pruebas de Datos | 25 e-CF | Pendiente |
| Pruebas de Simulacion | Segun DGII | Pendiente |
| Pruebas de Comunicacion | Segun DGII | Pendiente |

### 5.3 Tipos para Pruebas

| Tipo | Cantidad | Estado |
|---|---|---|
| E31 - Credito Fiscal | 10 | Pendiente |
| E32 - Consumo | 10 | Pendiente |
| E33 - Nota Debito | 3 | Pendiente |
| E34 - Nota Credito | 2 | Pendiente |

## 6. Flujo de Certificacion

```
1. Solicitud (OFV o presencial)
        |
        v
2. Aprobacion preliminar
        |
        v
3. Acceso a Portal de Certificacion
        |
        v
4. Set de pruebas (25+ e-CF en TEST)
        |
        v
5. Validacion DGII
        |
        v
6. Declaracion Jurada
        |
        v
7. Autorizacion como Emisor Electronico
        |
        v
8. Habilitacion en OFV
        |
        v
9. Solicitud de secuencias e-NCF
        |
        v
10. Emision real
```

## 7. Plazos de Implementacion

| Grupo | Fecha Limite | Estado |
|---|---|---|
| Grandes Contribuyentes Nacionales | 15 mayo 2024 | Vencido |
| Grandes Contribuyentes Locales y Medianos | 15 nov 2025 | Vencido |
| Pequenos, Micro y No Clasificados | 15 nov 2026 | Vigente |

**Prorroga:** DGII (6 mayo 2026) extiende hasta **15 de noviembre de 2026**.

## 8. Sanciones por No Cumplimiento

| Infraccion | Sancion |
|---|---|
| No implementar e-CF | Perdida de validez NCF en papel |
| Emision sin autorizacion | Multas segun Codigo Tributario |
| Datos incorrectos | Rechazo del comprobante |
| No conservar comprobantes | Sanciones administrativas |
