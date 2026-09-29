# Demostración integral ACD — frontend experimental

Fecha: 2026-09-28. Alcance de cambios: exclusivamente este frontend. La integración en navegador con servicios reales queda pendiente de la validación manual indicada abajo; las pruebas automatizadas usan respuestas controladas.

## Trazabilidad breve

| Etapa | Estado |
|---|---|
| Motor/simulación, MySQL, API operativa, dashboard modular y consulta global SLA del backend | Implementados previamente; backend leído sin cambios |
| Integración final del frontend | Conectada a los contratos disponibles y verificada con mocks |
| Demostración integral | Recorrido, comandos y lista manual preparados; ejecución real pendiente |
| Contratos externos GS, Cloud SQL/despliegue y React GS | Pendientes; fuera del alcance de este frontend |

## Funcionalidades conectadas y límites

- **Dashboard:** `/operations/metrics` y `/operations/engineers/active` presentan métricas MySQL ACD y check-ins. `/operations/tickets?assignment=unassigned&order=sla_due&page_size=25&soon_minutes=60` alimenta urgentes. El número mostrado cuenta solo vencidos y próximos a vencer **en la primera página**, nunca un total global. Fechas ausentes y métricas ausentes figuran `NO DISPONIBLE`.
- **Tickets sin asignar/asignados:** `/operations/tickets` usa `assignment`, `page_size`, `after_ticket_id` y `after_due_at` del cursor devuelto. El backend ordena en SQL por `AttentionExpirationDateTime ASC NULLS LAST, Id ASC`, clasifica `overdue`, `due_soon`, `later`, `unverified` y filtra estados asignables para ACD `{2,14,36,37}`. Una fecha `null` aparece como `NO DISPONIBLE` y “Sin SLA verificable”. El cursor nulo de fecha transmite solo el ID. El listado no es una instantánea ante cambios concurrentes ni confirma que esos estados sean toda la cola de GS.
- **Selección y detalle:** seleccionar una fila SLA carga ese ID en el buscador superior y abre el detalle del ticket; el detalle individual operativo consulta `/operations/tickets/{id}`. La matriz, candidatos y mapa siguen vinculados al ticket seleccionado. El mapa y las coordenadas son informativos; no participan en el score.
- **Jobs, errores e historial:** `/operations/jobs`, `/operations/jobs/errors`, `/operations/jobs/{id}` mantienen filtros y cursores del servidor. Los errores muestran `failed_review` tras exactamente tres intentos; el drawer no muestra campos de detalle sensibles. El acceso desde el ticket a sus jobs sigue disponible.
- **Workforce/ingenieros:** `/operations/engineers/active` y `/operations/sessions` muestran sesiones y zonas obtenidas del backend. Check-in, checkout y acciones rápidas siguen deshabilitados sin identidad ACD validada. Simulación usa el modal ACD y no asigna tickets.
- **Bloqueos visibles:** sin conexión SQL GS de solo lectura o ante fallo SQL, el listado SLA muestra el 503 correspondiente. En modo `production`, la API operativa conserva el bloqueo de identidad GS. Sin MySQL ACD, métricas/jobs/Workforce muestran su error real. La consulta SQL GS exige confirmar acceso `SELECT`, convención UTC y semántica de estados con GS.

## Pruebas y resultados exactos

| Comando/comprobación | Resultado |
|---|---|
| `node tests\integration.test.mjs` | 8 pruebas aprobadas, 0 fallidas, 0 omitidas |
| `node tests\operational.test.mjs` | 4 pruebas aprobadas, 0 fallidas, 0 omitidas |
| `node --check` sobre `js/**/*.js` y `tests/*.mjs` | 22 archivos correctos, 0 fallos |
| Comprobación de IDs del HTML | 0 IDs duplicados; 0 IDs nuevos faltantes |
| `node --test tests/*.test.mjs` | No ejecutable en este entorno: `spawn EPERM` al crear procesos hijos; los dos archivos se ejecutaron directamente y aprobaron |
| Navegador y servicios GS/SQL/MySQL reales | No ejecutados aquí; ningún resultado simulado se presenta como conectividad real |

Los mocks comprobaron cursor SLA con fecha e ID, cursor con fecha nula, página vacía, 422 de cursor, 503 de SQL, clasificación visible, selección de ticket, urgentes limitados a la primera página, errores seguros, respuestas tardías, jobs/historial, Workforce y métricas ausentes. No se hicieron asignaciones reales, despliegues, cambios al backend ni bypass de habilidades.

