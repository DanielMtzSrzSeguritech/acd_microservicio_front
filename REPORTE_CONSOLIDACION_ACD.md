# Consolidación integral ACD experimental

Fecha: 2026-09-25. Alcance: frontend experimental; backend ACD inspeccionado solo en lectura. No se ejecutaron asignaciones reales, cambios en GS ni navegador automatizado.

## Trazabilidad

- [x] Motor ACD y simulación
- [x] Router independiente
- [x] Paginación de matriz
- [x] Rediseño Dashboard
- [x] Módulo Tickets
- [x] Vista Candidatos
- [x] Extracción Workforce
- [x] Consolidación integral de código y pruebas aisladas
- [ ] Validación manual en navegador
- [ ] Integración definitiva en React GS

## Archivos modificados

- `js/app.js`: invalida respuestas de tickets anteriores, limpia datos dependientes al iniciar la carga o cerrar GS y muestra carga parcial cuando falla algún servicio.
- `js/modules/tickets.js`: conserva solo la respuesta de página vigente, mantiene el error HTTP al cambiar de pestaña, protege el drawer ante respuestas tardías.
- `js/services/tickets-api.js`: elimina dos funciones sin consumidores; el detalle reutiliza `fetchTicket`.
- `js/services/auth.js`: comparte la autenticación GS en curso entre módulos e invalida tokens tardíos al cambiar o cerrar sesión.
- `js/services/candidates-api.js`: interpreta `workForceGeolocations` y sus coordenadas anidadas según el contrato documentado de TicketsAPI.
- `js/components/latest-request.js`: controlador pequeño de vigencia de solicitudes.
- `tests/integration.test.mjs`: nueve pruebas aisladas con DOM/fetch simulados; no conectan con GS ni ACD reales.
- `REPORTE_CONSOLIDACION_ACD.md`: este reporte.

## Hallazgos y correcciones

- Dashboard: `STATE.loading` descartaba una nueva selección de ticket, y la respuesta anterior podía sobrescribir la nueva. Cada carga conserva su ID y solo la última solicitud actualiza la vista. Al iniciar otra carga se limpian ticket, candidatos, GPS y marcadores; la página de matriz y candidatos vuelve a 1 al seleccionar ticket.
- Tickets: dos cargas de páginas simultáneas podían mostrar datos de la página equivocada. Ahora se ignoran respuestas antiguas. Un error HTTP ya no desaparece al cambiar de pestaña; retroceso y avance de página quedan deshabilitados ante error.
- GPS: el servicio ignoraba el formato `workForceGeolocations` con `coordinates[]` que documenta el backend. Se convierte a la forma que usa el mapa. Si falla la solicitud, la UI sigue señalando GPS no disponible.
- Carga parcial: un fallo de ticket, candidatos o GPS podía terminar con estado “Datos cargados correctamente”. Ahora la carga parcial se indica como tal, conservando los datos que sí llegaron.
- Código obsoleto: `fetchRemoteTickets` apuntaba a una ruta alternativa sin usos; `fetchTicketDetail` duplicaba `fetchTicket`. Se quitaron estas duplicaciones sin cambiar los contratos en uso.
- Autenticación GS: Dashboard y Tickets podían iniciar dos solicitudes de token simultáneas. Comparten una sola solicitud mientras esté en curso; cerrar o cambiar sesión impide que su respuesta tardía restaure el token.
- Router: los nodos de mapa, detalle y matriz se trasladan entre contenedores sin recrearlos; sus estados sobreviven al cambio de ruta. Los listeners de router, Tickets, Candidatos y Workforce se instalan una sola vez. La carga de Tickets y Workforce al entrar en su ruta se dispara una sola vez por sesión.
- Modal ACD: continúa usando `/api/v1/acd/simulate-ticket/{ticket_id}`. No se invoca `/run-ticket` ni se alteran reglas o ponderaciones. La interacción visual real del modal queda pendiente.

## Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| `node --check` sobre los 19 archivos `js/**/*.js` | PASS, 19/19 |
| `node tests/integration.test.mjs` | PASS, 9/9 pruebas; 0 fallos |
| Cambio de ticket y respuesta tardía | PASS con promesas simuladas |
| Filtros, orden y límites de paginación; cambio de ticket en Candidatos | PASS con datos aislados |
| Router, paneles compartidos y `popstate` | PASS con DOM simulado |
| Tickets: páginas concurrentes, error 503 y cambio de pestaña | PASS con fetch/DOM simulados |
| GPS: contrato anidado y error 503 | PASS con fetch simulado |
| Autenticación concurrente y cierre de sesión | PASS con fetch/sessionStorage simulados |
| Workforce: sesiones y error 503 | PASS con fetch/DOM simulados |
| `node --test tests/integration.test.mjs` | FALLÓ por restricción del runner (`spawn EPERM`); las pruebas sí se ejecutaron directamente con Node |
| Browser visual, Leaflet real, modal ACD real, GS real | NO EJECUTADO; pendientes de la validación manual |

No había pruebas automatizadas preexistentes en este frontend. Los mocks verifican la integración local y no acreditan disponibilidad ni comportamiento de GS o del backend desplegado. El aviso `[WF] HTTP 503` del test es el error simulado esperado. `git status` no se puede usar aquí porque el directorio no es un repositorio Git.

## Contratos y dependencias

