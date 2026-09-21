# Auditoría final — ChloeRestaurant POS v2.2.0

**Fecha:** 2026-09-21 · **Alcance:** código (backend, frontend, Electron), base de datos, seguridad, flujo de dinero de punta a punta, despliegue y preparación para distribución nacional.
**Método:** comprobaciones automáticas, revisión de código, pruebas de extremo a extremo contra el backend real con base de datos local, y una consulta pública de solo lectura a `chloerestaurant.lat`. No se modificó producción ni se accedió por SSH.

---

## 1. Veredicto

> **Actualización (tarde del 21-sep):** el plan se ejecutó; ver la tabla de la sección 8. Lo que queda depende de acciones externas (despliegue, instalador firmado, copia de respaldos, DGII, abogado, pruebas con impresoras y piloto).

**Listo para un piloto controlado (3–5 restaurantes). No listo todavía para distribución masiva.** La base técnica es sólida (autenticación, aislamiento entre negocios, roles, pruebas), pero hay **cuatro bloqueantes** que conviene cerrar antes de vender a nivel nacional. Uno de ellos toca dinero y requiere una decisión suya.

| # | Bloqueante | Por qué importa | Acción |
|---|---|---|---|
| B1 | ~~El total de la pantalla no coincide con el del servidor~~ **(dormido)** — ITBIS calculado de dos formas distintas | Con ITBIS apagado no hay diferencia; **reaparece al reactivarlo** | Decidido el 21-sep: ITBIS y propina apagados y precios sin ITBIS; corregir el cálculo antes de reactivar (ver §4, H1) |
| B2 | **No hay respaldos automáticos** de la base de datos | Un fallo de disco = pérdida total de datos del cliente | Implementar `pg_dump` programado + retención + prueba de restauración |
| B3 | **Lo que hay en producción y en el instalador está desactualizado** | Producción reporta migración `049` (faltan `050`, rediseño, correcciones de KDS/turnos); el instalador `2.2.0.exe` es del 15-sep y no está firmado | Desplegar, regenerar y firmar el instalador |
| B4 | **Secretos idénticos dentro de todos los instaladores** | `.env.electron` (con `APP_SESSION_SECRET` y credenciales de BD) se copia a cada instalación | Generar secretos por instalación en el primer arranque |

---

## 2. Qué se verificó y con qué resultado

| Área | Resultado | Evidencia |
|---|---|---|
| Tipos y lint backend | ✅ | `tsc --noEmit` y `eslint src` sin errores |
| Pruebas unitarias | ✅ 146/146 | `vitest run` (13 archivos). Cobertura de líneas **44,6 %** (umbral configurado: 85 % → no se cumple) |
| Frontend | ✅ | `vite build` correcto (JS 510 kB / 112 kB gzip, CSS 206 kB / 39 kB gzip); `oxlint` 0 errores, ~27 avisos de hooks (`exhaustive-deps`) |
| Dependencias | ✅ | `npm audit --omit=dev`: 0 vulnerabilidades (backend y frontend) |
| Migraciones | ✅ | 50 definidas (001–051, sin 017), 50 aplicadas en la BD local, 0 pendientes; instalación limpia verificada |
| Aislamiento entre negocios | ✅ | 27 tablas con `empresa_id`, las 27 con RLS y política; lectura y escritura probadas con un rol sin privilegios |
| Cobertura de autenticación | ✅ | 129 rutas evaluadas sin token: todas rechazadas salvo las públicas por diseño (planes, métodos de pago, versión, config de arranque, login, activación) |
| Flujo pedido → KDS → cobro → cierre | ✅ | Comida solo a Cocina, bebida (Cervezas) solo a Bar; cobro en efectivo y tarjeta; NCF consecutivos (`B0200000013` → `…14`); doble cobro rechazado; cierre de caja con reporte |
| Roles | ✅ | Camarero y cajero reciben 403 en usuarios, productos, configuración y reportes; cajero consulta caja; camarero no cobra |
| Turnos por PIN | ✅ | Vista previa → entrada → visible en "en turno" → anti doble marca (409) → equipo sin activar rechazado (403) |
| Fuerza bruta de PIN | ✅ | 4 fallos y el 5.º intento devuelve 429 (bloqueo por IP + equipo) |
| Sesión | ✅ | El token queda ligado al dispositivo (otro equipo → 401) |
| Producción (público, solo lectura) | ⚠️ | `/api/health` OK, TLS válido, HSTS + CSP + `nosniff` + `X-Frame-Options`; migración `049`; uptime 0 s (reinicio reciente) |
| Smoke de integración del repo | ⚠️ | Solo ejecuta 5 comprobaciones: los flujos autenticados se omiten silenciosamente si falta `BOOTSTRAP_ADMIN_PIN` (ahora lo avisa) |

