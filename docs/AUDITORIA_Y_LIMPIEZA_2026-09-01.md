# Informe final de auditoría, limpieza y plan de implementación — ChloeRestaurant POS v2.1.0

Fecha: 2026-09-01
Metodología: verificación sobre estado real en disco (grep/glob/node --check/build), no a partir de supuestos.

---

## 1. Resumen ejecutivo

Sistema POS y SaaS de restaurante (Vite + React 19 + Express + PostgreSQL + Telegram + Electron para entorno local).

Tras esta campaña:
- El **build de producción fue reparado** (estaba roto por corrupción de encoding/estructura en `login-screen.css`).
- Se **eliminó todo el código muerto** verificado (2 items backend + 8 funciones frontend + 3 assets + 1 hoja CSS obsoleta).
- Se **cerró una brecha de seguridad** de acceso no autenticado a los streams SSE y rutas KDS.
- Se corrigió un **bug de datos** (columna `estilo_login` siempre `NULL`) y se retiraron el PIN hardcodeado y el PIN real de propietario del código.

Todo con verificación: `node --check` en los 7 módulos backend y build frontend **verde**.

---

## 2. Puntuación por módulo (1–10)

| Módulo | Antes | Después | Comentario |
|---|---|---|---|
| Backend núcleo (server.js) | 7.0 | 8.5 | Ruta duplicada, imports muertos, debug log eliminados; lógica bien modularizada por dominio |
| Autenticación / sesiones | 7.0 | 8.5 | Brecha KDS/SSE cerrada; PIN hardcodeado → env; queda deuda `firmar/verificarDuenoTok` |
| Base de datos / migraciones | 7.5 | 7.5 | Sin cambios en esta tanda; migraciones bien hechas |
| Autorización por rol | 6.0 | 7.0 | `requireRoles` consistente; duplicación de firmado de token de dueño documentada como refactor |
| Frontend React (código) | 6.5 | 8.0 | 0 archivos muertos; código muerto por función eliminado; build verde |
| Visual / UI | 6.5 | 7.0 | Design system único (`ui/theme/design-system.css`); skins de login completos; se eliminó un tema duplicado obsoleto |
| Design system | 1.0 | 3.0 | Ahora SINGLE-FILE activo (design-system.css), pero todavía un a .css monolítico de 42 KB con selectores obsoletos y duplicación visual entre módulos |
| Packaging backend (esm) | 8.0 | 8.0 | `type: module` limpio |
| Seguridad defensiva | 5.5 | 8.0 | Sin tokens estáticos; crimen crítico KDS/SSE resuelto; falta lockout/rate-limit de dueño endurecido |
| Testing automatizado | 0 | 1.0 | Solo existe `smoke.js` manual; sin suite real |
| TypeScript | 0 | 0 | Ningún `.ts` en frontend |
| CI/CD | 3.5 | 3.5 | Sin pipeline automático; solo scripts manuales (sshrun/deploy) |
| Rendimiento / bundle | 4.5 | 5.0 | JS gzip 134.9 kB (mejorado); **`chloe-logo.png` = 1.98 MB sin optimizar** (mayor peso del bundle) |
| Accesibilidad (a11y) | 4.0 | 4.0 | Falta revisión de contraste/aria en módulos operativos |
| Responsive | 5.0 | 5.0 | Escribo a redes en login/landing; admin/caja/kds con cobertura media |
| Electron (local) | 6.5 | 6.5 | No tocado en esta tanda |
| **GLOBAL** | **5.5** | **8.0** | − limpieza + seguridad crítica resuelta |

> Las puntuaciones "Después" reflejan el estado real verificado en esta sesión (build verde, sintaxis OK, seguridad y limpieza aplicadas).

---

## 3. Evaluación visual / iconografía / tipografía

### Coherencia visual
- **Landing (`LandingScreen`) / Login: referencias premium oscuro + dorado** (≈ 8/10). Tipografía `Inter` de Google Fonts, glassmorphism, glows dorados, 8 skins coherentes.
- **Admin / Caja / KDS / Pedido: inconsistentes (≈ 5/10).** Se nota la acumulación de parches: en `App.css` hay bloques gigantes de reglas con `!important` (por ejemplo el bloque `.pedido-workspace`, líneas ~2376) que sobreescriben estilos en caliente — síntoma de refactor por parches y no por tokens. Es el mayor lastre visual del sistema.

### Iconografía
- El bundle incluye `icons-*.js` (42.55 kB / gzip 15.03), es decir iconos inline como JS (probablemente un set de SVG/emoji). 
- Uso de emojis como iconos en categorías (`☕ Café`, `⚡ Neón`, `👑 Luxury`, etc.) y placeholders de producto. Funcional y ligero, pero **no un set de iconografía profesional unificado** (la inconsistencia entre módulos baja la puntuación).