**Operativo en el frontend:** navegación local y History API; matriz/candidatos con filtro y paginación local; visualización y simulación a través de los contratos ya usados. **Parcial:** Tickets usa `GET /api/v1/Dashboard/GetRemoteWorkTickets` paginado; la separación asignados/no asignados, la búsqueda y el orden SLA solo abarcan la página recibida. Los tickets sin dato de asignación comprobable quedan fuera de esas dos pestañas. GPS es un snapshot de ubicaciones, no seguimiento en tiempo real. Algunas columnas de la matriz conservan sus etiquetas `SIMULADO` preexistentes.

**Bloqueado:** prioridad SLA global de todos los tickets. El endpoint actual devuelve el subconjunto *Remote Work Tickets*, paginado por ID/fecha/estado; no entrega todos los tickets elegibles ni permite ordenar globalmente por vencimiento SLA con un snapshot consistente. Ordenar la página en el navegador no puede garantizar prioridad global. Propuesta posterior para el dueño de TicketsAPI: contrato de consulta de tickets elegibles con estado/asignación verificables, vencimiento SLA explícito, orden servidor por vencimiento y paginación estable (cursor o snapshot); validar permisos y empates antes de conectar la UI.

**Bloqueado:** pestaña Errores de tres intentos fallidos. El backend ACD expone `assignment_failed` en el flujo de ejecución y el worker usa `delivery_count` de Service Bus; ninguno es historial persistente de intentos de asignación por ticket. El límite configurado del worker es distinto de tres intentos fallidos y un reintento de entrega puede fallar antes de asignar. Falta registrar por intento: `ticketId`, número de intento, fecha UTC, resultado, código/motivo, ID de correlación y técnico intentado cuando aplique; falta una consulta autorizada por ticket y un resumen filtrable por tres fallos reales. La propuesta requiere definir idempotencia y semántica de “fallido” con el equipo dueño antes de crear campos o endpoints. No se inventó ninguno en el frontend.

**Arranque seguro para la revisión posterior** (dos terminales PowerShell; usar el entorno Python ya preparado o instalar `requirements.txt` sin registrar secretos):

```powershell
# Terminal 1: backend ACD, sin consumidor de Service Bus ni despacho manual
cd 'C:\Users\daniel_martinez\Documents\Projects\acd_microservicio\acd_microservice'
$env:SERVICE_BUS_CONNECTION_STRING = ''
$env:ALLOW_MANUAL_DISPATCH = 'false'
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2: frontend experimental
cd 'C:\Users\daniel_martinez\Documents\Projects\acd_preprod_dashboard'
python -m http.server 5500 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:5500/`; comprobar `http://127.0.0.1:8000/health`. Si faltan paquetes, desde el directorio del backend ejecutar `python -m pip install -r requirements.txt` dentro del entorno virtual previsto. El backend requiere configuración de GS para datos de tickets reales; proporcionarla solo mediante el mecanismo seguro del entorno. No usar lanzadores que incorporen credenciales en el código. La UI de Workforce puede requerir que su repositorio de sesiones esté configurado. Evitar el endpoint `/api/v1/acd/run-ticket/{ticket_id}` durante esta revisión.

## Lista única de validación manual integral — pendiente

**Sin autenticación GS** (frontend y backend local, cuando corresponda):

- [ ] Abrir Dashboard; revisar estructura, KPIs vacíos, ausencia de datos inventados y consola sin errores inesperados.
- [ ] Recorrer Dashboard, Matriz, Mapa GPS, Detalle de ticket, Tickets, Candidatos y Workforce; confirmar una sola vista visible, paneles compartidos sin pérdida de estado, retroceso/avance del navegador y recarga de URL con `#view=`.
- [ ] Volver del Dashboard al Mapa GPS y viceversa; confirmar mosaicos Leaflet visibles y dimensiones correctas.
- [ ] Revisar estados sin autenticación GS de ticket, matriz, candidatos y Tickets; no presentar un error de autenticación como datos cargados.
- [ ] Abrir Workforce, revisar sesiones o estado vacío/error; pulsar Refresh. No usar Check-in durante esta revisión si altera sesiones reales.

**Con autenticación GS autorizada y servicios disponibles** (sin registrar credenciales/tokens):

- [ ] Autenticar GS desde la UI, cargar un ticket real y confirmar consistencia de KPIs, detalle, matriz, mapa, candidatos y etiquetas REAL/SIMULADO.
- [ ] Cambiar rápidamente entre dos tickets; confirmar que no reaparecen datos, marcadores ni detalles del primero, y que paginación vuelve a 1.
- [ ] En Matriz y Candidatos: buscar, filtrar, probar 20/50/100/500, Anterior/Siguiente, rangos, números continuos, vacíos y límites; confirmar mismo orden y ninguna llamada HTTP al paginar localmente.
- [ ] En Tickets: cambiar pestañas, búsqueda, tamaño, orden y páginas; revisar alcance por página, drawer de detalle, selección de ticket y errores HTTP. Confirmar que “Errores” sigue indicando historial no disponible.
- [ ] Abrir y cerrar detalle de candidato y modal ACD; ejecutar solo **simulación** sobre ticket permitido, verificar resultado y ausencia de asignación real.
- [ ] Cerrar sesión GS; comprobar limpieza de datos dependientes y comportamiento de navegación y Workforce.

Todas las casillas manuales permanecen pendientes hasta realizar la revisión real en navegador.