E2E de esta auditoría: **42 comprobaciones, 41 correctas**; la que falla es H1 (dormido mientras el ITBIS esté apagado). Después se agregó un e2e de ITBIS/propina: **25/25** (ver §3, punto 6).

---

## 3. Correcciones hechas durante la auditoría

1. **Pago mixto sin validación de monto** (`src/services/cuentasService.ts`): el segundo método aceptaba montos negativos o mayores al total (descuadra caja y 607). Nueva `validarPagoMixto` + 4 pruebas. Confirmado antes (aceptaba `-500`) y después (400).
2. **Equipo activado caía al LandingScreen** ante un 429, un 5xx o una caída de red al abrir la app (`App.jsx`, `utils/dispositivo.js`). Ahora se recuerda la última activación confirmada por el servidor; si el servidor dice explícitamente "no activado" se borra. 7/7 casos probados (503, 429, sin red, no activado, recuperación).
3. **Scripts de seguridad apuntaban a una BD antigua** (`check-database-security.mjs`, `verify-rls-runtime.mjs`): pasaban "OK" contra una base con 41 migraciones. Ahora usan `DB_NAME` del `.env`. Re-ejecutados contra la BD real: OK (27/27).
4. **Smoke de integración** avisa cuando omite los flujos autenticados.
5. `ESTADO_DEL_SISTEMA.md`: corregido el conteo de migraciones (con la 051 son 50: 001–051, sin 017).
6. **ITBIS y propina apagados + propina configurable (2 %–30 %)**, a pedido del dueño: migración `051_itbis_propina_desactivados` (flags en `FALSE` para todos los negocios, todos los productos sin ITBIS ni propina, defaults nuevos, `propina_porcentaje` con `CHECK 2–30`), cálculo del servidor y de la pantalla con el porcentaje del negocio, control en *Datos de la Empresa → Fiscal & Cuentas*, y tickets/comandero/cobro con la etiqueta "Propina (X%)". Probado: 8 valores fuera de rango rechazados (API y base de datos), cobro con 2/15/30 % coincide con la pantalla, CSV sin columnas de impuestos → sin ITBIS ni propina, instalación limpia (50 migraciones) y prueba de interfaz.

---

## 4. Hallazgos abiertos

### Crítico

**H1 · ITBIS y total distintos entre pantalla y servidor** *(dormido: el ITBIS está apagado por decisión del 21-sep)*
Con un subtotal de RD$ 1,050.00 (ITBIS y propina activos):

| | Subtotal | ITBIS | Propina | **Total** |
|---|---|---|---|---|
| Pantalla (comandero y modal de cobro, `utils/dinero.js`) | 1,050.00 | 189.00 | 105.00 | **1,344.00** |
| Servidor (lo que se guarda, `calcularTotales`) | 1,050.00 | 160.16 | 105.00 | **1,315.16** |

Causa: el servidor **extrae** el ITBIS del precio (÷1,18, como si estuviera incluido) pero luego **lo suma** al subtotal (como si no lo estuviera); la pantalla calcula 18 % adicional. La prueba unitaria existente (200 → 250,51) fija la fórmula del servidor, y `src/lib/ecf.ts` también trata los precios como con ITBIS incluido. Efecto: diferencia de RD$ 28.84 por cada RD$ 1,050 (≈ 2,75 % del subtotal) entre lo que ve el cliente y lo que quedan registrados en factura, cierre de caja y reporte 607 → **ITBIS subdeclarado y cajas que no cuadran**.
**Decisión (21-sep):** los precios del menú **no** incluyen ITBIS ni propina, y ambos quedan desactivados por ahora. Con el ITBIS apagado el servidor y la pantalla coinciden (verificado). Si se reactiva, hay que corregir antes el servidor a `itbis = Σ monto × tasa/100` (total = subtotal × 1,28), igual que la pantalla, alinear `src/lib/ecf.ts` y actualizar la prueba unitaria (200 → 250,51). No se tocó esa fórmula porque hoy no se usa y afecta facturas ya emitidas.

