import { escHtml, formatDate } from '../utils.js';

/** Draws only GS GPS positions. A missing ACD session never implies inactivity. */
export function plotEngineerLocations({ leaflet, map, layer, geolocations }) {
  layer.clearLayers();
  const bounds = [];
  for (const engineer of geolocations) {
    const lat = engineer.latitude;
    const lng = engineer.longitude;
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const icon = leaflet.divIcon({
      html: '<div class="engineer-map-pin"><i class="fa-solid fa-user"></i></div>',
      className: '', iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12],
    });
    leaflet.marker([lat, lng], { icon }).bindPopup(`
      <div class="popup-title">Ingeniero GS #${escHtml(String(engineer.userId))}</div>
      <div class="popup-row"><span>Ubicación</span><span>${escHtml(String(lat))}, ${escHtml(String(lng))}</span></div>
      <div class="popup-row"><span>Registro GPS</span><span>${engineer.date ? escHtml(formatDate(engineer.date)) : 'Sin datos disponibles'}</span></div>
      <div class="popup-row"><span>Sesión</span><span>Sin datos disponibles</span></div>
    `).addTo(layer);
    bounds.push([lat, lng]);
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
  else if (bounds.length === 1) map.setView(bounds[0], 13);
  return bounds.length;
}
