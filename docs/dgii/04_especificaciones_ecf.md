# ESPECIFICACIONES TECNICAS DEL e-CF

**Sistema:** ChloeRestaurant POS
**Fecha:** [FECHA]

---

## 1. Estructura General del e-CF

El comprobante fiscal electronico (e-CF) se genera en formato JSON y se serializa a XML para envio a la DGII.

```json
{
  "ECF": {
    "Version": "1.0",
    "IdDoc": { ... },
    "Emisor": { ... },
    "Comprador": { ... },
    "Totales": { ... },
    "DetallesItems": [ ... ]
  }
}
```

## 2. Seccion: Version

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| Version | String | Si | Version del esquema: "1.0" |

## 3. Seccion: IdDoc

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| TipoeCF | String | Si | Tipo de comprobante: 31, 32, 33, 34 |
| eNCF | String | Si | e-NCF de 13 posiciones |
| FechaVencimientoSecuencia | String | Si | Formato YYYY-MM-DD |
| IndicadorEnvioDiferido | String | Si | 0 = Normal, 1 = Diferido |
| TipoIngresos | String | Si | 01 = Ingreso operacional |
| TipoPago | String | Si | 1 = Contado, 2 = Credito |

### Tipos de e-CF

| Codigo | Tipo | Equivalente |
|---|---|---|
| 31 | Factura de Credito Fiscal | B01 |
| 32 | Factura de Consumo | B02 |
| 33 | Nota de Debito | — |
| 34 | Nota de Credito | — |

## 4. Seccion: Emisor

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| RNCEmisor | String | Si | RNC del emisor (11 digitos) |
| RazonSocialEmisor | String | Si | Razon social |
| DireccionEmisor | String | Si | Direccion fiscal |
| FechaEmision | String | Si | Formato YYYY-MM-DD |

## 5. Seccion: Comprador

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| RNCComprador | String | Cond. | Obligatorio para E31 |
| RazonSocialComprador | String | Cond. | Nombre del comprador |

**Reglas:**
- **E31:** RNC del comprador es **obligatorio**
- **E32:** RNC es opcional si el monto es menor a RD$250,000
- **E32:** RNC es obligatorio si el monto es mayor o igual a RD$250,000

## 6. Seccion: Totales

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| MontoTotal | Number | Si | Monto total de la venta |
| MontoExento | Number | Si | Monto exento de ITBIS |
| MontoGravadoTotal | Number | Si | Total gravado |
| MontoGravado16 | Number | Si | Gravado a 16% |
| MontoGravado18 | Number | Si | Gravado a 18% |
| TotalITBIS16 | Number | Si | ITBIS total a 16% |
| TotalITBIS18 | Number | Si | ITBIS total a 18% |

### Formulas de Calculo

```
MontoGravadoTotal = MontoGravado16 + MontoGravado18
TotalITBIS16 = MontoGravado16 * 0.16
TotalITBIS18 = MontoGravado18 * 0.18
MontoTotal = MontoExento + MontoGravadoTotal + TotalITBIS16 + TotalITBIS18
```

## 7. Seccion: DetallesItems (Array)

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| NumeroLineColora | Number | Si | Numero secuencial de linea |
| IndicadorFacturacion | String | Si | 1 = Gravado, 2 = Exento |
| NombreItem | String | Si | Nombre del producto/servicio |
| IndicadorBienServicio | String | Si | 1 = Bien, 2 = Servicio |
| CantidadItem | Number | Si | Cantidad |
| PrecioUnitarioItem | Number | Si | Precio unitario |
| MontoItem | Number | Si | Cantidad x Precio Unitario |
| ITBIS.TasaItbis | String | Si | Tasa: "0.00", "16.00", "18.00" |
| ITBIS.MontoItbis | Number | Si | ITBIS de la linea |

### Formulas por Linea

```
MontoItem = CantidadItem * PrecioUnitarioItem
MontoItbis = MontoItem * (TasaItbis / 100)
```

## 8. Numeracion e-NCF

| Campo | Especificacion |
|---|---|
| Longitud | 13 caracteres |
| Formato | E + Tipo (2 digitos) + Secuencial (10 digitos) |
| Ejemplo E31 | E310000000001 |
| Ejemplo E32 | E320000000001 |

### Secuencias

- Solicitadas a la DGII despues de la autorizacion
- Auto-incrementales
- Control de agotamiento (alerta < 1,000)
- Validacion de fecha de vencimiento

## 9. Ejemplo Completo: E32 (Consumo)