**H2 · Sin respaldos automáticos** (pendiente desde la auditoría del 14-sep). No existe `pg_dump` programado ni retención; la carpeta `backups/` contiene copias manuales de agosto.

**H3 · Producción e instalador desactualizados.** Producción en `049`; falta desplegar el código actual (migración `050`, temas, KDS, turnos, correcciones). Instalador de 462 MB, del 15-sep, sin firma de código (SmartScreen mostrará "editor desconocido").

**H4 · Secretos compartidos en el instalador.** `predist` copia `.env.electron` (contiene `APP_SESSION_SECRET`, credenciales de BD) dentro de cada instalación: todos los clientes tendrían el mismo secreto de firma de sesiones y autorizaciones de supervisor. Confirmar además que el secreto de producción es distinto.

### Alto

- **H5 · Límite de `/api/dispositivo/registrar`**: 30 solicitudes / 10 min **por IP** y se llama en cada carga de página. Con muchos equipos tras la misma IP pública se agota. Mitigado por la corrección 2; recomendable subirlo o usar IP + equipo.
- **H6 · Cobertura de pruebas 44,6 %**: routers y middleware no tienen pruebas unitarias; el e2e de esta auditoría no está en CI.
- **H7 · El cobro no exige caja abierta** (solo lo controla la interfaz).
- **H8 · Sin división de cuenta ni descuentos/cupones** (funciones esperadas por los operadores).
- **H9 · Facturación electrónica e-CF no conectada de extremo a extremo** (`dgiiEcfService`/`msellerEcfService` existen, sin flujo de cobro). No anunciar cumplimiento certificado.

### Medio / Bajo

- **H10** `/api/sistema/info` y `/api/configuracion/completa` son públicos y, sin dispositivo, responden con los datos de la empresa 1 (nombre, dirección, teléfono; `/completa` puede incluir propietario y correo; `/info`, estado y monto de caja y cajera). En la BD local no aparecieron `propietario`/`email` porque no están cargados; el código sí los devolvería.
- **H11** Token de sesión en `localStorage` (mitigado por CSP `script-src 'self'`).
- **H12** Comparaciones no constantes de secretos (`webhook`, `token_pago`) y `/api/health` expone versión, migración y memoria.
- **H13** `/api/setup/registro` sin límite propio (protegido porque solo funciona mientras el setup no esté completado).
- **H14** Sin monitoreo/alertas (uptime, errores).
- **H15** Accesibilidad: 122 atributos ARIA, no medida con herramienta en esta auditoría.
- **H16** `package.json` declara licencia **ISC** (permisiva) para un producto comercial.
- **H17** Instalador de 462 MB (incluye PostgreSQL): pesado para distribuir.

---

## 5. Plan sugerido antes de distribuir (≈ 4 semanas)

1. **Semana 1:** decidir H1 y corregir; despliegue + migración `050` en producción; respaldos automáticos con prueba de restauración; secretos por instalación.
2. **Semana 2:** instalador nuevo y firmado; pruebas con impresora térmica real, red local y 2 restaurantes reales; pagos mixtos y cierres.
3. **Semana 3:** piloto con 3–5 restaurantes; términos y condiciones, política de privacidad (Ley 172-13) y contrato de licencia; definir precios.
4. **Semana 4:** capacitar distribuidores regionales y abrir la venta. Facturación e-CF cuando esté aprobada.

---

## 6. Estado del repositorio

Rama `feat/rediseno-verde-turnos-asistencia`: **~80 archivos sin commitear** desde `9a971b6` (rediseño final, temas, KDS/turnos, migración 050, esta auditoría, `marketing/`). El PR no se ha creado (`gh` sin sesión). Comparación: <https://github.com/geurif-commits/ChloeRest/compare/main...feat/rediseno-verde-turnos-asistencia?expand=1>

## 7. Material comercial generado (`marketing/`)

- `capturas/` — 20 capturas reales del sistema con **datos de demostración** (3 temas, escritorio y móvil).
- `anuncios/` — 6 piezas PNG: feed 1080×1080 (×2), historia 1080×1920, Facebook/LinkedIn 1200×628, feed 4:5 1080×1350, banner 1920×1080. Fuentes editables en `src/*.html`.
- `presentacion/` — imágenes y archivos de la presentación (13 diapositivas, publicada como artefacto).
- **Limitaciones:** no hay generador de imágenes por IA en este entorno; las piezas se componen con capturas reales y diseño propio. Sin testimonios, cifras de clientes ni certificaciones. Pendientes en la presentación: precios, datos de contacto y ciudad/cantidad del piloto (entre corchetes).

