# FICHA TECNICA DEL SISTEMA - CERTIFICACION DGII

**Sistema:** ChloeRestaurant POS
**Version:** 1.0
**Fecha:** [FECHA]

---

## 1. Informacion General

| Campo | Descripcion |
|---|---|
| Nombre | ChloeRestaurant POS |
| Tipo | Sistema de Punto de Venta con Facturacion Electronica Integrada |
| Desarrollador | Desarrollo interno del contribuyente |
| Plataforma | Web + Desktop (Electron) |
| Backend | Node.js 18+ / Express.js |
| Frontend | React 18 / Vite |
| Base de Datos | PostgreSQL 14+ |
| Comunicacion DGII | JSON sobre HTTPS (TLS 1.2+) |

## 2. Arquitectura de Integracion con DGII

```
[ChloeRestaurant POS]
        |
        v
[Backend Node.js]
  - Construye JSON e-CF (conforme esquema DGII)
  - Valida RNC emisor/receptor (mod 10/11)
  - Controla secuencias e-NCF
        |
        v
[Certificado Digital Tributario]
  - Firma RSA-SHA256
  - Almacenado en servidor
        |
        v
[Plataforma DGII]
  - Recepcion y validacion de e-CF
  - Devuelve Track ID
  - Estado del comprobante
```

## 3. Estructura del e-CF Generado

### 3.1 Encabezado

```json
{
  "Version": "1.0",
  "IdDoc": {
    "TipoeCF": "31",
    "eNCF": "E310000000001",
    "FechaVencimientoSecuencia": "2026-12-31",
    "IndicadorEnvioDiferido": "0",
    "TipoIngresos": "01",
    "TipoPago": "1"
  },
  "Emisor": {
    "RNCEmisor": "XXXXXXXXXXX",
    "RazonSocialEmisor": "RAZON SOCIAL",
    "DireccionEmisor": "DIRECCION FISCAL",
    "FechaEmision": "2026-08-21"
  },
  "Comprador": {
    "RNCComprador": "XXXXXXXXXXX",
    "RazonSocialComprador": "NOMBRE CLIENTE"
  },
  "Totales": {
    "MontoTotal": 1180.00,
    "MontoExento": 0,
    "MontoGravadoTotal": 1000.00,
    "MontoGravado16": 1000.00,
    "MontoGravado18": 0,
    "TotalITBIS16": 160.00,
    "TotalITBIS18": 0
  }
}
```

### 3.2 Detalle de Items

```json
{
  "NumeroLineColora": 1,
  "IndicadorFacturacion": "1",
  "NombreItem": "Producto de Ejemplo",
  "IndicadorBienServicio": "1",
  "CantidadItem": 2.00,
  "PrecioUnitarioItem": 500.00,
  "MontoItem": 1000.00,
  "ITBIS": {
    "TasaItbis": "16.00",
    "MontoItbis": 160.00
  }
}
```

## 4. Validaciones Implementadas

### 4.1 Validacion de RNC

| Tipo | Digitos | Algoritmo |
|---|---|---|
| RNC | 11 | Modulo 10 |
| Cedula | 9 | Modulo 11 |

### 4.2 Control de Secuencias

- Validacion de secuencia activa antes de generar e-NCF
- Alerta cuando quedan menos de 1,000 comprobantes
- Bloqueo cuando la secuencia esta agotada
- Validacion de fecha de vencimiento

### 4.3 Reglas de Negocio

| Tipo | Receptor | RNC Receptor |
|---|---|---|
| E31 (Credito Fiscal) | Empresa | **Obligatorio** |
| E32 (Consumo) | Persona | Opcional si monto < RD$250,000 |
| E32 (Consumo) | Empresa | **Obligatorio** si monto >= RD$250,000 |

## 5. Tasas de ITBIS

| Tasa | Descripcion |
|---|---|
| 0% | Productos exentos |
| 16% | Tasa general |
| 18% | Tasa especial |

Cada producto tiene un campo `tasa_itbis` configurable para calculo por linea.

## 6. Numeracion e-NCF

| Campo | Especificacion |
|---|---|
| Longitud | 13 caracteres |
| Formato | E + Tipo (2) + Secuencial (10) |
| Ejemplo | E310000000001 |

### Tipos

| Prefijo | Tipo |
|---|---|
| E31 | Factura de Credito Fiscal |
| E32 | Factura de Consumo |
| E33 | Nota de Debito |
| E34 | Nota de Credito |

## 7. Seguridad

| Capa | Implementacion |
|---|---|
| Transporte | HTTPS / TLS 1.2+ |
| Autenticacion API | API Key (header X-API-KEY) |
| Autenticacion Usuarios | JWT con roles |
| Firma Digital | RSA-SHA256 |
| Permisos | RBAC por rol y menu |

## 8. Conservacion de Datos

| Dato | Retencion |
|---|---|
| e-CF emitidos | 10 anos minimo |
| e-CF recibidos | 10 anos minimo |
| Secuencias e-NCF | Mientras esten activas |
| Configuracion | Permanente |

## 9. Representacion Impresa

El sistema genera representacion impresa del e-CF con:
- Datos del emisor y receptor
- Descripcion de bienes/servicios
- Montos, ITBIS y total
- Numero e-NCF
- QR code con URL de validacion
- Fecha y hora de emision

## 10. Requisitos de Infraestructura

| Componente | Minimo |
|---|---|
| Servidor | Node.js 18+, 512MB RAM |
| Base de Datos | PostgreSQL 14+ |
| Conexion Internet | 1 Mbps |
| Navegador | Chrome 90+, Firefox 90+ |
| Almacenamiento | 1GB para datos locales |
