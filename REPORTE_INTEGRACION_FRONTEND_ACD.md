# Integración del frontend experimental con la API operativa ACD

Fecha: 2026-09-27. Alcance: solo frontend experimental. Contratos leídos en `services/operational_api.py`, `persistence/mysql.py`, `migrations/001_initial.sql` y `REPORTE_API_OPERATIVA_ACD.md` del backend ACD, sin modificarlo. No se ejecutaron asignaciones, reintentos, check-in ni pruebas visuales.

## Trazabilidad

- [x] Motor ACD
- [x] MySQL y persistencia
- [x] API operativa
- [x] Dashboard experimental modularizado
- [x] Integración frontend/API a contratos disponibles
- [ ] Autenticación y autorización definitiva
- [ ] Contratos GS pendientes
- [ ] Validación integral
- [ ] Integración React GS
- [ ] Despliegue GCP

## Componentes y endpoints conectados

| Componente | Endpoint real | Fuente y alcance |
|---|---|---|
| KPIs operativos | `GET /api/v1/acd/operations/metrics` | MySQL ACD: jobs recibidos, fallos tras tres intentos, conciliaciones pendientes y check-ins activos. SLA global figura `NO DISPONIBLE`. |
| Ingenieros activos del Dashboard | `GET /api/v1/acd/operations/engineers/active` | Sesiones MySQL ACD con check-in activo, no catálogo GS. La primera página se comparte con Workforce para evitar otra solicitud. |
| Tickets: Errores | `GET /api/v1/acd/operations/jobs/errors` | MySQL ACD; solo `failed_review AND attempt_count=3`. |
| Tickets: Jobs ACD | `GET /api/v1/acd/operations/jobs` | MySQL ACD; búsqueda, estado y ticket ID filtrados en servidor, orden por creación y paginación con cursor. |
| Drawer de historial | `GET /api/v1/acd/operations/jobs/{job_id}` | MySQL ACD; job, intentos, decisiones y eventos. Muestra solo campos de presentación permitidos. |
| Tickets: consulta individual | `GET /api/v1/acd/operations/tickets/{ticket_id}` | Detalle fresco de GS a través de ACD: asignación triestado y vencimiento oficial `sla_attention_due_at` cuando existe. Enlace del ticket a sus jobs ACD. |
| Workforce | `GET /api/v1/acd/operations/engineers/active`, `GET /api/v1/acd/operations/sessions` | MySQL ACD: check-ins activos e historial paginado; zonas de check-in y administrativa separadas, GPS informativo. |
| Ticket, candidatos, GPS y modal existentes | `GET /api/v1/Tickets/{id}`, `POST /api/v1/Assignations/getAssignableTaskForceByTicketsId`, `GET /api/v1/TaskForce/Geolocations`, `POST /api/v1/acd/simulate-ticket/{id}` | GS para datos del ticket/candidatos/GPS; ACD para simulación sin asignación. Se conservan mapa y componentes. |

Las llamadas a operaciones son exclusivamente GET. El Bearer GS, cuando existe, viaja en el encabezado y no se agrega a la URL. Los errores operativos se traducen por código sin mostrar mensajes del backend que puedan contener detalles sensibles.

## Alcances parciales y bloqueos

- **Sin asignar / Asignados:** `GET /operations/tickets` responde 503 `gs_global_ticket_query_pending`. La interfaz muestra la limitación y permite consultar **un ticket por ID**; no crea listas globales ni interpreta los jobs ACD como todos los tickets GS. La prioridad SLA global permanece bloqueada hasta que GS filtre asignación y ordene por vencimiento oficial antes de paginar.
- **SLA:** solo se presenta `TicketAttentionTime` validado en el detalle GS existente o `sla_attention_due_at` del detalle operativo. No se ordena una página local como prioridad global. Las alertas SLA de métricas siguen `NO DISPONIBLE`.
- **Errores:** la pestaña refleja únicamente jobs que alcanzaron tres intentos y estado `failed_review`; un fallo terminal anterior no entra en esa definición. El último error mostrado es el **código** del último intento con `error_code`; `error_detail`, `details` JSON, correlaciones, tokens y cadenas de conexión no se renderizan.
- **Identidad:** en `ACD_MODE=production` todas las lecturas operativas responden 503 `gs_identity_contract_pending` según el backend. La UI presenta el bloqueo; no lo evita. Sin MySQL configurado muestra `acd_mysql_unavailable`. Falta el contrato definitivo de roles e identidad GS.
- **Workforce:** la zona de check-in proviene de MySQL; `administrative_zone_id` y habilidades GS son `NO DISPONIBLE`. Los controles de check-in permanecen visibles pero deshabilitados, sin listeners ni servicio POST conectado. No se añadió caducidad automática ni reglas por jornada.
- **Candidatos/matriz:** se retiraron valores inventados de disponibilidad, carga, especialidad, zona y progreso. Esos campos se muestran `NO DISPONIBLE`; el filtro de sesión no verificada está deshabilitado. El GPS existente sigue siendo visual e informativo.
- **Actualización:** `/metrics` no incluye fecha de actualización; por eso el KPI indica `Última actualización: NO DISPONIBLE`, sin sustituirla por la hora de consulta.

