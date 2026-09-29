# PLAN DE REFACTOR — Frontend ACD Dashboard

> **Fecha:** 2026-09-24  
> **Referencia UX/UI:** `auditor-tool-ia_v1.0_12Jun26`  
> **Frontend actual:** `acd_preprod_dashboard`  
> **Backend:** `acd_microservice` (FastAPI)  
> **Modo:** SOLO ANÁLISIS — no se modificó ningún archivo.

---

## ÍNDICE

1. [Arquitectura del proyecto de referencia](#1-arquitectura-del-proyecto-de-referencia)
2. [UX/UI del proyecto de referencia](#2-uxui-del-proyecto-de-referencia)
3. [Análisis del frontend ACD actual](#3-análisis-del-frontend-acd-actual)
4. [Arquitectura objetivo para ACD](#4-arquitectura-objetivo-para-acd)
5. [Módulo Candidatos](#5-módulo-candidatos)
6. [SLA — Representación actual vs propuesta](#6-sla--representación-actual-vs-propuesta)
7. [Componentización propuesta](#7-componentización-propuesta)
8. [Reutilizar vs Rehacer](#8-reutilizar-vs-rehacer)
9. [Riesgos](#9-riesgos)
10. [Plan de implementación por fases](#10-plan-de-implementación-por-fases)

---

## 1. Arquitectura del proyecto de referencia

### 1.1 Framework / Stack

| Aspecto | Valor |
|---|---|
| Framework | **Ninguno** — HTML + vanilla JS |
| Estilos | **Tailwind CSS (CDN)** + CSS custom mínimo (53 líneas) |
| Tipografía | Inter (Google Fonts) + JetBrains Mono |
| Iconos | Font Awesome 6.4 |
| Build tool | Ninguno — archivos estáticos abiertos directamente en navegador |
| Datos | Objeto JS literal en `report-data.js` (datos simulados/generados) |

### 1.2 Estructura de carpetas

```
auditor-tool-ia_v1.0_12Jun26/
├── readme.txt
├── reportes-generados/
│   └── reporte_YYYY-MM-DD_HH-MM_nombre/
│       ├── index.html          ← Layout + estructura HTML (~295 líneas)
│       ├── styles.css          ← Animaciones, scrollbar, keyframes (53 líneas)
│       ├── report-data.js      ← Datos: remediationData, attackVectors, scenarioExplorers (546 líneas)
│       └── logic.js            ← Funciones: updateScoreSim, filterFindings, sortTable, etc. (264 líneas)
└── __no_tocar__/
    ├── AUDITOR.md              ← Orquestador del generador
    ├── ___report-styles.md     ← Especificación visual detallada
    ├── ___vulnerabilities-catalog.md
    ├── ___environments-guide.md
    ├── ___security_audit_report_plantilla.html
    └── referencia__reporte_ejemplo/  ← Referencia visual canónica
```

### 1.3 Separación de archivos (patrón clave)

El proyecto impone una **regla absoluta: NUNCA generar HTML monolítico**. Todo reporte se divide en 4 archivos independientes:

| Archivo | Responsabilidad | Líneas típicas |
|---|---|---|
| `index.html` | Estructura HTML + layout + referencias externas | ~295 |
| `styles.css` | CSS custom: keyframes, scrollbar, shadows | ~53 |
| `report-data.js` | Datos puros: objetos `remediationData`, `attackVectors`, `scenarioExplorers` | ~546 |
| `logic.js` | Comportamiento: score, filtros, sort, modales, toasts, init | ~264 |

**Lección para ACD:** La separación datos/lógica/estilos/layout es fundamental. El proyecto ACD actual tiene **1 archivo JS de 1,747 líneas** que mezcla todo.

### 1.4 Componentes y patrones identificados

#### Páginas / Secciones
- **Header**: Score circular + badges de stack + estado general
- **Panorama de Riesgo**: Gauge SVG animado + barra horizontal con burbuja deslizante
- **KPI Cards** (5): Críticas, Altas, Medias, Cumple, No aplican — clickeables como filtros
- **Hallazgos Principales**: Lista filtrable con tabs (Todos/Críticas/Altas/Medias)
- **Matriz de Cumplimiento**: Tabla completa filtrable y sortable con 6 columnas
- **Plan de Acción**: Cards de remediación con código vulnerable/seguro

#### Componentes reutilizables conceptualmente

| Componente referencia | Equivalente ACD | Reutilizable |
|---|---|---|
| KPI Cards (5 métricas) | Cards de resumen (5) | ✅ Patrón directo |
| Tabla sortable + filtrable | Matriz candidatos / Tickets | ✅ Patrón directo |
| Filter tabs (Todos/tipo) | Tickets tabs (No asignados/Asignados/Errores) | ✅ Patrón directo |
| Drawer lateral (remediación) | Drawer de ticket (ya existe) | ✅ Ya implementado |
| Modal (hack simulation) | Modal de candidato (ya existe) | ✅ Ya implementado |
| Toast notifications | Toast (ya existe) | ✅ Ya implementado |
| Score gauge SVG | Podría usarse para SLA compliance | 🔶 Adaptable |
| Stepper animado | Stepper de cascada ACD (ya existe) | ✅ Ya implementado |
| Data-attribute filtering | Usado en matriz actual | ✅ Ya implementado |
| Table sort por columna | No existe en ACD actual | ✅ Necesario |

### 1.5 Patrones de código

#### Filtrado por data-attributes
```js
// Referencia: filterMatrix() - filtra filas de tabla por data-estado
document.querySelectorAll('.matrix-row').forEach(row => {
  const estado = row.getAttribute('data-estado');
  row.style.display = (category === 'all' || estado === category) ? 'table-row' : 'none';
});
```

#### Sort de tabla
```js
// Referencia: sortTable() - sort ascendente/descendente por columna
const rows = Array.from(tbody.querySelectorAll('tr.matrix-row'));
rows.sort((a, b) => { /* comparación por celda */ });
rows.forEach(r => tbody.appendChild(r));
```

#### Separación datos/lógica
```js
// report-data.js: SOLO datos
const remediationData = { 1: { title, desc, severity, vulnCode, secCode, tip }, ... };
const attackVectors = { 'key': ['line1', 'line2', ...], ... };

// logic.js: SOLO comportamiento
function openRemediation(id) { const data = remediationData[id]; /* render */ }
function triggerHackSimulation(type) { const lines = attackVectors[type]; /* animate */ }
```

### 1.6 Manejo de estados

| Estado | Implementación referencia |
|---|---|
| Loading | Score counter animado (0→valor), stroke-dashoffset transition |
| Empty | No aplica (datos siempre pre-generados) |
| Error | No tiene manejo de errores (datos estáticos) |
| Feedback | Toast en esquina inferior derecha con iconos y auto-dismiss |
| Interacción | Hover translateY(-3px) en cards, translateX(4px) en items |

### 1.7 Paginación

La referencia **NO tiene paginación** — muestra todos los controles en una tabla. Para ACD esto es un **anti-patrón**: la tabla de candidatos/tickets puede tener cientos de filas.

---

## 2. UX/UI del proyecto de referencia

### 2.1 Lo que hace BIEN y por qué

#### ✅ Jerarquía visual clara
- **Header oscuro** (`bg-gradient-to-r from-[#0B153C]`) contrasta con **body claro** (`bg-[#F4F6FC]`)
- Score circular es el punto focal inmediato
- Badges de stack dan contexto técnico instantáneo
- KPI cards con iconos y porcentajes dan panorama en 2 segundos

#### ✅ Densidad de información controlada
- Grid de 2 columnas: izquierda (score + KPIs + acciones) vs derecha (hallazgos)
- Cards compactas con hover sutil, no abruman
- Tabla con filas espaciadas (`border-spacing: 0 6px`) — respira

#### ✅ Feedback visual semántico
- Colores con significado consistente: rojo=crítico, naranja=alto, amarillo=medio, verde=cumple, indigo=no aplica
- Badges con borde de color + fondo translúcido (`bg-red-50 border border-red-100 text-red-500`)
- Pulsaciones animadas en botones de hackeo (`animate-pulse`)

#### ✅ Interacciones progresivas (drill-down)
1. KPI card → filtra hallazgos
2. Hallazgo en lista → abre drawer de remediación
3. Botón "Hackeo Posible" en tabla → abre modal de simulación de ataque
4. Botón "Más Info" en modal → abre panel de análisis detallado
5. "Simular Corrección" → toast + actualiza score

#### ✅ Separación de responsabilidades UI
- Header = identidad + score + estado
- Hallazgos = panel de contexto rápido con filtros
- Matriz = tabla completa de auditoría con sort + filtro
- Drawers/Modales = detalle bajo demanda (no ocupa espacio permanente)

#### ✅ Consistencia visual
- Todos los cards: `rounded-2xl shadow-premium border border-slate-200/60`
- Todos los badges: misma tipografía `text-[9px] font-bold px-2 py-0.5 rounded-md`
- Misma paleta aplicada consistentemente

#### ✅ Micro-interacciones
- Cards hover: `translateY(-3px)`
- Score counter: animación 0→valor en 20ms intervals
- Score gauge: `stroke-dashoffset` transition 1.6s
- Stepper: delays escalonados por step
- Screenshake en modal de hack
- Toast slide-in desde la derecha

### 2.2 Lo que NO aplica directamente a ACD

| Característica | Razón |
|---|---|
| Tema claro (bg-[#F4F6FC]) | ACD usa tema oscuro por operación 24/7 — mantener |
| Datos estáticos/pre-generados | ACD necesita datos dinámicos de APIs |
| Sin paginación | ACD maneja cientos de registros |
| Sin responsive mobile-first | ACD se usa principalmente en desktop, pero debe mejorar |
| Sin estado de error | ACD ya tiene manejo de errores que debe conservar |

---

## 3. Análisis del frontend ACD actual

### 3.1 Stack actual

| Aspecto | Valor | Problema |
|---|---|---|
| Framework | **Ninguno** — vanilla JS | Viable pero requiere disciplina de modulación |
| Archivos | **3 archivos total** | Todo el JS en 1 archivo monolítico |
| `index.html` | 448 líneas | Mezcla todas las secciones en un solo scroll |
| `app.js` | **1,747 líneas** | ⚠️ Crítico — mezcla config, state, API, render, UI |
| `styles.css` | 1,652 líneas | Organizado pero extenso |
| Mapa | Leaflet 1.9.4 | Funcional |
| Iconos | Font Awesome 6.5 | OK |
| Estilos | CSS custom (variables, sin framework) | Funcional pero no usa utilidades |

### 3.2 Problemas identificados

#### 🔴 CRÍTICO: Monolito JavaScript (app.js — 1,747 líneas)

El archivo `app.js` contiene **TODO**:

| Sección | Líneas | Responsabilidad |
|---|---|---|
| Config + State | 1–30 | Credenciales, URLs base, estado global |
| Map (Leaflet) | 68–153 | Inicialización, markers, icons |
| Utilidades | 155–227 | haversine, escHtml, formatDate, renderStatusPill, clock, toast, status |
| API helpers | 228–297 | apiFetch, authenticate, fetchTicket, fetchCandidates, fetchGeolocations |
| Extract/Merge | 298–358 | extractTicketCoords, mergeCandidatesGps |
| Dummy data | 360–387 | Generadores de datos simulados |
| Render cards | 389–406 | renderCards |
| Render ticket detail | 408–515 | renderTicketDetail (107 líneas de template literal) |
| Render matrix | 530–590 | renderMatrix |
| Candidate modal | 592–623 | showCandidateDetail, modalRow |
| Main load flow | 625–721 | loadAll() — orquestación principal |
| Sidebar nav | 724–751 | Event listeners |
| ACD Simulation | 800–1191 | **391 líneas** — config, DOM, stepper, sources, table, winner, meta, flow |
| Tickets PREPROD | 1193–1642 | **449 líneas** — state, DOM, fetch, render, drawer, controls, pagination |
| Workforce | 1645–1746 | **102 líneas** — load sessions, check-in |

#### 🔴 CRÍTICO: Credenciales hardcoded

```js
// app.js línea 15-16 — CREDENCIALES EN CÓDIGO FUENTE
AUTH_USER: '[redactado - ver js/services/auth.js]',
AUTH_PASS: '[redactado - eliminado del código fuente]',
```

#### 🟠 ALTO: Todo en una sola vista (scroll infinito)

La navegación del sidebar no cambia de "página" — solo hace `scrollIntoView()`:
```js
// app.js línea 740
if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

Resultado: el usuario ve **todo al mismo tiempo** y pierde contexto.

#### 🟠 ALTO: Evaluación ACD ocupa media pantalla permanentemente

La sección `simSection` se muestra inline debajo del contenido principal y ocupa cientos de píxeles verticales con:
- Banner dry-run
- Stepper (8 pasos)
- Step detail
- Sources row
- Tabla de evaluación de candidatos (N filas)
- Winner card
- GPS notice
- Meta panel (production_ready, warnings, data_quality)

**Debería ser un modal/drawer de detalle**, no una sección permanente.

#### 🟠 ALTO: Matriz de candidatos sin paginación real

La tabla de candidatos (`matrixTable`) renderiza **TODOS los candidatos de una vez**. Solo tiene un filtro de búsqueda client-side.

#### 🟡 MEDIO: Función `renderStatusPill()` duplicada

Definida DOS veces: líneas 182–193 y líneas 520–528. La segunda sobreescribe la primera.

#### 🟡 MEDIO: Datos simulados mezclados con datos reales

Columnas de la matriz de candidatos con badge "SIMULADO":
- Disponibilidad → `dummyAvailability(uid)`
- Tickets Activos → `dummyActiveTickets(uid)`
- Especialidad → `dummySpecialty(uid)`
- Zona → `dummyZone(uid)`

Estos generan valores determinísticos basados en un hash del userId. El usuario no puede distinguir fácilmente qué es real.

#### 🟡 MEDIO: Sin sort en tablas

Ninguna tabla del ACD tiene sort por columna. La referencia tiene `sortTable()` con indicadores ↕.

#### 🟡 MEDIO: Navegación deficiente

El sidebar tiene 5 items pero no hay navegación real — el contenido se oculta/muestra con `display:none` y scroll.

### 3.3 Lo que funciona BIEN en el ACD actual

| Componente | Estado | Nota |
|---|---|---|
| Sidebar con toggle/collapse | ✅ Funcional | Buen patrón, mantener |
| Topbar con ticket input + reloj | ✅ Funcional | Mantener |
| KPI Cards (5) | ✅ Funcional | Adaptar contenido |
| Mapa Leaflet con markers | ✅ Funcional | Mantener y mejorar |
| Toast notifications | ✅ Funcional | Mantener |
| Connection status indicator | ✅ Funcional | Mantener |
| API auth flow | ✅ Funcional | Mover credenciales fuera del código |
| Promise.allSettled para carga paralela | ✅ Buen patrón | Mantener |
| Stepper de cascada ACD | ✅ Funcional | Mover a modal/drawer |
| Drawer de ticket detail | ✅ Funcional | Buen patrón, extender |
| Modal de candidato | ✅ Funcional | Extender con más datos |
| Tickets PREPROD con paginación real | ✅ Funcional | Buen patrón, replicar |
| SLA traffic-light (rojo/amarillo/verde) | ✅ Funcional | Extender |
| Workforce sessions | ✅ Funcional | Módulo independiente |

---

## 4. Arquitectura objetivo para ACD

### 4.1 Módulo Dashboard

**Contenido:**
- KPI Cards: tickets pendientes, asignados, errores, candidatos activos, SLA compliance %
- Mapa GPS (compacto, colapsable)
- Matriz de monitoreo **resumida** (top 10-20 tickets por urgencia SLA)
- Filtros útiles: por zona, por servicio, por estado, por rango de fecha

**Paginación real:**

| Opción | Detalle |
|---|---|
| 20 | Vista rápida / monitoreo en tiempo real |
| 50 | Vista estándar de trabajo |
| 100 | Revisión amplia |
| 500 | Análisis / exportación |

La tabla **NUNCA** debe cargar todos los registros de golpe. Usar la paginación del API (`PageNumber` / `PageSize`) que ya existe en `GetRemoteWorkTickets`.

### 4.2 Módulo Evaluación ACD

> **Cambio principal:** La evaluación paso a paso **NO ocupa permanentemente media pantalla**. Se convierte en un **modal/drawer de detalle**.

**Estructura del modal/drawer de evaluación:**

```
┌─────────────────────────────────────┐
│ ⚡ Evaluación ACD — Ticket #12345   │  ← Header con badge DRY-RUN
│ [Cerrar]                            │
├─────────────────────────────────────┤
│ ▶ Cascada (stepper visual)          │  ← Compacto, horizontal
├─────────────────────────────────────┤
│ 📡 Fuentes de datos                │  ← Chips ok/error/timeout
│ ⚠ Gaps: [lista]                    │
├─────────────────────────────────────┤
│ 👥 Candidatos evaluados            │  ← Tabla scrollable
│    Rk | Nombre | Elegible | Step    │
│    descarte | Score | Sesión        │
├─────────────────────────────────────┤
│ 👑 Winner                          │  ← Card compacta
│    User ID, Score, Zone, Status     │
├─────────────────────────────────────┤
│ 🏭 production_ready: true/false    │
│ ⚠ warnings: [lista]               │
│ 📊 data_quality: {campo: status}   │
└─────────────────────────────────────┘
```

**Trigger:** Botón "Simular ACD" en ticket detail drawer o en tabla de tickets.

### 4.3 Módulo Tickets

**Debe existir como módulo independiente con 3 tabs:**

#### Tab 1: No Asignados (primero, prominente)
- **Ordenados por urgencia de SLA** (menor tiempo restante primero)
- Columnas: Ticket ID, Cliente, Servicio, SLA Deadline, Tiempo Restante, Criticidad (🔴🟡🟢), Zona, Acciones
- **Tiempo restante**: cálculo `(ticketAttentionTime - now)` con refresh periódico
- **Criticidad**:
  - 🔴 Vencido (SLA < 0)
  - 🟠 Crítico (SLA < 1h)
  - 🟡 Próximo (SLA < 4h)
  - 🟢 OK (SLA > 4h)
- **Acciones**: Ver detalle (drawer), Simular ACD (modal)

#### Tab 2: Asignados
- Tickets actualmente con ingeniero asignado
- Columnas: Ticket ID, Colaborador asignado (`ticketAssignedEngineerFullName`), Status, SLA, Zona, Servicio, Fecha asignación, Última actualización
- Filtro por colaborador, zona, servicio

#### Tab 3: Errores
- Tickets que no pudieron asignarse después de 3 intentos
- Columnas: Ticket ID, Motivo último error, Número de intentos, Fecha último intento, Acciones
- Acción: "Inspeccionar diagnóstico" → abre dispatch-context del ticket

> **Nota:** El concepto de "3 intentos fallidos" requiere que el backend registre intentos de asignación. Actualmente `acd_microservice` no expone este dato directamente. Se puede derivar de logs o agregar un endpoint.

### 4.4 Módulo Dashboard — Detalle

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR: ACD System | Ticket Input | Reloj | Status    │
├────────┬────────────────────────────────────────────────┤
│        │  ┌──────────────────────────────────────────┐  │
│  SIDE  │  │  KPI CARDS (4-5 métricas)                │  │
│  BAR   │  └──────────────────────────────────────────┘  │
│        │  ┌────────────────────┬─────────────────────┐  │
│  Dash  │  │  MAPA GPS          │  FILTROS             │  │
│  Tkt   │  │  (colapsable)      │  Zona | Servicio     │  │
│  Cand  │  │                    │  Estado | SLA         │  │
│  WF    │  └────────────────────┴─────────────────────┘  │
│        │  ┌──────────────────────────────────────────┐  │
│        │  │  TABLA RESUMEN (paginada 20/50/100/500)  │  │
│        │  │  Sort por columna | Search | Filtro tab   │  │
│        │  │  Ticket | Status | SLA | Zona | Acciones  │  │
│        │  └──────────────────────────────────────────┘  │
│        │  ┌──────────────────────────────────────────┐  │
│        │  │  PAGINADOR: ← Pág 1 de 23 → | 20|50|100 │  │
│        │  └──────────────────────────────────────────┘  │
└────────┴────────────────────────────────────────────────┘
```

---

## 5. Módulo Candidatos

### 5.1 Campos requeridos vs disponibilidad en backend

| Campo | Disponible en backend | Fuente | Estado |
|---|---|---|---|
| `nombre` | ✅ | `getAssignableTaskForceByTicketsId` → FullName | EXISTS |
| `user_id` | ✅ | `getAssignableTaskForceByTicketsId` → UserId | EXISTS |
| `email` | ✅ | `getAssignableTaskForceByTicketsId` → Email | EXISTS |
| `estado` (status) | 🔶 | `EngineerCandidate.status` = "UNKNOWN" default | PARTIAL — necesita lógica |
| `sesión activa` | ✅ | Cruce con `WorkForceSessions/Active` (Step 1) | EXISTS |
| `zona` | ✅ | `WorkForceSession.LocationZoneId` → `active_zone_id` | EXISTS |
| `departamento` | ❌ | No existe en modelo ni en API | NOT_EXISTS |
| `funciones/servicios` | ❌ | **GAP documentado**: `SystemUserService` sin API expuesta | NOT_EXISTS |
| `clientes` | 🔶 | `EngineerCandidate.clients` = list[int] — implícito en getAssignable | PARTIAL |
| `tickets activos` | 🔶 | **GAP**: sin API bulk, fallback SQL o global | PARTIAL |
| `tickets on-site` | 🔶 | **GAP**: `on_site` field, sin API bulk | PARTIAL |
| `carga` | 🔶 | `active_tickets` + `max_active_tickets` (GAP: fallback global) | PARTIAL |
| `disponibilidad` | ❌ | No existe campo directo — derivable de sesión + carga | NOT_EXISTS (derivable) |
| `GPS informativo` | ✅ | `GET /TaskForce/Geolocations` → lat/lng | EXISTS |
| `última actualización` | 🔶 | `gps_timestamp_utc` en EngineerCandidate | EXISTS (GPS only) |
| `detalle expandible/modal` | ✅ | Ya implementado como modal en ACD | EXISTS |

### 5.2 Campos que necesitan trabajo de backend

| Campo | Acción necesaria | Complejidad |
|---|---|---|
| `departamento` | Agregar a modelo + obtener de TicketsAPI o SQL | Media |
| `funciones/servicios` | Requiere endpoint `SystemUserService` o SQL read-only | Alta (GAP conocido) |
| `disponibilidad` | Derivar: sesión activa + carga < max → Disponible | Baja (lógica frontend) |
| `carga real` | Requiere endpoint bulk de tickets activos por user | Media (GAP conocido) |

### 5.3 Estructura propuesta del módulo

```
Candidatos (módulo independiente)
├── Tabla principal (paginada)
│   ├── Nombre, User ID, Email
│   ├── Sesión: ✓ Activa / ✗ Inactiva
│   ├── Zona activa
│   ├── Tickets activos (con badge si es GAP/aproximado)
│   ├── Carga (barra visual: activos/max)
│   ├── GPS: ✓/✗ + timestamp
│   ├── Disponibilidad: Disponible/Parcial/No disponible
│   └── Acción: Ver detalle
├── Filtros
│   ├── Por zona
│   ├── Por disponibilidad
│   ├── Con/sin sesión activa
│   └── Con/sin GPS
└── Detalle (modal/drawer)
    ├── Datos personales
    ├── Sesión actual (check-in time, zona, GPS)
    ├── Tickets activos (lista)
    ├── Historial de sesiones
    └── Mapa con posición GPS
```

---

## 6. SLA — Representación actual vs propuesta

### 6.1 Estado actual en backend

```python
# models/ticket_context.py
sla_remaining_minutes: int | None = None  # GAP: aproximado o None
sla_is_approximate: bool = False  # True si se calculó como ScheduledDateTime - now
```

```python
# Campos del ticket PREPROD
ticketAttentionTime  → SLA deadline (datetime)
slaResponseTime      → SLA tiempo de respuesta (ej. "4h")
```

### 6.2 Estado actual en frontend

El frontend ACD ya tiene un traffic-light para SLA:
```js
// app.js líneas 447-453
if (slaDeadline) {
  const rem = new Date(slaDeadline) - new Date();
  if (rem < 0)           slaClass = 'sla-bad';    // 🔴 Vencido
  else if (rem < 3600000) slaClass = 'sla-warn';  // 🟡 < 1 hora
  else                    slaClass = 'sla-good';   // 🟢 OK
}
```

### 6.3 Propuesta mejorada

| Indicador | Condición | Color | Icono | Acción |
|---|---|---|---|---|
| VENCIDO | `remaining < 0` | 🔴 Rojo pulsante | ⏰ | Prioridad máxima |
| CRÍTICO | `remaining < 1h` | 🟠 Naranja | ⚠️ | Urgente |
| PRÓXIMO | `remaining < 4h` | 🟡 Amarillo | ⏱️ | Atención pronto |
| NORMAL | `remaining < 24h` | 🟢 Verde | ✓ | En tiempo |
| HOLGADO | `remaining > 24h` | 🔵 Azul | — | Sin urgencia |

**Ordenamiento de tickets no asignados:**
```
ORDER BY:
  1. sla_remaining_minutes ASC NULLS LAST  (menor tiempo = más urgente)
  2. priority ASC                           (1=Alta primero)
  3. ticketCreationDateUTC ASC              (más antiguo primero)
```

**Columna "Tiempo Restante" con formato humano:**
- `⚠ VENCIDO hace 2h 15m`
- `🔴 45 min restantes`
- `🟡 3h 20m restantes`
- `🟢 18h restantes`
- `🔵 2d 5h restantes`

**No cambiar lógica backend** — el cálculo de tiempo restante se hace en frontend con `ticketAttentionTime - Date.now()`.

---

## 7. Componentización propuesta

### 7.1 Estructura de carpetas derivada del análisis

Basándome en la separación que impone el proyecto referencia (datos/lógica/estilos/layout) y adaptándola a la complejidad del ACD:

```
acd_preprod_dashboard/
├── index.html                      ← Shell: sidebar + topbar + contenedores de módulos
│
├── styles/
│   ├── variables.css               ← Variables CSS (colores, radios, fuentes)
│   ├── base.css                    ← Reset, scrollbar, tipografía
│   ├── layout.css                  ← Sidebar, topbar, main-content, grid
│   ├── components.css              ← Cards, badges, pills, buttons, toasts
│   ├── tables.css                  ← Tabla genérica, sort indicators, paginación
│   ├── modals.css                  ← Modal overlay, drawer, animations
│   ├── map.css                     ← Leaflet custom popups, markers, legend
│   └── modules/
│       ├── dashboard.css
│       ├── tickets.css
│       ├── candidates.css
│       ├── simulation.css
│       └── workforce.css
│
├── js/
│   ├── config.js                   ← URLs base, constantes (SIN credenciales)
│   ├── state.js                    ← Estado global de la aplicación
│   ├── router.js                   ← Navegación entre módulos (show/hide sections)
│   ├── utils.js                    ← haversine, escHtml, formatDate, formatSlaRemaining
│   │
│   ├── services/
│   │   ├── auth.js                 ← Autenticación (token en memoria)
│   │   ├── api.js                  ← apiFetch genérico con manejo de errores
│   │   ├── tickets-api.js          ← fetchTicket, fetchRemoteWorkTickets, fetchTicketDetail
│   │   ├── candidates-api.js       ← fetchCandidates, fetchGeolocations
│   │   ├── acd-api.js              ← simulateTicket, dispatchContext, readiness
│   │   └── workforce-api.js        ← fetchActiveSessions, checkIn, checkOut
│   │
│   ├── components/
│   │   ├── toast.js                ← showToast()
│   │   ├── status-indicator.js     ← setStatus()
│   │   ├── clock.js                ← startClock()
│   │   ├── kpi-cards.js            ← renderKpiCards()
│   │   ├── table-sort.js           ← sortTable() genérico
│   │   ├── table-pagination.js     ← Paginator component
│   │   ├── filter-tabs.js          ← Tab bar filtrable genérico
│   │   ├── modal.js                ← openModal(), closeModal()
│   │   ├── drawer.js               ← openDrawer(), closeDrawer()
│   │   ├── status-pill.js          ← renderStatusPill()
│   │   ├── sla-indicator.js        ← renderSlaIndicator(), formatTimeRemaining()
│   │   └── map-manager.js          ← initMap, drawMarkers, clearMarkers
│   │
│   ├── modules/
│   │   ├── dashboard/
│   │   │   ├── dashboard.js        ← init, loadDashboard, renderSummary
│   │   │   └── dashboard-filters.js
│   │   ├── tickets/
│   │   │   ├── tickets.js          ← init, tab management
│   │   │   ├── tickets-unassigned.js  ← Tab 1: no asignados (SLA order)
│   │   │   ├── tickets-assigned.js    ← Tab 2: asignados
│   │   │   └── tickets-errors.js      ← Tab 3: errores
│   │   ├── candidates/
│   │   │   ├── candidates.js       ← init, tabla, filtros
│   │   │   └── candidate-detail.js ← Modal/drawer de detalle
│   │   ├── simulation/
│   │   │   ├── simulation.js       ← Modal de evaluación ACD
│   │   │   ├── stepper.js          ← Stepper visual de cascada
│   │   │   └── sim-results.js      ← Tabla resultados, winner, meta
│   │   └── workforce/
│   │       ├── workforce.js        ← Tabla sesiones, check-in form
│   │       └── workforce-detail.js
│   │
│   └── app.js                      ← Entry point: init modules, wire events
│
└── assets/
    └── (si se necesitan imágenes/iconos custom)
```

### 7.2 Justificación de la estructura

| Decisión | Razón |
|---|---|
| `styles/` separados por responsabilidad | Sigue el patrón de referencia (styles.css separado de layout) |
| `js/services/` para API calls | Separar datos de presentación (patrón de referencia: report-data.js) |
| `js/components/` genéricos | Reutilizables entre módulos (toast, modal, table-sort, pagination) |
| `js/modules/` por dominio | Cada módulo es independiente, como las secciones del reporte |
| `router.js` simple | No necesita framework — show/hide sections con `display` |
| Sin build tool inicialmente | Mantiene simplicidad del stack actual — scripts con `type="module"` |

### 7.3 Carga de módulos (ES Modules)

```html
<!-- index.html -->
<script type="module" src="js/app.js"></script>
```

```js
// js/app.js
import { initRouter } from './router.js';
import { initDashboard } from './modules/dashboard/dashboard.js';
import { initTickets } from './modules/tickets/tickets.js';
import { initCandidates } from './modules/candidates/candidates.js';
import { initWorkforce } from './modules/workforce/workforce.js';
import { startClock } from './components/clock.js';

document.addEventListener('DOMContentLoaded', () => {
  startClock();
  initRouter();
  initDashboard();
  // Otros módulos se cargan lazy al navegar
});
```

---

## 8. Reutilizar vs Rehacer

### Clasificación de componentes actuales

| Componente actual | Decisión | Razón |
|---|---|---|
| **Sidebar + toggle** | 🟢 REUTILIZAR | Funcional, buen diseño. Solo agregar items de nav. |
| **Topbar + ticket input + reloj** | 🟢 REUTILIZAR | Funcional. Mover credenciales fuera del código. |
| **KPI Cards (5)** | 🔵 ADAPTAR | HTML/CSS se reutiliza. Cambiar contenido por KPIs relevantes. |
| **Mapa Leaflet** | 🟢 REUTILIZAR | Funcional. Extraer a `map-manager.js`. |
| **Map markers/icons** | 🟢 REUTILIZAR | Código de buildTicketIcon, buildCandidateIcon funciona bien. |
| **Toast notifications** | 🟢 REUTILIZAR | Extraer a `toast.js`, sin cambios funcionales. |
| **Connection status** | 🟢 REUTILIZAR | Extraer a `status-indicator.js`. |
| **API auth flow** | 🔵 ADAPTAR | Mover credenciales a config/env. Mantener lógica de token. |
| **apiFetch()** | 🟢 REUTILIZAR | Buen patrón. Mover a `api.js`. |
| **fetchTicket / fetchCandidates / fetchGeo** | 🟢 REUTILIZAR | Mover a archivos separados en `services/`. |
| **extractTicketCoords()** | 🟢 REUTILIZAR | Robusto, maneja múltiples shapes. |
| **mergeCandidatesGps()** | 🟢 REUTILIZAR | Funcional. |
| **haversine()** | 🟢 REUTILIZAR | Utilitario puro. |
| **escHtml()** | 🟢 REUTILIZAR | Utilitario puro. |
| **formatDate()** | 🟢 REUTILIZAR | Utilitario puro. |
| **renderStatusPill()** | 🔵 ADAPTAR | Eliminar la versión duplicada. Unificar. |
| **SLA traffic-light** | 🔵 ADAPTAR | Agregar más niveles (5 en vez de 3). Agregar formato tiempo restante. |
| **renderTicketDetail()** | 🔴 REHACER | Template literal de 107 líneas inline. Convertir a función modular. |
| **renderMatrix()** | 🔴 REHACER | Mezclada con datos dummy. Separar datos reales de simulados. Agregar sort y paginación. |
| **Candidate detail modal** | 🔵 ADAPTAR | Funcional pero limitado. Agregar más campos y secciones. |
| **loadAll()** | 🔵 ADAPTAR | Buen patrón (Promise.allSettled). Extraer render de la orquestación. |
| **ACD Stepper** | 🔵 ADAPTAR | HTML/CSS del stepper se reutiliza. Mover a modal/drawer. |
| **Stepper animation** | 🟢 REUTILIZAR | animateStepper(), setStepState() funcionales. |
| **renderSources()** | 🟢 REUTILIZAR | Chips de fuentes ok/error/timeout funcionales. |
| **renderSimTable()** | 🔵 ADAPTAR | Funcional pero inline. Mover a componente dentro del modal. |
| **renderWinnerCard()** | 🟢 REUTILIZAR | Funcional. |
| **renderSimMeta()** | 🟢 REUTILIZAR | production_ready, warnings, data_quality — mantener. |
| **Tickets PREPROD pagination** | 🟢 REUTILIZAR | Buen patrón. Generalizar para todos los módulos. |
| **fetchRemoteWorkTickets()** | 🟢 REUTILIZAR | Funcional con paginación server-side. |
| **Ticket detail drawer** | 🟢 REUTILIZAR | Buen componente. Solo agregar más campos. |
| **Workforce module** | 🔵 ADAPTAR | Funcional pero básico. Agregar más columnas. |
| **Dummy data generators** | 🔴 ELIMINAR | `dummyAvailability`, `dummyActiveTickets`, `dummySpecialty`, `dummyZone` — reemplazar por datos reales o badges "No disponible". |
| **Simulated data alert banner** | 🔴 ELIMINAR | Cuando los datos reales estén disponibles, eliminar banner de "SIMULADO". |
| **Doble renderStatusPill** | 🔴 ELIMINAR | Eliminar la definición duplicada en líneas 182-193. |
| **Credenciales hardcoded** | 🔴 ELIMINAR | Mover a configuración segura. |

### Resumen

| Categoría | Cantidad | % |
|---|---|---|
| 🟢 REUTILIZAR | 18 componentes | 51% |
| 🔵 ADAPTAR | 10 componentes | 29% |
| 🔴 REHACER | 3 componentes | 9% |
| 🔴 ELIMINAR | 4 componentes | 11% |

---

## 9. Riesgos

### 9.1 Riesgo: Seguir con vanilla JS actual (sin refactor)

| Aspecto | Evaluación |
|---|---|
| Probabilidad | Alta |
| Impacto | 🔴 Alto — el archivo de 1,747 líneas crecerá con cada feature. |
| Resultado | Código inmantenible en 3-6 meses. Bugs por acoplamiento. |
| Mitigación | Refactor incremental modular sin framework. |

### 9.2 Riesgo: Migrar a framework (React/Vue/Svelte)

| Aspecto | Evaluación |
|---|---|
| Probabilidad | Media |
| Impacto | 🟠 Medio-Alto — rewrite completo, curva de aprendizaje, setup tooling. |
| Resultado | Frontend moderno pero **6-12 semanas** de trabajo. |
| Beneficio | Componentes reactivos, routing, state management nativo. |
| Riesgo adicional | Over-engineering para el tamaño actual del proyecto. |

### 9.3 Riesgo: Hacer refactor incremental (vanilla JS modular) ⭐ RECOMENDADO

| Aspecto | Evaluación |
|---|---|
| Probabilidad | Alta |
| Impacto | 🟢 Bajo — cambios incrementales, cada paso es deployable. |
| Resultado | Código modular en 4-6 semanas sin romper nada. |
| Riesgo | Disciplina requerida para no crear deuda técnica nueva. |
| Beneficio | Mantiene el stack que el equipo conoce. ES Modules para modularidad. |

### 9.4 Riesgo: Rehacer frontend completo

| Aspecto | Evaluación |
|---|---|
| Probabilidad | Baja |
| Impacto | 🔴 Muy Alto — 8-16 semanas, features perdidas, regresiones. |
| Resultado | Frontend limpio pero periodo largo sin frontend funcional. |
| Mitigación | No recomendado salvo que el proyecto cambie radicalmente de escala. |

### 9.5 Riesgo: Romper integración con backend

| Aspecto | Evaluación |
|---|---|
| Probabilidad | Baja si se mantiene vanilla JS |
| Impacto | 🔴 Alto — el backend funciona bien, no debe romperse. |
| Mitigación | 1) No tocar URLs ni payloads de API. 2) Refactor solo mueve código entre archivos. 3) Tests manuales por fase. |

### 9.6 Estrategia recomendada

> **REFACTOR INCREMENTAL con vanilla JS + ES Modules**

Razones:
1. El 80% del código actual funciona bien — solo necesita reorganización.
2. No introduce dependencias nuevas ni build tools.
3. Cada fase es deployable independientemente.
4. El equipo ya conoce el stack.
5. ES Modules (`import`/`export`) proveen modularidad nativa del navegador.
6. Si en el futuro se necesita framework, el código modular es más fácil de migrar que un monolito.

---

## 10. Plan de implementación por fases

### Fase 0: Preparación (1-2 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Crear estructura de carpetas sin romper funcionalidad actual |
| **Archivos** | Crear `js/`, `styles/`, copiar `app.js` a backup |
| **Dependencia** | Ninguna |
| **Riesgo** | 🟢 Nulo — no se modifica código funcional |
| **Criterio de terminado** | Estructura de carpetas creada. `index.html` sigue cargando `app.js` original. |

**Acciones:**
1. Crear carpetas: `js/services/`, `js/components/`, `js/modules/`, `styles/`
2. Copiar `app.js` → `app.js.bak` (backup)
3. Mover credenciales a `js/config.js` (sin valores — placeholder)
4. Documentar mapeo: "qué función va a qué archivo"

---

### Fase 1: Extraer utilidades y servicios (3-4 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Separar utilidades puras y servicios API del monolito |
| **Archivos** | `js/utils.js`, `js/services/auth.js`, `js/services/api.js`, `js/services/tickets-api.js`, `js/services/candidates-api.js`, `js/services/acd-api.js`, `js/services/workforce-api.js`, `js/config.js`, `js/state.js` |
| **Dependencia** | Fase 0 |
| **Riesgo** | 🟢 Bajo — funciones puras sin side effects |
| **Criterio de terminado** | `app.js` importa de archivos separados. Funcionalidad idéntica. |

**Acciones:**
1. Extraer: `haversine`, `escHtml`, `formatDate`, `renderStatusPill` (versión única) → `js/utils.js`
2. Extraer: `CFG`, `SIM_CFG` → `js/config.js`
3. Extraer: `STATE`, `TKT` → `js/state.js`
4. Extraer: `apiFetch` → `js/services/api.js`
5. Extraer: `authenticate` → `js/services/auth.js`
6. Extraer: `fetchTicket`, `fetchRemoteWorkTickets`, `fetchTicketDetail` → `js/services/tickets-api.js`
7. Extraer: `fetchCandidates`, `fetchGeolocations` → `js/services/candidates-api.js`
8. Extraer: funciones de simulación API → `js/services/acd-api.js`
9. Cambiar `index.html` a `<script type="module" src="js/app.js">`
10. **Test:** Toda la funcionalidad sigue igual

---

### Fase 2: Extraer componentes UI reutilizables (3-4 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Crear componentes UI genéricos reutilizables |
| **Archivos** | `js/components/toast.js`, `clock.js`, `status-indicator.js`, `modal.js`, `drawer.js`, `kpi-cards.js`, `status-pill.js`, `sla-indicator.js`, `map-manager.js`, `table-sort.js`, `table-pagination.js`, `filter-tabs.js` |
| **Dependencia** | Fase 1 |
| **Riesgo** | 🟢 Bajo — componentes aislados |
| **Criterio de terminado** | Todos los componentes genéricos extraídos. `app.js` reducido significativamente. |

**Acciones:**
1. Extraer toast, clock, status-indicator
2. Crear `modal.js` genérico (openModal/closeModal con configuración)
3. Crear `drawer.js` genérico (openDrawer/closeDrawer)
4. Extraer map-manager (initMap, drawMarkers, buildIcons)
5. Crear `table-sort.js` genérico (inspirado en sortTable de referencia)
6. Crear `table-pagination.js` genérico (basado en código de tickets PREPROD)
7. Crear `filter-tabs.js` genérico (inspirado en filterMatrix de referencia)
8. Crear `sla-indicator.js` con 5 niveles + formato tiempo restante
9. **Test:** Toda la funcionalidad sigue igual

---

### Fase 3: Módulo Dashboard (3-4 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Dashboard como módulo independiente con KPIs, mapa, tabla resumida paginada |
| **Archivos** | `js/modules/dashboard/dashboard.js`, `dashboard-filters.js`, `styles/modules/dashboard.css` |
| **Dependencia** | Fase 2 |
| **Riesgo** | 🟡 Medio — cambio visual, requiere validación de usuario |
| **Criterio de terminado** | Dashboard muestra KPIs reales, mapa funcional, tabla paginada (20/50/100/500). |

**Acciones:**
1. Implementar `router.js` para navegación por secciones (show/hide)
2. Crear dashboard.js con loadDashboard(), renderKpis(), renderSummaryTable()
3. Tabla resumen: usar paginación genérica, integrar sort por columna
4. Filtros: zona, servicio, estado
5. Mapa compacto colapsable
6. Eliminar datos simulados del dashboard
7. **Test:** Dashboard funcional con datos reales PREPROD

---

### Fase 4: Módulo Tickets con 3 tabs (4-5 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Tickets como módulo independiente: No asignados (SLA order) / Asignados / Errores |
| **Archivos** | `js/modules/tickets/tickets.js`, `tickets-unassigned.js`, `tickets-assigned.js`, `tickets-errors.js` |
| **Dependencia** | Fase 3 |
| **Riesgo** | 🟡 Medio — lógica de SLA ordering nueva |
| **Criterio de terminado** | 3 tabs funcionales. No asignados ordenados por SLA. Paginación. |

**Acciones:**
1. Crear tickets.js con tab management (filter-tabs genérico)
2. Tab 1: tickets sin ingeniero asignado, ordenados por `ticketAttentionTime` ASC
3. Tab 2: tickets con ingeniero asignado, mostrar colaborador + SLA + zona
4. Tab 3: tickets con errores (requiere definir criterio — ej. status "Error")
5. Columna "Tiempo Restante" con formato humano y colores
6. Mantener acciones: Ver detalle (drawer), Simular ACD
7. **Test:** 3 tabs funcionales, paginación, SLA ordering correcto

---

### Fase 5: Evaluación ACD como modal/drawer (3-4 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Convertir simulación ACD de sección inline a modal/drawer |
| **Archivos** | `js/modules/simulation/simulation.js`, `stepper.js`, `sim-results.js` |
| **Dependencia** | Fase 2 (drawer genérico) |
| **Riesgo** | 🟡 Medio — cambio UX significativo |
| **Criterio de terminado** | Simulación ACD se abre como drawer. No ocupa espacio permanente. Toda la cascada visible. |

**Acciones:**
1. Crear drawer de evaluación ACD con layout scrollable
2. Mover stepper, sources, tabla evaluación, winner, meta al drawer
3. Trigger desde botón en ticket detail o tabla de tickets
4. Mantener banner DRY-RUN
5. Eliminar sección inline simSection del HTML principal
6. **Test:** Simular ACD → se abre drawer → muestra toda la evaluación → se cierra

---

### Fase 6: Módulo Candidatos (3-4 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Candidatos como módulo independiente con datos reales |
| **Archivos** | `js/modules/candidates/candidates.js`, `candidate-detail.js` |
| **Dependencia** | Fase 2, backend (parcial) |
| **Riesgo** | 🟡 Medio — depende de datos disponibles en backend |
| **Criterio de terminado** | Tabla de candidatos con datos reales, filtros, detalle modal mejorado. |

**Acciones:**
1. Crear candidates.js con tabla paginada
2. Mostrar datos reales: nombre, user_id, email, sesión, zona, GPS
3. Mostrar datos con badge "aproximado" donde aplica: tickets activos, carga
4. Eliminar dummyAvailability, dummySpecialty, dummyZone
5. Filtros: zona, sesión activa, GPS
6. Detalle modal expandido con más secciones
7. **Test:** Tabla de candidatos con datos reales, sin datos dummy

---

### Fase 7: Separación CSS + pulido visual (2-3 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Separar CSS monolítico en archivos por responsabilidad |
| **Archivos** | `styles/variables.css`, `base.css`, `layout.css`, `components.css`, `tables.css`, `modals.css`, `map.css`, `styles/modules/*.css` |
| **Dependencia** | Fases 3-6 |
| **Riesgo** | 🟢 Bajo — solo reorganización |
| **Criterio de terminado** | styles.css eliminado. Archivos CSS separados cargados desde index.html. Visual idéntico. |

**Acciones:**
1. Separar variables.css (líneas 7-33 del styles.css actual)
2. Separar base.css (reset, scrollbar, tipografía)
3. Separar layout.css (sidebar, topbar, main-content)
4. Separar components.css (cards, badges, pills, buttons)
5. Separar tables.css, modals.css, map.css
6. Crear CSS por módulo
7. Aplicar patrones visuales de la referencia donde mejoren UX
8. **Test:** Visual idéntico al actual pero con CSS modular

---

### Fase 8: Workforce + refinamiento (2-3 días)

| Aspecto | Detalle |
|---|---|
| **Objetivo** | Workforce como módulo independiente. Refinamiento general. |
| **Archivos** | `js/modules/workforce/workforce.js`, cleanup final de `app.js` |
| **Dependencia** | Fase 7 |
| **Riesgo** | 🟢 Bajo |
| **Criterio de terminado** | app.js es solo entry point (~50 líneas). Todos los módulos independientes. |

**Acciones:**
1. Extraer workforce a módulo independiente
2. Limpiar app.js — solo imports e inicialización
3. Eliminar todo código muerto
4. Eliminar `app.js.bak`
5. **Test:** E2E completo de todos los módulos

---

### Resumen de fases

| Fase | Nombre | Días | Riesgo | Dependencia |
|---|---|---|---|---|
| 0 | Preparación | 1-2 | 🟢 | Ninguna |
| 1 | Utilidades y servicios | 3-4 | 🟢 | Fase 0 |
| 2 | Componentes UI genéricos | 3-4 | 🟢 | Fase 1 |
| 3 | Módulo Dashboard | 3-4 | 🟡 | Fase 2 |
| 4 | Módulo Tickets (3 tabs) | 4-5 | 🟡 | Fase 3 |
| 5 | Evaluación ACD → modal | 3-4 | 🟡 | Fase 2 |
| 6 | Módulo Candidatos | 3-4 | 🟡 | Fase 2 |
| 7 | Separación CSS + visual | 2-3 | 🟢 | Fases 3-6 |
| 8 | Workforce + refinamiento | 2-3 | 🟢 | Fase 7 |
| **Total** | | **24-33 días** | | |

> **Nota:** Las fases 4, 5 y 6 pueden ejecutarse en **paralelo** si hay más de un desarrollador, reduciendo el total a **18-24 días**.

---

## APÉNDICE A: Endpoints del backend disponibles

| Método | Ruta | Uso en frontend |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/acd/simulate` | Simulación con candidatos manuales |
| `GET` | `/api/v1/acd/dispatch-context/{ticket_id}` | Diagnóstico de fuentes para ticket |
| `POST` | `/api/v1/acd/simulate-ticket/{ticket_id}` | ⭐ Simulación ACD con datos reales |
| `GET` | `/api/v1/acd/readiness` | Estado de readiness del motor |
| `GET` | `/api/v1/acd/dependency-check` | Estado de dependencias externas |
| `GET` | `/api/v1/acd/settings` | Configuración runtime del motor |
| `POST` | `/api/v1/acd/settings` | Actualizar configuración |
| `GET` | `/api/v1/acd/workforce-sessions` | Sesiones de trabajo |
| `POST` | `/api/v1/acd/workforce/check-in` | Check-in de técnico |
| `POST` | `/api/v1/acd/workforce/check-out` | Check-out de técnico |
| `GET` | `/api/v1/acd/workforce/status/{engineer_id}` | Estado de un técnico |
| `GET` | `/api/v1/acd/workforce/history/{engineer_id}` | Historial de sesiones |
| `GET` | `/api/v1/acd/workforce/active` | Sesiones activas |
| `POST` | `/api/v1/acd/run-ticket/{ticket_id}` | Flujo real de orquestación |

## APÉNDICE B: GAPs conocidos del backend

| Campo | GAP | Impacto en frontend |
|---|---|---|
| `active_tickets` (bulk) | Sin API bulk por usuario | Mostrar con badge "aproximado" o N/A |
| `on_site` (bulk) | Sin API bulk | Mostrar con badge "aproximado" o N/A |
| `services` (permisos) | `SystemUserService` sin API | Step 3 usa fallback — aceptable |
| `max_active_tickets` | `SystemUser.MaxActiveTickets` sin API | Usar fallback global de RuntimeSettings |
| `zone_id` (ticket) | No viene en GET /Tickets/{id} | Obtenido via LocationsAPI o SQL |
| `sla_remaining_minutes` | Aproximado: ScheduledDateTime - now | Marcar como "aproximado" en UI |
| `departamento` | No existe en modelo | Columna "N/A" en candidatos |
| `intentos de asignación fallidos` | No expuesto | Tab "Errores" necesita definir criterio alternativo |

---

> **Documento generado por análisis profundo de 3 proyectos. No se modificó ningún archivo de código.**
