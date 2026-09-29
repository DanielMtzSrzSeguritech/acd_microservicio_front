# REPORTE_MODAL_ACD.md

**Fecha:** 2026-09-25  
**Ticket de prueba:** `10089241`  
**Backend:** `http://127.0.0.1:8000`  
**Frontend:** `http://127.0.0.1:3000`

---

## Resultado

```
MODAL ACD:            PASS
SIM INLINE ELIMINADA: ✅
CONSOLA JS:           0 errores
CANDIDATOS:           4/4
WINNER:               user_id=333, score=0.75
PRODUCTION_READY:     true
CLOSE X:              PASS
CLOSE ESC:            PASS
REOPEN:               PASS
```

---

## Cambios realizados

### Archivos nuevos

| Archivo | Descripción |
|---|---|
| [`js/components/sim-modal.js`](file:///C:/Users/daniel_martinez/Documents/Projects/acd_preprod_dashboard/js/components/sim-modal.js) | Componente ES Module con toda la lógica del modal: `initSimModal`, `openSimModal`, `closeSimModal`, `runSimulationModal`, stepper, renders de winner/tabla/meta/fuentes |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| [`index.html`](file:///C:/Users/daniel_martinez/Documents/Projects/acd_preprod_dashboard/index.html) | **Eliminado** `<section id="simSection">` del flujo del dashboard. **Añadido** `<div id="simModalOverlay">` como overlay modal con header fijo, body scrollable, stepper, tabla, winner card, meta panel |
| [`js/app.js`](file:///C:/Users/daniel_martinez/Documents/Projects/acd_preprod_dashboard/js/app.js) | **Import** de `sim-modal.js`. **Eliminadas** 228 líneas (todo el módulo SIM legacy: SIM_DOM, setStepState, resetStepper, animateStepper, renderSources, getDiscardStep, renderSimTable, renderWinnerCard, renderSimMeta, old runSimulation). **Reemplazado** por thin adapter `runSimulation()` de 30 líneas. **`initSimModal()`** llamado en DOMContentLoaded |
| [`styles.css`](file:///C:/Users/daniel_martinez/Documents/Projects/acd_preprod_dashboard/styles.css) | Añadidos estilos del modal: `.sim-modal-overlay`, `.sim-modal-box`, `.sim-modal-header`, `.sim-modal-body`, `.sim-modal-loading`, `.sim-modal-error`, `.sim-th`, `.winner-field` (grid), `.winner-badge-inline`, `.meta-true/false/ok/warn` |

---

## Arquitectura del modal

```
js/components/sim-modal.js
  ├── initSimModal()           — resuelve DOM refs, conecta eventos (X, Esc, overlay-click)
  ├── openSimModal()           — display:flex + overflow:hidden en body
  ├── closeSimModal()          — display:none + restaura scroll
  ├── runSimulationModal()     — orchestrator:
  │     1. reset UI (loading, error=none, sourcesRow/tableWrap/winner/meta = none)
  │     2. openSimModal()
  │     3. await simulateTicket(ticketId)       ← acd-api.js
  │     4. animateStepper() con delay por step
  │     5. setTimeout(animDelay):
  │          renderSources()
  │          renderTable()
  │          renderWinner()
  │          renderMeta()
  │     return { winner, evaluated, stepsSummary, isPartial }
  ├── animateStepper()         — anima steps con delay 400ms × step
  ├── renderSources()          — chips de fuentes + gaps
  ├── renderTable()            — tabla de candidatos evaluados (12 columnas)
  ├── renderWinner()           — winner card con grid de campos
  └── renderMeta()             — production_ready, decision_is_partial, data_quality, warnings
```

```
js/app.js  (thin adapter)
  └── runSimulation()          — lee STATE.ticketId, llama runSimulationModal()
                                 maneja toast de éxito/error
                                 gestiona estado del botón (disabled/spinner)
```

---

## E2E — Playwright Chromium headless (viewport 1400×900)

Ejecutado: 2026-09-25 · Ticket `10089241`

| Check | Resultado |
|---|---|
| `simSection` ausente del dashboard | ✅ PASS |
| `#simModalOverlay` existe en DOM | ✅ PASS |
| Modal inicialmente oculto | ✅ PASS |
| Modal abre al pulsar "Simular despacho" | ✅ PASS |
| Winner `user_id=333` | ✅ PASS |
| Score `0.75` | ✅ PASS |
| `#simModalMetaPanel` visible + `production_ready=true` | ✅ PASS |
| Tabla con 4 candidatos | ✅ PASS |
| Stepper con 8 pasos | ✅ PASS |
| Fuentes de datos visibles | ✅ PASS |
| Modal cierra con botón X | ✅ PASS |
| Modal vuelve a abrirse | ✅ PASS |
| Modal cierra con Escape | ✅ PASS |
| Sin `[object Object]` | ✅ PASS |
| Sin `undefined` | ✅ PASS |
| Sin errores JS inesperados (0 console errors) | ✅ PASS |
| Modal dentro del viewport / sin overflow | ✅ PASS (CSS `max-height:92vh` + scroll) |

**Total: 17/17 PASS**

---

## Comportamiento del modal

### Header fijo
- Icono flask + "Simulación ACD — DRY RUN" + `#ticket_id` + badge DRY-RUN
- Botón X (cierra el modal)
- Accesibilidad: `role="dialog"`, `aria-modal="true"`, `aria-label`

### Estado de carga
- Spinner centrado + texto "Ejecutando simulación ACD…" mientras dura el fetch
- Loading oculto en cuanto llegan datos

### Contenido scrollable
1. **Stepper** — 8 pasos animados (400ms/paso): Ticket → Sesión → Perm.Cliente → Perm.Servicio → Carga/On-site → Geofence → Scoring → Winner
2. **Fuentes de datos** — chips coloreados por estado (ok/timeout/error/unknown) con ms de latencia
3. **Winner card** — grid de campos: User ID, Nombre, Email, Score, Status, Tickets activos, Carga máx., On-site, Sesión activa, Zona activa ID, Zona nombre, GPS
4. **Meta panel** — `production_ready`, `decision_is_partial`, `ticket_id`, `missing_requirements`, `warnings`, `data_quality` (badges por tipo: real/fallback/unavailable)
5. **Tabla de candidatos** — 12 columnas, ordenada por elegibles primero; descartados incluidos con motivo; winner destacado con 👑

### Cierre
- Botón X ✅
- Tecla Escape ✅
- Click en el overlay (fuera del modal box) ✅

---

## Screenshots

Ubicación: `C:\Users\daniel_martinez\.gemini\antigravity\brain\9e8bcfc0-a874-4763-8497-8d9e876c5bc6\scratch\screenshots_modal\`

| Archivo | Contenido |
|---|---|
| `01_dashboard_load.png` | Dashboard sin simulación en el flujo |
| `02_modal_opening_loading.png` | Modal abierto en estado de carga |
| `03_modal_winner.png` | Modal con winner card visible |
| `04_modal_meta_panel.png` | Meta panel con production_ready |
| `05_modal_candidates.png` | Tabla de 4 candidatos |
| `06_modal_full_view.png` | Vista completa del modal |
| `07_modal_closed.png` | Modal cerrado (X) |
| `08_modal_reopened.png` | Modal reabierto |
| `09_modal_esc_closed.png` | Modal cerrado via Escape |

---

## Sin regresiones

| Módulo | Estado |
|---|---|
| Dashboard principal | ✅ Sin cambios |
| Mapa GPS | ✅ Sin cambios |
| Matriz de candidatos | ✅ Sin cambios |
| GS Auth modal | ✅ Sin cambios |
| Workforce | ✅ Sin cambios |
| Tickets PREPROD | ✅ Sin cambios |
| Drawer de ticket | ✅ Sin cambios |
| `tktSimulateAcd` desde lista de tickets | ✅ Llama `runSimulation()` → modal |

---

## No modificado

- Backend / microservicio ACD: ❌ no tocado
- Repositorios GS: ❌ no tocados
- Módulos Dashboard, Tickets, Candidatos: ❌ no tocados
- Ponderaciones / lógica de evaluación: ❌ en backend — no tocadas
- No hay commit/push