## Archivos modificados

- `index.html`: tarjetas operativas, vista de jobs/errores, consulta individual y acceso a historial; Workforce activo/histórico; controles protegidos deshabilitados.
- `styles/modules/tickets.css`: estilos de tarjetas, ingenieros activos, lookup y filtros Workforce.
- `js/app.js`: integra las métricas y el historial, muestra solo SLA oficial y retira datos simulados.
- `js/modules/operations-dashboard.js` **nuevo**: métricas e ingenieros activos con estados de carga/error/vacío.
- `js/modules/tickets.js`: jobs y errores MySQL, paginación por cursor, lookup GS, historial seguro y navegación desde ticket.
- `js/modules/workforce.js`: check-ins activos e historial ACD con filtro y cursor; check-in bloqueado.
- `js/modules/candidates.js`: datos no verificados mostrados como no disponibles; filtro de sesión deshabilitado.
- `js/services/operational-api.js` **nuevo**: servicios GET ACD, traducción segura de errores y reutilización de la primera página activa.
- `js/services/tickets-api.js`, `js/config.js`, `js/utils.js`, `js/state.js`: retiran servicios/constantes de la lista remota histórica y datos ficticios sin consumidores.
- `js/modules/tickets-model.js`, `js/services/workforce-api.js` **eliminados**: lógica parcial SLA y POST de check-in sin uso en el flujo integrado.
- `tests/integration.test.mjs` y `tests/operational.test.mjs` **nuevo**: pruebas aisladas con DOM/fetch simulados.

El archivo legado `app.js` de la raíz permanece fuera de ejecución: `index.html` carga `js/app.js` como módulo. No se cambió backend ni GS.

## Pruebas ejecutadas

| Comprobación | Resultado exacto |
|---|---|
| `node --check` de `js/` y los dos archivos de pruebas | PASS: 21 archivos, 0 fallos |
| `node tests/integration.test.mjs` | PASS: 8 pruebas, 0 fallos |
| `node tests/operational.test.mjs` | PASS: 3 pruebas, 0 fallos |
| Selectores literales de vistas JS contra IDs de `index.html` | PASS: 86 referencias, 0 faltantes; 0 IDs duplicados |
| Contratos HTTP con mocks | PASS: GET y rutas existentes, cursor, Bearer solo en encabezado, 503 de identidad/MySQL |
| Flujos con mocks | PASS: respuestas tardías, historial sin detalles sensibles, consulta individual, error/vacío, KPIs sin dato, router, candidatos y Workforce |
| GS/MySQL/ACD reales y navegador | NO EJECUTADO; quedan para la validación integral posterior |

Estas pruebas usan respuestas locales simuladas y no demuestran disponibilidad del backend desplegado, autorización GS real, representación visual, mapa Leaflet ni persistencia MySQL real. No se intentó Chrome headless. No se hizo commit ni push.

## Pendientes para la validación integral posterior

- Verificar en navegador Dashboard, mapa Leaflet al cambiar de ruta, matriz/candidatos, modal de simulación, Tickets y Workforce; revisar diseño responsivo y consola.
- Con MySQL ACD autorizado: comparar métricas, jobs, errores, cursores, historial, sesiones activas e históricas con respuestas reales; revisar carga, vacío y 503.
- Con GS autorizado: comprobar ticket individual, asignación triestado, vencimiento oficial, candidatos, GPS, navegación del ticket al historial y cierre de sesión sin datos residuales.
- Acordar contrato GS para listas globales por asignación y prioridad SLA, habilidades y zona administrativa; cerrar identidad/roles ACD antes de habilitar operaciones protegidas.
