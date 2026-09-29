/* ════════════════════════════════════════════════════════════════
   js/utils.js — Helpers puros sin side effects.
   renderStatusPill: única versión (elimina duplicado del monolítico).
   ════════════════════════════════════════════════════════════════ */
'use strict';


export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
}

export function renderStatusPill(status) {
  if (!status) return '—';
  const s = String(status).toLowerCase();
  let cls = 'status-default';
  if (s.includes('asigna') || s.includes('assign') || s.includes('dispatc'))                         cls = 'status-assigned';
  else if (s.includes('cerr') || s.includes('close') || s.includes('complet') || s.includes('finish') || s.includes('resuel') || s.includes('solved')) cls = 'status-closed';
  else if (s.includes('abiert') || s.includes('open') || s.includes('new') || s.includes('nueva'))   cls = 'status-open';
  else if (s.includes('progres') || s.includes('curso') || s.includes('transit') || s.includes('viaje') || s.includes('proceso')) cls = 'status-progress';
  else if (s.includes('cancel') || s.includes('reject'))                                              cls = 'status-cancelled';
  else if (s.includes('pend'))                                                                        cls = 'status-pending';
  return `<span class="status-pill ${cls}">${escHtml(status)}</span>`;
}