## Servicios y comandos de arranque

Se necesitan TicketsAPI/Security/Geography de PREPROD ya existentes para ticket, candidatos y GPS; SQL Server GS accesible en modo lectura para SLA; MySQL ACD existente para métricas, jobs y Workforce; y el microservicio ACD local. Las URL GS están en `js/config.js`; el ACD local está en `http://127.0.0.1:8000`. La persona operadora debe aportar fuera del repositorio credenciales y conexiones autorizadas; no se incluyen valores de ejemplo que aparenten ser reales.

**Terminal 1, microservicio ACD** (dependencias de `requirements.txt` ya instaladas y configuración local autorizada cargada):

```powershell
Set-Location 'C:\Users\daniel_martinez\Documents\Projects\acd_microservicio\acd_microservice'
$env:ACD_MODE = 'development'
$env:ACD_ENABLE_AUTOMATIC_DISPATCH = 'false'
$env:SERVICE_BUS_CONNECTION_STRING = ''
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

La consulta SLA requiere `TICKETSAPI_DB_CONNECTION_STRING` autorizada y un controlador ODBC SQL Server. Jobs/Workforce requieren la configuración MySQL ACD autorizada. Si faltan, dejar el 503 visible como bloqueo real. No activar despacho automático ni worker.

**Terminal 2, frontend estático:**

```powershell
Set-Location 'C:\Users\daniel_martinez\Documents\Projects\acd_preprod_dashboard'
python -m http.server 8080 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8080/`. Leaflet, OpenStreetMap y Font Awesome requieren acceso a sus recursos web para la presentación visual. El ID precargado del ticket es solo un punto de partida de la interfaz: comprobar que existe en el entorno autorizado antes de mostrarlo como dato real.

## Recorrido de demostración

1. Abrir Dashboard. Distinguir métricas MySQL ACD de urgentes SLA de la primera página. Si alguna fuente devuelve 503, mostrar el bloqueo sin sustituir valores.
2. Cargar un ticket PREPROD autorizado en el buscador. Mostrar detalle, matriz de candidatos y mapa GPS informativo; explicar que coordenadas y distancia visual no deciden el ganador.
3. Ir a Tickets → Sin asignar. Mostrar vencidos, próximos a vencer, posteriores y “Sin SLA verificable”, avanzar/retroceder por cursor, seleccionar un ticket y abrir su detalle. Repetir con Asignados.
4. Ir a Ingenieros/Candidatos y Workforce. Revisar check-ins activos, historial y campos `NO DISPONIBLE`; mostrar controles de operación deshabilitados.
5. Abrir simulación del ticket seleccionado y revisar el modal ACD con datos disponibles. Tratar el resultado como evaluación sin asignación; no invocar despacho real.
6. Volver a Tickets → Jobs ACD, abrir historial; pasar por Errores y explicar que solo incluye jobs `failed_review` con tres intentos. Distinguir estos registros MySQL del universo global de tickets GS.

## Lista única de validación manual

- [ ] Verificar URL/estado del ACD local, fuentes SQL/MySQL autorizadas y respuestas 503 cuando falten; comprobar que no hay worker ni despacho automático.
- [ ] Abrir Dashboard en navegador: métricas reales o `NO DISPONIBLE`, urgentes acotados a la primera página y actualización sin datos inventados.
- [ ] Cambiar ticket: detalle, matriz, candidatos, mapa, rutas, selección desde SLA y modal de simulación se actualizan para el mismo ID; revisar consola y pantalla angosta.
- [ ] Recorrer ambas listas SLA: orden del servidor, empates por ID, `NULL` al final, cursor siguiente/anterior, vacío y error HTTP; comparar una muestra con la respuesta API autorizada.
- [ ] Revisar ingenieros, Workforce, jobs, errores e historial con datos reales o estados vacíos; confirmar controles protegidos deshabilitados y ausencia de detalles sensibles.

## Bloqueos reales pendientes

Acceso SQL GS de solo lectura y confirmación GS de UTC/estados de la cola; identidad y roles ACD de producción; contrato de habilidades técnicas; evento de despacho e idempotencia de asignación; datos y permisos MySQL/GS para la ejecución manual; Cloud SQL/despliegue y frontend React GS. Nada de ello se resolvió mediante datos de prueba ni se asumió como disponible.
