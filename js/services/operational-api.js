import { SIM_CFG } from '../config.js';

const BASE = `${SIM_CFG.ACD_BASE}/api/v1/acd/operations`;

export async function operationalGet(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  const headers = { Accept: 'application/json' };
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = body?.detail?.code;
    const messages = {
      acd_mysql_unavailable: 'MySQL ACD no está configurado.',
      acd_mysql_read_failed: 'No se pudo leer MySQL ACD.',
      gs_global_ticket_query_pending: 'GS no ofrece todavía el listado global de tickets con orden SLA.',
      gs_global_sql_unavailable: 'Consulta global SLA no disponible: falta la conexión SQL de solo lectura.',
      gs_global_sql_read_failed: 'No se pudo leer la consulta global SLA.',
      invalid_sla_cursor: 'El cursor SLA no es válido.',
      gs_ticket_unavailable: 'El detalle del ticket GS no está disponible.',
      gs_ticket_contract_unverified: 'El contrato del ticket GS no se pudo verificar.',
      gs_ticket_identity_unverified: 'El ID devuelto por GS no coincide con el solicitado.',
      gs_services_sql_unavailable: 'Servicios GS no disponibles: falta conexión SQL de solo lectura.',
      gs_services_sql_read_failed: 'No se pudieron consultar los servicios autorizados en GS.',
      gs_directory_sql_unavailable: 'Directorio GS no disponible: falta conexión SQL de solo lectura.',
      gs_directory_sql_read_failed: 'No se pudo consultar el directorio de ingenieros en GS.',
      job_not_found: 'El job ACD no existe.',
      invalid_cursor: 'La página solicitada ya no es válida.',
    };
    const error = new Error(messages[code] || `API ACD: HTTP ${response.status}`);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return response.json();
}

export const fetchOperationalMetrics = () => operationalGet('/metrics');
export const fetchOperationalJobs = params => operationalGet('/jobs', params);
export const fetchOperationalErrors = params => operationalGet('/jobs/errors', params);
export const fetchOperationalJob = id => operationalGet(`/jobs/${encodeURIComponent(id)}`);
export const fetchOperationalTicket = id => operationalGet(`/tickets/${encodeURIComponent(id)}`);
export const fetchGlobalSlaTickets = ({ assignment = 'unassigned', page_size = 25, cursor = null, soon_minutes = 60 } = {}) =>
  operationalGet('/tickets', {
    assignment, order: 'sla_due', page_size, soon_minutes,
    after_ticket_id: cursor?.after_ticket_id,
    after_due_at: cursor?.after_due_at,
  });
export const fetchOperationalSessions = params => operationalGet('/sessions', params);

export const fetchEngineerAuthorizedServices = ({ ids = [], engineerId = null, limit = 10, offset = 0, search = '' } = {}) => {
  const params = {};
  if (engineerId) params.engineer_id = engineerId;
  else if (Array.isArray(ids) && ids.length) params.ids = ids.join(',');
  else if (typeof ids === 'string' && ids.trim()) params.ids = ids.trim();
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;
  if (search && search.trim()) params.search = search.trim();
  return operationalGet('/engineers/services', params);
};

let activePromise = null;
export function fetchActiveEngineers({ refresh = false, cursor = null } = {}) {
  if (cursor) return operationalGet('/engineers/active', { page_size: 25, cursor });
  if (refresh) activePromise = null;
  if (!activePromise) {
    activePromise = operationalGet('/engineers/active', { page_size: 25 });
    activePromise.catch(() => { activePromise = null; });
  }
  return activePromise;
}

export const fetchEngineersDirectory = ({ page = 1, pageSize = 25, search = '' } = {}) => {
  const params = { page, page_size: pageSize };
  if (search && search.trim()) params.search = search.trim();
  return operationalGet('/engineers', params);
};

export async function operationalPost(path, body = {}) {
  const url = new URL(BASE + path);
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const code = data?.detail?.code;
        const messages = {
      acd_mysql_unavailable: 'MySQL ACD no está configurado.',
      acd_mysql_read_failed: 'No se pudo leer MySQL ACD.',
      acd_mysql_write_failed: 'No se pudo registrar en MySQL ACD.',
      engineer_not_found_or_inactive: 'El ingeniero no pertenece al directorio operativo autorizado de GS.',
      gs_directory_sql_unavailable: 'Directorio GS no disponible: falta conexión SQL de solo lectura.',
    };
    const error = new Error(messages[code] || `API ACD: HTTP ${response.status}`);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return response.json();
}

export const checkInSession = engineerId => operationalPost('/sessions/check-in', { engineer_id: engineerId });
export const checkOutSession = engineerId => operationalPost('/sessions/check-out', { engineer_id: engineerId });
