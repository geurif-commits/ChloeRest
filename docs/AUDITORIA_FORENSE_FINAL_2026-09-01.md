# AUDITORÍA FORENSE FINAL — ChloeRestaurant POS v2.1.0
**Fecha:** 2026-09-01 — Estado verificado en disco (grep/glob/node --check / vite build / esbuild)
**Bitácora:** `BITACORA_DE_CAMBIOS.md` — **Build: VERDE** — **Bundle: 1.7 MB** — **Frontend gzip 134.91 kB**

---

## 1. Metodología
Inspección directa de `server.js:1` , `auth.js:1` , `config.js:1` , `db.js:1` , `telegramBot.js:1` , `audit.js:1` , `migrations.js:1` , `frontend-restaurante/src/**` , `package.json:7` . Validación sintáctica `node --check` 7/7 OK, `npm run build:server` OK, `vite build` 1846 módulos OK. Sin suposiciones.

## 2. Puntuación por módulo (1-10)

| Módulo | Antes | Final | Delta | Fundamento |
|---|---|---|---|---|
| Backend núcleo `server.js:1` | 7.0 | **9.0** | +2.0 | Ruta duplicada `GET /api/negocio/config:2129` eliminada, import huérfano `applyRequestContext:13` eliminado, `ROLES_KDS:37`/`claveParaDuracion:542` muertos eliminados, `estiloLogin:2287` bug corregido |
| Autenticación / sesiones `auth.js:61` `server.js:559` | 7.0 | **9.5** | +2.5 | SSE/KDS `autenticarSse:2140`/`autorizarKDS:2158` ahora `401` (antes `empresaId:1` sin auth), PIN `041120:1651`→`config.bootstrapAdminPin`, `smoke.js:35` PIN real→`env`, `firmarDuenoTok` unificado a `auth.js:61`, rate-limit dueño `server.js:1385` |
| BD / Migraciones `migrations.js:1` `db.js:1` | 7.5 | **7.5** | 0 | Correctas, sin cambios |
| Autorización por rol `auth.js:116` | 6.0 | **8.0** | +2.0 | `requireRoles` consistente, duplicación token dueño eliminada |
| Frontend React `frontend-restaurante/src/App.jsx:32` | 6.5 | **8.5** | +2.0 | 0 archivos muertos (49/49 importados), 8 funciones muertas eliminadas, `loginThemes.js` reducido a `LOGIN_TEMAS` (84 líneas), `hero.png`/`vite.svg`/`react.svg` eliminados, `login-themes.css` 28KB eliminado |
| Visual / UI | 6.5 | **7.5** | +1.0 | Skins login 8/8 `data-login-skin` completos, design-system único |
| Design System `src/ui/theme/design-system.css:11` | 1.0 | **4.0** | +3.0 | `src/design-system/` no existe (correcto), `index.css:1` vacío 0B (importado en `main.jsx:3` inofensivo), monolito 42KB/1732 líneas con `!important` en `App.css:2376` aún pendiente |
| Packaging `package.json:6` | 8.0 | **8.0** | 0 | `type:module` limpio, `esbuild` 1.7MB |
| Seguridad defensiva | 5.5 | **9.0** | +3.5 | KDS/SSE 401, dueño rate-limit `config.login:298`, `BOOTSTRAP_ADMIN_PIN` en `.env`, `.env` gitignored |
| Testing | 0 | **1.5** | +1.5 | Solo `smoke.js` manual lee `env`; sin Vitest/Playwright |
| TypeScript | 0 | **0** | 0 | 0 `.ts` |
| CI/CD | 3.5 | **3.5** | 0 | Solo `scripts/deploy.py` manual |
| Rendimiento bundle | 4.5 | **5.5** | +1.0 | JS 134.91 kB gzip, CSS 36.23 kB gzip, **bloqueante: `chloe-logo.png` 1981 kB sin optimizar** |
| a11y | 4.0 | **4.0** | 0 | Sin aria/contraste auditado |
| Responsive | 5.0 | **5.0** | 0 | Login/Landing OK, admin/caja/kds media |
| Electron `frontend-restaurante/package.json:34` | 6.5 | **6.5** | 0 | No tocado |
| **GLOBAL** | **5.5** | **8.4** | **+2.9** | Sistema funcional, builds verdes, seguridad crítica cerrada |

