/* ════════════════════════════════════════════════════════════════
   js/services/candidates-api.js
   ════════════════════════════════════════════════════════════════ */
'use strict';

import { CFG } from '../config.js';
import { apiFetch } from './api.js';

export async function fetchCandidates(ticketId) {
  const url  = `${CFG.TICKET_BASE}/api/v1/Assignations/getAssignableTaskForceByTicketsId`;
  const data = await apiFetch(url, { method: 'POST', body: JSON.stringify({ ticketsId: [Number(ticketId)] }) });
  if (Array.isArray(data))             return data;
  if (Array.isArray(data?.data))       return data.data;
  if (Array.isArray(data?.taskForces)) return data.taskForces;
  return [];
}

export async function fetchGeolocations() {
  const url  = `${CFG.TICKET_BASE}/api/v1/TaskForce/Geolocations`;
  const data = await apiFetch(url);
  if (data?.isError === true) throw new Error('No tienes acceso al GPS de GS.');
  const payload = data?.data ?? data;
  const records = payload?.workForceGeolocations ?? payload?.WorkForceGeolocations;
  if (!Array.isArray(records)) throw new Error('Respuesta GPS de GS no disponible.');
  return records.map(item => {
    const points = item.coordinates ?? item.Coordinates ?? [];
    const latest = points.find(point => {
      const lat = Number(point.latitude ?? point.Latitude);
      const lng = Number(point.longitude ?? point.Longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    });
    return {
      userId: item.workForceId ?? item.WorkForceId,
      latitude: latest ? Number(latest.latitude ?? latest.Latitude) : null,
      longitude: latest ? Number(latest.longitude ?? latest.Longitude) : null,
      date: latest?.date ?? latest?.Date ?? null,
    };
  }).filter(item => Number.isSafeInteger(Number(item.userId)) && Number(item.userId) > 0);
}
