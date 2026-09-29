# Paginación de la matriz ACD

## Resultado

- La matriz pagina localmente los candidatos ya cargados. Aplica la búsqueda antes del corte de página; cambiar de página no llama a la API.
- Tamaños: 20 (inicial), 50, 100 y 500. Muestra Anterior, Siguiente, página, páginas totales, rango visible y total filtrado.
- La numeración de filas continúa entre páginas. La página se limita al rango válido y vuelve a 1 al cambiar búsqueda, tamaño o ticket. La lista vacía muestra página 0 de 0, rango 0–0 y ambos botones deshabilitados.
- Se conservaron las columnas, indicadores REAL/SIMULADO y botones de detalle. No se cambiaron datos, servicios API ni router.

## Archivos modificados

- `index.html`: controles de paginación dentro de la matriz.
- `styles.css`: estilos de los controles.
- `js/components/pagination.js`: cálculo reutilizable y puro de páginas, rango y filas visibles.
- `js/app.js`: estado de la matriz, renderizado de filas visibles y eventos de búsqueda, tamaño y navegación.
- `REPORTE_PAGINACION_ACD.md`: este reporte.

## Pruebas

- **PASS:** `node --check` de `js/app.js`, `js/components/pagination.js`, `js/router.js` y `js/components/sim-modal.js`.
- **PASS:** paginador aislado con 0, 1, 20, 21, 50, 100 y 501 registros; tamaños 20/50/100/500, página fuera de rango y lista vacía.
- **PASS:** render y eventos de matriz con datos aislados: búsqueda antes de paginar, reinicio a página 1 por búsqueda/tamaño, rango, total, límites, numeración continua, botón de detalle e indicador SIMULADO.
- **PASS:** estructura HTML de controles únicos y tamaño inicial 20.
- **PASS:** router aislado con seis vistas, panel de mapa compartido y retroceso/avance. `js/router.js` no requirió cambios.
- **NO EJECUTADO:** navegación visual, dimensiones reales de Leaflet, modal ACD, Workforce y errores de consola. Edge headless falló en el sandbox por `Acceso denegado`; el intento escalado no produjo una sesión verificable.
- **NO EJECUTADO:** carga de candidatos y Tickets con GS; no hubo autenticación GS disponible para esta revisión.

## Pendientes

- Validar en navegador Dashboard, Matriz, Mapa GPS, Tickets y Workforce; comprobar dimensiones de Leaflet tras navegar, apertura del modal ACD y consola.
- Validar con una sesión GS autorizada la matriz poblada con datos PREPROD. No atribuir estado PASS a esa integración todavía.

## Trazabilidad

- [x] Motor ACD validado.
- [x] Servicios API modularizados.
- [x] Modal de simulación ACD.
- [x] Análisis de arquitectura GS.
- [x] Router independiente implementado.
- [ ] Validación visual del router.
- [x] Paginación 20/50/100/500.
- [ ] Rediseño Dashboard.
- [ ] Módulo Tickets.
- [ ] Módulo Candidatos.
- [ ] Integración definitiva GS.