---

## 8. Estado tras las correcciones (2026-09-21, tarde)

A pedido del dueño se ejecutó el plan. Verificado con: 178 pruebas unitarias, `tsc`/`eslint` sin errores, `vite build`, `oxlint` 0 errores, e2e **49/49** (también sobre una base vacía sembrada como lo haría CI), RLS **27/27** con aislamiento comprobado, restauración de respaldo verificada y **0 violaciones de accesibilidad WCAG 2.1 A/AA** (axe-core) en pantallas principales, panel completo y cobro, en los tres temas.

| # | Hallazgo | Estado | Qué se hizo / qué falta |
|---|---|---|---|
| B1 / H1 | ITBIS distinto entre pantalla y servidor | ✅ Resuelto | Precios sin ITBIS; misma fórmula en servidor (centavos), pantalla, e-CF y 607; ITBIS por producto; botón "aplicar ITBIS a todos" |
| B2 / H2 | Sin respaldos automáticos | ✅ Resuelto en código | Respaldo diario verificado, restauración probada (`npm run backup:verify`), API + pestaña *Respaldos*, activado por defecto en Electron. **Falta:** copia fuera del equipo y rol con `BYPASSRLS` en el servidor central |
| B3 / H3 | Producción e instalador desactualizados | ⏳ Requiere acción suya | No se desplegó ni se compiló el instalador. Pasos y verificación (`npm run verify:deploy`) en `docs/OPERACION.md`. Hoy producción sigue en `049` |
| B4 / H4 | Secretos compartidos en el instalador | ✅ Resuelto en código | Secreto de sesión y contraseña de PostgreSQL por instalación (`main.cjs`); `predist` ya no copia `APP_SESSION_SECRET`. **Falta:** compilar el instalador y probarlo en un equipo limpio |
| H5 | Límite de `registrar` | ✅ Resuelto | 300/10 min por IP, configurable; la app además recuerda la activación |
| H6 | Cobertura de pruebas | ◐ Mejorado | e2e (49) en CI, piso de cobertura y +40 pruebas unitarias; la cobertura unitaria sigue en 44 % (los routers los cubre el e2e) |
| H7 | Cobro sin caja abierta | ✅ Resuelto | 409 `CAJA_CERRADA` |
| H8 | Sin división de cuenta ni descuentos | ✅ Resuelto | Descuentos con motivo (migración 052) y cobro dividido por producto/cantidad |
| H9 | e-CF | ⏳ Externo | Los cálculos están alineados; falta la certificación con la DGII |
| H10 | Datos públicos del negocio | ✅ Resuelto en código | Solo equipos activados los reciben. **Producción los sigue exponiendo hasta desplegar** (comprobado con `verify:deploy`) |
| H11 | Token en `localStorage` | ⏳ No cambiado | Cambio de arquitectura (cookies httpOnly); mitigado por CSP `script-src 'self'` |
| H12–H13 | Comparaciones no constantes, `/api/setup` sin límite | ✅ Resuelto | `constantTimeEquals`; límite en `/api/setup` |
| H14 | Monitoreo | ◐ Documentado | `docs/OPERACION.md` §5 (UptimeRobot sobre `/api/health`); falta darlo de alta |
| H15 | Accesibilidad | ✅ Resuelto | 0 violaciones axe-core; contraste y nombres accesibles corregidos |
| H16 | Licencia ISC | ✅ Resuelto | `UNLICENSED` + `private` |
| H17 | Instalador pesado | ⏳ Sin cambio | Incluye el instalador de PostgreSQL |
| — | Zona horaria de la BD | ◐ Detectable | `/api/health` → `zonaHorariaBd`; verificar en producción |
| — | Legal y capacitación | ◐ Borradores | `docs/legal/` (requieren abogado) y `docs/MANUAL_USUARIO.md` |

**Nuevas defensas verificadas:** las rutas de negocio (133) rechazan peticiones sin credenciales; el cajero y el camarero no acceden a respaldos, ITBIS masivo ni horarios; un cobro parcial o con descuento inválido se rechaza sin tocar la cuenta.
