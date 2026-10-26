# Juego de marca — ChloeRestaurant

Logos, iconos, instalador, ticket, banners y piezas para redes, todos generados desde **un solo código** (`generar/`)
para que cualquier cambio de color o de texto se propague a todo el juego a la vez. Mira `hoja-de-marca.png` para ver el
resumen de un vistazo.

## Identidad

- **Concepto:** un **sello de lujo**: una **C** de oro pulido (de *Chloe*) que abraza un **tenedor con un brote de hojas**
  (cocina fresca), coronada por el **gorro de chef** con banda y gema de oro, dentro de un disco de obsidiana con destellos
  radiales, **bisel de oro con borde de perlas** y **corona de laurel**. Conserva la idea del logo anterior, ahora vectorial y
  con acabado de joyería (iluminación real en el metal): escala sin perder nitidez y funciona sobre fondo claro y oscuro. A
  tamaños pequeños se simplifica (sin laurel ni perlas) para que siga leyéndose.
- **Nombre:** `ChloeRest` + descriptor `RESTAURANT SYSTEM` + lema `GESTIONA • VENDE • CRECE`.
- **Mensaje de los banners:** «Gestiona. Vende. Crece.» · «Sistema POS para restaurantes en República Dominicana» · mesas,
  cocina y bar, caja, facturación DGII. Dominio `chloerestaurant.lat`. (Es el mismo mensaje de la web, `index.html`.)

### Color

| Nombre | Hex | Uso |
|---|---|---|
| Marino | `#0A1426` | fondos, texto «Chloe» sobre claro |
| Marino profundo | `#050A14` | fondos oscuros, tema del navegador |
| Dorado claro / dorado / dorado oscuro | `#F7C645` · `#E19A14` · `#8E5300` | degradado metálico de la C, del bisel, del laurel y de «Rest» |
| Crema | `#F8F4EC` | fondos claros (igual que el tema Dorado de la app) |
| Zafiro | `#5E94FF` | variante para el tema Zafiro |
| Esmeralda | `#46C283` | variante para el tema Esmeralda |

El degradado metálico completo: `#FFE9A6 → #F7C645 → #E19A14 → #F8CE5C → #8E5300`. Cada tema tiene el suyo
(`generar/marca.mjs`, constante `TEMAS`).

### Tipografía

- **Fraunces ExtraBold** — nombre de marca y titulares.
- **Inter 500 / 600 / 700** — descriptor, lema y textos.

Ambas son de licencia libre (SIL OFL 1.1) y, dentro de los logos y banners, van **convertidas a trazos**: no hace falta tenerlas
instaladas para ver o usar los archivos.

### Reglas de uso

- **Espacio libre:** deja alrededor del logo, como mínimo, el 25 % de la altura del isotipo.
- **Qué versión usar:** sobre fondo oscuro → `fondo-oscuro`; sobre fondo claro → `fondo-claro`; sobre fotos o un color de fondo
  distinto → `blanco` o `negro` (monocromáticos).
- **Tamaño mínimo:** logo horizontal 160 px de ancho (sin lema: `compacto`; con lema, 280 px); logo vertical 100 px; isotipo
  completo 64 px. Por debajo de 64 px usa la versión *simple* y por debajo de 33 px la *mínima* (así salen `favicon-*` y el icono
  de escritorio).
- **No hagas:** estirarlo, cambiar los colores del degradado, ponerle sombras o contornos, girarlo, usar la versión de fondo oscuro
  sobre un fondo claro.

## Contenido

| Carpeta | Archivos |
|---|---|
| `logos/` | `isotipo-{dorado,zafiro,esmeralda}`, `isotipo-sin-aro-dorado`, `isotipo-mono-{blanco,negro}`; `logo-horizontal-*` y `logo-vertical-*` en `fondo-oscuro`, `fondo-claro`, `blanco` y `negro`; `logo-horizontal-compacto-*` (sin lema); `logo-horizontal-fondo-oscuro-{zafiro,esmeralda}`. Cada uno en **SVG** (editable, escala sin límite) y **PNG** con fondo transparente |
| `iconos/` | `favicon.svg` / `.ico` / `-16/32/48.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icono-escritorio.ico` (16 a 256 px, Windows), `icono-escritorio-256.png`, `logo-app-512.png` |
| `instalador/` | `instalador-lateral.bmp` (164×314) y `instalador-encabezado.bmp` (150×57) del instalador de Windows, más sus vistas previas `.png` |
| `ticket/` | `logo-ticket-384.png` e `logo-ticket-vertical-384.png`: negro puro de 1 bit para impresoras térmicas |
| `banners/` | `og-image-1200x630.png` (vista previa al compartir el enlace), `landing-hero-1920x800.png`, `login-fondo-{dorado,zafiro,esmeralda}-1920x1080.png` (sin texto), `panel-encabezado-1600x240.png`, `correo-encabezado-1200x400.png` |
| `redes/` | `perfil-redes-720.png` (Facebook, Instagram, WhatsApp Business, LinkedIn y X: se recorta en círculo y la marca queda dentro), `facebook-portada-1640x624.png`, `instagram-post-1080x1080.png`, `instagram-historia-1080x1920.png`, `linkedin-portada-1584x396.png`, `x-portada-1500x500.png` |

Las portadas de Facebook y LinkedIn dejan el contenido en la zona segura (centro) porque las apps recortan los bordes; en la
historia de Instagram el contenido evita las franjas superior e inferior que tapa la interfaz.

## Dónde está aplicado en el sistema

`npm run generar` no toca la aplicación; el paso `aplicar` (`node generar.mjs aplicar`) copia estas piezas:

| Pieza del juego | Destino en la aplicación | Se ve en |
|---|---|---|
| `iconos/favicon.svg`, `.ico`, `apple-touch-icon`, `icon-192` | `frontend-restaurante/public/` (+ enlaces en `index.html`) | pestaña del navegador, icono al guardar en el móvil |
| `logos/isotipo-dorado.svg` | `public/icons.svg` | bienvenida, landing y activación del equipo |
| `iconos/logo-app-512.png` | `public/logo.png` y `src/assets/branding/chloe-logo.png` | inicio de sesión y datos estructurados de Google |
| `iconos/icono-escritorio.ico` | `build/icon.ico` | ejecutable, instalador y acceso directo de Windows |
| `instalador/*.bmp` | `build/instalador-*.bmp` (`package.json` → `build.nsis`) | pantallas del asistente de instalación |

**No se aplicaron** (a propósito, para que decidas): `banners/og-image-1200x630.png` (el `public/og-image.png` actual muestra las pantallas
del sistema; para cambiarlo, copia el nuevo con ese nombre) y los fondos de login. Las piezas de `redes/` se suben a mano a cada red.

## Regenerar

```bash
cd marketing/branding/generar
npm install
npm run generar                 # todo el juego
node generar.mjs logos iconos   # solo algunas partes (logos, iconos, instalador, ticket, banners, hoja)
node generar.mjs aplicar        # copia las piezas a frontend-restaurante/ (ver tabla de arriba)
```

El generador es independiente de la aplicación (`generar/package.json` propio): no cambia sus dependencias ni su CI. Para
cambiar el mensaje de los banners edita `MENSAJE` en `generar/banners.mjs`; los colores, en `generar/marca.mjs`.
