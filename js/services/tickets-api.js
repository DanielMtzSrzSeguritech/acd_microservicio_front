/* ════════════════════════════════════════════════════════════════
   js/services/tickets-api.js
   ════════════════════════════════════════════════════════════════ */
'use strict';

import { CFG } from '../config.js';
import { apiFetch } from './api.js';
import { STATE } from '../state.js';

export async function fetchTicket(ticketId) {
  if (!STATE.token) throw new Error('GS: inicia sesión para consultar el detalle del ticket.');
  const id = Number(ticketId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Ticket ID inválido.');
  const url      = `${CFG.TICKET_BASE}/api/v1/Tickets/${id}`;
  const response = await apiFetch(url);
  if (response?.isError === true) throw new Error('TicketsAPI GS rechazó el detalle del ticket.');
  const detail = response?.data?.data ?? response?.data ?? response;
  if (!detail || Number(detail.ticketId ?? detail.TicketId) !== id)
    throw new Error('El detalle devuelto por TicketsAPI GS no coincide con el ticket solicitado.');
  return detail;
}

/** Official GS subset: resolved/historical remote-work tickets, paged on the server. */
export async function fetchRemoteWorkTickets({ page = 1, pageSize = 25 } = {}) {
  if (!STATE.token) throw new Error('GS: inicia sesión para consultar tickets de trabajo remoto.');
  const params = new URLSearchParams({
    PageNumber: String(page), PageSize: String(pageSize),
    OrderColumn: 'Id', Descending: 'true',
  });
  let raw;
  try {
    raw = await apiFetch(`${CFG.TICKET_BASE}/api/v1/Dashboard/GetRemoteWorkTickets?${params}`);
  } catch (error) {
    const status = /^HTTP (\d+)/.exec(error.message)?.[1];
    throw new Error(status ? `TicketsAPI GS: HTTP ${status}.` : 'TicketsAPI GS: no se pudo completar la consulta.');
  }
  if (raw?.isError === true) throw new Error('TicketsAPI GS rechazó la consulta.');
  const data = raw?.data ?? raw;
  const items = data?.items ?? data?.Items;
  const currentPage = data?.currentPage ?? data?.CurrentPage;
  const totalPages = data?.totalPages ?? data?.TotalPages;
  const totalCount = data?.totalCount ?? data?.TotalCount;
  if (!Array.isArray(items) || !Number.isInteger(currentPage) || currentPage !== page ||
      !Number.isInteger(totalPages) || totalPages < 0 ||
      !Number.isInteger(totalCount) || totalCount < 0) {
    throw new Error('Contrato de paginación de TicketsAPI GS no verificable.');
  }
  return { items, currentPage, totalPages, totalCount, hasNext: currentPage < totalPages };
}