```json
{
  "ECF": {
    "Version": "1.0",
    "IdDoc": {
      "TipoeCF": "32",
      "eNCF": "E320000000001",
      "FechaVencimientoSecuencia": "2026-12-31",
      "IndicadorEnvioDiferido": "0",
      "TipoIngresos": "01",
      "TipoPago": "1"
    },
    "Emisor": {
      "RNCEmisor": "12345678901",
      "RazonSocialEmisor": "MI RESTAURANTE SRL",
      "DireccionEmisor": "Av. Principal #123, Santo Domingo",
      "FechaEmision": "2026-08-21"
    },
    "Comprador": {
      "RNCComprador": "",
      "RazonSocialComprador": ""
    },
    "Totales": {
      "MontoTotal": 590.00,
      "MontoExento": 0,
      "MontoGravadoTotal": 500.00,
      "MontoGravado16": 500.00,
      "MontoGravado18": 0,
      "TotalITBIS16": 80.00,
      "TotalITBIS18": 0
    },
    "DetallesItems": [
      {
        "NumeroLineColora": 1,
        "IndicadorFacturacion": "1",
        "NombreItem": "Pechuga de Pollo",
        "IndicadorBienServicio": "1",
        "CantidadItem": 1.00,
        "PrecioUnitarioItem": 350.00,
        "MontoItem": 350.00,
        "ITBIS": {
          "TasaItbis": "16.00",
          "MontoItbis": 56.00
        }
      },
      {
        "NumeroLineColora": 2,
        "IndicadorFacturacion": "1",
        "NombreItem": "Refresco Natural",
        "IndicadorBienServicio": "1",
        "CantidadItem": 1.00,
        "PrecioUnitarioItem": 150.00,
        "MontoItem": 150.00,
        "ITBIS": {
          "TasaItbis": "16.00",
          "MontoItbis": 24.00
        }
      }
    ]
  }
}
```

## 10. Ejemplo Completo: E31 (Credito Fiscal)

```json
{
  "ECF": {
    "Version": "1.0",
    "IdDoc": {
      "TipoeCF": "31",
      "eNCF": "E310000000001",
      "FechaVencimientoSecuencia": "2026-12-31",
      "IndicadorEnvioDiferido": "0",
      "TipoIngresos": "01",
      "TipoPago": "2"
    },
    "Emisor": {
      "RNCEmisor": "12345678901",
      "RazonSocialEmisor": "MI RESTAURANTE SRL",
      "DireccionEmisor": "Av. Principal #123, Santo Domingo",
      "FechaEmision": "2026-08-21"
    },
    "Comprador": {
      "RNCComprador": "98765432101",
      "RazonSocialComprador": "CLIENTE EMPRESA SRL"
    },
    "Totales": {
      "MontoTotal": 2360.00,
      "MontoExento": 0,
      "MontoGravadoTotal": 2000.00,
      "MontoGravado16": 2000.00,
      "MontoGravado18": 0,
      "TotalITBIS16": 320.00,
      "TotalITBIS18": 0
    },
    "DetallesItems": [
      {
        "NumeroLineColora": 1,
        "IndicadorFacturacion": "1",
        "NombreItem": "Servicio de Banquete",
        "IndicadorBienServicio": "2",
        "CantidadItem": 1.00,
        "PrecioUnitarioItem": 2000.00,
        "MontoItem": 2000.00,
        "ITBIS": {
          "TasaItbis": "16.00",
          "MontoItbis": 320.00
        }
      }
    ]
  }
}
```

## 11. Validaciones del Sistema

### 11.1 Validacion de RNC

| Tipo | Longitud | Algoritmo |
|---|---|---|
| RNC | 11 digitos | Modulo 10 |
| Cedula | 9 digitos | Modulo 11 |

### 11.2 Control de Secuencias

- Validacion de secuencia activa
- Alerta cuando quedan < 1,000 comprobantes
- Bloqueo cuando la secuencia esta agotada
- Validacion de fecha de vencimiento

### 11.3 Reglas de Negocio

| Condicion | Accion |
|---|---|
| E31 sin RNC receptor | Error: RNC obligatorio |
| E32 monto >= 250,000 sin RNC | Error: RNC requerido |
| Secuencia agotada | Error: No hay secuencias disponibles |
| Secuencia por vencer | Warning: Secuencia por vencer |

## 12. Seguridad

| Capa | Implementacion |
|---|---|
| Transporte | HTTPS / TLS 1.2+ |
| Firma Digital | RSA-SHA256 via Certificado Tributario |
| Autenticacion API | API Key (header X-API-KEY) |
| Autenticacion Usuarios | JWT con roles |
| Permisos | RBAC por rol y menu |

## 13. Conservacion

| Dato | Retencion |
|---|---|
| e-CF emitidos | 10 anos minimo |
| e-CF recibidos | 10 anos minimo |
| Secuencias e-NCF | Mientras esten activas |