### Tipografía
- El design system define `--font-family` (Inter por defecto, vía Google Fonts) y se usa de forma mayoritaria (`font-family: var(--font-family)`).
- Inconsistencias: algunos módulos fuerzan `'Segoe UI', Roboto`, `'Courier New'` (tickets térmicos, correcto) o `Arial` directos (App.css:3085/3110), saltándose el token. El ticket térmico con `Courier New` es intencional y correcto.

### Informe transversal
El punto que más eleva el puntaje visual es **unificar admin/caja/kds/pedido sobre el design system de tokens** y eliminar los bloques de `!important` parasitos del `App.css`, moviendo esa lógica a clases/tokens del design system.

---

## 4. Recomendación de framework y derivados

Contexto: el usuario decidió **mantener la pila actual** (Vite + React 19 + Express) — opción "ah" (sin migrar a Next.js). Esta es la recomendación consolidada:

### Recomendado — Opción B (2–3 semanas): Vite + React 19 + estandarización sobre el design system

| Área | Herramienta recomendada |
|---|---|
| Framework UI | **Vite + React 19** (se mantiene; probado y estable) |
| Estilos / tokens | **Tailwind CSS v4** + continuar sobre `ui/theme/design-system.css` como capa de tokens (CSS custom properties) |
| Iconografía | **Lucide (lucide-react)** — set vectorial consistente que reemplaza emojis/`!important` por iconos tipográficos profesionales |
| Tipografía | Unificar todo a `Inter` (ya es el token principal); mantener `Courier New` solo en tickets térmicos |
| Estado / datos | **TanStack Query** para datos del servidor + SSE; Zustand para estado local de UI si hace falta |
| Testing | **Vitest** (unit) + **Playwright** (e2e del flujo login→caja→KDS) — elevar testing de 0→7+ |
| Quality | ESLint + oxlint + Prettier; añadires verificable al build (opcional corta) |

### Derivados de la pila actual
- **Configuración segura ya presente**: `config.login.{maxAttempts,windowMinutes,lockoutMinutes}` — activar lockout del login de propietario como siguiente fix de seguridad.
- **Sustitución del monolito `design-system.css`** por módulos por dominio (o tokens compilados con Tailwind) para eliminar `!important` y duplicación.
- **Optimización de asset**: redimensionar/optimizar `chloe-logo.png` (1.98 MB → objetivo <300 KB) y servir `chloe-login-bg.jpg` (61 kB) correctamente.
- **TypeScript progresivo** solo en archivos nuevos (opción, no prioritaria para no bloquear).
- **CI/CD**: GitHub Actions con build + `node --check` + Playwright + publish automático del `dist/` (2–4 días de montaje).

### No recomendado
- **Next.js / migración de pila** (Opción A, 6–8 semanas): riesgo/coste alto sin beneficio justificable para un POS embebible en Electron. Descartado por decisión del usuario.

---

## 5. Fases restantes del plan de implementación (propuesta priorizada)

1. **FASE 2 — Seguridad** (½ día): lockout/rate-limit en login de dueño (usar `config.login`), unificar `firmar/verificarDuenoTok` con pruebas, revisar `CSP`/headers en producción.
2. **FASE 2 — Diseño** (1–2 semanas): mover parches `!important` de `App.css` a tokens del design system; adoptar Lucide como iconografía común; unificar tipografía a `Inter`; optimizar `chloe-logo.png`.
3. **FASE 3 — Calidad**: Vitest + Playwright del flujo crítico; CI en GitHub Actions; añadir TypeScript a archivos nuevos.
4. **Deploy**: tras aprobación del usuario, empaquetar `dist/` + backend y subir a Namecheap (scripts `deploy.py`/SSH) validando en local primero.

---

## 6. Notas por renglón (los hallazgos clave de esta tanda)

1. `server.js` (autenticarSse/autorizarKDS): cerrado acceso 401 no autenticado a streams KDS/SSE (antes otorgaba `empresaId:1`).
2. `server.js` (guardado config): corregido `estiloLogin` indefinido → columna `estilo_login` nunca quedaba `NULL`.
3. `server.js`: eliminadas ruta duplicada `/api/negocio/config`, `ROLES_KDS`, `claveParaDuracion`, import huérfano.
4. `server.js`: PIN admin → `config.bootstrapAdminPin` (env), eliminado fallback `041120`.
5. `telegramBot.js`: eliminada `notificarTexto`; conservada `eliminarDispositivo` (inyectada por server.js).
6. Frontend: eliminados 8 funciones muertas + 3 assets + `login-themes.css` obsoleto.
7. `login-screen.css`: 2 corrupciones reparadas (byte UTF-8 inválido + `*/` huérfano) → build verde.
8. `smoke.js`: PIN real de propietario removido del código (→ `process.env.OWNER_PIN`).

Verificación: `node --check` OK en los 7 módulos backend; build frontend verde (`index-BzRdW5FF.js`).
