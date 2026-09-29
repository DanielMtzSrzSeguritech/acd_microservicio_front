# Corrección de producto ACD

## Trazabilidad

| Área | Estado |
| --- | --- |
| Dashboard operativo | Interfaz reorganizada; datos ACD sujetos a autorización. |
| Mapa de ingenieros | Conectado al GPS oficial GS; pendiente de comprobación con una sesión real. |
| Tickets | Vistas GS y ACD separadas; SLA, asignados y errores sujetos a acceso ACD. |
| Directorio general | Conectado a SecurityApi; requiere permiso de administrador GS. |
| Sesiones y check-in | Consulta protegida; botones de escritura deshabilitados hasta validar identidad y zona. |
| Validación | Pruebas automatizadas completas; comprobación visual y con servicios reales pendiente. |

## Cambios implementados

- Navegación principal de cuatro vistas: Dashboard, Tickets, Ingenieros y Sesiones. El detalle del ticket, los candidatos y la matriz aparecen dentro de Tickets al seleccionar un registro o consultar un ID. La simulación conserva su modal y no asigna tickets.
- El Dashboard muestra el mapa y, a su lado, los tickets sin asignar vencidos o próximos a vencer de la **primera página** SLA. Cada ticket del panel se puede abrir. La cifra mostrada corresponde solo a esa página.
- El mapa usa `GET /ticket/api/v1/TaskForce/Geolocations` con el token TicketsAPI de GS. El contrato entrega `WorkForceId` y coordenadas registradas hoy; los marcadores muestran ID, coordenadas y fecha cuando existe. No se dibuja el ticket ni se deduce disponibilidad o sesión a partir del GPS. Los registros sin coordenadas permanecen en la lista bajo el mapa.
- Tickets conserva la lista oficial de trabajo remoto resuelto o histórico de `GET /ticket/api/v1/Dashboard/GetRemoteWorkTickets`. Las pestañas Sin asignar y Asignados usan la paginación por cursor y el orden SLA de ACD. La zona del ingeniero se muestra como «Sin datos disponibles» porque el contrato actual no la devuelve. Errores usa `/operations/jobs/errors`; «Ver motivo» abre `/operations/jobs/{id}`, con código de error y fecha del intento cuando existen. Cada fila permite abrir el ticket.
- Ingenieros consulta el directorio general paginado de `GET /security/api/v1/Accounts/GeneralSearch` con `RoleId=2` y `Enabled=true`. SecurityApi exige permiso de administrador. La autenticación GS ya existente entrega `accessToken` para SecurityApi y `downstreamTokens.ticketApiToken` para TicketsAPI; se conservan separados en memoria. La lista de candidatos de un ticket sigue identificada como subconjunto contextual. Zona, sesión, carga y asignaciones no se infieren de cuentas GS.
- Sesiones conserva `/operations/sessions` y `/operations/engineers/active` con token ACD. Se retiraron los campos manuales Engineer ID y Zone ID del check-in. Los botones Check-in y Check-out siguen deshabilitados; el contrato definitivo debe validar identidad y obtener la zona GS sin intervención manual.
- Las consultas ACD no salen del navegador sin `acdToken`, incluso si alguna ruta local del backend respondiera sin exigirlo. El token TicketsAPI y el token SecurityApi nunca se usan como credencial ACD. Los mensajes visibles distinguen falta de acceso, falta de ubicación, ausencia de sesión y datos no disponibles. Los detalles técnicos quedan en la consola.

## Pruebas

Se ejecutaron con respuestas controladas, sin llamadas reales a GS ni ACD:

| Comando | Resultado |
| --- | --- |
| `node tests/integration.test.mjs` | 8/8; navegación contextual, carga y selección de tickets, filtro, cursor SLA, estados vacíos, errores y sesiones. |
| `node tests/operational.test.mjs` | 4/4; separación de tokens, rechazo sin token ACD, cursor SLA y métricas. |
| `node tests/gs-tickets.test.mjs` | 2/2; lista GS paginada, sesión ausente, respuesta vacía y errores HTTP. |
| `node tests/product.test.mjs` | 5/5; tokens GS separados, directorio, filtros y paginación, GPS válido e inválido, marcadores y mapa vacío. |
| `node --check` sobre todos los archivos de `js/` | 23/23 sin errores de sintaxis. |

Inspección estática de `index.html`: cuatro enlaces principales, sin IDs duplicados y sin campos manuales de identidad o zona para check-in. Se consultaron los contratos en el código fuente de GS TicketApi, GS SecurityApi y ACD, únicamente en modo lectura. **No hubo prueba con sesión GS real, respuesta ACD real ni navegador visual** en este entorno; por ello no se declara disponibilidad en producción o preproducción.

## Funcionalidades operativas y límites

- Con sesión y permiso GS válidos: consulta de tickets remotos y GPS; el directorio requiere además autorización de administrador de SecurityApi.
- Con token ACD autorizado y dependencias configuradas: consultas SLA, jobs, errores, métricas y sesiones. La interfaz indica «No tienes acceso» o «Datos no disponibles» si fallan.
- Check-in, check-out, configuración y despacho real permanecen bloqueados. No se modificó el motor ni se activó el despacho automático.

## Dependencias bloqueantes

1. El directorio general exige permiso GS `AccessAsAdministrator` en `Accounts/GeneralSearch`. Un usuario sin ese permiso verá «No tienes acceso»; no se sustituye por una lista parcial de candidatos.
2. Las vistas protegidas ACD necesitan un token para la audiencia ACD. El backend bloquea la consulta SLA en producción y requiere la conexión SQL de solo lectura de TicketsAPI. No se modificó el backend.
3. El check-in definitivo necesita identidad de ingeniero GS validada por ACD y consulta verificable de su zona GS. El verificador actual no establece `engineer_id` para el JWT validado, y el frontend no dispone de un contrato de zona confirmado. Los botones siguen deshabilitados.
4. El listado SLA asignado devuelve `assigned_engineer_id` y `status_id`, pero no zona. El listado de errores devuelve trabajo y fechas; el motivo está disponible en el detalle de cada trabajo.

## Comprobación manual breve

1. Con una sesión GS autorizada, abrir Dashboard: comprobar marcadores solo para coordenadas GS de hoy, estados vacíos y que ningún ticket aparezca en el mapa. Comprobar el panel SLA con y sin autorización ACD.
2. En Tickets, recorrer las pestañas, filtrar y paginar; abrir un ticket y un trabajo fallido. Comprobar que un fallo ACD no oculta la lista GS y que la zona ausente no se inventa.
3. En Ingenieros, comprobar el directorio con cuenta administradora y el mensaje de acceso con otra cuenta. En Sesiones, comprobar consulta/estado vacío y que Check-in y Check-out permanecen deshabilitados.
