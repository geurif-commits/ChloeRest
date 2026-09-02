# RUNBOOK DE CERTIFICACIÓN DGII — ChloeRestaurant POS
**Versión:** 2.1.0 · **Estado:** en espera de certificación · **Última actualización:** 2026-09-02

Guía ejecutable paso a paso para completar la certificación ante la DGII (Ley 32-23,
Decreto 587-24, NG 06-2018). Complementa los documentos 01–04 de `docs/dgii/`.

---

## 1. Prerrequisitos del contribuyente (fuera del sistema)

| # | Requisito | Dónde se obtiene | Estado típico |
|---|-----------|------------------|---------------|
| 1 | RNC Activo, sin omisiones ni deudas | dgii.gov.do → OFV | Verificar |
| 2 | Clave de acceso a la OFV | dgii.gov.do | Verificar |
| 3 | Certificado digital (firma electrónica) | PSC / proveedor autorizado | Pendiente |
| 4 | Formulario FI-GDF-016 firmado | docs/dgii/01_carta_solicitud.md | Pendiente |

## 2. Configuración del sistema (panel Administrador → DGII)

- [ ] **Emisor** (`/api/dgii/emisor`): RNC, razón social, dirección, régimen fiscal.
- [ ] **Configuración** (`/api/dgii/config`): credenciales AlgoBack (usuario, API key,
      ambiente `pruebas` → luego `produccion`), endpoint base.
- [ ] **Secuencias** (`/api/dgii/secuencias`): crear una por tipo (E31, E32, E33, E34)
      con el rango autorizado por la DGII, fecha de vencimiento y número inicial.
- [ ] **Costos de insumos**: cargar `costo_unitario` en cada ingrediente (Inventario).
      Si un insumo no tiene costo, el reporte 606 usa el valor por defecto **50.00**
      (ver §4). Para la certificación deben cargarse los costos reales.
- [ ] **Ambiente de pruebas**: verificar que `dgii_config` apunta al ambiente de
      homologación de AlgoBack.

## 3. Pruebas de homologación (ambiente DGII)

Ejecutar contra el ambiente de pruebas de AlgoBack/DGII:

- [ ] **E31** (consumo): emitir 1 e-CF a un RNC real de cliente → respuesta `Aprobado`.
- [ ] **E32** (costo < 250,000): emitir 1 e-CF a consumidor final (sin RNC).
- [ ] **E32** (costo ≥ 250,000): emitir 1 e-CF con RNC de comprador obligatorio.
- [ ] **E33** (ingresos por cuenta): emitir 1 e-CF.
- [ ] **E34** (nota de crédito): anular un e-CF aprobado previamente.
- [ ] **Envío diferido**: verificar que `IndicadorEnvioDiferido = 1` y que la consulta
      por `trackId` devuelve estado del envío.
- [ ] **Reporte 607** mensual: generar TXT (formato oficial) y validar estructura
      `607|RNC|PERIODO|N`.
- [ ] **Reporte 606** mensual: generar TXT y validar estructura `606|RNC|PERIODO|N`.
- [ ] **CSV**: generar ambos reportes en CSV para conciliación interna.
- [ ] **Alertas de secuencias**: agotar rango bajo (simular) y verificar que
      `/api/dgii/secuencias/alertas` avisa.

### Endpoints de verificación rápida
```bash
# Estado de salud del módulo
GET /api/dgii/config
GET /api/dgii/emisor
GET /api/dgii/secuencias
GET /api/dgii/secuencias/alertas
GET /api/dgii/ecf/historial
# Envío / consulta / anulación
POST /api/dgii/ecf/enviar      { tipoECF, ncf, ... }
GET  /api/dgii/ecf/consultar/:trackId
POST /api/dgii/ecf/anular
# Reportes mensuales (formato = json | txt | csv)
GET /api/dgii/reporte-607?anio=AAAA&mes=MM&formato=txt
GET /api/dgii/reporte-606?anio=AAAA&mes=MM&formato=txt
```
Todos los endpoints requieren token de Administrador o del Propietario (`Bearer`).

## 4. Notas fiscales importantes

1. **Monto del 606**: el reporte usa `ingredientes.costo_unitario × cantidad`.
   El fallback de 50.00 por insumo sin costo **debe eliminarse cargando costos reales**
   antes de producir el reporte oficial del primer período certificado.
2. **Conservación**: los XML firmados y e-CF deben conservarse 10 años (Art. 15 Ley 32-23).
3. **RNC del receptor**: la validación de RNC usa módulo 11 (9 dígitos) y módulo 10
   (cédula 11 dígitos), alineado con la especificación DGII; no sustituye la validación
   en línea contra la OFV (`/api/dgii/validar-rnc/:rnc` consulta el servicio cuando la
   configuración lo permite).
4. **Cambio a producción**: al aprobar la homologación, cambiar el ambiente en
   `dgii_config`, regenerar secuencias con los rangos definitivos y **verificar una
   emisión real** en un día de operación antes del primer cierre mensual.
5. **Congelamiento**: mientras dura el proceso de certificación, **no modificar** la lógica
   de `lib/ecf.js`, `lib/dgii.js` ni los endpoints `/api/dgii/*` sin re-ejecutar este runbook
   completo y la suite de tests (`npm test`).

## 5. Criterios de aceptación para declarar "lista para certificar"

- [ ] 19+ tests de la suite en verde (`npm test`).
- [ ] Pruebas de homologación §3 completadas con respuesta `Aprobado` en E31–E34.
- [ ] Reportes 606/607 TXT validados por la DGII (o por el proveedor AlgoBack).
- [ ] Costos reales cargados en el 100% de los insumos activos.
- [ ] Secuencias cargadas con rangos reales y vencimiento correcto.
- [ ] Este checklist ejecutado de principio a fin sin errores de servidor
      (revisar `server.err` / logs estructurados).
