# Router ACD — implementación

## Estado y alcance

- Se confirmó que `js/router.js` estaba vacío (0 bytes).
- Se implementó navegación independiente para Dashboard, Matriz, Mapa GPS, Detalle de ticket, Tickets PREPROD y Workforce.
- Cada ruta muestra un solo contenedor de vista. Dashboard conserva KPIs, mapa, detalle y matriz; las vistas específicas reutilizan los mismos nodos de mapa, detalle y matriz, sin duplicar datos ni listeners.
- La URL usa `#view=<ruta>`. `pushState` registra la navegación y `popstate`/`hashchange` restauran la vista. El enlace activo recibe `aria-current="page"`.
- Al mostrar Dashboard o Mapa GPS se llama a `leafletMap.invalidateSize()` tras el cambio de vista. Tickets y Workforce conservan su DOM y su estado al navegar; su carga inicial ocurre una vez y sus controles de actualización siguen disponibles.

## Archivos modificados

- `index.html`: contenedores de ruta, destinos de navegación y hosts para los paneles compartidos.
- `js/router.js`: selección de vista, traslado de paneles compartidos e integración con History API.
- `js/app.js`: integración del router; eliminación del navegador anterior basado en `scrollIntoView` y sus listeners.
- `styles.css`: visibilidad de rutas y espaciado de las vistas independientes.
- `REPORTE_ROUTER_ACD.md`: este reporte.

## Pruebas ejecutadas

- **PASS — Sintaxis JS:** `node --check` en `js/router.js`, `js/app.js` y `js/components/sim-modal.js`.
- **PASS — Estructura HTML:** IDs únicos de las seis rutas y paneles compartidos; mapa y matriz dentro de Dashboard al inicio; modal ACD fuera del contenedor de rutas.
- **PASS — Router aislado con DOM simulado:** carga inicial de Dashboard, seis rutas, una sola vista activa, reutilización de nodos, retroceso/avance y ausencia de listeners duplicados al inicializar dos veces.
- **NO EJECUTADO — Prueba visual en navegador:** Chrome headless falló en el sandbox con `Acceso denegado`; el intento escalado no entregó una sesión verificable.
- **NO EJECUTADO — Mapa visible y dimensionado, apertura real del modal ACD y consola del navegador:** requieren una sesión de navegador funcional.
- **NO EJECUTADO — Datos GS y operaciones autenticadas de Tickets/Workforce:** no se dispuso de autenticación GS para esta revisión.

## Problemas pendientes

- Verificar en navegador la presentación de las seis vistas, el tamaño de Leaflet después de cada regreso al mapa, el modal ACD y la ausencia de errores inesperados de consola.
- `js/modules/workforce.js` sigue vacío; Workforce funciona desde `js/app.js`. Su extracción corresponde a una tarea posterior.
- La paginación 20/50/100/500, el rediseño del Dashboard y los módulos independientes de Tickets y Candidatos siguen pendientes.

## Trazabilidad

- [x] Motor ACD validado (estado previo).
- [x] Servicios API modularizados (estado previo).
- [x] Modal ACD implementado (estado previo; prueba visual pendiente en esta revisión).
- [x] Arquitectura de GS analizada (estado previo).
- [x] Navegación independiente implementada; validación visual pendiente.
- [ ] Paginación 20/50/100/500.
- [ ] Rediseño del Dashboard.
- [ ] Módulos Tickets y Candidatos.
- [ ] Integración definitiva en GS.
