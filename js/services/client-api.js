import { CFG } from '../config.js';
import { STATE } from '../state.js';

/** Uses only a ClientAPI-audience token, if GS supplies one. */
export async function fetchServiceResponseTimes(serviceId) {
  const id = Number(serviceId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Service ID inválido.');
  if (!STATE.clientToken) throw new Error('ClientAPI no autorizado en esta sesión GS.');
  const url = `${CFG.CLIENT_BASE}/api/v1/ServiceResponseTimes/Service/${id}?PageNumber=1&PageSize=50`;
  const response = await fetch(url, {
    method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${STATE.clientToken}` },
  });
  if (!response.ok) {
    const error = new Error(`ClientAPI: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const raw = await response.json();
  if (raw?.isError === true) throw new Error('ClientAPI rechazó la consulta de tiempos.');
  const data = raw?.data?.data ?? raw?.data ?? raw;
  const items = data?.items ?? data?.Items;
  const totalCount = data?.totalCount ?? data?.TotalCount;
  if (!Array.isArray(items) || !Number.isInteger(totalCount) || totalCount < 0)
    throw new Error('Contrato de tiempos ClientAPI no verificable.');
  return { items, totalCount, serviceId: id };
}

/** A unique record avoids guessing which location priority applies to the ticket. */
export function selectServiceTiming(page) {
  if (page?.totalCount !== 1 || page.items?.length !== 1) return null;
  const item = page.items[0];
  const serviceId = item.serviceId ?? item.ServiceId;
  if (serviceId != null && Number(serviceId) !== page.serviceId) return null;
  const responseTimeId = Number(item.responseTimeId ?? item.ResponseTimeId);
  const attentionHours = Number(item.attentionHours ?? item.AttentionHours);
  const expireHours = Number(item.expireHours ?? item.ExpireHours);
  if (!Number.isSafeInteger(responseTimeId) || responseTimeId <= 0 ||
      !Number.isFinite(attentionHours) || attentionHours < 0 ||
      !Number.isFinite(expireHours) || expireHours < 0) return null;
  return { responseTimeId, attentionHours, expireHours, serviceId: page.serviceId };
}
