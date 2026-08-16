# Manual de Activación del Sistema — ChloeRestaurant

Documento de referencia para el **propietario** y el **equipo de instalación**.

> Fecha de emisión: 15/08/2026
> Versión del sistema: 2.0 (activación por duración)

---

## 1. ¿Qué necesito para activar el sistema?

El sistema se activa por **dispositivo**. Cada pantalla/terminal debe ingresar su
**clave de activación** una sola vez. Para hacerlo necesitas:

| Dato | Valor | Dónde se configura |
|------|-------|--------------------|
| **PIN del Propietario** (acceso universal del dueño) | `012011` | Variable `OWNER_PIN` en el `.env` |
| **Clave Maestra** (firma base de la instalación) | `CHLOE-8VQ5K-R9CK9-8H8B8-FTGUA` | Variable `LICENSE_ACTIVATION_KEY` en el `.env` |

> **PIN del Propietario**: se usa desde el botón **"Propietario"** de la pantalla
> de inicio. Con él entras al panel universal del dueño (planes, precios, claves,
> solicitudes y dispositivos). Si necesitas cambiarlo, edita `OWNER_PIN` en el
> servidor y reinicia la app.
>
> **Clave Maestra**: es la firma que debes ingresar durante una instalación nueva.
> Al activar cualquier dispositivo con esta clave, la licencia queda como **Vitalicia**.

---

## 2. Ejemplos de claves de activación (listas para usar)

Estas claves fueron **generadas con la firma real de tu instalación**
(`LICENSE_ACTIVATION_KEY`). Todas son válidas en este momento:

| Duración | Código | Clave de activación |
|----------|--------|---------------------|
| 7 días | `7D` | `CHLOE-7D-0888A-F5029-FDBA1-A513B` |
| 15 días | `15D` | `CHLOE-15D-021F8-2AC44-EAE59-CB8E8` |
| 30 días | `30D` | `CHLOE-30D-AAC56-17A5C-2AB8C-6D082` |
| 60 días | `60D` | `CHLOE-60D-7957E-D501A-125A4-47985` |
| 90 días | `90D` | `CHLOE-90D-4FC96-29EAB-B1B18-052A6` |
| 6 meses | `6M` | `CHLOE-6M-347AA-44FCB-B1011-19864` |
| 12 meses (1 año) | `12M` | `CHLOE-12M-3608B-B09E6-9B819-86320` |
| 24 meses (2 años) | `24M` | `CHLOE-24M-1FFDD-8CDBE-BA18B-0315F` |
| **Vitalicia** (Clave Maestra) | `L` | `CHLOE-L-398E1-F163A-1088A-1ECFD` |

> La **Clave Maestra** `CHLOE-8VQ5K-R9CK9-8H8B8-FTGUA` también funciona y equivale
> a la **Vitalicia** `CHLOE-L-398E1-F163A-1088A-1ECFD`.

---

## 3. Cómo se activa un dispositivo

1. Instala ChloeRestaurant en la terminal (escritorio o web).
2. En la pantalla de inicio, haz clic en **"Propietario"**.
3. Ingresa el **PIN del Propietario**: `012011`.
4. Ve a la pestaña **"Generar claves"**, elige la duración y pulsa **Generar clave**.
5. Copia la clave y pégala (o escríbela) en el dispositivo que quieras activar.
6. En el dispositivo nuevo, ingresa la clave cuando el sistema la solicite.
7. Listo: el dispositivo queda activo por el tiempo elegido.

También puedes activar desde el panel de **Administrador** → **Dispositivos**,
usando la **Clave Maestra** (Vitalicia).

---

## 4. Formato de las claves

```
CHLOE-<DURACION>-<FIRMA>

Ejemplo real:
CHLOE-12M-3608B-B09E6-9B819-86320
│      │    └─────────┬─────────┘
│      │              └─ Firma HMAC-SHA256 (20 caracteres, 4 grupos de 5)
│      └─ Duración (7D, 15D, 30D, 60D, 90D, 6M, 12M, 24M, L)
└─ Prefijo del sistema
```

- `D` = días, `M` = meses, `L` = vitalicia.
- La firma se calcula con: `HMAC-SHA256(LICENSE_ACTIVATION_KEY, "CHLOE:<DURACION>")`
  en hexadecimal mayúsculas (primeros 20 caracteres), agrupados de 5 en 5.

---

## 5. Renovar o extender la licencia

- Si el dispositivo ya está activo y se activa **otra vez con una clave de mayor
  duración**, la licencia se **extiende sin perderse el tiempo restante**.
- La **Clave Maestra** / **Vitalicia** nunca se reduce: una vez vitalicio,
  siempre vitalicio.
- Cuando la licencia de un dispositivo vence, el sistema lo marca como
  **"Pendiente"** y vuelve a pedir activación en pantalla.

---

## 6. Resumen rápido (instalador / soporte)

```
PIN del Propietario ......... 012011
Clave Maestra ................ CHLOE-8VQ5K-R9CK9-8H8B8-FTGUA
Clave Vitalicia .............. CHLOE-L-398E1-F163A-1088A-1ECFD
Clave 1 año .................. CHLOE-12M-3608B-B09E6-9B819-86320
Contacto ..................... (829) 969-8604 · geurig@yahoo.com
```
