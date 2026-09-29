# Trazabilidad

- [x] Motor ACD funcional.
- [x] Integración inicial del frontend.
- [x] Servicios API modularizados.
- [x] Modal de evaluación ACD.
- [x] Router independiente.
- [x] Paginación 20/50/100/500.
- [x] Rediseño UX/UI del Dashboard.
- [x] Reorganización del mapa y KPIs.
- [x] Módulo Tickets.
- [x] Priorización SLA en la página recibida.
- [ ] Priorización SLA global.
- [x] Módulo Candidatos del ticket actual.
- [x] Extracción de Workforce.
- [ ] Validación integral en navegador.
- [ ] Integración definitiva en GS.

## Funcionalidades implementadas

- **Dashboard:** jerarquía visual y espaciado basados en la referencia auditor-tool-ia; tema oscuro conservado. Barra superior adaptable, KPIs compactos, mapa junto al resumen operativo, enlace al detalle completo y matriz paginada. El resumen conserva estado, cliente, servicio, SLA y colaborador. La evaluación ACD permanece en su modal.
- **Tickets:** módulo ES independiente con pestañas No asignados, Asignados y Errores. Clasifica sólo cuando el dato de asignación está presente; ID 0 y nombre vacío no cuentan como asignación. Mantiene búsqueda y paginación del endpoint, detalle con JSON y acción para simular ACD. Ordena los no asignados por vencimiento SLA dentro de cada página; vencidos primero y SLA ausente al final. Muestra vencimiento, tiempo restante, cliente, servicio, ubicación, zona y prioridad sólo cuando existen.
- **Errores:** estado vacío explícito; no se infieren tres fallos por estado del ticket ni se muestran tickets ficticios.
- **Candidatos:** vista independiente de candidatos asignables para el ticket seleccionado, con búsqueda, filtros GPS/sesión y paginación local 20/50/100/500. Reutiliza el modal de detalle. Sesión, zona, disponibilidad y carga se muestran sólo si vienen explícitamente en los datos; los ausentes se marcan como no disponibles. GPS sigue siendo informativo.
- **Workforce:** lectura de sesiones, check-in, botones rápidos y actualización movidos a `js/modules/workforce.js` con inicialización única. Se mantuvieron las llamadas HTTP actuales.
- **Datos ausentes:** el Dashboard y Candidatos distinguen falta de autenticación o fallo de fuente GPS de un total confirmado de cero. Los valores simulados preexistentes de la matriz conservan su etiqueta SIMULADO.

## Archivos creados y modificados

- **Creados:** `js/modules/tickets.js`, `js/modules/tickets-model.js`, `js/modules/candidates.js`, `js/modules/candidates-model.js`, `styles/modules/dashboard.css`, `styles/modules/tickets.css`, `styles/modules/candidates.css`, `REPORTE_DESARROLLO_MODULOS_ACD.md`.
- **Modificados:** `index.html`, `js/app.js`, `js/router.js`, `js/state.js`, `js/services/tickets-api.js`, `js/modules/workforce.js`.
- **Solo lectura:** referencia UX/UI `auditor-tool-ia_v1.0_12Jun26` y repositorio backend ACD. No se modificó el frontend GS.

## Pruebas ejecutadas

- **PASS:** `node --check` en todos los módulos JS creados o modificados y en el modal ACD.
- **PASS:** referencias de imports e IDs literales resuelven en archivos y elementos reales del HTML; existen siete rutas y el modal fuera de ellas.
- **PASS:** router aislado: siete vistas, mapa compartido y retroceso/avance.
- **PASS:** modelo Tickets: asignado/no asignado/desconocido, ID 0, SLA vencido antes que futuro, dato SLA ausente, filtro y pestaña Errores vacía.
- **PASS:** módulo Tickets aislado: cambio de las tres pestañas, clasificación de filas y listeners únicos; cliente HTTP probado con `fetch` simulado, misma ruta paginada y respuesta anidada.
- **PASS:** modelo y módulo Candidatos aislados: campos directos, desconocidos, búsqueda, filtros, 21 registros, cambio de página y lista vacía.
- **PASS:** Workforce aislado con HTTP simulado: sesiones, check-in y listeners únicos. No se ejecutó un check-in real.
- **NO EJECUTADO:** validación visual integral, Leaflet en navegador, interacción real del modal y consola. Queda a cargo del usuario al finalizar, según el alcance de esta entrega.
- **NO EJECUTADO:** flujos autenticados GS y datos PREPROD reales; no se aportaron credenciales ni se declararon resultados PASS.

## Limitaciones de datos y contratos

- `GetRemoteWorkTickets` pagina en servidor con `PageNumber`, `PageSize` y `OrderColumn`; los órdenes expuestos en la interfaz son ID, fecha y estado. La clasificación, búsqueda y prioridad SLA de las pestañas se aplican **sólo a la página recibida**. No hay contrato verificado para filtrar por asignación u ordenar globalmente por `TicketAttentionTime`; la interfaz advierte esta limitación.
- La pestaña Errores requiere una fuente de solo lectura que entregue, por ticket, identificador, número de intentos de asignación fallidos, motivo de cada fallo o último motivo y fecha del último intento. También necesita un criterio verificable para identificar tres fallos. No se encontró ese historial en los contratos disponibles.
- Candidatos proviene de `getAssignableTaskForceByTicketsId` para un ticket concreto. No representa el catálogo completo GS. Departamento, funciones y servicios no se muestran sin fuente confirmada. La sesión, zona y carga se presentan como no disponibles si el registro no las incluye.
- El código nuevo no crea endpoints, credenciales, registros ficticios ni reglas de puntuación ACD.

## Pendientes

- Validación visual integral y ajuste fino posterior a la revisión manual.
- Orden y filtrado SLA globales cuando exista un contrato que los garantice.
- Conectar Errores a un historial real de intentos cuando el backend lo exponga.
- Integración definitiva en GS, fuera de esta entrega.

## Verificación manual final

- Abrir Dashboard en escritorio y móvil; revisar mapa, KPIs, resumen y matriz paginada.
- Navegar por Dashboard, Matriz, Mapa, Detalle, Tickets, Candidatos y Workforce; probar retroceso/avance y tamaño de Leaflet al regresar.
- Con acceso GS, revisar las tres pestañas de Tickets, búsqueda por página, detalle y simulación ACD; contrastar un ticket asignado y otro no asignado.
- Con acceso GS, cargar otro ticket y comprobar que Candidatos, filtros y paginación se actualizan; revisar campos no disponibles y GPS informativo.
- Abrir/cerrar modal ACD, actualizar Workforce y comprobar consola. Realizar check-in sólo con autorización operativa separada.
