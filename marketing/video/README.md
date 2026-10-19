# Video comercial de ChloeRestaurant

Graba el sistema **funcionando de verdad**: un guion opera la aplicación con clics y teclado reales (administrador, camarero,
cocina, bar y caja) mientras se captura la pantalla. Como cada paso pasa por la interfaz y la API reales, grabar también sirve
de prueba de extremo a extremo: si algo falla, el guion se detiene y deja una captura (`salida/error_N.png`) y la lista de
botones visibles. Con esta grabación salieron, por ejemplo, el QR de la factura bloqueado por la política de seguridad y las
listas del panel cortadas a 400 px (ya corregidos).

**Solo para el entorno de prueba local** (`npm run entorno:prueba`): crea datos de demostración, nunca toca la base real.

## Requisitos

- Microsoft Edge instalado (se maneja con Playwright, sin descargar navegadores) y `ffmpeg` en el PATH.
- El catálogo en CSV (por omisión `~/Desktop/resta_articulo_adaptado.csv`; otra ruta con `CATALOGO_CSV=...`). Son datos del
  cliente: no se versiona.

## Uso

```bash
cd marketing/video
npm install
node correr.mjs                    # reinicia el entorno, crea el negocio y graba todo
node correr.mjs --hasta=8          # solo hasta la escena 8
node correr.mjs --sin-reset --desde=15   # reanuda sobre el entorno que ya está levantado
node correr.mjs --rapido           # pausas cortas (para depurar el guion)
node montar.mjs                    # monta el video final (velocidades, música, fundido final)
```

Salida en `salida/` (no se versiona): `borrador.mp4`, `marcas.json` (inicio y fin de cada escena), `error_N.png` si algo falla.

## Qué hace

`correr.mjs` reinicia el entorno de prueba, `preparar.mjs` crea el negocio **ChloeRestaurant** (administrador con PIN
`000000`), `prelude.mjs` deja listo por API el personal que no se crea en cámara y activa un segundo equipo ("terminal de
apoyo", como otra tablet) para las operaciones automáticas: el sistema admite una sola sesión por equipo, así que usar el mismo
identificador cerraría la sesión que se ve en pantalla. Después `guion.mjs` graba las escenas:

1. Apertura animada con el sello premium · 2. PIN del administrador y Centro de Mando · 3. Logotipo del negocio ·
4. Salón y mesas · 5. Subida masiva del catálogo · 6. Fiscal (ITBIS y propina) · 7. Secuencias NCF de la DGII ·
8. Personal y accesos · 9. Temas · 10. Apertura de caja · 11. El camarero toma el pedido · 12. Más mesas en paralelo ·
13. Cocina (KDS) · 14. Bar (KDS) · 15. Cobro con comprobante fiscal · 16. Venta rápida · 17. Fin de la noche (historial y
cierre de caja) · 18. Panel del administrador con las ventas · 19. Tarjeta final.

`lib.mjs` trae el cursor visible, los clics con movimiento, la escritura con ritmo, las leyendas y el grabador (fotogramas del
screencast de DevTools codificados con el `ffmpeg` del sistema).