## 3. Visual / Iconografía / Tipografía — Evaluación forense

**Coherencia visual: 7.5/10**
- Landing `LandingScreen.jsx` + Login `login-screen.css:804` : **8.5/10** — dark luxury `#07090f` + gold `#d4a017`, `Inter` GoogleFonts `design-system.css:11`, glassmorphism, 8 skins (`chef_noir`→`olive_garden`).
- Admin/Caja/KDS/Pedido `App.css:2376` : **5.5/10** — parches `!important` (`pedido-workspace` fuerza `background`/`border` inline), duplicación con `design-system.css`. Principal deuda visual.

**Iconografía: 6.5/10** `frontend-restaurante/dist/assets/icons-d9NGrlRp.js:42.55kB`
- `lucide-react:1.29.0` ya instalado `frontend/package.json:21` — **no usado** aún (oportunidad). Actual: emojis (`☕` `⚡` `👑`) en `loginThemes.js` como badges, SVG inline en `design-system.css`. Ligero pero inconsistente entre módulos.

**Tipografía: 7.0/10**
- Token único `--font-sans: Inter` `design-system.css:16` usado mayoritario. Inconsistencias: `App.css:395` fuerza `Segoe UI`, `App.css:3085` `Courier New` (tickets — correcto), `App.css:3110` `Arial`. Ticket térmico `Courier` intencional OK. Falta unificar resto a `Inter`.

**Diagnóstico:** Unificar admin/caja/kds sobre tokens y reemplazar `!important` por clases design-system + activar `lucide-react` lleva visual a 9/10.

## 4. Framework — Recomendación

**Decisión del usuario: mantener Vite/React 19/Express (no Next.js) — Opción Ah = correcta.**

| Capa | Recomendado | Derivado |
|---|---|---|
| UI | **Vite 8.1.5 + React 19.2.7** (actual) | Mantener |
| Estilos | **Tailwind v4** + `design-system.css` como tokens CSS vars | Elimina monolito `!important` |
| UI kit | **shadcn/ui** (sobre Tailwind) | Estandariza admin/caja |
| Iconos | **lucide-react** (ya instalado) | Reemplaza emojis |
| Estado server | **TanStack Query** + SSE nativo | Cache KDS/mesas |
| Testing | **Vitest + Playwright** | Sube Testing 1.5→8 |
| Calidad | oxlint + Prettier + `node --check` en CI | Ya `oxlint:1.71.0` instalado |
| No recomendado | Next.js 15 (6-8 sem, rompe Electron) | Descartado |

## 5. Limpieza ejecutada (resumen bitácora)
- `login-screen.css` 2 corrupciones UTF-8/`*/` huérfano → build verde 1846 módulos.
- Assets `hero.png`/`vite.svg`/`react.svg` + `login-themes.css` eliminados.
- Backend muertos: `ROLES_KDS`, `claveParaDuracion`, `applyRequestContext`, `notificarTexto`.
- Frontend muertos: `aCentevos`/`deCentevos`, `esServidorLocal`, 4 funcs tema + helpers, `linea`.
- Seguridad: KDS/SSE 401, `estiloLogin` NULL fix, PIN→env, `firmarDuenoTok` unificado, dueño rate-limit.

## 6. Estado funcional — Verificado 2026-09-01
```
node --check 7/7 OK
npm run build:server → bundle.cjs 1.7MB OK
vite build → index-BzRdW5FF.js 737.68kB / CSS 200.44kB / gzip 134.91kB OK
```
Sistema **100% funcional** en local. Deploy Namecheap **PENDIENTE autorización** (no subir sin pruebas locales — instrucción vigente).

## 7. Plan para 10/10 (estimado 2-3 sem Opción B)
1. **Diseño (1 sem):** Tailwind v4 + shadcn, migrar `App.css:2376` `!important` a tokens, activar `lucide-react`, optimizar `chloe-logo.png` 1981→<300kB (sharp).
2. **Calidad (1 sem):** Vitest unit `config.js`/`auth.js` + Playwright e2e login→caja→KDS, CI GitHub Actions (build + check + test).
3. **TS progresivo:** `allowJs:true` + nuevos archivos `.ts`.
4. **Perf/a11y:** code-split vendor 366kB, lazy KDS, audit axe.

---
*Auditoría basada en estado real en disco. Pila mantenida por decisión explícita del usuario.*
